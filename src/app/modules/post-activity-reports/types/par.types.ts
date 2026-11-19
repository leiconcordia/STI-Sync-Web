import { Timestamp } from 'firebase/firestore';
import type { SoftDeletable, Archivable } from '../../workflow/types/approval.types';

export type PostActivityReportStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'returned'
  | 'archived';

export type PARObjectiveStatus =
  | 'fully_achieved'
  | 'partially_achieved'
  | 'unmet';

export interface PARPhotoAttachment {
  id: string;
  url: string;
  caption: string;
  uploadedAt?: string;
}

export interface PARAttachmentFile {
  id: string;
  name: string;
  url: string;
  size?: number;
  uploadedAt?: string;
}

export interface PARApprovalStep {
  id?: string;
  step: number;
  stageIndex?: number; // 1-indexed sequential stage grouping
  stageName?: string; // e.g. "Department Endorsement", "Academic Clearance", "Executive Approval"
  role: string;
  roleTitle: string;
  actionType?: 'check' | 'endorse' | 'approve';
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

export interface PARRemark {
  id: string;
  authorName: string;
  authorRole: 'admin' | 'officer' | 'signatory';
  action: 'submitted' | 'returned' | 'approved' | 'draft_saved' | 'endorsed';
  comment: string;
  timestamp: string;
}

export interface PostActivityReportDocument extends SoftDeletable, Archivable {
  id: string;
  referenceNo: string; // e.g., "PAR-ORG-2026-0001" or "PAR-SAS-2026-0001"

  // ─── Linked Event & Liquidation Context ───
  eventId: string;
  eventTitle: string;
  eventReferenceId: string;
  liquidationId?: string;
  liquidationRefNumber?: string;
  semesterId: string;
  schoolYear: string;
  semester: string;

  // ─── Creator & Ownership Context (Strict Authoring Rules) ───
  organizationId: string; // Specific org ID, or 'sas' for institutional events
  organizationName: string;
  organizationAcronym: string;
  createdByUid: string;
  createdByName: string;
  createdByEmail: string;
  creatorRole: 'officer' | 'sas_admin';
  isOfficerPar: boolean; // true = created by student org, false = created by SAS
  isSasInternal: boolean; // true = internal SAS activity (hidden from all orgs)
  visibility: 'owner_and_sas' | 'sas_only';

  // ─── Section 1: Event Summary (Auto-Populated from Proposal) ───
  eventDateFormatted: string;
  eventVenue: string;
  eventDescription: string;
  organizerName: string;
  proposalOrganizers?: string[];
  proposedMechanics?: string[];
  mechanicsDiffered?: boolean;
  actualMechanics?: string; // Fill up only if actual mechanics differed from proposed
  mechanicsAttachmentUrl?: string;
  mechanicsAttachmentName?: string;
  materialsUtilized?: string[];
  proposalMaterials?: string[];
  marketingConducted?: string[];
  proposalMarketingPlan?: string[];
  documentationPlan?: string[];
  proposalObjectives?: string[];
  proposalSuccessIndicators?: string[];

  // ─── Section 2: Attendance (Auto-Populated from Attendance Logs & Proposal) ───
  attendanceSummary: {
    registeredCount: number;
    estimatedAttendance?: number;
    estimatedAttendanceLabel?: string;
    attendedCount: number;
    turnoutRate?: number; // e.g. 93 (percent)
    targetAudience: string;
    whoAttended: string; // e.g., "BSIT all year level"
    howManyAttended?: string; // e.g., "112 / 120 Attendees (93% Turnout)"
    attendanceMonitoringUsed?: boolean;
    attendanceListUrl?: string;
    attendanceListName?: string;
  };

  // ─── Section 3: Financial Report (Copied from Financial Liquidation + AP Comparison) ───
  financialSummary: {
    totalRevenue: number;
    totalDisbursed: number;
    surplusOrDeficit: number;
    copiedFromLiquidation?: boolean;
    anticipatedExpenses?: number;
    allocatedBudget?: number;
    liquidationStatus?: string;
    cashierSettlementStatus?: string;
    anticipatedLineItems?: Array<{
      description: string;
      quantity?: number;
      unitAmount: number;
      totalAmount: number;
    }>;
    lineItems: Array<{
      description: string;
      unitAmount: number;
      totalAmount: number;
    }>;
    attachments?: PARAttachmentFile[];
  };

  // ─── Section 4: Results & Post-Event Evaluation (Officer Inputs & KPI Bridge) ───
  results: {
    objectiveStatus: PARObjectiveStatus;
    objectiveAssessments?: Array<{
      id: string;
      objectiveText: string;
      successIndicatorText?: string;
      status: 'fully_achieved' | 'partially_achieved' | 'unmet';
      actualResult: string;
      varianceRemarks?: string;
    }>;
    compositeSuccessScore?: number; // 0–100 composite activity success index
    achievementNarrative: string;
    keyLearnings: string[]; // 3–5 bullet points
    classroomEnrichment: string;
    venueAssessment: string;
    foodAssessment?: string;
    logisticsAssessment: string;
    scheduleCompliance: string;
    issuesEncountered: string; // "No major issues encountered" if none
  };

  // ─── Section 5: Remarks (Single Description — For Future Activity Improvements) ───
  remarks?: string;
  recommendations?: {
    description?: string;
    programFlow?: { observations: string; recommendations: string };
    participantEngagement?: { observations: string; recommendations: string };
    technicalSetup?: { observations: string; recommendations: string };
    participantPreparedness?: { observations: string; recommendations: string };
  };

  // ─── Section 6: Photos & Official Attachments Checklist (VIII. Attachments) ───
  photos: PARPhotoAttachment[];
  supportingDocuments?: PARAttachmentFile[];
  evaluationSummaryUrl?: string;
  attachmentsChecklist?: {
    attendanceSheet?: boolean;
    photosOfActivity?: boolean;
    programInvitation?: boolean;
    feedbackSummary?: boolean;
    feedbackEvaluationSummary?: boolean;
    certificatesLetters?: boolean;
    copiesOfCertificatesLetters?: boolean;
  };

  // ─── Section 7: Signatories & Endorsement Pipeline ───
  preparedBy: {
    name: string;
    roleTitle: string;
    signatureUrl?: string;
    signedAt?: any;
  };
  submittedBySignatureUrl?: string;
  approvalChain?: PARApprovalStep[];
  currentStageIndex?: number;
  currentStepIndex?: number;
  remarksHistory?: PARRemark[];

  // ─── Lifecycle & Clearance Status ───
  status: PostActivityReportStatus;
  isReturned?: boolean;
  submittedAt?: Timestamp | any;
  approvedAt?: Timestamp | any;
  approvedBy?: string;
  returnRemarks?: string | null;
  stepRevisionRemarks?: Record<string, string> | null;
  returnFlags?: string[];
  returnDeadline?: string | null;
  returnedAt?: Timestamp | any;
  returnedBy?: string;
  returnedByName?: string;
  returnedByRoleTitle?: string;
  returnedByEmail?: string;
  resubmissionNote?: string;

  // ─── Revision Management & Diff Tracking ───
  version?: number;
  versionLabel?: string;
  revisionCount?: number;
  previousSnapshot?: Record<string, any> | null;
  returnedSnapshot?: Record<string, any> | null;
  revisionHistory?: any[];

  // ─── Cross-Module EDMS Linkage ───
  archivedDocumentId?: string;
  archivedRefNumber?: string;

  createdAt: Timestamp | any;
  updatedAt: Timestamp | any;
}

export type PARFormData = Partial<PostActivityReportDocument>;

export const PAR_SECTIONS_FOR_REVISION = [
  { id: 'overview', key: 'overview', stepNumber: 1, label: '1. Activity Details, Attendance & Financial Report', description: 'Activity title, description, organizer/s, mechanics, materials, attendance, marketing, documentation, date & time, venue, and financial report' },
  { id: 'objectives', key: 'objectives', stepNumber: 2, label: '2. Results of the Activity', description: 'Achievement of objectives, key learnings, classroom enrichment, venue selection, food/logistics, schedule compliance, and issues encountered' },
  { id: 'recommendations', key: 'recommendations', stepNumber: 3, label: '3. Remarks & Attachments', description: 'Observations and recommendations for future activity improvements and attachments checklist' },
  { id: 'photos_signatories', key: 'photos_signatories', stepNumber: 4, label: '4. Documentation & Signatories', description: 'Photos of activity and signatory pipeline (Prepared by / Noted by)' },
];
