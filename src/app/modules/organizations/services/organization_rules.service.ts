import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationRulesDocument } from '../types/organization.types';

const COLLECTION_NAME = 'system_settings';
const DOC_ID = 'organization_rules';

export const getOrganizationRules = async (): Promise<OrganizationRulesDocument | null> => {
  const docRef = doc(db, COLLECTION_NAME, DOC_ID);
  const snapshot = await getDoc(docRef);
  if (snapshot.exists()) {
    return snapshot.data() as OrganizationRulesDocument;
  }
  return null;
};

export const updateOrganizationRules = async (data: Omit<OrganizationRulesDocument, 'updatedAt'>) => {
  const docRef = doc(db, COLLECTION_NAME, DOC_ID);
  const payload = {
    ...data,
    updatedAt: serverTimestamp()
  };
  // use setDoc with merge to create if it doesn't exist, update if it does
  await setDoc(docRef, payload, { merge: true });
};
