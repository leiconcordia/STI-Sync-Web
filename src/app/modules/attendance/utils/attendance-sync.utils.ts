import type { AttendanceRecord, AttendanceStatus } from '../types/attendance.types';

/**
 * Normalizes varied year-level labels (e.g. "G11", "Grade 11", "11", "1st Year")
 * into canonical tokens so proposal filters and student registry docs align.
 */
export function normalizeAttendanceYearToken(val: unknown): string {
  const raw = String(val ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'g11' || raw === 'grade 11' || raw === '11') return '11';
  if (raw === 'g12' || raw === 'grade 12' || raw === '12') return '12';
  if (raw.includes('1st') || raw === '1' || raw === '1101') return '1';
  if (raw.includes('2nd') || raw === '2' || raw === '1102') return '2';
  if (raw.includes('3rd') || raw === '3' || raw === '1103') return '3';
  if (raw.includes('4th') || raw === '4' || raw === '1104' || raw === '4101') return '4';
  const digits = raw.match(/\d+/);
  return digits ? digits[0] : raw;
}

const EXCLUDED_STUDENT_STATUSES = new Set([
  'INACTIVE',
  'ARCHIVED',
  'RETURNED',
  'DROPPED',
  'SUSPENDED',
]);

export function isActiveRosterStudent(student: any): boolean {
  if (!student || student.archived === true) return false;
  const status = String(student.status || 'ACTIVE').trim().toUpperCase();
  return !EXCLUDED_STUDENT_STATUSES.has(status);
}

/**
 * Filters to active students and removes duplicate Firestore student docs sharing
 * the same official school ID (preferring records linked to Firebase authUid).
 */
export function dedupeActiveStudents<T extends Record<string, any>>(students: T[]): T[] {
  const active = (students || []).filter(isActiveRosterStudent);
  const bySchoolId = new Map<string, T>();
  const noSchoolId: T[] = [];

  for (const s of active) {
    const schoolKey = String(s.studentId || s.schoolId || '').trim().toLowerCase();
    if (!schoolKey || schoolKey === 'n/a') {
      noSchoolId.push(s);
      continue;
    }
    const existing = bySchoolId.get(schoolKey);
    if (!existing) {
      bySchoolId.set(schoolKey, s);
      continue;
    }
    const existingScore = (existing.authUid ? 2 : 0) + (existing.courseCode ? 1 : 0);
    const incomingScore = (s.authUid ? 2 : 0) + (s.courseCode ? 1 : 0);
    if (incomingScore > existingScore) {
      bySchoolId.set(schoolKey, s);
    }
  }

  return [...bySchoolId.values(), ...noSchoolId];
}

function resolveStudentAcademicLevel(student: any, courses: any[] = []): 'SHS' | 'COLLEGE' {
  const explicit = String(student?.academicLevel || '').trim().toUpperCase();
  if (explicit === 'SHS') return 'SHS';
  if (explicit === 'COLLEGE') return 'COLLEGE';

  const yearTok = normalizeAttendanceYearToken(student?.yearLevel);
  if (yearTok === '11' || yearTok === '12') return 'SHS';

  const cId = String(student?.courseId || '').trim().toLowerCase();
  const cCode = String(student?.courseCode || '').trim().toLowerCase();
  const matchedCourse = (courses || []).find(
    (c) =>
      String(c.id || '').trim().toLowerCase() === cId ||
      (cCode && String(c.code || '').trim().toLowerCase() === cCode)
  );
  if (matchedCourse) {
    const cLevel = String(matchedCourse.academicLevel || '').trim().toUpperCase();
    if (cLevel === 'SHS') return 'SHS';
    if (cLevel === 'COLLEGE') return 'COLLEGE';
  }

  const courseText = `${student?.courseCode || ''} ${student?.courseName || ''}`.toUpperCase();
  if (
    courseText.includes('SHS') ||
    courseText.includes('STEM') ||
    courseText.includes('ABM') ||
    courseText.includes('HUMSS') ||
    courseText.includes('TVL') ||
    courseText.includes('GAS') ||
    courseText.includes('ITMAWD') ||
    courseText.includes('MAWD')
  ) {
    return 'SHS';
  }

  return 'COLLEGE';
}

/**
 * Checks if a student is part of an event's anticipated target audience.
 */
export function isStudentTargetedForEvent(
  student: any,
  event: any,
  orgMembers?: any[],
  courses: any[] = []
): boolean {
  if (!student || !event) return false;
  if (!isActiveRosterStudent(student)) return false;

  const studentKeys = [
    student.studentId,
    student.schoolId,
    student.id,
    student.authUid,
  ]
    .filter(Boolean)
    .map((v: any) => String(v).trim().toLowerCase());

  // 0. Check excludedMemberIds stamped when new club activities were created
  if (Array.isArray(event.excludedMemberIds) && event.excludedMemberIds.length > 0) {
    const excludedSet = new Set(
      event.excludedMemberIds
        .map((id: any) => String(id || '').trim().toLowerCase())
        .filter(Boolean)
    );
    if (studentKeys.some((k) => excludedSet.has(k))) {
      return false;
    }
  }

  // 1. Target Audience Scope (Org Members Only vs Campus/Specific)
  if (event.targetAudienceScope === 'members') {
    if (Array.isArray(orgMembers)) {
      const targetOrgId = String(event.hostingOrgId || event.organizationId || '').trim().toLowerCase();
      const isMember = orgMembers.some((m) => {
        const mOrg = String(m.organizationId || '').trim().toLowerCase();
        const matchOrg = !targetOrgId || mOrg === targetOrgId;
        const memberKeys = [m.studentId, m.studentSchoolId, m.authUid]
          .filter(Boolean)
          .map((v: any) => String(v).trim().toLowerCase());
        const matchStudent = memberKeys.some((mk) => studentKeys.includes(mk));
        const status = String(m.status || 'active').toLowerCase();
        const isEligibleForThisActivity =
          status === 'active' ||
          (status === 'pending_removal' &&
            Array.isArray(m.scheduledRemovalActivityIds) &&
            m.scheduledRemovalActivityIds.includes(event.id));
        return matchOrg && matchStudent && isEligibleForThisActivity;
      });
      if (!isMember) return false;
    }
  }

  // 2. Target Academic Level (COLLEGE vs SHS vs BOTH)
  if (event.targetAcademicLevel && event.targetAcademicLevel !== 'BOTH') {
    const sLevel = resolveStudentAcademicLevel(student, courses);
    if (sLevel !== event.targetAcademicLevel) {
      return false;
    }
  }

  // 3. Target Departments
  const targetDepts: string[] = Array.isArray(event.targetDepartments) && event.targetDepartments.length > 0
    ? event.targetDepartments
    : Array.isArray(event.targetDepartmentIds)
    ? event.targetDepartmentIds
    : [];
  if (targetDepts.length > 0) {
    const sDeptId = String(student.departmentId || '').trim().toLowerCase();
    const sDeptCode = String(student.departmentCode || '').trim().toLowerCase();
    const matchesDept = targetDepts.some((d) => {
      const clean = String(d || '').trim().toLowerCase();
      return clean === sDeptId || (sDeptCode && clean === sDeptCode);
    });
    if (!matchesDept) return false;
  }

  // 4. Target Courses / Programs (checks both targetCourses & allowedCourses)
  const rawCourses: string[] =
    Array.isArray(event.targetCourses) && event.targetCourses.length > 0
      ? event.targetCourses
      : Array.isArray(event.allowedCourses)
      ? event.allowedCourses
      : [];
  if (rawCourses.length > 0) {
    const sCourseId = String(student.courseId || '').trim().toLowerCase();
    const sCourseCode = String(student.courseCode || '').trim().toLowerCase();
    const sCourseName = String(student.courseName || '').trim().toLowerCase();
    const matchesCourse = rawCourses.some((c) => {
      const token = String(c || '').trim().toLowerCase();
      if (!token) return false;
      if (token === sCourseId || token === sCourseCode || (sCourseName && token === sCourseName)) {
        return true;
      }
      const catalogCourse = (courses || []).find(
        (item) =>
          String(item.id || '').trim().toLowerCase() === token ||
          String(item.code || '').trim().toLowerCase() === token
      );
      if (!catalogCourse) return false;
      const catId = String(catalogCourse.id || '').trim().toLowerCase();
      const catCode = String(catalogCourse.code || '').trim().toLowerCase();
      const catName = String(catalogCourse.name || '').trim().toLowerCase();
      return (
        (sCourseId && sCourseId === catId) ||
        (sCourseCode && sCourseCode === catCode) ||
        (sCourseName && sCourseName === catName)
      );
    });
    if (!matchesCourse) return false;
  }

  // 5. Target Year Levels (normalized so G11 === Grade 11 === 11, 1 === 1st Year)
  if (Array.isArray(event.targetYearLevels) && event.targetYearLevels.length > 0) {
    const sYearNorm = normalizeAttendanceYearToken(student.yearLevel);
    const sYearRaw = String(student.yearLevel || '').trim().toLowerCase();
    const matchesYear = event.targetYearLevels.some((y: string) => {
      const yNorm = normalizeAttendanceYearToken(y);
      const yRaw = String(y || '').trim().toLowerCase();
      return (sYearNorm && yNorm && sYearNorm === yNorm) || sYearRaw === yRaw;
    });
    if (!matchesYear) return false;
  }

  // 6. Target Sections
  if (Array.isArray(event.targetSections) && event.targetSections.length > 0) {
    const sSection = String(student.section || student.sectionId || '').trim().toLowerCase();
    const matchesSection = event.targetSections.some(
      (sec: string) => String(sec || '').trim().toLowerCase() === sSection
    );
    if (!matchesSection) return false;
  }

  return true;
}

/**
 * Resolves the clean, deduplicated list of anticipated participants for an activity.
 */
export function resolveAnticipatedParticipantsForEvent<T extends Record<string, any>>(
  event: any,
  rawStudents: T[],
  orgMembers?: any[],
  courses: any[] = []
): T[] {
  const uniqueActive = dedupeActiveStudents(rawStudents || []);
  return uniqueActive.filter((s) => isStudentTargetedForEvent(s, event, orgMembers, courses));
}

export function sanitizeFirestoreDocKey(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Deterministic document ID for seeded / canonical attendance records in `/attendance`.
 * Prevents duplicate random-ID absentee documents across reloads & browsers.
 */
export function buildDeterministicAttendanceDocId(
  eventId: string,
  sessionId: string,
  studentKey: string
): string {
  return `att_${sanitizeFirestoreDocKey(eventId)}__${sanitizeFirestoreDocKey(
    sessionId
  )}__${sanitizeFirestoreDocKey(String(studentKey || '').toLowerCase())}`;
}

export function isRealAttendanceTime(val?: string | null): boolean {
  if (!val) return false;
  const trimmed = String(val).trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return (
    trimmed !== '—' &&
    trimmed !== '-' &&
    lower !== 'absent' &&
    lower !== 'n/a' &&
    lower !== 'not checked in' &&
    lower !== 'not checked out'
  );
}

const INVALID_ID_TOKENS = new Set(['', 'n/a', 'na', 'unknown', 'null', 'undefined']);

export function extractStudentMatchKeys(recordOrStudent: any): string[] {
  if (!recordOrStudent) return [];
  const rawValues = [
    recordOrStudent.studentSchoolId,
    recordOrStudent.studentNumber,
    recordOrStudent.schoolId,
    recordOrStudent.studentId,
    recordOrStudent.studentAuthUid,
    recordOrStudent.authUid,
    recordOrStudent.uid,
  ];
  const seen = new Set<string>();
  for (const raw of rawValues) {
    const clean = String(raw ?? '').trim().toLowerCase();
    if (!INVALID_ID_TOKENS.has(clean)) {
      seen.add(clean);
    }
  }
  return Array.from(seen);
}

/**
 * Maps every known identifier for each student (schoolId, authUid, Firestore doc id)
 * to a single canonical student key (preferring official school ID).
 */
export function buildCanonicalAttendanceLookup(students: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of students || []) {
    const canonical = String(s.studentId || s.schoolId || s.authUid || s.id || '')
      .trim()
      .toLowerCase();
    if (INVALID_ID_TOKENS.has(canonical)) continue;
    for (const raw of [s.studentId, s.schoolId, s.authUid, s.id, s.uid]) {
      const k = String(raw ?? '').trim().toLowerCase();
      if (!INVALID_ID_TOKENS.has(k)) {
        map.set(k, canonical);
      }
    }
  }
  return map;
}

export function resolveMergedAttendanceStatus(params: {
  rawStatus?: string;
  checkIn?: string;
  checkOut?: string;
  scannedAt?: any;
  isFlagged?: boolean;
  flaggedReason?: string;
}): AttendanceStatus {
  const statusStr = String(params.rawStatus || '').trim().toLowerCase();
  if (params.isFlagged || statusStr === 'flagged') {
    return 'Flagged';
  }

  const hasIn = isRealAttendanceTime(params.checkIn);
  const hasOut = isRealAttendanceTime(params.checkOut);
  const hasScanTime = Boolean(params.scannedAt);

  if (hasOut && hasIn) {
    return statusStr === 'checked out' ? 'Checked Out' : 'Complete';
  }
  if (hasOut) {
    return 'Checked Out';
  }
  if (hasIn || hasScanTime) {
    if (statusStr === 'late') return 'Late';
    return 'Present';
  }

  if (statusStr === 'complete') return 'Complete';
  if (statusStr === 'checked out') return 'Checked Out';
  if (statusStr === 'late') return 'Late';
  if (statusStr === 'present' || statusStr === 'checked in') return 'Present';
  return 'Absent';
}

export function isAttendedStatus(status?: string): boolean {
  const s = String(status || '').trim().toLowerCase();
  return (
    s === 'present' ||
    s === 'complete' ||
    s === 'checked in' ||
    s === 'checked out' ||
    s === 'late'
  );
}

const TIMESTAMP_MILLIS = (val: any): number => {
  if (!val) return 0;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val?.seconds === 'number') return val.seconds * 1000;
  const parsed = Date.parse(String(val));
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Merges multiple Firestore attendance docs belonging to the same (event, session, student)
 * across collectionGroup('/events/{id}/attendance') and top-level '/attendance'—including
 * when a seeded Absent record uses school ID and a synced mobile scan uses Firebase authUid.
 * Scanned Present/Time-In/Time-Out metadata ALWAYS takes priority over default Absent seeds.
 */
export function mergeAttendanceRecordsForRoster(
  records: AttendanceRecord[],
  canonicalLookup?: Map<string, string>
): AttendanceRecord[] {
  const pickTime = (a?: string, b?: string): string => {
    if (isRealAttendanceTime(a)) return String(a).trim();
    if (isRealAttendanceTime(b)) return String(b).trim();
    if (a && a !== '—' && a !== '') return a;
    if (b && b !== '—' && b !== '') return b;
    return '—';
  };

  // Build transitive equivalence index across records when canonicalLookup isn't available
  const aliasToCluster = new Map<string, string>();
  const resolveClusterKey = (r: AttendanceRecord): string => {
    const keys = extractStudentMatchKeys(r);
    if (canonicalLookup) {
      for (const k of keys) {
        const canonical = canonicalLookup.get(k);
        if (canonical) return canonical;
      }
    }
    for (const k of keys) {
      const cluster = aliasToCluster.get(k);
      if (cluster) {
        for (const k2 of keys) aliasToCluster.set(k2, cluster);
        return cluster;
      }
    }
    const chosen = keys[0] || String(r.id || '').trim().toLowerCase();
    for (const k of keys) aliasToCluster.set(k, chosen);
    return chosen;
  };

  const mergedMap = new Map<string, AttendanceRecord>();

  for (const r of records || []) {
    if (r.status === 'Flagged') {
      mergedMap.set(`flagged::${r.id}`, r);
      continue;
    }

    const eventKey = String(r.eventId || r.event || '').trim().toLowerCase();
    const sessionKey = String(r.sessionId || 'default').trim().toLowerCase();
    const studentKey = resolveClusterKey(r);
    const mergeKey = `${eventKey}::${sessionKey}::${studentKey}`;

    const existing = mergedMap.get(mergeKey);
    if (!existing) {
      mergedMap.set(mergeKey, r);
      continue;
    }

    const existingHasScan =
      isRealAttendanceTime(existing.checkIn) ||
      isRealAttendanceTime(existing.checkOut) ||
      Boolean(existing.scannedAt) ||
      (existing.status !== 'Absent' && !existing.isDefaultAbsentSeed);
    const incomingHasScan =
      isRealAttendanceTime(r.checkIn) ||
      isRealAttendanceTime(r.checkOut) ||
      Boolean(r.scannedAt) ||
      (r.status !== 'Absent' && !r.isDefaultAbsentSeed);

    const mergedCheckIn = pickTime(existing.checkIn, r.checkIn);
    const mergedCheckOut = pickTime(existing.checkOut, r.checkOut);
    const preferredRawStatus =
      existing.status === 'Late' || r.status === 'Late'
        ? 'Late'
        : r.status === 'Checked Out' || existing.status === 'Checked Out'
        ? 'Checked Out'
        : r.status === 'Complete' || existing.status === 'Complete'
        ? 'Complete'
        : incomingHasScan
        ? r.status
        : existing.status;

    const mergedStatus = resolveMergedAttendanceStatus({
      rawStatus: preferredRawStatus,
      checkIn: mergedCheckIn,
      checkOut: mergedCheckOut,
      scannedAt: r.scannedAt || existing.scannedAt,
    });

    // Preserve real scan metadata over default Absent seed fields
    const primary = incomingHasScan && !existingHasScan ? r : existing;
    const secondary = primary === r ? existing : r;

    const resolvedName =
      primary.name && primary.name !== 'Unknown Student' && primary.name !== 'Student'
        ? primary.name
        : secondary.name;

    const existingTs = TIMESTAMP_MILLIS(existing.scannedAt || existing.createdAt);
    const incomingTs = TIMESTAMP_MILLIS(r.scannedAt || r.createdAt);

    mergedMap.set(mergeKey, {
      ...secondary,
      ...primary,
      id: primary.id,
      studentId:
        primary.studentSchoolId ||
        secondary.studentSchoolId ||
        primary.studentId ||
        secondary.studentId,
      studentSchoolId: primary.studentSchoolId || secondary.studentSchoolId,
      studentNumber: primary.studentNumber || secondary.studentNumber,
      studentAuthUid: primary.studentAuthUid || secondary.studentAuthUid,
      name: resolvedName || 'Unknown Student',
      checkIn: mergedCheckIn,
      checkOut: mergedCheckOut,
      status: mergedStatus,
      scannedBy: primary.scannedBy || secondary.scannedBy,
      scannedByName: primary.scannedByName || secondary.scannedByName,
      scanMethod: primary.scanMethod || secondary.scanMethod,
      scannedAt: primary.scannedAt || secondary.scannedAt,
      timeInAt: primary.timeInAt || secondary.timeInAt,
      timeOutAt: primary.timeOutAt || secondary.timeOutAt,
      syncedFromMobile: Boolean(primary.syncedFromMobile || secondary.syncedFromMobile || primary.collectionSource === 'subcollection' || secondary.collectionSource === 'subcollection'),
      isDefaultAbsentSeed: mergedStatus === 'Absent' && Boolean(primary.isDefaultAbsentSeed || secondary.isDefaultAbsentSeed),
      createdAt: incomingTs > existingTs ? (r.createdAt || primary.createdAt) : (existing.createdAt || primary.createdAt),
    });
  }

  const combined = Array.from(mergedMap.values());
  combined.sort((a, b) => {
    const aTime = TIMESTAMP_MILLIS(a.scannedAt || a.createdAt);
    const bTime = TIMESTAMP_MILLIS(b.scannedAt || b.createdAt);
    return bTime - aTime;
  });
  return combined;
}
