/**
 * Pure utility for enforcing per-organization-type maximum membership limits
 * (e.g., a student can join at most 2 "Academic" organizations at a time).
 */

export interface OrgTypeQuotaResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number | null;
  orgTypeName: string;
  joinedOrgNames: string[];
  reason?: string;
}

const ACTIVE_QUOTA_STATUSES = new Set(['active', 'pending_removal']);

const normalizeId = (val: unknown): string => String(val ?? '').trim();

/**
 * Normalizes a configured maxMembershipsPerStudent value.
 * Returns a positive integer (>= 1) if capped, or null if unlimited.
 */
export function normalizeMaxMembershipsPerStudent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

/**
 * Checks whether a student can join `targetOrg` without exceeding
 * `orgType.maxMembershipsPerStudent` for that organization type.
 */
export function checkStudentOrgTypeQuota(params: {
  targetOrg: { id?: string; name?: string; typeId?: string } | null | undefined;
  orgType?: { id?: string; name?: string; maxMembershipsPerStudent?: number | null } | null;
  allOrganizations?: Array<{ id?: string; name?: string; acronym?: string; typeId?: string; status?: string }>;
  studentMemberships?: Array<{ organizationId?: string; status?: string }>;
}): OrgTypeQuotaResult {
  const { targetOrg, orgType, allOrganizations = [], studentMemberships = [] } = params;
  const orgTypeName = String(orgType?.name || 'Organization Type').trim() || 'Organization Type';
  const maxAllowed = normalizeMaxMembershipsPerStudent(orgType?.maxMembershipsPerStudent);

  if (!targetOrg || !targetOrg.typeId || maxAllowed === null) {
    return {
      allowed: true,
      currentCount: 0,
      maxAllowed,
      orgTypeName,
      joinedOrgNames: [],
    };
  }

  const targetOrgId = normalizeId(targetOrg.id);
  const targetTypeId = normalizeId(targetOrg.typeId);

  const orgById = new Map<string, { id?: string; name?: string; acronym?: string; typeId?: string; status?: string }>();
  for (const org of allOrganizations) {
    const id = normalizeId(org?.id);
    if (id) orgById.set(id, org);
  }

  const joinedSameTypeOrgIds = new Set<string>();
  const joinedOrgNames: string[] = [];

  for (const membership of studentMemberships) {
    const status = String(membership?.status || '').trim().toLowerCase();
    if (!ACTIVE_QUOTA_STATUSES.has(status)) continue;

    const mOrgId = normalizeId(membership?.organizationId);
    if (!mOrgId || mOrgId === targetOrgId) continue;
    if (joinedSameTypeOrgIds.has(mOrgId)) continue;

    const matchedOrg = orgById.get(mOrgId);
    if (!matchedOrg) continue;
    if (normalizeId(matchedOrg.typeId) !== targetTypeId) continue;

    joinedSameTypeOrgIds.add(mOrgId);
    joinedOrgNames.push(
      String(matchedOrg.acronym || matchedOrg.name || mOrgId).trim()
    );
  }

  const currentCount = joinedSameTypeOrgIds.size;
  if (currentCount >= maxAllowed) {
    const orgListText = joinedOrgNames.length > 0 ? ` (${joinedOrgNames.join(', ')})` : '';
    return {
      allowed: false,
      currentCount,
      maxAllowed,
      orgTypeName,
      joinedOrgNames,
      reason: `Cannot join organization: Student has already reached the maximum of ${maxAllowed} "${orgTypeName}" organization${maxAllowed === 1 ? '' : 's'} allowed per student${orgListText}.`,
    };
  }

  return {
    allowed: true,
    currentCount,
    maxAllowed,
    orgTypeName,
    joinedOrgNames,
  };
}

export interface GlobalOrgQuotaResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number | null;
  joinedOrgNames: string[];
  reason?: string;
}

/**
 * Checks whether a student can join `targetOrg` without exceeding the configured
 * Global Maximum Organizations per Student (`system_settings/organization_rules.maxTotalOrganizationsPerStudent`).
 * Counts active/pending_removal memberships across non-archived organizations (excluding `targetOrg`).
 */
export function checkStudentGlobalOrgQuota(params: {
  targetOrg: { id?: string; name?: string } | null | undefined;
  maxTotalOrganizationsPerStudent?: number | null;
  allOrganizations?: Array<{ id?: string; name?: string; acronym?: string; status?: string; archived?: boolean }>;
  studentMemberships?: Array<{ organizationId?: string; status?: string }>;
}): GlobalOrgQuotaResult {
  const {
    targetOrg,
    maxTotalOrganizationsPerStudent,
    allOrganizations = [],
    studentMemberships = [],
  } = params;
  const maxAllowed = normalizeMaxMembershipsPerStudent(maxTotalOrganizationsPerStudent);

  if (maxAllowed === null) {
    return {
      allowed: true,
      currentCount: 0,
      maxAllowed: null,
      joinedOrgNames: [],
    };
  }

  const targetOrgId = normalizeId(targetOrg?.id);
  const orgById = new Map<string, { id?: string; name?: string; acronym?: string; status?: string; archived?: boolean }>();
  for (const org of allOrganizations) {
    const id = normalizeId(org?.id);
    if (id) orgById.set(id, org);
  }

  const joinedOrgIds = new Set<string>();
  const joinedOrgNames: string[] = [];

  for (const membership of studentMemberships) {
    const status = String(membership?.status || '').trim().toLowerCase();
    if (!ACTIVE_QUOTA_STATUSES.has(status)) continue;

    const mOrgId = normalizeId(membership?.organizationId);
    if (!mOrgId || (targetOrgId && mOrgId === targetOrgId)) continue;
    if (joinedOrgIds.has(mOrgId)) continue;

    const matchedOrg = orgById.get(mOrgId);
    if (matchedOrg) {
      const orgStatus = String(matchedOrg.status || '').trim().toLowerCase();
      if (matchedOrg.archived === true || orgStatus === 'archived' || orgStatus === 'deleted') {
        continue;
      }
    }

    joinedOrgIds.add(mOrgId);
    joinedOrgNames.push(
      String(matchedOrg?.acronym || matchedOrg?.name || mOrgId).trim()
    );
  }

  const currentCount = joinedOrgIds.size;
  if (currentCount >= maxAllowed) {
    const orgListText = joinedOrgNames.length > 0 ? ` (${joinedOrgNames.join(', ')})` : '';
    return {
      allowed: false,
      currentCount,
      maxAllowed,
      joinedOrgNames,
      reason: `Cannot join organization: Student has already reached the global maximum of ${maxAllowed} active organization${maxAllowed === 1 ? '' : 's'} allowed per student${orgListText}.`,
    };
  }

  return {
    allowed: true,
    currentCount,
    maxAllowed,
    joinedOrgNames,
  };
}

export interface CombinedMembershipLimitsResult {
  allowed: boolean;
  failedRule?: 'global' | 'org_type';
  globalQuota: GlobalOrgQuotaResult;
  typeQuota: OrgTypeQuotaResult;
  reason?: string;
}

/**
 * Evaluates BOTH the Global Maximum Organizations per Student limit AND the
 * Per-Organization-Type membership limit in one unified check.
 */
export function checkStudentMembershipLimits(params: {
  targetOrg: { id?: string; name?: string; typeId?: string } | null | undefined;
  orgType?: { id?: string; name?: string; maxMembershipsPerStudent?: number | null } | null;
  maxTotalOrganizationsPerStudent?: number | null;
  allOrganizations?: Array<{ id?: string; name?: string; acronym?: string; typeId?: string; status?: string; archived?: boolean }>;
  studentMemberships?: Array<{ organizationId?: string; status?: string }>;
}): CombinedMembershipLimitsResult {
  const globalQuota = checkStudentGlobalOrgQuota({
    targetOrg: params.targetOrg,
    maxTotalOrganizationsPerStudent: params.maxTotalOrganizationsPerStudent,
    allOrganizations: params.allOrganizations,
    studentMemberships: params.studentMemberships,
  });

  const typeQuota = checkStudentOrgTypeQuota({
    targetOrg: params.targetOrg,
    orgType: params.orgType,
    allOrganizations: params.allOrganizations,
    studentMemberships: params.studentMemberships,
  });

  if (!globalQuota.allowed) {
    return {
      allowed: false,
      failedRule: 'global',
      globalQuota,
      typeQuota,
      reason: globalQuota.reason,
    };
  }

  if (!typeQuota.allowed) {
    return {
      allowed: false,
      failedRule: 'org_type',
      globalQuota,
      typeQuota,
      reason: typeQuota.reason,
    };
  }

  return {
    allowed: true,
    globalQuota,
    typeQuota,
  };
}

export interface OrgTypeVsGlobalValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates that a Per-Organization-Type limit does not exceed the Global Maximum
 * Organizations per Student (invariant: Per-Type Limit <= Global Limit when Global is finite).
 * A null/unlimited Per-Type limit is always allowed (meaning "no separate sub-cap; follow Global Limit").
 */
export function validateOrgTypeLimitAgainstGlobal(params: {
  proposedTypeLimit?: number | null;
  globalLimit?: number | null;
  orgTypeName?: string;
}): OrgTypeVsGlobalValidationResult {
  const typeMax = normalizeMaxMembershipsPerStudent(params.proposedTypeLimit);
  const globalMax = normalizeMaxMembershipsPerStudent(params.globalLimit);
  const typeName = String(params.orgTypeName || 'This organization type').trim() || 'This organization type';

  if (globalMax !== null && typeMax !== null && typeMax > globalMax) {
    return {
      valid: false,
      reason: `"${typeName}" limit (${typeMax}) cannot exceed the Global Maximum Organizations per Student (${globalMax}). Set it to ${globalMax} or less, leave it blank to follow the Global Limit, or raise the Global Limit first.`,
    };
  }

  return { valid: true };
}

export interface ConflictingOrgTypeLimit {
  id: string;
  name: string;
  currentLimit: number;
  newCappedLimit: number;
}

/**
 * Finds active (non-archived) organization types whose configured per-type limit
 * exceeds a newly proposed finite Global Limit, so they can be auto-capped on confirmation.
 */
export function findConflictingOrgTypesForGlobalLimit(params: {
  proposedGlobalLimit?: number | null;
  orgTypes?: Array<{
    id: string;
    name: string;
    maxMembershipsPerStudent?: number | null;
    archived?: boolean;
  }>;
}): ConflictingOrgTypeLimit[] {
  const globalMax = normalizeMaxMembershipsPerStudent(params.proposedGlobalLimit);
  if (globalMax === null) return [];

  const conflicts: ConflictingOrgTypeLimit[] = [];
  for (const t of params.orgTypes || []) {
    if (!t || t.archived) continue;
    const typeMax = normalizeMaxMembershipsPerStudent(t.maxMembershipsPerStudent);
    if (typeMax !== null && typeMax > globalMax) {
      conflicts.push({
        id: t.id,
        name: t.name,
        currentLimit: typeMax,
        newCappedLimit: globalMax,
      });
    }
  }
  return conflicts;
}

export interface AffectedOverLimitStudent {
  studentKey: string;
  studentId: string;
  studentName: string;
  currentCount: number;
  orgNames: string[];
}

export interface MembershipLimitImpactSummary {
  proposedLimit: number | null;
  totalAffected: number;
  affectedStudents: AffectedOverLimitStudent[];
}

export interface LightweightMembershipRecord {
  studentId?: string;
  authUid?: string;
  studentName?: string;
  organizationId?: string;
  status?: string;
}

/**
 * Scans active memberships across non-archived organizations to identify existing students
 * who currently exceed a proposed Global Maximum Organizations per Student.
 * Existing students are grandfathered (not auto-removed) and blocked from joining new orgs.
 */
export function analyzeGlobalLimitImpact(params: {
  proposedGlobalLimit?: number | null;
  allOrganizations?: Array<{
    id?: string;
    name?: string;
    acronym?: string;
    typeId?: string;
    status?: string;
    archived?: boolean;
  }>;
  allMemberships?: LightweightMembershipRecord[];
}): MembershipLimitImpactSummary {
  const globalMax = normalizeMaxMembershipsPerStudent(params.proposedGlobalLimit);
  if (globalMax === null) {
    return { proposedLimit: null, totalAffected: 0, affectedStudents: [] };
  }

  const orgById = new Map<
    string,
    { id?: string; name?: string; acronym?: string; typeId?: string; status?: string; archived?: boolean }
  >();
  for (const org of params.allOrganizations || []) {
    const id = normalizeId(org?.id);
    if (id) orgById.set(id, org);
  }

  const byStudent = new Map<
    string,
    { studentId: string; studentName: string; orgIds: Set<string>; orgNames: string[] }
  >();

  for (const m of params.allMemberships || []) {
    const status = String(m?.status || '').trim().toLowerCase();
    if (!ACTIVE_QUOTA_STATUSES.has(status)) continue;

    const orgId = normalizeId(m?.organizationId);
    if (!orgId) continue;

    const matchedOrg = orgById.get(orgId);
    if (matchedOrg) {
      const orgStatus = String(matchedOrg.status || '').trim().toLowerCase();
      if (matchedOrg.archived === true || orgStatus === 'archived' || orgStatus === 'deleted') {
        continue;
      }
    }

    const rawStudentId = normalizeId(m?.studentId);
    const rawAuthUid = normalizeId(m?.authUid);
    const studentKey = (rawStudentId || rawAuthUid).toLowerCase();
    if (!studentKey) continue;

    let entry = byStudent.get(studentKey);
    if (!entry) {
      entry = {
        studentId: rawStudentId || rawAuthUid,
        studentName: String(m?.studentName || rawStudentId || 'Student').trim() || 'Student',
        orgIds: new Set<string>(),
        orgNames: [],
      };
      byStudent.set(studentKey, entry);
    } else if (
      (!entry.studentName || entry.studentName === entry.studentId || entry.studentName === 'Student') &&
      m?.studentName
    ) {
      entry.studentName = String(m.studentName).trim();
    }

    if (!entry.orgIds.has(orgId)) {
      entry.orgIds.add(orgId);
      entry.orgNames.push(String(matchedOrg?.acronym || matchedOrg?.name || orgId).trim());
    }
  }

  const affectedStudents: AffectedOverLimitStudent[] = [];
  for (const [studentKey, entry] of byStudent.entries()) {
    if (entry.orgIds.size > globalMax) {
      affectedStudents.push({
        studentKey,
        studentId: entry.studentId,
        studentName: entry.studentName,
        currentCount: entry.orgIds.size,
        orgNames: entry.orgNames,
      });
    }
  }

  affectedStudents.sort(
    (a, b) => b.currentCount - a.currentCount || a.studentName.localeCompare(b.studentName)
  );

  return {
    proposedLimit: globalMax,
    totalAffected: affectedStudents.length,
    affectedStudents,
  };
}

/**
 * Scans active memberships in non-archived organizations belonging to `orgTypeId`
 * to identify existing students who currently exceed a proposed Per-Organization-Type limit.
 */
export function analyzeOrgTypeLimitImpact(params: {
  orgTypeId: string;
  proposedTypeLimit?: number | null;
  allOrganizations?: Array<{
    id?: string;
    name?: string;
    acronym?: string;
    typeId?: string;
    status?: string;
    archived?: boolean;
  }>;
  allMemberships?: LightweightMembershipRecord[];
}): MembershipLimitImpactSummary {
  const typeMax = normalizeMaxMembershipsPerStudent(params.proposedTypeLimit);
  const targetTypeId = normalizeId(params.orgTypeId);
  if (typeMax === null || !targetTypeId) {
    return { proposedLimit: typeMax, totalAffected: 0, affectedStudents: [] };
  }

  const matchingOrgs = (params.allOrganizations || []).filter((org) => {
    if (!org) return false;
    const orgStatus = String(org.status || '').trim().toLowerCase();
    if (org.archived === true || orgStatus === 'archived' || orgStatus === 'deleted') return false;
    return normalizeId(org.typeId) === targetTypeId;
  });

  const matchingOrgIds = new Set(matchingOrgs.map((o) => normalizeId(o.id)).filter(Boolean));
  const filteredMemberships = (params.allMemberships || []).filter((m) =>
    matchingOrgIds.has(normalizeId(m?.organizationId))
  );

  return analyzeGlobalLimitImpact({
    proposedGlobalLimit: typeMax,
    allOrganizations: matchingOrgs,
    allMemberships: filteredMemberships,
  });
}

export interface OrgTypeArchivalValidationResult {
  allowed: boolean;
  activeClubCount: number;
  activeClubNames: string[];
  reason?: string;
}

/**
 * Prevents archiving (or deleting) an Organization Classification / Type while one or more
 * active (non-archived, non-deleted) organizations are still assigned to it.
 */
export function validateOrgTypeArchival(params: {
  orgTypeId: string;
  orgTypeName?: string;
  allOrganizations?: Array<{
    id?: string;
    name?: string;
    acronym?: string;
    typeId?: string;
    typeName?: string;
    status?: string;
    archived?: boolean;
  }>;
}): OrgTypeArchivalValidationResult {
  const targetTypeId = normalizeId(params.orgTypeId);
  const targetTypeNameLower = String(params.orgTypeName || '').trim().toLowerCase();
  const displayTypeName = String(params.orgTypeName || 'this organization type').trim() || 'this organization type';

  const activeClubNames: string[] = [];
  for (const org of params.allOrganizations || []) {
    if (!org) continue;
    const status = String(org.status || '').trim().toLowerCase();
    if (org.archived === true || status === 'archived' || status === 'deleted') {
      continue;
    }

    const orgTypeId = normalizeId(org.typeId);
    const orgTypeNameLower = String(org.typeName || '').trim().toLowerCase();
    const matches =
      (targetTypeId && orgTypeId === targetTypeId) ||
      (!orgTypeId && targetTypeNameLower && orgTypeNameLower === targetTypeNameLower);

    if (matches) {
      const label = org.acronym && org.name && org.acronym !== org.name
        ? `${org.name} (${org.acronym})`
        : String(org.name || org.acronym || org.id || 'Unnamed Club').trim();
      activeClubNames.push(label);
    }
  }

  if (activeClubNames.length > 0) {
    const previewList =
      activeClubNames.length <= 5
        ? activeClubNames.join(', ')
        : `${activeClubNames.slice(0, 5).join(', ')} and ${activeClubNames.length - 5} more`;
    return {
      allowed: false,
      activeClubCount: activeClubNames.length,
      activeClubNames,
      reason: `Cannot archive "${displayTypeName}": ${activeClubNames.length} active organization${activeClubNames.length === 1 ? ' is' : 's are'} currently using this classification (${previewList}). Reassign or archive ${activeClubNames.length === 1 ? 'that organization' : 'those organizations'} first.`,
    };
  }

  return {
    allowed: true,
    activeClubCount: 0,
    activeClubNames: [],
  };
}
