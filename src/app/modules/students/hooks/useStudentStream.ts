import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { STUDENTS_COLLECTION } from '../services/student.service';
import type { StudentDocument } from '../types/student.types';

export function useStudents() {
  const [data, setData] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, STUDENTS_COLLECTION), orderBy('lastName', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map(doc => doc.data() as StudentDocument));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}
