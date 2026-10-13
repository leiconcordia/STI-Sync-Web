import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { DocumentCategoryDocument } from '../types/document.types';
import { seedStandardCategories } from '../services/document_category.service';

let isSeeding = false;

export const useDocumentCategories = () => {
  const [data, setData] = useState<DocumentCategoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'document_categories'), orderBy('sortOrder', 'asc'));
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        if (snapshot.empty && !isSeeding) {
          isSeeding = true;
          seedStandardCategories()
            .catch(console.error)
            .finally(() => { isSeeding = false; });
        }
        setData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DocumentCategoryDocument)));
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
};
