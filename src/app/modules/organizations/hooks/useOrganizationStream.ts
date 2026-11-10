import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationDocument } from '../types/organization.types';
import { formatPersonName } from '../../../utils/name.utils';

export const useOrganizationStream = () => {
  const [data, setData] = useState<OrganizationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'organizations'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setData(snapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, ...data, ...(data.adviser ? { adviser: { ...data.adviser, name: formatPersonName(data.adviser) } } : {}) } as OrganizationDocument;
        }));
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
