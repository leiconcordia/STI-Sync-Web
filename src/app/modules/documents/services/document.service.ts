import type { DocumentDocument } from '../types/document.types';
import { createNotification } from '../../notifications';
import { edmsRequest } from './edms-api.service';
export const DOCUMENTS_COLLECTION = 'documents';

export async function createDocument(data: Omit<DocumentDocument, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const { id } = await edmsRequest('create', { document: data });
  if (data.type === 'submission') {
    createNotification({ recipientRole: 'admin', type: 'document_submission', category: 'incoming_document', title: `Document Submitted: ${data.title}`, message: `${data.submittedByOrgName || 'Student Organization'} submitted "${data.title}" for SAS review.`, resourceId: id, resourceType: 'document', actionRoute: `/home/documents/${id}/review`, targetOrgId: data.submittedByOrgId, targetOrgName: data.submittedByOrgName, senderName: data.submittedBy }).catch(console.error);
  }
  return id;
}
export async function updateDocument(id: string, data: Partial<Omit<DocumentDocument, 'id' | 'createdAt'>>): Promise<void> {
  await edmsRequest('update', { id, document: data });
}
export async function reviewDocument(id: string, status: 'Approved' | 'Rejected' | 'Returned', _reviewedBy: string, remarks: string | null): Promise<void> {
  await edmsRequest('review', { id, status, remarks });
}
export async function markDocumentRead(docId: string, orgId: string): Promise<void> {
  await edmsRequest('read', { id: docId, orgId });
}
export async function getNextReferenceNumber(prefix: string): Promise<string> {
  return (await edmsRequest('reference', { prefix })).referenceNumber;
}
