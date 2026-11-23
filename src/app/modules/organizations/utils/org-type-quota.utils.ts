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
