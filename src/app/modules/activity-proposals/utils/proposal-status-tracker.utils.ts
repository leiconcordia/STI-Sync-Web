/**
 * src/app/modules/activity-proposals/utils/proposal-status-tracker.utils.ts
 *
 * Canonical 7-Stage Status Tracking & Queue Visibility Helpers
 * Shared across Activity Proposals (AP), Post-Activity Reports (PAR), and Financial Liquidations (FL).
 *
 * 7 Tracked Statuses:
 * 1. Draft
 * 2. For Adviser Review
 * 3. For Revision
 * 4. Approved by Adviser
 * 5. For SAS Review
 * 6. Approved
 * 7. Rejected
 */

export type CanonicalDocumentStatus =
  | 'draft'
  | 'for_adviser_review'
  | 'for_revision'
  | 'approved_by_adviser'
  | 'for_sas_review'
  | 'approved'
  | 'rejected';

export type TrackedDocumentKind = 'AP' | 'PAR' | 'FL' | 'SBR';

export interface DocumentTrackingState {
  canonical: CanonicalDocumentStatus;
  label: string;
  subLabel?: string;
  badgeClass: string;
  dotClass: string;
  isPulsing: boolean;
  isForAdviserReview: boolean;
  isForRevision: boolean;
  isApprovedByAdviser: boolean;
  isForSasReview: boolean;
  isApproved: boolean;
  isRejected: boolean;
  isDraft: boolean;
  requiresSignatories: boolean;
  returnedByLabel?: string;
  rejectedByLabel?: string;
}

export interface TrackerStepNode {
  key: 'draft' | 'for_adviser_review' | 'approved_by_adviser' | 'for_sas_review' | 'approved';
  label: string;
  shortLabel: string;
  state: 'completed' | 'active' | 'pending' | 'returned' | 'rejected';
  detail?: string;
}

function normStr(val: any): string {
  return String(val ?? '').trim().toLowerCase();
}

export function isDocumentForAdviserReview(record: any): boolean {
  if (!record) return false;
  const pSt = normStr(record.proposalStatus);
  const st = normStr(record.status);
  const lc = normStr(record.lifecycleStatus);
  return (
    pSt === 'for_adviser_review' ||
    st === 'for_adviser_review' ||
    lc === 'for_adviser_review'
  );
}

export function isOfficerAuthoredRecord(record: any): boolean {
  if (!record) return false;
  if (record.submittedByOfficer === true) return true;
  if (record.adviserReview && typeof record.adviserReview === 'object') return true;
  const cRole = normStr(record.creatorRole || record.createdByRole);
  if (cRole === 'officer' || cRole === 'student_officer') return true;
  return false;
}

/**
 * Returns true if the document is still internal to the Student Organization
 * and must NOT be visible in SAS Admin or Institutional Signatory portals.
 */
export function isHiddenFromSasAndSignatories(record: any): boolean {
  if (!record) return true;
  if (record.isDeleted === true) return true;

  const pSt = normStr(record.proposalStatus);
  const st = normStr(record.status);
  const lc = normStr(record.lifecycleStatus);

  // Drafts and withdrawn records never appear in SAS/Signatory review queues
  if (
    pSt === 'draft' ||
    st === 'draft' ||
    lc === 'draft' ||
    pSt === 'withdrawn' ||
    st === 'withdrawn' ||
    lc === 'withdrawn'
  ) {
    return true;
  }

  // Awaiting Club Adviser check — strictly isolated from SAS & Signatories
  if (isDocumentForAdviserReview(record)) {
    return true;
  }

  // Returned by Club Adviser before reaching SAS
  const isReturned =
    pSt === 'returned' ||
    pSt === 'returned_for_revision' ||
    pSt === 'for_revision' ||
    st === 'returned' ||
    st === 'returned_for_revision' ||
    st === 'for_revision' ||
    Boolean(record.isReturned);
  if (isReturned && normStr(record.returnedByRole) === 'adviser' && !record.submittedToSasAt) {
    return true;
  }

  // Rejected by Club Adviser before ever reaching SAS
  const isRejected = pSt === 'rejected' || st === 'rejected' || lc === 'rejected';
  if (isRejected && normStr(record.rejectedByRole) === 'adviser' && !record.submittedToSasAt) {
    return true;
  }

  return false;
}

/**
 * Checks whether an organization document uses School Budget / Miscellaneous Fee
 * (which requires SAS Vetting + Institutional Signatories) vs Direct SAS Approval.
 */
export function requiresInstitutionalSignatories(record: any): boolean {
  if (!record) return false;
  const fs = normStr(record.fundingSource);
  if (fs === 'school_budget' || fs === 'misc_fee' || fs === 'miscellaneous') {
    return true;
  }
  if (fs === 'organization_funds' || fs === 'student_contributions' || fs === 'zero_budget') {
    return false;
  }
  // Fallback: check approvalChain length > 1 or non-SAS signatories
  const chain: any[] = Array.isArray(record.approvalChain) ? record.approvalChain : [];
  return chain.some((s) => {
    const r = normStr(s?.role);
    return r && r !== 'sas_head' && r !== 'sas_admin' && r !== 'sas_coordinator';
  });
}

/**
 * Resolves the canonical 7-stage status tracking state for any AP, PAR, or FL record.
 */
export function resolveDocumentTrackingState(
  record: any,
  docKind: TrackedDocumentKind = 'AP'
): DocumentTrackingState {
  const pSt = normStr(record?.proposalStatus);
  const st = normStr(record?.status);
  const lc = normStr(record?.lifecycleStatus);
  const chain: any[] = Array.isArray(record?.approvalChain) ? record.approvalChain : [];
  const hasChain = chain.length > 0;
  const fullySigned =
    hasChain &&
    chain.every((s) => s && (s.status === 'endorsed' || s.status === 'approved' || s.status === 'waived'));

  const requiresSignatories = requiresInstitutionalSignatories(record);
  const adviserStatus = normStr(record?.adviserReview?.status);
  const adviserApproved =
    adviserStatus === 'approved' ||
    Boolean(record?.submittedToSasAt) ||
    (!isDocumentForAdviserReview(record) &&
      (pSt === 'pending' ||
        pSt === 'pending_review' ||
        st === 'under_review' ||
        st === 'pending' ||
        pSt === 'approved' ||
        st === 'approved' ||
        st === 'approved_president' ||
        st === 'completed'));

  // 1. Rejected
  if (pSt === 'rejected' || st === 'rejected' || lc === 'rejected') {
    const rejRole = normStr(record?.rejectedByRole);
    const rejectedByLabel =
      rejRole === 'adviser'
        ? 'Rejected by Club Adviser'
        : rejRole === 'signatory'
        ? 'Rejected by Signatory'
        : rejRole === 'sas'
        ? 'Rejected by SAS'
        : record?.rejectedByName
        ? `Rejected by ${record.rejectedByName}`
        : 'Rejected';

    return {
      canonical: 'rejected',
      label: 'Rejected',
      subLabel: rejectedByLabel,
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      dotClass: 'bg-rose-500',
      isPulsing: false,
      isForAdviserReview: false,
      isForRevision: false,
      isApprovedByAdviser: adviserStatus === 'approved',
      isForSasReview: false,
      isApproved: false,
      isRejected: true,
      isDraft: false,
      requiresSignatories,
      rejectedByLabel,
    };
  }

  // 2. For Adviser Review
  if (isDocumentForAdviserReview(record)) {
    return {
      canonical: 'for_adviser_review',
      label: 'For Adviser Review',
      subLabel: 'Awaiting Club Adviser Check',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      dotClass: 'bg-indigo-500',
      isPulsing: true,
      isForAdviserReview: true,
      isForRevision: false,
      isApprovedByAdviser: false,
      isForSasReview: false,
      isApproved: false,
      isRejected: false,
      isDraft: false,
      requiresSignatories,
    };
  }

  // 3. Approved / Completed (must check before returned if fully signed/approved)
  const isReturnedFlag =
    pSt === 'returned' ||
    pSt === 'returned_for_revision' ||
    pSt === 'for_revision' ||
    st === 'returned' ||
    st === 'returned_for_revision' ||
    st === 'for_revision' ||
    lc === 'returned' ||
    Boolean(record?.isReturned);

  const isApproved =
    !isReturnedFlag &&
    (fullySigned ||
      pSt === 'approved' ||
      st === 'approved' ||
      st === 'approved_president' ||
      st === 'completed' ||
      pSt === 'completed' ||
      lc === 'approved' ||
      lc === 'completed' ||
      record?.isApproved === true);

  if (isApproved) {
    return {
      canonical: 'approved',
      label: st === 'completed' || pSt === 'completed' ? 'Completed' : 'Approved',
      subLabel: st === 'completed' || pSt === 'completed' ? 'Activity Concluded' : 'Fully Authorized',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotClass: 'bg-emerald-500',
      isPulsing: false,
      isForAdviserReview: false,
      isForRevision: false,
      isApprovedByAdviser: true,
      isForSasReview: false,
      isApproved: true,
      isRejected: false,
      isDraft: false,
      requiresSignatories,
    };
  }

  // 4. For Revision (Returned by Adviser, SAS, or Signatory)
  if (isReturnedFlag) {
    const retRole = normStr(record?.returnedByRole);
    const returnedByLabel =
      retRole === 'adviser'
        ? 'Returned by Club Adviser'
        : retRole === 'signatory'
        ? 'Returned by Signatory'
        : retRole === 'sas'
        ? 'Returned by SAS'
        : record?.returnedByRoleTitle
        ? `Returned by ${record.returnedByRoleTitle}`
        : 'Needs Revision';

    return {
      canonical: 'for_revision',
      label: 'For Revision',
      subLabel: returnedByLabel,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
      dotClass: 'bg-amber-500',
      isPulsing: false,
      isForAdviserReview: false,
      isForRevision: true,
      isApprovedByAdviser: adviserStatus === 'approved',
      isForSasReview: false,
      isApproved: false,
      isRejected: false,
      isDraft: false,
      requiresSignatories,
      returnedByLabel,
    };
  }

  // 5. For SAS Review (includes SAS Vetting Gate and active Signatory routing after Adviser Approval)
  if (
    pSt === 'pending' ||
    pSt === 'pending_review' ||
    pSt === 'under_review' ||
    pSt === 'for_sas_review' ||
    pSt === 'pending_signatories' ||
    st === 'under_review' ||
    st === 'pending' ||
    st === 'for_sas_review' ||
    st === 'pending_signatories' ||
    lc === 'pending_review'
  ) {
    const isSasVetted =
      (Boolean(record?.sasVettedAt) || Boolean(record?.sasVettedBy) || st === 'pending_signatories') &&
      record?.isPendingSasVetting === false;
    const currentStep =
      chain.find((s: any) => s.status === 'current') ||
      (typeof record?.currentStepIndex === 'number' ? chain[record.currentStepIndex] : undefined);
    const currentStage = record?.currentStageIndex ?? (typeof record?.currentStepIndex === 'number' ? record.currentStepIndex + 1 : 1);

    let subLabel = 'Awaiting SAS Review';
    if ((docKind === 'AP' || docKind === 'SBR') && requiresSignatories && isSasVetted) {
      subLabel = currentStep
        ? `Signatory • ${currentStep.roleTitle || currentStep.signatoryName || `Stage ${currentStage}`}`
        : `Signatory Stage ${currentStage}`;
    } else if (requiresSignatories) {
      subLabel = 'SAS Vetting (→ Signatories)';
    } else {
      subLabel = 'Direct SAS Review';
    }

    return {
      canonical: 'for_sas_review',
      label: isSasVetted && requiresSignatories ? 'In Signatory Routing' : 'For SAS Review',
      subLabel,
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      dotClass: 'bg-blue-500',
      isPulsing: true,
      isForAdviserReview: false,
      isForRevision: false,
      isApprovedByAdviser: adviserApproved,
      isForSasReview: true,
      isApproved: false,
      isRejected: false,
      isDraft: false,
      requiresSignatories,
    };
  }

  // 6. Default: Draft
  return {
    canonical: 'draft',
    label: 'Draft',
    subLabel: 'Work in Progress',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-400',
    isPulsing: false,
    isForAdviserReview: false,
    isForRevision: false,
    isApprovedByAdviser: false,
    isForSasReview: false,
    isApproved: false,
    isRejected: false,
    isDraft: true,
    requiresSignatories,
  };
}

/**
 * Builds the ordered stepper milestones representing the 7 tracked statuses:
 * Spine: Draft -> For Adviser Review -> Approved by Adviser -> For SAS Review -> Approved
 * With explicit branch indicators when in For Revision or Rejected.
 */
export function buildSevenStageTrackerSteps(
  record: any,
  docKind: TrackedDocumentKind = 'AP'
): {
  tracking: DocumentTrackingState;
  steps: TrackerStepNode[];
} {
  const tracking = resolveDocumentTrackingState(record, docKind);
  const adviserName = record?.adviserReview?.reviewedByName || record?.preparedBy?.name || 'Club Adviser';
  const wasReturnedByAdviser = tracking.isForRevision && normStr(record?.returnedByRole) === 'adviser';
  const wasRejectedByAdviser = tracking.isRejected && normStr(record?.rejectedByRole) === 'adviser';

  const steps: TrackerStepNode[] = [
    {
      key: 'draft',
      label: 'Draft',
      shortLabel: 'Draft',
      state: tracking.isDraft ? 'active' : 'completed',
      detail: record?.createdByName ? `By ${record.createdByName}` : undefined,
    },
    {
      key: 'for_adviser_review',
      label: 'For Adviser Review',
      shortLabel: 'Adviser Check',
      state: tracking.isDraft
        ? 'pending'
        : tracking.isForAdviserReview
        ? 'active'
        : wasReturnedByAdviser
        ? 'returned'
        : wasRejectedByAdviser
        ? 'rejected'
        : 'completed',
      detail: tracking.isForAdviserReview
        ? 'Pending Adviser Decision'
        : wasReturnedByAdviser
        ? 'Returned for Revision'
        : wasRejectedByAdviser
        ? 'Rejected by Adviser'
        : 'Checked',
    },
    {
      key: 'approved_by_adviser',
      label: 'Approved by Adviser',
      shortLabel: 'Adviser Approved',
      state:
        tracking.isApproved || tracking.isForSasReview || (tracking.isApprovedByAdviser && !wasReturnedByAdviser && !wasRejectedByAdviser)
          ? 'completed'
          : 'pending',
      detail: tracking.isApprovedByAdviser ? adviserName : 'Awaiting Endorsement',
    },
    {
      key: 'for_sas_review',
      label: tracking.requiresSignatories ? 'For SAS Review & Signatories' : 'For SAS Review',
      shortLabel: 'For SAS Review',
      state: tracking.isApproved
        ? 'completed'
        : tracking.isForSasReview
        ? 'active'
        : tracking.isForRevision && !wasReturnedByAdviser
        ? 'returned'
        : tracking.isRejected && !wasRejectedByAdviser
        ? 'rejected'
        : 'pending',
      detail: tracking.isForSasReview
        ? tracking.subLabel
        : tracking.isApproved
        ? 'Cleared'
        : tracking.requiresSignatories
        ? 'SAS + Signatories'
        : 'Direct SAS',
    },
    {
      key: 'approved',
      label: 'Approved',
      shortLabel: 'Approved',
      state: tracking.isApproved
        ? 'completed'
        : tracking.isRejected
        ? 'rejected'
        : 'pending',
      detail: tracking.isApproved ? 'Authorized' : undefined,
    },
  ];

  return { tracking, steps };
}
