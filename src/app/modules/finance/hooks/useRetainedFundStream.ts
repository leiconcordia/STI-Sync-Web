import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type {
  RetainedActivityFundDocument,
  RetainedFundLedgerEntry,
} from '../types/retained-fund.types';
import {
  RETAINED_FUNDS_COLLECTION,
  RETAINED_FUND_LEDGER_COLLECTION,
  SAO_RETAINED_BUCKET_ID,
} from '../services/retained-fund.service';
import { parseTimestampMillis } from './useFinanceStream';

export function useRetainedActivityFunds(organizationId?: string | null) {
  const [fundDocs, setFundDocs] = useState<RetainedActivityFundDocument[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<RetainedFundLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubFunds = onSnapshot(
      collection(db, RETAINED_FUNDS_COLLECTION),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) } as RetainedActivityFundDocument)
        );
        setFundDocs(docs);
        setLoading(false);
      },
      (err) => {
        console.warn('[useRetainedActivityFunds] Error listening to funds:', err);
        setLoading(false);
      }
    );

    const unsubLedger = onSnapshot(
      collection(db, RETAINED_FUND_LEDGER_COLLECTION),
      (snap) => {
        const entries = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) } as RetainedFundLedgerEntry)
        );
        entries.sort((a, b) => parseTimestampMillis(b.createdAt) - parseTimestampMillis(a.createdAt));
        setLedgerEntries(entries);
      },
      (err) => {
        console.warn('[useRetainedActivityFunds] Error listening to ledger:', err);
      }
    );

    return () => {
      unsubFunds();
      unsubLedger();
    };
  }, []);

  const saoRetainedFund = useMemo<RetainedActivityFundDocument>(() => {
    return (
      fundDocs.find((f) => f.id === SAO_RETAINED_BUCKET_ID) || {
        id: SAO_RETAINED_BUCKET_ID,
        ownerType: 'sao',
        organizationName: 'SAO / Campus Student Activity Fund',
        totalContributionsCollected: 0,
        totalSurplusesRetained: 0,
        totalDisbursedOrSpent: 0,
        availableBalance: 0,
      }
    );
  }, [fundDocs]);

  const orgRetainedFunds = useMemo(() => {
    return fundDocs.filter((f) => f.ownerType === 'organization');
  }, [fundDocs]);

  const targetOrgRetainedFund = useMemo(() => {
    if (!organizationId) return null;
    return (
      fundDocs.find(
        (f) => f.id === `ORG_${organizationId}` || f.organizationId === organizationId
      ) || null
    );
  }, [fundDocs, organizationId]);

  return {
    fundDocs,
    saoRetainedFund,
    orgRetainedFunds,
    targetOrgRetainedFund,
    ledgerEntries,
    loading,
  };
}
