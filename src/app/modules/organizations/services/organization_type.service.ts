import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationTypeDocument } from '../types/organization.types';

const COLLECTION_NAME = 'organization_types';

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
  const payload = {
    ...data,
    updatedAt: serverTimestamp()
  };
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, payload);
};

export const deleteOrganizationType = async (id: string) => {
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
};
