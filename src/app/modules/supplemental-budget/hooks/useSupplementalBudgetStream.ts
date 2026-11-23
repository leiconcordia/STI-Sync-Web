/**
 * src/app/modules/supplemental-budget/hooks/useSupplementalBudgetStream.ts
 *
 * Real-time React hooks for Supplemental Budget Requests (SBR).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  subscribeToSupplementalBudgetRequests,
  subscribeToEventSupplementalBudgets,
} from '../services/sbr.service';
import type { SupplementalBudgetRequest } from '../types/sbr.types';

export function useAllSupplementalBudgets() {
  const [data, setData] = useState<SupplementalBudgetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsub = subscribeToSupplementalBudgetRequests(
      (list) => {
        setData(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return { data, loading, error };
}

export function useEventSupplementalBudgets(eventId?: string | null) {
  const [data, setData] = useState<SupplementalBudgetRequest[]>([]);
  const [loading, setLoading] = useState(Boolean(eventId));

  useEffect(() => {
    if (!eventId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToEventSupplementalBudgets(eventId, (list) => {
      setData(list);
      setLoading(false);
    });
    return () => unsub();
  }, [eventId]);

  const approvedTotal = useMemo(
    () =>
      Math.round(
        data
          .filter((s) => s.status === 'approved')
          .reduce((sum, s) => sum + (Number(s.requestedAmount) || 0), 0) * 100
      ) / 100,
    [data]
  );

  const pendingRequest = useMemo(
    () =>
      data.find((s) =>
        ['draft', 'for_adviser_review', 'for_revision', 'approved_by_adviser', 'for_sas_review', 'pending_signatories'].includes(
          s.status
        )
      ) || null,
    [data]
  );

  return {
    data,
    loading,
    approvedTotal,
    approvedRequests: data.filter((s) => s.status === 'approved'),
    pendingRequest,
  };
}

export function useOrgSupplementalBudgets(organizationId?: string | null) {
  const { data: all, loading, error } = useAllSupplementalBudgets();
  const data = useMemo(() => {
    if (!organizationId) return [];
    const target = String(organizationId).trim().toLowerCase();
    return all.filter(
      (s) => String(s.organizationId || '').trim().toLowerCase() === target
    );
  }, [all, organizationId]);

  return { data, loading, error };
}
