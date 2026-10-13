import { collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { DocumentCategoryDocument } from '../types/document.types';

const COLLECTION_NAME = 'document_categories';

export const STANDARD_DOCUMENT_CATEGORIES: Omit<DocumentCategoryDocument, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Activity Proposal / Event Permit',
    color: 'bg-indigo-50 text-indigo-700',
    colorDot: 'bg-indigo-600',
    requiresRemarks: false,
    officerCanSubmit: true,
    active: true,
    sortOrder: 0,
    archived: false,
  },
  {
    name: 'Annual Accreditation Portfolio',
    color: 'bg-blue-100 text-blue-700',
    colorDot: 'bg-blue-600',
    requiresRemarks: true,
    officerCanSubmit: true,
    active: true,
    sortOrder: 1,
    archived: false,
  },
  {
    name: 'Parental Consent & Waivers',
    color: 'bg-amber-100 text-amber-700',
    colorDot: 'bg-amber-500',
    requiresRemarks: true,
    officerCanSubmit: true,
    active: true,
    sortOrder: 2,
    archived: false,
  },
  {
    name: 'Financial Liquidation Report',
    color: 'bg-green-100 text-green-700',
    colorDot: 'bg-green-600',
    requiresRemarks: true,
    officerCanSubmit: true,
    active: true,
    sortOrder: 3,
    archived: false,
  },
  {
    name: 'Certificate Requisition',
    color: 'bg-teal-100 text-teal-700',
    colorDot: 'bg-teal-600',
    requiresRemarks: false,
    officerCanSubmit: true,
    active: true,
    sortOrder: 4,
    archived: false,
  },
  {
    name: 'Official Memorandum & Circular',
    color: 'bg-gray-100 text-gray-700',
    colorDot: 'bg-gray-500',
    requiresRemarks: false,
    officerCanSubmit: false,
    active: true,
    sortOrder: 5,
    archived: false,
  },
  {
    name: 'Standard Downloadable Template',
    color: 'bg-[#001A4D]/10 text-[#001A4D]',
    colorDot: 'bg-[#001A4D]',
    requiresRemarks: false,
    officerCanSubmit: false,
    active: true,
    sortOrder: 6,
    archived: false,
  },
  {
    name: 'Policy & Guidelines Handbook',
    color: 'bg-[#0E4EBD]/10 text-[#0E4EBD]',
    colorDot: 'bg-[#0E4EBD]',
    requiresRemarks: false,
    officerCanSubmit: false,
    active: true,
    sortOrder: 7,
    archived: false,
  },
  {
    name: 'Special Petition / Endorsement',
    color: 'bg-purple-100 text-purple-700',
    colorDot: 'bg-purple-600',
    requiresRemarks: true,
    officerCanSubmit: true,
    active: true,
    sortOrder: 8,
    archived: false,
  },
];

export const seedStandardCategories = async (force: boolean = false): Promise<number> => {
  const colRef = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(colRef);
  if (!force && !snapshot.empty) {
    return 0;
  }

  const batch = writeBatch(db);
  const now = serverTimestamp();

  STANDARD_DOCUMENT_CATEGORIES.forEach((cat) => {
    const newDoc = doc(colRef);
    batch.set(newDoc, {
      ...cat,
      createdAt: now,
      updatedAt: now,
    });
  });

  await batch.commit();
  return STANDARD_DOCUMENT_CATEGORIES.length;
};

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
