import { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { EventDocument } from '../types/event.types';
import { isProposalFullySigned, isOfficerProposal } from '../utils/event-lifecycle.utils';
import { createSingletonStream, createKeyedSingletonStream } from '../../../utils/createSingletonStream';

interface RawEventsSnapshot {
  activitiesDocs: EventDocument[];
  legacyEventsDocs: EventDocument[];
  activitiesLoaded: boolean;
  legacyEventsLoaded: boolean;
}

const rawEventsStream = createSingletonStream<RawEventsSnapshot>({
  initialData: {
    activitiesDocs: [],
    legacyEventsDocs: [],
    activitiesLoaded: false,
    legacyEventsLoaded: false,
  },
  start: (emit, emitError) => {
    let state: RawEventsSnapshot = {
      activitiesDocs: [],
      legacyEventsDocs: [],
      activitiesLoaded: false,
      legacyEventsLoaded: false,
    };

    const unsubActivities = onSnapshot(
      collection(db, 'activities'),
      (snapshot) => {
        state = {
          ...state,
          activitiesDocs: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EventDocument)),
          activitiesLoaded: true,
        };
        emit(state);
      },
      (err) => {
        console.warn('Activities listener error:', err);
        state = { ...state, activitiesLoaded: true };
        emitError(err, state);
      }
    );

    const unsubLegacy = onSnapshot(
      collection(db, 'events'),
      (snapshot) => {
        state = {
          ...state,
          legacyEventsDocs: snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EventDocument)),
          legacyEventsLoaded: true,
        };
        emit(state);
      },
      () => {
        state = { ...state, legacyEventsLoaded: true };
        emit(state);
      }
    );

    return () => {
      unsubActivities();
      unsubLegacy();
    };
  },
});

export function subscribeRawEvents(listener: (data: RawEventsSnapshot, loading: boolean) => void) {
  return rawEventsStream.subscribe((state) => {
    const isStillLoading = !state.data.activitiesLoaded || !state.data.legacyEventsLoaded;
    listener(state.data, isStillLoading);
  });
}

export function peekCachedEventsById(eventId: string): EventDocument | null {
  const { data, isLoaded } = rawEventsStream.peekData();
  if (!isLoaded && data.activitiesDocs.length === 0 && data.legacyEventsDocs.length === 0) {
    return null;
  }
  return (
    data.activitiesDocs.find((e) => e.id === eventId) ||
    data.legacyEventsDocs.find((e) => e.id === eventId) ||
    null
  );
}

export function useAllEvents() {
  const { data: raw, loading: streamLoading, error } = rawEventsStream.use();

  const events = useMemo(() => {
    const map = new Map<string, EventDocument>();
    raw.legacyEventsDocs.forEach((e) => map.set(e.id, e));
    raw.activitiesDocs.forEach((act) => {
      const existing = map.get(act.id);
      if (existing) {
        const merged: EventDocument = { ...existing, ...act };
        const chain: any[] = (merged as any).approvalChain || [];
        const hasChain = Array.isArray(chain) && chain.length > 0;
        const fullySigned = isProposalFullySigned(chain);

        const isExplicitPending =
          merged.proposalStatus === 'pending' ||
          merged.proposalStatus === 'pending_review' ||
          merged.proposalStatus === 'under_review' ||
          merged.status === 'under_review' ||
          merged.status === 'pending' ||
          (merged as any).lifecycleStatus === 'pending_review';

        if (hasChain) {
          if (fullySigned) {
            merged.proposalStatus = 'approved';
            if (merged.status !== 'completed' && merged.status !== 'cancelled') {
              merged.status = 'approved';
            }
            if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
              merged.lifecycleStatus = 'approved';
            }
            merged.approvedAt = act.approvedAt || existing.approvedAt;
            merged.approvedBy = act.approvedBy || existing.approvedBy;
          } else if (isExplicitPending) {
            merged.proposalStatus = 'pending';
            if (merged.status !== 'completed' && merged.status !== 'cancelled') {
              merged.status = 'pending';
            }
            if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
              merged.lifecycleStatus = 'pending_review';
            }
          }
        } else {
          const isActApproved =
            act.proposalStatus === 'approved' ||
            act.status === 'approved' ||
            Boolean(act.approvedAt) ||
            Boolean(act.approvedBy);
          const isExistingApproved =
            existing.proposalStatus === 'approved' ||
            existing.status === 'approved' ||
            Boolean(existing.approvedAt) ||
            Boolean(existing.approvedBy);

          if (!isExplicitPending && (isExistingApproved || isActApproved)) {
            merged.proposalStatus = 'approved';
            if (merged.status !== 'completed' && merged.status !== 'cancelled') {
              merged.status = 'approved';
            }
            if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
              merged.lifecycleStatus = 'approved';
            }
            merged.approvedAt = act.approvedAt || existing.approvedAt;
            merged.approvedBy = act.approvedBy || existing.approvedBy;
          }
        }
        map.set(act.id, merged);
      } else {
        map.set(act.id, act);
      }
    });

    const combined = Array.from(map.values()).filter((e) => {
      if ((e as any).isDeleted === true) return false;
      const isDraft =
        e.proposalStatus === 'draft' ||
        e.status === 'draft' ||
        (e as any).lifecycleStatus === 'draft';
      const isReturnedOrgProp =
        isOfficerProposal(e) &&
        (Boolean((e as any).isReturned) || e.proposalStatus === 'returned' || e.status === 'returned');
      return !isDraft && !isReturnedOrgProp;
    });
    combined.sort((a, b) => {
      const aTime = (a.createdAt as any)?.seconds ?? (a.updatedAt as any)?.seconds ?? 0;
      const bTime = (b.createdAt as any)?.seconds ?? (b.updatedAt as any)?.seconds ?? 0;
      return bTime - aTime;
    });

    return combined;
  }, [raw]);

  const loading = streamLoading || !raw.activitiesLoaded || !raw.legacyEventsLoaded;
  return { events, loading, error };
}

const eventByIdStreams = createKeyedSingletonStream<EventDocument | null>((eventId) => ({
  initialData: null,
  start: (emit, emitError) => {
    let actData: EventDocument | null = null;
    let evtData: EventDocument | null = null;

    const updateMerged = () => {
      if (!actData && !evtData) {
        emit(null);
        return;
      }
      const merged: EventDocument = { ...(evtData || {}), ...(actData || {}) } as EventDocument;
      const chain: any[] = (merged as any).approvalChain || [];
      const hasChain = Array.isArray(chain) && chain.length > 0;
      const fullySigned = isProposalFullySigned(chain);

      const isExplicitPending =
        merged.proposalStatus === 'pending' ||
        merged.proposalStatus === 'pending_review' ||
        merged.proposalStatus === 'under_review' ||
        merged.status === 'under_review' ||
        merged.status === 'pending' ||
        (merged as any).lifecycleStatus === 'pending_review';

      if (hasChain) {
        if (fullySigned) {
          merged.proposalStatus = 'approved';
          if (merged.status !== 'completed' && merged.status !== 'cancelled') {
            merged.status = 'approved';
          }
          if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
            merged.lifecycleStatus = 'approved';
          }
          merged.approvedAt = actData?.approvedAt || evtData?.approvedAt;
          merged.approvedBy = actData?.approvedBy || evtData?.approvedBy;
        } else if (isExplicitPending) {
          merged.proposalStatus = 'pending';
          if (merged.status !== 'completed' && merged.status !== 'cancelled') {
            merged.status = 'pending';
          }
          if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
            merged.lifecycleStatus = 'pending_review';
          }
        }
      } else {
        const isActApproved =
          actData?.proposalStatus === 'approved' ||
          actData?.status === 'approved' ||
          Boolean(actData?.approvedAt) ||
          Boolean(actData?.approvedBy);
        const isEvtApproved =
          evtData?.proposalStatus === 'approved' ||
          evtData?.status === 'approved' ||
          Boolean(evtData?.approvedAt) ||
          Boolean(evtData?.approvedBy);

        if (!isExplicitPending && (isActApproved || isEvtApproved)) {
          merged.proposalStatus = 'approved';
          if (merged.status !== 'completed' && merged.status !== 'cancelled') {
            merged.status = 'approved';
          }
          if (merged.lifecycleStatus !== 'completed' && merged.lifecycleStatus !== 'cancelled') {
            merged.lifecycleStatus = 'approved';
          }
          merged.approvedAt = actData?.approvedAt || evtData?.approvedAt;
          merged.approvedBy = actData?.approvedBy || evtData?.approvedBy;
        }
      }
      emit(merged);
    };

    const unsubActivities = onSnapshot(
      doc(db, 'activities', eventId),
      (snapshot) => {
        actData = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as EventDocument) : null;
        updateMerged();
      },
      (err) => {
        console.error('Error fetching activity by ID:', err);
        emitError(err);
      }
    );

    const unsubLegacy = onSnapshot(
      doc(db, 'events', eventId),
      (legacySnap) => {
        evtData = legacySnap.exists() ? ({ id: legacySnap.id, ...legacySnap.data() } as EventDocument) : null;
        updateMerged();
      },
      () => {}
    );

    return () => {
      unsubActivities();
      unsubLegacy();
    };
  },
}));

export function useEventById(eventId: string | undefined) {
  const [event, setEvent] = useState<EventDocument | null>(() => {
    if (!eventId) return null;
    const state = eventByIdStreams.getOrCreate(eventId).getState();
    return state.data;
  });
  const [loading, setLoading] = useState(() => {
    if (!eventId) return false;
    return eventByIdStreams.getOrCreate(eventId).getState().loading;
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      setLoading(false);
      setError(null);
      return;
    }

    const stream = eventByIdStreams.getOrCreate(eventId);
    const current = stream.getState();
    setEvent(current.data);
    setLoading(current.loading);
    setError(current.error);

    return stream.subscribe((next) => {
      setEvent(next.data);
      setLoading(next.loading);
      setError(next.error);
    });
  }, [eventId]);

  return { event, loading, error };
}

const draftEventsStream = createSingletonStream<EventDocument[]>({
  initialData: [],
  start: (emit) => {
    let actDrafts: EventDocument[] = [];
    let legDrafts: EventDocument[] = [];

    const updateCombined = () => {
      const map = new Map<string, EventDocument>();
      legDrafts.forEach((d) => map.set(d.id, d));
      actDrafts.forEach((d) => map.set(d.id, d));

      const combined = Array.from(map.values()).filter((d: any) => d.isDeleted !== true);
      combined.sort((a, b) => {
        const aTime = (a.updatedAt as any)?.seconds ?? 0;
        const bTime = (b.updatedAt as any)?.seconds ?? 0;
        return bTime - aTime;
      });
      emit(combined);
    };

    const unsubAct = onSnapshot(
      query(collection(db, 'activities'), where('proposalStatus', '==', 'draft')),
      (snapshot) => {
        actDrafts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EventDocument));
        updateCombined();
      },
      () => emit([])
    );

    const unsubLeg = onSnapshot(
      query(collection(db, 'events'), where('proposalStatus', '==', 'draft')),
      (snapshot) => {
        legDrafts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EventDocument));
        updateCombined();
      },
      () => {}
    );

    return () => {
      unsubAct();
      unsubLeg();
    };
  },
});

export function useDraftEvents() {
  const { data: drafts, loading, error } = draftEventsStream.use();
  return { drafts, loading, error };
}

/**
 * Derives org-filtered events directly from the shared singleton activities/events cache,
 * eliminating duplicate full-collection Firestore subscriptions while preserving identical filtering.
 */
export function useOrgEvents(orgId: string | null | undefined) {
  const { data: raw, loading: streamLoading, error } = rawEventsStream.use();

  const events = useMemo(() => {
    const map = new Map<string, EventDocument>();
    raw.legacyEventsDocs.forEach((d) => map.set(d.id, d));
    raw.activitiesDocs.forEach((d) => map.set(d.id, d));

    let fetched = Array.from(map.values()).filter((e: any) => e.isDeleted !== true);

    if (orgId && orgId.trim()) {
      const cleanOrgId = orgId.trim().toLowerCase();
      const isQueryingSas = ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(cleanOrgId);

      fetched = fetched.filter((e: any) => {
        const ref = (e.referenceId || e.referenceNo || '').toString().toUpperCase();
        const isSasEvent = ref.includes('-SAS-') || ref.startsWith('EVT-ADM-') || e.isSasDirect === true || e.creatorRole === 'sas_admin';

        if (!isQueryingSas && isSasEvent) {
          return false;
        }

        const orgFields = [
          e.hostingOrgId,
          e.organizationId,
          e.createdByOrgId,
          e.orgId,
          e.hostingOrgName,
          e.orgName,
        ];
        return orgFields.some(
          (f) => f && String(f).trim().toLowerCase().includes(cleanOrgId)
        );
      });
    }

    fetched.sort((a, b) => {
      const aTime = (a.createdAt as any)?.seconds ?? (a.updatedAt as any)?.seconds ?? 0;
      const bTime = (b.createdAt as any)?.seconds ?? (b.updatedAt as any)?.seconds ?? 0;
      return bTime - aTime;
    });

    return fetched;
  }, [raw, orgId]);

  const loading = streamLoading || !raw.activitiesLoaded;
  return { events, loading, error };
}

// Aliases for modern activities terminology
export const useAllActivities = useAllEvents;
export const useActivityById = useEventById;
export const useDraftActivities = useDraftEvents;
export const useOrgActivities = useOrgEvents;
