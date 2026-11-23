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
 * Extracts explicit non-sentinel department IDs configured on an organization
 * (supports multi-department `allowedDepartmentIds[]` as well as legacy single `departmentId`).
 */
export function getOrganizationAllowedDepartmentIds(org: any): string[] {
  if (!org) return [];
  if (Array.isArray(org.allowedDepartmentIds) && org.allowedDepartmentIds.length > 0) {
    const clean = org.allowedDepartmentIds
      .map((v: unknown) => String(v ?? '').trim())
      .filter((v: string) => Boolean(v) && !CROSS_DEPT_SENTINELS.has(normalizeToken(v)));
    return Array.from(new Set(clean));
  }
  const singleId = String(org.departmentId ?? '').trim();
  if (singleId && !CROSS_DEPT_SENTINELS.has(normalizeToken(singleId))) {
    return [singleId];
  }
  return [];
}

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

  if (Array.isArray(org.allowedDepartmentIds)) {
    const validIds = org.allowedDepartmentIds
      .map(normalizeToken)
      .filter((v: string) => Boolean(v) && !CROSS_DEPT_SENTINELS.has(v));
    if (validIds.length > 0) return false;
  }

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

/**
 * Resolves all allowed canonical department identities for a departmental organization
 * (supports multi-department `allowedDepartmentIds[]` + legacy single department fields).
 */
export function resolveAllowedOrgDepartments(
  org: any,
  departments: any[] = [],
  courses: any[] = []
): ResolvedDepartmentIdentity[] {
  if (!org || isOrganizationCrossDepartmental(org)) return [];

  if (Array.isArray(org.allowedDepartmentIds) && org.allowedDepartmentIds.length > 0) {
    const names = Array.isArray(org.allowedDepartmentNames) ? org.allowedDepartmentNames : [];
    const codes = Array.isArray(org.allowedDepartmentCodes) ? org.allowedDepartmentCodes : [];
    const seen = new Set<string>();
    const results: ResolvedDepartmentIdentity[] = [];

    org.allowedDepartmentIds.forEach((rawId: unknown, idx: number) => {
      const idStr = String(rawId ?? '').trim();
      const normId = normalizeToken(idStr);
      if (!normId || CROSS_DEPT_SENTINELS.has(normId) || seen.has(normId)) return;
      seen.add(normId);
      results.push(
        resolveCanonicalDepartment(
          {
            departmentId: idStr,
            departmentName: names[idx] || '',
            departmentCode: codes[idx] || '',
          },
          departments,
          courses
        )
      );
    });

    if (results.length > 0) return results;
  }

  return [resolveCanonicalDepartment(org, departments, courses)];
}

export function resolveOrgDepartmentDisplay(org: any, departments: any[] = []): string {
  if (!org || isOrganizationCrossDepartmental(org)) {
    return 'Cross-Departmental';
  }
  const allowed = resolveAllowedOrgDepartments(org, departments);
  if (allowed.length === 0) return 'Cross-Departmental';
  if (allowed.length === 1) {
    const resolved = allowed[0];
    return resolved.canonicalCode && resolved.canonicalName
      ? `${resolved.canonicalName} (${resolved.canonicalCode})`
      : resolved.label;
  }
  return allowed
    .map((r) => (r.canonicalCode && r.canonicalName ? `${r.canonicalName} (${r.canonicalCode})` : r.label))
    .join(', ');
}

export function resolveOrgDepartmentShortDisplay(org: any, departments: any[] = []): string {
  if (!org || isOrganizationCrossDepartmental(org)) {
    return 'Cross-Departmental';
  }
  const allowed = resolveAllowedOrgDepartments(org, departments);
  if (allowed.length === 0) return 'Cross-Departmental';
  return allowed
    .map((r) => r.canonicalCode || r.canonicalName || r.label)
    .join(', ');
}

export interface DepartmentEligibilityResult {
  eligible: boolean;
  isCrossDepartmental: boolean;
  orgDeptLabel: string;
  studentDeptLabel: string;
  reason?: string;
}

function matchesSingleDepartment(
  orgDept: ResolvedDepartmentIdentity,
  studentDept: ResolvedDepartmentIdentity,
  studentOrPayload: any
): boolean {
  // Case 1: Both resolved to canonical /departments records — require exact department ID match
  if (orgDept.canonicalDeptId && studentDept.canonicalDeptId) {
    return normalizeToken(orgDept.canonicalDeptId) === normalizeToken(studentDept.canonicalDeptId);
  }

  // Case 2: At least one side uses an uncataloged/legacy department string — require exact normalized token match
  for (const orgTok of orgDept.tokens) {
    if (studentDept.tokens.has(orgTok)) {
      return true;
    }
  }

  // Legacy support: If an organization itself was named after a program code (e.g. "BSIT" before departments FK existed)
  // and didn't map to any /departments entry, allow exact courseCode match ONLY in that case.
  if (!orgDept.canonicalDeptId) {
    const stuCourseTok = normalizeToken(studentOrPayload?.courseCode || studentOrPayload?.course);
    if (stuCourseTok && orgDept.tokens.has(stuCourseTok)) {
      return true;
    }
  }

  return false;
}

/**
 * Strictly validates whether a student belongs to one of the organization's allowed departments.
 * - Cross-departmental organizations allow any active student.
 * - Departmental organizations allow a student ONLY if their canonical department strictly matches
 *   at least one selected department on the organization.
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

  const allowedOrgDepts = resolveAllowedOrgDepartments(org, departments, courses);
  const orgDeptLabel = allowedOrgDepts.map((d) => d.label).join(', ');
  const studentDept = resolveCanonicalDepartment(studentOrPayload, departments, courses);

  if (studentDept.tokens.size === 0 && !studentDept.canonicalDeptId) {
    return {
      eligible: false,
      isCrossDepartmental: false,
      orgDeptLabel,
      studentDeptLabel: 'No Department Assigned',
      reason: `Cannot add member: Student has no assigned academic department on record. This organization only accepts ${orgDeptLabel} students.`,
    };
  }

  const isMatched = allowedOrgDepts.some((orgDept) =>
    matchesSingleDepartment(orgDept, studentDept, studentOrPayload)
  );

  if (isMatched) {
    return {
      eligible: true,
      isCrossDepartmental: false,
      orgDeptLabel,
      studentDeptLabel: studentDept.label,
    };
  }

  return {
    eligible: false,
    isCrossDepartmental: false,
    orgDeptLabel,
    studentDeptLabel: studentDept.label,
    reason:
      allowedOrgDepts.length > 1
        ? `Cannot add member: Student belongs to "${studentDept.label}", but this organization is restricted to: "${orgDeptLabel}" students.`
        : `Cannot add member: Student belongs to "${studentDept.label}", but this organization is restricted exclusively to "${orgDeptLabel}" students.`,
  };
}

export interface DepartmentScopeConflict {
  departmentId: string | null;
  departmentLabel: string;
  count: number;
  memberNames: string[];
}

export interface DepartmentScopeConflictResult {
  hasConflicts: boolean;
  totalConflictingMembers: number;
  conflictsByDepartment: DepartmentScopeConflict[];
  activeMemberCountsByDeptId: Record<string, number>;
  summaryMessage?: string;
}

const ACTIVE_MEMBER_SCOPE_STATUSES = new Set(['active', 'pending_removal']);

/**
 * Checks whether narrowing an organization's Department / Audience Scope
 * conflicts with currently active members from excluded departments.
 */
export function findDepartmentScopeConflicts(params: {
  proposedOrg: any;
  members?: any[];
  departments?: any[];
  courses?: any[];
  studentsById?: Map<string, any>;
}): DepartmentScopeConflictResult {
  const {
    proposedOrg,
    members = [],
    departments = [],
    courses = [],
    studentsById,
  } = params;

  const activeMembers = (members || []).filter((m) =>
    ACTIVE_MEMBER_SCOPE_STATUSES.has(String(m?.status || '').trim().toLowerCase())
  );

  const activeMemberCountsByDeptId: Record<string, number> = {};
  const enrichedCandidates = activeMembers.map((m) => {
    const studentLookup =
      studentsById?.get(String(m?.studentId || '').trim()) ||
      studentsById?.get(String(m?.authUid || '').trim()) ||
      null;

    const candidate = {
      studentId: m?.studentId || studentLookup?.studentId || '',
      authUid: m?.authUid || studentLookup?.authUid || '',
      departmentId: m?.departmentId || studentLookup?.departmentId || '',
      departmentName: m?.department || studentLookup?.departmentName || studentLookup?.department || '',
      department: m?.department || studentLookup?.departmentName || studentLookup?.department || '',
      courseCode: m?.course || studentLookup?.courseCode || '',
      courseName: studentLookup?.courseName || '',
      courseId: studentLookup?.courseId || '',
    };

    const resolvedDept = resolveCanonicalDepartment(candidate, departments, courses);
    if (resolvedDept.canonicalDeptId) {
      activeMemberCountsByDeptId[resolvedDept.canonicalDeptId] =
        (activeMemberCountsByDeptId[resolvedDept.canonicalDeptId] || 0) + 1;
    }

    return {
      member: m,
      candidate,
      resolvedDept,
      displayName: String(m?.studentName || studentLookup?.firstName || m?.studentId || 'Student').trim(),
    };
  });

  if (!proposedOrg || isOrganizationCrossDepartmental(proposedOrg)) {
    return {
      hasConflicts: false,
      totalConflictingMembers: 0,
      conflictsByDepartment: [],
      activeMemberCountsByDeptId,
    };
  }

  const conflictGroups = new Map<string, DepartmentScopeConflict>();
  let totalConflictingMembers = 0;

  for (const item of enrichedCandidates) {
    const check = checkStudentDepartmentEligibility(
      proposedOrg,
      item.candidate,
      departments,
      courses
    );
    if (check.eligible) continue;

    totalConflictingMembers++;
    const groupKey =
      item.resolvedDept.canonicalDeptId ||
      normalizeToken(item.resolvedDept.label) ||
      'unassigned';
    const existing = conflictGroups.get(groupKey);
    if (existing) {
      existing.count += 1;
      if (item.displayName && existing.memberNames.length < 5) {
        existing.memberNames.push(item.displayName);
      }
    } else {
      conflictGroups.set(groupKey, {
        departmentId: item.resolvedDept.canonicalDeptId,
        departmentLabel: item.resolvedDept.label || check.studentDeptLabel || 'Unassigned Department',
        count: 1,
        memberNames: item.displayName ? [item.displayName] : [],
      });
    }
  }

  const conflictsByDepartment = Array.from(conflictGroups.values()).sort(
    (a, b) => b.count - a.count || a.departmentLabel.localeCompare(b.departmentLabel)
  );

  if (conflictsByDepartment.length === 0) {
    return {
      hasConflicts: false,
      totalConflictingMembers: 0,
      conflictsByDepartment: [],
      activeMemberCountsByDeptId,
    };
  }

  const breakdown = conflictsByDepartment
    .map((c) => `${c.departmentLabel} (${c.count} active member${c.count === 1 ? '' : 's'})`)
    .join(', ');

  return {
    hasConflicts: true,
    totalConflictingMembers,
    conflictsByDepartment,
    activeMemberCountsByDeptId,
    summaryMessage: `Cannot restrict department scope: There are still active student members from ${breakdown}. Keep Cross-Departmental, include their department(s), or remove those members first.`,
  };
}
