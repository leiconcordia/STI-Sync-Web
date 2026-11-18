import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  runTransaction,
  writeBatch,
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

export function normalizeRetainedSchoolYear(sy?: string | null): string {
  return String(sy || '')
    .replace(/^sy\s*/i, '')
    .replace(/^a\.?y\.?\s*/i, '')
    .replace(/–/g, '-')
    .trim();
}

export function isSasOrganizationId(orgId?: string | null, createdByRole?: string | null): boolean {
  const raw = String(orgId || '').trim().toLowerCase();
  return !raw || SAS_SENTINELS.has(raw) || createdByRole === 'admin' || createdByRole === 'sas_admin';
}

/**
 * Resolves the School Year & Term for a Retained Fund transaction so entries never
 * accidentally fall back to unscoped legacy docs when an active School Year exists.
 */
async function resolveEffectiveRetainedPeriod(params: {
  schoolYear?: string | null;
  semester?: string | null;
  eventId?: string | null;
}): Promise<{ schoolYear: string; semester: string }> {
  let cleanSy = normalizeRetainedSchoolYear(params.schoolYear);
  let cleanSem = String(params.semester || '').trim();

  if ((!cleanSy || !cleanSem) && params.eventId) {
    try {
      for (const col of ['activities', 'activity_proposals', 'events', 'proposals']) {
        const snap = await getDoc(doc(db, col, params.eventId));
        if (snap.exists()) {
          const d = snap.data() as any;
          if (!cleanSy) cleanSy = normalizeRetainedSchoolYear(d.schoolYear || d.academicYear);
          if (!cleanSem) cleanSem = String(d.semester || '').trim();
          if (cleanSy && cleanSem) break;
        }
      }
    } catch {}
  }

  if (!cleanSy || !cleanSem) {
    try {
      const { getActiveMiscFeeAcademicContext } = await import('./misc-fee.service');
      const ctx = await getActiveMiscFeeAcademicContext();
      if (ctx) {
        if (!cleanSy) cleanSy = normalizeRetainedSchoolYear(ctx.schoolYear);
        if (!cleanSem) cleanSem = ctx.semester;
      }
    } catch {}
  }

  return { schoolYear: cleanSy, semester: cleanSem };
}

export function buildScopedRetainedBucketId(baseBucketId: string, schoolYear?: string | null): string {
  const cleanSy = normalizeRetainedSchoolYear(schoolYear);
  if (!cleanSy) return baseBucketId;
  return `${baseBucketId}__SY_${cleanSy.replace(/[^0-9A-Za-z-]/g, '')}`;
}

export function resolveRetainedBucketIdentity(params: {
  organizationId?: string | null;
  organizationName?: string | null;
  createdByRole?: string | null;
  schoolYear?: string | null;
}): {
  baseBucketId: string;
  bucketId: string;
  ownerType: RetainedFundOwnerType;
  schoolYear: string;
  organizationId?: string;
  organizationName: string;
} {
  const rawOrgId = String(params.organizationId || '').trim();
  const cleanSy = normalizeRetainedSchoolYear(params.schoolYear);
  const isSas =
    !rawOrgId ||
    SAS_SENTINELS.has(rawOrgId.toLowerCase()) ||
    params.createdByRole === 'admin' ||
    params.createdByRole === 'sas_admin';

  if (isSas) {
    return {
      baseBucketId: SAO_RETAINED_BUCKET_ID,
      bucketId: buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, cleanSy),
      ownerType: 'sao',
      schoolYear: cleanSy,
      organizationName: 'SAO / Campus Student Activity Fund',
    };
  }

  const baseOrgId = `ORG_${rawOrgId}`;
  return {
    baseBucketId: baseOrgId,
    bucketId: buildScopedRetainedBucketId(baseOrgId, cleanSy),
    ownerType: 'organization',
    schoolYear: cleanSy,
    organizationId: rawOrgId,
    organizationName: params.organizationName || 'Student Organization',
  };
}

function emptyFundDoc(identity: ReturnType<typeof resolveRetainedBucketIdentity>): RetainedActivityFundDocument {
  return {
    id: identity.bucketId,
    ownerType: identity.ownerType,
    schoolYear: identity.schoolYear || undefined,
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
 * the corresponding School-Year-scoped Retained Activity Fund bucket
 * (`SAO_CAMPUS__SY_<sy>` or `ORG_<id>__SY_<sy>`).
 * Resets to ₱0.00 for each new School Year and never mixes with Miscellaneous Fee configs.
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

  const cleanSy = normalizeRetainedSchoolYear(params.schoolYear || params.identity.schoolYear);
  const ledgerRef = doc(db, RETAINED_FUND_LEDGER_COLLECTION, params.ledgerDocId);
  const bucketRef = doc(db, RETAINED_FUNDS_COLLECTION, params.identity.bucketId);
  const hasScopedId = params.identity.bucketId !== params.identity.baseBucketId;
  const legacyRef = hasScopedId ? doc(db, RETAINED_FUNDS_COLLECTION, params.identity.baseBucketId) : null;

  await runTransaction(db, async (tx) => {
    const existingLedger = await tx.get(ledgerRef);
    if (existingLedger.exists()) {
      return;
    }

    const bucketSnap = await tx.get(bucketRef);
    let current: RetainedActivityFundDocument;
    let shouldMarkLegacyMigrated = false;

    if (bucketSnap.exists()) {
      current = { id: bucketSnap.id, ...(bucketSnap.data() as any) } as RetainedActivityFundDocument;
    } else if (legacyRef && cleanSy) {
      const legacySnap = await tx.get(legacyRef);
      const legacyData = legacySnap.exists() ? (legacySnap.data() as RetainedActivityFundDocument) : null;
      if (legacyData && !legacyData.migratedToSchoolYear) {
        current = {
          ...legacyData,
          id: params.identity.bucketId,
          schoolYear: cleanSy,
        };
        shouldMarkLegacyMigrated = true;
      } else {
        current = emptyFundDoc(params.identity);
      }
    } else {
      current = emptyFundDoc(params.identity);
    }

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

    if (shouldMarkLegacyMigrated && legacyRef) {
      tx.set(
        legacyRef,
        { migratedToSchoolYear: cleanSy, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }

    tx.set(
      bucketRef,
      sanitizeFirestorePayload({
        ...current,
        id: params.identity.bucketId,
        ownerType: params.identity.ownerType,
        schoolYear: cleanSy || current.schoolYear || undefined,
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
      schoolYear: cleanSy || '',
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
  const period = await resolveEffectiveRetainedPeriod({
    schoolYear: params.schoolYear,
    semester: params.semester,
    eventId: params.eventId,
  });

  const identity = resolveRetainedBucketIdentity({
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    schoolYear: period.schoolYear,
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
    schoolYear: period.schoolYear,
    semester: period.semester,
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
  const period = await resolveEffectiveRetainedPeriod({
    schoolYear: params.schoolYear,
    semester: params.semester,
    eventId: params.eventId,
  });

  const identity = resolveRetainedBucketIdentity({
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    schoolYear: period.schoolYear,
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
    schoolYear: period.schoolYear,
    semester: period.semester,
    performedBy: params.performedBy,
  });
}

/**
 * Deducts released Disbursement Voucher funds from the SAS Student Contribution & Retained Fund
 * (`SAO_CAMPUS__SY_<sy>`) whenever SAS disburses an event funded by `student_contributions` or `retained_sao_fund`.
 * Automatically subtracts any amount already deducted on AP approval (`event_${eventId}`) so there is zero double-deduction.
 */
export async function deductRetainedFundOnDisbursement(params: {
  eventId: string;
  eventTitle?: string;
  disbursedAmount: number;
  organizationId?: string | null;
  organizationName?: string | null;
  createdByRole?: string | null;
  schoolYear?: string;
  semester?: string;
  chequeNumber?: string;
  performedBy?: string;
}): Promise<void> {
  const grossDisbursed = Math.max(0, Math.round((Number(params.disbursedAmount) || 0) * 100) / 100);
  if (!params.eventId || grossDisbursed <= 0) return;

  const period = await resolveEffectiveRetainedPeriod({
    schoolYear: params.schoolYear,
    semester: params.semester,
    eventId: params.eventId,
  });

  const identity = resolveRetainedBucketIdentity({
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    createdByRole: params.createdByRole,
    schoolYear: period.schoolYear,
  });

  const disbLedgerId = `disb_${params.eventId}`;
  const disbRef = doc(db, RETAINED_FUND_LEDGER_COLLECTION, disbLedgerId);
  const disbSnap = await getDoc(disbRef);
  if (disbSnap.exists()) return;

  let alreadyApprovedDeducted = 0;
  try {
    const approvalSnap = await getDoc(doc(db, RETAINED_FUND_LEDGER_COLLECTION, `event_${params.eventId}`));
    if (approvalSnap.exists()) {
      alreadyApprovedDeducted = Math.max(0, Number((approvalSnap.data() as any)?.amount) || 0);
    }
  } catch {}

  const remainingToDeduct = Math.max(
    0,
    Math.round((grossDisbursed - alreadyApprovedDeducted) * 100) / 100
  );
  if (remainingToDeduct <= 0.009) return;

  const chequeLabel = params.chequeNumber ? ` (Cheque: ${params.chequeNumber})` : '';
  await postRetainedFundTransaction({
    ledgerDocId: disbLedgerId,
    identity,
    type: 'event_expense_deduction',
    amount: remainingToDeduct,
    deltaBalance: -remainingToDeduct,
    description: `Disbursement Voucher Released – ${params.eventTitle || 'SAS Activity'}${chequeLabel}`,
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    schoolYear: period.schoolYear,
    semester: period.semester,
    performedBy: params.performedBy,
    requireSufficientBalance: false,
  });
}

/**
 * Routes unspent surplus (or overspend deficit) after Financial Liquidation into the appropriate
 * School-Year-scoped Retained Fund Bucket based strictly on creator:
 * - Organization / Club event -> Organization's Treasury / Retained Bucket (`ORG_<orgId>__SY_<sy>`)
 * - SAO / Admin event -> SAO / Campus Student Activity Fund (`SAO_CAMPUS__SY_<sy>`)
 * Never mixes with Miscellaneous Fee buckets and resets cleanly at New School Year.
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
  const period = await resolveEffectiveRetainedPeriod({
    schoolYear: params.schoolYear,
    semester: params.semester,
    eventId: params.eventId,
  });
  const identity = resolveRetainedBucketIdentity({
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    createdByRole: params.createdByRole,
    schoolYear: period.schoolYear,
  });

  await postRetainedFundTransaction({
    ledgerDocId: `surplus_${params.liquidationId}`,
    identity,
    type: isSurplus ? 'liquidation_surplus_retained' : 'liquidation_deficit_deduction',
    amount: absAmount,
    deltaBalance: isSurplus ? absAmount : -absAmount,
    description: isSurplus
      ? `Retained Liquidation Surplus – ${params.eventTitle || 'Event Liquidation'}`
      : `Reimbursed Liquidation Overspend – ${params.eventTitle || 'Event Liquidation'}`,
    eventId: params.eventId,
    eventTitle: params.eventTitle,
    liquidationId: params.liquidationId,
    schoolYear: period.schoolYear,
    semester: period.semester,
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
 * Ensures the SAO Campus Retained Activity Fund doc exists cleanly for a School Year (or legacy singleton).
 */
export async function ensureSaoRetainedBucketExists(schoolYear?: string | null): Promise<void> {
  const cleanSy = normalizeRetainedSchoolYear(schoolYear);
  const bucketId = cleanSy
    ? buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, cleanSy)
    : SAO_RETAINED_BUCKET_ID;
  const ref = doc(db, RETAINED_FUNDS_COLLECTION, bucketId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      sanitizeFirestorePayload({
        id: bucketId,
        ownerType: 'sao',
        schoolYear: cleanSy || undefined,
        organizationName: 'SAO / Campus Student Activity Fund',
        totalContributionsCollected: 0,
        totalSurplusesRetained: 0,
        totalDisbursedOrSpent: 0,
        availableBalance: 0,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  }
}

/**
 *Snapshots legacy/previous School Year Retained Funds & Student Contributions into the closed
 * School Year archive (so old funds are recorded only and never carried forward), and initializes
 * the new School Year's SAO Retained & Student Contribution bucket at ₱0.00.
 */
export async function initializeNewSchoolYearRetainedFunds(
  previousSchoolYear: string | null | undefined,
  newSchoolYear: string,
  performedBy = 'SAS Admin'
): Promise<void> {
  const cleanPrev = normalizeRetainedSchoolYear(previousSchoolYear);
  const cleanNew = normalizeRetainedSchoolYear(newSchoolYear);
  if (!cleanNew) return;

  const batch = writeBatch(db);
  let writeCount = 0;

  if (cleanPrev && cleanPrev !== cleanNew) {
    // Snapshot any unscoped legacy docs (`SAO_CAMPUS` or `ORG_<id>`) into `__SY_${cleanPrev}`
    const fundsSnap = await getDocs(collection(db, RETAINED_FUNDS_COLLECTION));
    for (const d of fundsSnap.docs) {
      const data = d.data() as RetainedActivityFundDocument;
      if (!d.id.includes('__SY_') && !data.migratedToSchoolYear) {
        const scopedPrevId = buildScopedRetainedBucketId(d.id, cleanPrev);
        const scopedPrevRef = doc(db, RETAINED_FUNDS_COLLECTION, scopedPrevId);
        batch.set(
          scopedPrevRef,
          sanitizeFirestorePayload({
            ...data,
            id: scopedPrevId,
            schoolYear: cleanPrev,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
        batch.set(
          doc(db, RETAINED_FUNDS_COLLECTION, d.id),
          { migratedToSchoolYear: cleanPrev, updatedAt: serverTimestamp() },
          { merge: true }
        );
        writeCount += 2;
      }
    }

    // Tag any untagged ledger entries with the closing School Year
    const ledgerSnap = await getDocs(collection(db, RETAINED_FUND_LEDGER_COLLECTION));
    for (const d of ledgerSnap.docs) {
      const entry = d.data() as RetainedFundLedgerEntry;
      if (!entry.schoolYear) {
        batch.set(
          doc(db, RETAINED_FUND_LEDGER_COLLECTION, d.id),
          { schoolYear: cleanPrev },
          { merge: true }
        );
        writeCount++;
      }
    }
  }

  // Explicitly create the new School Year's SAO Retained bucket at ₱0.00
  const newSaoBucketId = buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, cleanNew);
  batch.set(
    doc(db, RETAINED_FUNDS_COLLECTION, newSaoBucketId),
    sanitizeFirestorePayload({
      id: newSaoBucketId,
      ownerType: 'sao',
      schoolYear: cleanNew,
      organizationName: 'SAO / Campus Student Activity Fund',
      totalContributionsCollected: 0,
      totalSurplusesRetained: 0,
      totalDisbursedOrSpent: 0,
      availableBalance: 0,
      updatedBy: performedBy,
      updatedAt: serverTimestamp(),
    })
  );
  writeCount++;

  if (writeCount > 0) {
    await batch.commit();
  }
}
