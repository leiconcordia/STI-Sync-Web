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
import { isSbrDisbursedForLiquidation } from '../utils/sbr-validation.utils';
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

  const approvedRequests = useMemo(
    () => data.filter((s) => !s.isDeleted && s.status === 'approved'),
    [data]
  );

  const disbursedRequests = useMemo(
    () => approvedRequests.filter((s) => isSbrDisbursedForLiquidation(s)),
    [approvedRequests]
  );

  const awaitingReleaseRequests = useMemo(
    () => approvedRequests.filter((s) => !isSbrDisbursedForLiquidation(s)),
    [approvedRequests]
  );

  const approvedTotal = useMemo(
    () =>
      Math.round(
        approvedRequests.reduce((sum, s) => sum + (Number(s.requestedAmount) || 0), 0) * 100
      ) / 100,
    [approvedRequests]
  );

  const disbursedTotal = useMemo(
    () =>
      Math.round(
        disbursedRequests.reduce((sum, s) => sum + (Number(s.requestedAmount) || 0), 0) * 100
      ) / 100,
    [disbursedRequests]
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
    disbursedTotal,
    approvedRequests,
    disbursedRequests,
    awaitingReleaseRequests,
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
