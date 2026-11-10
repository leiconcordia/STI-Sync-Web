import { useEffect, useMemo, useState } from 'react';
import { useAllEvents } from '../../modules/events/hooks/useEventStream';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useActiveAcademicPeriods } from '../../modules/academic/hooks/useAcademicStream';
import { isSignatoryApplicableTo } from '../../modules/signatories/types/signatory.types';
import { buildCampusActivityRows, documentStatus } from '../utils/campus-activity-report';
import type { useSignatoryDocuments } from './useSignatoryDocuments';

export type SignatoryDocuments = ReturnType<typeof useSignatoryDocuments>;

/** Accept the existing document subscription so dashboard/report do not duplicate it. */
export function useCampusActivityData(documents: SignatoryDocuments, session: any) {
  const { events, loading: eventsLoading, error: eventsError } = useAllEvents();
  const { data: organizations = [], loading: orgsLoading, error: orgsError } = useOrganizationStream();
  const { periods = [], loading: periodsLoading, error: periodsError } = useActiveAcademicPeriods();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const pendingIds = useMemo(() => new Set([
    ...documents.pendingProposals, ...documents.pendingLiquidations, ...documents.pendingPARs,
  ].map((record) => record.id)), [documents.pendingProposals, documents.pendingLiquidations, documents.pendingPARs]);
  const rows = useMemo(() => buildCampusActivityRows({
    events, proposals: documents.allProposals, liquidations: documents.allLiquidations,
    pars: documents.allPARs, organizations, periods, pendingIds, now,
  }), [events, documents.allProposals, documents.allLiquidations, documents.allPARs, organizations, periods, pendingIds, now]);
  const inspectable = useMemo(() => {
    const authorized = (records: any[], previouslyVisible: any[], workflow: 'proposal' | 'liquidation' | 'par') => new Set([
      ...previouslyVisible,
      ...(session && isSignatoryApplicableTo(session, workflow) ? records.filter((record) => documentStatus(record) === 'approved') : []),
    ].map((record) => record.id));
    return {
      proposal: authorized(documents.allProposals, [...documents.pendingProposals, ...documents.endorsedProposals, ...documents.returnedProposals], 'proposal'),
      liquidation: authorized(documents.allLiquidations, [...documents.pendingLiquidations, ...documents.endorsedLiquidations, ...documents.returnedLiquidations], 'liquidation'),
      par: authorized(documents.allPARs, [...documents.pendingPARs, ...documents.endorsedPARs, ...documents.returnedPARs], 'par'),
    };
  }, [documents, session]);
  return {
    rows, organizations, periods, inspectable,
    loading: documents.loading || eventsLoading || orgsLoading || periodsLoading,
    error: documents.error || eventsError || orgsError || periodsError,
  };
}
