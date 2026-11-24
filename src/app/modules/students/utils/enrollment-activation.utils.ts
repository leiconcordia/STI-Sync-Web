import { checkStudentDepartmentEligibility } from '../../organizations/utils/department-eligibility.utils.ts';

const normalize = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export function inferStudentAcademicLevel(student: Record<string, any>): 'COLLEGE' | 'SHS' {
  if (student?.academicLevel === 'SHS') return 'SHS';
  if (student?.academicLevel === 'COLLEGE') return 'COLLEGE';
  const yl = normalize(student?.yearLevel);
  const sem = normalize(student?.semester || student?.term);
  if (yl.includes('grade 11') || yl.includes('grade 12') || sem.includes('trimester')) {
    return 'SHS';
  }
  return 'COLLEGE';
}

export function isStudentEnrolledInPeriod(
  student: Record<string, any>,
  activePeriod: { academicYear?: string; semester?: string; term?: string } | null | undefined
): boolean {
  if (!activePeriod || !activePeriod.academicYear) return true;
  const studentSy = normalize(student?.schoolYear);
  const targetSy = normalize(activePeriod.academicYear);
  if (!studentSy || studentSy !== targetSy) return false;

  const studentTerm = normalize(student?.term || student?.semester);
  const targetTerm = normalize(activePeriod.semester || activePeriod.term);
  if (!targetTerm) return true;
  return studentTerm === targetTerm;
}

/**
 * Finds all ACTIVE students whose recorded schoolYear / semester does NOT match
 * their academic track's currently active academic period.
 */
export function findUnenrolledActiveStudents<T extends Record<string, any>>(
  students: T[],
  activeCollegePeriod: { academicYear?: string; semester?: string; term?: string } | null | undefined,
  activeShsPeriod: { academicYear?: string; semester?: string; term?: string } | null | undefined
): Array<{
  student: T;
  academicLevel: 'COLLEGE' | 'SHS';
  expectedPeriodLabel: string;
}> {
  const results: Array<{
    student: T;
    academicLevel: 'COLLEGE' | 'SHS';
    expectedPeriodLabel: string;
  }> = [];

  for (const student of students || []) {
    if (!student || normalize(student.status) !== 'active') continue;
    const level = inferStudentAcademicLevel(student);
    const activePeriod = level === 'SHS' ? activeShsPeriod : activeCollegePeriod;
    if (!activePeriod || !activePeriod.academicYear) continue;

    if (!isStudentEnrolledInPeriod(student, activePeriod)) {
      const term = activePeriod.semester || activePeriod.term || '';
      results.push({
        student,
        academicLevel: level,
        expectedPeriodLabel: `A.Y. ${activePeriod.academicYear}${term ? ` ${term}` : ''}`,
      });
    }
  }

  return results;
}

export interface OrganizationUnenrolledGroup {
  organizationId: string;
  organizationName: string;
  organizationAcronym: string;
  adviserRecipientIds: string[];
  students: Array<{
    studentDocId: string;
    studentId: string;
    studentName: string;
    courseCode: string;
    yearLevel: string;
    isOfficer: boolean;
    officerRoleName?: string;
  }>;
}

function studentMatchesRecord(student: Record<string, any>, record: Record<string, any>): boolean {
  const tokens = new Set(
    [student?.id, student?.studentId, student?.authUid, student?.email]
      .map(normalize)
      .filter(Boolean)
  );
  if (tokens.size === 0) return false;

  const recTokens = [
    record?.studentId,
    record?.studentSchoolId,
    record?.authUid,
    record?.email,
  ]
    .map(normalize)
    .filter(Boolean);

  return recTokens.some((t) => tokens.has(t));
}

/**
 * Groups unenrolled students by their active organizations so each Club Adviser / Co-Adviser
 * receives one clean grouped alert instead of per-student notification spam.
 */
export function groupUnenrolledByOrganization(params: {
  unenrolledStudents: Array<Record<string, any>>;
  memberships: Array<Record<string, any>>;
  officerRoles?: Array<Record<string, any>>;
  organizations: Array<Record<string, any>>;
}): OrganizationUnenrolledGroup[] {
  const { unenrolledStudents = [], memberships = [], officerRoles = [], organizations = [] } = params;

  const orgById = new Map<string, Record<string, any>>();
  for (const org of organizations) {
    if (org?.id && normalize(org.status) !== 'archived' && org.archived !== true) {
      orgById.set(String(org.id), org);
    }
  }

  const groupMap = new Map<string, OrganizationUnenrolledGroup>();

  const ensureGroup = (org: Record<string, any>): OrganizationUnenrolledGroup => {
    const id = String(org.id);
    const existing = groupMap.get(id);
    if (existing) return existing;

    const adviserTokens = [
      org.adviser?.authUid,
      org.adviser?.email,
      org.coAdviser?.authUid,
      org.coAdviser?.email,
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean);

    const created: OrganizationUnenrolledGroup = {
      organizationId: id,
      organizationName: String(org.name || 'Organization'),
      organizationAcronym: String(org.acronym || org.name || 'ORG'),
      adviserRecipientIds: Array.from(new Set(adviserTokens)),
      students: [],
    };
    groupMap.set(id, created);
    return created;
  };

  for (const stu of unenrolledStudents) {
    const displayName = `${stu.firstName || ''} ${stu.lastName || ''}`.trim() || stu.studentId || 'Student';

    // Track per-org officer role for this student
    const officerRoleByOrg = new Map<string, string>();
    for (const off of officerRoles) {
      if (!off || off.isActive === false || !off.organizationId) continue;
      if (studentMatchesRecord(stu, off)) {
        officerRoleByOrg.set(
          String(off.organizationId),
          String(off.roleName || off.roleTitle || off.roleId || 'Officer')
        );
      }
    }

    const matchedOrgIds = new Set<string>();

    for (const m of memberships) {
      if (!m || !m.organizationId) continue;
      const st = normalize(m.status);
      if (st !== 'active' && st !== 'pending_removal') continue;
      if (!studentMatchesRecord(stu, m)) continue;
      matchedOrgIds.add(String(m.organizationId));
    }

    // Also include any org where they hold an active officer doc even if membership doc differs
    for (const orgId of officerRoleByOrg.keys()) {
      matchedOrgIds.add(orgId);
    }

    for (const orgId of matchedOrgIds) {
      const org = orgById.get(orgId);
      if (!org) continue;
      const group = ensureGroup(org);
      const alreadyAdded = group.students.some((s) => s.studentDocId === String(stu.id || ''));
      if (!alreadyAdded) {
        const roleName = officerRoleByOrg.get(orgId);
        group.students.push({
          studentDocId: String(stu.id || ''),
          studentId: String(stu.studentId || ''),
          studentName: displayName,
          courseCode: String(stu.courseCode || ''),
          yearLevel: String(stu.yearLevel || ''),
          isOfficer: Boolean(roleName),
          officerRoleName: roleName,
        });
      }
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => b.students.length - a.students.length);
}

export interface ReactivationMembershipPlan {
  eligibleToRestore: Array<{ membershipId: string; organizationId: string }>;
  ineligibleFlagged: Array<{ membershipId: string; organizationId: string; reason: string }>;
  skippedNonEnrollmentInactive: Array<{ membershipId: string; organizationId: string }>;
}

/**
 * Evaluates which inactive organization memberships should be restored when a student
 * re-enrolls / is reactivated.
 * - Restores inactive memberships ONLY if the student is still department-eligible for that org
 *   AND the membership was not manually removed/rejected/suspended or previously flagged ineligible.
 * - Flags inactive memberships where the student shifted out of the org's allowed department.
 */
export function evaluateReactivationMembershipEligibility(params: {
  student: Record<string, any>;
  memberships: Array<Record<string, any>>;
  organizations: Array<Record<string, any>>;
  departments?: Array<Record<string, any>>;
  courses?: Array<Record<string, any>>;
}): ReactivationMembershipPlan {
  const { student, memberships = [], organizations = [], departments = [], courses = [] } = params;

  const orgById = new Map<string, Record<string, any>>();
  for (const org of organizations) {
    if (org?.id) orgById.set(String(org.id), org);
  }

  const eligibleToRestore: ReactivationMembershipPlan['eligibleToRestore'] = [];
  const ineligibleFlagged: ReactivationMembershipPlan['ineligibleFlagged'] = [];
  const skippedNonEnrollmentInactive: ReactivationMembershipPlan['skippedNonEnrollmentInactive'] = [];

  for (const m of memberships) {
    if (!m || !m.organizationId) continue;
    const st = normalize(m.status);
    if (st !== 'inactive') continue;

    // Never auto-restore memberships explicitly removed or manually suspended for disciplinary reasons
    if (m.removedAt || m.removalReason) {
      skippedNonEnrollmentInactive.push({
        membershipId: String(m.id || ''),
        organizationId: String(m.organizationId),
      });
      continue;
    }

    const org = orgById.get(String(m.organizationId));
    if (!org || normalize(org.status) === 'archived' || org.archived === true) {
      continue;
    }

    const check = checkStudentDepartmentEligibility(org, student, departments, courses);
    if (check.eligible) {
      eligibleToRestore.push({
        membershipId: String(m.id || ''),
        organizationId: String(org.id),
      });
    } else {
      ineligibleFlagged.push({
        membershipId: String(m.id || ''),
        organizationId: String(org.id),
        reason: check.reason || `Student's program is no longer eligible for ${org.name || 'this organization'}.`,
      });
    }
  }

  return {
    eligibleToRestore,
    ineligibleFlagged,
    skippedNonEnrollmentInactive,
  };
}
