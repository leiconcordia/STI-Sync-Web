export interface AdviserConflictResult {
  field: 'email' | 'employeeId';
  message: string;
}

export interface OrganizationAdviserRecord {
  email?: string;
  employeeId?: string;
  organizationId?: string;
  organizationName?: string;
  adviserRole?: 'primary' | 'co_adviser';
  isActive?: boolean;
}

export interface SignatoryEmailRecord {
  email?: string;
  name?: string;
  isActive?: boolean;
}

export interface OrganizationSummaryForAdviserCheck {
  id: string;
  name?: string;
  adviser?: {
    email?: string;
    employeeId?: string;
  } | null;
  coAdviser?: {
    email?: string;
    employeeId?: string;
  } | null;
}

export function normalizeAdviserEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase();
}

export function normalizeEmployeeId(employeeId?: string | null): string {
  return String(employeeId || '').trim().toLowerCase();
}

/**
 * Checks already-loaded organizations in memory (0 Firestore reads) for an
 * existing Primary Club Adviser or Secondary Co-Adviser using the same email or optional Employee ID.
 * Enforces the 1-organization uniqueness rule across BOTH primary adviser and co-adviser roles.
 */
export function findAdviserConflictInOrganizations(params: {
  email: string;
  employeeId?: string;
  organizations: OrganizationSummaryForAdviserCheck[];
  excludeOrgId?: string;
  excludeRole?: 'primary' | 'co_adviser';
}): AdviserConflictResult | null {
  const cleanEmail = normalizeAdviserEmail(params.email);
  const cleanEmpId = normalizeEmployeeId(params.employeeId);
  const rawEmpId = String(params.employeeId || '').trim();

  for (const org of params.organizations || []) {
    if (!org) continue;
    const isExcludedOrg = Boolean(params.excludeOrgId && org.id === params.excludeOrgId);

    const slots: Array<{ role: 'primary' | 'co_adviser'; label: string; data?: { email?: string; employeeId?: string } | null }> = [
      { role: 'primary', label: 'Club Adviser', data: org.adviser },
      { role: 'co_adviser', label: 'Club Co-Adviser', data: org.coAdviser },
    ];

    for (const slot of slots) {
      if (!slot.data) continue;
      // If editing a specific slot on this org, skip only that exact slot (still catch collision with the other slot on the same org!)
      if (isExcludedOrg && (!params.excludeRole || params.excludeRole === slot.role)) {
        continue;
      }

      if (cleanEmail && normalizeAdviserEmail(slot.data.email) === cleanEmail) {
        return {
          field: 'email',
          message: isExcludedOrg
            ? `Email "${cleanEmail}" is already assigned as the ${slot.label} of this organization.`
            : `An active ${slot.label} with email "${cleanEmail}" is already assigned to "${org.name || 'another organization'}".`,
        };
      }

      if (cleanEmpId && normalizeEmployeeId(slot.data.employeeId) === cleanEmpId) {
        return {
          field: 'employeeId',
          message: isExcludedOrg
            ? `Faculty / Employee ID "${rawEmpId}" is already assigned as the ${slot.label} of this organization.`
            : `Faculty / Employee ID "${rawEmpId}" is already assigned to "${org.name || 'another organization'}" (${slot.label}).`,
        };
      }
    }
  }

  return null;
}

/**
 * Evaluates targeted indexed query snapshots for active duplicate adviser/co-adviser
 * email, duplicate Employee ID, or conflicting active institutional signatory.
 */
export function validateAdviserRecordsConflict(params: {
  email: string;
  employeeId?: string;
  adviserRecords?: OrganizationAdviserRecord[];
  signatoryRecords?: SignatoryEmailRecord[];
  excludeOrgId?: string;
  excludeRole?: 'primary' | 'co_adviser';
}): AdviserConflictResult | null {
  const cleanEmail = normalizeAdviserEmail(params.email);
  const cleanEmpId = normalizeEmployeeId(params.employeeId);
  const rawEmpId = String(params.employeeId || '').trim();

  for (const record of params.adviserRecords || []) {
    if (!record || record.isActive === false) continue;
    const recordRole: 'primary' | 'co_adviser' =
      record.adviserRole === 'co_adviser' ? 'co_adviser' : 'primary';
    const isSameOrg = Boolean(params.excludeOrgId && record.organizationId === params.excludeOrgId);
    if (isSameOrg && (!params.excludeRole || params.excludeRole === recordRole)) continue;

    const roleLabel = recordRole === 'co_adviser' ? 'Club Co-Adviser' : 'Club Adviser';

    if (cleanEmail && normalizeAdviserEmail(record.email) === cleanEmail) {
      const orgLabel = isSameOrg
        ? ' to this organization'
        : record.organizationName
        ? ` to "${record.organizationName}"`
        : '';
      return {
        field: 'email',
        message: `An active ${roleLabel} with email "${cleanEmail}" is already assigned${orgLabel}.`,
      };
    }

    if (cleanEmpId && normalizeEmployeeId(record.employeeId) === cleanEmpId) {
      const orgLabel = isSameOrg
        ? ' to this organization'
        : record.organizationName
        ? ` to "${record.organizationName}"`
        : '';
      return {
        field: 'employeeId',
        message: `Faculty / Employee ID "${rawEmpId}" is already assigned${orgLabel} (${roleLabel}).`,
      };
    }
  }

  for (const signatory of params.signatoryRecords || []) {
    if (!signatory || signatory.isActive === false) continue;
    if (cleanEmail && normalizeAdviserEmail(signatory.email) === cleanEmail) {
      return {
        field: 'email',
        message: `Email "${cleanEmail}" is already registered as an Institutional Signatory (${signatory.name || 'Active'}). Use a different email for this Club Adviser.`,
      };
    }
  }

  return null;
}
