import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../../../services/firebase';
import type { DocumentCategoryDocument } from '../types/document.types';

export const useDocumentCategories = () => {
  const [data, setData] = useState<DocumentCategoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const stop = onAuthStateChanged(auth, (user) => {
      unsubscribe?.(); setData([]); setError(null);
      if (!user) { setLoading(false); return; }
      setLoading(true);
      unsubscribe = onSnapshot(query(collection(db, 'document_categories'), orderBy('sortOrder', 'asc')), (snapshot) => {
        setData(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as DocumentCategoryDocument)));
        setLoading(false);
      }, (error) => { setError(error); setLoading(false); });
    });
    return () => { stop(); unsubscribe?.(); };
  }, []);
  return { data, loading, error };
};
