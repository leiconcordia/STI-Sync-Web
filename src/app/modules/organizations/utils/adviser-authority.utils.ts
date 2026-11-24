/**
 * src/app/modules/organizations/utils/adviser-authority.utils.ts
 *
 * Pure governance utilities for Primary Club Adviser + Secondary Club Co-Adviser
 * availability evaluation and automatic approval authority transfer.
 *
 * Governance Model:
 * - Decision 1 (Option B): Either Primary Adviser or Co-Adviser can review/approve/return/reject
 *   Officer submissions (AP, PAR, FL, SBR) at any time (first-to-act resolves the Adviser Gate).
 * - Decision 2 (Option A): Co-Adviser always has portal view access & Officer review rights;
 *   when the Primary Adviser is marked Unavailable (manual toggle OR active leave date range),
 *   full Adviser authority automatically transfers to the Co-Adviser with "Acting on behalf of [Primary]"
 *   audit attribution.
 */

import type { OrgAdviserAvailability, OrgAdviserData, OrgAdviserRole } from '../types/organization.types';

export interface OrganizationAdviserContext {
  adviser?: OrgAdviserData | null;
  coAdviser?: OrgAdviserData | null;
  adviserAvailability?: OrgAdviserAvailability | null;
}

export interface EffectiveAdviserAuthority {
  /** Whether the viewer is an active Primary Adviser or Co-Adviser of this organization */
  isOrgAdviser: boolean;
  isPrimaryAdviser: boolean;
  isCoAdviser: boolean;
  viewerAdviserRole: OrgAdviserRole | null;
  /** True when the Primary Adviser is currently unavailable (manual flag OR active date window) */
  isPrimaryUnavailable: boolean;
  /** True when the Primary Adviser is unavailable AND a Co-Adviser is assigned (authority transferred) */
  isAuthorityTransferredToCoAdviser: boolean;
  /** True if the viewer may review/approve/return/reject Officer submissions (AP, FL, PAR, SBR) */
  canReviewOfficerSubmissions: boolean;
  /** True if the viewer holds full Adviser Portal actions (including Adviser-created filings/management) */
  canPerformFullAdviserActions: boolean;
  /** Name of the Primary Adviser if the Co-Adviser is acting while Primary is unavailable */
  actingOnBehalfOfName?: string;
  /** Human-readable reason if Primary is unavailable */
  unavailableReason?: string;
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
 * Evaluates whether the Primary Club Adviser is currently unavailable.
 * Supports:
 * 1. Explicit manual status (`primaryStatus === 'unavailable'`) — unless an `unavailableUntil` date
 *    is set and has already passed (automatic restoration after leave ends).
 * 2. Scheduled leave window (`unavailableFrom`..`unavailableUntil`) — automatically activates on
 *    start date and automatically restores to Primary Adviser the day after end date.
 */
export function isPrimaryAdviserUnavailable(
  availability?: OrgAdviserAvailability | null,
  now: Date = new Date()
): boolean {
  if (!availability) return false;

  const today = toYmdLocal(now);
  const from = isValidYmd(availability.unavailableFrom) ? availability.unavailableFrom!.trim() : '';
  const until = isValidYmd(availability.unavailableUntil) ? availability.unavailableUntil!.trim() : '';

  // If a date range is configured, evaluate it strictly
  if (from || until) {
    if (from && today < from) {
      // Scheduled for a future date -> still available today unless manually forced without future start
      return false;
    }
    if (until && today > until) {
      // Leave period ended -> automatically restored to Primary Adviser
      return false;
    }
    // Today falls inside [from, until] (or open-ended start/end)
    if (availability.primaryStatus === 'unavailable' || Boolean(from && until)) {
      return true;
    }
  }

  return availability.primaryStatus === 'unavailable';
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
 * Resolves the effective Adviser & Co-Adviser permissions and audit attribution for a viewer.
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
  const hasCoAdviser = Boolean(org?.coAdviser && (org.coAdviser.email || org.coAdviser.name));
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

  // Both Primary Adviser and Co-Adviser hold full equal Club Adviser authority (first-to-act resolves the Adviser Gate).
  const canReviewOfficerSubmissions = isOrgAdviser;
  const canPerformFullAdviserActions = isOrgAdviser;

  const primaryName = org?.adviser?.name || 'Primary Club Adviser';
  const actingOnBehalfOfName =
    isCoAdviser && isAuthorityTransferredToCoAdviser ? primaryName : undefined;
  const unavailableReason = org?.adviserAvailability?.unavailableReason?.trim() || undefined;

  let statusBannerText: string | undefined;
  if (isCoAdviser) {
    statusBannerText = `Signed in as Secondary Club Co-Adviser. You hold full Club Adviser authority alongside ${primaryName}.`;
  }

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
    unavailableReason,
    statusBannerText,
  };
}
