import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLiquidationSettlementState,
  buildLiquidationApprovalNotificationPayload,
  evaluatePARLiquidationGate,
} from '../liquidation-settlement.utils.ts';

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
});
