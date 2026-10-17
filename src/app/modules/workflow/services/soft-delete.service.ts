/**
 * src/app/modules/workflow/services/soft-delete.service.ts
 *
 * Universal Soft Deletion, Restoration, and Audit Archiving service for STI Sync.
 * Covers Activity Proposals (activities / activity_proposals), Financial Liquidations (liquidations),
 * Post-Activity Reports (post_activity_reports), and Events (events).
 *
 * POLICY NOTE:
 * - NO 30-day auto-purge rules.
 * - Soft-deleted documents remain safely preserved in the Trash indefinitely until explicitly restored.
 * - Approved or active signatory pipeline documents are strictly protected against deletion.
 */

import {
  doc,
  collection,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { SoftDeletable } from '../types/approval.types';

export type SoftDeletableCollection =
  | 'activities'
  | 'activity_proposals'
  | 'liquidations'
  | 'post_activity_reports'
  | 'events';

export interface TrashRecordMetadata {
  id: string;
  collectionName: SoftDeletableCollection;
  title: string;
  referenceNo?: string;
  organizationId?: string;
  organizationName?: string;
  status: string;
  deletedAt: any;
  deletedByName?: string;
  deletedByRole?: string;
  deletedReason?: string;
  data: any;
}

/**
 * Moves a draft or unsubmitted document into the Trash repository.
 * Enforces strict security guards against deleting approved, cleared, or under-review records.
 */
export async function softDeleteDocument(
  collectionName: SoftDeletableCollection,
  docId: string,
  user: { uid: string; name: string; role?: string },
  reason?: string
): Promise<void> {
  if (!docId) throw new Error('Document ID is required.');
  const docRef = doc(db, collectionName, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error(`Document not found in ${collectionName}.`);

  const data = snap.data();
  const status = (data.status || data.lifecycleStatus || '').toLowerCase().trim();

  // Guard 1: Never delete approved or concluded documents
  if (status === 'approved' || status === 'completed') {
    throw new Error(
      'Approved institutional documents cannot be deleted. They must be preserved and archived in the EDMS repository.'
    );
  }

  // Guard 2: Never delete documents in active review pipeline
  if (status === 'under_review' || status === 'pending') {
    throw new Error(
      'This document is currently undergoing official institutional review. Please withdraw it to draft status before discarding.'
    );
  }

  const payload: SoftDeletable & { updatedAt: any } = {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedByUid: user.uid,
    deletedByName: user.name,
    deletedByRole: user.role || 'Officer',
    deletedReason: reason || 'Draft discarded by author',
    updatedAt: serverTimestamp(),
  };

  await updateDoc(docRef, payload as any);

  // If this is an event/activity, also sync the associated mirrored collection if applicable
  if (collectionName === 'activities') {
    try {
      const eventRef = doc(db, 'events', docId);
      const evSnap = await getDoc(eventRef);
      if (evSnap.exists()) {
        await updateDoc(eventRef, payload as any);
      }
    } catch (e) {
      console.warn('[softDeleteDocument] Mirror sync note:', e);
    }
  } else if (collectionName === 'events') {
    try {
      const actRef = doc(db, 'activities', docId);
      const actSnap = await getDoc(actRef);
      if (actSnap.exists()) {
        await updateDoc(actRef, payload as any);
      }
    } catch (e) {
      console.warn('[softDeleteDocument] Mirror sync note:', e);
    }
  }

  // 1:1:1 Invariant Unlinking: If soft-deleting a liquidation, reset parent event references across both collections
  if (collectionName === 'liquidations' && data.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const evRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(evRef);
        if (evSnap.exists()) {
          await updateDoc(evRef, {
            liquidationStatus: null,
            liquidationReportId: null,
            liquidationRefNumber: null,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {
      console.warn('[softDeleteDocument] Liquidation event unlink note:', e);
    }
  }

  // 1:1:1 Invariant Unlinking: If soft-deleting a PAR, reset parent event references across both collections
  if (collectionName === 'post_activity_reports' && data.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const evRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(evRef);
        if (evSnap.exists()) {
          await updateDoc(evRef, {
            parId: null,
            parReferenceNo: null,
            parStatus: null,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {
      console.warn('[softDeleteDocument] PAR event unlink note:', e);
    }
  }
}

/**
 * Restores a soft-deleted document back to active 'draft' status.
 * Re-integrates the document into active queues with 100% data fidelity.
 * Enforces strict 1:1:1 Collision Guards to prevent restoring a document if an active replacement already exists.
 */
export async function restoreDocument(
  collectionName: SoftDeletableCollection,
  docId: string,
  user: { uid: string; name: string; role?: string }
): Promise<void> {
  if (!docId) throw new Error('Document ID is required.');
  const docRef = doc(db, collectionName, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error(`Document not found in ${collectionName}.`);

  const data = snap.data();

  // ── STRICT 1:1:1 RESTORATION COLLISION GUARDS ──
  // Guard A: For Post-Activity Reports
  if (collectionName === 'post_activity_reports' && data.eventId) {
    try {
      const qActive = query(
        collection(db, 'post_activity_reports'),
        where('eventId', '==', data.eventId)
      );
      const existingPars = await getDocs(qActive);
      const activePar = existingPars.docs.find((d) => {
        if (d.id === docId) return false;
        const pData = d.data();
        const st = (pData.status || '').toLowerCase();
        return st !== 'cancelled' && st !== 'voided' && pData.isDeleted !== true;
      });

      if (activePar) {
        const activeRef = activePar.data().referenceNo || 'in progress';
        throw new Error(
          `Cannot restore this Post-Activity Report: The parent activity already has an active Post-Activity Report (${activeRef}). Under the 1:1:1 invariant, please discard or archive the existing active report first.`
        );
      }
    } catch (err: any) {
      if (err.message?.includes('1:1:1 invariant')) throw err;
      console.warn('[restoreDocument] PAR collision check warning:', err);
    }
  }

  // Guard B: For Financial Liquidations
  if (collectionName === 'liquidations' && data.eventId) {
    try {
      const qActive = query(
        collection(db, 'liquidations'),
        where('eventId', '==', data.eventId)
      );
      const existingLiqs = await getDocs(qActive);
      const activeLiq = existingLiqs.docs.find((d) => {
        if (d.id === docId) return false;
        const lData = d.data();
        const st = (lData.status || '').toLowerCase();
        return st !== 'voided' && st !== 'cancelled' && lData.isDeleted !== true;
      });

      if (activeLiq) {
        const activeRef = activeLiq.data().referenceNumber || 'in progress';
        throw new Error(
          `Cannot restore this Financial Liquidation: The parent activity already has an active Financial Liquidation (${activeRef}). Under the 1:1:1 invariant, please discard or archive the existing active report first.`
        );
      }
    } catch (err: any) {
      if (err.message?.includes('1:1:1 invariant')) throw err;
      console.warn('[restoreDocument] Liquidation collision check warning:', err);
    }
  }

  const payload: Partial<SoftDeletable> & { isDeleted: boolean; updatedAt: any } = {
    isDeleted: false,
    restoredAt: serverTimestamp(),
    restoredByUid: user.uid,
    restoredByName: user.name,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(docRef, payload as any);

  // 1. Mirror restoration between activities and events
  if (collectionName === 'activities') {
    try {
      const eventRef = doc(db, 'events', docId);
      const evSnap = await getDoc(eventRef);
      if (evSnap.exists()) {
        await updateDoc(eventRef, payload as any);
      }
    } catch (e) {}
  } else if (collectionName === 'events') {
    try {
      const actRef = doc(db, 'activities', docId);
      const actSnap = await getDoc(actRef);
      if (actSnap.exists()) {
        await updateDoc(actRef, payload as any);
      }
    } catch (e) {}
  }

  // 2. Re-link parent event references if restoring liquidation across both collections
  if (collectionName === 'liquidations' && data.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const evRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(evRef);
        if (evSnap.exists()) {
          await updateDoc(evRef, {
            liquidationStatus: data.status || 'draft',
            liquidationReportId: docId,
            liquidationRefNumber: data.referenceNumber || null,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {
      console.warn('[restoreDocument] Liquidation event relink note:', e);
    }
  }

  // 3. Re-link parent event references if restoring PAR across both collections
  if (collectionName === 'post_activity_reports' && data.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const evRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(evRef);
        if (evSnap.exists()) {
          await updateDoc(evRef, {
            parId: docId,
            parReferenceNo: data.referenceNo || null,
            parStatus: data.status || 'draft',
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {
      console.warn('[restoreDocument] PAR event relink note:', e);
    }
  }
}

/**
 * Permanently removes a document from Firestore.
 * STRICTLY RESTRICTED TO SAS ADMINISTRATORS for manual maintenance.
 */
export async function permanentlyPurgeDocument(
  collectionName: SoftDeletableCollection,
  docId: string,
  adminUser: { uid: string; role?: string }
): Promise<void> {
  const role = (adminUser.role || '').toLowerCase();
  const isAuthorized = role === 'admin' || role === 'sas_admin' || role === 'sao_admin';
  if (!isAuthorized) {
    throw new Error('Unauthorized. Only SAS Administrators can permanently purge discarded records.');
  }

  const docRef = doc(db, collectionName, docId);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? snap.data() : null;

  await deleteDoc(docRef);

  // Clean mirror collection if applicable
  if (collectionName === 'activities') {
    try {
      await deleteDoc(doc(db, 'events', docId));
    } catch (e) {}
  } else if (collectionName === 'events') {
    try {
      await deleteDoc(doc(db, 'activities', docId));
    } catch (e) {}
  }

  // If purging a liquidation, clean event references
  if (collectionName === 'liquidations' && data?.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const evRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(evRef);
        if (evSnap.exists()) {
          await updateDoc(evRef, {
            liquidationStatus: null,
            liquidationReportId: null,
            liquidationRefNumber: null,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {}
  }

  // If purging a PAR, clean event references
  if (collectionName === 'post_activity_reports' && data?.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const evRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(evRef);
        if (evSnap.exists()) {
          await updateDoc(evRef, {
            parId: null,
            parReferenceNo: null,
            parStatus: null,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {}
  }
}

/**
 * Fetches all soft-deleted records from a collection for display in the Trash / Recycle Bin studio.
 */
export async function fetchTrashDocuments(
  collectionName: SoftDeletableCollection,
  organizationId?: string,
  isSasAdmin = false
): Promise<TrashRecordMetadata[]> {
  const colRef = collection(db, collectionName);
  const q = query(colRef, where('isDeleted', '==', true));

  const snap = await getDocs(q);
  const records: TrashRecordMetadata[] = [];

  snap.forEach((d) => {
    const data = d.data();
    const docOrgId = data.organizationId || data.hostingOrgId || data.createdByOrgId || '';
    if (organizationId && !isSasAdmin && organizationId !== 'sas' && organizationId !== 'sao_admin') {
      const cleanTarget = organizationId.trim().toLowerCase();
      const cleanDocOrg = String(docOrgId).trim().toLowerCase();
      if (cleanDocOrg !== cleanTarget && !cleanDocOrg.includes(cleanTarget) && !cleanTarget.includes(cleanDocOrg)) {
        return;
      }
    }

    records.push({
      id: d.id,
      collectionName,
      title: data.title || data.eventTitle || data.description || 'Untitled Document',
      referenceNo: data.referenceNo || data.referenceNumber || data.referenceId,
      organizationId: data.organizationId || data.hostingOrgId,
      organizationName: data.organizationName || data.hostingOrgName,
      status: data.status || data.lifecycleStatus || data.proposalStatus || 'draft',
      deletedAt: data.deletedAt,
      deletedByName: data.deletedByName,
      deletedByRole: data.deletedByRole,
      deletedReason: data.deletedReason,
      data,
    });
  });

  return records.sort((a, b) => {
    const tA = a.deletedAt?.seconds ? a.deletedAt.seconds * 1000 : new Date(a.deletedAt || 0).getTime();
    const tB = b.deletedAt?.seconds ? b.deletedAt.seconds * 1000 : new Date(b.deletedAt || 0).getTime();
    return tB - tA;
  });
}
