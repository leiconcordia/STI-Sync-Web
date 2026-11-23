import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canRequestSupplementalBudget,
  doesSbrRequireSignatories,
  getEventBaseApprovedBudget,
  getEventEffectiveApprovedBudget,
  getPermittedSupplementalFundingSources,
  hasBlockingPendingSbrForLiquidation,
  isFundingSourcePermittedForSbr,
  mergeBaseAndSupplementalAllocations,
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
