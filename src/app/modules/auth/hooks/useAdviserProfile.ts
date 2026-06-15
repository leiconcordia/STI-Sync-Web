/**
 * src/app/modules/auth/hooks/useAdviserProfile.ts
 *
 * Real-time Firestore subscription to the currently authenticated adviser's
 * profile document in the `sas_admins` collection.
 *
 * Pattern:
 *   1. Listens to Firebase Auth state changes (onAuthStateChanged).
 *   2. When a user is signed in, subscribes to their /sas_admins/{uid} document
 *      with onSnapshot() for live profile updates.
 *   3. Cleans up both listeners on unmount — per agent.md §3.4 cleanup contract.
 *
 * Returns: { profile, loading, error }
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../../services/firebase';
import { SAS_ADMINS_COLLECTION } from '../services/auth.service';
import type { SasAdminDocument } from '../types/adviser.types';

interface UseAdviserProfileResult {
  /** The adviser's Firestore profile, or null if not loaded / not found */
  profile: SasAdminDocument | null;
  /** The raw Firebase Auth user — useful for UID / email access */
  user: User | null;
  /** True while auth state or profile is still resolving */
  loading: boolean;
  /** Non-null if a Firestore read error occurred */
  error: Error | null;
}

export function useAdviserProfile(): UseAdviserProfileResult {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<SasAdminDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<Error | null>(null);

  useEffect(() => {
    // Tracker for the inner Firestore unsubscribe so we can clean it up
    // whenever the auth user changes.
    let unsubscribeFirestore: (() => void) | null = null;

    // ── 1. Subscribe to Auth state ──────────────────────────────────────────
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);

      // Clean up any previous Firestore subscription before starting a new one
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (!firebaseUser) {
        // Signed out — clear profile and finish loading
        setProfile(null);
        setLoading(false);
        return;
      }

      // ── 2. Subscribe to the adviser's profile document ──────────────────
      setLoading(true);
      const profileRef = doc(db, SAS_ADMINS_COLLECTION, firebaseUser.uid);

      unsubscribeFirestore = onSnapshot(
        profileRef,
        (snap) => {
          if (snap.exists()) {
            setProfile({ uid: snap.id, ...snap.data() } as SasAdminDocument);
          } else {
            // Auth user exists but no Firestore profile yet — profile is null
            setProfile(null);
          }
          setLoading(false);
        },
        (err) => {
          setError(err);
          setLoading(false);
        }
      );
    });

    // ── 3. Cleanup — runs on unmount ────────────────────────────────────────
    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, []); // runs once — auth listener handles all state transitions

  return { profile, user, loading, error };
}
