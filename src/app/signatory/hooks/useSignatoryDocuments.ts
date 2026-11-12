/**
 * src/app/signatory/hooks/useSignatoryDocuments.ts
 *
 * Real-time synchronization hook for institutional signatories.
 * Enforces strict stage-lock privacy (no future-stage leakage)
 * across Activity Proposals, Financial Liquidations, and Post-Activity Reports.
 */

import { useState, useEffect, useMemo } from 'react';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import { subscribeToProposals } from '../../modules/activity-proposals/services/proposal.service';
import { useAllLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import { useAllPARsForSignatories } from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import { isSignatoryApplicableTo } from '../../modules/signatories/types/signatory.types';
import {
  documentStatus,
  isCurrentDocument,
  isDocumentCurrentlyReturned,
  hasSignatorySignedStep,
  hasSignatorySignedDocument,
} from '../utils/campus-activity-report';

export function useSignatoryDocuments(session: any) {
  const [allProposals, setAllProposals] = useState<ActivityProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalsError, setProposalsError] = useState<Error | null>(null);

  const { liquidations: allLiquidations, loading: liquidationsLoading, error: liquidationsError } = useAllLiquidations();
  const { pars: allPARs, loading: parsLoading, error: parsError } = useAllPARsForSignatories();

  const userUid = session?.id || session?.uid;
  const userEmail = (session?.email || '').toLowerCase().trim();
  const userRole = session?.role || '';
  const userRoleTitle = (session?.roleTitle || '').toLowerCase().trim();

  const matchesSignatory = (step: any) => {
    if (!step) return false;
    const stepUid = step.signatoryUid || step.signedByUid;
    const stepEmail = (step.signatoryEmail || step.signedByEmail || '').toLowerCase().trim();

    if (stepUid) {
      return Boolean(userUid && stepUid === userUid);
    }
    if (stepEmail) {
      return Boolean(userEmail && stepEmail === userEmail);
    }

    if (step.role && userRole && step.role.toLowerCase() === userRole.toLowerCase()) return true;
    if (step.roleTitle && userRoleTitle) {
      const sTitle = step.roleTitle.toLowerCase();
      if (sTitle === userRoleTitle || sTitle.includes(userRoleTitle) || userRoleTitle.includes(sTitle)) return true;
    }
    return false;
  };

  // Subscribe to Activity Proposals
  useEffect(() => {
    const unsubscribe = subscribeToProposals((list) => {
      setAllProposals(list);
      setProposalsError(null);
      setProposalsLoading(false);
    }, undefined, (error) => { setProposalsError(error); setProposalsLoading(false); });
    return () => unsubscribe();
  }, []);

  const canAccessProposal = session ? isSignatoryApplicableTo(session, 'proposal') : true;
  const canAccessLiquidation = session ? isSignatoryApplicableTo(session, 'liquidation') : true;
  const canAccessPAR = session ? isSignatoryApplicableTo(session, 'par') : true;

  // Filter Activity Proposals
  const { pendingProposals, endorsedProposals, returnedProposals } = useMemo(() => {
    if (!canAccessProposal) {
      return { pendingProposals: [], endorsedProposals: [], returnedProposals: [] };
    }
    const pending: ActivityProposal[] = [];
    const endorsed: ActivityProposal[] = [];
    const returned: ActivityProposal[] = [];

    allProposals.forEach((p) => {
      if (!isCurrentDocument(p)) return;
      const chain = p.approvalChain || [];
      const currentIdx = p.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isReturnedStatus = isDocumentCurrentlyReturned(p);

      const isUnderReview =
        !isReturnedStatus &&
        (p.status === 'under_review' ||
        (p as any).proposalStatus === 'pending' ||
        (p as any).proposalStatus === 'pending_review');

      if (isUnderReview) {
        const currentStage = p.currentStageIndex ?? 1;
        const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

        if (hasStages) {
          // Strictly show only when it is my stage and my turn right now
          const isMyTurnInStage = chain.some((s) => {
            const inStage = (s.stageIndex ?? 1) === currentStage;
            const isPending = s.status === 'current' || (!s.status && inStage);
            const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved' && s.status !== 'waived';
            return inStage && isPending && isNotSigned && matchesSignatory(s);
          });

          // Future stage signatories CANNOT see the proposal
          if (isMyTurnInStage) {
            pending.push(p);
          }
        } else if (matchesSignatory(currentStep)) {
          pending.push(p);
        }
      }

      // Signed History & Archive: Strictly per-signatory!
      // Must NOT be returned, AND this signatory must have personally signed it.
      const hasPersonallySigned = !isReturnedStatus && (
        chain.some((s) => hasSignatorySignedStep(s, session)) ||
        hasSignatorySignedDocument(p, session)
      );
      if (hasPersonallySigned) {
        endorsed.push(p);
      }

      // Returned for Revision: Strictly documents currently in returned status!
      if (isReturnedStatus) {
        const hasReturnedStep = chain.some(
          (s) => (s.status === 'returned' || s.status === 'returned_for_revision') && matchesSignatory(s)
        );
        const isInvolvedInChain = chain.some(matchesSignatory);
        if (hasReturnedStep || isInvolvedInChain) {
          returned.push(p);
        }
      }
    });

    return {
      pendingProposals: pending,
      endorsedProposals: endorsed,
      returnedProposals: returned,
    };
  }, [allProposals, session, canAccessProposal]);

  // Filter Financial Liquidations
  const { pendingLiquidations, endorsedLiquidations, returnedLiquidations } = useMemo(() => {
    if (!canAccessLiquidation) {
      return { pendingLiquidations: [], endorsedLiquidations: [], returnedLiquidations: [] };
    }
    const pending: LiquidationDocument[] = [];
    const endorsed: LiquidationDocument[] = [];
    const returned: LiquidationDocument[] = [];

    allLiquidations.forEach((l) => {
      if (!isCurrentDocument(l)) return;
      const chain = l.approvalChain || [];
      const currentIdx = l.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isReturnedStatus = isDocumentCurrentlyReturned(l);
      const isUnderReview = !isReturnedStatus && (l.status === 'under_review' || l.status === 'pending');

      if (isUnderReview) {
        const currentStage = l.currentStageIndex ?? 1;
        const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

        if (hasStages) {
          // Strictly show only when it is my stage and my turn right now
          const isMyTurnInStage = chain.some((s) => {
            const inStage = (s.stageIndex ?? 1) === currentStage;
            const isPending = s.status === 'current' || (!s.status && inStage);
            const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved' && s.status !== 'waived';
            return inStage && isPending && isNotSigned && matchesSignatory(s);
          });

          if (isMyTurnInStage) {
            pending.push(l);
          }
        } else if (matchesSignatory(currentStep)) {
          pending.push(l);
        }
      }

      // Signed History & Archive: Strictly per-signatory!
      const hasPersonallySigned = !isReturnedStatus && (
        chain.some((s) => hasSignatorySignedStep(s, session)) ||
        hasSignatorySignedDocument(l, session)
      );
      if (hasPersonallySigned) {
        endorsed.push(l);
      }

      // Returned for Revision: Strictly documents currently in returned status!
      if (isReturnedStatus) {
        const hasReturnedStep = chain.some(
          (s) => ['returned', 'returned_for_revision', 'rejected'].includes(s.status) && matchesSignatory(s)
        );
        const isInvolvedInChain = chain.some(matchesSignatory);
        if (hasReturnedStep || isInvolvedInChain) {
          returned.push(l);
        }
      }
    });

    return {
      pendingLiquidations: pending,
      endorsedLiquidations: endorsed,
      returnedLiquidations: returned,
    };
  }, [allLiquidations, session, canAccessLiquidation]);

  // Filter Post-Activity Reports
  const { pendingPARs, endorsedPARs, returnedPARs } = useMemo(() => {
    if (!canAccessPAR) {
      return { pendingPARs: [], endorsedPARs: [], returnedPARs: [] };
    }
    const pending: PostActivityReportDocument[] = [];
    const endorsed: PostActivityReportDocument[] = [];
    const returned: PostActivityReportDocument[] = [];

    allPARs.forEach((par) => {
      if (!isCurrentDocument(par)) return;
      const chain = par.approvalChain || [];
      const currentIdx = par.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isReturnedStatus = isDocumentCurrentlyReturned(par);
      const isUnderReview =
        !isReturnedStatus &&
        (par.status === 'under_review' ||
        par.status === 'pending' ||
        (par as any).reportStatus === 'submitted');

      if (isUnderReview) {
        const currentStage = par.currentStageIndex ?? 1;
        const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

        if (hasStages) {
          const isMyTurnInStage = chain.some((s) => {
            const inStage = (s.stageIndex ?? 1) === currentStage;
            const isPending = s.status === 'current' || (!s.status && inStage);
            const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved' && s.status !== 'waived';
            return inStage && isPending && isNotSigned && matchesSignatory(s);
          });

          if (isMyTurnInStage) {
            pending.push(par);
          }
        } else if (matchesSignatory(currentStep)) {
          pending.push(par);
        }
      }

      // Signed History & Archive: Strictly per-signatory!
      const hasPersonallySigned = !isReturnedStatus && (
        chain.some((s) => hasSignatorySignedStep(s, session)) ||
        hasSignatorySignedDocument(par, session)
      );
      if (hasPersonallySigned) {
        endorsed.push(par);
      }

      // Returned for Revision: Strictly documents currently in returned status!
      if (isReturnedStatus) {
        const hasReturnedStep = chain.some(
          (s) => ['returned', 'returned_for_revision', 'rejected'].includes(s.status) && matchesSignatory(s)
        );
        const isInvolvedInChain = chain.some(matchesSignatory);
        if (hasReturnedStep || isInvolvedInChain) {
          returned.push(par);
        }
      }
    });

    return {
      pendingPARs: pending,
      endorsedPARs: endorsed,
      returnedPARs: returned,
    };
  }, [allPARs, session, canAccessPAR]);

  const totalPending = pendingProposals.length + pendingLiquidations.length + pendingPARs.length;
  const totalSigned = endorsedProposals.length + endorsedLiquidations.length + endorsedPARs.length;
  const totalReturned = returnedProposals.length + returnedLiquidations.length + returnedPARs.length;
  const loading = proposalsLoading || liquidationsLoading || parsLoading;

  return {
    allProposals,
    allLiquidations,
    allPARs,
    pendingProposals,
    endorsedProposals,
    returnedProposals,
    pendingLiquidations,
    endorsedLiquidations,
    returnedLiquidations,
    pendingPARs,
    endorsedPARs,
    returnedPARs,
    totalPending,
    totalSigned,
    totalReturned,
    loading,
    error: proposalsError || liquidationsError || parsError,
    matchesSignatory,
  };
}
