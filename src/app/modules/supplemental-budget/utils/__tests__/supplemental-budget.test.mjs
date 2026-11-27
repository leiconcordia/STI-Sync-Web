import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMergedFinancialProjectionsForExport,
  canRequestSupplementalBudget,
  cloneParentApSignatoryPipeline,
  doesSbrRequireSignatories,
  filterMeaningfulBaseLiquidationItems,
  getEventBaseApprovedBudget,
  getEventEffectiveApprovedBudget,
  getPermittedSupplementalFundingSources,
  hasBlockingPendingSbrForLiquidation,
  isFundingSourcePermittedForSbr,
  isSbrDisbursedForLiquidation,
  isSignatoryTurnForSbr,
  mergeBaseAndSupplementalAllocations,
  mergeLiquidationBaselineWithSupplementalItems,
  normalizeSbrApprovalChain,
  validateSbrFormPayload,
} from '../sbr-validation.utils.ts';
import {
  isHiddenFromSasAndSignatories,
  resolveDocumentTrackingState,
} from '../../../activity-proposals/utils/proposal-status-tracker.utils.ts';
import { isEventLiquidationExempt } from '../../../events/utils/organization-display.utils.ts';

test('eligibility gate enforces Approved parent, Option A pre-implementation cutoff, liquidation lock, and single pending SBR', () => {
  const now = new Date('2026-12-01T08:00:00');

  // 1. Draft / Pending parent event rejected
  const draftRes = canRequestSupplementalBudget(
    { id: 'ev1', proposalStatus: 'pending', sessions: [{ date: '2026-12-10', startTime: '09:00' }] },
    [],
    [],
    now
  );
  assert.equal(draftRes.eligible, false);
  assert.equal(draftRes.code, 'NOT_APPROVED');

  // 2. Approved future event eligible
  const okRes = canRequestSupplementalBudget(
    { id: 'ev2', proposalStatus: 'approved', sessions: [{ date: '2026-12-10', startTime: '09:00' }] },
    [],
    [],
    now
  );
  assert.equal(okRes.eligible, true);

  // 3. Option A strict pre-implementation cutoff: blocked once event start date/time has passed
  const startedRes = canRequestSupplementalBudget(
    { id: 'ev3', proposalStatus: 'approved', sessions: [{ date: '2026-12-01', startTime: '07:30' }] },
    [],
    [],
    now
  );
  assert.equal(startedRes.eligible, false);
  assert.equal(startedRes.code, 'EVENT_ALREADY_STARTED');

  // 4. Concluded event blocked
  const concludedRes = canRequestSupplementalBudget(
    { id: 'ev4', proposalStatus: 'completed', sessions: [{ date: '2026-12-10', startTime: '09:00' }] },
    [],
    [],
    now
  );
  assert.equal(concludedRes.eligible, false);
  assert.equal(concludedRes.code, 'EVENT_CONCLUDED');

  // 5. Existing submitted liquidation blocks SBR
  const liqRes = canRequestSupplementalBudget(
    { id: 'ev5', proposalStatus: 'approved', sessions: [{ date: '2026-12-10', startTime: '09:00' }] },
    [],
    [{ id: 'liq1', eventId: 'ev5', status: 'submitted' }],
    now
  );
  assert.equal(liqRes.eligible, false);
  assert.equal(liqRes.code, 'LIQUIDATION_EXISTS');

  // 6. Active pending SBR blocks concurrent second SBR; approved SBR allows sequential second SBR
  const concurrentRes = canRequestSupplementalBudget(
    { id: 'ev6', proposalStatus: 'approved', sessions: [{ date: '2026-12-10', startTime: '09:00' }] },
    [{ id: 'sbr1', referenceCode: 'SBR-2026-ITG-001', status: 'for_adviser_review' }],
    [],
    now
  );
  assert.equal(concurrentRes.eligible, false);
  assert.equal(concurrentRes.code, 'ACTIVE_SBR_PENDING');

  const sequentialRes = canRequestSupplementalBudget(
    { id: 'ev6', proposalStatus: 'approved', sessions: [{ date: '2026-12-10', startTime: '09:00' }] },
    [{ id: 'sbr1', referenceCode: 'SBR-2026-ITG-001', status: 'approved' }],
    [],
    now
  );
  assert.equal(sequentialRes.eligible, true);
  assert.equal(
    hasBlockingPendingSbrForLiquidation({ id: 'ev6' }, [{ id: 'sbr1', status: 'for_sas_review' }]),
    true
  );
});

test('funding source governance blocks student_contributions and enforces signatory routing matrix', () => {
  // Club permitted sources: organization_funds & school_budget ONLY
  assert.deepEqual(getPermittedSupplementalFundingSources(false), [
    'organization_funds',
    'school_budget',
  ]);
  assert.equal(isFundingSourcePermittedForSbr('student_contributions', false), false);
  assert.equal(isFundingSourcePermittedForSbr('zero_budget', false), false);

  // SAS Institutional permitted sources: school_budget & retained_sao_fund ONLY
  assert.deepEqual(getPermittedSupplementalFundingSources(true), [
    'school_budget',
    'retained_sao_fund',
  ]);
  assert.equal(isFundingSourcePermittedForSbr('student_contributions', true), false);

  // Signatory routing matrix
  assert.equal(doesSbrRequireSignatories('organization_funds', false), false);
  assert.equal(doesSbrRequireSignatories('school_budget', false), true);
  assert.equal(doesSbrRequireSignatories('school_budget', true), true);
  assert.equal(doesSbrRequireSignatories('retained_sao_fund', true), true);

  // Form validation rejects student_contributions and insufficient club balance
  const blockedStudentFee = validateSbrFormPayload({
    justification: 'Unforeseen sound system rental cost increase prior to campus event.',
    additionalItems: [{ id: '1', description: 'Sound System', quantity: 1, unit: 'set', unitCost: 3000, totalAmount: 3000 }],
    fundingSource: 'student_contributions',
    allocations: [],
    isSasInstitutional: false,
  });
  assert.equal(blockedStudentFee.valid, false);

  const insufficientClub = validateSbrFormPayload({
    justification: 'Additional trophies required due to expanded bracket count.',
    additionalItems: [{ id: '1', description: 'Trophies', quantity: 5, unit: 'pcs', unitCost: 1000, totalAmount: 5000 }],
    fundingSource: 'organization_funds',
    allocations: [],
    isSasInstitutional: false,
    orgTreasuryAvailable: 2500,
  });
  assert.equal(insufficientClub.valid, false);
});

test('merges same-source and cross-source allocations cleanly and un-exempts upgraded zero_budget events', () => {
  // Cross-source top-up: Base Club Funds (₱5,000) + Supplemental Misc Fee (₱3,000) + Supplemental Club Funds (₱1,500)
  const merged = mergeBaseAndSupplementalAllocations(
    [
      {
        bucketId: 'ORG_ITG',
        bucketName: 'IT Guild Treasury',
        fundType: 'org_treasury',
        allocatedAmount: 5000,
      },
    ],
    [
      {
        bucketId: 'MISC_CULTURAL',
        bucketName: 'Cultural & Sports Misc Fee',
        fundType: 'misc_fee',
        allocatedAmount: 3000,
      },
      {
        bucketId: 'ORG_ITG',
        bucketName: 'IT Guild Treasury',
        fundType: 'org_treasury',
        allocatedAmount: 1500,
      },
    ]
  );

  assert.equal(merged.length, 2);
  const orgBucket = merged.find((b) => b.bucketId === 'ORG_ITG');
  const miscBucket = merged.find((b) => b.bucketId === 'MISC_CULTURAL');
  assert.equal(orgBucket?.allocatedAmount, 6500);
  assert.equal(miscBucket?.allocatedAmount, 3000);

  // Effective budget math
  const eventWithSbr = {
    originalApprovedBudget: 5000,
    totalApprovedBudget: 5000,
    supplementalBudgetTotal: 4500,
    effectiveApprovedBudget: 9500,
  };
  assert.equal(getEventBaseApprovedBudget(eventWithSbr), 5000);
  assert.equal(getEventEffectiveApprovedBudget(eventWithSbr), 9500);

  // Zero-budget event starts exempt, then becomes non-exempt once supplemental budget is approved
  const zeroEventBefore = {
    fundingSource: 'zero_budget',
    totalApprovedBudget: 0,
    liquidationRequired: false,
  };
  assert.equal(isEventLiquidationExempt(zeroEventBefore), true);

  const zeroEventUpgraded = {
    fundingSource: 'zero_budget',
    totalApprovedBudget: 0,
    supplementalBudgetTotal: 2500,
    effectiveApprovedBudget: 2500,
    liquidationRequired: false,
  };
  assert.equal(isEventLiquidationExempt(zeroEventUpgraded), false);
});

test('SBR plugs into 7-stage status tracker and enforces strict SAS/Signatory queue isolation', () => {
  // Officer SBR waiting for Club Adviser -> hidden from SAS & Signatories
  assert.equal(isHiddenFromSasAndSignatories({ status: 'for_adviser_review' }), true);
  assert.equal(
    isHiddenFromSasAndSignatories({ status: 'for_revision', isReturned: true, returnedByRole: 'adviser' }),
    true
  );
  assert.equal(isHiddenFromSasAndSignatories({ status: 'withdrawn' }), true);

  // After Club Adviser forwards to SAS -> visible
  assert.equal(
    isHiddenFromSasAndSignatories({
      status: 'for_sas_review',
      submittedToSasAt: '2026-11-24T00:00:00Z',
    }),
    false
  );

  // School Budget SBR in signatory routing resolves accurately
  const sigTrack = resolveDocumentTrackingState(
    {
      status: 'pending_signatories',
      fundingSource: 'school_budget',
      isPendingSasVetting: false,
      sasVettedBy: { uid: 'admin', name: 'SAS Head', vettedAt: '2026-11-24T01:00:00Z' },
      approvalChain: [{ roleTitle: 'School President', status: 'pending' }],
      currentStepIndex: 0,
    },
    'SBR'
  );
  assert.equal(sigTrack.canonical, 'for_sas_review');
  assert.equal(sigTrack.label, 'In Signatory Routing');
  assert.equal(sigTrack.requiresSignatories, true);
});

test('clones parent AP signatory pipeline (stripping internal SAS steps, preserving parallel stages, resetting status)', () => {
  const parentAp = {
    approvalChain: [
      {
        step: 1,
        stageIndex: 1,
        role: 'sas_head',
        roleTitle: 'SAS Head',
        signatoryUid: 'sas1',
        signatoryName: 'Riselle',
        status: 'approved',
        signedAt: '2026-11-20T00:00:00Z',
      },
      {
        step: 2,
        stageIndex: 2,
        role: 'program_head',
        roleTitle: 'IT Program Head',
        signatoryUid: 'ph1',
        signatoryName: 'Rona Mira Lucanas',
        signatoryEmail: 'rona@sti.edu',
        status: 'approved',
        signedAt: '2026-11-21T00:00:00Z',
      },
      {
        step: 3,
        stageIndex: 2,
        role: 'academic_head',
        roleTitle: 'SHS Asst. Principal',
        signatoryUid: 'shs1',
        signatoryName: 'Cybele Nudalo',
        signatoryEmail: 'cybele@sti.edu',
        status: 'approved',
      },
      {
        step: 4,
        stageIndex: 3,
        role: 'school_admin',
        roleTitle: 'School Administrator',
        signatoryUid: 'sa1',
        signatoryName: 'Sheena Joy Muyuela',
        signatoryEmail: 'sheena@sti.edu',
        status: 'approved',
      },
    ],
  };

  const cloned = cloneParentApSignatoryPipeline(parentAp);
  assert.equal(cloned.length, 3);
  assert.equal(cloned[0].signatoryName, 'Rona Mira Lucanas');
  assert.equal(cloned[0].stageIndex, 1);
  assert.equal(cloned[1].signatoryName, 'Cybele Nudalo');
  assert.equal(cloned[1].stageIndex, 1); // parallel Stage 1 preserved!
  assert.equal(cloned[2].signatoryName, 'Sheena Joy Muyuela');
  assert.equal(cloned[2].stageIndex, 2);
  assert.equal(cloned.every((s) => s.status === 'pending'), true);

  // Stage-locked turn checks for parallel Stage 1 vs waiting Stage 2
  const activated = normalizeSbrApprovalChain(cloned, true);
  const mockSbr = {
    status: 'pending_signatories',
    approvalChain: activated,
    currentStageIndex: 1,
    currentStepIndex: 0,
  };
  assert.equal(isSignatoryTurnForSbr(mockSbr, { uid: 'ph1', email: 'rona@sti.edu' }), true);
  assert.equal(isSignatoryTurnForSbr(mockSbr, { uid: 'shs1', email: 'cybele@sti.edu' }), true);
  assert.equal(isSignatoryTurnForSbr(mockSbr, { uid: 'sa1', email: 'sheena@sti.edu' }), false);
});

test('merges approved SBR items into Liquidation Reference Guide categories and Option A AP Export Financial Projections', () => {
  const baseCategories = [
    { id: 'bi_1', title: 'Food & Snacks', baselineAmount: 5000 },
    { id: 'bi_2', title: 'Sound System', baselineAmount: 3000 },
  ];

  const approvedSbr = {
    id: 'sbr_99',
    referenceCode: 'SBR-2026-SAS-001',
    status: 'approved',
    fundingSource: 'school_budget',
    requestedAmount: 4500,
    ledgerDeducted: true,
    disbursementVoucher: {
      mode: 'separate',
      chequeNumber: 'CHK-2026-881',
      attachmentUrl: 'https://example.com/supp-voucher.pdf',
    },
    allocations: [
      { bucketId: 'b1', bucketName: 'Cultural & Sports Misc Fee', fundType: 'misc_fee', allocatedAmount: 4500 },
    ],
    additionalItems: [
      { id: 'it1', description: 'Food & Snacks', quantity: 20, unit: 'pax', unitCost: 100, totalAmount: 2000 },
      { id: 'it2', description: 'Stage Lighting', quantity: 1, unit: 'set', unitCost: 2500, totalAmount: 2500 },
    ],
  };

  // 1. Liquidation Reference Guide baseline merging (deduplicates colliding title with SBR code)
  const mergedBaseline = mergeLiquidationBaselineWithSupplementalItems(baseCategories, [approvedSbr]);
  assert.equal(mergedBaseline.length, 4);
  assert.equal(mergedBaseline[2].title, 'Food & Snacks (SBR-2026-SAS-001)');
  assert.equal(mergedBaseline[2].isSupplemental, true);
  assert.equal(mergedBaseline[2].baselineAmount, 2000);
  assert.equal(mergedBaseline[3].title, 'Stage Lighting');
  assert.equal(mergedBaseline[3].isSupplemental, true);
  assert.equal(mergedBaseline[3].baselineAmount, 2500);

  // 2. Option A AP Export Financial Projections: keeps This Year Proposed strictly for original AP,
  //    places supplemental rows in Adjustment (+amount) and Total Amount, and reconciles totals.
  const proposal = {
    fundingSource: 'school_budget',
    financialProjections: {
      revenues: [
        { id: 'rev1', description: 'Misc Fee Allocation', lastYearActual: 0, thisYearProposed: 8000, adjustment: 0, totalAmount: 8000, remarks: '' },
      ],
      expenses: [
        { id: 'exp1', description: 'Food & Snacks', lastYearActual: 0, thisYearProposed: 5000, adjustment: 0, totalAmount: 5000, remarks: '' },
        { id: 'exp2', description: 'Sound System', lastYearActual: 0, thisYearProposed: 3000, adjustment: 0, totalAmount: 3000, remarks: '' },
      ],
      totalRevenue: 8000,
      totalExpenses: 8000,
      balance: 0,
    },
  };

  const exported = buildMergedFinancialProjectionsForExport(proposal, [approvedSbr]);
  assert.equal(exported.hasSupplementalRows, true);
  assert.equal(exported.supplementalTotal, 4500);
  assert.equal(exported.financialProjections.expenses.length, 4);
  assert.equal(exported.financialProjections.revenues.length, 2);
  assert.equal(exported.financialProjections.totalExpenses, 12500);
  assert.equal(exported.financialProjections.totalRevenue, 12500);
  assert.equal(exported.financialProjections.balance, 0);

  // Supplemental rows strictly have thisYearProposed = 0 and adjustment = +lineAmt
  const suppRow = exported.financialProjections.expenses[3];
  assert.equal(suppRow.thisYearProposed, 0);
  assert.equal(suppRow.adjustment, 2500);
  assert.equal(suppRow.totalAmount, 2500);
  assert.match(suppRow.remarks, /SBR-2026-SAS-001/);
});

test('strict disbursement/acknowledgment gating for FL reflection & Non-Monetary duplicate General tab exclusion', () => {
  // 1. School Budget & Retained Fund SBRs do NOT reflect in FL until dedicated Supplemental Voucher is uploaded & deducted
  assert.equal(
    isSbrDisbursedForLiquidation({
      status: 'approved',
      fundingSource: 'school_budget',
      ledgerDeducted: false,
    }),
    false
  );
  assert.equal(
    isSbrDisbursedForLiquidation({
      status: 'approved',
      fundingSource: 'school_budget',
      ledgerDeducted: true,
      disbursementVoucher: { mode: 'separate', chequeNumber: 'CHK-500', attachmentUrl: 'https://example.com/v.pdf' },
    }),
    true
  );
  assert.equal(
    isSbrDisbursedForLiquidation({
      status: 'approved',
      fundingSource: 'retained_sao_fund',
      ledgerDeducted: false,
    }),
    false
  );

  // 2. Club Treasury SBRs do NOT reflect in FL until Officer acknowledges & deducts in Finance Center
  assert.equal(
    isSbrDisbursedForLiquidation({
      status: 'approved',
      fundingSource: 'organization_funds',
      ledgerDeducted: false,
    }),
    false
  );
  assert.equal(
    isSbrDisbursedForLiquidation({
      status: 'approved',
      fundingSource: 'organization_funds',
      ledgerDeducted: true,
    }),
    true
  );

  // 3. Non-Monetary AP (zero_budget) dummy ₱0 "Expense Item" row is excluded so FL has NO duplicate General tab
  const dummyZeroBase = [{ id: 'prop_exp_0', title: 'Expense Item', baselineAmount: 0 }];
  assert.deepEqual(filterMeaningfulBaseLiquidationItems(dummyZeroBase, true), []);
  assert.deepEqual(filterMeaningfulBaseLiquidationItems(dummyZeroBase, false), []);

  const unacknowledgedOrgSbr = {
    id: 'sbr_org_1',
    referenceCode: 'SBR-2026-ITG-001',
    status: 'approved',
    fundingSource: 'organization_funds',
    requestedAmount: 2000,
    ledgerDeducted: false,
    additionalItems: [
      { id: 'i1', description: 'ADDITIONAL FUNDS', quantity: 1, unit: 'lot', unitCost: 2000, totalAmount: 2000 },
    ],
  };

  // Before acknowledgment -> FL baseline stays empty
  assert.deepEqual(
    mergeLiquidationBaselineWithSupplementalItems(dummyZeroBase, [unacknowledgedOrgSbr], [], {
      isZeroBudgetBase: true,
    }),
    []
  );

  // After Finance Center acknowledgment -> ONLY the SBR card appears (no dummy "Expense Item" card, no "1 lot × ..." subtitle)
  const acknowledgedOrgSbr = { ...unacknowledgedOrgSbr, ledgerDeducted: true };
  const mergedAfterAck = mergeLiquidationBaselineWithSupplementalItems(
    dummyZeroBase,
    [acknowledgedOrgSbr],
    [],
    { isZeroBudgetBase: true }
  );
  assert.equal(mergedAfterAck.length, 1);
  assert.equal(mergedAfterAck[0].title, 'ADDITIONAL FUNDS');
  assert.equal(mergedAfterAck[0].baselineAmount, 2000);
  assert.equal(mergedAfterAck[0].isSupplemental, true);
  assert.equal(mergedAfterAck[0].qtyUnitLabel, undefined);
});
