import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationTypeDocument } from '../types/organization.types';

export const useOrganizationTypes = () => {
  const [data, setData] = useState<OrganizationTypeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'organization_types'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        setData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrganizationTypeDocument)));
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
