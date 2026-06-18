import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { SaoLedgerDocument, OrgLedgerDocument } from '../types/finance.types';

export const SAO_LEDGER_COLLECTION = 'sao_ledger';

/**
 * Adds a new transaction to the SAO school budget ledger.
 */
export async function addLedgerTransaction(data: Omit<SaoLedgerDocument, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'sao_ledger'), {
    ...data,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

/**
 * Adds a new transaction to a specific organization's budget ledger.
 */
export async function addOrgLedgerTransaction(data: Omit<OrgLedgerDocument, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'organization_ledger'), {
    ...data,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}
