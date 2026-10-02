import { Timestamp } from 'firebase/firestore';

export type LiquidationStatus = 'draft' | 'pending' | 'under_review' | 'approved' | 'returned' | 'voided';

export interface ReceiptAttachment {
  id: string;
  url: string;
  name: string;
  fileType: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'other';
  size?: number;
  publicId?: string;
}

export interface ExpenseLineItem {
  id: string;
  description: string;
  category: string; // 'Food & Catering' | 'Venue & Facilities' | 'Materials & Printing' | 'Honorarium' | 'Transportation' | 'Miscellaneous'
  allocatedCost?: number; // Pre-filled approved budget amount for this item
  proposedQuantity?: number; // Proposed quantity from proposal
  proposedUnitCost?: number; // Proposed unit cost from proposal
  isPreFilled?: boolean; // If true, description & category cannot be edited or deleted
  quantity: number;
  unitCost: number;
  totalCost: number;
  vendorName: string;
  receiptNumber?: string;
  receiptUrl?: string; // Cloudinary secure URL (primary/first receipt for backward compatibility)
  receiptPublicId?: string;
  receiptUrls?: string[]; // Multiple receipt URLs
  receiptFiles?: ReceiptAttachment[]; // Detailed receipt attachment objects
}

export interface LiquidationRemark {
  id: string;
  authorName: string;
  authorRole: 'admin' | 'officer' | 'signatory';
  action: 'submitted' | 'returned' | 'approved' | 'draft_saved' | 'voided' | 'endorsed';
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
  signatoryUid?: string;
  signatoryName: string;
  signatoryEmail: string;
  department?: string;
  status: 'waiting' | 'current' | 'endorsed' | 'approved' | 'returned';
  signatureUrl?: string;
  signedAt?: any;
  remarks?: string;
}

export interface LiquidationDocument {
  id: string;
  eventId: string;
  eventTitle: string;
  organizationId: string;
  organizationName: string;
  createdById: string;
  createdByRole: 'admin' | 'officer';
  createdByName: string;
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
  returnedAt?: Timestamp | any;
  voidedAt?: Timestamp | any;
  voidedBy?: string;
  voidedReason?: string;
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

