/**
 * src/app/modules/organizations/utils/adviser-authority.utils.ts
 *
 * Pure governance utilities for Primary Club Adviser + Secondary/Substitute Club Co-Adviser
 * availability evaluation, strict mutual-exclusion approval authority transfer, and
 * portal inactivation guardrails.
 *
 * Governance Model:
 * - While Primary Club Adviser is ACTIVE (`available`):
 *   - Primary Adviser holds full approval & filing authority (`canReviewOfficerSubmissions = true`).
 *   - Substitute / Co-Adviser is in Read-Only Standby Mode (`canReviewOfficerSubmissions = false`)
 *     and CANNOT approve, return, or reject Officer submissions.
 * - Once Primary Club Adviser sets Portal INACTIVE (`unavailable` / On Leave):
 *   - Approval & filing authority immediately transfers to the assigned Substitute / Co-Adviser
 *     (`canReviewOfficerSubmissions = true`, `canPerformFullAdviserActions = true`) with
 *     "Acting for [Primary Name]" attribution and personal e-signature isolation.
 *   - Primary Adviser's portal is paused (`canReviewOfficerSubmissions = false`) until reactivated.
 * - Strict Inactivation Guardrail:
 *   - Primary Adviser CANNOT set their portal Inactive if the organization has pending Officer
 *     submissions awaiting Adviser review (AP, SBR, FL, PAR) AND no Substitute / Co-Adviser is assigned.
 */

import type { OrgAdviserAvailability, OrgAdviserData, OrgAdviserRole } from '../types/organization.types';

export interface OrganizationAdviserContext {
  adviser?: OrgAdviserData | null;
  coAdviser?: OrgAdviserData | null;
  adviserAvailability?: OrgAdviserAvailability | null;
}

export interface AdviserPendingDocSummary {
  id: string;
  documentType: 'proposal' | 'sbr' | 'liquidation' | 'par' | string;
  title?: string;
  code?: string;
  submittedByName?: string;
}

export interface AdviserInactivationValidationResult {
  allowed: boolean;
  reason: string | null;
  pendingCount: number;
  hasCoAdviser: boolean;
}

export interface AdviserRemoveSubValidationResult {
  allowed: boolean;
  reason: string | null;
}

export interface EffectiveAdviserAuthority {
  /** Whether the viewer is an active Primary Adviser or Co-Adviser of this organization */
  isOrgAdviser: boolean;
  isPrimaryAdviser: boolean;
  isCoAdviser: boolean;
  viewerAdviserRole: OrgAdviserRole | null;
  /** True when the Primary Adviser is currently inactive/unavailable */
  isPrimaryUnavailable: boolean;
  /** True when the Primary Adviser is unavailable AND a Substitute / Co-Adviser is assigned */
  isAuthorityTransferredToCoAdviser: boolean;
  /** True if the viewer may review/approve/return/reject Officer submissions (AP, FL, PAR, SBR) */
  canReviewOfficerSubmissions: boolean;
  /** True if the viewer holds full Adviser Portal actions (including Adviser-created filings/management) */
  canPerformFullAdviserActions: boolean;
  /** Name of the Primary Adviser if the Co-Adviser is acting while Primary is unavailable */
  actingOnBehalfOfName?: string;
  /** Name of the Primary Adviser for messaging */
  primaryAdviserName?: string;
  /** Name of the assigned Substitute / Co-Adviser if present */
  coAdviserName?: string;
  /** Human-readable reason if Primary is unavailable */
  unavailableReason?: string;
  /** Explanation when approval actions are currently locked for the viewer */
  approvalBlockedReason?: string;
  /** Human-readable banner summary for Adviser Decision Panel / Portal header */
  statusBannerText?: string;
}

const normalize = (v?: string | null) => String(v || '').trim().toLowerCase();

function toYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidYmd(value?: string | null): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()));
}

/**
 * Check whether an organization currently has an assigned Substitute / Secondary Co-Adviser.
 */
export function hasAssignedCoAdviser(org?: OrganizationAdviserContext | null): boolean {
  const co = org?.coAdviser;
  if (!co || typeof co !== 'object') return false;
  return Boolean(String(co.email || '').trim() || String(co.authUid || '').trim() || String(co.name || '').trim());
}

/**
 * Evaluates whether the Primary Club Adviser is currently inactive / unavailable.
 * Supports:
 * 1. Explicit manual status (`primaryStatus === 'unavailable'`) — unless a legacy `unavailableUntil`
 *    date is set and has already passed.
 * 2. Legacy scheduled leave window (`unavailableFrom`..`unavailableUntil`).
 */
export function isPrimaryAdviserUnavailable(
  availability?: OrgAdviserAvailability | null,
  now: Date = new Date()
): boolean {
  if (!availability) return false;

  const today = toYmdLocal(now);
  const from = isValidYmd(availability.unavailableFrom) ? availability.unavailableFrom!.trim() : '';
  const until = isValidYmd(availability.unavailableUntil) ? availability.unavailableUntil!.trim() : '';

  if (from || until) {
    if (from && today < from) {
      return false;
    }
    if (until && today > until) {
      return false;
    }
    if (availability.primaryStatus === 'unavailable' || Boolean(from && until)) {
      return true;
    }
  }

  return availability.primaryStatus === 'unavailable';
}

/**
 * Strict Adviser Portal Inactivation Guardrail:
 * - Blocks setting the Primary Adviser portal Inactive if there are pending Officer submissions
 *   awaiting Adviser review AND no Substitute / Co-Adviser is assigned.
 * - Allows inactivation if a Substitute / Co-Adviser is assigned (even with pending documents)
 *   OR if there are zero pending documents.
 */
export function validateAdviserPortalInactivation(params: {
  hasCoAdviser: boolean;
  pendingDocuments: AdviserPendingDocSummary[];
}): AdviserInactivationValidationResult {
  const pendingDocuments = Array.isArray(params.pendingDocuments) ? params.pendingDocuments : [];
  const pendingCount = pendingDocuments.length;
  const hasCoAdviser = Boolean(params.hasCoAdviser);

  if (pendingCount > 0 && !hasCoAdviser) {
    return {
      allowed: false,
      reason:
        `You cannot set your Adviser Portal to Inactive while ${pendingCount} pending Officer document${pendingCount === 1 ? '' : 's'} await Adviser review and no Substitute / Co-Adviser is assigned. Assign a Substitute Adviser first or review your pending documents.`,
      pendingCount,
      hasCoAdviser: false,
    };
  }

  return {
    allowed: true,
    reason: null,
    pendingCount,
    hasCoAdviser,
  };
}

/**
 * Prevent unassigning the Substitute / Co-Adviser while the Primary Adviser portal is
 * currently Inactive and there are pending Officer documents awaiting Adviser review.
 */
export function validateRemoveCoAdviser(params: {
  primaryUnavailable: boolean;
  pendingDocuments: AdviserPendingDocSummary[];
}): AdviserRemoveSubValidationResult {
  const pendingCount = Array.isArray(params.pendingDocuments) ? params.pendingDocuments.length : 0;
  if (params.primaryUnavailable && pendingCount > 0) {
    return {
      allowed: false,
      reason:
        `Cannot remove the Substitute / Co-Adviser while the Primary Adviser portal is Inactive and ${pendingCount} pending document${pendingCount === 1 ? '' : 's'} require Adviser review. Reactivate the Primary Adviser portal or assign a replacement first.`,
    };
  }
  return { allowed: true, reason: null };
}

function matchesAdviserRecord(
  record: OrgAdviserData | null | undefined,
  viewerUid?: string | null,
  viewerEmail?: string | null
): boolean {
  if (!record) return false;
  const cleanEmail = normalize(viewerEmail);
  const cleanUid = String(viewerUid || '').trim();
  if (cleanUid && record.authUid && record.authUid === cleanUid) return true;
  if (cleanEmail && record.email && normalize(record.email) === cleanEmail) return true;
  return false;
}

/**
 * Resolves the effective Adviser & Substitute/Co-Adviser permissions and audit attribution.
 * Enforces strict mutual exclusion:
 * - Primary Active -> ONLY Primary can approve; Substitute/Co-Adviser is Standby (cannot approve).
 * - Primary Inactive -> Approval authority transfers to Substitute/Co-Adviser; Primary is paused.
 */
export function resolveEffectiveAdviserAuthority(params: {
  organization?: OrganizationAdviserContext | null;
  viewerUid?: string | null;
  viewerEmail?: string | null;
  viewerAdviserRole?: OrgAdviserRole | null;
  isAdviserSession?: boolean;
  now?: Date;
}): EffectiveAdviserAuthority {
  const org = params.organization;
  const hasCoAdviser = hasAssignedCoAdviser(org);
  const primaryUnavailable = isPrimaryAdviserUnavailable(org?.adviserAvailability, params.now);
  const isAuthorityTransferredToCoAdviser = primaryUnavailable && hasCoAdviser;

  const matchesPrimary = matchesAdviserRecord(org?.adviser, params.viewerUid, params.viewerEmail);
  const matchesCo = matchesAdviserRecord(org?.coAdviser, params.viewerUid, params.viewerEmail);

  let viewerAdviserRole: OrgAdviserRole | null = null;
  if (matchesCo || params.viewerAdviserRole === 'co_adviser') {
    viewerAdviserRole = 'co_adviser';
  } else if (matchesPrimary || params.viewerAdviserRole === 'primary' || params.isAdviserSession) {
    viewerAdviserRole = 'primary';
  }

  const isPrimaryAdviser = viewerAdviserRole === 'primary';
  const isCoAdviser = viewerAdviserRole === 'co_adviser';
  const isOrgAdviser = isPrimaryAdviser || isCoAdviser;

  const primaryName = org?.adviser?.name || 'Primary Club Adviser';
  const coAdviserName = org?.coAdviser?.name || undefined;
  const unavailableReason = org?.adviserAvailability?.unavailableReason?.trim() || undefined;

  // Strict single-active-approver rule
  let canReviewOfficerSubmissions = false;
  let canPerformFullAdviserActions = false;
  let approvalBlockedReason: string | undefined;
  let statusBannerText: string | undefined;

  if (isPrimaryAdviser) {
    if (!primaryUnavailable) {
      canReviewOfficerSubmissions = true;
      canPerformFullAdviserActions = true;
    } else {
      canReviewOfficerSubmissions = false;
      canPerformFullAdviserActions = false;
      approvalBlockedReason = coAdviserName
        ? `Your Adviser Portal is currently Inactive (${unavailableReason || 'On Leave'}). Approval authority has been transferred to ${coAdviserName}. Reactivate your portal in Settings to approve documents.`
        : `Your Adviser Portal is currently Inactive (${unavailableReason || 'On Leave'}). Reactivate your portal in Settings to approve documents.`;
      statusBannerText = approvalBlockedReason;
    }
  } else if (isCoAdviser) {
    if (primaryUnavailable) {
      canReviewOfficerSubmissions = true;
      canPerformFullAdviserActions = true;
      statusBannerText = `Acting Club Adviser Mode — Approval authority transferred while ${primaryName} is inactive (${unavailableReason || 'On Leave'}).`;
    } else {
      canReviewOfficerSubmissions = false;
      canPerformFullAdviserActions = false;
      approvalBlockedReason = `Standby Mode — Primary Adviser ${primaryName} is currently active. Substitute advisers cannot approve or return submissions while the Primary Adviser is active.`;
      statusBannerText = approvalBlockedReason;
    }
  }

  const actingOnBehalfOfName =
    isCoAdviser && isAuthorityTransferredToCoAdviser ? primaryName : undefined;

  return {
    isOrgAdviser,
    isPrimaryAdviser,
    isCoAdviser,
    viewerAdviserRole,
    isPrimaryUnavailable: primaryUnavailable,
    isAuthorityTransferredToCoAdviser,
    canReviewOfficerSubmissions,
    canPerformFullAdviserActions,
    actingOnBehalfOfName,
    primaryAdviserName: primaryName,
    coAdviserName,
    unavailableReason,
    approvalBlockedReason,
    statusBannerText,
  };
}
