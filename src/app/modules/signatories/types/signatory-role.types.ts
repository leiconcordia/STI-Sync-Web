/**
 * src/app/modules/signatories/types/signatory-role.types.ts
 *
 * Types for dynamic, database-maintained institutional signatory roles and hierarchy tiers.
 */

export type SignatoryRoleScope = 'department' | 'institutional' | 'ad_hoc';
export type SignatoryActionType = 'endorse' | 'approve';

export interface SignatoryRoleDocument {
  id: string;                      // Document ID (e.g., 'role_program_head')
  name: string;                    // Human-readable title: "Program / Department Head"
  code: string;                    // Unique slug: "program_head"
  description: string;             // Detailed responsibilities
  hierarchyLevel: number;          // 1 to 5 (Determines sequence in approval chain)
  scope: SignatoryRoleScope;       // 'department' | 'institutional' | 'ad_hoc'
  actionType: SignatoryActionType; // 'endorse' | 'approve'
  isFinalApprover: boolean;        // true only for School President / Board
  isMandatory: boolean;            // true if always required in standard proposals
  defaultTitle: string;            // Default job title: "Program Head"
  defaultDepartment?: string;      // Default department (if applicable)
  archived: boolean;               // Soft delete flag
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string;
}

export interface CreateSignatoryRolePayload {
  name: string;
  code: string;
  description: string;
  hierarchyLevel: number;
  scope: SignatoryRoleScope;
  actionType: SignatoryActionType;
  isFinalApprover?: boolean;
  isMandatory?: boolean;
  defaultTitle: string;
  defaultDepartment?: string;
}

/**
 * Standard default institutional signatory roles for STI College Ormoc.
 * Used for automatic database seeding and fallback when Firestore is uninitialized.
 */
export const DEFAULT_SIGNATORY_ROLES: Omit<SignatoryRoleDocument, 'id' | 'createdAt' | 'updatedAt' | 'archived'>[] = [
  {
    name: 'Program / Department Head',
    code: 'program_head',
    description: 'Reviews and endorses proposals affecting students and curriculum in their academic department.',
    hierarchyLevel: 2,
    scope: 'department',
    actionType: 'endorse',
    isFinalApprover: false,
    isMandatory: true,
    defaultTitle: 'Program Head',
    defaultDepartment: 'Information Technology',
  },
  {
    name: 'SHS Assistant Principal',
    code: 'shs_principal',
    description: 'Reviews and endorses proposals involving Grade 11 & 12 Senior High School tracks.',
    hierarchyLevel: 2,
    scope: 'department',
    actionType: 'endorse',
    isFinalApprover: false,
    isMandatory: true,
    defaultTitle: 'SHS Assistant Principal',
    defaultDepartment: 'Senior High School',
  },
  {
    name: 'Academic Head',
    code: 'academic_head',
    description: 'Institutional academic vetting across college programs, faculty schedules, and academic calendars.',
    hierarchyLevel: 3,
    scope: 'institutional',
    actionType: 'endorse',
    isFinalApprover: false,
    isMandatory: true,
    defaultTitle: 'Academic Head',
    defaultDepartment: 'Academic Affairs',
  },
  {
    name: 'School Administrator',
    code: 'school_administrator',
    description: 'Campus facility allocation, logistics, operational safety, and institutional resource endorsement.',
    hierarchyLevel: 4,
    scope: 'institutional',
    actionType: 'endorse',
    isFinalApprover: false,
    isMandatory: true,
    defaultTitle: 'School Administrator',
    defaultDepartment: 'Administration & Operations',
  },
  {
    name: 'School President',
    code: 'school_president',
    description: 'Final executive approval authority required to activate proposals and authorize budget release.',
    hierarchyLevel: 5,
    scope: 'institutional',
    actionType: 'approve',
    isFinalApprover: true,
    isMandatory: true,
    defaultTitle: 'School President',
    defaultDepartment: 'Office of the President',
  },
];
