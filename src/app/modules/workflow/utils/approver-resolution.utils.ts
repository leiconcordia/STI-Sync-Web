/**
 * src/app/modules/workflow/utils/approver-resolution.utils.ts
 *
 * Pure, document-agnostic Runtime Single-Approval Governance utilities.
 *
 * Governance Model ("Flexible Multi-Approver at Design Time, Single Approval at Runtime"):
 * 1. Pipelines may configure 1 or more signatories with `actionType: 'approve'`.
 * 2. Exactly ONE signatory can hold final `status: 'approved'` at runtime.
 * 3. If only 1 approver exists (or the current signer is the LAST remaining unsigned approver),
 *    they see ONLY the `Approve` primary action (preventing a zero-approval deadlock).
 * 4. If 2+ unsigned approvers remain and nobody has approved yet, the current approver sees BOTH:
 *    - `Endorse & Forward` -> marks themselves `endorsed` (`actionType: 'endorse'`, label `Endorsed by:`),
 *      leaving remaining approvers with full `Approve` authority.
 *    - `Approve` -> grants official approval immediately, locks the single approval slot, and
 *      auto-demotes all other unsigned approvers to `actionType: 'endorse'` (`Noted by:`, `demotedFromApprover: true`).
 * 5. Once ANY approver clicks `Approve`, any remaining unsigned approver sees an informational banner
 *    and ONLY the `Noted / Endorse` action (no `Approve` or `Reject`).
 * 6. If a document is returned for revision and resubmitted, `restoreDemotedApproversOnRevision`
 *    restores all `demotedFromApprover: true` steps back to `actionType: 'approve'`.
 */

import type {
  InstitutionalSignatory,
  WorkflowDocumentType,
} from '../../signatories/types/signatory.types';
import { canSignatoryApproveDocument } from '../../signatories/utils/signatory-label.utils.ts';

export interface ApproverStepLike {
  id?: string;
  step?: number;
  stageIndex?: number;
  role?: string;
  roleTitle?: string;
  actionType?: string;
  signatoryLabel?: string;
  signatoryUid?: string;
  signatoryName?: string;
  signatoryEmail?: string;
  status?: string;
  demotedFromApprover?: boolean;
  demotedReason?: 'already_approved' | 'self_endorsed';
  demotedByStepId?: string;
  demotedBySignatoryName?: string;
}

export type PrimarySignatoryActionMode =
  | 'approve_only'
  | 'approve_or_endorse'
  | 'endorse_only'
  | 'check_only'
  | 'note_only';

export interface SignatoryDecisionCapabilities {
  /** True if ANY step in the chain has already reached status === 'approved' */
  isAlreadyApproved: boolean;
  /** Name of the signatory who already granted final approval, if any */
  approvedBySignatoryName?: string;
  /** Role title of the signatory who already granted final approval, if any */
  approvedByRoleTitle?: string;
  /** True if the current signer is permitted to click Approve on this turn */
  canApprove: boolean;
  /**
   * True ONLY when `canApprove` is true AND at least one OTHER unsigned approver
   * still remains in the pipeline (same stage or a later stage).
   * When false for an approver, they see ONLY the `Approve` button (no Endorse option)
   * so the document cannot finish with zero approvals.
   */
  canEndorseInsteadOfApprove: boolean;
  /** Number of OTHER unsigned steps in the chain that currently have Approver capability */
  otherUnsignedApproversCount: number;
  /** Total count of steps configured (or originally configured) as Approvers in this chain */
  totalConfiguredApproversCount: number;
  /**
   * True if this step was originally an Approver (or currently marked demotedFromApprover)
   * and has been demoted to Endorser/Noted Only because another approver already approved.
   */
  isDemotedToEndorserOnly: boolean;
  /** Resolved primary button mode for the Signatory Modal */
  primaryActionMode: PrimarySignatoryActionMode;
}

/**
 * Checks whether a step is considered already completed/signed (no longer awaiting a signature).
 */
export function isStepSigned(step: ApproverStepLike | null | undefined): boolean {
  if (!step) return false;
  const st = String(step.status || '').toLowerCase().trim();
  return st === 'approved' || st === 'endorsed' || st === 'waived';
}

/**
 * Finds the step that has already granted official approval (`status === 'approved'`), if any.
 */
export function findApprovedStep<T extends ApproverStepLike>(
  chain: T[] | null | undefined
): T | undefined {
  if (!Array.isArray(chain)) return undefined;
  return chain.find((s) => Boolean(s) && String(s.status || '').toLowerCase() === 'approved');
}

/**
 * Determines whether a step currently holds active `approve` authority in the pipeline.
 */
export function isStepDesignatedApprover(step: ApproverStepLike | null | undefined): boolean {
  if (!step) return false;
  return String(step.actionType || '').toLowerCase().trim() === 'approve';
}

/**
 * Counts how many steps currently have `actionType === 'approve'`.
 */
export function countApproverSteps(chain: ApproverStepLike[] | null | undefined): number {
  if (!Array.isArray(chain)) return 0;
  return chain.filter((s) => isStepDesignatedApprover(s)).length;
}

/**
 * Counts how many OTHER unsigned steps (excluding `myStepIndex`) still hold `actionType === 'approve'`.
 * Covers both parallel approvers in the same stage AND sequential approvers in later stages.
 */
export function countOtherUnsignedApprovers(
  chain: ApproverStepLike[] | null | undefined,
  myStepIndex: number
): number {
  if (!Array.isArray(chain) || chain.length === 0) return 0;
  let count = 0;
  chain.forEach((step, idx) => {
    if (idx === myStepIndex || !step) return;
    if (isStepSigned(step)) return;
    if (isStepDesignatedApprover(step)) {
      count++;
    }
  });
  return count;
}

/**
 * Returns true if at least one OTHER unsigned approver exists in the chain
 * (meaning the current approver may safely choose `Endorse & Forward` without causing a 0-approval deadlock).
 */
export function hasOtherUnsignedApprover(
  chain: ApproverStepLike[] | null | undefined,
  myStepIndex: number
): boolean {
  return countOtherUnsignedApprovers(chain, myStepIndex) > 0;
}

/**
 * Resolves the exact UI buttons and runtime capabilities for a signatory viewing a document on their turn.
 */
export function resolveSignatoryDecisionCapabilities(params: {
  chain: ApproverStepLike[] | null | undefined;
  myStepIndex: number;
  signatory: Partial<InstitutionalSignatory> | any | null | undefined;
  docType: WorkflowDocumentType | 'proposal' | 'liquidation' | 'par';
}): SignatoryDecisionCapabilities {
  const safeChain = Array.isArray(params.chain) ? params.chain : [];
  const myStep = params.myStepIndex >= 0 ? safeChain[params.myStepIndex] : undefined;

  const approvedStep = findApprovedStep(safeChain);
  const isAlreadyApproved = Boolean(approvedStep);

  const totalConfiguredApproversCount = safeChain.filter(
    (s) => Boolean(s) && (isStepDesignatedApprover(s) || Boolean(s.demotedFromApprover))
  ).length;

  const otherUnsignedApproversCount = countOtherUnsignedApprovers(safeChain, params.myStepIndex);

  const stepAction = String(myStep?.actionType || '').toLowerCase().trim();
  const isDemotedByPriorApproval = Boolean(
    isAlreadyApproved &&
      myStep &&
      String(myStep.status || '').toLowerCase() !== 'approved' &&
      (myStep.demotedFromApprover || isStepDesignatedApprover(myStep))
  );

  // If the document is ALREADY approved by someone else, nobody else can grant approval again.
  if (isAlreadyApproved) {
    const labelLower = String(myStep?.signatoryLabel || '').toLowerCase();
    const isNoted = stepAction === 'note' || isDemotedByPriorApproval || labelLower.includes('noted');
    return {
      isAlreadyApproved: true,
      approvedBySignatoryName: approvedStep?.signatoryName || 'Executive Approver',
      approvedByRoleTitle: approvedStep?.roleTitle || '',
      canApprove: false,
      canEndorseInsteadOfApprove: false,
      otherUnsignedApproversCount: 0,
      totalConfiguredApproversCount,
      isDemotedToEndorserOnly: isDemotedByPriorApproval,
      primaryActionMode: isNoted ? 'note_only' : stepAction === 'check' ? 'check_only' : 'endorse_only',
    };
  }

  // Nobody has approved yet -> check whether this step & signatory can approve
  const hasApproveAuthority = Boolean(
    myStep &&
      canSignatoryApproveDocument(params.signatory, params.docType, myStep as any) &&
      (stepAction === 'approve' || (!stepAction && totalConfiguredApproversCount === 0))
  );

  if (hasApproveAuthority) {
    const canEndorseInsteadOfApprove = otherUnsignedApproversCount > 0;
    return {
      isAlreadyApproved: false,
      canApprove: true,
      canEndorseInsteadOfApprove,
      otherUnsignedApproversCount,
      totalConfiguredApproversCount,
      isDemotedToEndorserOnly: false,
      primaryActionMode: canEndorseInsteadOfApprove ? 'approve_or_endorse' : 'approve_only',
    };
  }

  // Non-approver step (endorse / check / note)
  const primaryActionMode: PrimarySignatoryActionMode =
    stepAction === 'check' ? 'check_only' : stepAction === 'note' ? 'note_only' : 'endorse_only';

  return {
    isAlreadyApproved: false,
    canApprove: false,
    canEndorseInsteadOfApprove: false,
    otherUnsignedApproversCount,
    totalConfiguredApproversCount,
    isDemotedToEndorserOnly: false,
    primaryActionMode,
  };
}

/**
 * Runtime Auto-Demotion on Final Approval (Option A):
 * When the winning approver at `winningStepIndex` clicks `Approve`:
 * - Every OTHER unsigned step with `actionType === 'approve'` is auto-demoted to:
 *   `actionType: 'endorse'`, `signatoryLabel: 'Noted by:'`, `demotedFromApprover: true`,
 *   `demotedReason: 'already_approved'`, `demotedByStepId`, `demotedBySignatoryName`.
 * - Optionally activates waiting steps to `'current'` so remaining co-signers / demoted approvers
 *   can still affix their `Noted by:` / `Endorsed by:` signature for the official record.
 */
export function applySingleApprovalDemotion<T extends ApproverStepLike>(
  chain: T[],
  winningStepIndex: number,
  options?: {
    demotedLabel?: string;
    activateWaitingSteps?: boolean;
  }
): T[] {
  if (!Array.isArray(chain) || chain.length === 0) return [];
  const winner = chain[winningStepIndex];
  const demotedLabel = options?.demotedLabel || 'Noted by:';
  const activateWaiting = options?.activateWaitingSteps ?? false;

  return chain.map((step, idx) => {
    if (!step || idx === winningStepIndex) return step;
    if (isStepSigned(step)) return step;

    const wasApprover = isStepDesignatedApprover(step);
    const nextStatus =
      activateWaiting && String(step.status || '').toLowerCase() === 'waiting'
        ? ('current' as any)
        : step.status;

    if (wasApprover) {
      return {
        ...step,
        actionType: 'endorse' as any,
        signatoryLabel: demotedLabel,
        demotedFromApprover: true,
        demotedReason: 'already_approved' as const,
        ...(winner?.id ? { demotedByStepId: winner.id } : {}),
        ...(winner?.signatoryName ? { demotedBySignatoryName: winner.signatoryName } : {}),
        status: nextStatus,
      };
    }

    if (nextStatus !== step.status) {
      return {
        ...step,
        status: nextStatus,
      };
    }

    return step;
  });
}

/**
 * Runtime Self-Endorse Helper (Option A):
 * When an approver in a multi-approver chain chooses `Endorse & Forward` instead of `Approve`:
 * - Marks their step `actionType: 'endorse'`, `signatoryLabel: 'Endorsed by:'` (unless they already had
 *   a custom non-approved label), `demotedFromApprover: true`, `demotedReason: 'self_endorsed'`.
 * - Remaining approvers keep their full `actionType: 'approve'` authority untouched.
 */
export function applySelfEndorseDemotion<T extends ApproverStepLike>(
  step: T,
  preferredLabel: string = 'Endorsed by:'
): T {
  const existingLabel = String(step.signatoryLabel || '').trim();
  const useExistingLabel =
    existingLabel.length > 0 && !/approved\s*by/i.test(existingLabel);

  return {
    ...step,
    actionType: 'endorse' as any,
    signatoryLabel: useExistingLabel ? existingLabel : preferredLabel,
    demotedFromApprover: true,
    demotedReason: 'self_endorsed' as const,
  };
}

/**
 * Revision-Return Reset Helper:
 * Restores any step previously marked `demotedFromApprover: true` back to `actionType: 'approve'`
 * and `signatoryLabel: 'Approved by:'` so a revised & resubmitted document starts with its full
 * configured multi-approver pipeline intact.
 */
export function restoreDemotedApproversOnRevision<T extends ApproverStepLike>(
  chain: T[] | null | undefined
): T[] {
  if (!Array.isArray(chain)) return [];
  return chain.map((step) => {
    if (!step || !step.demotedFromApprover) return step;
    const restored: any = {
      ...step,
      actionType: 'approve',
      signatoryLabel: 'Approved by:',
    };
    delete restored.demotedFromApprover;
    delete restored.demotedReason;
    delete restored.demotedByStepId;
    delete restored.demotedBySignatoryName;
    return restored as T;
  });
}
