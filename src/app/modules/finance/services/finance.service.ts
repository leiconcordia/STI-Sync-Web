import {
  collection,
  addDoc,
  getDocs,
  getDocsFromCache,
  query,
  where,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { SaoLedgerDocument, OrgLedgerDocument } from '../types/finance.types';

export const SAO_LEDGER_COLLECTION = 'sao_ledger';
export const ORG_LEDGER_COLLECTION = 'organization_ledger';

/**
 * Helper to strip undefined values so Firestore addDoc never throws Unsupported field value: undefined
 */
function cleanUndefined<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Adds a new transaction to the SAO school budget ledger.
 */
export async function addLedgerTransaction(data: Omit<SaoLedgerDocument, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'sao_ledger'), {
    ...cleanUndefined(data),
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

/**
 * Adds a new transaction to a specific organization's budget ledger.
 */
export async function addOrgLedgerTransaction(data: Omit<OrgLedgerDocument, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'organization_ledger'), {
    ...cleanUndefined(data),
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

/**
 * Deducts the approved event budget from the appropriate ledger:
 * - Admin / Institutional Event -> Deduct from /sao_ledger (SAO Institutional Budget)
 * - Officer / Club Event -> Deduct from /organization_ledger (Club Treasury)
 * 
 * Includes duplicate protection (checks if event_budget deduction already exists for this eventId).
 */
export async function deductApprovedEventBudget(
  eventData: any,
  eventId: string,
  adminUserId?: string
): Promise<string | null> {
  if (!eventData || typeof eventData !== 'object' || !eventId) return null;
  if (eventData.fundingSource === 'zero_budget') return null;

  const budgetAmount =
    Number(eventData.totalApprovedBudget) ||
    Number(eventData.allocatedBudget) ||
    Number(eventData.financialProjections?.totalExpenses) ||
    Number(eventData.budget) ||
    0;
  if (budgetAmount <= 0) return null;

  const rawOrgId = String(
    eventData.hostingOrgId ||
    eventData.organizationId ||
    eventData.submittedByOrgId ||
    eventData.orgId ||
    ''
  ).trim();
  const isSasSentinel = !rawOrgId || ['sas_admin', 'sas', 'sao_admin', 'sao', 'admin', 'institutional'].includes(rawOrgId.toLowerCase());
  const isSasAdminEvent =
    eventData.fundingSource === 'organization_funds' && !isSasSentinel
      ? false
      : (isSasSentinel || eventData.isOfficerProposal === false);

  const eventTitle = eventData.title || eventData.name || 'Approved Event';
  const semesterId = eventData.semesterId || null;

  if (isSasAdminEvent) {
    // 1. Check if deduction for this eventId already exists in sao_ledger
    const saoLedgerRef = collection(db, 'sao_ledger');
    const qDup = query(
      saoLedgerRef,
      where('eventId', '==', eventId),
      where('source', '==', 'event_budget')
    );
    const existingSnap = await getDocs(qDup);
    if (!existingSnap.empty) {
      console.log(`[deductApprovedEventBudget] Budget for SAO event ${eventId} already deducted. Skipping duplicate.`);
      return existingSnap.docs[0].id;
    }

    const docRef = await addDoc(saoLedgerRef, {
      semesterId,
      date: Timestamp.now(),
      description: `Approved Event Budget – ${eventTitle}`,
      eventId,
      type: 'expense' as const,
      source: 'event_budget' as const,
      amount: budgetAmount,
      addedBy: adminUserId || 'SAO Approval',
      createdAt: serverTimestamp(),
    });

    if (eventData.fundingSource === 'retained_sao_fund') {
      try {
        const { deductRetainedFundOnProposalApproval } = await import('./retained-fund.service');
        await deductRetainedFundOnProposalApproval({
          eventId,
          eventTitle,
          amount: budgetAmount,
          organizationId: 'sas',
          schoolYear: eventData.schoolYear,
          semester: eventData.semester,
          performedBy: adminUserId || 'SAO Approval',
        });
      } catch (err) {
        console.warn('[deductApprovedEventBudget] Retained SAO fund deduction warning:', err);
      }
    }
    return docRef.id;
  } else {
    // 2. Check if deduction for this eventId already exists in organization_ledger
    const orgLedgerRef = collection(db, 'organization_ledger');
    const qDup = query(
      orgLedgerRef,
      where('eventId', '==', eventId),
      where('source', '==', 'event_budget')
    );
    const existingSnap = await getDocs(qDup);
    if (!existingSnap.empty) {
      console.log(`[deductApprovedEventBudget] Budget for Org event ${eventId} already deducted. Skipping duplicate.`);
      return existingSnap.docs[0].id;
    }

    const docRef = await addDoc(orgLedgerRef, {
      organizationId: rawOrgId,
      semesterId,
      date: Timestamp.now(),
      description: `Approved Event Budget – ${eventTitle}`,
      eventId,
      type: 'expense' as const,
      source: 'event_budget' as const,
      amount: budgetAmount,
      addedBy: adminUserId || 'SAO Approval',
      createdAt: serverTimestamp(),
    });

    try {
      const { deductRetainedFundOnProposalApproval } = await import('./retained-fund.service');
      await deductRetainedFundOnProposalApproval({
        eventId,
        eventTitle,
        amount: budgetAmount,
        organizationId: rawOrgId,
        organizationName: eventData.organizationName,
        schoolYear: eventData.schoolYear,
        semester: eventData.semester,
        performedBy: adminUserId || 'SAO Approval',
      });
    } catch (err) {
      console.warn('[deductApprovedEventBudget] Retained Org fund deduction warning:', err);
    }
    return docRef.id;
  }
}

/**
 * Idempotently deducts an approved Supplemental Budget Request (SBR) delta from
 * `organization_ledger` (Club Treasury) or `sao_ledger` (SAO Institutional Budget).
 * Keyed by `sbrId` + `source: 'supplemental_budget'` so it never collides with the parent event budget.
 */
export async function deductSupplementalBudget(params: {
  sbrId: string;
  referenceCode: string;
  eventId: string;
  eventTitle: string;
  organizationId: string;
  organizationName?: string;
  isSasInstitutional: boolean;
  amount: number;
  semesterId?: string | null;
  schoolYear?: string;
  semester?: string;
  performedBy?: string;
}): Promise<string | null> {
  const amount = Math.max(0, Math.round((Number(params.amount) || 0) * 100) / 100);
  if (!params.sbrId || !params.eventId || amount <= 0) return null;

  const targetColName = params.isSasInstitutional ? SAO_LEDGER_COLLECTION : ORG_LEDGER_COLLECTION;
  const ledgerRef = collection(db, targetColName);
  const qDup = query(
    ledgerRef,
    where('sbrId', '==', params.sbrId),
    where('source', '==', 'supplemental_budget')
  );
  let existingSnap;
  try {
    existingSnap = await getDocs(qDup);
  } catch (err: any) {
    const code = String(err?.code || '').toLowerCase();
    const msg = String(err?.message || '').toLowerCase();
    if (code === 'resource-exhausted' || msg.includes('quota exceeded')) {
      existingSnap = await getDocsFromCache(qDup);
    } else {
      throw err;
    }
  }
  if (!existingSnap.empty) {
    return existingSnap.docs[0].id;
  }

  const description = `Supplemental Budget (${params.referenceCode}) – ${params.eventTitle}`;
  const docPayload: Record<string, any> = {
    semesterId: params.semesterId || null,
    date: Timestamp.now(),
    description,
    eventId: params.eventId,
    sbrId: params.sbrId,
    type: 'expense' as const,
    source: 'supplemental_budget' as const,
    amount,
    addedBy: params.performedBy || 'SAS Approval',
    createdAt: serverTimestamp(),
  };

  if (!params.isSasInstitutional) {
    docPayload.organizationId = params.organizationId;
  }

  const docRef = await addDoc(ledgerRef, cleanUndefined(docPayload));

  // Also keep Org Retained Fund mirror synced when Club Treasury deducts
  if (!params.isSasInstitutional && params.organizationId) {
    try {
      const { deductRetainedFundOnProposalApproval } = await import('./retained-fund.service');
      await deductRetainedFundOnProposalApproval({
        eventId: params.eventId,
        eventTitle: `${params.eventTitle} (Supplemental ${params.referenceCode})`,
        amount,
        organizationId: params.organizationId,
        organizationName: params.organizationName,
        schoolYear: params.schoolYear,
        semester: params.semester,
        performedBy: params.performedBy || 'SAS Approval',
        ledgerDocIdOverride: `sbr_${params.sbrId}`,
      });
    } catch (err) {
      console.warn('[deductSupplementalBudget] Retained Org fund mirror warning:', err);
    }
  }

  return docRef.id;
}

/**
 * Completely purges and rolls back all ledger entries related to a specific liquidation.
 * Searches both /organization_ledger and /sao_ledger by collectionId == liquidationId.
 */
export async function removeLedgerTransactionsForLiquidation(liquidationId: string): Promise<number> {
  if (!liquidationId) return 0;
  let deletedCount = 0;
  const batch = writeBatch(db);

  try {
    // 1. Purge from organization_ledger
    const orgQuery = query(collection(db, ORG_LEDGER_COLLECTION), where('collectionId', '==', liquidationId));
    const orgSnap = await getDocs(orgQuery);
    orgSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      deletedCount++;
    });

    // 2. Purge from sao_ledger
    const saoQuery = query(collection(db, SAO_LEDGER_COLLECTION), where('collectionId', '==', liquidationId));
    const saoSnap = await getDocs(saoQuery);
    saoSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      deletedCount++;
    });

    if (deletedCount > 0) {
      await batch.commit();
      console.log(`[removeLedgerTransactionsForLiquidation] Successfully purged ${deletedCount} ledger entries for liquidation ${liquidationId}`);
    }
  } catch (err) {
    console.error(`[removeLedgerTransactionsForLiquidation] Error rolling back ledger for liquidation ${liquidationId}:`, err);
    throw err;
  }

  return deletedCount;
}

/**
 * Completely purges and rolls back all ledger entries related to a specific event.
 * Searches both /organization_ledger and /sao_ledger by eventId == eventId.
 */
export async function removeLedgerTransactionsForEvent(eventId: string): Promise<number> {
  if (!eventId) return 0;
  let deletedCount = 0;
  const batch = writeBatch(db);

  try {
    // 1. Purge from organization_ledger
    const orgQuery = query(collection(db, ORG_LEDGER_COLLECTION), where('eventId', '==', eventId));
    const orgSnap = await getDocs(orgQuery);
    orgSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      deletedCount++;
    });

    // 2. Purge from sao_ledger
    const saoQuery = query(collection(db, SAO_LEDGER_COLLECTION), where('eventId', '==', eventId));
    const saoSnap = await getDocs(saoQuery);
    saoSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      deletedCount++;
    });

    if (deletedCount > 0) {
      await batch.commit();
      console.log(`[removeLedgerTransactionsForEvent] Successfully purged ${deletedCount} ledger entries for event ${eventId}`);
    }
  } catch (err) {
    console.error(`[removeLedgerTransactionsForEvent] Error rolling back ledger for event ${eventId}:`, err);
    throw err;
  }

  return deletedCount;
}

