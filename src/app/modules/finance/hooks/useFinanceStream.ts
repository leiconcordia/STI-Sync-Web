import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { SaoLedgerDocument, OrgLedgerDocument } from '../types/finance.types';

export function useSaoLedger() {
  const [data, setData] = useState<SaoLedgerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'sao_ledger'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as SaoLedgerDocument[];
        setData(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching SAO ledger:', err);
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

export function useOrgLedger(organizationId: string | null) {
  const [data, setData] = useState<OrgLedgerDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    // Query without orderBy to avoid composite index requirement
    const q = query(
      collection(db, 'organization_ledger'),
      where('organizationId', '==', organizationId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as OrgLedgerDocument[];
        
        // Sort locally by date ascending
        docs.sort((a, b) => {
          const aTime = a.date?.toMillis ? a.date.toMillis() : 0;
          const bTime = b.date?.toMillis ? b.date.toMillis() : 0;
          return aTime - bTime;
        });

        setData(docs);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching Org ledger:', err);
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [organizationId]);

  return { data, loading, error };
}
