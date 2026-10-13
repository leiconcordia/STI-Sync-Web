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

export function useSignatoryDocuments(session: any) {
  const [allProposals, setAllProposals] = useState<ActivityProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);

  const { liquidations: allLiquidations, loading: liquidationsLoading } = useAllLiquidations();
  const { pars: allPARs, loading: parsLoading } = useAllPARsForSignatories();

  const userUid = session?.id || session?.uid;
  const userEmail = (session?.email || '').toLowerCase();
  const userRole = session?.role || '';
  const userRoleTitle = (session?.roleTitle || '').toLowerCase();

  const matchesSignatory = (step: any) => {
    if (!step) return false;
    if (step.signatoryUid && (step.signatoryUid === userUid || step.signatoryUid === session?.uid || step.signatoryUid === session?.id)) return true;
    if (step.signatoryEmail && userEmail && step.signatoryEmail.toLowerCase() === userEmail) return true;
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
      setProposalsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter Activity Proposals
  const { pendingProposals, endorsedProposals, returnedProposals } = useMemo(() => {
    const pending: ActivityProposal[] = [];
    const endorsed: ActivityProposal[] = [];
    const returned: ActivityProposal[] = [];

    allProposals.forEach((p) => {
      const chain = p.approvalChain || [];
      const currentIdx = p.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isUnderReview =
        p.status === 'under_review' ||
        (p as any).proposalStatus === 'pending' ||
        (p as any).proposalStatus === 'pending_review';

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

      const hasEndorsedStep = chain.some(
        (s) => (s.status === 'endorsed' || s.status === 'approved') && matchesSignatory(s)
      );
      if (hasEndorsedStep) {
        endorsed.push(p);
      }

      const isReturnedStatus =
        p.status === 'returned_for_revision' ||
        (p as any).proposalStatus === 'returned';

      if (isReturnedStatus) {
        const hasReturnedStep = chain.some(
          (s) => s.status === 'returned' && matchesSignatory(s)
        );
        if (hasReturnedStep) {
          returned.push(p);
        }
      }
    });

    return {
      pendingProposals: pending,
      endorsedProposals: endorsed,
      returnedProposals: returned,
    };
  }, [allProposals, session]);

  // Filter Financial Liquidations
  const { pendingLiquidations, endorsedLiquidations, returnedLiquidations } = useMemo(() => {
    const pending: LiquidationDocument[] = [];
    const endorsed: LiquidationDocument[] = [];
    const returned: LiquidationDocument[] = [];

    allLiquidations.forEach((l) => {
      const chain = l.approvalChain || [];
      const currentIdx = l.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isUnderReview = l.status === 'under_review' || l.status === 'pending';

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

      const hasEndorsedStep = chain.some(
        (s) => (s.status === 'endorsed' || s.status === 'approved') && matchesSignatory(s)
      );
      if (hasEndorsedStep) {
        endorsed.push(l);
      }

      const isReturnedStatus = l.status === 'returned_for_revision' || l.status === 'rejected';
      if (isReturnedStatus) {
        const hasReturnedStep = chain.some(
          (s) => (s.status === 'returned' || s.status === 'rejected') && matchesSignatory(s)
        );
        if (hasReturnedStep) {
          returned.push(l);
        }
      }
    });

    return {
      pendingLiquidations: pending,
      endorsedLiquidations: endorsed,
      returnedLiquidations: returned,
    };
  }, [allLiquidations, session]);

  // Filter Post-Activity Reports
  const { pendingPARs, endorsedPARs, returnedPARs } = useMemo(() => {
    const pending: PostActivityReportDocument[] = [];
    const endorsed: PostActivityReportDocument[] = [];
    const returned: PostActivityReportDocument[] = [];

    allPARs.forEach((par) => {
      const chain = par.approvalChain || [];
      const currentIdx = par.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isUnderReview =
        par.status === 'under_review' ||
        par.status === 'pending' ||
        (par as any).reportStatus === 'submitted';

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

      const hasEndorsedStep = chain.some(
        (s) => (s.status === 'endorsed' || s.status === 'approved') && matchesSignatory(s)
      );
      if (hasEndorsedStep) {
        endorsed.push(par);
      }

      const isReturnedStatus = par.status === 'returned_for_revision' || (par as any).reportStatus === 'returned';
      if (isReturnedStatus) {
        const hasReturnedStep = chain.some(
          (s) => s.status === 'returned' && matchesSignatory(s)
        );
        if (hasReturnedStep) {
          returned.push(par);
        }
      }
    });

    return {
      pendingPARs: pending,
      endorsedPARs: endorsed,
      returnedPARs: returned,
    };
  }, [allPARs, session]);

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
    matchesSignatory,
  };
}
