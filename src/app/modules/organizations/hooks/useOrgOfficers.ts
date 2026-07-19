import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';

export interface OrganizationOfficerDocument {
  id: string;
  organizationId: string;
  roleId: string;
  studentId: string;
  studentName: string;
  email: string;
  isActive: boolean;
  temporaryPassword?: string;
  createdAt: any;
  updatedAt: any;
}

export function useOrgOfficers(orgId: string | null | undefined) {
  const [officers, setOfficers] = useState<OrganizationOfficerDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!orgId) {
      setOfficers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'organization_officers'),
      where('organizationId', '==', orgId),
      where('isActive', '==', true),
      orderBy('studentName', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as OrganizationOfficerDocument[];
        
        setOfficers(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useOrgOfficers] Error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orgId]);

  return { officers, loading, error };
}
