/**
 * src/app/modules/workflow/types/approval.types.ts
 *
 * Universal data models and type definitions for STI Sync approval workflows.
 * Covers Activity Proposals (Form AP-01), Financial Liquidations (Form LF-01),
 * and Post-Activity Reports (Form PAR).
 */

export type DocumentWorkflowType = 'proposal' | 'liquidation' | 'par';

export type UnifiedApprovalStatus =
  | 'draft'
  | 'under_review'
  | 'pending'
  | 'returned'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'voided';

export type DiffChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface SoftDeletable {
  isDeleted?: boolean;
  deletedAt?: any; // Firestore Timestamp / ISO String
  deletedByUid?: string;
  deletedByName?: string;
  deletedByRole?: string;
  deletedReason?: string;
  restoredAt?: any;
  restoredByUid?: string;
  restoredByName?: string;
}

export interface Archivable {
  isArchived?: boolean;
  archivedAt?: any;
  archivedBy?: string;
  archivedRefNumber?: string;
  archivedDocumentId?: string;
}

export interface FieldDiffEntry {
  fieldPath: string;           // e.g. "budget.lineItems[0].totalCost" or "sessions[0].venue"
  label: string;               // e.g. "Session 1 Venue" or "Speaker Honorarium"
  section: string;             // "General Info" | "Schedule & Sessions" | "Financials & Budget" | "Target Audience" | "Objectives" | "Receipts & Vouchers"
  changeType: DiffChangeType;  // 'added' | 'removed' | 'modified'
  oldValue: any;
  newValue: any;
  diffSummary?: string;        // Human readable e.g. "Changed from Lab 2 to Lab 1"
}

export interface RevisionHistoryEntry {
  version: number;
  versionLabel: string;
  submittedAt?: string;
  submittedBy?: string;
  submittedByUid?: string;
  returnedAt?: string;
  returnedBy?: string;
  returnedByRoleTitle?: string;
  returnedByEmail?: string;
  returnRemarks?: string;
  returnFlags?: string[];
  stepRevisionRemarks?: Record<string, string>;
  resubmittedAt?: string;
  resubmissionNote?: string;
  // Deep snapshot of document data before this revision cycle:
  dataSnapshot?: Record<string, any>;
  detectedDiffs?: FieldDiffEntry[];
}

export interface UnifiedApprovalStep {
  id?: string;
  step: number;
  stageIndex?: number;
  stageName?: string;
  role: string;
  roleTitle: string;
  actionType?: 'check' | 'endorse' | 'approve' | 'note';
  signatoryUid?: string;
  signatoryName: string;
  signatoryEmail: string;
  department?: string;
  departmentId?: string;
  status: 'waiting' | 'current' | 'endorsed' | 'approved' | 'returned' | 'waived';
  signatureUrl?: string;
  signedAt?: any;
  remarks?: string;
  isMandatory?: boolean;
  isPermanent?: boolean;
}

export interface ApprovableDocument {
  id: string;
  referenceNo?: string;
  title?: string;
  status: UnifiedApprovalStatus | string;
  proposalStatus?: string;
  lifecycleStatus?: string;
  
  // Ownership context
  createdByUid?: string;
  createdById?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdByRole?: 'admin' | 'officer' | 'sas_admin' | string;
  creatorRole?: 'admin' | 'officer' | 'sas_admin' | string;
  organizationId?: string;
  organizationName?: string;
  hostingOrgId?: string;
  isOfficerProposal?: boolean;
  isOfficerPar?: boolean;
  isSasDirect?: boolean;
  isSasInternal?: boolean;

  // Multi-stage signatory workflow
  approvalChain?: UnifiedApprovalStep[];
  currentStageIndex?: number;
  currentStepIndex?: number;

  // Revision & Return feedback
  version?: number;
  versionLabel?: string;
  isReturned?: boolean;
  returnRemarks?: string | null;
  adviserRemarks?: string | null;
  returnFlags?: string[];
  returnDeadline?: string;
  stepRevisionRemarks?: Record<string, string> | null;
  returnedBy?: string;
  returnedByName?: string;
  returnedByRoleTitle?: string;
  returnedByEmail?: string;
  returnedAt?: any;

  // History & audit trail
  versionHistory?: RevisionHistoryEntry[] | any[];
  revisionHistory?: RevisionHistoryEntry[];
  remarksHistory?: any[];
  proposalHistory?: any[];

  // Timestamps
  submittedAt?: any;
  submissionDate?: string;
  approvedAt?: any;
  approvedBy?: string;
  rejectedAt?: any;
  rejectedByName?: string;
  rejectionReason?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ApprovalPermissions {
  isOwner: boolean;
  isSasAdmin: boolean;
  isOrgOfficer: boolean;
  canApprove: boolean;
  canEndorse: boolean;
  canReturn: boolean;
  canReject: boolean;
  canWithdraw: boolean;
  canEdit: boolean;
  isPendingSignatoryAction: boolean;
  activeStageIndex: number;
  pendingStepForCurrentUser: UnifiedApprovalStep | null;
}
