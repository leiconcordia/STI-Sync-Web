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
import { subscribeToSupplementalBudgetRequests } from '../../modules/supplemental-budget/services/sbr.service';
import { isSignatoryTurnForSbr } from '../../modules/supplemental-budget/utils/sbr-validation.utils';
import type { SupplementalBudgetRequest } from '../../modules/supplemental-budget/types/sbr.types';
import { useAllLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import { useAllPARsForSignatories } from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import { isSignatoryApplicableTo } from '../../modules/signatories/types/signatory.types';
import { matchesSignatoryOrSubstituteStep } from '../../modules/signatories/utils/signatory-substitute.utils';
import { isHiddenFromSasAndSignatories } from '../../modules/activity-proposals/utils/proposal-status-tracker.utils';
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
  const [allSbrs, setAllSbrs] = useState<SupplementalBudgetRequest[]>([]);
  const [sbrsLoading, setSbrsLoading] = useState(true);

  const { liquidations: allLiquidations, loading: liquidationsLoading, error: liquidationsError } = useAllLiquidations();
  const { pars: allPARs, loading: parsLoading, error: parsError } = useAllPARsForSignatories();

  const matchesSignatory = (step: any) => matchesSignatoryOrSubstituteStep(step, session);

  // Subscribe to Activity Proposals
  useEffect(() => {
    const unsubscribe = subscribeToProposals((list) => {
      setAllProposals(list);
      setProposalsError(null);
      setProposalsLoading(false);
    }, undefined, (error) => { setProposalsError(error); setProposalsLoading(false); });
    return () => unsubscribe();
  }, []);

  // Subscribe to Supplemental Budget Requests (School Budget / Institutional Signatories only)
  useEffect(() => {
    const unsubscribe = subscribeToSupplementalBudgetRequests(
      (list) => {
        setAllSbrs(list);
        setSbrsLoading(false);
      },
      () => setSbrsLoading(false)
    );
    return () => unsubscribe();
  }, []);

  const canAccessProposal = session ? isSignatoryApplicableTo(session, 'proposal') : true;
  const canAccessLiquidation = session ? isSignatoryApplicableTo(session, 'liquidation') : true;
  const canAccessPAR = session ? isSignatoryApplicableTo(session, 'par') : true;

  // Filter Activity Proposals
  const { pendingProposals, endorsedProposals, returnedProposals } = useMemo(() => {
    const pending: ActivityProposal[] = [];
    const endorsed: ActivityProposal[] = [];
    const returned: ActivityProposal[] = [];

    allProposals.forEach((p) => {
      if (
        !p ||
        p.isDeleted === true ||
        isHiddenFromSasAndSignatories(p) ||
        ['voided', 'deleted'].includes(String(p.status || '').toLowerCase())
      ) {
        return;
      }
      const isActiveLifecycleDoc = isCurrentDocument(p);
      const chain = p.approvalChain || [];
      const currentIdx = p.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isReturnedStatus = isActiveLifecycleDoc && isDocumentCurrentlyReturned(p);
      const hasPersonallySigned = !isReturnedStatus && (
        chain.some((s) => hasSignatorySignedStep(s, session)) ||
        hasSignatorySignedDocument(p, session)
      );
      const isApprovedStatus =
        isActiveLifecycleDoc &&
        !isReturnedStatus &&
        (p.status === 'approved_president' ||
          (p as any).proposalStatus === 'approved' ||
          (p as any).lifecycleStatus === 'approved' ||
          (p as any).isApproved === true);
      const isOrgSchoolBudget =
        Boolean((p as any).isOfficerProposal) && (p as any).fundingSource !== 'organization_funds';
      const hasAnySignature = chain.some((s) => s.status === 'endorsed' || s.status === 'approved');
      const isAwaitingSasGate =
        (p as any).isPendingSasVetting === true ||
        (isOrgSchoolBudget &&
          !(p as any).sasVettedAt &&
          (p as any).isPendingSasVetting !== false &&
          !hasAnySignature);

      const isUnderReview =
        !isReturnedStatus &&
        !isApprovedStatus &&
        !isAwaitingSasGate &&
        (p.status === 'under_review' ||
        (p as any).proposalStatus === 'pending' ||
        (p as any).proposalStatus === 'pending_review' ||
        (p as any).proposalStatus === 'under_review');

      if (isActiveLifecycleDoc && canAccessProposal && !hasPersonallySigned) {
        if (isUnderReview) {
          const currentStage = p.currentStageIndex ?? 1;
          const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

          if (hasStages) {
            const isMyTurnInStage = chain.some((s) => {
              const inStage = (s.stageIndex ?? 1) === currentStage;
              const isPending = s.status === 'current' || (!s.status && inStage);
              const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved' && s.status !== 'waived';
              return inStage && isPending && isNotSigned && matchesSignatory(s);
            });

            if (isMyTurnInStage) {
              pending.push(p);
            }
          } else if (matchesSignatory(currentStep)) {
            pending.push(p);
          }
        } else if (isApprovedStatus) {
          const hasUnsignedStepForMe = chain.some(
            (s) =>
              s.status !== 'endorsed' &&
              s.status !== 'approved' &&
              s.status !== 'waived' &&
              s.status !== 'returned' &&
              s.status !== 'returned_for_revision' &&
              s.status !== 'rejected' &&
              matchesSignatory(s)
          );
          if (hasUnsignedStepForMe) {
            pending.push(p);
          }
        }
      }

      // Signed History & Archive: Strictly per-signatory!
      // Must NOT be returned, AND this signatory must have personally signed it.
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
    const pending: LiquidationDocument[] = [];
    const endorsed: LiquidationDocument[] = [];
    const returned: LiquidationDocument[] = [];

    allLiquidations.forEach((l) => {
      if (!isCurrentDocument(l) || isHiddenFromSasAndSignatories(l)) return;
      const chain = l.approvalChain || [];
      const currentIdx = l.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isReturnedStatus = isDocumentCurrentlyReturned(l);
      const hasPersonallySigned = !isReturnedStatus && (
        chain.some((s) => hasSignatorySignedStep(s, session)) ||
        hasSignatorySignedDocument(l, session)
      );
      const isApprovedStatus = !isReturnedStatus && l.status === 'approved';
      const isUnderReview =
        !isReturnedStatus &&
        !isApprovedStatus &&
        (l as any).isPendingSasVetting !== true &&
        (l.status === 'under_review' || l.status === 'pending');

      if (canAccessLiquidation && !hasPersonallySigned) {
        if (isUnderReview) {
          const currentStage = l.currentStageIndex ?? 1;
          const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

          if (hasStages) {
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
        } else if (isApprovedStatus) {
          const hasUnsignedStepForMe = chain.some(
            (s) =>
              s.status !== 'endorsed' &&
              s.status !== 'approved' &&
              s.status !== 'waived' &&
              s.status !== 'returned' &&
              s.status !== 'returned_for_revision' &&
              s.status !== 'rejected' &&
              matchesSignatory(s)
          );
          if (hasUnsignedStepForMe) {
            pending.push(l);
          }
        }
      }

      // Signed History & Archive: Strictly per-signatory!
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
    const pending: PostActivityReportDocument[] = [];
    const endorsed: PostActivityReportDocument[] = [];
    const returned: PostActivityReportDocument[] = [];

    allPARs.forEach((par) => {
      if (!isCurrentDocument(par) || isHiddenFromSasAndSignatories(par)) return;
      const chain = par.approvalChain || [];
      const currentIdx = par.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isReturnedStatus = isDocumentCurrentlyReturned(par);
      const hasPersonallySigned = !isReturnedStatus && (
        chain.some((s) => hasSignatorySignedStep(s, session)) ||
        hasSignatorySignedDocument(par, session)
      );
      const isApprovedStatus = !isReturnedStatus && par.status === 'approved';
      const isUnderReview =
        !isReturnedStatus &&
        !isApprovedStatus &&
        (par as any).isPendingSasVetting !== true &&
        (par.status === 'under_review' ||
        par.status === 'pending' ||
        (par as any).reportStatus === 'submitted');

      if (canAccessPAR && !hasPersonallySigned) {
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
        } else if (isApprovedStatus) {
          const hasUnsignedStepForMe = chain.some(
            (s) =>
              s.status !== 'endorsed' &&
              s.status !== 'approved' &&
              s.status !== 'waived' &&
              s.status !== 'returned' &&
              s.status !== 'returned_for_revision' &&
              s.status !== 'rejected' &&
              matchesSignatory(s)
          );
          if (hasUnsignedStepForMe) {
            pending.push(par);
          }
        }
      }

      // Signed History & Archive: Strictly per-signatory!
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

  const { pendingSbrs, endorsedSbrs, returnedSbrs } = useMemo(() => {
    const pending: SupplementalBudgetRequest[] = [];
    const endorsed: SupplementalBudgetRequest[] = [];
    const returned: SupplementalBudgetRequest[] = [];

    allSbrs.forEach((sbr) => {
      if (
        !sbr ||
        sbr.isDeleted ||
        !sbr.requiresSignatories ||
        sbr.isPendingSasVetting ||
        isHiddenFromSasAndSignatories(sbr)
      ) {
        return;
      }

      const chain = sbr.approvalChain || [];
      const hasSignedPersonally = chain.some(
        (step: any) =>
          step &&
          (step.status === 'approved' || step.status === 'endorsed') &&
          matchesSignatory(step)
      );

      if (canAccessProposal && sbr.status === 'pending_signatories' && !hasSignedPersonally) {
        const isMyTurn = isSignatoryTurnForSbr(sbr, {
          uid: session?.uid,
          id: session?.id,
          email: session?.email,
          role: session?.role,
          roleTitle: session?.roleTitle,
          actingAsSubstitute: session?.actingAsSubstitute,
          delegatedForSignatoryId: session?.delegatedForSignatoryId,
          delegatedForSignatoryUid: session?.delegatedForSignatoryUid,
          delegatedForSignatoryEmail: session?.delegatedForSignatoryEmail,
          delegatedForRoleTitle: session?.delegatedForRoleTitle,
        });
        if (isMyTurn) {
          pending.push(sbr);
        }
      }

      if (hasSignedPersonally) {
        endorsed.push(sbr);
      }

      if ((sbr.status === 'for_revision' || sbr.isReturned) && chain.some(matchesSignatory)) {
        returned.push(sbr);
      }
    });

    return { pendingSbrs: pending, endorsedSbrs: endorsed, returnedSbrs: returned };
  }, [allSbrs, session, canAccessProposal]);

  const totalPending =
    pendingProposals.length + pendingSbrs.length + pendingLiquidations.length + pendingPARs.length;
  const totalSigned =
    endorsedProposals.length + endorsedSbrs.length + endorsedLiquidations.length + endorsedPARs.length;
  const totalReturned =
    returnedProposals.length + returnedSbrs.length + returnedLiquidations.length + returnedPARs.length;
  const loading = proposalsLoading || sbrsLoading || liquidationsLoading || parsLoading;

  return {
    allProposals,
    allSbrs,
    allLiquidations,
    allPARs,
    pendingProposals,
    endorsedProposals,
    returnedProposals,
    pendingSbrs,
    endorsedSbrs,
    returnedSbrs,
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
