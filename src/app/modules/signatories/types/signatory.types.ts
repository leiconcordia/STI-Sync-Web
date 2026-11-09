/**
 * src/app/modules/signatories/types/signatory.types.ts
 *
 * Types for institutional signatories and approvers in STI Sync.
 */

export * from './signatory-role.types';
export * from './signatory-label.types';

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

export type WorkflowDocumentType = 'proposal' | 'liquidation' | 'par';

export type SignatoryDocumentScope =
  | 'both' // Legacy: proposal + liquidation
  | 'liquidation_only' // Legacy: liquidation only
  | 'proposal_only' // Legacy: proposal only
  | 'all' // All three documents: proposal, liquidation, par
  | 'proposal'
  | 'liquidation'
  | 'par'
  | string;

export interface InstitutionalSignatory {
  id: string;
  uid?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
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
  isPermanentSigner?: boolean;
  isMandatoryForDepartment?: string;
  applicableScope?: SignatoryDocumentScope; // Legacy single-value scope string
  applicableWorkflows?: WorkflowDocumentType[]; // Explicit list of workflows: ['proposal', 'liquidation', 'par']
  canApproveProposal?: boolean;
  canApproveLiquidation?: boolean;
  canApprovePar?: boolean;
  defaultSignatoryLabel?: string;
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
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  email: string;
  role: SignatoryRole;
  roleTitle: string;
  actionType?: SignatoryAuthorityCapability | 'endorse' | 'approve';
  department?: string;
  departmentId?: string;
  employeeId?: string;
  temporaryPassword?: string;
  isPermanentSigner?: boolean;
  isMandatoryForDepartment?: string;
  applicableScope?: SignatoryDocumentScope;
  applicableWorkflows?: WorkflowDocumentType[];
  canApproveProposal?: boolean;
  canApproveLiquidation?: boolean;
  canApprovePar?: boolean;
  defaultSignatoryLabel?: string;
}

/**
 * Returns the normalized array of authorized workflow documents for a signatory.
 */
export function getSignatoryAuthorizedWorkflows(sig: InstitutionalSignatory): WorkflowDocumentType[] {
  if (Array.isArray(sig.applicableWorkflows) && sig.applicableWorkflows.length > 0) {
    return sig.applicableWorkflows;
  }
  const scope = sig.applicableScope || 'both';
  if (scope === 'all') return ['proposal', 'liquidation', 'par'];
  if (scope === 'liquidation_only' || scope === 'liquidation') return ['liquidation'];
  if (scope === 'proposal_only' || scope === 'proposal') return ['proposal'];
  if (scope === 'par_only' || scope === 'par') return ['par'];
  // 'both' in legacy meant proposal + liquidation
  return ['proposal', 'liquidation'];
}

/**
 * Determines whether a signatory is eligible for a specific document workflow.
 * Guarantees that Accountants are strictly for Liquidations and never Activity Proposals or PAR.
 */
export function isSignatoryApplicableTo(
  sig: InstitutionalSignatory,
  formType: WorkflowDocumentType | 'proposal' | 'liquidation' | 'par'
): boolean {
  const roleLower = (sig.role || '').toLowerCase();
  const titleLower = (sig.roleTitle || '').toLowerCase();
  const isAccountant =
    roleLower === 'accountant' ||
    titleLower.includes('accountant') ||
    titleLower.includes('auditor');

  // Hard safety invariant: Accountants & Auditors are strictly for Liquidations
  if (isAccountant && formType !== 'liquidation') {
    return false;
  }

  // 1. Check array if explicitly set (even if empty, which means Cannot Sign on all workflows)
  if (Array.isArray(sig.applicableWorkflows)) {
    return sig.applicableWorkflows.includes(formType as WorkflowDocumentType);
  }

  // 2. Check legacy applicableScope string
  const scope = sig.applicableScope || 'both';
  if (scope === 'all') {
    return true;
  }

  if (formType === 'proposal') {
    if (scope === 'liquidation_only' || scope === 'liquidation' || scope === 'par') return false;
    return true;
  }

  if (formType === 'liquidation') {
    if (scope === 'proposal_only' || scope === 'proposal' || scope === 'par') return false;
    return true;
  }

  if (formType === 'par') {
    // If explicit par scope or 'all', allowed
    if (scope === 'par' || scope === 'all') return true;
    // Legacy 'both' was strictly AP + FL, but if a signatory is academic/executive they can be used unless liquidation_only
    if (scope === 'liquidation_only' || scope === 'liquidation') return false;
    return true;
  }

  return true;
}



