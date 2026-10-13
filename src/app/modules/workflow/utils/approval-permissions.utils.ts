/**
 * src/app/modules/workflow/utils/approval-permissions.utils.ts
 *
 * Deterministic permission and authority engine for all approvable documents.
 * Enforces:
 * 1. Zero Self-Approval Conflict of Interest (Authors NEVER see Approve/Reject/Return).
 * 2. Stage-gated Signatory Actions.
 * 3. Author-only Self-Service Withdrawal.
 * 4. Author-only Revision & Editing.
 */

import type {
  ApprovableDocument,
  ApprovalPermissions,
  UnifiedApprovalStep,
} from '../types/approval.types';

export interface UserContext {
  uid: string;
  name?: string;
  email?: string;
  role: 'admin' | 'officer' | 'signatory' | string;
  organizationId?: string;
}

/**
 * Checks whether an approvable document was created directly by SAS / SAO Admin internally.
 */
export function isDocumentSasCreated(doc: Partial<ApprovableDocument>): boolean {
  if (doc.isOfficerProposal === true || doc.isOfficerPar === true) {
    return false;
  }
  if (doc.isSasDirect === true || doc.isSasInternal === true) {
    return true;
  }
  const role = (
    doc.createdByRole ||
    doc.creatorRole ||
    ''
  ).toLowerCase().trim();
  if (role === 'officer' || role === 'student_officer') {
    return false;
  }
  if (['admin', 'sas_admin', 'sao_admin', 'sas'].includes(role)) {
    return true;
  }
  const orgId = (doc.organizationId || doc.hostingOrgId || '').toLowerCase().trim();
  if (orgId === 'sas' || orgId === 'sao_admin' || orgId === 'sao') {
    return true;
  }
  return false;
}

/**
 * Checks whether the current user is considered the author / owner of the document.
 */
export function isDocumentOwner(
  doc: Partial<ApprovableDocument>,
  user: UserContext
): boolean {
  if (!doc) return false;

  const docCreatorUid = doc.createdByUid || doc.createdById || '';
  if (user.uid && docCreatorUid && user.uid === docCreatorUid) {
    return true;
  }

  const isSas = isDocumentSasCreated(doc);
  const userRole = (user.role || '').toLowerCase().trim();
  const isAdmin = ['admin', 'sas_admin', 'sao_admin'].includes(userRole);

  if (isSas && isAdmin) {
    return true;
  }

  if (!isSas && userRole === 'officer') {
    const userOrg = user.organizationId;
    const docOrg = doc.organizationId || doc.hostingOrgId;
    if (userOrg && docOrg && userOrg === docOrg) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves full permissions for a document and the current user.
 */
export function resolveApprovalPermissions(
  doc: Partial<ApprovableDocument> | null | undefined,
  user: UserContext | null | undefined
): ApprovalPermissions {
  const fallbackPermissions: ApprovalPermissions = {
    isOwner: false,
    isSasAdmin: false,
    isOrgOfficer: false,
    canApprove: false,
    canEndorse: false,
    canReturn: false,
    canReject: false,
    canWithdraw: false,
    canEdit: false,
    isPendingSignatoryAction: false,
    activeStageIndex: 1,
    pendingStepForCurrentUser: null,
  };

  if (!doc || !user) return fallbackPermissions;

  const userRole = (user.role || '').toLowerCase().trim();
  const isSasAdmin = ['admin', 'sas_admin', 'sao_admin'].includes(userRole);
  const isOrgOfficer = userRole === 'officer' || userRole === 'student_officer';
  const isOwner = isDocumentOwner(doc, user);

  const rawStatus = (doc.status || doc.proposalStatus || doc.lifecycleStatus || '').toLowerCase().trim();
  const isDraft = rawStatus === 'draft';
  const isPending = rawStatus === 'under_review' || rawStatus === 'pending' || rawStatus === 'pending_review';
  const isReturned = rawStatus === 'returned' || Boolean(doc.isReturned);
  const isApproved = rawStatus === 'approved' || rawStatus === 'approved_president';
  const isRejected = rawStatus === 'rejected' || rawStatus === 'cancelled' || rawStatus === 'voided';

  const activeStage = doc.currentStageIndex ?? 1;
  const chain: UnifiedApprovalStep[] = (doc.approvalChain as UnifiedApprovalStep[]) || [];

  // 1. Locate if there is an active signatory step assigned to the current user
  let pendingStep: UnifiedApprovalStep | null = null;
  const userEmail = (user.email || '').toLowerCase().trim();

  if (chain.length > 0 && isPending) {
    const matchingStep = chain.find((step) => {
      const stepStage = step.stageIndex ?? 1;
      if (stepStage !== activeStage) return false;
      if (step.status !== 'current' && step.status !== 'waiting') return false;

      if (user.uid && step.signatoryUid && step.signatoryUid === user.uid) return true;
      if (userEmail && step.signatoryEmail && step.signatoryEmail.toLowerCase() === userEmail) return true;
      if (user.role && step.role === user.role) return true;
      return false;
    });

    if (matchingStep) {
      pendingStep = matchingStep;
    }
  }

  // 2. Conflict-of-Interest Guard:
  // If user is Owner, they can NEVER approve, endorse, return, or reject!
  let canApprove = false;
  let canEndorse = false;
  let canReturn = false;
  let canReject = false;

  if (!isOwner && isPending) {
    // A. Direct signatory in the active stage
    if (pendingStep) {
      if (pendingStep.actionType === 'approve' || pendingStep.role === 'school_president') {
        canApprove = true;
      } else {
        canEndorse = true;
      }
      canReturn = true;
      canReject = true;
    }

    // B. SAS Gatekeeper reviewing an Org submission at Stage 1
    const isSasDoc = isDocumentSasCreated(doc);
    if (isSasAdmin && !isSasDoc) {
      const sasStep = chain.find(
        (s) => (s.role === 'sas_head' || s.role === 'sas_coordinator' || s.stageIndex === 1) &&
               s.status !== 'endorsed' && s.status !== 'approved'
      );
      if (sasStep || activeStage === 1 || chain.length === 0) {
        canEndorse = true;
        canApprove = chain.length === 0;
        canReturn = true;
        canReject = true;
      }
    }
  }

  // 3. Withdrawal Permission:
  // ONLY the Owner can withdraw when in pending/under_review
  const canWithdraw = isOwner && isPending;

  // 4. Edit Permission:
  // ONLY the Owner can edit, and only when in draft or returned
  const canEdit = isOwner && (isDraft || isReturned);

  return {
    isOwner,
    isSasAdmin,
    isOrgOfficer,
    canApprove,
    canEndorse,
    canReturn,
    canReject,
    canWithdraw,
    canEdit,
    isPendingSignatoryAction: Boolean(pendingStep && isPending),
    activeStageIndex: activeStage,
    pendingStepForCurrentUser: pendingStep,
  };
}
