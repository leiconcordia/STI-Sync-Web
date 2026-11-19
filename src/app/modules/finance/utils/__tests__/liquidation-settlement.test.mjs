import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLiquidationSettlementState,
  buildLiquidationApprovalNotificationPayload,
  evaluatePARLiquidationGate,
  computeLiveStudentCollectionReimbursementCapacity,
} from '../liquidation-settlement.utils.ts';
import { validateDeficitDeductionAllocations } from '../../../activity-proposals/utils/proposal-calculations.ts';

describe('Financial Liquidation Settlement Visibility & PAR Gate', () => {
  const fundedEvent = {
    id: 'evt_1',
    title: 'STI Sportsfest 2026',
    totalApprovedBudget: 10000,
    fundingSource: 'school_budget',
  };

  const zeroBudgetEvent = {
    id: 'evt_zero',
    title: 'Free Orientation',
    totalApprovedBudget: 0,
    fundingSource: 'zero_budget',
  };

  test('identifies pending returnable surplus and builds actionable maker notification', () => {
    const liq = {
      id: 'liq_1',
      eventId: 'evt_1',
      eventTitle: 'STI Sportsfest 2026',
      organizationId: 'jpcs',
      organizationName: 'JPCS',
      fundingSource: 'school_budget',
      allocatedBudget: 10000,
      totalActualSpending: 8500,
      surplusOrDeficit: 1500,
      status: 'approved',
      cashierSettlementStatus: 'pending_proof',
    };

    const state = getLiquidationSettlementState(liq);
    assert.equal(state.surplusAmount, 1500);
    assert.equal(state.requiresMakerAction, true);

    const notif = buildLiquidationApprovalNotificationPayload('liq_1', liq);
    assert.equal(notif.recipientRole, 'officer');
    assert.equal(notif.actionRoute, '/officer/liquidation?id=liq_1');
    assert.match(notif.title, /Return ₱1,500\.00/);
    assert.match(notif.message, /unspent surplus of ₱1,500\.00/);
  });

  test('locks PAR submission until FL is approved and return/reimbursement proof is uploaded', () => {
    const underReviewGate = evaluatePARLiquidationGate({
      event: fundedEvent,
      liquidation: { status: 'under_review', surplusOrDeficit: 500 },
    });
    assert.equal(underReviewGate.allowedToSubmit, false);
    assert.equal(underReviewGate.allowedToApprove, false);
    assert.equal(underReviewGate.gateType, 'fl_unapproved');

    const pendingProofGate = evaluatePARLiquidationGate({
      event: fundedEvent,
      liquidation: {
        status: 'approved',
        surplusOrDeficit: -800,
        cashierSettlementStatus: 'pending_proof',
      },
    });
    assert.equal(pendingProofGate.allowedToSubmit, false);
    assert.equal(pendingProofGate.allowedToApprove, false);
    assert.equal(pendingProofGate.gateType, 'settlement_pending_proof');
    assert.match(pendingProofGate.submitReason, /₱800\.00/);
  });

  test('allows PAR submission once proof is uploaded, while locking final PAR approval until SAS verifies', () => {
    const proofUploadedGate = evaluatePARLiquidationGate({
      event: fundedEvent,
      liquidation: {
        status: 'approved',
        surplusOrDeficit: 1200,
        cashierSettlementStatus: 'proof_uploaded',
      },
    });
    assert.equal(proofUploadedGate.allowedToSubmit, true);
    assert.equal(proofUploadedGate.allowedToApprove, false);
    assert.equal(proofUploadedGate.gateType, 'settlement_awaiting_verification');

    const verifiedGate = evaluatePARLiquidationGate({
      event: fundedEvent,
      liquidation: {
        status: 'approved',
        surplusOrDeficit: 1200,
        cashierSettlementStatus: 'verified',
      },
    });
    assert.equal(verifiedGate.allowedToSubmit, true);
    assert.equal(verifiedGate.allowedToApprove, true);
    assert.equal(verifiedGate.gateType, 'ready');
  });

  test('does not lock zero-budget events or recovering student contribution receivables', () => {
    const exemptGate = evaluatePARLiquidationGate({
      event: zeroBudgetEvent,
      liquidation: null,
    });
    assert.equal(exemptGate.allowedToSubmit, true);
    assert.equal(exemptGate.allowedToApprove, true);

    const studentContribGate = evaluatePARLiquidationGate({
      event: { id: 'evt_sc', title: 'Gala', totalApprovedBudget: 5000, fundingSource: 'student_contributions' },
      liquidation: {
        status: 'approved',
        organizationId: 'jpcs',
        fundingSource: 'student_contributions',
        surplusOrDeficit: 0,
        collectionSettlementStatus: 'deficit_recovering',
        cashierSettlementStatus: 'verified',
      },
    });
    assert.equal(studentContribGate.allowedToSubmit, true);
    assert.equal(studentContribGate.allowedToApprove, true);
  });

  test('student_collections mode rejects misc_fee/supplemental buckets and blocks insufficient funds reimbursement', () => {
    const miscBlocked = validateDeficitDeductionAllocations({
      totalDeficit: 500,
      mode: 'student_collections',
      rows: [
        {
          bucketId: 'misc_1',
          bucketName: 'Cultural Activity Fee',
          fundType: 'misc_fee',
          originalAllocatedAmount: 0,
          availableBalance: 5000,
          deductAmount: 500,
          isSupplementalSource: true,
        },
      ],
    });
    assert.equal(miscBlocked.isValid, false);
    assert.match(miscBlocked.summaryError || '', /Miscellaneous Fee and supplemental buckets/i);

    const shortCheck = validateDeficitDeductionAllocations({
      totalDeficit: 500,
      mode: 'student_collections',
      rows: [
        {
          bucketId: 'SAO_CAMPUS',
          bucketName: 'SAS Student Contribution & Retained Funds',
          fundType: 'student_contribution_retained',
          originalAllocatedAmount: 1000,
          availableBalance: 200,
          deductAmount: 200,
          isSupplementalSource: false,
        },
      ],
    });
    assert.equal(shortCheck.isValid, false);
    assert.equal(shortCheck.needsAdditionalBucket, false);
    assert.match(shortCheck.summaryError || '', /Collect remaining student contributions first/i);

    const validCheck = validateDeficitDeductionAllocations({
      totalDeficit: 500,
      mode: 'student_collections',
      rows: [
        {
          bucketId: 'SAO_CAMPUS',
          bucketName: 'SAS Student Contribution & Retained Funds',
          fundType: 'student_contribution_retained',
          originalAllocatedAmount: 1000,
          availableBalance: 650,
          deductAmount: 500,
          isSupplementalSource: false,
        },
      ],
    });
    assert.equal(validCheck.isValid, true);
  });

  test('keeps overspent Club student_contributions in pending_proof and computes live capacity accurately', () => {
    const clubOverspentState = getLiquidationSettlementState({
      status: 'approved',
      organizationId: 'jpcs',
      fundingSource: 'student_contributions',
      allocatedBudget: 1000,
      totalActualSpending: 1400,
      surplusOrDeficit: -400,
    });
    assert.equal(clubOverspentState.deficitAmount, 400);
    assert.equal(clubOverspentState.settlementStatus, 'pending_proof');

    const capShort = computeLiveStudentCollectionReimbursementCapacity({
      isSasOwned: false,
      liquidationId: 'liq_club_1',
      allocatedBudget: 1000,
      orgLedgerEntries: [{ type: 'income', amount: 1000 }],
    });
    assert.equal(capShort, 0);

    const capFunded = computeLiveStudentCollectionReimbursementCapacity({
      isSasOwned: false,
      liquidationId: 'liq_club_1',
      allocatedBudget: 1000,
      orgLedgerEntries: [
        { type: 'income', amount: 1000 },
        { type: 'income', amount: 500 },
      ],
    });
    assert.equal(capFunded, 500);
  });
});
