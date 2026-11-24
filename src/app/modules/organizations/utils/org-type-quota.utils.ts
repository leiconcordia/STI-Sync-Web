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
