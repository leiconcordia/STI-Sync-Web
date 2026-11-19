export interface AdviserConflictResult {
  field: 'email' | 'employeeId';
  message: string;
}

export interface OrganizationAdviserRecord {
  email?: string;
  employeeId?: string;
  organizationId?: string;
  organizationName?: string;
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
}

export function normalizeAdviserEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase();
}

export function normalizeEmployeeId(employeeId?: string | null): string {
  return String(employeeId || '').trim().toLowerCase();
}

/**
 * Checks already-loaded organizations in memory (0 Firestore reads) for an
 * existing Club Adviser using the same email or optional Employee ID.
 */
export function findAdviserConflictInOrganizations(params: {
  email: string;
  employeeId?: string;
  organizations: OrganizationSummaryForAdviserCheck[];
  excludeOrgId?: string;
}): AdviserConflictResult | null {
  const cleanEmail = normalizeAdviserEmail(params.email);
  const cleanEmpId = normalizeEmployeeId(params.employeeId);
  const rawEmpId = String(params.employeeId || '').trim();

  for (const org of params.organizations || []) {
    if (!org || org.id === params.excludeOrgId || !org.adviser) continue;

    if (cleanEmail && normalizeAdviserEmail(org.adviser.email) === cleanEmail) {
      return {
        field: 'email',
        message: `An active Club Adviser with email "${cleanEmail}" is already assigned to "${org.name || 'another organization'}".`,
      };
    }

    if (cleanEmpId && normalizeEmployeeId(org.adviser.employeeId) === cleanEmpId) {
      return {
        field: 'employeeId',
        message: `Faculty / Employee ID "${rawEmpId}" is already assigned to "${org.name || 'another organization'}".`,
      };
    }
  }

  return null;
}

/**
 * Evaluates targeted indexed query snapshots for active duplicate adviser
 * email, duplicate Employee ID, or conflicting active institutional signatory.
 */
export function validateAdviserRecordsConflict(params: {
  email: string;
  employeeId?: string;
  adviserRecords?: OrganizationAdviserRecord[];
  signatoryRecords?: SignatoryEmailRecord[];
  excludeOrgId?: string;
}): AdviserConflictResult | null {
  const cleanEmail = normalizeAdviserEmail(params.email);
  const cleanEmpId = normalizeEmployeeId(params.employeeId);
  const rawEmpId = String(params.employeeId || '').trim();

  for (const record of params.adviserRecords || []) {
    if (!record || record.isActive === false) continue;
    if (params.excludeOrgId && record.organizationId === params.excludeOrgId) continue;

    if (cleanEmail && normalizeAdviserEmail(record.email) === cleanEmail) {
      const orgLabel = record.organizationName ? ` to "${record.organizationName}"` : '';
      return {
        field: 'email',
        message: `An active Club Adviser with email "${cleanEmail}" is already assigned${orgLabel}.`,
      };
    }

    if (cleanEmpId && normalizeEmployeeId(record.employeeId) === cleanEmpId) {
      const orgLabel = record.organizationName ? ` to "${record.organizationName}"` : '';
      return {
        field: 'employeeId',
        message: `Faculty / Employee ID "${rawEmpId}" is already assigned${orgLabel}.`,
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
