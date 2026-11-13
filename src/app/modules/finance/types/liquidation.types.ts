import { Timestamp } from 'firebase/firestore';
import type { SoftDeletable, Archivable } from '../../workflow/types/approval.types';
import type { ReturnStepItem } from '../../workflow/components/StepReturnRevisionModal';

export type LiquidationStatus = 'draft' | 'pending' | 'under_review' | 'approved' | 'returned' | 'voided';

export interface ReceiptAttachment {
  id: string;
  url: string;
  name: string;
  fileType: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'other';
  size?: number;
  publicId?: string;
}

export interface DisbursementVoucherAttachment {
  fileUrl: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'document' | 'other';
  fileSize?: number;
  publicId?: string;
  chequeNumber?: string;
  disbursementDate?: string; // YYYY-MM-DD
  amountDisbursed?: number;
  remarks?: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedByRole: 'adviser' | 'admin';
  uploadedAt: string; // ISO 8601 string
}

export interface ExpenseLineItem {
  id: string;
  description: string;
  category: string; // Sourced dynamically from proposed items or custom entry
  proposedItemId?: string; // Linkage to original proposal line item
  proposedItemTitle?: string; // Original title of proposed item (e.g. 'Food & Catering')
  proposedBaselineAmount?: number; // Total approved baseline budget for this proposed item (e.g. 10000)
  allocatedCost?: number; // Pre-filled approved budget amount for this item
  proposedQuantity?: number; // Proposed quantity from proposal
  proposedUnitCost?: number; // Proposed unit cost from proposal
  isPreFilled?: boolean; // Legacy flag (retained for backward compat, no longer locks editing)
  isContingency?: boolean; // True if designated as contingency fund advance
  quantity: number;
  unitCost: number;
  totalCost: number;
  vendorName: string;
  receiptNumber?: string;
  receiptUrl?: string; // Cloudinary secure URL (primary/first receipt for backward compatibility)
  receiptPublicId?: string;
  receiptUrls?: string[]; // Multiple receipt URLs
  receiptFiles?: ReceiptAttachment[]; // Detailed receipt attachment objects
  wasModifiedInRev?: boolean; // Flagged true if changed during revision cycle
  previousValues?: {
    quantity?: number;
    unitCost?: number;
    totalCost?: number;
    description?: string;
  };
}

export interface LiquidationRemark {
  id: string;
  authorName: string;
  authorRole: 'admin' | 'officer' | 'signatory';
  action: 'submitted' | 'returned' | 'approved' | 'draft_saved' | 'voided' | 'endorsed' | 'cashier_proof' | 'cashier_verified';
  comment: string;
  timestamp: string; // ISO string
}

export interface LiquidationApprovalStep {
  id?: string;
  step: number;
  stageIndex?: number; // 1-indexed sequential stage grouping
  stageName?: string; // e.g. "Checking & Verification", "Department Endorsements", "Executive Review"
  role: string; // e.g. 'accountant' | 'program_head' | 'academic_head' | 'school_administrator' | 'school_president' | etc.
  roleTitle: string; // e.g. 'Accountant / Auditor', 'Program Head', 'School Administrator', 'School President'
  actionType?: 'check' | 'endorse' | 'approve' | 'note';
  signatoryLabel?: string;
  signatoryUid?: string;
  signatoryName: string;
  signatoryEmail: string;
  department?: string;
  status: 'waiting' | 'current' | 'endorsed' | 'approved' | 'returned';
  signatureUrl?: string;
  signedAt?: any;
  remarks?: string;
  isMandatory?: boolean;
  isPermanent?: boolean;
  isUserAdded?: boolean;
}

export interface LiquidationDocument extends SoftDeletable, Archivable {
  id: string;
  referenceNo?: string;
  referenceNumber?: string;
  eventId: string;
  eventTitle: string;
  schoolYear?: string;
  semester?: string;
  semesterId?: string;
  fundingSource?: 'organization_funds' | 'school_budget' | 'zero_budget';
  organizationId: string;
  organizationName: string;
  createdById: string;
  createdByRole: 'admin' | 'officer' | 'adviser' | 'sas_admin' | string;
  createdByName: string;
  submittedByName?: string;
  submittedByRole?: string;
  submittedBySignatureUrl?: string;
  preparedBy?: {
    name?: string;
    roleTitle?: string;
    email?: string;
    signatureUrl?: string;
    signedAt?: string;
  };
  // Official Form LF-01 Header & Cheque Information
  employeeName?: string;
  chequeNumber?: string;
  purpose?: string;
  amountAdvanced?: number;
  dateReleased?: string;
  activityEndDate?: string;
  submissionDeadline?: string;
  dateSubmitted?: string;
  daysLapsed?: string;
  orNumber?: string;
  disbursementVoucher?: DisbursementVoucherAttachment | null;

  allocatedBudget: number;      // Approved budget ceiling from event
  totalActualSpending: number;  // Sum of all line items
  surplusOrDeficit: number;     // allocatedBudget - totalActualSpending
  status: LiquidationStatus;
  lineItems: ExpenseLineItem[];
  approvalChain?: LiquidationApprovalStep[];
  currentStageIndex?: number;
  currentStepIndex?: number;
  remarksHistory?: LiquidationRemark[];
  submittedAt?: Timestamp | any;
  submittedByName?: string;
  submittedByRole?: string;
  approvedAt?: Timestamp | any;
  approvedBy?: string;
  returnRemarks?: string;
  returnFlags?: string[];
  stepRevisionRemarks?: Record<string, string>;
  returnedBy?: string;
  returnedByName?: string;
  returnedByRoleTitle?: string;
  returnedByEmail?: string;
  returnedAt?: Timestamp | any;
  revisionHistory?: any[];
  voidedAt?: Timestamp | any;
  voidedBy?: string;
  voidedReason?: string;
  revisionCount?: number;
  // Post-Approval Cashier Settlement Proof (Surplus Return / Deficit Reimbursement / Cancellation Return)
  cashierSettlementProofs?: ReceiptAttachment[];
  cashierSettlementType?: 'surplus_return' | 'deficit_reimbursement' | 'cancellation_return';
  cashierSettlementStatus?: 'not_required' | 'pending_proof' | 'proof_uploaded' | 'verified';
  cashierReferenceNo?: string;
  cashierSettledAt?: string;
  cashierSettledByName?: string;
  cashierVerifiedBy?: string;
  cashierVerifiedByName?: string;
  cashierVerifiedAt?: string;
  amountToReturn?: number;
  isCancellationLiquidation?: boolean;
  cancellationReason?: string;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface EventAttendanceSummary {
  id: string;
  event: string;
  registered: number;
  checkedIn: number;
  absent: number;
}

/**
 * Builds itemized revision checklist for Financial Liquidation (Form LF-01).
 * Displays each individual expense line item by title, amount, quantity, and receipt count,
 * along with the Signatory & Audit Route and Event Budget Linkage.
 */
export function buildLiquidationReturnSteps(lineItems: ExpenseLineItem[]): ReturnStepItem[] {
  const steps: ReturnStepItem[] = [];

  (lineItems || []).forEach((item, idx) => {
    const itemNum = idx + 1;
    const itemTitle = item.description?.trim() ? item.description.trim() : `Item #${itemNum}`;
    const key = `item_${item.id || idx}`;

    const recCount =
      (item.receiptFiles && item.receiptFiles.length) ||
      (item.receiptUrls && item.receiptUrls.length) ||
      (item.receiptUrl ? 1 : 0);

    const costFormatted = Number(item.totalCost || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const unitFormatted = Number(item.unitCost || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const qty = item.quantity || 1;

    const descParts: string[] = [
      `₱${costFormatted} (${qty} @ ₱${unitFormatted})`,
      `${recCount} receipt proof(s)`,
    ];
    if (item.category) descParts.push(item.category);
    if (item.vendorName) descParts.push(`Vendor: ${item.vendorName}`);

    steps.push({
      key,
      stepNumber: itemNum,
      label: `Item #${itemNum}: ${itemTitle}`,
      description: descParts.join(' • '),
    });
  });

  // Signatory & Audit Pipeline
  steps.push({
    key: 'sec_signatories',
    stepNumber: steps.length + 1,
    label: 'Signatory & Audit Route',
    description: 'Designated auditor, treasurer, institutional signatories, and endorsement sequence',
  });

  // Event Linkage & Budget Ceiling
  steps.push({
    key: 'sec_event_budget',
    stepNumber: steps.length + 1,
    label: 'Event Linkage & Budget Ceiling',
    description: 'Linked event details, approved allocation amount, and deficit/surplus verification',
  });

  return steps;
}

/**
 * Helper to reliably determine if an expense line item is flagged for revision,
 * matching against full item ID, prefix-stripped ID, zero-based and 1-based index permutations,
 * or legacy bulk flags.
 */
export function isExpenseItemFlagged(
  item: ExpenseLineItem,
  index: number,
  returnFlags: string[] = [],
  stepRevisionRemarks: Record<string, string> = {},
  hasLegacyBulkFlags: boolean = false,
  hasItemLevelFlags: boolean = false
): { isFlagged: boolean; feedback?: string } {
  const flags = returnFlags || [];
  const remarks = stepRevisionRemarks || {};
  const allKeys = Array.from(new Set([...flags, ...Object.keys(remarks)]));

  // Construct all possible candidate keys for this line item
  const candidates: string[] = [];
  if (item.id) {
    candidates.push(`item_${item.id}`);
    candidates.push(item.id);
    if (item.id.startsWith('item_')) {
      candidates.push(item.id.replace(/^item_/, ''));
    }
  }
  candidates.push(`item_${index}`);
  candidates.push(`item_${index + 1}`);

  for (const cand of candidates) {
    if (flags.includes(cand) || Boolean(remarks[cand])) {
      return {
        isFlagged: true,
        feedback: remarks[cand] || undefined,
      };
    }
  }

  // Substring / partial matching across all flagged keys
  for (const k of allKeys) {
    if (!k.startsWith('item_') && !k.startsWith('item-')) continue;
    if (item.id && (k.includes(item.id) || item.id.includes(k.replace(/^item_/, '')))) {
      return {
        isFlagged: true,
        feedback: remarks[k] || undefined,
      };
    }
  }

  // Fallback to bulk legacy flags if no item-level flags exist
  if (!hasItemLevelFlags && hasLegacyBulkFlags) {
    const bulkRemark = remarks['sec_line_items'] || remarks['sec_receipts'];
    return {
      isFlagged: true,
      feedback: bulkRemark || undefined,
    };
  }

  return { isFlagged: false };
}


