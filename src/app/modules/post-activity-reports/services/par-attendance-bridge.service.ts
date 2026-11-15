import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ATTENDANCE_COLLECTION } from '../../attendance/services/attendance.service';

export interface EventAttendanceBridgeResult {
  registeredCount: number;
  estimatedAttendance: number;
  estimatedAttendanceLabel: string;
  attendanceSource: 'proposal' | 'event' | 'none';
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
  // Derive default target audience prioritizing the actual Target Market set on the proposal/event
  let defaultTargetAudience = (
    proposalData?.targetMarket ||
    proposalData?.targetAudience?.targetMarketSummary ||
    eventData?.targetMarket ||
    eventData?.targetAudience?.targetMarketSummary ||
    proposalData?.targetAudienceText ||
    eventData?.targetAudienceText ||
    ''
  ).trim();

  if (!defaultTargetAudience && proposalData?.targetAudience) {
    const aud = proposalData.targetAudience;
    if (typeof aud === 'string') {
      defaultTargetAudience = aud;
    } else if (typeof aud === 'object') {
      if (Array.isArray(aud.courseCodes) && aud.courseCodes.length > 0) {
        defaultTargetAudience = aud.courseCodes.join(', ');
      } else if (Array.isArray(aud.courses) && aud.courses.length > 0) {
        defaultTargetAudience = aud.courses.join(', ');
      } else if (Array.isArray(aud.departments) && aud.departments.length > 0) {
        const specificDepts = aud.departments.filter((d: string) => d && d !== 'All Academic Departments');
        if (specificDepts.length > 0) {
          defaultTargetAudience = specificDepts.join(', ');
        } else if (Array.isArray(aud.academicLevels) && aud.academicLevels.length > 0) {
          defaultTargetAudience = aud.academicLevels.join(', ');
        } else {
          defaultTargetAudience = aud.departments.join(', ');
        }
      } else if (Array.isArray(aud.academicLevels) && aud.academicLevels.length > 0) {
        defaultTargetAudience = aud.academicLevels.join(', ');
      }
    }
  }

  // 1. Determine planned / expected target headcount strictly connected to linked Activity Proposal
  const proposalCount =
    parseParticipantCount(proposalData?.estAttendanceCount) ||
    parseParticipantCount(proposalData?.estimatedAttendance) ||
    parseParticipantCount(proposalData?.targetAudience?.demographicBreakdown?.expectedAttendees) ||
    parseParticipantCount(proposalData?.targetAudience?.expectedAttendees) ||
    parseParticipantCount(proposalData?.expectedParticipantCount);

  const eventCount =
    parseParticipantCount(eventData?.estAttendanceCount) ||
    parseParticipantCount(eventData?.estimatedAttendance) ||
    parseParticipantCount(eventData?.expectedParticipantCount) ||
    parseParticipantCount(eventData?.expectedAttendees);

  const estimatedAttendance = proposalCount || eventCount || 0;
  const attendanceSource: 'proposal' | 'event' | 'none' =
    proposalCount > 0 ? 'proposal' : eventCount > 0 ? 'event' : 'none';

  const rawQual =
    (proposalCount > 0
      ? proposalData?.estAttendanceQualifier ||
        (typeof proposalData?.estimatedAttendance === 'string'
          ? proposalData.estimatedAttendance.replace(/^\d+\s*/, '').trim()
          : '')
      : eventData?.estAttendanceQualifier ||
        (typeof eventData?.estimatedAttendance === 'string'
          ? eventData.estimatedAttendance.replace(/^\d+\s*/, '').trim()
          : '')) || 'Pax';

  const estimatedAttendanceLabel =
    estimatedAttendance > 0 ? `${estimatedAttendance} ${rawQual}` : 'Not Specified';

  let expectedHeadcount = estimatedAttendance;

  // 2. Fetch attendance records from Firestore (matching Attendance Monitoring streams)
  const attendanceDocsMap = new Map<string, any>();

  try {
    if (eventId) {
      const [groupSnap, topSnap] = await Promise.all([
        getDocs(query(collectionGroup(db, 'attendance'), where('eventId', '==', eventId))),
        getDocs(query(collection(db, ATTENDANCE_COLLECTION), where('eventId', '==', eventId))),
      ]);
      groupSnap.docs.forEach((d) => attendanceDocsMap.set(d.id, d.data()));
      topSnap.docs.forEach((d) => {
        if (!attendanceDocsMap.has(d.id)) {
          attendanceDocsMap.set(d.id, d.data());
        }
      });
    }
  } catch (err) {
    console.warn('[computeEventAttendanceSummary] Attendance query error:', err);
  }

  // 3. De-duplicate unique students and filter attendees
  // Count anyone who actually attended (Checked In, Checked Out, Complete, Present, Late),
  // even without Time-Out; never count Absent or Flagged records.
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
    const rawStatus = String(row.status || '').toLowerCase().trim();
    const checkInStr = String(row.checkIn || '').trim();
    const hasRealCheckIn = Boolean(
      checkInStr &&
      checkInStr !== '—' &&
      checkInStr.toLowerCase() !== 'absent'
    );
    const isAttended =
      rawStatus !== 'absent' &&
      rawStatus !== 'flagged' &&
      (rawStatus === 'complete' ||
        rawStatus === 'checked in' ||
        rawStatus === 'checked out' ||
        rawStatus === 'present' ||
        rawStatus === 'late' ||
        hasRealCheckIn ||
        Boolean(row.scannedAt));

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

  // 5. Prefill whoAttended from the actual Target Market set on the proposal/event;
  // only fall back to attendee course breakdown if no target market was set.
  let whoAttended = defaultTargetAudience;
  const courseList = Array.from(courseCodeSet).filter(Boolean);
  if (!whoAttended && courseList.length > 0) {
    const coursesStr = courseList.join(', ');
    const sectionsStr = Array.from(sectionSet).filter(Boolean).join(', ');
    whoAttended = sectionsStr ? `${coursesStr} (Sec. ${sectionsStr})` : `${coursesStr} Students`;
  }

  // 6. Construct formatted howManyAttended string (without turnout percentage)
  const hasAttendanceLogs = actualAttendedCount > 0;
  const howManyAttended = actualAttendedCount > 0 ? `${actualAttendedCount} Attendees` : '';

  return {
    registeredCount: expectedHeadcount,
    estimatedAttendance,
    estimatedAttendanceLabel,
    attendanceSource,
    attendedCount: actualAttendedCount,
    hasAttendanceLogs,
    turnoutRate,
    howManyAttended,
    whoAttended,
    targetAudience: defaultTargetAudience,
    breakdownByStatus: breakdown,
    uniqueCourseCodes: courseList,
  };
}

