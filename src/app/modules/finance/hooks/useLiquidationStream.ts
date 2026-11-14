import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, query, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { LiquidationDocument } from '../types/liquidation.types';
import { LIQUIDATIONS_COLLECTION } from '../services/liquidation.service';
import { createSingletonStream, createKeyedSingletonStream } from '../../../utils/createSingletonStream';

const allLiquidationsStream = createSingletonStream<LiquidationDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = collection(db, LIQUIDATIONS_COLLECTION);
    return onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as LiquidationDocument))
          .filter((l: any) => l.isDeleted !== true);
        fetched.sort((a, b) => {
          const aTime = (a.updatedAt as any)?.seconds ?? 0;
          const bTime = (b.updatedAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });
        emit(fetched);
      },
      (err) => {
        console.error('[useAllLiquidations] Error streaming liquidations:', err);
        emitError(err);
      }
    );
  },
});

export function peekCachedLiquidationById(id: string): LiquidationDocument | null {
  const { data, isLoaded } = allLiquidationsStream.peekData();
  if (!isLoaded) return null;
  return data.find((l) => l.id === id) || null;
}

export function peekCachedLiquidationByEventId(eventId: string): LiquidationDocument | null {
  const { data, isLoaded } = allLiquidationsStream.peekData();
  if (!isLoaded) return null;
  const matches = data.filter((d: any) => d.eventId === eventId && d.status !== 'voided');
  if (matches.length === 0) return null;
  return (
    matches.find((d) => d.status === 'approved') ||
    matches.find((d) => d.status === 'under_review') ||
    matches[0]
  );
}

/**
 * Real-time stream of all Liquidation documents (for SAO Admin & Signatory view).
 * Shared singleton prevents duplicate full-collection reads across pages & modals.
 */
export function useAllLiquidations() {
  const { data: liquidations, loading, error } = allLiquidationsStream.use();
  return { liquidations, loading, error };
}

const orgLiquidationsStreams = createKeyedSingletonStream<LiquidationDocument[]>((orgId) => ({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(
      collection(db, LIQUIDATIONS_COLLECTION),
      where('organizationId', '==', orgId)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as LiquidationDocument))
          .filter((l: any) => l.isDeleted !== true);
        fetched.sort((a, b) => {
          const aTime = (a.updatedAt as any)?.seconds ?? 0;
          const bTime = (b.updatedAt as any)?.seconds ?? 0;
          return bTime - aTime;
        });
        emit(fetched);
      },
      (err) => {
        console.error('[useOrgLiquidations] Error streaming org liquidations:', err);
        emitError(err);
      }
    );
  },
}));

/**
 * Real-time stream of Liquidation documents for a specific organization (Officer View).
 * Reuses the global liquidations cache if already active, or uses a keyed singleton per orgId.
 */
export function useOrgLiquidations(orgId: string | null | undefined) {
  const globalPeek = allLiquidationsStream.peekData();
  const useGlobal = Boolean(orgId && globalPeek.isLoaded);

  const [liquidations, setLiquidations] = useState<LiquidationDocument[]>(() => {
    if (!orgId) return [];
    if (useGlobal) return globalPeek.data.filter((l) => l.organizationId === orgId);
    return orgLiquidationsStreams.getOrCreate(orgId).getState().data;
  });
  const [loading, setLoading] = useState(() => {
    if (!orgId) return false;
    if (useGlobal) return false;
    return orgLiquidationsStreams.getOrCreate(orgId).getState().loading;
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLiquidations([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (allLiquidationsStream.peekData().isLoaded) {
      return allLiquidationsStream.subscribe((next) => {
        setLiquidations(next.data.filter((l) => l.organizationId === orgId));
        setLoading(next.loading);
        setError(next.error);
      });
    }

    const stream = orgLiquidationsStreams.getOrCreate(orgId);
    const current = stream.getState();
    setLiquidations(current.data);
    setLoading(current.loading);
    setError(current.error);

    return stream.subscribe((next) => {
      setLiquidations(next.data);
      setLoading(next.loading);
      setError(next.error);
    });
  }, [orgId]);

  const memoized = useMemo(() => ({ liquidations, loading, error }), [liquidations, loading, error]);
  return memoized;
}

const liquidationByIdStreams = createKeyedSingletonStream<LiquidationDocument | null>((id) => ({
  initialData: null,
  start: (emit, emitError) => {
    const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          emit({ id: snapshot.id, ...snapshot.data() } as LiquidationDocument);
        } else {
          emit(null);
        }
      },
      (err) => {
        console.error('[useLiquidationById] Error fetching liquidation:', err);
        emitError(err);
      }
    );
  },
}));

/**
 * Real-time stream of a single Liquidation document by ID.
 */
export function useLiquidationById(id: string | null | undefined) {
  const [liquidation, setLiquidation] = useState<LiquidationDocument | null>(() => {
    if (!id) return null;
    return liquidationByIdStreams.getOrCreate(id).getState().data;
  });
  const [loading, setLoading] = useState(() => {
    if (!id) return false;
    return liquidationByIdStreams.getOrCreate(id).getState().loading;
  });
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) {
      setLiquidation(null);
      setLoading(false);
      setError(null);
      return;
    }

    const stream = liquidationByIdStreams.getOrCreate(id);
    const current = stream.getState();
    setLiquidation(current.data);
    setLoading(current.loading);
    setError(current.error);

    return stream.subscribe((next) => {
      setLiquidation(next.data);
      setLoading(next.loading);
      setError(next.error);
    });
  }, [id]);

  return { liquidation, loading, error };
}
