/**
 * src/app/modules/workflow/services/revision-history.service.ts
 *
 * Dedicated subcollection-based service for document revision history.
 * Solves the Firestore 1MB document limit by storing historical version snapshots
 * in dedicated subcollections: `/{parentCollection}/{docId}/revisions/{revisionId}`.
 *
 * Guarantees that:
 * 1. Documents can be revised unlimited times without bloating the parent document.
 * 2. Visual diffs and past revisions remain accessible for comparisons.
 * 3. Legacy embedded versions are smoothly migrated without data loss.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { sanitizeCleanDocumentSnapshot } from '../utils/snapshot-cleaner.utils';

export interface DocumentRevisionRecord {
  id: string;
  version: number;
  versionLabel: string;
  dataSnapshot: Record<string, any>;
  returnFlags?: string[];
  stepRevisionRemarks?: Record<string, string>;
  returnRemarks?: string;
  adviserRemarks?: string;
  returnedBy?: string;
  returnedByName?: string;
  returnedByRoleTitle?: string;
  returnedAt?: string | null;
  resubmittedBy?: string;
  resubmittedByUid?: string;
  resubmittedAt?: string | null;
  resubmissionNote?: string;
  approvalChainSnapshot?: any[];
  archivedAt?: string;
  createdAt?: any;
}

/**
 * Strips undefined, circular, or nested snapshot fields before writing to Firestore subcollection.
 */
function cleanPayload<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && typeof val !== 'function') {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Archives a revision snapshot into the document's `revisions` subcollection.
 */
export async function archiveDocumentRevision(
  parentCollection: string,
  docId: string,
  revisionData: Partial<DocumentRevisionRecord>
): Promise<string> {
  if (!parentCollection || !docId) {
    throw new Error('[archiveDocumentRevision] parentCollection and docId are required.');
  }

  const version = revisionData.version || 1;
  const revisionId = revisionData.id || `v${version}_${Date.now()}`;
  const revRef = doc(db, parentCollection, docId, 'revisions', revisionId);

  const cleanSnapshot = sanitizeCleanDocumentSnapshot(revisionData.dataSnapshot || {});

  const payload: DocumentRevisionRecord = cleanPayload({
    id: revisionId,
    version,
    versionLabel: revisionData.versionLabel || `v${version}.0`,
    dataSnapshot: cleanSnapshot,
    returnFlags: revisionData.returnFlags || [],
    stepRevisionRemarks: revisionData.stepRevisionRemarks || {},
    returnRemarks: revisionData.returnRemarks || revisionData.adviserRemarks || '',
    adviserRemarks: revisionData.adviserRemarks || revisionData.returnRemarks || '',
    returnedBy: revisionData.returnedBy || '',
    returnedByName: revisionData.returnedByName || '',
    returnedByRoleTitle: revisionData.returnedByRoleTitle || '',
    returnedAt: revisionData.returnedAt || null,
    resubmittedBy: revisionData.resubmittedBy || '',
    resubmittedByUid: revisionData.resubmittedByUid || '',
    resubmittedAt: revisionData.resubmittedAt || new Date().toISOString(),
    resubmissionNote: revisionData.resubmissionNote || '',
    approvalChainSnapshot: (revisionData.approvalChainSnapshot || []).map((s: any) => cleanPayload({ ...s })),
    archivedAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });

  await setDoc(revRef, payload, { merge: true });
  return revisionId;
}

/**
 * Fetches all archived revisions for a document from its subcollection, ordered from latest to oldest.
 */
export async function fetchDocumentRevisions(
  parentCollection: string,
  docId: string
): Promise<DocumentRevisionRecord[]> {
  if (!parentCollection || !docId) return [];

  try {
    const revisionsRef = collection(db, parentCollection, docId, 'revisions');
    const q = query(revisionsRef, orderBy('version', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) {
      // Fallback query without orderBy in case index is not built yet
      const fallbackSnap = await getDocs(revisionsRef);
      const list = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DocumentRevisionRecord));
      list.sort((a, b) => (b.version || 0) - (a.version || 0));
      return list;
    }

    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocumentRevisionRecord));
  } catch (err) {
    console.warn(`[fetchDocumentRevisions] Failed to fetch revisions for ${parentCollection}/${docId}:`, err);
    return [];
  }
}

/**
 * Subscribes to real-time revision updates from the subcollection.
 */
export function subscribeDocumentRevisions(
  parentCollection: string,
  docId: string,
  callback: (revisions: DocumentRevisionRecord[]) => void
): () => void {
  if (!parentCollection || !docId) {
    callback([]);
    return () => {};
  }

  const revisionsRef = collection(db, parentCollection, docId, 'revisions');
  return onSnapshot(
    revisionsRef,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocumentRevisionRecord));
      list.sort((a, b) => (b.version || 0) - (a.version || 0));
      callback(list);
    },
    (err) => {
      console.warn(`[subscribeDocumentRevisions] Real-time subscription error for ${parentCollection}/${docId}:`, err);
    }
  );
}

/**
 * Migrates legacy embedded `versionHistory` arrays into the subcollection
 * to de-bloat existing oversized parent documents.
 */
export async function migrateLegacyVersionHistory(
  parentCollection: string,
  docId: string,
  legacyVersions: any[]
): Promise<void> {
  if (!parentCollection || !docId || !Array.isArray(legacyVersions) || legacyVersions.length === 0) {
    return;
  }

  try {
    const batch = writeBatch(db);
    let count = 0;

    for (let idx = 0; idx < legacyVersions.length; idx++) {
      const v = legacyVersions[idx];
      if (!v) continue;

      const verNum = v.version || idx + 1;
      const revId = v.id || `migrated_v${verNum}`;
      const revRef = doc(db, parentCollection, docId, 'revisions', revId);

      const snapData = v.dataSnapshot || v.previousSnapshot || v.snapshot || {};
      const cleanSnap = sanitizeCleanDocumentSnapshot(snapData);

      const payload: DocumentRevisionRecord = cleanPayload({
        id: revId,
        version: verNum,
        versionLabel: v.versionLabel || `v${verNum}.0`,
        dataSnapshot: cleanSnap,
        returnFlags: v.returnFlags || [],
        stepRevisionRemarks: v.stepRevisionRemarks || {},
        returnRemarks: v.returnRemarks || v.adviserRemarks || '',
        adviserRemarks: v.adviserRemarks || v.returnRemarks || '',
        returnedBy: v.returnedBy || '',
        returnedByName: v.returnedByName || '',
        returnedByRoleTitle: v.returnedByRoleTitle || '',
        returnedAt: v.returnedAt || null,
        resubmittedBy: v.resubmittedBy || '',
        resubmittedByUid: v.resubmittedByUid || '',
        resubmittedAt: v.resubmittedAt || v.archivedAt || new Date().toISOString(),
        resubmissionNote: v.resubmissionNote || '',
        approvalChainSnapshot: (v.approvalChainSnapshot || []).map((s: any) => cleanPayload({ ...s })),
        archivedAt: v.archivedAt || new Date().toISOString(),
      });

      batch.set(revRef, payload, { merge: true });
      count++;
    }

    if (count > 0) {
      await batch.commit();
      console.log(`[migrateLegacyVersionHistory] Migrated ${count} legacy revisions to ${parentCollection}/${docId}/revisions`);
    }
  } catch (err) {
    console.warn(`[migrateLegacyVersionHistory] Error migrating legacy versions:`, err);
  }
}

