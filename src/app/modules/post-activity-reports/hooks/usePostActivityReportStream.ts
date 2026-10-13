import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { PAR_COLLECTION } from '../services/par.service';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import type { PostActivityReportDocument } from '../types/par.types';
import type { EventDocument } from '../../events/types/event.types';

/**
 * Stream hook for Officer: fetches only the PARs authored by this specific organization.
 * Strictly isolates student organizations from seeing other orgs' PARs or SAS internal PARs.
 */
export function useOfficerPARs(organizationId?: string) {
  const [pars, setPars] = useState<PostActivityReportDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setPars([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, PAR_COLLECTION),
      where('organizationId', '==', organizationId)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as PostActivityReportDocument))
          // Strictly exclude any SAS internal documents
          .filter((doc) => !doc.isSasInternal && doc.organizationId === organizationId);

        // Sort descending by updated/created
        list.sort((a, b) => {
          const aTime = (a.updatedAt as any)?.seconds ?? (a.createdAt as any)?.seconds ?? 0;
          const bTime = (b.updatedAt as any)?.seconds ?? (b.createdAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });

        setPars(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useOfficerPARs] Snapshot error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [organizationId]);

  return { pars, loading, error };
}

/**
 * Stream hook for Admin / SAS: fetches all PARs (both Org-submitted and SAS internal).
 */
export function useAdminPARs() {
  const [pars, setPars] = useState<PostActivityReportDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = collection(db, PAR_COLLECTION);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as PostActivityReportDocument)
        );

        list.sort((a, b) => {
          const aTime = (a.updatedAt as any)?.seconds ?? (a.createdAt as any)?.seconds ?? 0;
          const bTime = (b.updatedAt as any)?.seconds ?? (b.createdAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });

        setPars(list);
        setLoading(false);
      },
      (err) => {
        console.error('[useAdminPARs] Snapshot error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return { pars, loading, error };
}

/**
 * Stream hook for Institutional Signatories: fetches all PARs under review.
 */
export function useAllPARsForSignatories() {
  const [pars, setPars] = useState<PostActivityReportDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = collection(db, PAR_COLLECTION);
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as PostActivityReportDocument)
        );
        list.sort((a, b) => {
          const aTime = (a.updatedAt as any)?.seconds ?? (a.createdAt as any)?.seconds ?? 0;
          const bTime = (b.updatedAt as any)?.seconds ?? (b.createdAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });
        setPars(list);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

  return { pars, loading };
}

/**
 * Custom hook to query concluded events eligible for Post-Activity Report creation.
 * Strictly enforces authoring rights:
 * - If userRole === 'admin': Only returns SAS-created events.
 * - If userRole === 'officer': Only returns events created by that officer's organization.
 * - Gatekeeping: Event must be completed/concluded AND liquidation must be approved (or none_required).
 */
export function useEligibleEventsForPAR(
  userRole: 'admin' | 'officer',
  orgId?: string,
  orgName?: string
) {
  const [allEvents, setAllEvents] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [existingPars, setExistingPars] = useState<PostActivityReportDocument[]>([]);

  // 1. Listen to events collection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, EVENTS_COLLECTION),
      (snapshot) => {
        const events = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as EventDocument)
        );
        setAllEvents(events);
        setLoading(false);
      },
      (err) => {
        console.error('[useEligibleEventsForPAR] Events error:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // 2. Listen to PARs collection to track which events already have active/approved PARs
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, PAR_COLLECTION),
      (snapshot) => {
        const pList = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as PostActivityReportDocument)
        );
        setExistingPars(pList);
      },
      (err) => {
        console.error('[useEligibleEventsForPAR] PARs error:', err);
      }
    );

    return () => unsub();
  }, []);

  // Set of event IDs that already have non-returned PARs
  const takenEventIds = useMemo(() => {
    const map = new Map<string, PostActivityReportDocument>();
    existingPars.forEach((p) => {
      if (p.eventId && p.status !== 'returned') {
        map.set(p.eventId, p);
      }
    });
    return map;
  }, [existingPars]);

  const eligibleEvents = useMemo(() => {
    return allEvents.filter((e) => {
      // 1. Gatekeeping: Must be completed/concluded
      const lStatus = ((e as any).lifecycleStatus || e.status || '').toLowerCase();
      const isConcluded =
        lStatus === 'completed' ||
        lStatus === 'concluded' ||
        (e as any).isConcluded === true ||
        (e as any).timingStatus === 'completed';

      if (!isConcluded) return false;

      // 2. Gatekeeping: Financial Liquidation must be approved (or none_required)
      const liqStatus = (e as any).liquidationStatus;
      const isLiquidationSatisfied =
        liqStatus === 'approved' ||
        liqStatus === 'none_required' ||
        (e as any).isLiquidated === true;

      if (!isLiquidationSatisfied) return false;

      // 3. Check if an active PAR already exists for this event
      if (takenEventIds.has(e.id)) {
        return false;
      }

      // 4. Strict Authoring Rights:
      const cleanOrgId = (orgId || '').trim().toLowerCase();
      const cleanOrgName = (orgName || '').trim().toLowerCase();

      const isSasEvent =
        e.isOfficerProposal === false ||
        (e as any).isInstitutional === true ||
        (e as any).creatorRole === 'sas_admin' ||
        ['sas', 'sao', 'sas_admin', 'sao_admin', 'student affairs office', 'student affairs services'].includes(
          (e.hostingOrgId || '').toString().trim().toLowerCase()
        ) ||
        !e.hostingOrgId;

      if (userRole === 'admin') {
        // SAS Admin can ONLY create PAR for SAS-created events
        return isSasEvent;
      } else {
        // Student Org Officer can ONLY create PAR for their own org's events
        if (isSasEvent) return false;

        const eventOrgIds = [
          e.hostingOrgId,
          (e as any).organizationId,
          (e as any).createdByOrgId,
          (e as any).orgId,
        ]
          .filter(Boolean)
          .map((v) => String(v).trim().toLowerCase());

        const eventOrgNames = [
          (e as any).hostingOrgName,
          (e as any).orgName,
        ]
          .filter(Boolean)
          .map((v) => String(v).trim().toLowerCase());

        const matchesOrg =
          (cleanOrgId && eventOrgIds.includes(cleanOrgId)) ||
          (cleanOrgName && eventOrgNames.includes(cleanOrgName));

        return matchesOrg;
      }
    });
  }, [allEvents, userRole, orgId, orgName, takenEventIds]);

  return { eligibleEvents, loading, takenEventIds };
}
