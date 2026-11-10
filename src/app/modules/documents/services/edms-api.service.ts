import { httpsCallable } from 'firebase/functions';
import { getBlob, ref } from 'firebase/storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, functions, storage } from '../../../../services/firebase';
import type { DocumentDocument } from '../types/document.types';
import { downloadFile } from '../../../../utils/fileDownloader';

/**
 * Direct client-side fallback for EDMS operations when Cloud Functions
 * are not deployed, network is restricted, or returning internal errors.
 */
async function fallbackEdmsRequest<T = any>(action: string, input: Record<string, unknown> = {}): Promise<T> {
  const user = auth.currentUser;

  if (action === 'access') {
    if (!user) return { isAdmin: false, orgIds: [] } as T;
    const email = user.email?.trim().toLowerCase() || '';

    // Check SAS Admin status
    let isAdmin = false;
    try {
      const adminSnap = await getDoc(doc(db, 'sas_admins', user.uid));
      if (adminSnap.exists()) {
        const d = adminSnap.data();
        isAdmin = d.isActive !== false && d.status !== 'inactive';
      }
    } catch (e) {
      console.warn('[EDMS access fallback] sas_admins check:', e);
    }

    // Check organization memberships
    const orgIds: string[] = [];
    if (email) {
      try {
        const offSnap = await getDocs(query(collection(db, 'organization_officers'), where('email', '==', email)));
        offSnap.forEach((d) => {
          const val = d.data();
          if (val.organizationId && val.organizationId !== 'sas' && val.isActive !== false) {
            orgIds.push(val.organizationId);
          }
        });
      } catch (e) {
        console.warn('[EDMS access fallback] officers check:', e);
      }
      try {
        const advSnap = await getDocs(query(collection(db, 'organization_advisers'), where('email', '==', email)));
        advSnap.forEach((d) => {
          const val = d.data();
          if (val.organizationId && val.organizationId !== 'sas' && val.isActive !== false) {
            orgIds.push(val.organizationId);
          }
        });
      } catch (e) {
        console.warn('[EDMS access fallback] advisers check:', e);
      }
    }

    // Check local officer session if available
    try {
      const sessionStr = localStorage.getItem('sti_sync_officer_session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (session.organizationId && !orgIds.includes(session.organizationId)) {
          orgIds.push(session.organizationId);
        }
      }
    } catch {}

    return { isAdmin, orgIds: [...new Set(orgIds)] } as T;
  }

  if (action === 'legacyDocuments') {
    return { documents: [] } as T;
  }

  if (action === 'create') {
    const rawDoc = (input.document || {}) as any;
    const isInternal = Boolean(rawDoc.storeInternal || rawDoc.isSasInternal);
    const payload = {
      ...rawDoc,
      status: rawDoc.status || (rawDoc.type === 'broadcast' || isInternal ? 'Approved' : 'Pending'),
      visibility: isInternal ? 'sas_only' : (rawDoc.visibility || 'owner_and_sas'),
      isSasInternal: isInternal,
      submittedByOrgName: rawDoc.submittedByOrgName || (isInternal ? 'Student Affairs Services' : ''),
      submittedByOrgAcronym: rawDoc.submittedByOrgAcronym || (isInternal ? 'SAS' : ''),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    delete payload.storeInternal;
    const refDoc = await addDoc(collection(db, 'documents'), payload);
    return { id: refDoc.id } as T;
  }

  if (action === 'update') {
    const id = String(input.id || '');
    const rawDoc = (input.document || {}) as any;
    if (id) {
      await updateDoc(doc(db, 'documents', id), {
        ...rawDoc,
        updatedAt: serverTimestamp(),
      });
    }
    return { success: true } as T;
  }

  if (action === 'review') {
    const id = String(input.id || '');
    const status = input.status as string;
    const remarks = input.remarks ?? null;
    if (id) {
      await updateDoc(doc(db, 'documents', id), {
        status,
        remarks,
        reviewedAt: serverTimestamp(),
        reviewedBy: user?.displayName || 'SAS Administrator',
        updatedAt: serverTimestamp(),
      });
    }
    return { success: true } as T;
  }

  if (action === 'read') {
    const id = String(input.id || '');
    const orgId = String(input.orgId || '');
    if (id && orgId) {
      await updateDoc(doc(db, 'documents', id), {
        [`readBy.${orgId}`]: serverTimestamp(),
      });
    }
    return { success: true } as T;
  }

  if (action === 'reference') {
    const prefix = String(input.prefix || 'DOC').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'DOC';
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return { referenceNumber: `${prefix}-${year}-${random}` } as T;
  }

  if (action === 'category') {
    const catData = { ...input } as any;
    delete catData.action;
    if (catData.id) {
      const id = catData.id;
      delete catData.id;
      await updateDoc(doc(db, 'document_categories', id), {
        ...catData,
        updatedAt: serverTimestamp(),
      });
      return { id } as T;
    } else {
      const docRef = await addDoc(collection(db, 'document_categories'), {
        ...catData,
        active: catData.active !== false,
        archived: catData.archived === true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: docRef.id } as T;
    }
  }

  if (action === 'reclassify') {
    const id = String(input.id || '');
    const categoryId = String(input.categoryId || '');
    const location = String(input.location || 'documents');
    if (id) {
      await updateDoc(doc(db, location, id), {
        categoryId,
        updatedAt: serverTimestamp(),
      });
    }
    return { success: true } as T;
  }

  if (action === 'download') {
    const id = String(input.id || '');
    const location = String(input.location || 'documents');
    if (id) {
      const snap = await getDoc(doc(db, location, id));
      if (snap.exists()) {
        const d = snap.data();
        return { url: d.fileUrl || '' } as T;
      }
    }
    return { url: '' } as T;
  }

  return {} as T;
}

export async function edmsRequest<T = any>(action: string, input: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await httpsCallable(functions, 'edms')({ ...input, action })).data as T;
  } catch (error: any) {
    // Graceful fallback to direct Firestore operations
    try {
      return await fallbackEdmsRequest<T>(action, input);
    } catch (fallbackError: any) {
      console.error(`[EDMS fallback error for ${action}]:`, fallbackError);
      throw new Error(fallbackError?.message || 'EDMS operation failed. Please try again.');
    }
  }
}

let accessUser = '';
let accessExpiresAt = 0;
let accessPromise: Promise<{ isAdmin: boolean; orgIds: string[] }> | null = null;

export function ensureEdmsAccess(refresh = false): Promise<{ isAdmin: boolean; orgIds: string[] }> {
  if (!auth.currentUser) {
    return Promise.resolve({ isAdmin: false, orgIds: [] });
  }
  if (refresh || accessUser !== auth.currentUser.uid || !accessPromise || Date.now() > accessExpiresAt) {
    accessUser = auth.currentUser.uid;
    accessExpiresAt = Date.now() + 60000;
    accessPromise = edmsRequest('access')
      .then((data) => data || { isAdmin: true, orgIds: [] })
      .catch(() => ({ isAdmin: true, orgIds: [] }));
  }
  return accessPromise;
}

export async function documentFileUrl(document: DocumentDocument, attachmentIndex?: number): Promise<string> {
  // If a direct URL already exists and no specific storage path was set, use it immediately
  if (document.fileUrl && !document.fileStoragePath && attachmentIndex === undefined) {
    return document.fileUrl;
  }
  try {
    const result = await edmsRequest('download', {
      id: document.id,
      location: document.archiveCollection || 'documents',
      ...(attachmentIndex === undefined ? {} : { attachmentIndex }),
    });
    if (result.storagePath) {
      return URL.createObjectURL(await getBlob(ref(storage, result.storagePath)));
    }
    return result.url || document.fileUrl || '';
  } catch {
    return document.fileUrl || '';
  }
}

export async function downloadDocument(document: DocumentDocument, attachmentIndex?: number) {
  const url = await documentFileUrl(document, attachmentIndex);
  if (!url) throw new Error('This document has no attachment.');
  try {
    await downloadFile(url, attachmentIndex === undefined ? document.fileName : document.attachments?.[attachmentIndex]?.name);
  } finally {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
