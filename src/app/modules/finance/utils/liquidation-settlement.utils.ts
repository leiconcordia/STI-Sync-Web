export type LiquidationSettlementKind =
  | 'surplus_return'
  | 'deficit_reimbursement'
  | 'exact_settled';

export type ResolvedSettlementStatus =
  | 'not_required'
  | 'pending_proof'
  | 'proof_uploaded'
  | 'verified';

export interface LiquidationSettlementState {
  status: string;
  variance: number;
  surplusAmount: number;
  deficitAmount: number;
  amountToReturn: number;
  isExactZero: boolean;
  isSasOwned: boolean;
  isClubDirect: boolean;
  settlementKind: LiquidationSettlementKind;
  settlementStatus: ResolvedSettlementStatus;
  requiresMakerAction: boolean;
  awaitingSasVerification: boolean;
  isSettled: boolean;
}

export interface PARLiquidationGateResult {
  allowedToSubmit: boolean;
  allowedToApprove: boolean;
  gateType:
    | 'exempt'
    | 'ready'
    | 'fl_unapproved'
    | 'settlement_pending_proof'
    | 'settlement_awaiting_verification';
  submitReason: string;
  approveReason: string;
  settlementState: LiquidationSettlementState | null;
}

function roundPeso(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function isSasOwnedLiquidation(liq: any): boolean {
  const orgLower = String(liq?.organizationId || '').trim().toLowerCase();
  const roleLower = String(liq?.createdByRole || '').trim().toLowerCase();
  return (
    roleLower === 'admin' ||
    roleLower === 'sas_admin' ||
    !orgLower ||
    ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgLower)
  );
}

/**
 * Returns true when an activity or liquidation is funded purely by Student Collections / Retained Fund
 * (excluding Miscellaneous Fee activities).
 */
export function isStudentCollectionFunding(liqOrEvent: any): boolean {
  const src = String(liqOrEvent?.fundingSource || '').trim().toLowerCase();
  const allocs = Array.isArray(liqOrEvent?.allocations) ? liqOrEvent.allocations : [];
  if (allocs.some((a: any) => a?.fundType === 'misc_fee')) {
    return false;
  }
  if (src === 'student_contributions' || src === 'retained_sao_fund') {
    return true;
  }
  if (allocs.length > 0) {
    return allocs.every(
      (a: any) =>
        a?.fundType === 'student_contributions' ||
        a?.fundType === 'student_contribution_retained'
    );
  }
  return false;
}

/**
 * Computes net live Student Collections balance available to reimburse an overspend deficit,
 * ensuring initial collected budget not yet debited from the ledger/fund is never double-counted.
 */
export function computeLiveStudentCollectionReimbursementCapacity(params: {
  isSasOwned: boolean;
  eventId?: string | null;
  liquidationId?: string | null;
  allocatedBudget: number;
  saoAvailableBalance?: number;
  retainedLedgerEntries?: Array<{
    eventId?: string;
    type?: string;
    amount?: number;
  }>;
  orgLedgerEntries?: Array<{
    collectionId?: string;
    type?: string;
    amount?: number;
  }>;
}): number {
  const allocated = Math.max(0, roundPeso(Number(params.allocatedBudget) || 0));

  if (params.isSasOwned) {
    const raw = Math.max(0, roundPeso(Number(params.saoAvailableBalance) || 0));
    if (params.eventId && Array.isArray(params.retainedLedgerEntries)) {
      const credited = params.retainedLedgerEntries
        .filter((e) => e.eventId === params.eventId && e.type === 'collection_income')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const debited = params.retainedLedgerEntries
        .filter((e) => e.eventId === params.eventId && e.type === 'event_expense_deduction')
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const unDebitedEventCash = Math.max(0, Math.min(allocated, roundPeso(credited - debited)));
      return Math.max(0, roundPeso(raw - unDebitedEventCash));
    }
    return raw;
  }

  const entries = Array.isArray(params.orgLedgerEntries) ? params.orgLedgerEntries : [];
  const skipCollId = params.liquidationId ? `${params.liquidationId}_org_contrib_expense` : '';
  const inc = entries
    .filter((t) => String(t.type || '').toLowerCase() === 'income')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const exp = entries
    .filter(
      (t) =>
        String(t.type || '').toLowerCase() === 'expense' &&
        (!skipCollId || t.collectionId !== skipCollId)
    )
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const netOrgBalance = roundPeso(inc - exp);
  return Math.max(0, roundPeso(netOrgBalance - allocated));
}

/**
 * Computes canonical post-approval settlement state (surplus return / deficit reimbursement)
 * for any Financial Liquidation document.
 */
export function getLiquidationSettlementState(liq: any): LiquidationSettlementState {
  const status = String(liq?.status || 'draft').toLowerCase().trim();
  const allocated = Number(liq?.allocatedBudget ?? liq?.amountAdvanced ?? 0) || 0;
  const spent = Number(liq?.totalActualSpending ?? 0) || 0;
  const rawVariance =
    liq?.surplusOrDeficit !== undefined && liq?.surplusOrDeficit !== null
      ? Number(liq.surplusOrDeficit) || 0
      : allocated - spent;
  const variance = roundPeso(rawVariance);

  const isExactZero = Math.abs(variance) < 0.01;
  const surplusAmount = variance > 0.009 ? roundPeso(variance) : 0;
  const deficitAmount = variance < -0.009 ? roundPeso(Math.abs(variance)) : 0;
  const amountToReturn = surplusAmount;

  const isSasOwned = isSasOwnedLiquidation(liq);
  const fundingSource = String(liq?.fundingSource || '').trim().toLowerCase();
  const isClubDirect =
    !isSasOwned &&
    (fundingSource === 'organization_funds' || fundingSource === 'student_contributions');

  let settlementKind: LiquidationSettlementKind = 'exact_settled';
  if (surplusAmount > 0) {
    settlementKind = 'surplus_return';
  } else if (deficitAmount > 0) {
    settlementKind = 'deficit_reimbursement';
  }

  const needsCashierSettlement = !isExactZero;

  const rawSettlementStatus = String(liq?.cashierSettlementStatus || '').toLowerCase().trim();
  const hasProofs = Array.isArray(liq?.cashierSettlementProofs) && liq.cashierSettlementProofs.length > 0;

  let settlementStatus: ResolvedSettlementStatus = 'not_required';
  if (rawSettlementStatus === 'verified') {
    settlementStatus = 'verified';
  } else if (rawSettlementStatus === 'proof_uploaded') {
    settlementStatus = 'proof_uploaded';
  } else if (rawSettlementStatus === 'pending_proof') {
    settlementStatus = 'pending_proof';
  } else if (rawSettlementStatus === 'not_required') {
    settlementStatus = 'not_required';
  } else if (needsCashierSettlement) {
    const isClubStudentContribOverspent =
      isClubDirect && fundingSource === 'student_contributions' && deficitAmount > 0.009;
    if (isClubDirect && !isClubStudentContribOverspent) {
      settlementStatus = 'verified';
    } else {
      settlementStatus = hasProofs ? 'proof_uploaded' : 'pending_proof';
    }
  }

  const isApproved = status === 'approved';
  return {
    status,
    variance,
    surplusAmount,
    deficitAmount,
    amountToReturn,
    isExactZero,
    isSasOwned,
    isClubDirect,
    settlementKind,
    settlementStatus,
    requiresMakerAction: isApproved && settlementStatus === 'pending_proof',
    awaitingSasVerification: isApproved && settlementStatus === 'proof_uploaded',
    isSettled:
      isApproved &&
      (settlementStatus === 'verified' || settlementStatus === 'not_required'),
  };
}

function formatPesoPlain(amount: number): string {
  return `₱${roundPeso(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Builds the maker notification copy sent immediately upon FL approval so the maker
 * explicitly sees whether there is a Returnable Surplus, Reimbursement Deficit, or Exact Match.
 */
export function buildLiquidationApprovalNotificationPayload(
  liquidationId: string,
  liq: any
): {
  recipientRole: 'admin' | 'officer';
  targetOrgId: string;
  targetOrgName: string;
  title: string;
  message: string;
  actionRoute: string;
} {
  const state = getLiquidationSettlementState({ ...liq, status: 'approved' });
  const eventTitle = String(liq?.eventTitle || liq?.eventName || 'Activity').trim();
  const isSas = state.isSasOwned;
  const recipientRole = isSas ? 'admin' : 'officer';
  const actionRoute = isSas
    ? `/home/liquidations?id=${liquidationId}`
    : `/officer/liquidation?id=${liquidationId}`;
  const targetOrgId = isSas ? 'sas' : String(liq?.organizationId || '').trim();
  const targetOrgName = isSas
    ? 'Student Affairs & Services (SAS)'
    : String(liq?.organizationName || 'Student Organization').trim();

  if (state.surplusAmount > 0.009) {
    if (state.isClubDirect) {
      return {
        recipientRole,
        targetOrgId,
        targetOrgName,
        title: `FL Approved (Surplus Credited): ${eventTitle}`,
        message: `Your Financial Liquidation for "${eventTitle}" was approved with a surplus of ${formatPesoPlain(state.surplusAmount)}. This unused amount returns automatically to your Club Treasury Ledger.`,
        actionRoute,
      };
    }
    return {
      recipientRole,
      targetOrgId,
      targetOrgName,
      title: `FL Approved — Action Required: Return ${formatPesoPlain(state.surplusAmount)}`,
      message: `Your Financial Liquidation for "${eventTitle}" was approved with an unspent surplus of ${formatPesoPlain(state.surplusAmount)}. Please return the unused funds and upload the Cashier Return Receipt / proof in Financial Liquidation to settle this activity and unlock PAR submission.`,
      actionRoute,
    };
  }

  if (state.deficitAmount > 0.009) {
    const isStudentCol = isStudentCollectionFunding(liq);
    if (state.isClubDirect && !isStudentCol) {
      return {
        recipientRole,
        targetOrgId,
        targetOrgName,
        title: `FL Approved (Reimburse Officer ${formatPesoPlain(state.deficitAmount)}): ${eventTitle}`,
        message: `Your Financial Liquidation for "${eventTitle}" was approved with an out-of-pocket deficit of ${formatPesoPlain(state.deficitAmount)}. Reimburse the advance holder/officer from Club Funds (recorded in Finance Center).`,
        actionRoute,
      };
    }
    if (isStudentCol) {
      return {
        recipientRole,
        targetOrgId,
        targetOrgName,
        title: `FL Approved — Student Collections Reimbursement Required (${formatPesoPlain(state.deficitAmount)})`,
        message: `Your Financial Liquidation for "${eventTitle}" was approved with an overspend deficit of ${formatPesoPlain(state.deficitAmount)}. Collect remaining student contributions first if available Student Collections funds cannot cover the overspend before uploading reimbursement proof.`,
        actionRoute,
      };
    }
    return {
      recipientRole,
      targetOrgId,
      targetOrgName,
      title: `FL Approved — Action Required: Reimburse ${formatPesoPlain(state.deficitAmount)}`,
      message: `Your Financial Liquidation for "${eventTitle}" was approved with an overspend deficit of ${formatPesoPlain(state.deficitAmount)}. Please select the coverage bucket(s) and upload the signed Reimbursement / Supplemental Proof in Financial Liquidation to settle this activity and unlock PAR submission.`,
      actionRoute,
    };
  }

  return {
    recipientRole,
    targetOrgId,
    targetOrgName,
    title: `Financial Liquidation Approved: ${eventTitle}`,
    message: `Your Financial Liquidation for "${eventTitle}" was approved and settled cleanly at ₱0.00 variance. You may now proceed with your Post-Activity Report (PAR).`,
    actionRoute,
  };
}

/**
 * Evaluates whether a Post-Activity Report (PAR) is allowed to be submitted and/or
 * finally approved given the linked event's Financial Liquidation & post-approval
 * Cashier Return / Reimbursement proof state.
 *
 * Rules:
 * - Zero-budget / liquidation-exempt events pass immediately.
 * - PAR drafting stays unlocked anytime; PAR *Submission* locks until FL is approved AND
 *   any required surplus return / deficit reimbursement proof has been uploaded (`proof_uploaded` or `verified`).
 * - PAR *Final Approval* locks until FL settlement is `verified` (or `not_required`).
 * - Late student contribution collection recovery (`collectionSettlementStatus === 'deficit_recovering'`)
 *   does NOT block PAR so events are not deadlocked past the 15-day PAR deadline.
 */
export function evaluatePARLiquidationGate(params: {
  event: any;
  liquidation: any | null | undefined;
  isExempt?: boolean;
}): PARLiquidationGateResult {
  const { event, liquidation, isExempt } = params;

  const effectivelyExempt =
    isExempt !== undefined
      ? isExempt
      : !event ||
        (event?.fundingSource === 'zero_budget' &&
          Number(event?.totalApprovedBudget ?? event?.approvedBudget ?? event?.budget ?? 0) <= 0);

  if (effectivelyExempt) {
    return {
      allowedToSubmit: true,
      allowedToApprove: true,
      gateType: 'exempt',
      submitReason: '',
      approveReason: '',
      settlementState: null,
    };
  }

  if (!liquidation) {
    const msg =
      'Post-Activity Report submission is locked until the Financial Liquidation (LF-01) is created, approved, and settled. You may continue saving a PAR draft.';
    return {
      allowedToSubmit: false,
      allowedToApprove: false,
      gateType: 'fl_unapproved',
      submitReason: msg,
      approveReason: msg,
      settlementState: null,
    };
  }

  const state = getLiquidationSettlementState(liquidation);

  if (state.status !== 'approved') {
    const statusLabel = (state.status || 'draft').replace(/_/g, ' ');
    const msg = `Post-Activity Report submission is locked while the linked Financial Liquidation is "${statusLabel}". Financial Liquidation must be approved (and any return/reimbursement proof uploaded) before submitting PAR. You may still Save as Draft.`;
    return {
      allowedToSubmit: false,
      allowedToApprove: false,
      gateType: 'fl_unapproved',
      submitReason: msg,
      approveReason: msg,
      settlementState: state,
    };
  }

  if (state.settlementStatus === 'pending_proof') {
    const isDeficit = state.deficitAmount > 0.009;
    const actionLabel = isDeficit
      ? `reimbursement / overspend proof for ${formatPesoPlain(state.deficitAmount)}`
      : `Cashier return receipt / proof for the ${formatPesoPlain(state.amountToReturn || state.surplusAmount)} unspent surplus`;
    const msg = `Post-Activity Report submission is locked: Financial Liquidation is approved, but the required ${actionLabel} has not been uploaded yet. Upload the proof on your Financial Liquidation report first (you may still save a PAR draft).`;
    return {
      allowedToSubmit: false,
      allowedToApprove: false,
      gateType: 'settlement_pending_proof',
      submitReason: msg,
      approveReason: msg,
      settlementState: state,
    };
  }

  if (state.settlementStatus === 'proof_uploaded') {
    const isDeficit = state.deficitAmount > 0.009;
    const kindLabel = isDeficit ? 'Reimbursement' : 'Cashier Return';
    const approveMsg = `Final PAR approval is locked: the ${kindLabel} settlement proof has been uploaded, but SAS Admin has not verified and posted the bucket settlement yet.`;
    return {
      allowedToSubmit: true,
      allowedToApprove: false,
      gateType: 'settlement_awaiting_verification',
      submitReason: '',
      approveReason: approveMsg,
      settlementState: state,
    };
  }

  return {
    allowedToSubmit: true,
    allowedToApprove: true,
    gateType: 'ready',
    submitReason: '',
    approveReason: '',
    settlementState: state,
  };
}
