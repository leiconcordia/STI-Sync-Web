import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import type {
  RetainedActivityFundDocument,
  RetainedFundLedgerEntry,
  RetainedFundOwnerType,
} from '../types/retained-fund.types';
import { logAuditEvent } from '../../audit/services/audit.service';

export const RETAINED_FUNDS_COLLECTION = 'retained_activity_funds';
export const RETAINED_FUND_LEDGER_COLLECTION = 'retained_fund_ledger';
export const SAO_RETAINED_BUCKET_ID = 'SAO_CAMPUS';

const SAS_SENTINELS = new Set(['', 'sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional']);

export function resolveRetainedBucketIdentity(params: {
  organizationId?: string | null;
  organizationName?: string | null;
  createdByRole?: string | null;
}): {
  bucketId: string;
  ownerType: RetainedFundOwnerType;
  organizationId?: string;
  organizationName: string;
} {
  const rawOrgId = String(params.organizationId || '').trim();
  const isSas =
    !rawOrgId ||
    SAS_SENTINELS.has(rawOrgId.toLowerCase()) ||
    params.createdByRole === 'admin' ||
    params.createdByRole === 'sas_admin';

  if (isSas) {
    return {
      bucketId: SAO_RETAINED_BUCKET_ID,
      ownerType: 'sao',
      organizationName: 'SAO / Campus Student Activity Fund',
    };
  }

  return {
    bucketId: `ORG_${rawOrgId}`,
    ownerType: 'organization',
    organizationId: rawOrgId,
    organizationName: params.organizationName || 'Student Organization',
  };
}

function emptyFundDoc(identity: ReturnType<typeof resolveRetainedBucketIdentity>): RetainedActivityFundDocument {
  return {
    id: identity.bucketId,
    ownerType: identity.ownerType,
    organizationId: identity.organizationId,
    organizationName: identity.organizationName,
    totalContributionsCollected: 0,
    totalSurplusesRetained: 0,
    totalDisbursedOrSpent: 0,
    availableBalance: 0,
  };
}

/**
 * Idempotently posts a retained fund ledger transaction and atomically adjusts
 * the corresponding persistent Retained Activity Fund bucket (`SAO_CAMPUS` or `ORG_<id>`).
 * Never touches or resets with Miscellaneous Fee configs.
 */
async function postRetainedFundTransaction(params: {
  ledgerDocId: string;
  identity: ReturnType<typeof resolveRetainedBucketIdentity>;
  type: RetainedFundLedgerEntry['type'];
  amount: number;
  deltaBalance: number;
  description: string;
  eventId?: string;
  eventTitle?: string;
  liquidationId?: string;
  schoolYear?: string;
  semester?: string;
  performedBy?: string;
  requireSufficientBalance?: boolean;
}): Promise<void> {
  const amount = Math.max(0, Number(params.amount) || 0);
  if (!params.ledgerDocId || amount <= 0) return;

  const ledgerRef = doc(db, RETAINED_FUND_LEDGER_COLLECTION, params.ledgerDocId);
  const bucketRef = doc(db, RETAINED_FUNDS_COLLECTION, params.identity.bucketId);

  await runTransaction(db, async (tx) => {
    const existingLedger = await tx.get(ledgerRef);
    if (existingLedger.exists()) {
      return;
    }

    const bucketSnap = await tx.get(bucketRef);
    const current: RetainedActivityFundDocument = bucketSnap.exists()
      ? ({ id: bucketSnap.id, ...(bucketSnap.data() as any) } as RetainedActivityFundDocument)
      : emptyFundDoc(params.identity);

    const nextCollected =
      params.type === 'collection_income'
        ? (Number(current.totalContributionsCollected) || 0) + amount
        : Number(current.totalContributionsCollected) || 0;

    const nextSurpluses =
      params.type === 'liquidation_surplus_retained'
        ? (Number(current.totalSurplusesRetained) || 0) + amount
        : Number(current.totalSurplusesRetained) || 0;

    const nextSpent =
      params.type === 'event_expense_deduction' || params.type === 'liquidation_deficit_deduction'
        ? (Number(current.totalDisbursedOrSpent) || 0) + amount
        : Number(current.totalDisbursedOrSpent) || 0;

    const currentAvailable = Number(current.availableBalance) || 0;
    if (params.requireSufficientBalance && params.deltaBalance < 0 && currentAvailable + 0.009 < Math.abs(params.deltaBalance)) {
      throw new Error(
        `Insufficient balance in "${params.identity.organizationName}": needs ₱${Math.abs(params.deltaBalance).toLocaleString()} but only ₱${currentAvailable.toLocaleString()} is available.`
      );
    }

    const nextAvailable = Math.max(
      0,
      Math.round((currentAvailable + params.deltaBalance) * 100) / 100
    );

    tx.set(
      bucketRef,
      sanitizeFirestorePayload({
        ...current,
        id: params.identity.bucketId,
        ownerType: params.identity.ownerType,
        organizationId: params.identity.organizationId,
        organizationName: params.identity.organizationName,
        totalContributionsCollected: Math.round(nextCollected * 100) / 100,
        totalSurplusesRetained: Math.round(nextSurpluses * 100) / 100,
        totalDisbursedOrSpent: Math.round(nextSpent * 100) / 100,
        availableBalance: nextAvailable,
        updatedBy: params.performedBy || 'System',
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );

    const entry: RetainedFundLedgerEntry = {
      id: params.ledgerDocId,
      bucketId: params.identity.bucketId,
      ownerType: params.identity.ownerType,
      organizationId: params.identity.organizationId,
      organizationName: params.identity.organizationName,
      eventId: params.eventId || '',
      eventTitle: params.eventTitle || '',
      liquidationId: params.liquidationId || '',
      schoolYear: params.schoolYear || '',
      semester: params.semester || '',
      type: params.type,
      amount,
      description: params.description,
      performedBy: params.performedBy || 'System',
      createdAt: serverTimestamp(),
    };

    tx.set(ledgerRef, sanitizeFirestorePayload(entry));
  });
}

/**
 * Tracks Student Contribution collections as live revenue in the persistent Retained Bucket
 * (`SAO_CAMPUS` for SAO/Admin events, `ORG_<id>` for Club/Organization events).
 */
export async function creditRetainedFundOnCollection(params: {
  collectionId: string;
  amount: number;
  organizationId?: string | null;
  organizationName?: string | null;
  eventId?: string;
  eventTitle?: string;
  schoolYear?: string;
  semester?: string;
  description?: string;
  performedBy?: string;
}): Promise<void> {
  const identity = resolveRetainedBucketIdentity({
    organizationId: params.organizationId,
    organizationName: params.organizationName,
  });

  await postRetainedFundTransaction({
    ledgerDocId: `coll_${params.collectionId}`,
    identity,
    type: 'collection_income',
    amount: params.amount,
    deltaBalance: Math.max(0, Number(params.amount) || 0),
    description:
      params.description ||
      `Student Contribution Collection – ${params.eventTitle || 'Activity Payable'}`,
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    schoolYear: params.schoolYear,
    semester: params.semester,
    performedBy: params.performedBy,
  });
}

/**
 * Deducts approved budget expenses from the persistent Retained Student Activity Fund (`SAO_CAMPUS` or `ORG_<id>`)
 * when an event funded by `retained_sao_fund` or `organization_funds` is approved.
 */
export async function deductRetainedFundOnProposalApproval(params: {
  eventId: string;
  eventTitle?: string;
  amount: number;
  organizationId?: string | null;
  organizationName?: string | null;
  schoolYear?: string;
  semester?: string;
  performedBy?: string;
}): Promise<void> {
  const identity = resolveRetainedBucketIdentity({
    organizationId: params.organizationId,
    organizationName: params.organizationName,
  });

  await postRetainedFundTransaction({
    ledgerDocId: `event_${params.eventId}`,
    identity,
    type: 'event_expense_deduction',
    amount: params.amount,
    deltaBalance: -Math.max(0, Number(params.amount) || 0),
    description: `Approved Event Budget – ${params.eventTitle || 'Retained Fund Event'}`,
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    schoolYear: params.schoolYear,
    semester: params.semester,
    performedBy: params.performedBy,
  });
}

/**
 * Routes unspent surplus (or overspend deficit) after Financial Liquidation into the appropriate
 * persistent Retained Fund Bucket based strictly on creator:
 * - Organization / Club event -> Organization's Treasury / Retained Bucket (`ORG_<orgId>`)
 * - SAO / Admin event -> SAO / Campus Student Activity Fund (`SAO_CAMPUS`)
 * Never mixes with Miscellaneous Fee buckets and persists across School Years.
 */
export async function creditRetainedFundSurplusOnLiquidation(params: {
  liquidationId: string;
  eventId?: string;
  eventTitle?: string;
  surplusOrDeficit: number;
  organizationId?: string | null;
  organizationName?: string | null;
  createdByRole?: string | null;
  schoolYear?: string;
  semester?: string;
  performedBy?: string;
  requireSufficientBalance?: boolean;
}): Promise<void> {
  const net = Number(params.surplusOrDeficit) || 0;
  if (!params.liquidationId || net === 0) return;

  const isSurplus = net > 0;
  const absAmount = Math.abs(net);
  const identity = resolveRetainedBucketIdentity({
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    createdByRole: params.createdByRole,
  });

  await postRetainedFundTransaction({
    ledgerDocId: `surplus_${params.liquidationId}`,
    identity,
    type: isSurplus ? 'liquidation_surplus_retained' : 'liquidation_deficit_deduction',
    amount: absAmount,
    deltaBalance: isSurplus ? absAmount : -absAmount,
    description: isSurplus
      ? `Retained Liquidation Surplus – ${params.eventTitle || 'Event Liquidation'}`
      : `Liquidation Deficit Adjustment – ${params.eventTitle || 'Event Liquidation'}`,
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    liquidationId: params.liquidationId,
    schoolYear: params.schoolYear,
    semester: params.semester,
    performedBy: params.performedBy,
    requireSufficientBalance: params.requireSufficientBalance,
  });

  try {
    await logAuditEvent({
      action: isSurplus ? 'RETAINED_FUND_SURPLUS_CREDITED' : 'RETAINED_FUND_DEFICIT_ADJUSTED',
      actionType: 'UPDATE',
      details: `${isSurplus ? 'Credited' : 'Deducted'} ₱${absAmount.toLocaleString()} for "${params.eventTitle || params.liquidationId}" in ${identity.organizationName} (isolated from Miscellaneous Fees).`,
      performedBy: params.performedBy || 'System',
      userRole: identity.ownerType === 'sao' ? 'SAS Admin' : 'Student Officer',
      targetId: identity.bucketId,
      targetName: identity.organizationName,
    });
  } catch {}
}

/**
 * Ensures the singleton SAO Campus Retained Activity Fund doc exists cleanly for read/subscription.
 */
export async function ensureSaoRetainedBucketExists(): Promise<void> {
  const ref = doc(db, RETAINED_FUNDS_COLLECTION, SAO_RETAINED_BUCKET_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        id: SAO_RETAINED_BUCKET_ID,
        ownerType: 'sao',
        organizationName: 'SAO / Campus Student Activity Fund',
        totalContributionsCollected: 0,
        totalSurplusesRetained: 0,
        totalDisbursedOrSpent: 0,
        availableBalance: 0,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}
