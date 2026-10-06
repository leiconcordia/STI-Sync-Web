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
export function isOfficerProposal(event?: Partial<EventDocument> | any | null): boolean {
  if (!event) return false;

  // 1. Explicit boolean flag
  if (event.isOfficerProposal === true) return true;
  if (event.isOfficerProposal === false) return false;

  // 2. Creator role
  const role = (event.creatorRole || event.createdByRole || '').toLowerCase().trim();
  if (role === 'officer' || role === 'student_officer') return true;
  if (role === 'admin' || role === 'sas_admin' || role === 'sao_admin' || role === 'sas') return false;

  // 3. Explicit SAS direct flag
  if (event.isSasDirect === true || event.isDirectPublished === true) return false;

  // 4. Hosting organization ID or organizationId
  const orgId = (event.organizationId || event.hostingOrgId || event.orgId || '').toLowerCase().trim();
  const SAS_ORGS = ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'sti', 'sti_college', 'institutional'];
  if (orgId && !SAS_ORGS.includes(orgId)) {
    return true; // Belongs to a student organization (e.g. 'jpcs', 'ssc', 'org_123')
  }
  if (orgId && SAS_ORGS.includes(orgId)) {
    return false; // Belongs to institutional SAS
  }

  // 5. Reference number / ID prefix check (e.g. AP-2026-SAS-001 vs AP-2026-JPCS-001 or AP-2026-ORG-001)
  const ref = (event.referenceId || event.referenceNo || '').toUpperCase().trim();
  if (ref.includes('-SAS-') || ref.startsWith('EVT-ADM-')) return false;
  if (ref.includes('-ORG-') || (ref.startsWith('AP-') && !ref.includes('-SAS-'))) return true;

  // 6. Creator email or name fallback
  const email = (event.createdByEmail || '').toLowerCase().trim();
  if (email === 'sao@ormoc.sti.edu.ph' || email.startsWith('sas@') || email.startsWith('sao@')) return false;

  const createdByName = (event.createdByName || '').toLowerCase().trim();
  if (createdByName.includes('student affairs & services') || createdByName === 'sao admin' || createdByName === 'sas admin') return false;

  // 7. Organizers check
  const organizers = Array.isArray(event.organizers) ? event.organizers : [];
  if (organizers.some((o: string) => typeof o === 'string' && o.toLowerCase().includes('student affairs & services'))) {
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
  if (userRole === 'officer' && userOrgId && event.hostingOrgId && event.hostingOrgId !== userOrgId) {
    return {
      editable: false,
      lockLevel: 'locked',
      reason: "Officers can only edit their own organization's proposals.",
      allowedFieldTypes: 'none',
    };
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

  const sessions = event.sessions || [];
  if (sessions.length === 0) {
    return 'upcoming';
  }

  const now = new Date();

  const parseSessionDates = (s: any) => {
    if (!s.date) return { start: null, end: null };
    const dateStr = typeof s.date === 'string' ? s.date.split('T')[0] : '';
    if (!dateStr) return { start: null, end: null };
    const [year, month, day] = dateStr.split('-').map(Number);
    const startParts = (s.startTime || '00:00').split(':').map(Number);
    const endParts = (s.endTime || '23:59').split(':').map(Number);

    const start = new Date(year, month - 1, day, startParts[0] || 0, startParts[1] || 0);
    const end = new Date(year, month - 1, day, endParts[0] || 23, endParts[1] || 59, 59);
    return { start, end };
  };

  let allCompleted = true;
  let hasOngoing = false;

  for (const session of sessions) {
    const { start, end } = parseSessionDates(session);
    if (!start || !end) continue;

    if (now >= start && now <= end) {
      hasOngoing = true;
      allCompleted = false;
      break;
    }

    if (now < start) {
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

  const sessions = event.sessions || [];
  if (sessions.length === 0) {
    // If no explicit sessions array, check startDate / endDate fallback if present
    if (event.endDate || event.startDate) {
      const dateStr = typeof (event.endDate || event.startDate) === 'string'
        ? (event.endDate || event.startDate)!.split('T')[0]
        : '';
      if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const endParts = (event.endTime || '23:59').split(':').map(Number);
        const end = new Date(year, month - 1, day, endParts[0] || 23, endParts[1] || 59, 59);
        if (new Date() < end) {
          return {
            allOver: false,
            reason: `Event date has not finished yet (scheduled until ${dateStr} ${event.endTime || '23:59'}).`,
          };
        }
      }
    }
    return { allOver: true };
  }

  const now = new Date();
  for (const s of sessions) {
    if (!s.date) continue;
    let dateStr = '';
    if (typeof s.date === 'string') {
      dateStr = s.date.split('T')[0];
    } else if (s.date && typeof s.date.toDate === 'function') {
      dateStr = s.date.toDate().toISOString().split('T')[0];
    } else if (s.date instanceof Date) {
      dateStr = s.date.toISOString().split('T')[0];
    } else if (s.date && typeof s.date.seconds === 'number') {
      dateStr = new Date(s.date.seconds * 1000).toISOString().split('T')[0];
    }

    if (!dateStr) continue;

    const [year, month, day] = dateStr.split('-').map(Number);
    const endParts = (s.endTime || '23:59').split(':').map(Number);
    const end = new Date(year, month - 1, day, endParts[0] || 23, endParts[1] || 59, 59);

    if (now < end) {
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
    event.proposalStatus === 'cancelled' ||
    event.status === 'cancelled' ||
    (event as any).isCancelled
  ) {
    return { canCancel: false, reason: 'Event is already cancelled.' };
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
  if (timing !== 'upcoming') {
    return {
      canCancel: false,
      reason:
        timing === 'completed'
          ? 'Completed events cannot be cancelled.'
          : 'Ongoing events cannot be cancelled while in progress.',
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

    if (userOrgId && event.hostingOrgId && event.hostingOrgId !== userOrgId) {
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

  const status = (event.proposalStatus || (event as any).status || '').toLowerCase();
  if (status !== 'pending_review' && status !== 'pending') {
    return {
      canWithdraw: false,
      reason: 'Only proposals currently under review can be withdrawn.',
    };
  }

  const officerProp = isOfficerProposal(event);

  // Creator-only withdrawal rule:
  // Admin can ONLY withdraw proposals authored/managed by SAS, NEVER student organization proposals.
  if (userRole === 'admin') {
    if (officerProp) {
      return {
        canWithdraw: false,
        reason: 'Administrators cannot withdraw student organization proposals. Only the creating organization / owner can withdraw their proposal.',
      };
    }
    return { canWithdraw: true };
  }

  // Officers can ONLY withdraw their own organization proposals, NEVER institutional SAS proposals.
  if (userRole === 'officer') {
    if (!officerProp) {
      return {
        canWithdraw: false,
        reason: 'Institutional SAS events cannot be withdrawn by student officers.',
      };
    }

    if (userOrgId && event.hostingOrgId && event.hostingOrgId !== userOrgId) {
      return {
        canWithdraw: false,
        reason: "Officers can only withdraw their own organization's proposals.",
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

  const status = (event.proposalStatus || (event as any).status || 'draft').toLowerCase();
  const isReturned = status === 'returned';
  const isDraft = status === 'draft';

  if (!isDraft && !isReturned) {
    return {
      canEdit: false,
      reason: `Proposals in "${status}" state cannot be revised.`,
    };
  }

  const officerProp = isOfficerProposal(event);

  if (userRole === 'admin') {
    if (officerProp) {
      return {
        canEdit: false,
        isOwner: false,
        reason: 'Administrators cannot edit student organization proposals. Only the submitting organization has the ability to revise and resubmit.',
      };
    }
    return { canEdit: true, isOwner: true };
  }

  if (userRole === 'officer') {
    if (!officerProp) {
      return {
        canEdit: false,
        isOwner: false,
        reason: 'Student officers cannot edit institutional SAS proposals.',
      };
    }

    if (userOrgId && event.hostingOrgId && event.hostingOrgId !== userOrgId) {
      return {
        canEdit: false,
        isOwner: false,
        reason: "You can only edit proposals submitted by your organization.",
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
  if (!event || userRole !== 'admin') return false;
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
 * Checks whether an event has attendance tracking enabled (Option A QR / Attendance scanner).
 */
export function isEventAttendanceEnabled(event?: Partial<EventDocument> | null): boolean {
  if (!event) return false;
  return (
    event.enableQRTickets !== false &&
    (event as any).enableQR !== false &&
    (event as any).attendanceEnabled !== false
  );
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



