/**
 * src/app/modules/auth/services/auth.service.ts
 *
 * Pure Firestore logic for the `sas_admins` collection.
 * No React dependencies — safe to call from anywhere.
 *
 * Collection path: /sas_admins/{uid}
 * Document ID: Firebase Auth UID of the adviser.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type UserCredential,
} from 'firebase/auth';
import { db, auth } from '../../../../services/firebase';
import type { SasAdminDocument, SasAdminUpdatePayload } from '../types/adviser.types';

// ─── Collection Constant ───────────────────────────────────────────────────────

export const SAS_ADMINS_COLLECTION = 'sas_admins' as const;

// ─── Auth Operations ───────────────────────────────────────────────────────────

/**
 * Sign in an SAO adviser with email and password.
 * Returns the Firebase UserCredential on success.
 * Throws a FirebaseError on failure (invalid credentials, network, etc.).
 */
export async function signInAdviser(
  email: string,
  password: string
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out the currently authenticated user.
 */
export async function signOutAdviser(): Promise<void> {
  return firebaseSignOut(auth);
}

// ─── Firestore Profile Operations ─────────────────────────────────────────────

/**
 * Fetch a single SasAdminDocument by Firebase Auth UID.
 * Returns `null` if no profile document exists for that UID.
 */
export async function getAdviserProfile(
  uid: string
): Promise<SasAdminDocument | null> {
  const ref = doc(db, SAS_ADMINS_COLLECTION, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as SasAdminDocument;
}

/**
 * Create (or fully overwrite) a profile document for an adviser.
 * Intended for seeding or initial profile setup.
 *
 * @param uid   - Firebase Auth UID (becomes the document ID)
 * @param data  - Full profile payload (excluding uid, createdAt, updatedAt)
 */
export async function createAdviserProfile(
  uid: string,
  data: Omit<SasAdminDocument, 'uid' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  const ref = doc(db, SAS_ADMINS_COLLECTION, uid);
  await setDoc(ref, {
    ...data,
    uid,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Partially update an adviser's profile document.
 * Only the supplied fields are written; all others remain unchanged.
 */
export async function updateAdviserProfile(
  uid: string,
  updates: SasAdminUpdatePayload
): Promise<void> {
  const ref = doc(db, SAS_ADMINS_COLLECTION, uid);
  await updateDoc(ref, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}
