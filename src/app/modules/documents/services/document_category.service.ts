import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { DocumentCategoryDocument } from '../types/document.types';
import { edmsRequest } from './edms-api.service';
export async function getDocumentCategories(): Promise<DocumentCategoryDocument[]> {
  const snapshot = await getDocs(query(collection(db, 'document_categories'), orderBy('sortOrder', 'asc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DocumentCategoryDocument));
}
export async function createDocumentCategory(data: Omit<DocumentCategoryDocument, 'id' | 'createdAt' | 'updatedAt'>) {
  return (await edmsRequest('category', data)).id as string;
}
export async function updateDocumentCategory(id: string, data: Partial<Omit<DocumentCategoryDocument, 'id' | 'createdAt' | 'updatedAt'>>) {
  await edmsRequest('category', { ...data, id });
}
export async function deleteDocumentCategory(id: string) {
  await edmsRequest('category', { id, active: false, archived: true });
}
