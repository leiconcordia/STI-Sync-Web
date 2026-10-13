import { Timestamp } from 'firebase/firestore';

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

export interface PARApprovalStep {
  id?: string;
  step: number;
  stageIndex?: number; // 1-indexed sequential stage grouping
  stageName?: string; // e.g. "Department Endorsement", "Academic Clearance", "Executive Approval"
  role: string;
  roleTitle: string;
  actionType?: 'check' | 'endorse' | 'approve';
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
}

export interface PARRemark {
  id: string;
  authorName: string;
  authorRole: 'admin' | 'officer' | 'signatory';
  action: 'submitted' | 'returned' | 'approved' | 'draft_saved' | 'endorsed';
  comment: string;
  timestamp: string;
}

export interface PostActivityReportDocument {
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
  actualMechanics?: string; // Fill up only if actual mechanics differed from proposed
  materialsUtilized?: string[];
  marketingConducted?: string[];

  // ─── Section 2: Attendance Verification (Auto-Populated from Attendance Logs) ───
  attendanceSummary: {
    registeredCount: number;
    attendedCount: number;
    targetAudience: string;
    whoAttended: string; // e.g., "BSIT all year levels"
    attendanceListUrl?: string;
  };

  // ─── Section 3: Financial Clearance Summary (Auto-Populated from Form LF-01) ───
  financialSummary: {
    totalRevenue: number;
    totalDisbursed: number;
    surplusOrDeficit: number;
    lineItems: Array<{
      description: string;
      unitAmount: number;
      totalAmount: number;
    }>;
  };

  // ─── Section 4: Results & Post-Event Evaluation (Officer Inputs) ───
  results: {
    objectiveStatus: PARObjectiveStatus;
    achievementNarrative: string;
    keyLearnings: string[]; // 3–5 bullet points
    classroomEnrichment: string;
    venueAssessment: string;
    logisticsAssessment: string;
    scheduleCompliance: string;
    issuesEncountered: string; // "No major issues encountered" if none
  };

  // ─── Section 5: Categorized Recommendations (Exact 4 STI Areas) ───
  recommendations: {
    programFlow: { observations: string; recommendations: string };
    participantEngagement: { observations: string; recommendations: string };
    technicalSetup: { observations: string; recommendations: string };
    participantPreparedness: { observations: string; recommendations: string };
  };

  // ─── Section 6: Photo Documentation Gallery ───
  photos: PARPhotoAttachment[];
  evaluationSummaryUrl?: string;

  // ─── Section 7: Signatories & Endorsement Pipeline ───
  preparedBy: {
    name: string;
    roleTitle: string;
    signatureUrl?: string;
    signedAt?: any;
  };
  approvalChain?: PARApprovalStep[];
  currentStageIndex?: number;
  currentStepIndex?: number;
  remarksHistory?: PARRemark[];

  // ─── Lifecycle & Clearance Status ───
  status: PostActivityReportStatus;
  submittedAt?: Timestamp | any;
  approvedAt?: Timestamp | any;
  approvedBy?: string;
  returnRemarks?: string;
  returnedAt?: Timestamp | any;

  // ─── Cross-Module EDMS Linkage ───
  archivedDocumentId?: string;
  archivedRefNumber?: string;

  createdAt: Timestamp | any;
  updatedAt: Timestamp | any;
}

export type PARFormData = Partial<PostActivityReportDocument>;
