import type { EventDocument } from '../types/event.types';

export type EventLockLevel = 'unlocked' | 'restricted' | 'locked';

export interface EventEditabilityCheck {
  editable: boolean;
  lockLevel: EventLockLevel;
  reason?: string;
  allowedFieldTypes?: 'all' | 'minor_only' | 'none';
}

export interface EventCancellationCheck {
  canCancel: boolean;
  reason?: string;
}

export interface ProposalWithdrawalCheck {
  canWithdraw: boolean;
  reason?: string;
}

export interface ProposalEditCheck {
  canEdit: boolean;
  reason?: string;
  isOwner?: boolean;
}

/**
 * Determines whether a proposal or event was authored/submitted by a student organization / officer.
 */
export const SAS_ORGS = [
  'sas',
  'sas_admin',
  'sao',
  'sao_admin',
  'admin',
  'sti',
  'sti_college',
  'institutional',
  'student affairs office',
  'student affairs services',
];

/**
 * Determines whether a proposal or event was authored/submitted by a student organization / officer.
 * Ground truth priority:
 * 1. Explicit internal SAS / Institutional flags
 * 2. Organization ID (non-SAS = student org; SAS = institutional)
 * 3. Organization Name (contains student affairs = institutional; else student org)
 * 4. Reference Number (contains -SAS- vs -ORG-)
 * 5. Explicit isOfficerProposal flag
 * 6. Creator Role
 */
export function isOfficerProposal(event?: Partial<EventDocument> | any | null): boolean {
  if (!event) return false;

  // 1. Reference number / ID prefix check (Primary ground truth: AP-YYYY-SAS-xxx or EVT-ADM-xxx vs AP-YYYY-ORG-xxx)
  const ref = (
    event.referenceId ||
    event.referenceNo ||
    (typeof event.id === 'string' && (event.id.startsWith('AP-') || event.id.startsWith('EVT-')) ? event.id : '') ||
    event.reference ||
    event.refNo ||
    ''
  ).toString().toUpperCase().trim();
  if (ref.includes('-SAS-') || ref.startsWith('EVT-ADM-') || ref.includes('-ADM-')) {
    return false;
  }
  if (ref.includes('-ORG-') || (ref.startsWith('AP-') && !ref.includes('-SAS-') && !ref.startsWith('AP-SAS-'))) {
    return true;
  }

  // 2. Creator Role Check (WHO SUBMITTED IT)
  const role = (event.creatorRole || event.createdByRole || '').toString().toLowerCase().trim();
  if (['admin', 'sas_admin', 'sao_admin', 'sas', 'sao', 'sao_head', 'super_admin'].includes(role)) {
    return false;
  }
  if (role === 'officer' || role === 'student_officer') {
    return true;
  }

  // 3. Creator Email & Name Check (Official SAS Administration Accounts)
  const email = (event.createdByEmail || '').toLowerCase().trim();
  if (email === 'sao@ormoc.sti.edu.ph' || email.startsWith('sas@') || email.startsWith('sao@')) {
    return false;
  }
  const name = (event.createdByName || event.creatorName || '').toLowerCase().trim();
  if (name.includes('riselle') || name.includes('lucanas')) {
    return false;
  }

  // 4. Explicit SAS direct / internal institutional flags
  if (
    event.isInstitutional === true ||
    event.isSasInternal === true ||
    event.isSasDirect === true ||
    event.isDirectPublished === true ||
    event.isSas === true ||
    event.isSasInstitutional === true
  ) {
    return false;
  }

  // 5. Explicit boolean flag
  if (event.isOfficerProposal === false) return false;
  if (event.isOfficerProposal === true) return true;

  // 6. Hosting organization ID or organizationId
  const orgId = (
    event.organizationId ||
    event.hostingOrgId ||
    event.createdByOrgId ||
    event.orgId ||
    event.org ||
    ''
  ).toString().toLowerCase().trim();

  if (orgId && SAS_ORGS.includes(orgId)) {
    return false; // Belongs to institutional SAS
  }
  if (orgId && !SAS_ORGS.includes(orgId)) {
    return true; // Belongs to a student organization
  }

  // 7. Organization Name check
  const orgName = (
    event.hostingOrgName ||
    event.organizationName ||
    event.orgName ||
    ''
  ).toString().toLowerCase().trim();

  if (
    orgName.includes('student affairs') ||
    orgName === 'sas' ||
    orgName === 'sao' ||
    orgName.includes('institutional')
  ) {
    return false;
  }
  if (orgName) {
    return true;
  }

  const createdByName = (event.createdByName || '').toLowerCase().trim();
  if (createdByName.includes('student affairs') || createdByName === 'sao admin' || createdByName === 'sas admin') {
    return false;
  }

  return false;
}

/**
 * Determines whether a proposal or event was authored/submitted by SAS / SAO administration.
 */
export function isInstitutionalProposal(event?: Partial<EventDocument> | any | null): boolean {
  return !isOfficerProposal(event);
}

/**
 * Alias for isInstitutionalProposal to explicitly check whether an activity belongs to SAS.
 */
export const isSasInstitutionalActivity = isInstitutionalProposal;

/**
 * List of major event fields that cannot be changed directly once an event is approved.
 * Modifying these after approval alters student commitments, fees, venues, or financial approvals.
 */
export const MAJOR_EVENT_FIELDS: ReadonlyArray<string> = [
  'sessions',
  'venueId',
  'venue',
  'customVenueName',
  'eventFormat',
  'studentPayablesEnabled',
  'suggestedFeePerStudent',
  'adminFeeOverride',
  'latePenaltyAmount',
  'fines',
  'minAttendancePercent',
  'mandatoryAttendance',
  'isMandatory',
  'requiresAttendance',
  'budgetItems',
  'totalApprovedBudget',
  'totalRequestedBudget',
  'sourceOfFunds',
  'targetCourses',
  'targetYearLevels',
  'targetSections',
  'targetDepartmentIds',
  'allowedCourses',
  'allowedYearLevels',
  'targetAudienceScope',
  'targetAudience',
  'targetAcademicLevel',
  'hostingOrgId',
  'semesterId',
  'schoolYear',
  'eventTypeId',
  'eventCategoryId',
  'enableQRTickets',
  'enableQR',
  'gracePeriodMinutes',
  'lateThresholdMinutes',
];

/**
 * Checks if an event is permanently cancelled.
 */
export function isEventCancelled(event?: Partial<EventDocument> | any | null): boolean {
  if (!event) return false;
  const p = String(event.proposalStatus || '').toLowerCase();
  const s = String(event.status || '').toLowerCase();
  const l = String(event.lifecycleStatus || '').toLowerCase();
  return Boolean(
    event.isCancelled === true ||
      p === 'cancelled' ||
      s === 'cancelled' ||
      l === 'cancelled'
  );
}

/**
 * Checks if an event has a pending cancellation waiting on Financial Liquidation signatory approval.
 */
export function isEventCancellationPending(event?: Partial<EventDocument> | any | null): boolean {
  if (!event || isEventCancelled(event)) return false;
  const p = String(event.proposalStatus || '').toLowerCase();
  const s = String(event.status || '').toLowerCase();
  const l = String(event.lifecycleStatus || '').toLowerCase();
  return Boolean(
    event.cancellationStatus === 'pending_approval' ||
      p === 'cancellation_pending' ||
      s === 'cancellation_pending' ||
      l === 'cancellation_pending'
  );
}

/**
 * Checks if an event is currently marked as soft-deleted.
 */
export function isEventSoftDeleted(event?: Partial<EventDocument> | null): boolean {
  return Boolean(event?.isDeleted || event?.proposalStatus === 'cancelled');
}

/**
 * Checks if an event has been archived (e.g., during end-of-semester or end-of-academic-year rollover).
 */
export function isEventArchived(event?: Partial<EventDocument> | null): boolean {
  return Boolean(event?.isArchived);
}

export function isMatchingOrganization(userOrgId?: string | null, eventOrgId?: string | null): boolean {
  if (!userOrgId || !eventOrgId) return false;
  let u = userOrgId.toLowerCase().trim();
  let e = eventOrgId.toLowerCase().trim();
  if (u.startsWith('org_')) u = u.substring(4);
  if (e.startsWith('org_')) e = e.substring(4);
  return u === e || e.includes(u) || u.includes(e);
}

/**
 * Determines the editability and lock level of an event based on its lifecycle status and the user's role.
 *
 * Lifecycle Rules:
 * - Soft-deleted / Cancelled: Strictly LOCKED.
 * - Archived: Strictly LOCKED (Read-Only).
 * - Ongoing (Live): Strictly LOCKED (live scanner and gate access active).
 * - Completed: Strictly LOCKED (records finalized for liquidation & certificates).
 * - Draft: Fully UNLOCKED (all fields editable).
 * - Pending Review:
 *     - For Officers: LOCKED ("Proposal under SAO review. Withdraw proposal to edit.").
 *     - For Admins: RESTRICTED (Advisers can make review notes / fee overrides).
 * - Approved:
 *     - RESTRICTED (Minor fields like description, banner, and objectives are editable; major fields like schedule, venue, fees, and budget are locked).
 */
export function isEventEditable(
  event?: Partial<EventDocument> | null,
  userRole: 'admin' | 'officer' | string = 'officer',
  userId?: string,
  userOrgId?: string
): EventEditabilityCheck {
  if (!event) {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: 'No event specified.',
      allowedFieldTypes: 'none',
    };
  }

  // 1. Check Archival Status
  if (event.isArchived) {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: 'This event is archived and permanently sealed for historical audit.',
      allowedFieldTypes: 'none',
    };
  }

  // 2. Check Soft-Deletion / Cancellation Status
  if (event.isDeleted || event.proposalStatus === 'cancelled' || event.status === 'cancelled') {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: event.cancellationReason
        ? `This event was cancelled: "${event.cancellationReason}"`
        : 'This event has been cancelled or soft-deleted.',
      allowedFieldTypes: 'none',
    };
  }

  // Ownership Guard:
  // Admin cannot edit Student Org proposals. Officers cannot edit SAS institutional events.
  const officerProp = isOfficerProposal(event);
  if (userRole === 'admin' && officerProp) {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: 'Student organization proposals can only be edited by the proponent organization.',
      allowedFieldTypes: 'none',
    };
  }
  if (userRole === 'officer' && !officerProp) {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: 'Institutional SAS events cannot be edited by student officers.',
      allowedFieldTypes: 'none',
    };
  }
  if (userRole === 'officer' && userOrgId) {
    const eventOrg = (event.hostingOrgId || event.organizationId || (event as any).createdByOrgId || '').toString();
    if (eventOrg && !isMatchingOrganization(userOrgId, eventOrg)) {
      return {
        editable: false,
        lockLevel: 'locked',
        reason: "Officers can only edit their own organization's proposals.",
        allowedFieldTypes: 'none',
      };
    }
  }

  // 3. Drafts are always fully editable by their owner
  const isDraft = event.proposalStatus === 'draft' || event.status === 'draft' || !event.proposalStatus;
  if (isDraft) {
    return {
      editable: true,
      lockLevel: 'unlocked',
      allowedFieldTypes: 'all',
    };
  }

  // 4. Completed Event Barrier: Completed events cannot be edited
  const timing = getEventTimingStatus(event);
  if (
    timing === 'completed' ||
    event.status === 'completed' ||
    event.proposalStatus === 'completed' ||
    event.lifecycleStatus === 'completed'
  ) {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: 'This event is completed. Attendance liabilities, certificate records, and financial liquidations are finalized and cannot be modified.',
      allowedFieldTypes: 'none',
    };
  }

  // 5. Ongoing Event Barrier: Live ongoing events cannot be edited
  if (
    timing === 'ongoing' ||
    event.status === 'ongoing' ||
    event.lifecycleStatus === 'ongoing'
  ) {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: 'This event is currently live and in session. Live scanner passes and attendance tracking are active and cannot be modified.',
      allowedFieldTypes: 'none',
    };
  }

  // 6. Check Lifecycle Proposal Status
  const status = event.proposalStatus || 'draft';

  switch (status) {
    case 'draft':
      return {
        editable: true,
        lockLevel: 'unlocked',
        allowedFieldTypes: 'all',
      };

    case 'returned':
      return {
        editable: true,
        lockLevel: 'unlocked',
        reason: event.adviserRemarks
          ? `Returned for revision: ${event.adviserRemarks}`
          : 'Returned for revision by SAO.',
        allowedFieldTypes: 'all',
      };

    case 'rejected':
      return {
        editable: false,
        lockLevel: 'locked',
        reason: event.rejectionReason
          ? `Proposal was rejected: ${event.rejectionReason}`
          : 'Proposal was rejected by SAO administration.',
        allowedFieldTypes: 'none',
      };

    case 'pending':
    case 'pending_review':
      if (userRole === 'admin') {
        return {
          editable: true,
          lockLevel: 'restricted',
          reason: 'Reviewing proposal. Administrative overrides allowed.',
          allowedFieldTypes: 'all',
        };
      }
      return {
        editable: false,
        lockLevel: 'locked',
        reason: 'Proposal is currently under SAO review. Click "Withdraw Proposal" to unlock editing.',
        allowedFieldTypes: 'none',
      };

    case 'approved':
      return {
        editable: true,
        lockLevel: 'restricted',
        reason: 'Event is approved. Core schedule, venue, fines, and budget are locked. Minor descriptive changes are permitted.',
        allowedFieldTypes: 'minor_only',
      };

    default:
      return {
        editable: false,
        lockLevel: 'locked',
        reason: `Event in "${status}" state cannot be modified.`,
        allowedFieldTypes: 'none',
      };
  }
}

/**
 * Checks whether a specific field within an event is locked against modifications.
 */
export function isMajorFieldLocked(
  fieldOrEvent: string | Partial<EventDocument> | null | undefined,
  eventOrField?: Partial<EventDocument> | string | null,
  userRole: 'admin' | 'officer' | string = 'officer'
): boolean {
  let fieldName: string | undefined;
  let event: Partial<EventDocument> | null | undefined;

  if (typeof fieldOrEvent === 'string') {
    fieldName = fieldOrEvent;
    event = eventOrField as Partial<EventDocument> | null | undefined;
  } else {
    event = fieldOrEvent;
    fieldName = eventOrField as string | undefined;
  }

  if (!event || !fieldName) return false;

  const { lockLevel } = isEventEditable(event, userRole);
  if (lockLevel === 'locked') return true;
  if (lockLevel === 'unlocked') return false;

  // If restricted (e.g. Approved status), all major fields are locked
  if (lockLevel === 'restricted') {
    return MAJOR_EVENT_FIELDS.includes(fieldName);
  }

  return false;
}

export type EventTimingStatus = 'upcoming' | 'ongoing' | 'completed';

/**
 * Formats a Firestore Timestamp, Date, or ISO/YYYY-MM-DD value into a local YYYY-MM-DD string
 * without shifting days across UTC boundaries.
 */
function toLocalDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    return '';
  }
  let dateObj: Date | null = null;
  if (val && typeof val.toDate === 'function') {
    dateObj = val.toDate();
  } else if (val instanceof Date) {
    dateObj = val;
  } else if (val && typeof val.seconds === 'number') {
    dateObj = new Date(val.seconds * 1000);
  }
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '';
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

/**
 * Parses both 24-hour ("17:30") and 12-hour ("5:30 PM") time strings into [hours, minutes].
 */
function parseTimeTo24h(timeStr: string | undefined | null, fallbackHours: number, fallbackMinutes: number): [number, number] {
  if (!timeStr || typeof timeStr !== 'string') {
    return [fallbackHours, fallbackMinutes];
  }
  const clean = timeStr.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!match) {
    return [fallbackHours, fallbackMinutes];
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3];

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return [fallbackHours, fallbackMinutes];
  }
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  return [Math.min(23, Math.max(0, hours)), Math.min(59, Math.max(0, minutes))];
}

function buildLocalDateTime(dateVal: any, timeStr: string | undefined | null, isEnd: boolean): Date | null {
  const dateStr = toLocalDateStr(dateVal);
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hh, mm] = parseTimeTo24h(timeStr, isEnd ? 23 : 0, isEnd ? 59 : 0);
  return new Date(year, month - 1, day, hh, mm, isEnd ? 59 : 0);
}

/**
 * Checks whether an event has already started based on its earliest session or start date/time
 * against the local client clock.
 */
export function hasEventStarted(event?: Partial<EventDocument> | null): boolean {
  if (!event) return false;
  const status = (event.status || '').toLowerCase();
  const pStatus = (event.proposalStatus || '').toLowerCase();
  const lStatus = ((event as any).lifecycleStatus || '').toLowerCase();

  if (
    status === 'ongoing' ||
    status === 'completed' ||
    pStatus === 'completed' ||
    lStatus === 'ongoing' ||
    lStatus === 'completed' ||
    lStatus === 'concluded' ||
    Boolean((event as any).isConcluded) ||
    Boolean(event.completedAt)
  ) {
    return true;
  }

  const now = new Date();
  const sessions = Array.isArray(event.sessions) ? event.sessions : [];

  if (sessions.length > 0) {
    let earliestStart: Date | null = null;
    for (const s of sessions) {
      const start = buildLocalDateTime(s.date, s.startTime || '00:00', false);
      if (start && (!earliestStart || start < earliestStart)) {
        earliestStart = start;
      }
    }
    if (earliestStart) {
      return now >= earliestStart;
    }
  }

  const fallbackDate = event.startDate || (event as any).date || event.endDate;
  const fallbackStart = buildLocalDateTime(fallbackDate, event.startTime || '00:00', false);
  if (fallbackStart) {
    return now >= fallbackStart;
  }

  return false;
}

/**
 * Calculates the real-time operational schedule status of an event
 * based on its session dates, start/end times, and lifecycle markers.
 */
export function getEventTimingStatus(event?: Partial<EventDocument> | null): EventTimingStatus {
  if (!event) return 'upcoming';
  if (event.status === 'completed' || event.proposalStatus === 'completed') {
    return 'completed';
  }
  if (event.status === 'ongoing') {
    return 'ongoing';
  }

  const now = new Date();
  const sessions = event.sessions || [];
  if (sessions.length === 0) {
    const startDateVal = event.startDate || (event as any).date;
    const endDateVal = event.endDate || startDateVal;
    const start = buildLocalDateTime(startDateVal, event.startTime || '00:00', false);
    const end = buildLocalDateTime(endDateVal, event.endTime || '23:59', true);
    if (end && now > end) return 'completed';
    if (start && end && now >= start && now <= end) return 'ongoing';
    return 'upcoming';
  }

  let allCompleted = true;
  let hasOngoing = false;

  for (const session of sessions) {
    const start = buildLocalDateTime(session.date, session.startTime || '00:00', false);
    const end = buildLocalDateTime(session.date, session.endTime || '23:59', true);
    if (!start || !end) continue;

    if (now >= start && now <= end) {
      hasOngoing = true;
      allCompleted = false;
      break;
    }

    if (now <= end) {
      allCompleted = false;
    }
  }

  if (hasOngoing) return 'ongoing';
  if (allCompleted) return 'completed';
  return 'upcoming';
}

/**
 * Checks whether all scheduled sessions of an event have officially ended.
 */
export function areEventSessionsOver(
  event?: Partial<EventDocument> | null
): { allOver: boolean; reason?: string; unfinishedSession?: any } {
  if (!event) {
    return { allOver: false, reason: 'Event not found.' };
  }

  const now = new Date();
  const sessions = event.sessions || [];
  if (sessions.length === 0) {
    const dateVal = event.endDate || event.startDate || (event as any).date;
    const dateStr = toLocalDateStr(dateVal);
    if (dateStr) {
      const end = buildLocalDateTime(dateVal, event.endTime || '23:59', true);
      if (end && now < end) {
        return {
          allOver: false,
          reason: `Event date has not finished yet (scheduled until ${dateStr} ${event.endTime || '23:59'}).`,
        };
      }
    }
    return { allOver: true };
  }

  for (const s of sessions) {
    const dateStr = toLocalDateStr(s.date);
    if (!dateStr) continue;

    const end = buildLocalDateTime(s.date, s.endTime || '23:59', true);
    if (end && now < end) {
      return {
        allOver: false,
        unfinishedSession: s,
        reason: `Session "${s.title || 'Scheduled Session'}" is not over yet (scheduled until ${dateStr} ${s.endTime || '23:59'}). All sessions must conclude before the event can be completed.`,
      };
    }
  }

  return { allOver: true };
}

/**
 * Checks whether an event can be concluded.
 */
export function canConcludeEvent(
  event?: Partial<EventDocument> | null
): { canConclude: boolean; reason?: string; unfinishedSession?: any } {
  if (!event) {
    return { canConclude: false, reason: 'Event not found.' };
  }

  if (event.isArchived) {
    return { canConclude: false, reason: 'Archived events cannot be concluded.' };
  }

  const status = (event.status || event.proposalStatus || '').toLowerCase();
  if (status === 'completed' || (event as any).isConcluded) {
    return { canConclude: false, reason: 'Event is already completed.' };
  }

  if (status === 'cancelled' || event.isCancelled) {
    return { canConclude: false, reason: 'Cancelled events cannot be concluded.' };
  }

  if (status === 'rejected') {
    return { canConclude: false, reason: 'Rejected proposals cannot be concluded.' };
  }

  const pStatus = (event.proposalStatus || '').toLowerCase();
  const lStatus = ((event as any).lifecycleStatus || '').toLowerCase();
  const isApproved =
    status === 'approved' ||
    status === 'published' ||
    status === 'ongoing' ||
    pStatus === 'approved' ||
    lStatus === 'approved' ||
    lStatus === 'published' ||
    Boolean((event as any).isApproved) ||
    Boolean((event as any).isDirectPublished);

  if (!isApproved) {
    return { canConclude: false, reason: 'Only approved activities or events can be concluded.' };
  }

  const sessionsOver = areEventSessionsOver(event);
  if (!sessionsOver.allOver) {
    return {
      canConclude: false,
      reason: sessionsOver.reason || 'Event sessions are not over yet.',
      unfinishedSession: sessionsOver.unfinishedSession,
    };
  }

  return { canConclude: true };
}

/**
 * Checks whether a user can initiate cancellation of an event.
 * Rules:
 * 1. ONLY approved and upcoming events can be cancelled (for both Admin and Officer).
 * 2. Unapproved proposals (pending, pending_review, returned, draft, rejected) cannot be cancelled.
 * 3. Completed, ongoing, cancelled, archived, and deleted events cannot be cancelled.
 * 4. SAO Admin can cancel ANY approved upcoming event (institutional or student organization).
 * 5. Student Officers can cancel their own organization's approved upcoming events (cannot cancel SAS institutional events).
 */
export function canCancelEvent(
  event?: Partial<EventDocument> | null,
  userRole: 'admin' | 'officer' | string = 'officer',
  userOrgId?: string
): EventCancellationCheck {
  if (!event) {
    return { canCancel: false, reason: 'Event not found.' };
  }

  if (event.isArchived) {
    return { canCancel: false, reason: 'Archived events cannot be cancelled.' };
  }

  if (
    event.isDeleted ||
    isEventCancelled(event)
  ) {
    return { canCancel: false, reason: 'Event is already cancelled.' };
  }

  if (isEventCancellationPending(event)) {
    return {
      canCancel: false,
      reason: 'A cancellation request with Financial Liquidation is already pending signatory approval.',
    };
  }

  const pStatus = (event.proposalStatus || '').toLowerCase();
  const eStatus = (event.status || '').toLowerCase();
  const lStatus = ((event as any).lifecycleStatus || '').toLowerCase();

  if (pStatus === 'rejected' || eStatus === 'rejected') {
    return { canCancel: false, reason: 'Rejected events cannot be cancelled.' };
  }

  // 1. Unapproved proposals (draft, pending, pending_review, returned) CANNOT be cancelled
  if (
    pStatus === 'pending' ||
    pStatus === 'pending_review' ||
    pStatus === 'returned' ||
    pStatus === 'draft' ||
    eStatus === 'pending' ||
    eStatus === 'draft' ||
    eStatus === 'returned'
  ) {
    return {
      canCancel: false,
      reason: 'Only approved events can be cancelled. Unapproved proposals cannot be cancelled.',
    };
  }

  // 2. Must be approved
  const isApproved =
    pStatus === 'approved' ||
    eStatus === 'approved' ||
    lStatus === 'approved' ||
    lStatus === 'published' ||
    Boolean((event as any).isApproved) ||
    Boolean((event as any).isDirectPublished);

  if (!isApproved) {
    return {
      canCancel: false,
      reason: 'Only approved events can be cancelled.',
    };
  }

  // 3. Must be upcoming (not completed, not ongoing)
  if (
    pStatus === 'completed' ||
    eStatus === 'completed' ||
    lStatus === 'completed' ||
    lStatus === 'concluded' ||
    Boolean((event as any).isConcluded)
  ) {
    return {
      canCancel: false,
      reason: 'Completed events cannot be cancelled.',
    };
  }

  if (eStatus === 'ongoing' || lStatus === 'ongoing') {
    return {
      canCancel: false,
      reason: 'Ongoing events cannot be cancelled while in progress.',
    };
  }

  const timing = getEventTimingStatus(event);
  if (timing !== 'upcoming' || hasEventStarted(event)) {
    return {
      canCancel: false,
      reason:
        timing === 'completed'
          ? 'Completed events cannot be cancelled.'
          : 'Cannot cancel: This event has already started or is currently in progress.',
    };
  }

  // 4. Role authority checks
  if (userRole === 'admin') {
    // Admin can cancel any approved upcoming event, even if not their own event
    return { canCancel: true };
  }

  if (userRole === 'officer') {
    // Institutional SAO events cannot be cancelled by officers
    const isInstitutional = isInstitutionalProposal(event);

    if (isInstitutional) {
      return {
        canCancel: false,
        reason: 'Institutional SAO events can only be cancelled by SAO administration.',
      };
    }

    const eventOrg = (event.hostingOrgId || event.organizationId || (event as any).createdByOrgId || '').toString();
    if (userOrgId && eventOrg && !isMatchingOrganization(userOrgId, eventOrg)) {
      return {
        canCancel: false,
        reason: "Officers can only cancel their own organization's events.",
      };
    }

    return { canCancel: true };
  }

  return { canCancel: false, reason: 'This event cannot be cancelled in its current state.' };
}

/**
 * Checks whether an officer or admin can withdraw a submitted proposal back to 'draft' state.
 */
export function canWithdrawProposal(
  event?: Partial<EventDocument> | null,
  userRole: 'admin' | 'officer' | string = 'officer',
  userId?: string,
  userOrgId?: string
): ProposalWithdrawalCheck {
  if (!event) {
    return { canWithdraw: false, reason: 'Event not found.' };
  }

  const status = (event.proposalStatus || (event as any).status || '').toLowerCase().trim();
  if (status !== 'pending_review' && status !== 'pending' && status !== 'under_review') {
    return {
      canWithdraw: false,
      reason: 'Only proposals currently under review can be withdrawn.',
    };
  }

  // Enforce signature lock rules before checking ownership
  const chain: any[] = Array.isArray((event as any).approvalChain) ? (event as any).approvalChain : [];
  const anySignatorySigned = chain.some(
    (s: any) =>
      s &&
      (s.status === 'endorsed' ||
        s.status === 'approved' ||
        Boolean(s.signedAt) ||
        Boolean(s.signatureUrl))
  );
  const isOrgFunds = (event as any).fundingSource === 'organization_funds';

  if (isOrgFunds) {
    // Organization's own funds go straight to SAS for final approval & signature
    if (
      anySignatorySigned ||
      Boolean((event as any).sasSignedAt) ||
      Boolean((event as any).isApproved) ||
      Boolean((event as any).approvedBy)
    ) {
      return {
        canWithdraw: false,
        reason:
          'Cannot withdraw: SAS has already digitally signed and approved this Organization Funds proposal. Request a Return for Revision instead.',
      };
    }
  } else if (anySignatorySigned) {
    // Officer/School Budget proposals can still be withdrawn even after SAS clearance,
    // EXCEPT once 1 or more campus signatories have digitally signed.
    return {
      canWithdraw: false,
      reason:
        'Cannot withdraw: One or more signatories have already digitally signed this proposal. Request a Return for Revision from SAS/Signatories instead.',
    };
  }

  const officerProp = isOfficerProposal(event);

  // Direct creator/maker can withdraw their own pending proposal (subject to signature lock above)
  const creatorUid = (event as any).createdByUid || (event as any).createdById;
  if (userId && creatorUid && userId === creatorUid) {
    return { canWithdraw: true };
  }

  const normRole = (userRole || '').toLowerCase().trim();
  const isAdmin =
    normRole === 'admin' ||
    normRole === 'sas_admin' ||
    normRole === 'sao_admin' ||
    normRole === 'sao' ||
    normRole === 'sas' ||
    normRole === 'sao_head' ||
    normRole === 'super_admin' ||
    (normRole.includes('admin') && normRole !== 'school_administrator');
  const isOfficerOrAdviser =
    normRole === 'officer' ||
    normRole === 'student_officer' ||
    normRole === 'adviser' ||
    normRole.includes('officer');

  // Creator-only withdrawal rule:
  // Admin can ONLY withdraw proposals authored/managed by SAS, NEVER student organization proposals.
  if (isAdmin) {
    if (officerProp) {
      return {
        canWithdraw: false,
        reason: 'Administrators cannot withdraw student organization proposals. Only the creating organization / owner can withdraw their proposal.',
      };
    }
    return { canWithdraw: true };
  }

  // Officers and club advisers can ONLY withdraw their own organization proposals, NEVER institutional SAS proposals.
  if (isOfficerOrAdviser) {
    if (!officerProp) {
      return {
        canWithdraw: false,
        reason: 'Institutional SAS events cannot be withdrawn by student officers or advisers.',
      };
    }

    const eventOrg = (event.hostingOrgId || event.organizationId || (event as any).createdByOrgId || '').toString();
    if (userOrgId && eventOrg && !isMatchingOrganization(userOrgId, eventOrg)) {
      return {
        canWithdraw: false,
        reason: "Officers and advisers can only withdraw their own organization's proposals.",
      };
    }

    return { canWithdraw: true };
  }

  return { canWithdraw: false, reason: 'Unauthorized to withdraw this proposal.' };
}

/**
 * Checks whether a user has authority to edit/revise a proposal.
 * Rule: Only the owner (proponent organization that created the proposal)
 * has the ability to edit or revise their proposal when in draft or returned status.
 * Administrators CANNOT edit student organization proposals.
 */
export function canEditProposal(
  event?: Partial<EventDocument> | null,
  userRole: 'admin' | 'officer' | string = 'officer',
  userId?: string,
  userOrgId?: string
): ProposalEditCheck {
  if (!event) {
    return { canEdit: false, reason: 'Proposal not found.' };
  }

  const status = (
    event.proposalStatus ||
    (event as any).status ||
    (event as any).lifecycleStatus ||
    'draft'
  ).toLowerCase().trim();
  const isReturned =
    status === 'returned' ||
    status === 'returned_for_revision' ||
    Boolean((event as any).isReturned);
  const isDraft = status === 'draft';

  if (!isDraft && !isReturned) {
    return {
      canEdit: false,
      reason: `Proposals in "${status}" state cannot be revised.`,
    };
  }

  const officerProp = isOfficerProposal(event);

  const normRole = (userRole || '').toLowerCase().trim();
  const isAdmin =
    normRole === 'admin' ||
    normRole === 'sas_admin' ||
    normRole === 'sao_admin' ||
    normRole === 'sao' ||
    normRole === 'sas' ||
    normRole === 'sao_head' ||
    normRole === 'super_admin' ||
    (normRole.includes('admin') && normRole !== 'school_administrator');
  const isOfficerOrAdviser =
    normRole === 'officer' ||
    normRole === 'student_officer' ||
    normRole === 'adviser' ||
    normRole.includes('officer');

  if (isAdmin) {
    if (officerProp) {
      return {
        canEdit: false,
        isOwner: false,
        reason: 'Administrators cannot edit student organization proposals. Only the submitting organization has the ability to revise and resubmit.',
      };
    }
    return { canEdit: true, isOwner: true };
  }

  if (isOfficerOrAdviser) {
    if (!officerProp) {
      return {
        canEdit: false,
        isOwner: false,
        reason: 'Student officers and advisers cannot edit institutional SAS proposals.',
      };
    }

    const eventOrg = (
      event.hostingOrgId ||
      event.organizationId ||
      (event as any).createdByOrgId ||
      ''
    ).toString().trim();

    if (userOrgId && eventOrg && !isMatchingOrganization(userOrgId, eventOrg)) {
      return {
        canEdit: false,
        isOwner: false,
        reason: "You can only edit proposals submitted by your organization.",
      };
    }

    if (!userOrgId && eventOrg) {
      return {
        canEdit: false,
        isOwner: false,
        reason: "You must be signed in with an active organization to edit this proposal.",
      };
    }

    return { canEdit: true, isOwner: true };
  }

  return { canEdit: false, reason: 'Unauthorized to edit this proposal.' };
}

/**
 * Checks whether an administrator can restore a soft-deleted / cancelled event.
 */
export function canRestoreEvent(
  event?: Partial<EventDocument> | null,
  userRole: 'admin' | 'officer' | string = 'admin'
): boolean {
  const normRole = (userRole || '').toLowerCase().trim();
  const isAdmin =
    normRole === 'admin' ||
    normRole === 'sas_admin' ||
    normRole === 'sao_admin' ||
    normRole === 'sao' ||
    normRole === 'sas' ||
    normRole === 'sao_head' ||
    normRole === 'super_admin' ||
    (normRole.includes('admin') && normRole !== 'school_administrator');

  if (!event || !isAdmin) return false;
  if (event.isArchived) return false;
  return Boolean(event.isDeleted || event.proposalStatus === 'cancelled');
}

/**
 * Checks whether an event has concluded (completed or archived).
 */
export function isEventConcluded(event?: Partial<EventDocument> | null): boolean {
  if (!event) return false;
  if (event.isDeleted) return false;
  if (event.isArchived) return true;

  const status = (event.status || '').toLowerCase();
  const proposalStatus = (event.proposalStatus || '').toLowerCase();
  const lifecycleStatus = ((event as any).lifecycleStatus || '').toLowerCase();

  // Exclude cancelled and rejected proposals
  if (
    status === 'cancelled' ||
    proposalStatus === 'cancelled' ||
    proposalStatus === 'rejected' ||
    event.isCancelled
  ) {
    return false;
  }

  // Explicit conclusion flags
  if (
    status === 'completed' ||
    proposalStatus === 'completed' ||
    lifecycleStatus === 'completed' ||
    lifecycleStatus === 'concluded' ||
    (event as any).isConcluded === true ||
    Boolean(event.completedAt)
  ) {
    return true;
  }

  // If approved and scheduled sessions are finished
  if (proposalStatus === 'approved' || status === 'approved') {
    return getEventTimingStatus(event as EventDocument) === 'completed';
  }

  return false;
}

/**
 * Checks whether an event or activity actively uses attendance tracking (QR / Attendance scanner).
 */
export function isEventAttendanceEnabled(event?: Partial<EventDocument> | null): boolean {
  if (!event) return false;
  if (
    event.enableQRTickets === false ||
    (event as any).enableQR === false ||
    (event as any).attendanceEnabled === false
  ) {
    return false;
  }

  const hasSessions = Array.isArray(event.sessions) && event.sessions.length > 0;
  const hasScanners =
    (Array.isArray((event as any).scanners) && (event as any).scanners.length > 0) ||
    (Array.isArray((event as any).scannerUserIds) && (event as any).scannerUserIds.length > 0);

  if ((event as any).isActivityProposal) {
    // Activity proposals do not use attendance unless Operational Studio sessions & scanners/QR were configured
    return hasSessions && (hasScanners || (event as any).attendanceEnabled === true || event.enableQRTickets === true);
  }

  return hasSessions || hasScanners || (event as any).attendanceEnabled === true;
}

/**
 * Checks whether an event is officially concluded and ready for certificate generation.
 */
export function isEventReadyForCertificates(event?: Partial<EventDocument> | null): boolean {
  return isEventConcluded(event) && isEventAttendanceEnabled(event);
}

/**
 * Checks whether an event proposal has been fully signed and endorsed by all designated signatories.
 * If an approval chain is present and non-empty, every step MUST have a confirmed status of 'endorsed' or 'approved'.
 * If the chain has no designated steps, it cannot be considered signed.
 */
export function isProposalFullySigned(chain?: any[] | null): boolean {
  if (!Array.isArray(chain) || chain.length === 0) {
    return false;
  }
  return chain.every(
    (step) => step && (step.status === 'endorsed' || step.status === 'approved')
  );
}





export interface SignatoryProgress {
  signedCount: number;
  totalCount: number;
  ratioText: string; // e.g. "3/5"
  isComplete: boolean;
  percentage: number;
}

/**
 * Calculates the signatory progress of an event/activity proposal.
 * Returns signed count over total designated signatories (e.g. 3/5).
 */
export function getSignatoryProgress(event?: Partial<EventDocument> | any | null): SignatoryProgress {
  const chain: any[] = event?.approvalChain || [];
  const totalCount = Array.isArray(chain) ? chain.length : 0;

  const isApproved =
    event?.proposalStatus === 'approved' ||
    event?.status === 'approved' ||
    (event as any)?.lifecycleStatus === 'approved' ||
    (totalCount > 0 && isProposalFullySigned(chain));

  if (totalCount === 0) {
    return {
      signedCount: 0,
      totalCount: 0,
      ratioText: isApproved ? 'Approved' : '—',
      isComplete: isApproved,
      percentage: isApproved ? 100 : 0,
    };
  }

  let signedCount = chain.filter((s: any) =>
    s && (
      s.status === 'endorsed' ||
      s.status === 'approved' ||
      Boolean(s.signedAt) ||
      Boolean(s.signatureUrl)
    )
  ).length;

  if (isApproved && signedCount < totalCount) {
    signedCount = totalCount;
  }

  const isComplete = signedCount >= totalCount && totalCount > 0;
  const percentage = totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : 0;

  return {
    signedCount,
    totalCount,
    ratioText: `${signedCount}/${totalCount}`,
    isComplete,
    percentage,
  };
}
