import {
  collection,
  addDoc,
  getDocs,
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
  const budgetAmount = Number(eventData.totalApprovedBudget || eventData.allocatedBudget) || 0;
  if (budgetAmount <= 0) return null;

  const isSasAdminEvent =
    !eventData.hostingOrgId ||
    eventData.hostingOrgId === 'sas_admin' ||
    eventData.hostingOrgId === 'sas' ||
    eventData.hostingOrgId === 'sao_admin' ||
    eventData.hostingOrgId === 'sao' ||
    eventData.isOfficerProposal === false;

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
      organizationId: eventData.hostingOrgId,
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
    return docRef.id;
  }
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

