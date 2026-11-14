import type { OrganizationMemberDocument } from '../types/member.types';
import { areEventSessionsOver } from '../../events/utils/event-lifecycle.utils';

export interface ActivitySignupCheckContext {
  payables?: Array<Record<string, any>>;
  registrations?: Array<Record<string, any>>;
  attendanceRecords?: Array<Record<string, any>>;
}

function normStr(val: unknown): string {
  return String(val ?? '').trim().toLowerCase();
}

/**
 * Collect all normalized identifiers for an organization member (and optional student doc)
 * so cross-collection checks work consistently across studentId, schoolId, authUid, and doc id.
 */
export function normalizeMemberIdentifiers(
  member: Partial<OrganizationMemberDocument> & Record<string, any>,
  studentDoc?: Record<string, any> | null
): { idSet: Set<string>; idList: string[] } {
  const idSet = new Set<string>();
  const rawList: string[] = [];

  const pushVal = (v: unknown) => {
    const raw = String(v ?? '').trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    if (!idSet.has(lower)) {
      idSet.add(lower);
      rawList.push(raw);
    }
  };

  pushVal(member.studentId);
  pushVal(member.studentSchoolId);
  pushVal(member.authUid);
  pushVal(member.studentAuthUid);
  pushVal(member.email);

  if (studentDoc) {
    pushVal(studentDoc.id);
    pushVal(studentDoc.studentId);
    pushVal(studentDoc.authUid);
    pushVal(studentDoc.email);
  }

  return { idSet, idList: rawList };
}

/**
 * Checks whether an activity/event belongs to the specified organization.
 */
export function isClubActivity(activity: Record<string, any>, organizationId: string): boolean {
  if (!activity || !organizationId) return false;
  const target = normStr(organizationId);
  return (
    normStr(activity.hostingOrgId) === target ||
    normStr(activity.organizationId) === target
  );
}

/**
 * Checks whether an activity has already ended, been concluded, cancelled, rejected, or archived/deleted.
 */
export function isActivityEndedOrCancelled(activity: Record<string, any>): boolean {
  if (!activity) return true;
  if (activity.isDeleted || activity.isArchived || activity.isCancelled || activity.isConcluded) {
    return true;
  }

  const pStatus = normStr(activity.proposalStatus);
  const eStatus = normStr(activity.status);
  const lStatus = normStr(activity.lifecycleStatus);

  const terminalStatuses = new Set(['completed', 'cancelled', 'rejected', 'archived', 'voided']);
  if (
    terminalStatuses.has(pStatus) ||
    terminalStatuses.has(eStatus) ||
    terminalStatuses.has(lStatus)
  ) {
    return true;
  }

  // Only check schedule expiration if the activity already has sessions or an explicit date
  const hasSessions = Array.isArray(activity.sessions) && activity.sessions.length > 0;
  const hasDate = Boolean(activity.endDate || activity.startDate || activity.date);
  if (hasSessions || hasDate) {
    return areEventSessionsOver(activity as any).allOver;
  }

  return false;
}

function recordMatchesMember(record: Record<string, any>, idSet: Set<string>): boolean {
  const candidates = [
    record.studentId,
    record.studentSchoolId,
    record.studentAuthUid,
    record.authUid,
    record.uid,
    record.userId,
    record.email,
  ];
  return candidates.some((c) => {
    const n = normStr(c);
    return n !== '' && idSet.has(n);
  });
}

function arrayMatchesMember(arr: unknown, idSet: Set<string>): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.some((item) => {
    if (typeof item === 'string' || typeof item === 'number') {
      return idSet.has(normStr(item));
    }
    if (item && typeof item === 'object') {
      return recordMatchesMember(item as Record<string, any>, idSet);
    }
    return false;
  });
}

/**
 * Determines whether a member is already signed up for a specific upcoming activity.
 * Inspects registration records, inline activity participant lists, attendance records,
 * and active/unlocked/paid event payables.
 */
export function isStudentSignedUpForActivity(
  activity: Record<string, any>,
  memberIds: Set<string>,
  context: ActivitySignupCheckContext = {}
): boolean {
  if (!activity || memberIds.size === 0) return false;
  const eventId = normStr(activity.id);

  // If the activity explicitly excluded this member on creation, they cannot be signed up via club fallback
  if (arrayMatchesMember(activity.excludedMemberIds, memberIds)) {
    return false;
  }

  // 1. Inline signup / participant arrays on the activity document
  if (
    arrayMatchesMember(activity.registeredStudentIds, memberIds) ||
    arrayMatchesMember(activity.registeredStudents, memberIds) ||
    arrayMatchesMember(activity.participantIds, memberIds) ||
    arrayMatchesMember(activity.participants, memberIds) ||
    arrayMatchesMember(activity.attendees, memberIds)
  ) {
    return true;
  }

  // 2. Explicit registration / RSVP records
  if (context.registrations && context.registrations.length > 0) {
    const hasReg = context.registrations.some((reg) => {
      const regEventId = normStr(reg.eventId || reg.activityId);
      if (eventId && regEventId && regEventId !== eventId) return false;
      const regStatus = normStr(reg.status || 'registered');
      if (['cancelled', 'canceled', 'withdrawn', 'rejected', 'removed'].includes(regStatus)) {
        return false;
      }
      return recordMatchesMember(reg, memberIds);
    });
    if (hasReg) return true;
  }

  // 3. Attendance check-in / pre-registered records
  if (context.attendanceRecords && context.attendanceRecords.length > 0) {
    const hasAtt = context.attendanceRecords.some((att) => {
      const attEventId = normStr(att.eventId || att.activityId);
      if (eventId && attEventId !== eventId) return false;
      return recordMatchesMember(att, memberIds);
    });
    if (hasAtt) return true;
  }

  // 4. Event payables showing active sign-up / payment / unlocked QR pass
  if (context.payables && context.payables.length > 0) {
    const hasActiveEventSignupPayable = context.payables.some((p) => {
      if (normStr(p.eventId) !== eventId) return false;
      if (!recordMatchesMember(p, memberIds)) return false;

      const pStatus = normStr(p.status);
      if (['waived', 'refunded', 'refund_pending', 'cancelled'].includes(pStatus)) {
        return false;
      }

      const paidAmount = Number(p.paidAmount || 0);
      return (
        pStatus === 'paid' ||
        pStatus === 'partial' ||
        paidAmount > 0 ||
        p.qrTicketUnlocked === true ||
        p.selfRegistered === true ||
        p.isRegistered === true
      );
    });
    if (hasActiveEventSignupPayable) return true;
  }

  return false;
}

/**
 * Members who currently belong to the club roster (active or awaiting activity completion before removal).
 */
export function isMemberCurrentlyInClub(member: Partial<OrganizationMemberDocument>): boolean {
  return member.status === 'active' || member.status === 'pending_removal';
}

/**
 * Only fully active members can be newly enrolled into newly created activities or club dues.
 * Members who are scheduled for removal ('pending_removal') or removed ('removed') are excluded.
 */
export function isMemberEligibleForNewActivities(member: Partial<OrganizationMemberDocument>): boolean {
  return member.status === 'active';
}

/**
 * Checks if a student is excluded from an activity via excludedMemberIds or removed/pending_removal club status.
 */
export function isStudentExcludedFromClubActivity(
  studentIdentifiers: Set<string>,
  activity: Record<string, any>
): boolean {
  if (!activity || studentIdentifiers.size === 0) return false;
  return arrayMatchesMember(activity.excludedMemberIds, studentIdentifiers);
}

/**
 * Collects unique normalized member identifiers for members whose status is 'pending_removal' or 'removed'
 * so newly created club activities permanently exclude them.
 */
export function extractExcludedMemberIdentifiers(
  members: Array<Partial<OrganizationMemberDocument> & Record<string, any>>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const m of members) {
    if (m.status !== 'pending_removal' && m.status !== 'removed') continue;
    const { idList } = normalizeMemberIdentifiers(m);
    for (const id of idList) {
      const key = id.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(id);
      }
    }
  }

  return result;
}
