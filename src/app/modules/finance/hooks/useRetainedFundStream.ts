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
  buildScopedRetainedBucketId,
  normalizeRetainedSchoolYear,
} from '../services/retained-fund.service';
import { parseTimestampMillis } from './useFinanceStream';

export function useRetainedActivityFunds(
  organizationId?: string | null,
  schoolYear?: string | null
) {
  const [fundDocs, setFundDocs] = useState<RetainedActivityFundDocument[]>([]);
  const [rawLedgerEntries, setRawLedgerEntries] = useState<RetainedFundLedgerEntry[]>([]);
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
        setRawLedgerEntries(entries);
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

  const cleanSy = normalizeRetainedSchoolYear(schoolYear);

  const saoRetainedFund = useMemo<RetainedActivityFundDocument>(() => {
    if (cleanSy) {
      const scopedId = buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, cleanSy);
      const scopedMatch = fundDocs.find(
        (f) =>
          f.id === scopedId ||
          (f.ownerType === 'sao' && normalizeRetainedSchoolYear(f.schoolYear) === cleanSy)
      );
      if (scopedMatch) return scopedMatch;

      // Fall back to unscoped legacy SAO_CAMPUS only if it has not been migrated to a different SY
      const legacy = fundDocs.find((f) => f.id === SAO_RETAINED_BUCKET_ID);
      if (
        legacy &&
        (!legacy.migratedToSchoolYear ||
          normalizeRetainedSchoolYear(legacy.migratedToSchoolYear) === cleanSy)
      ) {
        return legacy;
      }

      return {
        id: scopedId,
        ownerType: 'sao',
        schoolYear: cleanSy,
        organizationName: 'SAO / Campus Student Activity Fund',
        totalContributionsCollected: 0,
        totalSurplusesRetained: 0,
        totalDisbursedOrSpent: 0,
        availableBalance: 0,
      };
    }

    // No explicit SY filter: prefer the newest SY-scoped SAO doc, then legacy SAO_CAMPUS
    const syScopedDocs = fundDocs
      .filter((f) => f.ownerType === 'sao' && Boolean(f.schoolYear))
      .sort((a, b) => String(b.schoolYear || '').localeCompare(String(a.schoolYear || '')));
    if (syScopedDocs.length > 0) return syScopedDocs[0];

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
  }, [fundDocs, cleanSy]);

  const orgRetainedFunds = useMemo(() => {
    const orgs = fundDocs.filter((f) => f.ownerType === 'organization');
    if (!cleanSy) return orgs;

    const scopedOrgs = orgs.filter((f) => normalizeRetainedSchoolYear(f.schoolYear) === cleanSy);
    const hasScopedForSy = scopedOrgs.length > 0 || fundDocs.some((f) => f.id === buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, cleanSy));
    if (scopedOrgs.length > 0) return scopedOrgs;

    // Only include un-migrated legacy org docs if this SY doesn't already have its own closed/reset snapshot
    return orgs.filter(
      (f) =>
        !f.schoolYear &&
        !f.migratedToSchoolYear &&
        !hasScopedForSy
    );
  }, [fundDocs, cleanSy]);

  const targetOrgRetainedFund = useMemo(() => {
    if (!organizationId) return null;
    if (cleanSy) {
      const scopedOrgId = buildScopedRetainedBucketId(`ORG_${organizationId}`, cleanSy);
      const scopedMatch = fundDocs.find(
        (f) =>
          f.id === scopedOrgId ||
          (f.organizationId === organizationId &&
            normalizeRetainedSchoolYear(f.schoolYear) === cleanSy)
      );
      if (scopedMatch) return scopedMatch;

      const legacyOrg = fundDocs.find(
        (f) => f.id === `ORG_${organizationId}` || (f.organizationId === organizationId && !f.schoolYear)
      );
      if (
        legacyOrg &&
        (!legacyOrg.migratedToSchoolYear ||
          normalizeRetainedSchoolYear(legacyOrg.migratedToSchoolYear) === cleanSy)
      ) {
        return legacyOrg;
      }
      return null;
    }

    return (
      fundDocs.find(
        (f) => f.id === `ORG_${organizationId}` || f.organizationId === organizationId
      ) || null
    );
  }, [fundDocs, organizationId, cleanSy]);

  const ledgerEntries = useMemo(() => {
    if (!cleanSy) return rawLedgerEntries;
    const legacySao = fundDocs.find((f) => f.id === SAO_RETAINED_BUCKET_ID);
    const allowUntaggedLegacy =
      !legacySao?.migratedToSchoolYear ||
      normalizeRetainedSchoolYear(legacySao.migratedToSchoolYear) === cleanSy;

    return rawLedgerEntries.filter((e) => {
      const entrySy = normalizeRetainedSchoolYear(e.schoolYear);
      if (entrySy) return entrySy === cleanSy;
      return allowUntaggedLegacy;
    });
  }, [rawLedgerEntries, cleanSy, fundDocs]);

  return {
    fundDocs,
    saoRetainedFund,
    orgRetainedFunds,
    targetOrgRetainedFund,
    ledgerEntries,
    allLedgerEntries: rawLedgerEntries,
    loading,
  };
}
