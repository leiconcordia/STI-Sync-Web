/**
 * src/app/modules/supplemental-budget/types/sbr.types.ts
 *
 * TypeScript models for Pre-Implementation Supplemental Budget Requests (SBR).
 * Modeled as immutable addendums linked to an approved Activity Proposal / Event
 * so the original approved AP document, signatures, and ledger deductions remain untouched.
 */

import type {
  AdviserReviewRecord,
  ProposalApprovalStep,
  ProposalBucketAllocation,
} from '../../activity-proposals/types/proposal.types';

export type SupplementalFundingSource =
  | 'organization_funds'
  | 'school_budget'
  | 'retained_sao_fund';

export type SupplementalReasonCategory =
  | 'price_increase'
  | 'expanded_scope'
  | 'venue_logistics'
  | 'equipment_materials'
  | 'other';

export const SUPPLEMENTAL_REASON_LABELS: Record<SupplementalReasonCategory, string> = {
  price_increase: 'Unforeseen Vendor Price Increase',
  expanded_scope: 'Expanded Participant Headcount / Scope',
  venue_logistics: 'Venue, Logistics, or Technical Requirement',
  equipment_materials: 'Additional Supplies, Prizes, or Materials',
  other: 'Other Operational Requirement',
};

export type SupplementalBudgetStatus =
  | 'draft'
  | 'for_adviser_review'
  | 'for_revision'
  | 'approved_by_adviser'
  | 'for_sas_review'
  | 'pending_signatories'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export interface SupplementalExpenseItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalAmount: number;
  remarks?: string;
}

export interface SupplementalAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  uploadedAt: string;
}

export interface SupplementalVoucherRecord {
  mode: 'separate' | 'bundled_with_primary';
  voucherNumber?: string;
  chequeNumber?: string;
  chequeDate?: string;
  releaseDate?: string;
  disbursedAmount?: number;
  attachmentUrl?: string;
  fileName?: string;
  notes?: string;
  attachedBy?: string;
  attachedByUid?: string;
  attachedAt?: any;
}

export interface SupplementalHistoryEntry {
  id: string;
  action:
    | 'created'
    | 'submitted_to_adviser'
    | 'adviser_approved'
    | 'adviser_returned'
    | 'adviser_rejected'
    | 'sas_approved'
    | 'sas_endorsed'
    | 'sas_returned'
    | 'sas_rejected'
    | 'signatory_signed'
    | 'signatory_returned'
    | 'signatory_rejected'
    | 'resubmitted'
    | 'withdrawn'
    | 'voucher_attached'
    | 'approved';
  performedBy: string;
  performedByUid?: string;
  role?: string;
  remarks?: string;
  timestamp: string;
}

export interface SupplementalEventAllocation extends ProposalBucketAllocation {
  sbrId?: string;
  sbrReferenceCode?: string;
}

export interface SupplementalEventExpenseItem {
  id: string;
  sbrId: string;
  sbrReferenceCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalAmount: number;
  fundingSource: SupplementalFundingSource;
  remarks?: string;
}

export interface SupplementalBudgetRequest {
  id: string;
  referenceCode: string;
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  organizationId: string;
  organizationName: string;
  organizationAcronym?: string;
  isSasInstitutional: boolean;
  semesterId: string | null;
  schoolYear: string | null;
  semester?: string | null;

  // Snapshot of budget at request time
  baseApprovedBudget: number;
  priorSupplementalTotal: number;

  // Supplemental Request Payload
  reasonCategory: SupplementalReasonCategory;
  justification: string;
  additionalItems: SupplementalExpenseItem[];
  requestedAmount: number;
  supportingAttachments: SupplementalAttachment[];

  // Funding Source & Allocations
  fundingSource: SupplementalFundingSource;
  allocations: ProposalBucketAllocation[];
  miscFeeBucketId?: string;
  miscFeeBucketName?: string;
  miscFeeBucketIds?: string[];
  miscFeeBucketNames?: string[];
  requiresSignatories: boolean;

  // 7-Stage Status Tracking & Workflow
  status: SupplementalBudgetStatus;
  isPendingSasVetting: boolean;
  submittedByOfficer: boolean;
  creatorUid: string;
  creatorName: string;
  creatorEmail?: string;
  creatorRole: 'officer' | 'adviser' | 'admin';

  // Adviser Checker Gate
  adviserReview?: AdviserReviewRecord | null;
  submittedToAdviserAt?: any;
  submittedToSasAt?: any;

  // SAS Vetting & Signatory Chain
  sasVettedBy?: {
    uid: string;
    name: string;
    vettedAt: string;
    remarks?: string;
  } | null;
  approvalChain: ProposalApprovalStep[];
  currentStepIndex: number;
  currentStageIndex?: number;
  pipelineSource?: 'parent_ap' | 'default_ap_template' | 'custom';

  // Return / Rejection tracking
  isReturned?: boolean;
  returnedByRole?: 'adviser' | 'sas' | 'signatory' | string;
  returnedByName?: string;
  returnedRemarks?: string;
  returnedAt?: any;

  rejectedByRole?: 'adviser' | 'sas' | 'signatory' | string;
  rejectedByName?: string;
  rejectionReason?: string;
  rejectedAt?: any;

  withdrawnAt?: any;
  withdrawnBy?: string;
  withdrawReason?: string;

  // Ledger & Disbursement Voucher Settlement
  ledgerDeducted: boolean;
  requiresClubLedgerAcknowledgment?: boolean;
  requiresSupplementalVoucher?: boolean;
  ledgerAcknowledgedBy?: string;
  ledgerAcknowledgedAt?: any;
  ledgerDeductionKeys?: string[];
  disbursementVoucher?: SupplementalVoucherRecord | null;

  // Audit & Revision
  revisionCount: number;
  history: SupplementalHistoryEntry[];
  isDeleted?: boolean;
  createdAt: any;
  updatedAt: any;
  approvedAt?: any;
  approvedBy?: string;
}

export interface CreateSupplementalBudgetPayload {
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  organizationId: string;
  organizationName: string;
  organizationAcronym?: string;
  isSasInstitutional: boolean;
  semesterId?: string | null;
  schoolYear?: string | null;
  semester?: string | null;
  baseApprovedBudget: number;
  priorSupplementalTotal: number;
  reasonCategory?: SupplementalReasonCategory;
  justification: string;
  additionalItems: SupplementalExpenseItem[];
  requestedAmount: number;
  supportingAttachments?: SupplementalAttachment[];
  fundingSource: SupplementalFundingSource;
  allocations: ProposalBucketAllocation[];
  approvalChain?: ProposalApprovalStep[];
  submitImmediately: boolean;
}
