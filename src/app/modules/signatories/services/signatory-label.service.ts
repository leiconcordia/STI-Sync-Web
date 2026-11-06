/**
 * src/app/modules/signatories/services/signatory-label.service.ts
 *
 * Firestore service for dynamic institutional signatory document labels.
 * Provides real-time subscriptions, CRUD operations, and automatic seeding.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import {
  DEFAULT_SIGNATORY_LABELS,
  type SignatoryLabelDocument,
  type CreateSignatoryLabelPayload,
  type UpdateSignatoryLabelPayload,
} from '../types/signatory-label.types';

export const SIGNATORY_LABELS_COLLECTION = 'signatory_labels';

/**
 * Seed default institutional signatory labels into Firestore if collection is empty
 */
export async function seedDefaultSignatoryLabels(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, SIGNATORY_LABELS_COLLECTION));
    if (!snap.empty) return;

    for (const item of DEFAULT_SIGNATORY_LABELS) {
      const slug = item.label
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      const docId = `label_${slug}`;
      const docRef = doc(db, SIGNATORY_LABELS_COLLECTION, docId);
      await setDoc(docRef, {
        id: docId,
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('[SignatoryLabelService] Error seeding default labels:', err);
  }
}

/**
 * Real-time subscription to signatory labels sorted by orderIndex ascending
 */
export function subscribeToSignatoryLabels(
  callback: (labels: SignatoryLabelDocument[]) => void
): () => void {
  const q = query(
    collection(db, SIGNATORY_LABELS_COLLECTION),
    orderBy('orderIndex', 'asc')
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      if (snapshot.empty) {
        // Trigger background seeding if first time
        seedDefaultSignatoryLabels();
        // Return default list as immediate fallback
        const defaults: SignatoryLabelDocument[] = DEFAULT_SIGNATORY_LABELS.map((item, idx) => ({
          id: `default_${idx + 1}`,
          ...item,
        }));
        callback(defaults);
        return;
      }

      const list: SignatoryLabelDocument[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          label: data.label || '',
          description: data.description || '',
          actionType: data.actionType || 'endorse',
          isApproverLabel: Boolean(data.isApproverLabel),
          orderIndex: typeof data.orderIndex === 'number' ? data.orderIndex : 99,
          isActive: data.isActive !== false,
          isSystemDefault: Boolean(data.isSystemDefault),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });

      callback(list);
    },
    (err) => {
      console.error('[SignatoryLabelService] Real-time subscription error:', err);
      // Fallback
      const defaults: SignatoryLabelDocument[] = DEFAULT_SIGNATORY_LABELS.map((item, idx) => ({
        id: `default_${idx + 1}`,
        ...item,
      }));
      callback(defaults);
    }
  );
}

/**
 * Create a new custom formal signatory label
 */
export async function createSignatoryLabel(
  payload: CreateSignatoryLabelPayload
): Promise<string> {
  const cleanLabel = payload.label.trim();
  if (!cleanLabel) {
    throw new Error('Label text cannot be empty.');
  }

  // Ensure label ends with colon if user didn't type it
  const formattedLabel = cleanLabel.endsWith(':') ? cleanLabel : `${cleanLabel}:`;

  // Check for duplicate label text
  const snap = await getDocs(collection(db, SIGNATORY_LABELS_COLLECTION));
  const exists = snap.docs.some(
    (d) => (d.data().label || '').trim().toLowerCase() === formattedLabel.toLowerCase()
  );
  if (exists) {
    throw new Error(`A signatory label "${formattedLabel}" already exists.`);
  }

  const slug = formattedLabel
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const docId = `label_${slug}_${Date.now()}`;
  const docRef = doc(db, SIGNATORY_LABELS_COLLECTION, docId);

  const newDoc: SignatoryLabelDocument = {
    id: docId,
    label: formattedLabel,
    description: payload.description ? payload.description.trim() : '',
    actionType: payload.actionType || (payload.isApproverLabel ? 'approve' : 'endorse'),
    isApproverLabel: Boolean(payload.isApproverLabel),
    orderIndex: typeof payload.orderIndex === 'number' ? payload.orderIndex : snap.size + 1,
    isActive: payload.isActive !== false,
    isSystemDefault: Boolean(payload.isSystemDefault),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, newDoc);
  return docId;
}

/**
 * Update an existing signatory label
 */
export async function updateSignatoryLabel(
  id: string,
  payload: UpdateSignatoryLabelPayload
): Promise<void> {
  const docRef = doc(db, SIGNATORY_LABELS_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error(`Signatory label with ID "${id}" does not exist.`);
  }

  const updates: any = {
    updatedAt: serverTimestamp(),
  };

  if (payload.label !== undefined) {
    const clean = payload.label.trim();
    if (!clean) throw new Error('Label text cannot be empty.');
    updates.label = clean.endsWith(':') ? clean : `${clean}:`;
  }
  if (payload.description !== undefined) {
    updates.description = payload.description.trim();
  }
  if (payload.actionType !== undefined) {
    updates.actionType = payload.actionType;
  }
  if (payload.isApproverLabel !== undefined) {
    updates.isApproverLabel = Boolean(payload.isApproverLabel);
  }
  if (payload.orderIndex !== undefined) {
    updates.orderIndex = Number(payload.orderIndex);
  }
  if (payload.isActive !== undefined) {
    updates.isActive = Boolean(payload.isActive);
  }

  await updateDoc(docRef, updates);
}

/**
 * Toggle active status of a label
 */
export async function toggleSignatoryLabelStatus(
  id: string,
  isActive: boolean
): Promise<void> {
  const docRef = doc(db, SIGNATORY_LABELS_COLLECTION, id);
  await updateDoc(docRef, {
    isActive,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a signatory label
 */
export async function deleteSignatoryLabel(id: string): Promise<void> {
  const docRef = doc(db, SIGNATORY_LABELS_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Signatory label not found.');
  }

  const data = snap.data();
  if (data.isSystemDefault) {
    throw new Error('System default labels cannot be deleted. You can deactivate them instead.');
  }

  await deleteDoc(docRef);
}

