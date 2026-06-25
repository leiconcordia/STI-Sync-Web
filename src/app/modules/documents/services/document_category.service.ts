import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { DocumentCategoryDocument } from '../types/document.types';

const COLLECTION_NAME = 'document_categories';

export const getDocumentCategories = async (): Promise<DocumentCategoryDocument[]> => {
  const q = query(collection(db, COLLECTION_NAME), orderBy('sortOrder', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as DocumentCategoryDocument[];
};

export const createDocumentCategory = async (
  data: Omit<DocumentCategoryDocument, 'id' | 'createdAt' | 'updatedAt'>
) => {
  const payload = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, COLLECTION_NAME), payload);
  return docRef.id;
};

export const updateDocumentCategory = async (
  id: string,
  data: Partial<Omit<DocumentCategoryDocument, 'id' | 'createdAt' | 'updatedAt'>>
) => {
  const payload = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, payload);
};

export const deleteDocumentCategory = async (id: string) => {
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
};
