/**
 * src/app/modules/auth/hooks/useAdviserProfile.ts
 *
 * Singleton real-time Firestore subscription to the currently authenticated adviser's
 * profile document in the `sas_admins` collection.
 * Shared across all layout & page consumers so /sas_admins/{uid} is subscribed once.
 */

import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../../services/firebase';
import { SAS_ADMINS_COLLECTION } from '../services/auth.service';
import type { SasAdminDocument } from '../types/adviser.types';
import { formatPersonName } from '../../../utils/name.utils';
import { createSingletonStream } from '../../../utils/createSingletonStream';

interface UseAdviserProfileResult {
  profile: SasAdminDocument | null;
  user: User | null;
  loading: boolean;
  error: Error | null;
}

interface AdviserProfilePayload {
  user: User | null;
  profile: SasAdminDocument | null;
}

const adviserProfileStream = createSingletonStream<AdviserProfilePayload>({
  initialData: { user: null, profile: null },
  start: (emit, emitError) => {
    let unsubscribeFirestore: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (!firebaseUser) {
        emit({ user: null, profile: null });
        return;
      }

      const profileRef = doc(db, SAS_ADMINS_COLLECTION, firebaseUser.uid);
      unsubscribeFirestore = onSnapshot(
        profileRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            emit({
              user: firebaseUser,
              profile: { uid: snap.id, ...data, displayName: formatPersonName(data) } as SasAdminDocument,
            });
          } else {
            emit({ user: firebaseUser, profile: null });
          }
        },
        (err) => {
          emitError(err, { user: firebaseUser, profile: null });
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  },
});

export function useAdviserProfile(): UseAdviserProfileResult {
  const { data, loading, error } = adviserProfileStream.use();
  return {
    profile: data.profile,
    user: data.user,
    loading,
    error,
  };
}
