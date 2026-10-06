/**
 * src/app/modules/activity-proposals/types/proposal.types.ts
 *
 * Official TypeScript data models for the STI Activity Proposal (AP) system.
 * Based on official documents AP IT Expert Talk 1.docx, AP2025 (1).docx, and AP EVRAA.docx.
 */

import type { SignatoryRole, SignatoryActionType } from '../../signatories/types/signatory.types';

export type ProposalStatus =
  | 'draft'
  | 'under_review'
  | 'returned_for_revision'
  | 'approved_president'
  | 'activated';

export interface FinancialLineItem {
  id: string;
  description: string;
  lastYearActual: number;
  thisYearProposed: number;
  totalAmount: number;
  adjustment: number;
  remarks: string;
}

export interface FinancialProjections {
  revenues: FinancialLineItem[];
  expenses: FinancialLineItem[];
  totalRevenue: number;
  totalExpenses: number;
  balance: number;
}

export interface ProposalTask {
  id: string;
  taskName: string;
  assignedPerson: string;
  completionDate: string; // YYYY-MM-DD
}

export interface ProposalSession {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  venueName: string;
  venueId?: string;
}

export interface ProposalTargetAudience {
  scope?: 'all' | 'specific';
  academicLevels: ('SHS' | 'College')[];
  courses?: string[]; // Course / strand IDs from Firestore collection 'courses'
  courseCodes?: string[]; // e.g. ['BSIT', 'BSHM', 'STEM']
  departmentIds?: string[]; // Department IDs from Firestore collection 'departments'
  departments: string[]; // e.g. ['BSIT', 'BSHM', 'STEM']
  sections?: string[]; // Section names or IDs (e.g., ['BSIT 3101', 'STEM 11-A'])
  yearLevels: (string | number)[]; // e.g. ['G11', 'G12', '1st Year', '2nd Year', '3rd Year', '4th Year']
  allStudents?: boolean;
}

export interface ProposalApprovalStep {
  id?: string;
  step: number;
  stageIndex?: number; // 1-indexed sequential stage grouping
  stageName?: string; // Optional label for stage (e.g. "Department Endorsements")
  role: SignatoryRole | 'sas_coordinator' | (string & {});
  roleTitle: string;
  actionType?: SignatoryActionType; // 'endorse' | 'approve'
  signatoryUid?: string;
  signatoryName: string;
  signatoryEmail: string;
  department?: string;
  departmentId?: string;
  status: 'waiting' | 'current' | 'endorsed' | 'approved' | 'returned' | 'waived';
  signatureUrl?: string;
  signedAt?: any;
  remarks?: string;
  feedbackSections?: { sectionKey: string; comment: string }[];
}

export interface ProposalSectionRemark {
  id: string;
  sectionKey: string;
  reviewerUid: string;
  reviewerName: string;
  reviewerRole: string;
  remarkText: string;
  createdAt: any;
}

export interface ActivityProposal {
  id: string;
  referenceNo: string; // e.g., "AP-2026-SAS-001"
  submissionDate: string; // Auto-set to date submitted or current date (read-only)
  status: ProposalStatus;
  isUrgent?: boolean;
  urgentJustification?: string;
  returnFlags?: string[];
  stepRevisionRemarks?: Record<string, string> | null;
  adviserRemarks?: string;

  // 1. Activity title
  title: string;

  // 2. Description
  description: string;

  // 3. Organizer/s
  organizers: string[]; // e.g. ['Student Affairs & Services', 'IT Guild']

  // 4. Objective/s
  objectives: string[];

  // 5. Success indicator/s
  successIndicators: string[];

  // 6. Mechanics
  mechanics: string[]; // Chronological workshop / activity procedures

  // 7. Materials
  materials: string[];

  // 8. Target market
  targetAudience: ProposalTargetAudience;

  // 9. Est. attendance
  estimatedAttendance: string; // e.g. "120 Participants" or "150 BSIT 3rd year"
  estAttendanceCount?: number; // Numeric only (e.g. 120)
  estAttendanceQualifier?: string; // Qualifier (e.g. "participants", "Students", "BSIT 3rd year")

  // 10. Marketing plan
  marketingPlan: string[];

  // 11. Documentation
  documentationPlan: string[];

  // 12. Date & time (and Venue) - single session schedule
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  venueId?: string;
  venueName?: string;
  customVenueName?: string;
  sessions: ProposalSession[];

  // 13. Task list
  tasks: ProposalTask[];

  // 14. Financial projections (6-column STI format)
  financialProjections: FinancialProjections;


  // 7. Approval Chain & Workflow
  approvalChain: ProposalApprovalStep[];
  currentStepIndex: number;
  currentStageIndex?: number;
  sectionRemarks?: ProposalSectionRemark[];

  // Audit metadata
  createdByUid: string;
  createdByName: string;
  createdByEmail: string;
  creatorRole: 'sas_admin' | 'officer' | 'program_head';
  proponents?: string[]; // Array of co-makers / proponents (defaults to maker, expandable)
  organizationId?: string; // If originated by a club
  organizationName?: string;
  createdAt: any;
  updatedAt: any;
  approvedAt?: any;
  activatedAt?: any;
  activatedEventId?: string;
}

export type ProposalFormData = Partial<ActivityProposal>;
