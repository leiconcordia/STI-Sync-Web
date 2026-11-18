const CROSS_DEPT_SENTINELS = new Set([
  'cross-departmental',
  'cross-department',
  'cross_departmental',
  'all',
  'general',
  'college-wide',
  'campus-wide',
  'cross-departmental / all students',
  'open to all students',
]);

const normalizeToken = (val: unknown): string =>
  String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Determines whether an organization is explicitly configured as Cross-Departmental.
 * Only treats an organization as open to all departments when cross-departmental flags/sentinels
 * are active OR no department restriction fields are set at all.
 */
export function isOrganizationCrossDepartmental(org: any): boolean {
  if (!org) return false;
  if (org.isCrossDepartmental === true) return true;
  const scope = normalizeToken(org.scope);
  if (CROSS_DEPT_SENTINELS.has(scope)) return true;

  const rawValues = [
    org.departmentId,
    org.departmentName,
    org.departmentCode,
    org.department,
  ]
    .map(normalizeToken)
    .filter(Boolean);

  if (rawValues.length === 0) return true;
  return rawValues.some((v) => CROSS_DEPT_SENTINELS.has(v));
}

export interface ResolvedDepartmentIdentity {
  canonicalDeptId: string | null;
  canonicalCode: string | null;
  canonicalName: string | null;
  label: string;
  tokens: Set<string>;
}

/**
 * Resolves the canonical department document & exact comparison tokens for an organization
 * or student record using the `/departments` and `/courses` catalogs.
 */
export function resolveCanonicalDepartment(
  entity: any,
  departments: any[] = [],
  courses: any[] = []
): ResolvedDepartmentIdentity {
  const tokens = new Set<string>();
  const addToken = (val: unknown) => {
    const clean = normalizeToken(val);
    if (clean && !CROSS_DEPT_SENTINELS.has(clean)) {
      tokens.add(clean);
    }
  };

  addToken(entity?.departmentId);
  addToken(entity?.departmentCode);
  addToken(entity?.departmentName);
  addToken(entity?.department);

  // If this looks like a student/member with a course, also consult their course's departmentId
  let courseDeptId: string | null = null;
  const courseId = normalizeToken(entity?.courseId);
  const courseCode = normalizeToken(entity?.courseCode || entity?.course);
  const courseName = normalizeToken(entity?.courseName);

  if ((courseId || courseCode || courseName) && Array.isArray(courses) && courses.length > 0) {
    const matchedCourse = courses.find(
      (c) =>
        (courseId && normalizeToken(c?.id) === courseId) ||
        (courseCode && normalizeToken(c?.code) === courseCode) ||
        (courseName && normalizeToken(c?.name) === courseName)
    );
    if (matchedCourse?.departmentId) {
      courseDeptId = String(matchedCourse.departmentId).trim();
      addToken(courseDeptId);
    }
  }

  // Match against canonical Department catalog
  let matchedDept: any = null;
  if (Array.isArray(departments) && departments.length > 0) {
    const candidateIds = [entity?.departmentId, courseDeptId]
      .map(normalizeToken)
      .filter((v) => Boolean(v) && !CROSS_DEPT_SENTINELS.has(v));

    for (const cid of candidateIds) {
      matchedDept = departments.find((d) => normalizeToken(d?.id) === cid);
      if (matchedDept) break;
    }

    if (!matchedDept) {
      for (const tok of Array.from(tokens)) {
        matchedDept = departments.find(
          (d) =>
            normalizeToken(d?.id) === tok ||
            normalizeToken(d?.code) === tok ||
            normalizeToken(d?.name) === tok
        );
        if (matchedDept) break;
      }
    }
  }

  if (matchedDept) {
    addToken(matchedDept.id);
    addToken(matchedDept.code);
    addToken(matchedDept.name);
  }

  const label =
    matchedDept?.name ||
    matchedDept?.code ||
    entity?.departmentName ||
    entity?.department ||
    entity?.departmentCode ||
    entity?.departmentId ||
    'Unassigned Department';

  return {
    canonicalDeptId: matchedDept?.id ? String(matchedDept.id) : null,
    canonicalCode: matchedDept?.code ? String(matchedDept.code) : null,
    canonicalName: matchedDept?.name ? String(matchedDept.name) : null,
    label: String(label || 'Unassigned Department').trim(),
    tokens,
  };
}

export function resolveOrgDepartmentDisplay(org: any, departments: any[] = []): string {
  if (!org || isOrganizationCrossDepartmental(org)) {
    return 'Cross-Departmental';
  }
  const resolved = resolveCanonicalDepartment(org, departments);
  return resolved.canonicalCode && resolved.canonicalName
    ? `${resolved.canonicalName} (${resolved.canonicalCode})`
    : resolved.label;
}

export interface DepartmentEligibilityResult {
  eligible: boolean;
  isCrossDepartmental: boolean;
  orgDeptLabel: string;
  studentDeptLabel: string;
  reason?: string;
}

/**
 * Strictly validates whether a student belongs to the organization's department.
 * - Cross-departmental organizations allow any active student.
 * - Departmental organizations allow a student ONLY if their canonical department strictly matches.
 *   Never uses loose `.includes()` substring checks and never passes when a student's department is missing.
 */
export function checkStudentDepartmentEligibility(
  org: any,
  studentOrPayload: any,
  departments: any[] = [],
  courses: any[] = []
): DepartmentEligibilityResult {
  if (!org) {
    return {
      eligible: false,
      isCrossDepartmental: false,
      orgDeptLabel: 'Unknown Organization',
      studentDeptLabel: 'Unassigned Department',
      reason: 'Organization information could not be verified.',
    };
  }

  if (isOrganizationCrossDepartmental(org)) {
    return {
      eligible: true,
      isCrossDepartmental: true,
      orgDeptLabel: 'Cross-Departmental',
      studentDeptLabel: resolveCanonicalDepartment(studentOrPayload, departments, courses).label,
    };
  }

  const orgDept = resolveCanonicalDepartment(org, departments, courses);
  const studentDept = resolveCanonicalDepartment(studentOrPayload, departments, courses);

  if (studentDept.tokens.size === 0 && !studentDept.canonicalDeptId) {
    return {
      eligible: false,
      isCrossDepartmental: false,
      orgDeptLabel: orgDept.label,
      studentDeptLabel: 'No Department Assigned',
      reason: `Cannot add member: Student has no assigned academic department on record. This organization only accepts ${orgDept.label} students.`,
    };
  }

  // Case 1: Both resolved to canonical /departments records — require exact department ID match
  if (orgDept.canonicalDeptId && studentDept.canonicalDeptId) {
    const sameDept =
      normalizeToken(orgDept.canonicalDeptId) === normalizeToken(studentDept.canonicalDeptId);
    return sameDept
      ? {
          eligible: true,
          isCrossDepartmental: false,
          orgDeptLabel: orgDept.label,
          studentDeptLabel: studentDept.label,
        }
      : {
          eligible: false,
          isCrossDepartmental: false,
          orgDeptLabel: orgDept.label,
          studentDeptLabel: studentDept.label,
          reason: `Cannot add member: Student belongs to "${studentDept.label}", but this organization is restricted exclusively to "${orgDept.label}" students.`,
        };
  }

  // Case 2: At least one side uses an uncataloged/legacy department string — require exact normalized token match
  for (const orgTok of orgDept.tokens) {
    if (studentDept.tokens.has(orgTok)) {
      return {
        eligible: true,
        isCrossDepartmental: false,
        orgDeptLabel: orgDept.label,
        studentDeptLabel: studentDept.label,
      };
    }
  }

  // Legacy support: If an organization itself was named after a program code (e.g. "BSIT" before departments FK existed)
  // and didn't map to any /departments entry, allow exact courseCode match ONLY in that case.
  if (!orgDept.canonicalDeptId) {
    const stuCourseTok = normalizeToken(studentOrPayload?.courseCode || studentOrPayload?.course);
    if (stuCourseTok && orgDept.tokens.has(stuCourseTok)) {
      return {
        eligible: true,
        isCrossDepartmental: false,
        orgDeptLabel: orgDept.label,
        studentDeptLabel: studentDept.label,
      };
    }
  }

  return {
    eligible: false,
    isCrossDepartmental: false,
    orgDeptLabel: orgDept.label,
    studentDeptLabel: studentDept.label,
    reason: `Cannot add member: Student belongs to "${studentDept.label}", which is not in "${orgDept.label}". Only same-department students may join unless the organization is cross-departmental.`,
  };
}
