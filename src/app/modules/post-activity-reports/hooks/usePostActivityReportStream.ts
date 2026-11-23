import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { PAR_COLLECTION } from '../services/par.service';
import type { PostActivityReportDocument } from '../types/par.types';
import type { EventDocument } from '../../events/types/event.types';
import { isSasInstitutionalActivity } from '../../events/utils/event-lifecycle.utils';
import { isHiddenFromSasAndSignatories } from '../../activity-proposals/utils/proposal-status-tracker.utils';
import { subscribeRawEvents } from '../../events/hooks/useEventStream';
import { createSingletonStream, createKeyedSingletonStream } from '../../../utils/createSingletonStream';

const officerPARsStreams = createKeyedSingletonStream<PostActivityReportDocument[]>((organizationId) => ({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(
      collection(db, PAR_COLLECTION),
      where('organizationId', '==', organizationId)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as PostActivityReportDocument))
          .filter((d) => !d.isSasInternal && d.organizationId === organizationId && (d as any).isDeleted !== true);

        list.sort((a, b) => {
          const aTime = (a.updatedAt as any)?.seconds ?? (a.createdAt as any)?.seconds ?? 0;
          const bTime = (b.updatedAt as any)?.seconds ?? (b.createdAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });

        emit(list);
      },
      (err) => {
        console.error('[useOfficerPARs] Snapshot error:', err);
        emitError(err);
      }
    );
  },
}));

/**
 * Stream hook for Officer: fetches only the PARs authored by this specific organization.
 * Keyed singleton avoids re-reading when switching officer pages/modals.
 */
export function useOfficerPARs(organizationId?: string) {
  const [pars, setPars] = useState<PostActivityReportDocument[]>(() => {
    if (!organizationId) return [];
    return officerPARsStreams.getOrCreate(organizationId).getState().data;
  });
  const [loading, setLoading] = useState(() => {
    if (!organizationId) return false;
    return officerPARsStreams.getOrCreate(organizationId).getState().loading;
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setPars([]);
      setLoading(false);
      setError(null);
      return;
    }

    const stream = officerPARsStreams.getOrCreate(organizationId);
    const current = stream.getState();
    setPars(current.data);
    setLoading(current.loading);
    setError(current.error);

    return stream.subscribe((next) => {
      setPars(next.data);
      setLoading(next.loading);
      setError(next.error);
    });
  }, [organizationId]);

  return { pars, loading, error };
}

const allPARsStream = createSingletonStream<PostActivityReportDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    return onSnapshot(
      collection(db, PAR_COLLECTION),
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as PostActivityReportDocument))
          .filter((d: any) => d.isDeleted !== true);

        list.sort((a, b) => {
          const aTime = (a.updatedAt as any)?.seconds ?? (a.createdAt as any)?.seconds ?? 0;
          const bTime = (b.updatedAt as any)?.seconds ?? (b.createdAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });

        emit(list);
      },
      (err) => {
        console.error('[useAdminPARs] Snapshot error:', err);
        emitError(err);
      }
    );
  },
});

/**
 * Stream hook for Admin / SAS: fetches all PARs (excluding internal officer drafts & adviser-pending/adviser-rejected reports).
 */
export function useAdminPARs() {
  const { data: allPars, loading, error } = allPARsStream.use();
  const pars = useMemo(
    () => allPars.filter((p) => !isHiddenFromSasAndSignatories(p) || p.isSasInternal),
    [allPars]
  );
  return { pars, loading, error };
}

/**
 * Stream hook for Institutional Signatories: shares the same singleton stream as useAdminPARs.
 */
export function useAllPARsForSignatories() {
  const { data: pars, loading, error } = allPARsStream.use();
  return { pars, loading, error };
}

/**
 * Derives concluded events eligible for Post-Activity Report creation from the shared
 * singleton streams (`activities` + `post_activity_reports`), opening zero duplicate listeners.
 */
export function useEligibleEventsForPAR(
  userRole: 'admin' | 'officer',
  orgId?: string,
  orgName?: string
) {
  const [allEvents, setAllEvents] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: existingPars } = allPARsStream.use();

  useEffect(() => {
    return subscribeRawEvents((raw) => {
      setAllEvents(raw.activitiesDocs);
      if (raw.activitiesLoaded) {
        setLoading(false);
      }
    });
  }, []);

  const takenEventIds = useMemo(() => {
    const map = new Map<string, PostActivityReportDocument>();
    existingPars.forEach((p) => {
      const st = (p.status || '').toLowerCase();
      if (p.eventId && st !== 'cancelled' && st !== 'voided' && st !== 'rejected' && (p as any).isDeleted !== true) {
        map.set(p.eventId, p);
      }
    });
    return map;
  }, [existingPars]);

  const eligibleEvents = useMemo(() => {
    return allEvents.filter((e) => {
      if ((e as any).isDeleted === true) return false;
      const lStatus = ((e as any).lifecycleStatus || e.status || '').toLowerCase();
      const isConcluded =
        lStatus === 'completed' ||
        lStatus === 'concluded' ||
        (e as any).isConcluded === true ||
        (e as any).timingStatus === 'completed';

      if (!isConcluded) return false;

      const activePar = takenEventIds.get(e.id);
      const lingeringParIsActive =
        Boolean((e as any).parId) &&
        existingPars.some(
          (p) =>
            p.id === (e as any).parId &&
            p.status !== 'cancelled' &&
            p.status !== 'voided' &&
            (p as any).isDeleted !== true
        );

      if (activePar || lingeringParIsActive) {
        return false;
      }

      const isSasEvent = isSasInstitutionalActivity(e);

      if (userRole === 'admin') {
        return isSasEvent;
      } else {
        if (isSasEvent) return false;

        const cleanOrgId = (orgId || '').trim().toLowerCase();
        const cleanOrgName = (orgName || '').trim().toLowerCase();

        const eventOrgIds = [
          e.hostingOrgId,
          (e as any).organizationId,
          (e as any).createdByOrgId,
          (e as any).orgId,
          (e as any).org,
          (e as any).organization,
        ]
          .filter(Boolean)
          .map((v) => String(v).trim().toLowerCase());

        const eventOrgNames = [
          (e as any).hostingOrgName,
          (e as any).orgName,
          (e as any).organizationName,
        ]
          .filter(Boolean)
          .map((v) => String(v).trim().toLowerCase());

        const matchesOrg =
          (cleanOrgId && eventOrgIds.some((id) => id === cleanOrgId || id.includes(cleanOrgId) || cleanOrgId.includes(id))) ||
          (cleanOrgName && eventOrgNames.some((name) => name === cleanOrgName || name.includes(cleanOrgName) || cleanOrgName.includes(name))) ||
          (!cleanOrgId && !cleanOrgName);

        return matchesOrg;
      }
    });
  }, [allEvents, existingPars, userRole, orgId, orgName, takenEventIds]);

  return { eligibleEvents, loading, takenEventIds };
}
