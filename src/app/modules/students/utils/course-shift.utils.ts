import { checkStudentDepartmentEligibility } from '../../organizations/utils/department-eligibility.utils.ts';

export interface CourseShiftTargetProgram {
  academicLevel?: string;
  courseId?: string;
  courseCode: string;
  courseName?: string;
  departmentId?: string;
  departmentName?: string;
  yearLevel?: string;
  section?: string;
}

export interface CourseShiftMembershipImpact {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationAcronym: string;
  membershipStatus: string;
  isCrossDepartmental: boolean;
  eligible: boolean;
  alreadyFlagged: boolean;
  orgDeptLabel: string;
  newStudentDeptLabel: string;
  reason?: string;
}

export interface CourseShiftOfficerImpact {
  officerDocId: string;
  organizationId: string;
  organizationName: string;
  organizationAcronym: string;
  roleId?: string;
  roleName: string;
  eligible: boolean;
  reason?: string;
}

export interface CourseShiftImpactResult {
  isProgramChanging: boolean;
  fromCourseCode: string;
  toCourseCode: string;
  fromDepartmentLabel: string;
  toDepartmentLabel: string;
  canShiftImmediately: boolean;
  retainedMemberships: CourseShiftMembershipImpact[];
  blockingActiveMemberships: CourseShiftMembershipImpact[];
  ineligiblePendingApplications: CourseShiftMembershipImpact[];
  retainedOfficerRoles: CourseShiftOfficerImpact[];
  ineligibleOfficerRoles: CourseShiftOfficerImpact[];
  summaryMessage: string;
}

const normalize = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const ACTIVE_BLOCKING_MEMBER_STATUSES = new Set(['active', 'pending_removal']);

/**
 * Pure evaluator for Course Shift impact on a student's club memberships and officer roles.
 *
 * Governance rules:
 * - Cross-departmental organizations and departmental orgs whose allowed departments include
 *   the student's NEW department remain eligible (retained & metadata-synced).
 * - Active memberships in departmental orgs that do NOT allow the new department are
 *   classified as `blockingActiveMemberships` (hard-blocking manual course shifts until
 *   club officers manually remove the student via Member Directory).
 * - Pending applications to newly-ineligible orgs are flagged for auto-withdrawal.
 * - Active Officer roles in newly-ineligible orgs are classified under `ineligibleOfficerRoles`
 *   (to be auto-revoked with Adviser/Co-Adviser notification).
 */
export function evaluateCourseShiftImpact(params: {
  student: Record<string, any>;
  target: CourseShiftTargetProgram;
  memberships: Array<Record<string, any>>;
  officerRoles?: Array<Record<string, any>>;
  organizations: Array<Record<string, any>>;
  departments?: Array<Record<string, any>>;
  courses?: Array<Record<string, any>>;
}): CourseShiftImpactResult {
  const {
    student,
    target,
    memberships = [],
    officerRoles = [],
    organizations = [],
    departments = [],
    courses = [],
  } = params;

  const orgById = new Map<string, Record<string, any>>();
  for (const org of organizations) {
    if (org?.id) orgById.set(String(org.id), org);
  }

  const fromCourseCode = String(student?.courseCode || '').trim();
  const toCourseCode = String(target?.courseCode || '').trim();

  // Resolve target department from course catalog if not explicitly provided
  let resolvedTargetDeptId = String(target?.departmentId || '').trim();
  let resolvedTargetDeptName = String(target?.departmentName || '').trim();
  if (!resolvedTargetDeptId && (target?.courseId || toCourseCode)) {
    const matchedCourse = courses.find(
      (c) =>
        (target?.courseId && normalize(c?.id) === normalize(target.courseId)) ||
        (toCourseCode && normalize(c?.code) === normalize(toCourseCode))
    );
    if (matchedCourse?.departmentId) {
      resolvedTargetDeptId = String(matchedCourse.departmentId).trim();
    }
  }
  if (resolvedTargetDeptId && !resolvedTargetDeptName) {
    const matchedDept = departments.find((d) => normalize(d?.id) === normalize(resolvedTargetDeptId));
    if (matchedDept?.name) resolvedTargetDeptName = String(matchedDept.name).trim();
  }

  const projectedStudent = {
    ...student,
    academicLevel: target?.academicLevel || student?.academicLevel,
    courseId: target?.courseId || '',
    courseCode: toCourseCode,
    courseName: target?.courseName || toCourseCode,
    departmentId: resolvedTargetDeptId,
    departmentName: resolvedTargetDeptName,
    department: resolvedTargetDeptName,
  };

  const isProgramChanging =
    normalize(fromCourseCode) !== normalize(toCourseCode) ||
    (Boolean(resolvedTargetDeptId) &&
      normalize(student?.departmentId) !== normalize(resolvedTargetDeptId));

  const retainedMemberships: CourseShiftMembershipImpact[] = [];
  const blockingActiveMemberships: CourseShiftMembershipImpact[] = [];
  const ineligiblePendingApplications: CourseShiftMembershipImpact[] = [];

  for (const m of memberships) {
    if (!m || !m.organizationId) continue;
    const status = normalize(m.status);
    if (!ACTIVE_BLOCKING_MEMBER_STATUSES.has(status) && status !== 'pending') {
      continue;
    }

    const org = orgById.get(String(m.organizationId));
    if (!org || normalize(org.status) === 'archived' || org.archived === true) {
      continue;
    }

    const check = checkStudentDepartmentEligibility(org, projectedStudent, departments, courses);
    const impact: CourseShiftMembershipImpact = {
      membershipId: String(m.id || ''),
      organizationId: String(org.id),
      organizationName: String(org.name || 'Organization'),
      organizationAcronym: String(org.acronym || org.name || 'ORG'),
      membershipStatus: status,
      isCrossDepartmental: check.isCrossDepartmental,
      eligible: check.eligible,
      alreadyFlagged: Boolean(m.courseShiftIneligibility?.flagged),
      orgDeptLabel: check.orgDeptLabel,
      newStudentDeptLabel: check.studentDeptLabel,
      reason: check.reason,
    };

    if (check.eligible) {
      retainedMemberships.push(impact);
    } else if (status === 'pending') {
      ineligiblePendingApplications.push(impact);
    } else {
      blockingActiveMemberships.push(impact);
    }
  }

  const retainedOfficerRoles: CourseShiftOfficerImpact[] = [];
  const ineligibleOfficerRoles: CourseShiftOfficerImpact[] = [];

  for (const off of officerRoles) {
    if (!off || off.isActive === false || !off.organizationId) continue;
    const org = orgById.get(String(off.organizationId));
    if (!org || normalize(org.status) === 'archived' || org.archived === true) {
      continue;
    }

    const check = checkStudentDepartmentEligibility(org, projectedStudent, departments, courses);
    const officerImpact: CourseShiftOfficerImpact = {
      officerDocId: String(off.id || ''),
      organizationId: String(org.id),
      organizationName: String(org.name || off.organizationName || 'Organization'),
      organizationAcronym: String(org.acronym || org.name || 'ORG'),
      roleId: off.roleId,
      roleName: String(off.roleName || off.roleTitle || off.roleId || 'Officer'),
      eligible: check.eligible,
      reason: check.reason,
    };

    if (check.eligible) {
      retainedOfficerRoles.push(officerImpact);
    } else {
      ineligibleOfficerRoles.push(officerImpact);
    }
  }

  const fromDeptLabel =
    String(student?.departmentName || student?.department || '').trim() ||
    departments.find((d) => normalize(d?.id) === normalize(student?.departmentId))?.name ||
    'Current Department';
  const toDeptLabel = resolvedTargetDeptName || 'Target Department';

  const canShiftImmediately = blockingActiveMemberships.length === 0;

  let summaryMessage = 'Student is eligible to shift to this program.';
  if (!isProgramChanging) {
    summaryMessage = 'Selected course/department matches the student’s current academic program.';
  } else if (!canShiftImmediately) {
    const clubList = blockingActiveMemberships.map((m) => m.organizationAcronym || m.organizationName).join(', ');
    summaryMessage = `Course shift is blocked: Student still has ${blockingActiveMemberships.length} active membership(s) in ineligible departmental organization(s) (${clubList}). Flag & notify club officers to remove the student first.`;
  } else if (ineligibleOfficerRoles.length > 0) {
    summaryMessage = `Ready to shift. ${ineligibleOfficerRoles.length} ineligible officer role(s) will be automatically revoked and the Club Adviser will be notified.`;
  }

  return {
    isProgramChanging,
    fromCourseCode,
    toCourseCode,
    fromDepartmentLabel: fromDeptLabel,
    toDepartmentLabel: toDeptLabel,
    canShiftImmediately,
    retainedMemberships,
    blockingActiveMemberships,
    ineligiblePendingApplications,
    retainedOfficerRoles,
    ineligibleOfficerRoles,
    summaryMessage,
  };
}
