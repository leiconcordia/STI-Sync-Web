import { Timestamp } from 'firebase/firestore';

export interface OrganizationTypeDocument {
  id: string;
  name: string;
  color: string;
  archived: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrgAdviserData {
  authUid?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  middleInitial?: string;
  employeeId?: string;
  email: string;
  departmentId: string;
  title: string; // 'Club Adviser'
  temporaryPassword?: string;
  requiresPasswordChange?: boolean;
  tempPass?: string | null;
  resetInProgress?: boolean;
  nameVerification?: Record<string, unknown>;
  existingAccountUid?: string;
  accountProvisioning?: 'created' | 'reused';
}

export interface OrgAutoPayableRule {
  id: string;
  type: 'membership_due' | 'org_fine' | 'custom';
  label: string;
  description: string;
  amount: number;
  dueDate: string | null;
  semesterId?: string;
  semester?: string;
  schoolYear?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface OrganizationDocument {
  id: string;
  name: string;
  acronym: string;
  typeId: string;                              // FK → /organization_types
  departmentId: string | 'cross-departmental'; // FK → /departments or sentinel
  departmentName?: string;
  departmentCode?: string;
  department?: string;
  scope?: 'departmental' | 'cross-departmental';
  isCrossDepartmental?: boolean;
  description: string;

  // ─── Adviser ───
  adviser?: OrgAdviserData;

  // ─── Academic Context ───
  academicYear: string;                        // e.g. "2025-2026"
  semester: string;                            // e.g. "1st Semester"

  // ─── Metadata ───
  status: 'active' | 'inactive' | 'suspended';
  memberCount: number;
  logoUrl: string | null;
  membershipFee?: number;
  autoPayableRules?: OrgAutoPayableRule[];

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface CreateOrganizationPayload {
  name: string;
  acronym: string;
  typeId: string;
  departmentId: string | 'cross-departmental';
  departmentName?: string;
  departmentCode?: string;
  department?: string;
  scope?: 'departmental' | 'cross-departmental';
  isCrossDepartmental?: boolean;
  description: string;
  academicYear: string;
  semester: string;
  logoUrl: string | null;
  membershipFee?: number;
  adviser?: OrgAdviserData;
}

export interface OrganizationRulesDocument {
  minMembersRequired: number;
  minOfficersRequired: number;

  updatedAt: Timestamp;
}

