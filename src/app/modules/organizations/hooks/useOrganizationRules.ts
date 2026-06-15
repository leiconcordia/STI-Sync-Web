import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationRulesDocument } from '../types/organization.types';

export const useOrganizationRules = () => {
  const [data, setData] = useState<OrganizationRulesDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const docRef = doc(db, 'system_settings', 'organization_rules');
    const unsubscribe = onSnapshot(docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData(snapshot.data() as OrganizationRulesDocument);
        } else {
          setData(null);
        }
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
