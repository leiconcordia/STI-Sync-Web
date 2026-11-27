import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationRulesDocument } from '../types/organization.types';
import type { LightweightMembershipRecord } from '../utils/org-type-quota.utils';

const COLLECTION_NAME = 'system_settings';
const DOC_ID = 'organization_rules';
const MEMBERS_COLLECTION = 'organization_members';

function isFirestoreQuotaError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return code === 'resource-exhausted' || msg.includes('quota exceeded') || msg.includes('resource-exhausted');
}

export const getOrganizationRules = async (): Promise<OrganizationRulesDocument | null> => {
  const docRef = doc(db, COLLECTION_NAME, DOC_ID);
  let snapshot;
  try {
    snapshot = await getDoc(docRef);
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      snapshot = await getDocFromCache(docRef);
    } else {
      throw err;
    }
  }
  if (snapshot.exists()) {
    return snapshot.data() as OrganizationRulesDocument;
  }
  return null;
};

export const updateOrganizationRules = async (
  data: Partial<Omit<OrganizationRulesDocument, 'updatedAt'>>
) => {
  const docRef = doc(db, COLLECTION_NAME, DOC_ID);
  const payload = {
    ...data,
    updatedAt: serverTimestamp()
  };
  // use setDoc with merge to create if it doesn't exist, update if it does
  await setDoc(docRef, payload, { merge: true });
};

/**
 * Fetches lightweight active membership records to preview policy-change impact
 * before saving a lowered Global or Per-Organization-Type membership cap.
 */
export const fetchAllMembershipsForLimitImpact = async (): Promise<LightweightMembershipRecord[]> => {
  const colRef = collection(db, MEMBERS_COLLECTION);
  let snap;
  try {
    snap = await getDocs(colRef);
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      snap = await getDocsFromCache(colRef);
    } else {
      throw err;
    }
  }
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      studentId: data.studentId || '',
      authUid: data.authUid || '',
      studentName: data.studentName || data.fullName || data.name || '',
      organizationId: data.organizationId || '',
      status: data.status || '',
    };
  });
};
