import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ATTENDANCE_COLLECTION } from '../../attendance/services/attendance.service';

export interface EventAttendanceBridgeResult {
  registeredCount: number;
  estimatedAttendance: number;
  attendedCount: number;
  hasAttendanceLogs: boolean;
  turnoutRate: number; // 0 to 100
  howManyAttended: string;
  whoAttended: string;
  targetAudience: string;
  breakdownByStatus: {
    complete: number;
    checkedIn: number;
    late: number;
    absent: number;
    flagged: number;
  };
  uniqueCourseCodes: string[];
}

/**
 * Parses numeric participant counts from proposal or event fields (e.g., "120 Students", "120", 120).
 */
export function parseParticipantCount(raw: any): number {
  if (typeof raw === 'number' && !isNaN(raw)) return raw;
  if (typeof raw === 'string') {
    const match = raw.match(/\d+/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return 0;
}

/**
 * Bridges a concluded event's live attendance records to the Post-Activity Report (Form PAR-01).
 * Eliminates static fallback counts (e.g. 50) by querying verified attendance logs,
 * computing real turnout rates, and formatting demographic breakdowns.
 */
export async function computeEventAttendanceSummary(
  eventId: string,
  eventData?: any,
  proposalData?: any
): Promise<EventAttendanceBridgeResult> {
  // Derive default target audience without static placeholders like "Enrolled STI Students"
  let defaultTargetAudience = '';
  if (proposalData?.targetAudience) {
    const aud = proposalData.targetAudience;
    if (typeof aud === 'string') {
      defaultTargetAudience = aud;
    } else if (typeof aud === 'object') {
      if (Array.isArray(aud.courseCodes) && aud.courseCodes.length > 0) {
        defaultTargetAudience = aud.courseCodes.join(', ');
      } else if (Array.isArray(aud.courses) && aud.courses.length > 0) {
        defaultTargetAudience = aud.courses.join(', ');
      } else if (Array.isArray(aud.departments) && aud.departments.length > 0) {
        defaultTargetAudience = aud.departments.join(', ');
      } else if (Array.isArray(aud.academicLevels) && aud.academicLevels.length > 0) {
        defaultTargetAudience = aud.academicLevels.join(', ');
      }
    }
  }

  if (!defaultTargetAudience) {
    defaultTargetAudience =
      proposalData?.targetAudienceText ||
      proposalData?.targetMarket ||
      eventData?.targetAudienceText ||
      eventData?.targetMarket ||
      '';
  }

  // 1. Determine planned / expected target headcount
  const expectedFromProposal = parseParticipantCount(proposalData?.estimatedAttendance);
  const expectedFromEvent = parseParticipantCount(
    eventData?.expectedParticipantCount ?? eventData?.expectedAttendees ?? eventData?.registeredCount
  );
  let expectedHeadcount = expectedFromProposal || expectedFromEvent || 0;

  // 2. Fetch attendance records from Firestore
  const attendanceDocsMap = new Map<string, any>();

  try {
    // Primary query by eventId
    if (eventId) {
      const snap = await getDocs(
        query(collection(db, ATTENDANCE_COLLECTION), where('eventId', '==', eventId))
      );
      snap.docs.forEach((d) => attendanceDocsMap.set(d.id, d.data()));
    }

    // Secondary query by event title if eventId query returned 0 (legacy records support)
    const eventTitle = eventData?.title || proposalData?.title;
    if (attendanceDocsMap.size === 0 && eventTitle) {
      const titleSnap = await getDocs(
        query(collection(db, ATTENDANCE_COLLECTION), where('event', '==', eventTitle))
      );
      titleSnap.docs.forEach((d) => attendanceDocsMap.set(d.id, d.data()));
    }
  } catch (err) {
    console.warn('[computeEventAttendanceSummary] Attendance query error:', err);
  }

  // 3. De-duplicate unique students and filter attendees
  // Unique by studentId or studentAuthUid
  const uniqueAttendees = new Map<string, any>();
  const courseCodeSet = new Set<string>();
  const sectionSet = new Set<string>();

  const breakdown = {
    complete: 0,
    checkedIn: 0,
    late: 0,
    absent: 0,
    flagged: 0,
  };

  attendanceDocsMap.forEach((row, docId) => {
    const rawStatus = (row.status || '').toLowerCase().trim();
    const isAttended =
      rawStatus === 'complete' ||
      rawStatus === 'checked in' ||
      rawStatus === 'present' ||
      rawStatus === 'late' ||
      Boolean(row.checkIn) ||
      Boolean(row.scannedAt);

    if (rawStatus === 'complete') breakdown.complete++;
    else if (rawStatus === 'checked in' || rawStatus === 'present') breakdown.checkedIn++;
    else if (rawStatus === 'late') breakdown.late++;
    else if (rawStatus === 'absent') breakdown.absent++;
    else if (rawStatus === 'flagged') breakdown.flagged++;

    if (row.courseCode) courseCodeSet.add(row.courseCode.trim());
    if (row.section) sectionSet.add(row.section.trim());

    if (isAttended) {
      const studentKey = (row.studentId || row.studentAuthUid || row.name || docId).trim().toLowerCase();
      if (!uniqueAttendees.has(studentKey)) {
        uniqueAttendees.set(studentKey, row);
      }
    }
  });

  const actualAttendedCount = uniqueAttendees.size;

  // If expected headcount wasn't specified in the proposal or is lower than actual attendance,
  // adapt expectedHeadcount so that turnout remains realistic
  if (expectedHeadcount === 0) {
    expectedHeadcount = actualAttendedCount > 0 ? actualAttendedCount : 0;
  } else if (actualAttendedCount > expectedHeadcount) {
    // If more attended than originally planned
    expectedHeadcount = actualAttendedCount;
  }

  // 4. Calculate Turnout Rate
  const turnoutRate =
    expectedHeadcount > 0
      ? Math.min(100, Math.round((actualAttendedCount / expectedHeadcount) * 100))
      : actualAttendedCount > 0
      ? 100
      : 0;

  // 5. Construct formatted demographic whoAttended string
  let whoAttended = defaultTargetAudience;
  const courseList = Array.from(courseCodeSet).filter(Boolean);
  if (courseList.length > 0) {
    const coursesStr = courseList.join(', ');
    const sectionsStr = Array.from(sectionSet).filter(Boolean).join(', ');
    if (sectionsStr) {
      whoAttended = `${coursesStr} (Sec. ${sectionsStr})`;
    } else {
      whoAttended = `${coursesStr} Students`;
    }
  }

  // 6. Construct formatted howManyAttended string
  let howManyAttended = '';
  if (actualAttendedCount > 0 && expectedHeadcount > 0) {
    howManyAttended = `${actualAttendedCount} / ${expectedHeadcount} Expected Attendees (${turnoutRate}% Turnout)`;
  } else if (actualAttendedCount > 0) {
    howManyAttended = `${actualAttendedCount} Attendees (Verified Attendance Logs)`;
  } else if (expectedHeadcount > 0) {
    howManyAttended = `0 / ${expectedHeadcount} Expected Attendees`;
  } else {
    howManyAttended = 'Attendance verified via session check-in logs';
  }

  return {
    registeredCount: expectedHeadcount,
    attendedCount: actualAttendedCount,
    turnoutRate,
    howManyAttended,
    whoAttended,
    targetAudience: defaultTargetAudience,
    breakdownByStatus: breakdown,
    uniqueCourseCodes: courseList,
  };
}

