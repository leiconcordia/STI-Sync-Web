import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { EventDocument } from '../types/event.types';
import { ACTIVITIES_COLLECTION, EVENTS_COLLECTION } from '../services/event.service';

import { isProposalFullySigned, isOfficerProposal } from '../utils/event-lifecycle.utils';

export function useAllEvents() {
  const [events, setEvents] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let activitiesDocs: EventDocument[] = [];
    let legacyEventsDocs: EventDocument[] = [];

    const updateCombined = () => {
      // Merge by ID: activities collection combined with legacy events
      const map = new Map<string, EventDocument>();
      legacyEventsDocs.forEach((e) => map.set(e.id, e));
      activitiesDocs.forEach((act) => {
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

      setEvents(combined);
      setLoading(false);
    };

    // Primary: activities collection
    const unsubActivities = onSnapshot(
      collection(db, 'activities'),
      (snapshot) => {
        activitiesDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventDocument));
        updateCombined();
      },
      (err) => {
        console.warn('Activities listener error:', err);
        setLoading(false);
      }
    );

    // Fallback/Legacy: events collection
    const unsubLegacy = onSnapshot(
      collection(db, 'events'),
      (snapshot) => {
        legacyEventsDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventDocument));
        updateCombined();
      },
      () => {
        // Silently ignore if events collection doesn't exist or is empty
      }
    );

    return () => {
      unsubActivities();
      unsubLegacy();
    };
  }, []);

  return { events, loading, error };
}

export function useEventById(eventId: string | undefined) {
  const [event, setEvent] = useState<EventDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      setLoading(false);
      return;
    }

    let actData: EventDocument | null = null;
    let evtData: EventDocument | null = null;

    const updateMerged = () => {
      if (!actData && !evtData) {
        setEvent(null);
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
      setEvent(merged);
      setLoading(false);
    };

    const unsubActivities = onSnapshot(
      doc(db, 'activities', eventId),
      (snapshot) => {
        if (snapshot.exists()) {
          actData = { id: snapshot.id, ...snapshot.data() } as EventDocument;
        } else {
          actData = null;
        }
        updateMerged();
      },
      (err) => {
        console.error('Error fetching activity by ID:', err);
        setError(err);
        setLoading(false);
      }
    );

    const unsubLegacy = onSnapshot(
      doc(db, 'events', eventId),
      (legacySnap) => {
        if (legacySnap.exists()) {
          evtData = { id: legacySnap.id, ...legacySnap.data() } as EventDocument;
        } else {
          evtData = null;
        }
        updateMerged();
      },
      () => {
        // Silently ignore legacy events error
      }
    );

    return () => {
      unsubActivities();
      unsubLegacy();
    };
  }, [eventId]);

  return { event, loading, error };
}

export function useDraftEvents() {
  const [drafts, setDrafts] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let actDrafts: EventDocument[] = [];
    let legDrafts: EventDocument[] = [];

    const updateCombined = () => {
      const map = new Map<string, EventDocument>();
      legDrafts.forEach((d) => map.set(d.id, d));
      actDrafts.forEach((d) => map.set(d.id, d));

      const combined = Array.from(map.values());
      combined.sort((a, b) => {
        const aTime = (a.updatedAt as any)?.seconds ?? 0;
        const bTime = (b.updatedAt as any)?.seconds ?? 0;
        return bTime - aTime;
      });
      setDrafts(combined);
      setLoading(false);
    };

    const unsubAct = onSnapshot(
      query(collection(db, 'activities'), where('proposalStatus', '==', 'draft')),
      (snapshot) => {
        actDrafts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventDocument));
        updateCombined();
      },
      () => setLoading(false)
    );

    const unsubLeg = onSnapshot(
      query(collection(db, 'events'), where('proposalStatus', '==', 'draft')),
      (snapshot) => {
        legDrafts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventDocument));
        updateCombined();
      },
      () => {}
    );

    return () => {
      unsubAct();
      unsubLeg();
    };
  }, []);

  return { drafts, loading, error };
}

export function useOrgEvents(orgId: string | null | undefined) {
  const [events, setEvents] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let actDocs: EventDocument[] = [];
    let legDocs: EventDocument[] = [];

    const updateCombined = () => {
      const map = new Map<string, EventDocument>();
      legDocs.forEach((d) => map.set(d.id, d));
      actDocs.forEach((d) => map.set(d.id, d));

      let fetched = Array.from(map.values());

      if (orgId && orgId.trim()) {
        const cleanOrgId = orgId.trim().toLowerCase();
        fetched = fetched.filter((e: any) => {
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

      setEvents(fetched);
      setLoading(false);
    };

    const unsubAct = onSnapshot(
      collection(db, 'activities'),
      (snapshot) => {
        actDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventDocument));
        updateCombined();
      },
      (err) => {
        console.error('[useOrgEvents] Error streaming activities:', err);
        setLoading(false);
      }
    );

    const unsubLeg = onSnapshot(
      collection(db, 'events'),
      (snapshot) => {
        legDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventDocument));
        updateCombined();
      },
      () => {}
    );

    return () => {
      unsubAct();
      unsubLeg();
    };
  }, [orgId]);

  return { events, loading, error };
}

// Aliases for modern activities terminology
export const useAllActivities = useAllEvents;
export const useActivityById = useEventById;
export const useDraftActivities = useDraftEvents;
export const useOrgActivities = useOrgEvents;

