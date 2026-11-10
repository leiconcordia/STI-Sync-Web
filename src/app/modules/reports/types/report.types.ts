import { AcademicLevel, StudentSemester } from '../../students/types/student.types';
import type { EventDocument } from '../../events/types/event.types';
import type { LiquidationDocument } from '../../finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../post-activity-reports/types/par.types';
import type { OrganizationDocument } from '../../organizations/types/organization.types';
import type { OrganizationOfficerDocument } from '../../organizations/hooks/useOrgOfficers';

export type ReportScope = 'ALL' | 'COLLEGE' | 'SHS';

export type ReportTabId =
  | 'OVERVIEW'
  | 'ACTIVITY_PROPOSALS'
  | 'FINANCIAL_LIQUIDATIONS'
  | 'POST_ACTIVITY_REPORTS'
  | 'CLUBS_AND_OFFICERS';

export type AdminReportId =
  | 'STUDENT_ENROLLMENT_DEMOGRAPHICS'
  | 'EVENT_ACCOMPLISHMENT_ATTENDANCE'
  | 'FINANCIAL_LIQUIDATION_BUDGET'
  | 'ORGANIZATION_ACCREDITATION_ROSTER'
  | 'STUDENT_PAYABLES_COLLECTION'
  | 'CERTIFICATE_ISSUANCE_SUMMARY'
  | 'SYSTEM_AUDIT_TRAIL'
  | 'AP_SUMMARY_REPORT'
  | 'FL_LEDGER_REPORT'
  | 'PAR_PORTFOLIO_REPORT'
  | 'OFFICER_MASTER_ROSTER_REPORT';

export type OfficerReportId =
  | 'OFFICER_SEMESTRAL_ACCOMPLISHMENT'
  | 'OFFICER_FINANCIAL_STATEMENT'
  | 'OFFICER_EVENT_ATTENDANCE_ROSTER'
  | 'OFFICER_MEMBERSHIP_DIRECTORY'
  | 'OFFICER_DUES_PAYABLES_TRACKING';

export interface ReportFilterOptions {
  scope: ReportScope;
  academicYear?: string;
  semester?: string;
  startDate?: string;
  endDate?: string;
  organizationId?: string;
  departmentId?: string;
  courseId?: string;
  yearLevel?: string;
}

export interface UniversalFilterState {
  semesterId: string; // 'ALL' or specific semester id or 'ACTIVE'
  academicYear?: string;
  semester?: string;
  organizationId: string; // 'ALL' or specific org id or 'sas'
  scope: ReportScope; // 'ALL' | 'COLLEGE' | 'SHS'
  searchQuery: string;
  startDate?: string;
  endDate?: string;
}

export interface ReportMetadata {
  title: string;
  subtitle: string;
  academicYear?: string;
  semester?: string;
  scope: ReportScope;
  generatedAt: string;
  generatedBy: string;
  organizationName?: string;
  adviserName?: string;
  presidentName?: string;
  treasurerName?: string;
}

export interface ReportKPI {
  label: string;
  value: string | number;
  subtext?: string;
  highlight?: boolean;
}

export interface ReportTableColumn {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface GeneratedReportData {
  id: AdminReportId | OfficerReportId;
  title: string;
  category: 'INSTITUTIONAL' | 'ORGANIZATION';
  metadata: ReportMetadata;
  kpis: ReportKPI[];
  columns: ReportTableColumn[];
  rows: Record<string, string | number>[];
  summaryNotes?: string[];
  signatories?: {
    preparedBy?: { name: string; title: string };
    attestedBy?: { name: string; title: string };
    approvedBy?: { name: string; title: string };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Directory A: Activity Proposals (AP) Schemas
// ─────────────────────────────────────────────────────────────────────────────
export interface APReportRow {
  id: string;
  referenceNo: string;
  title: string;
  organizer: string;
  organizationId: string;
  targetDateVenue: string;
  proposedBudget: number;
  approvedBudget: number;
  signatoryStatus: string;
  stage: string;
  submissionDate: string;
  rawEvent: EventDocument;
}

export interface APAnalyticsSummary {
  kpis: {
    totalProposalsSubmitted: number;
    approvalRate: number; // Percentage (e.g. 85.5)
    averageLeadTimeDays: number; // Days from draft to president approval
    totalProposedBudget: number;
    totalApprovedBudget: number;
    pendingRevisionCount: number;
  };
  charts: {
    monthlyVolume: Array<{ month: string; submitted: number; approved: number }>;
    approvalFunnel: Array<{ stage: string; count: number }>;
  };
  rows: APReportRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Directory B: Financial Liquidations (FL) Schemas
// ─────────────────────────────────────────────────────────────────────────────
export interface FLReportRow {
  id: string;
  liquidationId: string;
  eventTitle: string;
  organization: string;
  organizationId: string;
  disbursedAmount: number;
  totalActualExpense: number;
  surplusDeficit: number;
  orCount: number;
  attachmentsCount: number;
  auditStatus: string;
  daysLapsed: number | string;
  isOverdue: boolean;
  dateSubmitted?: string;
  rawLiquidation: LiquidationDocument;
}

export interface FLAnalyticsSummary {
  kpis: {
    totalDisbursedAdvances: number;
    totalLiquidatedExpenses: number;
    surplusReturned: number;
    budgetVarianceRate: number; // e.g. -4.5%
    unliquidatedAgingCount: number; // concluded activities past the 15-day FL submission deadline
  };
  charts: {
    disbursedVsActual: Array<{ org: string; allocated: number; spent: number }>;
    expenseCategories: Array<{ category: string; amount: number; percentage: number }>;
  };
  rows: FLReportRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Directory C: Post-Activity Reports (PAR) Schemas
// ─────────────────────────────────────────────────────────────────────────────
export interface PARReportRow {
  id: string;
  parCode: string;
  activityName: string;
  dateHeld: string;
  organizer: string;
  organizationId: string;
  targetTurnout: number;
  actualTurnout: number;
  turnoutPercent: number;
  documentationStatus: {
    photosCount: number;
    hasEvaluation: boolean;
    hasCertificates: boolean;
  };
  status: string;
  rating: number;
  rawPAR: PostActivityReportDocument;
}

export interface PARAnalyticsSummary {
  kpis: {
    totalActivitiesConducted: number;
    turnoutAccuracyRate: number; // Actual vs Target %
    totalUniqueStudentAttendees: number;
    parCompletionCompliance: number; // Completed events with submitted PAR %
    overallEventRating: number; // Average rating out of 5
  };
  charts: {
    turnoutVsCapacity: Array<{ eventTitle: string; actual: number; target: number }>;
    engagementByStrandCourse: Array<{ courseStrand: string; count: number }>;
  };
  rows: PARReportRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Directory D: Clubs & Officer Roster Schemas
// ─────────────────────────────────────────────────────────────────────────────
export interface OrgDirectoryRow {
  id: string;
  logoUrl: string | null;
  name: string;
  acronym: string;
  category: string;
  adviserName: string;
  presidentName: string;
  activeMembers: number;
  accreditationStatus: string; // 'Fully Compliant' | 'Conditional' | 'Probationary'
  academicYear: string;
  rawOrg: OrganizationDocument;
}

export interface OfficerRosterRow {
  id: string;
  studentName: string;
  studentId: string;
  organizationName: string;
  organizationAcronym: string;
  organizationId: string;
  positionTitle: string;
  courseAndYear: string;
  email: string;
  status: string;
  rawOfficer: OrganizationOfficerDocument;
}

export interface ClubRosterSummary {
  kpis: {
    totalAccreditedOrganizations: number;
    totalStudentOfficers: number;
    facultyAdvisersAssigned: number;
    complianceScorecard: {
      fullyCompliant: number;
      conditional: number;
      probationary: number;
    };
  };
  charts: {
    clubMembershipDistribution: Array<{ name: string; acronym: string; memberCount: number }>;
    officerDepartmentDistribution: Array<{ department: string; count: number }>;
  };
  orgRows: OrgDirectoryRow[];
  officerRows: OfficerRosterRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Analytics Summary
// ─────────────────────────────────────────────────────────────────────────────
export interface OverviewAnalyticsSummary {
  kpis: {
    totalProposals: number;
    approvedFunding: number;
    totalDisbursed: number;
    totalSpent: number;
    activitiesConducted: number;
    totalAttendees: number;
    recognizedClubs: number;
    activeOfficers: number;
  };
  monthlyTrends: Array<{ month: string; proposals: number; events: number; attendance: number }>;
  orgBudgetStats: Array<{ org: string; allocated: number; spent: number }>;
  programDistribution: Array<{ name: string; value: number; color: string }>;
  recentActivities: Array<{ id: string; title: string; org: string; date: string; status: string }>;
}
