/**
 * src/app/modules/signatories/types/signatory.types.ts
 *
 * Types for institutional signatories and approvers in STI Sync.
 */

export * from './signatory-role.types';

export type SignatoryRole =
  | 'program_head'
  | 'shs_principal'
  | 'academic_head'
  | 'school_administrator'
  | 'school_president'
  | (string & {});

export interface SignatoryRoleOption {
  value: SignatoryRole;
  label: string;
  defaultTitle: string;
  defaultDepartment: string;
  description: string;
}

export const SIGNATORY_ROLES: SignatoryRoleOption[] = [
  {
    value: 'program_head',
    label: 'Program / Department Head',
    defaultTitle: 'Program Head',
    defaultDepartment: 'Information Technology',
    description: 'Reviews and endorses activity proposals impacting their specific academic department or curriculum.',
  },
  {
    value: 'shs_principal',
    label: 'SHS Assistant Principal',
    defaultTitle: 'Asst. Principal',
    defaultDepartment: 'Senior High School',
    description: 'Reviews and endorses proposals involving Grade 11 & 12 Senior High School tracks.',
  },
  {
    value: 'academic_head',
    label: 'Academic Head',
    defaultTitle: 'Academic Head',
    defaultDepartment: 'Academic Affairs',
    description: 'Institutional academic review across college programs, faculty involvement, and academic calendars.',
  },
  {
    value: 'school_administrator',
    label: 'School Administrator',
    defaultTitle: 'School Administrator',
    defaultDepartment: 'School Administration',
    description: 'Campus facility allocation, logistics, operational feasibility, and institutional resource endorsement.',
  },
  {
    value: 'school_president',
    label: 'School President',
    defaultTitle: 'School President',
    defaultDepartment: 'Office of the President',
    description: 'Final executive approval authority required to activate proposals and authorize budget release.',
  },
];

export type SignatoryAuthorityCapability = 'endorser' | 'approver' | 'both';

export interface InstitutionalSignatory {
  id: string;
  uid?: string;
  name: string;
  email: string;
  role: SignatoryRole;
  roleTitle: string;
  actionType?: SignatoryAuthorityCapability | 'endorse' | 'approve'; // 'endorser' | 'approver' | 'both'
  department?: string;
  departmentId?: string;
  employeeId?: string;
  signatureUrl?: string;
  signatureDataUrl?: string;
  signatureUpdatedAt?: any;
  isActive: boolean;
  requiresPasswordChange?: boolean;
  temporaryPassword?: string;
  customPassword?: string;
  passwordHash?: string;
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string;
}

export interface CreateSignatoryPayload {
  name: string;
  email: string;
  role: SignatoryRole;
  roleTitle: string;
  actionType?: SignatoryAuthorityCapability | 'endorse' | 'approve';
  department?: string;
  departmentId?: string;
  employeeId?: string;
  temporaryPassword?: string;
}


