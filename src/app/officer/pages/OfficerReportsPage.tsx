import { ApprovedReportStorage } from '../../modules/reports/components/ApprovedReportStorage';
import { ReportExportModal } from '../../modules/reports/components/ReportExportModal';
import { useState, useMemo } from 'react';
import {
  FileText,
  Download,
  FileSpreadsheet,
  Users,
  CalendarCheck,
  Receipt,
  Award,
  Wallet,
  ChevronRight,
  TrendingUp,
  Building2,
  Search,
  Filter,
  RotateCcw,
  ClipboardCheck,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { TablePagination, usePagination } from '../../components/ui/table-pagination';
import { useOfficerProfile } from '../../auth/hooks/useOfficerProfile';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useOrgOfficers } from '../../modules/organizations/hooks/useOrgOfficers';
import { useOrgMembers } from '../../modules/organizations/hooks/useOrgMembers';
import { useRoles } from '../../modules/roles/hooks/useRoles';
import { useAllEvents } from '../../modules/events/hooks/useEventStream';
import { useAllLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import { useOfficerPARs } from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import { useOrgPayables } from '../../modules/finance/hooks/usePayableStream';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import { useActiveAcademicPeriods, useSemesters } from '../../modules/academic/hooks/useAcademicStream';
import { formatTimestampDate } from '../../modules/students/utils/date.utils';
import {
  GeneratedReportData,
  OfficerReportId,
  ReportFilterOptions,
} from '../../modules/reports/types/report.types';
import {
  generateOfficerAccomplishmentReport,
  generateOfficerFinancialStatement,
  generateOfficerAttendanceRoster,
  generateOfficerDuesTrackingReport,
  generateOrgOfficerListReport,
  generateOrgMemberListReport,
  generateOrgAPLedgerReport,
  generateOrgFLLedgerReport,
  generateOrgPARLedgerReport,
} from '../../modules/reports/services/report-generator.service';
import { exportReportToCSV } from '../../modules/reports/utils/csv-report-builder';
import { exportReportToPDF } from '../../modules/reports/utils/pdf-report-builder';

type OrgLedgerTab = 'ap' | 'fl' | 'par' | 'officers' | 'members';
type FundingFilter = 'ALL' | 'club' | 'school';

export default function OfficerReportsPage() {
  const { profile } = useOfficerProfile();
  const { data: orgs = [] } = useOrganizationStream();
  const { events = [] } = useAllEvents();
  const { liquidations = [] } = useAllLiquidations();
  const { data: students = [] } = useStudents();
  const { data: roles = [] } = useRoles();
  const { data: semesters = [] } = useSemesters();
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();

  // Active Organization
  const activeOrg = useMemo(() => {
    return orgs.find((o) => o.id === profile?.activeOrganizationId) || null;
  }, [orgs, profile]);

  const orgId = activeOrg?.id || null;
  const { officers = [] } = useOrgOfficers(orgId);
  const { members = [] } = useOrgMembers(orgId);
  const { pars = [] } = useOfficerPARs(orgId || undefined);
  const { data: payables = [] } = useOrgPayables(orgId);

  // UI & Filter States
  const [activeTab, setActiveTab] = useState<OrgLedgerTab>('ap');
  const [fundingFilter, setFundingFilter] = useState<FundingFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [termFilter, setTermFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewReport, setPreviewReport] = useState<GeneratedReportData | null>(null);

  const activePeriod =
    activeOrg?.academicLevel === 'SHS' ? activeShsPeriod : activeCollegePeriod || activeShsPeriod;

  const selectedSemesterObj = useMemo(
    () => semesters.find((s) => s.id === termFilter),
    [semesters, termFilter]
  );

  const filterOptions: ReportFilterOptions = useMemo(
    () => ({
      scope: (activeOrg?.academicLevel as any) || 'ALL',
      organizationId: activeOrg?.id,
      academicYear:
        termFilter === 'ALL'
          ? undefined
          : termFilter === 'ACTIVE'
          ? activePeriod?.academicYear
          : selectedSemesterObj?.academicYear,
      semester:
        termFilter === 'ALL'
          ? undefined
          : termFilter === 'ACTIVE'
          ? activePeriod?.semester
          : selectedSemesterObj?.semester,
    }),
    [activeOrg, activePeriod, termFilter, selectedSemesterObj]
  );

  const fundingFilterLabel =
    fundingFilter === 'club'
      ? 'Club Funded'
      : fundingFilter === 'school'
      ? 'School Funded'
      : 'All Funding Sources';

  const isAdviser = Boolean(
    profile?.isAdviser ||
      profile?.activeRoleId?.toLowerCase() === 'adviser' ||
      profile?.activeRoleId?.toLowerCase().includes('adviser')
  );
  const officerName =
    profile?.studentName || (profile as any)?.displayName || (isAdviser ? 'Club Adviser' : 'Officer');
  const presidentName = activeOrg?.presidentName || 'Club President';
  const adviserName =
    (activeOrg as any)?.adviser?.name ||
    activeOrg?.adviserName ||
    (isAdviser ? profile?.studentName || 'Faculty Adviser' : 'Faculty Adviser');

  // Helper: map eventId -> event for fundingSource & metadata inheritance
  const eventMap = useMemo(() => {
    const map = new Map<string, any>();
    events.forEach((ev) => {
      if (ev.id) map.set(ev.id, ev);
    });
    return map;
  }, [events]);

  const roleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach((r) => {
      if (r.id) map.set(r.id, r.name || r.id);
    });
    return map;
  }, [roles]);

  const studentMap = useMemo(() => {
    const map = new Map<string, any>();
    students.forEach((s) => {
      if (s.studentId) map.set(s.studentId, s);
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [students]);

  const resolveFundingType = (rawSource?: string | null): 'club' | 'school' => {
    return rawSource === 'school_budget' ? 'school' : 'club';
  };

  const matchesTerm = (docYear?: string, docSem?: string) => {
    if (termFilter === 'ALL') return true;
    const targetYear =
      termFilter === 'ACTIVE' ? activePeriod?.academicYear : selectedSemesterObj?.academicYear;
    const targetSem =
      termFilter === 'ACTIVE' ? activePeriod?.semester : selectedSemesterObj?.semester;
    if (targetYear && docYear && docYear !== targetYear) return false;
    if (targetSem && docSem && docSem !== targetSem) return false;
    return true;
  };

  const matchesStatus = (rawStatus?: string) => {
    if (statusFilter === 'ALL') return true;
    const s = (rawStatus || '').toLowerCase();
    if (statusFilter === 'approved') {
      return s === 'approved' || s === 'completed' || s === 'concluded' || s === 'liquidated' || s === 'activated';
    }
    if (statusFilter === 'pending') {
      return s === 'pending' || s === 'pending_review' || s === 'under_review' || s === 'submitted' || s === 'pending_adviser_review';
    }
    if (statusFilter === 'returned') {
      return s === 'returned' || s === 'needs_revision';
    }
    if (statusFilter === 'cancelled') {
      return s === 'cancelled' || s === 'rejected' || s === 'voided';
    }
    return true;
  };

  // ── 1. Organization Activity Proposals (AP) ─────────────────────────────────
  const orgAPRows = useMemo(() => {
    if (!orgId) return [];
    const q = searchQuery.trim().toLowerCase();

    return events
      .filter((e) => {
        if ((e as any).isDeleted || (e as any).isArchived) return false;
        const belongsToOrg = e.hostingOrgId === orgId || e.organizationId === orgId;
        if (!belongsToOrg) return false;
        if (!matchesTerm(e.academicYear, e.semester)) return false;

        const fType = resolveFundingType((e as any).fundingSource);
        if (fundingFilter !== 'ALL' && fType !== fundingFilter) return false;

        const statusStr = (e.proposalStatus || (e as any).status || 'pending').toLowerCase();
        if (!matchesStatus(statusStr)) return false;

        if (q) {
          const hay = `${e.title || ''} ${(e as any).referenceNo || ''} ${e.venue || ''} ${statusStr}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((e) => {
        const fType = resolveFundingType((e as any).fundingSource);
        const dateStr = e.sessions?.[0]?.date || (e as any).targetImplementationDate || 'TBD';
        return {
          id: e.id,
          referenceNo: (e as any).referenceNo || `AP-${e.id.slice(0, 6).toUpperCase()}`,
          title: e.title || 'Untitled Activity Proposal',
          fundingType: fType,
          fundingLabel: fType === 'school' ? 'School Funded' : 'Club Funded',
          dateVenue: `${dateStr} · ${e.venue || 'Campus'}`,
          proposedBudget: Number((e as any).totalProposedBudget ?? (e as any).budget ?? 0),
          approvedBudget: Number((e as any).totalApprovedBudget ?? 0),
          status: (e.proposalStatus || (e as any).status || 'pending').toUpperCase(),
        };
      });
  }, [events, orgId, fundingFilter, statusFilter, termFilter, searchQuery, activePeriod, selectedSemesterObj]);

  // ── 2. Organization Financial Liquidations (FL) ─────────────────────────────
  const orgFLRows = useMemo(() => {
    if (!orgId) return [];
    const q = searchQuery.trim().toLowerCase();

    return liquidations
      .filter((l) => {
        if ((l as any).isDeleted || l.status === 'voided') return false;
        if (l.organizationId !== orgId) return false;
        if (!matchesTerm((l as any).academicYear || (l as any).schoolYear, (l as any).semester)) return false;

        const linkedEvent = l.eventId ? eventMap.get(l.eventId) : undefined;
        const fType = resolveFundingType((l as any).fundingSource || linkedEvent?.fundingSource);
        if (fundingFilter !== 'ALL' && fType !== fundingFilter) return false;

        const statusStr = (l.status || 'pending').toLowerCase();
        if (!matchesStatus(statusStr)) return false;

        if (q) {
          const hay = `${l.eventTitle || ''} ${(l as any).referenceNo || ''} ${statusStr}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((l) => {
        const linkedEvent = l.eventId ? eventMap.get(l.eventId) : undefined;
        const fType = resolveFundingType((l as any).fundingSource || linkedEvent?.fundingSource);
        const approvedBudget = Number(
          (l as any).approvedBudget ?? linkedEvent?.totalApprovedBudget ?? (l as any).totalBudget ?? 0
        );
        const actualSpend = Number(l.totalActualSpending ?? (l as any).actualExpenses ?? (l as any).totalAmount ?? 0);
        return {
          id: l.id,
          referenceNo: (l as any).referenceNo || (l as any).referenceNumber || `LF-${l.id.slice(0, 6).toUpperCase()}`,
          eventTitle: l.eventTitle || (l as any).eventName || 'Financial Liquidation',
          fundingType: fType,
          fundingLabel: fType === 'school' ? 'School Funded' : 'Club Funded',
          approvedBudget,
          actualSpend,
          variance: approvedBudget - actualSpend,
          receiptCount: (l as any).receipts?.length || (l as any).items?.length || 0,
          status: (l.status || 'pending').toUpperCase(),
        };
      });
  }, [liquidations, orgId, eventMap, fundingFilter, statusFilter, termFilter, searchQuery, activePeriod, selectedSemesterObj]);

  // ── 3. Organization Post-Activity Reports (PAR) ─────────────────────────────
  const orgPARRows = useMemo(() => {
    if (!orgId) return [];
    const q = searchQuery.trim().toLowerCase();

    return pars
      .filter((p) => {
        if ((p as any).isDeleted) return false;
        const linkedEvent = p.eventId ? eventMap.get(p.eventId) : undefined;
        if (!matchesTerm(linkedEvent?.academicYear, linkedEvent?.semester)) return false;

        const fType = resolveFundingType((p as any).fundingSource || linkedEvent?.fundingSource);
        if (fundingFilter !== 'ALL' && fType !== fundingFilter) return false;

        const statusStr = (p.status || 'under_review').toLowerCase();
        if (!matchesStatus(statusStr)) return false;

        if (q) {
          const hay = `${p.eventTitle || ''} ${p.referenceNo || ''} ${statusStr}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((p) => {
        const linkedEvent = p.eventId ? eventMap.get(p.eventId) : undefined;
        const fType = resolveFundingType((p as any).fundingSource || linkedEvent?.fundingSource);
        const actual = p.attendanceSummary?.attendedCount || linkedEvent?.actualAttendees || 0;
        const target = p.attendanceSummary?.estimatedAttendance || linkedEvent?.expectedAttendees || 0;
        const rating = Number((p as any).evaluationSummary?.averageRating ?? (p as any).averageRating ?? 0);
        return {
          id: p.id,
          referenceNo: p.referenceNo || `PAR-${p.id.slice(0, 6).toUpperCase()}`,
          eventTitle: p.eventTitle || linkedEvent?.title || 'Post-Activity Report',
          fundingType: fType,
          fundingLabel: fType === 'school' ? 'School Funded' : 'Club Funded',
          dateHeld: (p as any).activityDate || linkedEvent?.sessions?.[0]?.date || '—',
          turnout: `${actual} / ${target}`,
          rating: rating > 0 ? `⭐ ${rating.toFixed(1)}` : '—',
          status: (p.status || 'under_review').toUpperCase(),
        };
      });
  }, [pars, orgId, eventMap, fundingFilter, statusFilter, termFilter, searchQuery, activePeriod, selectedSemesterObj]);

  // ── 4. Organization Officer List ────────────────────────────────────────────
  const orgOfficerRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return officers
      .filter((o) => {
        if (!q) return true;
        const pos = roleNameMap.get(o.roleId) || o.roleId || '';
        const hay = `${o.studentName} ${o.studentId} ${pos} ${o.email}`.toLowerCase();
        return hay.includes(q);
      })
      .map((o) => {
        const st = studentMap.get(o.studentId);
        const courseYear = st ? `${st.courseCode || ''} ${st.yearLevel || ''}`.trim() : '—';
        return {
          id: o.id,
          studentId: o.studentId || '—',
          studentName: o.studentName || '—',
          position: roleNameMap.get(o.roleId) || o.roleId || 'Officer',
          courseYear: courseYear || '—',
          email: o.email || st?.email || '—',
          status: o.isActive ? 'Active' : 'Inactive',
        };
      });
  }, [officers, roleNameMap, studentMap, searchQuery]);

  // ── 5. Organization Member List ─────────────────────────────────────────────
  const orgMemberRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members
      .filter((m) => {
        if (!q) return true;
        const hay = `${m.studentName} ${m.studentId} ${m.course || ''} ${m.email || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .map((m) => {
        const st = studentMap.get(m.studentId);
        const courseYear = `${m.course || st?.courseCode || ''} ${m.year || st?.yearLevel || ''}`.trim() || '—';
        return {
          id: m.id,
          studentId: m.studentId || '—',
          studentName: m.studentName || '—',
          courseYear,
          email: m.email || st?.email || '—',
          paymentStatus: m.paymentStatus || 'outstanding',
          dateJoined: m.dateJoined ? formatTimestampDate(m.dateJoined) : '—',
          status: m.status || 'active',
        };
      });
  }, [members, studentMap, searchQuery]);

  // Pagination Hooks for each tab
  const apPagination = usePagination(orgAPRows, 10);
  const flPagination = usePagination(orgFLRows, 10);
  const parPagination = usePagination(orgPARRows, 10);
  const officerPagination = usePagination(orgOfficerRows, 10);
  const memberPagination = usePagination(orgMemberRows, 10);

  // Financial KPI summary for top cards
  const allocatedBudget = activeOrg?.budget || activeOrg?.allocatedBudget || 0;
  const orgPayables = useMemo(() => payables.filter((p) => p.organizationId === orgId), [payables, orgId]);
  const totalDuesCollected = orgPayables
    .filter((p) => (p.status === 'paid' || p.paymentStatus === 'PAID') && p.type === 'dues')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalEventFeesCollected = orgPayables
    .filter((p) => (p.status === 'paid' || p.paymentStatus === 'PAID') && p.type === 'event_fee')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalLiquidated = orgFLRows
    .filter((l) => l.status === 'APPROVED' || l.status === 'LIQUIDATED')
    .reduce((sum, l) => sum + l.actualSpend, 0);
  const netCashBalance = allocatedBudget + totalDuesCollected + totalEventFeesCollected - totalLiquidated;

  const formatPHP = (val: number) =>
    `₱${(Number(val) || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // ── Export Builders ─────────────────────────────────────────────────────────
  const buildActiveTabReport = (tab: OrgLedgerTab): GeneratedReportData | null => {
    if (!activeOrg) return null;
    switch (tab) {
      case 'ap':
        return generateOrgAPLedgerReport(
          activeOrg,
          orgAPRows,
          filterOptions,
          fundingFilterLabel,
          officerName,
          presidentName,
          adviserName
        );
      case 'fl':
        return generateOrgFLLedgerReport(
          activeOrg,
          orgFLRows,
          filterOptions,
          fundingFilterLabel,
          officerName,
          presidentName,
          adviserName
        );
      case 'par':
        return generateOrgPARLedgerReport(
          activeOrg,
          orgPARRows,
          filterOptions,
          fundingFilterLabel,
          officerName,
          presidentName,
          adviserName
        );
      case 'officers':
        return generateOrgOfficerListReport(
          activeOrg,
          orgOfficerRows,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
      case 'members':
        return generateOrgMemberListReport(
          activeOrg,
          orgMemberRows,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
    }
  };

  const handleExportTabCSV = (tab: OrgLedgerTab) => {
    const rep = buildActiveTabReport(tab);
    if (rep) exportReportToCSV(rep);
  };

  const handlePreviewTabReport = (tab: OrgLedgerTab) => {
    const rep = buildActiveTabReport(tab);
    if (rep) setPreviewReport(rep);
  };

  // Official SAO Submission Cards
  const handleOpenOfficialReport = (id: OfficerReportId) => {
    if (!activeOrg) return;
    let rep: GeneratedReportData | null = null;
    switch (id) {
      case 'OFFICER_SEMESTRAL_ACCOMPLISHMENT':
        rep = generateOfficerAccomplishmentReport(
          activeOrg,
          events,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
        break;
      case 'OFFICER_FINANCIAL_STATEMENT':
        rep = generateOfficerFinancialStatement(
          activeOrg,
          liquidations,
          payables,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
        break;
      case 'OFFICER_EVENT_ATTENDANCE_ROSTER':
        rep = generateOfficerAttendanceRoster(
          activeOrg,
          events,
          students,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
        break;
      case 'OFFICER_OFFICERS_ROSTER':
        rep = generateOrgOfficerListReport(
          activeOrg,
          orgOfficerRows,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
        break;
      case 'OFFICER_MEMBERSHIP_DIRECTORY':
        rep = generateOrgMemberListReport(
          activeOrg,
          orgMemberRows,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
        break;
      case 'OFFICER_DUES_PAYABLES_TRACKING':
        rep = generateOfficerDuesTrackingReport(
          activeOrg,
          payables,
          filterOptions,
          officerName,
          presidentName,
          adviserName
        );
        break;
    }
    if (rep) setPreviewReport(rep);
  };

  const fundingBadge = (type: 'club' | 'school') =>
    type === 'school' ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#003B73] border border-blue-200 whitespace-nowrap">
        School Funded
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
        Club Funded
      </span>
    );

  return (
    <div className="space-y-6 text-left">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-gray-500 text-sm font-medium">
            Filter and export your organization&apos;s Officer List, Member List, Activity Proposals (AP), Financial Liquidations (FL), and Post-Activity Reports (PAR).
          </p>
        </div>

        {activeOrg && (
          <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-[#001A4D]">
            <Building2 className="w-4 h-4 text-[#0E4EBD]" />
            <div>
              <span className="text-[10px] text-gray-500 font-bold block uppercase tracking-wider">
                Active Organization
              </span>
              <span className="text-xs font-bold">{activeOrg.name}</span>
            </div>
          </div>
        )}
      </div>

      <ApprovedReportStorage key={profile?.activeOrganizationId || 'none'} orgId={profile?.activeOrganizationId || ''} />

      {/* ── Organization Operational KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E0E0E0] shadow-xs">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#0E4EBD] flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Officers & Members</p>
              <h3 className="text-2xl font-bold text-[#001A4D]">
                {orgOfficerRows.length} / {orgMemberRows.length}
              </h3>
              <p className="text-[11px] text-gray-400">Officers · Registered Members</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E0E0E0] shadow-xs">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center text-green-600 flex-shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">AP & PAR Records</p>
              <h3 className="text-2xl font-bold text-[#001A4D]">
                {orgAPRows.length} / {orgPARRows.length}
              </h3>
              <p className="text-[11px] text-green-600 font-medium">Filtered by {fundingFilterLabel}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E0E0E0] shadow-xs">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Ending Cash Balance</p>
              <h3 className="text-2xl font-bold text-[#001A4D]">{formatPHP(netCashBalance)}</h3>
              <p className="text-[11px] text-purple-600 font-medium">Net Cash on Hand</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E0E0E0] shadow-xs">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">Liquidated Funds</p>
              <h3 className="text-2xl font-bold text-[#001A4D]">{formatPHP(totalLiquidated)}</h3>
              <p className="text-[11px] text-amber-600 font-medium">{orgFLRows.length} FL Claims</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Dynamic Organization Filter Bar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activity title, ref #, officer name, student ID, or member..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-[#0E4EBD] font-medium text-gray-800"
            />
          </div>

          {/* Club Funded vs School Funded Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-gray-500 uppercase mr-1">Funding:</span>
            <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200">
              {(
                [
                  { id: 'ALL', label: 'All Funding' },
                  { id: 'club', label: 'Club Funded' },
                  { id: 'school', label: 'School Funded' },
                ] as { id: FundingFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFundingFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    fundingFilter === opt.id
                      ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 text-xs">
          {/* Term Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 font-semibold">Term:</span>
            <select
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-[#001A4D]"
            >
              <option value="ALL">All Semesters</option>
              <option value="ACTIVE">Current Active Term</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.academicLevel})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-500 font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:border-[#001A4D]"
            >
              <option value="ALL">All Statuses</option>
              <option value="approved">Approved / Liquidated</option>
              <option value="pending">Pending / Under Review</option>
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled / Rejected</option>
            </select>
          </div>

          {(fundingFilter !== 'ALL' || statusFilter !== 'ALL' || termFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setFundingFilter('ALL');
                setStatusFilter('ALL');
                setTermFilter('ALL');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Member Payables & Dues Tracker (Select Payable Name -> Paid / Not Paid Yet) ── */}
      {activeOrg && (
        <OfficerPayablesReportSection
          org={activeOrg}
          payables={payables}
          filter={filterOptions}
          officerName={officerName}
          presidentName={presidentName}
          adviserName={adviserName}
        />
      )}

      {/* ── Tabbed Organization Ledgers & Rosters ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
            {(
              [
                { id: 'ap', label: `Activity Proposals (${orgAPRows.length})`, icon: FileText },
                { id: 'fl', label: `Financial Liquidations (${orgFLRows.length})`, icon: Wallet },
                { id: 'par', label: `Post-Activity Reports (${orgPARRows.length})`, icon: ClipboardCheck },
                { id: 'officers', label: `Officer List (${orgOfficerRows.length})`, icon: ShieldCheck },
                { id: 'members', label: `Member List (${orgMemberRows.length})`, icon: Users },
              ] as { id: OrgLedgerTab; label: string; icon: any }[]
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === t.id
                      ? 'bg-[#001A4D] text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportTabCSV(activeTab)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={() => handlePreviewTabReport(activeTab)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#001A4D] text-white hover:bg-[#0E4EBD] transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Preview & Export PDF/CSV
            </button>
          </div>
        </div>

        {/* TAB 1: ACTIVITY PROPOSALS */}
        {activeTab === 'ap' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3 px-4">Ref #</th>
                    <th className="py-3 px-4">Activity Title</th>
                    <th className="py-3 px-4">Funding Source</th>
                    <th className="py-3 px-4">Date & Venue</th>
                    <th className="py-3 px-4 text-right">Proposed Budget</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {apPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400">
                        No Activity Proposals match the current filters.
                      </td>
                    </tr>
                  ) : (
                    apPagination.paginatedItems.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-50/30">
                        <td className="py-3 px-4 font-mono font-bold text-[#003B73]">{row.referenceNo}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{row.title}</td>
                        <td className="py-3 px-4">{fundingBadge(row.fundingType)}</td>
                        <td className="py-3 px-4 text-gray-600">{row.dateVenue}</td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">{formatPHP(row.proposedBudget)}</td>
                        <td className="py-3 px-4 font-bold text-gray-700">{row.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={apPagination.currentPage}
              totalPages={apPagination.totalPages}
              pageSize={apPagination.pageSize}
              totalItems={apPagination.totalItems}
              onPageChange={apPagination.setCurrentPage}
              onPageSizeChange={apPagination.setPageSize}
            />
          </>
        )}

        {/* TAB 2: FINANCIAL LIQUIDATIONS */}
        {activeTab === 'fl' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3 px-4">Ref #</th>
                    <th className="py-3 px-4">Activity Title</th>
                    <th className="py-3 px-4">Funding Source</th>
                    <th className="py-3 px-4 text-right">Approved Budget</th>
                    <th className="py-3 px-4 text-right">Actual Spend</th>
                    <th className="py-3 px-4 text-right">Variance</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {flPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-400">
                        No Financial Liquidations match the current filters.
                      </td>
                    </tr>
                  ) : (
                    flPagination.paginatedItems.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-50/30">
                        <td className="py-3 px-4 font-mono font-bold text-[#003B73]">{row.referenceNo}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{row.eventTitle}</td>
                        <td className="py-3 px-4">{fundingBadge(row.fundingType)}</td>
                        <td className="py-3 px-4 text-right text-gray-700">{formatPHP(row.approvedBudget)}</td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">{formatPHP(row.actualSpend)}</td>
                        <td
                          className={`py-3 px-4 text-right font-bold ${
                            row.variance >= 0 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {row.variance >= 0 ? '+' : ''}
                          {formatPHP(row.variance)}
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-700">{row.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={flPagination.currentPage}
              totalPages={flPagination.totalPages}
              pageSize={flPagination.pageSize}
              totalItems={flPagination.totalItems}
              onPageChange={flPagination.setCurrentPage}
              onPageSizeChange={flPagination.setPageSize}
            />
          </>
        )}

        {/* TAB 3: POST-ACTIVITY REPORTS */}
        {activeTab === 'par' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3 px-4">PAR Code</th>
                    <th className="py-3 px-4">Activity Title</th>
                    <th className="py-3 px-4">Funding Source</th>
                    <th className="py-3 px-4">Date Held</th>
                    <th className="py-3 px-4 text-right">Turnout (Actual / Est.)</th>
                    <th className="py-3 px-4 text-center">Rating</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {parPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-400">
                        No Post-Activity Reports match the current filters.
                      </td>
                    </tr>
                  ) : (
                    parPagination.paginatedItems.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-50/30">
                        <td className="py-3 px-4 font-mono font-bold text-[#003B73]">{row.referenceNo}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{row.eventTitle}</td>
                        <td className="py-3 px-4">{fundingBadge(row.fundingType)}</td>
                        <td className="py-3 px-4 text-gray-600">{row.dateHeld}</td>
                        <td className="py-3 px-4 text-right font-bold text-gray-800">{row.turnout}</td>
                        <td className="py-3 px-4 text-center font-bold text-amber-600">{row.rating}</td>
                        <td className="py-3 px-4 font-bold text-gray-700">{row.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={parPagination.currentPage}
              totalPages={parPagination.totalPages}
              pageSize={parPagination.pageSize}
              totalItems={parPagination.totalItems}
              onPageChange={parPagination.setCurrentPage}
              onPageSizeChange={parPagination.setPageSize}
            />
          </>
        )}

        {/* TAB 4: OFFICER LIST */}
        {activeTab === 'officers' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3 px-4">Student ID</th>
                    <th className="py-3 px-4">Officer Name</th>
                    <th className="py-3 px-4">Position / Role</th>
                    <th className="py-3 px-4">Course & Year</th>
                    <th className="py-3 px-4">Institutional Email</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {officerPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400">
                        No active officers found for this organization.
                      </td>
                    </tr>
                  ) : (
                    officerPagination.paginatedItems.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-50/30">
                        <td className="py-3 px-4 font-mono font-bold text-[#003B73]">{row.studentId}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{row.studentName}</td>
                        <td className="py-3 px-4 font-semibold text-gray-800">{row.position}</td>
                        <td className="py-3 px-4 text-gray-600">{row.courseYear}</td>
                        <td className="py-3 px-4 text-gray-600">{row.email}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={officerPagination.currentPage}
              totalPages={officerPagination.totalPages}
              pageSize={officerPagination.pageSize}
              totalItems={officerPagination.totalItems}
              onPageChange={officerPagination.setCurrentPage}
              onPageSizeChange={officerPagination.setPageSize}
            />
          </>
        )}

        {/* TAB 5: MEMBER LIST */}
        {activeTab === 'members' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3 px-4">Student ID</th>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Course & Year</th>
                    <th className="py-3 px-4">Institutional Email</th>
                    <th className="py-3 px-4">Dues</th>
                    <th className="py-3 px-4">Date Joined</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {memberPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-gray-400">
                        No registered members found for this organization.
                      </td>
                    </tr>
                  ) : (
                    memberPagination.paginatedItems.map((row) => (
                      <tr key={row.id} className="hover:bg-blue-50/30">
                        <td className="py-3 px-4 font-mono font-bold text-[#003B73]">{row.studentId}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{row.studentName}</td>
                        <td className="py-3 px-4 text-gray-600">{row.courseYear}</td>
                        <td className="py-3 px-4 text-gray-600">{row.email}</td>
                        <td className="py-3 px-4 font-bold uppercase text-gray-700">{row.paymentStatus}</td>
                        <td className="py-3 px-4 text-gray-600">{row.dateJoined}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={memberPagination.currentPage}
              totalPages={memberPagination.totalPages}
              pageSize={memberPagination.pageSize}
              totalItems={memberPagination.totalItems}
              onPageChange={memberPagination.setCurrentPage}
              onPageSizeChange={memberPagination.setPageSize}
            />
          </>
        )}
      </div>

      {/* ── Official Organization Reports for SAO Submission ── */}
      <div>
        <div className="mb-3">
          <h3 className="text-lg font-bold text-[#001A4D]">Official Organization Reports for SAO Submission</h3>
          <p className="text-xs text-gray-500">
            Generate printable reports with automated sign-off signatures for your President and Adviser.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              id: 'OFFICER_OFFICERS_ROSTER' as OfficerReportId,
              title: 'Official Officer List & Board Roster',
              desc: 'Certified roster of active student officers, positions, and institutional emails.',
              icon: ShieldCheck,
              color: 'text-[#003B73]',
              bg: 'bg-blue-50',
            },
            {
              id: 'OFFICER_MEMBERSHIP_DIRECTORY' as OfficerReportId,
              title: 'Official Membership Directory',
              desc: 'Complete roster of registered organization members and dues standing.',
              icon: Users,
              color: 'text-cyan-700',
              bg: 'bg-cyan-50',
            },
            {
              id: 'OFFICER_SEMESTRAL_ACCOMPLISHMENT' as OfficerReportId,
              title: 'Semestral Accomplishment Report',
              desc: 'Official end-of-term summary of conducted events, objectives, and participation.',
              icon: Award,
              color: 'text-[#0E4EBD]',
              bg: 'bg-blue-50',
            },
            {
              id: 'OFFICER_FINANCIAL_STATEMENT' as OfficerReportId,
              title: 'Financial Statement & Cash Flow',
              desc: 'Ledger of revenues, allocated grants, dues, liquidated expenses, and ending balance.',
              icon: Wallet,
              color: 'text-purple-600',
              bg: 'bg-purple-50',
            },
            {
              id: 'OFFICER_EVENT_ATTENDANCE_ROSTER' as OfficerReportId,
              title: 'Event Attendance & Participant Log',
              desc: 'Verified attendee roll sheet with Time-In and Time-Out timestamps.',
              icon: CalendarCheck,
              color: 'text-green-600',
              bg: 'bg-green-50',
            },
            {
              id: 'OFFICER_DUES_PAYABLES_TRACKING' as OfficerReportId,
              title: 'Member Dues & Payables Tracking',
              desc: 'Detailed tracking of settled membership dues and outstanding balances.',
              icon: TrendingUp,
              color: 'text-amber-600',
              bg: 'bg-amber-50',
            },
          ].map((rep) => {
            const Icon = rep.icon;
            return (
              <Card
                key={rep.id}
                onClick={() => handleOpenOfficialReport(rep.id)}
                className="border-gray-200 hover:border-[#0E4EBD] hover:shadow-md transition-all cursor-pointer group rounded-2xl flex flex-col justify-between"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`w-10 h-10 rounded-xl ${rep.bg} flex items-center justify-center ${rep.color} group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 uppercase">
                      SAO Ready
                    </span>
                  </div>
                  <h4 className="font-bold text-[#001A4D] text-sm group-hover:text-[#0E4EBD] transition-colors line-clamp-1">
                    {rep.title}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{rep.desc}</p>
                </CardContent>

                <div className="px-5 py-3 bg-gray-50/80 border-t border-gray-100 rounded-b-2xl flex items-center justify-between text-xs font-bold text-[#0E4EBD] group-hover:bg-blue-50/50 transition-colors">
                  <span>Generate Report</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Shared Non-Overlapping PDF & CSV Export Modal ── */}
      {previewReport?.id === 'OFFICER_DUES_PAYABLES_TRACKING' && activeOrg ? (
        <OfficerPayableReportModal
          org={activeOrg}
          payables={payables}
          filter={filterOptions}
          officerName={officerName}
          presidentName={presidentName}
          adviserName={adviserName}
          onClose={() => setPreviewReport(null)}
        />
      ) : (
        <ReportExportModal
          report={previewReport}
          isOpen={Boolean(previewReport)}
          onClose={() => setPreviewReport(null)}
        />
      )}
    </div>
  );
}

interface OfficerPayableWidgetProps {
  org: any;
  payables: any[];
  filter: any;
  officerName: string;
  presidentName: string;
  adviserName: string;
  initialPayableName?: string;
  initialStatusFilter?: 'ALL' | 'PAID' | 'UNPAID';
  onClose?: () => void;
}

function getOfficerPayableName(p: any): string {
  return (p.eventName || p.title || p.description || p.feeTitle || 'Club Payable').toString().trim();
}

function isOfficerPayablePaid(p: any): boolean {
  const st = (p.status || p.paymentStatus || '').toString().trim().toLowerCase();
  if (st === 'refunded') return false;
  if (st === 'paid') return true;
  const assigned = Number(p.assignedAmount ?? p.amount ?? 0);
  const paid = Number(p.paidAmount ?? 0);
  const balance = p.balance !== undefined ? Number(p.balance) : Math.max(0, assigned - paid);
  return assigned > 0 && balance <= 0;
}

function exportReportRowsToCSV(report: any, fileSuffix: string) {
  const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const headers = (report.columns || []).map((c: any) => escapeCsv(c.header)).join(',');
  const body = (report.rows || []).map((row: any) =>
    (report.columns || []).map((c: any) => escapeCsv(row[c.key])).join(',')
  );
  const meta = [
    escapeCsv(report.metadata?.title || report.title),
    escapeCsv(report.metadata?.subtitle || ''),
    escapeCsv(`Generated: ${report.metadata?.generatedAt || new Date().toLocaleString()}`),
    '',
  ];
  const csv = [...meta, headers, ...body].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function OfficerPayablesReportSection({
  org,
  payables,
  filter,
  officerName,
  presidentName,
  adviserName,
}: OfficerPayableWidgetProps) {
  const { data: studentsList = [] } = useStudents();
  const [selectedPayableName, setSelectedPayableName] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL');
  const [search, setSearch] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);

  const orgPayables = useMemo(
    () => (payables || []).filter((p: any) => p.organizationId === org?.id),
    [payables, org?.id]
  );

  const payableOptions = useMemo(() => {
    const map = new Map<string, { name: string; paid: number; unpaid: number }>();
    orgPayables.forEach((p: any) => {
      const name = getOfficerPayableName(p);
      const entry = map.get(name) || { name, paid: 0, unpaid: 0 };
      const st = (p.status || '').toString().toLowerCase();
      if (st !== 'refunded') {
        if (isOfficerPayablePaid(p)) entry.paid += 1;
        else entry.unpaid += 1;
      }
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orgPayables]);

  const generated = useMemo(
    () =>
      generateOfficerDuesTrackingReport(
        org,
        payables,
        filter,
        officerName,
        presidentName,
        adviserName,
        { payableName: selectedPayableName, paymentStatusFilter: statusFilter },
        studentsList
      ),
    [org, payables, filter, officerName, presidentName, adviserName, selectedPayableName, statusFilter, studentsList]
  );

  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return generated.rows;
    return generated.rows.filter((r: any) =>
      `${r.studentId} ${r.studentName} ${r.yearSection} ${r.feeTitle} ${r.status}`
        .toLowerCase()
        .includes(q)
    );
  }, [generated.rows, search]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#001A4D]/10 flex items-center justify-center text-[#001A4D]">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#001A4D]">
              Club Payables Collection Roster (Paid vs. Not Paid Yet)
            </h3>
            <p className="text-xs text-gray-500">
              Select a specific payable to review and export students who already paid vs. not paid yet.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={generated.rows.length === 0}
            onClick={() => {
              const safeName =
                selectedPayableName === 'ALL'
                  ? 'All_Payables'
                  : selectedPayableName.replace(/[^a-zA-Z0-9]/g, '_');
              exportReportRowsToCSV(generated, `Payables_${safeName}`);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#001A4D] text-white hover:bg-[#0E4EBD] transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Preview &amp; Export PDF/CSV
          </button>
        </div>
      </div>

      <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-600">Payable Name:</span>
            <select
              value={selectedPayableName}
              onChange={(e) => setSelectedPayableName(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg font-semibold text-gray-800 outline-none focus:border-[#0E4EBD] cursor-pointer"
            >
              <option value="ALL">All Payables ({orgPayables.length})</option>
              {payableOptions.map((opt) => (
                <option key={opt.name} value={opt.name}>
                  {opt.name} ({opt.paid} Paid / {opt.unpaid} Not Paid Yet)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
            {(
              [
                { id: 'ALL', label: 'All Students' },
                { id: 'PAID', label: 'Paid Only' },
                { id: 'UNPAID', label: 'Not Paid Yet Only' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  statusFilter === opt.id
                    ? opt.id === 'PAID'
                      ? 'bg-emerald-600 text-white'
                      : opt.id === 'UNPAID'
                        ? 'bg-red-600 text-white'
                        : 'bg-[#001A4D] text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name or ID..."
            className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:bg-white focus:border-[#0E4EBD]"
          />
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-gray-50/40 border-b border-gray-100">
        {generated.kpis.map((kpi: any, i: number) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl px-3.5 py-2.5">
            <p className="text-[10px] font-bold text-gray-500 uppercase">{kpi.label}</p>
            <p className="text-base font-bold text-[#001A4D] mt-0.5">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Preview Table */}
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="py-2.5 px-4">Student ID</th>
              <th className="py-2.5 px-4">Student Name</th>
              <th className="py-2.5 px-4">Year / Section</th>
              <th className="py-2.5 px-4">Payable Name</th>
              <th className="py-2.5 px-4 text-right">Assigned</th>
              <th className="py-2.5 px-4 text-right">Paid</th>
              <th className="py-2.5 px-4 text-right">Balance</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Date Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-400">
                  No student payable records match the selected Payable Name or Payment Status.
                </td>
              </tr>
            ) : (
              displayedRows.slice(0, 50).map((row: any, idx: number) => {
                const isPaidRow = row.status === 'PAID';
                const isRefundedRow = row.status === 'REFUNDED';
                return (
                  <tr key={`${row.studentId}-${idx}`} className="hover:bg-blue-50/30">
                    <td className="py-2.5 px-4 font-mono font-bold text-[#003B73] whitespace-nowrap">
                      {row.studentId}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-gray-900 whitespace-nowrap">
                      {row.studentName}
                    </td>
                    <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">
                      {row.yearSection}
                    </td>
                    <td className="py-2.5 px-4 text-gray-800">{row.feeTitle}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                      {row.assigned}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700 whitespace-nowrap">
                      {row.paid}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-rose-700 whitespace-nowrap">
                      {row.balance}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isPaidRow
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isRefundedRow
                              ? 'bg-gray-100 text-gray-600 border-gray-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-gray-500 whitespace-nowrap">{row.datePaid}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {displayedRows.length > 50 && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
          Showing first 50 of {displayedRows.length} matching records. Open Preview or Export CSV/PDF for all rows.
        </div>
      )}

      {showModal && (
        <OfficerPayableReportModal
          org={org}
          payables={payables}
          filter={filter}
          officerName={officerName}
          presidentName={presidentName}
          adviserName={adviserName}
          initialPayableName={selectedPayableName}
          initialStatusFilter={statusFilter}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function OfficerPayableReportModal({
  org,
  payables,
  filter,
  officerName,
  presidentName,
  adviserName,
  initialPayableName = 'ALL',
  initialStatusFilter = 'ALL',
  onClose,
}: OfficerPayableWidgetProps) {
  const { data: studentsList = [] } = useStudents();
  const [selectedPayableName, setSelectedPayableName] = useState<string>(initialPayableName);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID'>(initialStatusFilter);
  const [exportingPdf, setExportingPdf] = useState(false);

  const orgPayables = useMemo(
    () => (payables || []).filter((p: any) => p.organizationId === org?.id),
    [payables, org?.id]
  );

  const payableOptions = useMemo(() => {
    const map = new Map<string, { name: string; paid: number; unpaid: number }>();
    orgPayables.forEach((p: any) => {
      const name = getOfficerPayableName(p);
      const entry = map.get(name) || { name, paid: 0, unpaid: 0 };
      const st = (p.status || '').toString().toLowerCase();
      if (st !== 'refunded') {
        if (isOfficerPayablePaid(p)) entry.paid += 1;
        else entry.unpaid += 1;
      }
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orgPayables]);

  const report = useMemo(
    () =>
      generateOfficerDuesTrackingReport(
        org,
        payables,
        filter,
        officerName,
        presidentName,
        adviserName,
        { payableName: selectedPayableName, paymentStatusFilter: statusFilter },
        studentsList
      ),
    [org, payables, filter, officerName, presidentName, adviserName, selectedPayableName, statusFilter, studentsList]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white border-b-4 border-[#FFD41C] shrink-0">
          <div>
            <h2 className="text-base font-bold">{report.metadata.title}</h2>
            <p className="text-xs text-blue-200 mt-0.5">{report.metadata.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg hover:bg-white/10 text-blue-100 hover:text-white cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Interactive Payable Filter Controls */}
        <div className="px-6 py-3 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#001A4D]">Select Payable:</span>
            <select
              value={selectedPayableName}
              onChange={(e) => setSelectedPayableName(e.target.value)}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg font-semibold text-gray-800 outline-none focus:border-[#0E4EBD] cursor-pointer"
            >
              <option value="ALL">All Payables ({orgPayables.length})</option>
              {payableOptions.map((opt) => (
                <option key={opt.name} value={opt.name}>
                  {opt.name} ({opt.paid} Paid / {opt.unpaid} Not Paid Yet)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200">
            {(
              [
                { id: 'ALL', label: 'All Students' },
                { id: 'PAID', label: 'Paid Only' },
                { id: 'UNPAID', label: 'Not Paid Yet Only' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                  statusFilter === opt.id
                    ? opt.id === 'PAID'
                      ? 'bg-emerald-600 text-white'
                      : opt.id === 'UNPAID'
                        ? 'bg-red-600 text-white'
                        : 'bg-[#001A4D] text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {report.kpis.map((kpi: any, idx: number) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase">{kpi.label}</p>
                <p className="text-lg font-bold text-[#001A4D] mt-0.5">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-gray-100 border-b border-gray-200 text-[10px] font-bold uppercase text-gray-600">
                  <tr>
                    {report.columns.map((col: any) => (
                      <th key={col.key} className="py-2.5 px-3 whitespace-nowrap">
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.rows.length === 0 ? (
                    <tr>
                      <td colSpan={report.columns.length} className="py-8 text-center text-gray-400">
                        No students match the selected payable and payment status filter.
                      </td>
                    </tr>
                  ) : (
                    report.rows.map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="hover:bg-blue-50/30">
                        {report.columns.map((col: any) => (
                          <td key={col.key} className="py-2 px-3 whitespace-nowrap text-gray-800">
                            {col.key === 'status' ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  row.status === 'PAID'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : row.status === 'REFUNDED'
                                      ? 'bg-gray-100 text-gray-600'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {row.status}
                              </span>
                            ) : (
                              row[col.key]
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {report.signatories && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-200 text-xs">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[10px] uppercase font-bold text-gray-400">Prepared By</p>
                <p className="font-bold text-gray-900 mt-1">{report.signatories.preparedBy?.name}</p>
                <p className="text-gray-500">{report.signatories.preparedBy?.title}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[10px] uppercase font-bold text-gray-400">Attested By</p>
                <p className="font-bold text-gray-900 mt-1">{report.signatories.attestedBy?.name}</p>
                <p className="text-gray-500">{report.signatories.attestedBy?.title}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[10px] uppercase font-bold text-gray-400">Approved By</p>
                <p className="font-bold text-gray-900 mt-1">{report.signatories.approvedBy?.name}</p>
                <p className="text-gray-500">{report.signatories.approvedBy?.title}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-100 rounded-xl text-xs font-bold text-gray-700 cursor-pointer"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={report.rows.length === 0}
              onClick={() => {
                const safeName =
                  selectedPayableName === 'ALL'
                    ? 'All_Payables'
                    : selectedPayableName.replace(/[^a-zA-Z0-9]/g, '_');
                exportReportRowsToCSV(report, `Payables_${safeName}`);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-700 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Export CSV / Excel
            </button>
            <button
              type="button"
              disabled={exportingPdf || report.rows.length === 0}
              onClick={async () => {
                setExportingPdf(true);
                try {
                  await exportReportToPDF(report);
                } finally {
                  setExportingPdf(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <Download className="w-4 h-4 text-[#FFD41C]" />
              {exportingPdf ? 'Generating PDF...' : 'Export Official PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
