import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationTypeDocument } from '../types/organization.types';
import { validateOrgTypeArchival } from '../utils/org-type-quota.utils';

const COLLECTION_NAME = 'organization_types';
const ORGANIZATIONS_COLLECTION = 'organizations';

function isFirestoreQuotaError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return code === 'resource-exhausted' || msg.includes('quota exceeded') || msg.includes('resource-exhausted');
}

async function assertOrgTypeNotInUseByActiveClubs(typeId: string): Promise<void> {
  let orgTypeName = '';
  try {
    const typeRef = doc(db, COLLECTION_NAME, typeId);
    const typeSnap = await getDoc(typeRef).catch((err) =>
      isFirestoreQuotaError(err) ? getDocFromCache(typeRef) : Promise.reject(err)
    );
    if (typeSnap.exists()) {
      orgTypeName = String((typeSnap.data() as any)?.name || '');
    }
  } catch {}

  const orgsRef = collection(db, ORGANIZATIONS_COLLECTION);
  const orgsSnap = await getDocs(orgsRef).catch((err) =>
    isFirestoreQuotaError(err) ? getDocsFromCache(orgsRef) : Promise.reject(err)
  );
  const allOrganizations = orgsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));

  const validation = validateOrgTypeArchival({
    orgTypeId: typeId,
    orgTypeName,
    allOrganizations,
  });

  if (!validation.allowed) {
    throw new Error(
      validation.reason ||
        'Cannot archive this organization classification while active clubs are still using it.'
    );
  }
}

export const getOrganizationTypes = async (): Promise<OrganizationTypeDocument[]> => {
  const q = query(collection(db, COLLECTION_NAME));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as OrganizationTypeDocument[];
};

export const createOrganizationType = async (data: Omit<OrganizationTypeDocument, 'id' | 'createdAt' | 'updatedAt'>) => {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const docRef = await addDoc(collection(db, COLLECTION_NAME), payload);
  return docRef.id;
};

export const updateOrganizationType = async (id: string, data: Partial<Omit<OrganizationTypeDocument, 'id' | 'createdAt' | 'updatedAt'>>) => {
  if (data.archived === true) {
    await assertOrgTypeNotInUseByActiveClubs(id);
  }
  const payload = {
    ...data,
    updatedAt: serverTimestamp()
  };
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, payload);
};

export const deleteOrganizationType = async (id: string) => {
  await assertOrgTypeNotInUseByActiveClubs(id);
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
};
