import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { STUDENTS_COLLECTION } from '../services/student.service';
import type { StudentDocument } from '../types/student.types';

// Global Singleton Cache for Students Stream
// Prevents duplicate Firestore queries across 16+ components, slashing reads by >90%
let cachedStudents: StudentDocument[] = [];
let isLoaded = false;
let globalError: Error | null = null;
let activeUnsubscribe: (() => void) | null = null;
let subscribersCount = 0;
let tearDownTimer: any = null;
const listeners = new Set<(data: StudentDocument[], loading: boolean, err: Error | null) => void>();

function startGlobalStudentSubscription() {
  if (activeUnsubscribe) return;
  if (tearDownTimer) {
    clearTimeout(tearDownTimer);
    tearDownTimer = null;
  }

  const q = query(collection(db, STUDENTS_COLLECTION));
  activeUnsubscribe = onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as StudentDocument));
      docs.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
      cachedStudents = docs;
      isLoaded = true;
      globalError = null;
      listeners.forEach((listener) => listener(cachedStudents, false, null));
    },
    (err) => {
      console.error('Error fetching students stream:', err);
      globalError = err;
      listeners.forEach((listener) => listener(cachedStudents, false, err));
    }
  );
}

function stopGlobalStudentSubscription() {
  if (tearDownTimer) {
    clearTimeout(tearDownTimer);
  }
  tearDownTimer = setTimeout(() => {
    if (subscribersCount === 0 && activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }
    tearDownTimer = null;
  }, 20000); // 20-second grace window to preserve cache across route transitions
}

export function useStudents() {
  const [data, setData] = useState<StudentDocument[]>(cachedStudents);
  const [loading, setLoading] = useState(!isLoaded);
  const [error, setError] = useState<Error | null>(globalError);

  useEffect(() => {
    subscribersCount++;
    const listener = (newData: StudentDocument[], newLoading: boolean, newErr: Error | null) => {
      setData(newData);
      setLoading(newLoading);
      setError(newErr);
    };

    listeners.add(listener);

    if (!activeUnsubscribe) {
      startGlobalStudentSubscription();
    } else if (isLoaded) {
      setData(cachedStudents);
      setLoading(false);
    }

    return () => {
      listeners.delete(listener);
      subscribersCount--;
      if (subscribersCount === 0) {
        stopGlobalStudentSubscription();
      }
    };
  }, []);

  return { data, loading, error };
}
