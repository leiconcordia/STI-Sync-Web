import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  CalendarCheck,
  Receipt,
  Building2,
  TrendingUp,
  UserCheck,
  Users,
  Sparkles,
  CheckCircle2,
  FileCheck,
  FileText,
  CalendarDays,
  FileCheck2,
  MapPin,
  Clock,
  ArrowRight,
  AlertTriangle,
  Bell,
  Shield,
  ChevronLeft,
} from "lucide-react";
import { MetricCard } from "../components/dashboard/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import CreateProposalModal from "../../modules/activity-proposals/components/CreateProposalModal";
import { CalendarAndActivityMonitorPane } from "../components/dashboard/CalendarAndActivityMonitorPane";
import { SendLiquidationReminderModal } from "../../modules/finance/components/SendLiquidationReminderModal";
import {
  resolveCleanOrgName,
  isSasCreatedEvent,
  isEventLiquidationExempt,
} from "../../modules/events/utils/organization-display.utils";
import { isActivityConcluded } from "../../modules/events/utils/activity-compliance.utils";

import { useAdviserProfile } from "../../modules/auth/hooks/useAdviserProfile";
import { useStudents } from "../../modules/students/hooks/useStudentStream";
import { useAllEvents } from "../../modules/events/hooks/useEventStream";
import { useAllLiquidations } from "../../modules/finance/hooks/useLiquidationStream";
import { useOrganizationStream } from "../../modules/organizations/hooks/useOrganizationStream";
import { formatCurrency } from "../../utils/currency";
import { useIncomingDocuments } from "../../modules/documents/hooks/useDocumentStream";
import { useAdminPARs } from "../../modules/post-activity-reports/hooks/usePostActivityReportStream";
import { getMillis, formatTimestampDate } from "../../modules/students/utils/date.utils";
import { formatAppDate, format12HourTime } from "../../utils/date";
import { useSemesters, useActiveAcademicPeriods } from "../../modules/academic/hooks/useAcademicStream";
import { useMiscFeeConfigs } from "../../modules/finance/hooks/useMiscFeeStream";
import {
  buildAvailableSchoolYears,
  computeDashboardKpiCounts,
  resolveDefaultSchoolYearFilter,
  resolveUnifiedActiveAcademicTerm,
} from "../../modules/workflow/utils/academic-period-filter.utils";

interface ApprovalItem {
  id: string;
  rawId: string;
  domain: "student" | "activity" | "liquidation" | "document" | "par";
  domainLabel: string;
  title: string;
  subtitle: string;
  timestampMs: number;
  dateFormatted: string;
  route: string;
  badgeColor: string;
  fundingBadge: string;
  fundingBadgeClass: string;
  actionLabel: string;
  actionButtonClass: string;
  isUrgent?: boolean;
}

function isOrganizationSubmission(
  orgId?: string | null,
  orgName?: string | null,
  createdByRole?: string | null
): boolean {
  const normalizedRole = (createdByRole || "").toLowerCase().trim();
  if (
    ["sas", "sao", "admin", "sas_admin", "sao_admin", "sao_head", "super_admin"].includes(
      normalizedRole
    )
  ) {
    return false;
  }
  const normalizedId = (orgId || "").trim().toLowerCase();
  if (
    ["sas", "sao", "sas_admin", "sao_admin", "admin", "institutional", "sao_office"].includes(
      normalizedId
    )
  ) {
    return false;
  }

  const normalizedName = (orgName || "").trim().toLowerCase();
  if (
    normalizedName === "sas" ||
    normalizedName === "sao" ||
    normalizedName.includes("student affairs") ||
    normalizedName.includes("(sas)") ||
    normalizedName.includes("(sao)") ||
    normalizedName === "sti sas"
  ) {
    return false;
  }

  return Boolean(normalizedId || normalizedName);
}

function hasAlreadyBeenReleasedToSignatories(item: any, isSchoolFunded: boolean): boolean {
  if (!item) return false;

  if (item.sasVettedAt) return true;

  if (Array.isArray(item.proposalHistory) && item.proposalHistory.length > 0) {
    let lastResetIdx = -1;
    let lastReleaseIdx = -1;
    item.proposalHistory.forEach((h: any, idx: number) => {
      if (["withdrawn", "submitted", "resubmitted", "returned"].includes(h?.action)) {
        lastResetIdx = idx;
      }
      if (h?.action === "sas_vetted_and_released") {
        lastReleaseIdx = idx;
      }
    });
    if (lastReleaseIdx > lastResetIdx && lastReleaseIdx !== -1) {
      return true;
    }
  }

  const chain: any[] = Array.isArray(item.approvalChain) ? item.approvalChain : [];
  if (chain.length > 0) {
    const isSasStep = (s: any) =>
      s?.role === "sas_head" ||
      s?.role === "sas_coordinator" ||
      s?.signatoryUid === "sas_admin" ||
      String(s?.department || "").toLowerCase().includes("student affairs");

    const sasStep = chain.find(isSasStep);
    if (sasStep && (sasStep.status === "endorsed" || sasStep.status === "approved")) {
      return true;
    }

    const anyDownstreamSigned = chain.some(
      (s) => !isSasStep(s) && (s.status === "endorsed" || s.status === "approved")
    );
    if (anyDownstreamSigned) {
      return true;
    }

    if (isSchoolFunded) {
      if (item.isPendingSasVetting === false) return true;
      const anyDownstreamActive = chain.some((s) => !isSasStep(s) && s.status === "current");
      if (anyDownstreamActive && item.isPendingSasVetting !== true) {
        return true;
      }
    }
  } else if (isSchoolFunded && item.isPendingSasVetting === false) {
    return true;
  }

  return false;
}

export function Dashboard() {
  const navigate = useNavigate();
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isRightPaneExpanded, setIsRightPaneExpanded] = useState(false);
  const [selectedReminderItem, setSelectedReminderItem] = useState<{
    event: any;
    daysRemaining: number;
    deadlineDateStr: string;
    concludedDateStr: string;
  } | null>(null);

  // ─── Real-Time Data Streams ────────────────────────────────────────────────
  const { profile } = useAdviserProfile();
  const { data: students = [] } = useStudents();
  const { events = [] } = useAllEvents();
  const { liquidations = [] } = useAllLiquidations();
  const { pars: postActivityReports = [] } = useAdminPARs();
  const { data: organizations = [] } = useOrganizationStream();
  const { data: incomingDocs = [] } = useIncomingDocuments();
  const { data: semesters = [] } = useSemesters();
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();
  const { configs: miscConfigs = [], activeConfig: activeMiscConfig } = useMiscFeeConfigs();

  const unifiedActiveTerm = useMemo(
    () =>
      resolveUnifiedActiveAcademicTerm({
        activeConfig: activeMiscConfig,
        configs: miscConfigs,
        activeCollegePeriod,
        activeShsPeriod,
      }),
    [activeMiscConfig, miscConfigs, activeCollegePeriod, activeShsPeriod]
  );

  const availableSchoolYears = useMemo(
    () =>
      buildAvailableSchoolYears({
        configs: miscConfigs,
        semesters,
        records: [...events, ...liquidations, ...postActivityReports],
        activeSchoolYear: unifiedActiveTerm.schoolYear,
      }),
    [miscConfigs, semesters, events, liquidations, postActivityReports, unifiedActiveTerm.schoolYear]
  );

  const currentSchoolYear = useMemo(
    () =>
      resolveDefaultSchoolYearFilter({
        unifiedSchoolYear: unifiedActiveTerm.schoolYear,
        availableSchoolYears,
      }),
    [unifiedActiveTerm.schoolYear, availableSchoolYears]
  );

  // ─── Time-of-Day Greeting ──────────────────────────────────────────────────
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const adviserDisplayName = useMemo(() => {
    if (profile?.displayName) return profile.displayName;
    if (profile?.firstName) return `Adviser ${profile.firstName}`;
    return "SAO Administrator";
  }, [profile]);

  // ─── Metrics Computation ───────────────────────────────────────────────────
  const pendingStudents = useMemo(() => {
    return students.filter((s) => s.status === "PENDING" || (s as any).status === "pending");
  }, [students]);

  const activeStudents = useMemo(() => {
    return students.filter((s) => s.status === "ACTIVE" || (s as any).status === "active");
  }, [students]);

  // Top 4 KPI card counts (both Orgs & SAS, strictly scoped to Current School Year)
  const kpiCounts = useMemo(
    () =>
      computeDashboardKpiCounts({
        events,
        liquidations,
        pars: postActivityReports,
        semesters,
        schoolYear: currentSchoolYear,
        availableSchoolYears,
      }),
    [events, liquidations, postActivityReports, semesters, currentSchoolYear, availableSchoolYears]
  );

  // Pending incoming submitted documents awaiting review
  const pendingIncomingDocs = useMemo(() => {
    return incomingDocs.filter((d) => d.status === "Pending" || (d as any).status === "pending");
  }, [incomingDocs]);

  // Activities monitored by Calendar & Compliance Monitor (all approved, active, and concluded activities)
  const monitoredActivities = useMemo(() => {
    return events.filter((e) => {
      if ((e as any).isArchived || (e as any).isDeleted) return false;

      const pStatus = (e.proposalStatus || '').toLowerCase();
      const status = ((e as any).status || '').toLowerCase();
      const lifecycle = (((e as any).lifecycleStatus || '') as string).toLowerCase();

      // Exclude cancelled / rejected / drafts
      if (
        status === 'cancelled' ||
        pStatus === 'cancelled' ||
        lifecycle === 'cancelled' ||
        status === 'rejected' ||
        pStatus === 'rejected' ||
        status === 'draft' ||
        pStatus === 'draft'
      ) {
        return false;
      }

      // Must be an approved or concluded activity
      const isApprovedOrConcluded =
        pStatus === 'approved' ||
        pStatus === 'activated' ||
        pStatus === 'approved_president' ||
        pStatus === 'concluded' ||
        pStatus === 'completed' ||
        status === 'approved' ||
        status === 'activated' ||
        status === 'concluded' ||
        status === 'completed' ||
        lifecycle === 'approved' ||
        lifecycle === 'concluded' ||
        lifecycle === 'completed' ||
        (e as any).isApproved === true;

      return isApprovedOrConcluded;
    }).sort((a, b) => {
      const dateA = a.sessions?.[0]?.date || (a as any).targetImplementationDate || '';
      const dateB = b.sessions?.[0]?.date || (b as any).targetImplementationDate || '';
      if (dateA && dateB) return dateB.localeCompare(dateA);
      return getMillis(b.createdAt) - getMillis(a.createdAt);
    });
  }, [events]);

  const activeOrgs = useMemo(() => {
    return organizations.filter((o) => !o.archived && o.status === "active");
  }, [organizations]);

  // Map organization names & acronyms by ID
  const orgMap = useMemo(() => {
    const map = new Map<string, { name: string; acronym: string; logoUrl?: string | null }>();
    organizations.forEach((o) => {
      map.set(o.id, { name: o.name, acronym: o.acronym || o.name, logoUrl: o.logoUrl });
    });
    return map;
  }, [organizations]);

  // ─── Organization Submissions & Action Queue (Urgent First, Strictly Pending SAS Action) ─
  const unifiedApprovalsQueue = useMemo(() => {
    const items: ApprovalItem[] = [];

    const eventFundingMap = new Map<string, string>();
    events.forEach((ev) => {
      if (ev.id && (ev as any).fundingSource) {
        eventFundingMap.set(ev.id, (ev as any).fundingSource);
      }
    });

    // 1. Pending Incoming Submitted Documents (Strictly Organization Submissions)
    pendingIncomingDocs.forEach((doc) => {
      if (isSasCreatedEvent(doc, orgMap)) return;
      const orgId = (doc as any).senderOrgId || (doc as any).organizationId;
      const orgName = doc.senderOrgName;
      if (!isOrganizationSubmission(orgId, orgName, (doc as any).senderRole)) return;

      const isSchoolFunded = (doc as any).fundingSource === "school_budget";
      if (hasAlreadyBeenReleasedToSignatories(doc, isSchoolFunded)) return;

      const ms = getMillis((doc as any).submittedAt || doc.createdAt);
      items.push({
        id: `doc-${doc.id}`,
        rawId: doc.id,
        domain: "document",
        domainLabel: "Document Submission",
        title: doc.title || doc.referenceNumber || "Document Review",
        subtitle: `${orgName || "Organization"} · ${doc.category}`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate((doc as any).submittedAt || doc.createdAt),
        route: `/home/documents/${doc.id}/review`,
        badgeColor: "bg-[#0284C7]",
        fundingBadge: isSchoolFunded ? "School Funded" : "Org Document",
        fundingBadgeClass: isSchoolFunded
          ? "bg-blue-50 text-[#003B73] border-blue-200"
          : "bg-sky-50 text-sky-700 border-sky-200",
        actionLabel: isSchoolFunded ? "Release to Signatories" : "Approve",
        actionButtonClass: isSchoolFunded
          ? "bg-[#001A4D] hover:bg-[#0E4EBD] text-white"
          : "bg-emerald-600 hover:bg-emerald-700 text-white",
      });
    });

    // 2. Pending Activity Proposals (Strictly Org-made, excluding SAS & already-released items)
    events.forEach((e) => {
      if (e.isArchived || e.isDeleted) return;
      const pStatus = String(e.proposalStatus || "").toLowerCase().trim();
      const status = String((e as any).status || "").toLowerCase().trim();
      if (
        [
          "approved",
          "activated",
          "approved_president",
          "completed",
          "concluded",
          "cancelled",
          "rejected",
          "returned",
          "returned_for_revision",
          "draft",
        ].includes(pStatus) ||
        ["approved", "completed", "concluded", "cancelled", "rejected", "returned", "draft"].includes(
          status
        ) ||
        (e as any).isApproved === true
      ) {
        return;
      }

      const isPendingCandidate =
        pStatus === "pending_review" ||
        pStatus === "pending" ||
        pStatus === "submitted" ||
        pStatus === "under_review" ||
        status === "pending" ||
        status === "under_review";
      if (!isPendingCandidate) return;

      if (isSasCreatedEvent(e, orgMap)) return;
      const orgId = e.hostingOrgId || (e as any).organizationId;
      const cleanOrg = resolveCleanOrgName(e, orgMap);
      if (!isOrganizationSubmission(orgId, cleanOrg, (e as any).createdByRole)) return;

      const fundingSrc = String((e as any).fundingSource || "organization_funds").toLowerCase().trim();
      const isSchoolFunded = fundingSrc === "school_budget";
      if (hasAlreadyBeenReleasedToSignatories(e, isSchoolFunded)) return;

      const ms = getMillis((e as any).submittedAt || e.createdAt || (e as any).updatedAt);
      const isUrgent = Boolean((e as any).isUrgent);
      const fundingBadge = isSchoolFunded
        ? "School Funded"
        : fundingSrc === "student_contributions"
          ? "Student Collections"
          : fundingSrc === "zero_budget"
            ? "Zero Budget"
            : "Club Funded";
      const fundingBadgeClass = isSchoolFunded
        ? "bg-blue-50 text-[#003B73] border-blue-200"
        : "bg-emerald-50 text-emerald-700 border-emerald-200";

      items.push({
        id: `activity-${e.id}`,
        rawId: e.id,
        domain: "activity",
        domainLabel: "Activity Proposal",
        title: e.title || "Untitled Proposal",
        subtitle: `${cleanOrg} · Proposed`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate((e as any).submittedAt || e.createdAt || (e as any).updatedAt),
        route: `/home/event-approvals?tab=pending&id=${e.id}`,
        badgeColor: isUrgent ? "bg-rose-600" : "bg-[#0E4EBD]",
        fundingBadge,
        fundingBadgeClass,
        actionLabel: isSchoolFunded ? "Release to Signatories" : "Approve",
        actionButtonClass: isSchoolFunded
          ? "bg-[#001A4D] hover:bg-[#0E4EBD] text-white"
          : "bg-emerald-600 hover:bg-emerald-700 text-white",
        isUrgent,
      });
    });

    // 3. Pending Liquidations (Strictly Org-made, excluding SAS & already-released items)
    liquidations.forEach((l) => {
      if ((l as any).isDeleted || (l as any).isArchived) return;
      const st = String(l.status || "").toLowerCase().trim();
      if (
        !["pending", "pending_adviser_review", "submitted", "pending_review", "under_review"].includes(st)
      ) {
        return;
      }
      if (isSasCreatedEvent(l, orgMap)) return;

      const orgId = l.organizationId || (l as any).orgId;
      const orgName = resolveCleanOrgName(l, orgMap);
      if (!isOrganizationSubmission(orgId, orgName, (l as any).createdByRole)) return;

      const resolvedFunding = String(
        (l as any).fundingSource ||
          (l.eventId ? eventFundingMap.get(l.eventId) : undefined) ||
          "organization_funds"
      )
        .toLowerCase()
        .trim();
      const isSchoolFunded = resolvedFunding === "school_budget";
      if (hasAlreadyBeenReleasedToSignatories(l, isSchoolFunded)) return;

      const ms = getMillis(l.submittedAt || l.createdAt || l.updatedAt);
      const totalExp = Number(l.totalActualSpending ?? (l as any).totalExpenses ?? (l as any).totalAmount ?? 0);
      const title = l.eventTitle || (l as any).eventName || (l as any).title || "Financial Liquidation";

      items.push({
        id: `liq-${l.id}`,
        rawId: l.id,
        domain: "liquidation",
        domainLabel: "Financial Liquidation",
        title: title,
        subtitle: `${orgName} · ${formatCurrency(totalExp)}`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate(l.submittedAt || l.createdAt || l.updatedAt),
        route: `/home/liquidations?tab=pending&id=${l.id}`,
        badgeColor: "bg-amber-500",
        fundingBadge: isSchoolFunded
          ? "School Funded"
          : resolvedFunding === "student_contributions"
            ? "Student Collections"
            : "Club Funded",
        fundingBadgeClass: isSchoolFunded
          ? "bg-blue-50 text-[#003B73] border-blue-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200",
        actionLabel: isSchoolFunded ? "Release to Signatories" : "Approve",
        actionButtonClass: isSchoolFunded
          ? "bg-[#001A4D] hover:bg-[#0E4EBD] text-white"
          : "bg-emerald-600 hover:bg-emerald-700 text-white",
      });
    });

    // 4. Pending Post-Activity Reports (Strictly Org-made, excluding SAS & already-released items)
    postActivityReports.forEach((par) => {
      if ((par as any).isDeleted || (par as any).isArchived) return;
      const st = String(par.status || "").toLowerCase().trim();
      if (!["pending", "pending_review", "submitted", "under_review"].includes(st)) return;
      if (isSasCreatedEvent(par, orgMap)) return;

      const orgId = (par as any).organizationId || (par as any).hostingOrgId;
      const orgName = resolveCleanOrgName(par, orgMap);
      if (!isOrganizationSubmission(orgId, orgName, (par as any).createdByRole)) return;

      const resolvedFunding = String(
        (par as any).fundingSource ||
          (par.eventId ? eventFundingMap.get(par.eventId) : undefined) ||
          "organization_funds"
      )
        .toLowerCase()
        .trim();
      const isSchoolFunded = resolvedFunding === "school_budget";
      if (hasAlreadyBeenReleasedToSignatories(par, isSchoolFunded)) return;

      const ms = getMillis((par as any).submittedAt || par.createdAt || (par as any).updatedAt);
      items.push({
        id: `par-${par.id}`,
        rawId: par.id,
        domain: "par",
        domainLabel: "Post-Activity Report",
        title: par.eventTitle || par.referenceNo || "Post-Activity Report",
        subtitle: `${orgName} · Post-Activity Report`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate((par as any).submittedAt || par.createdAt || (par as any).updatedAt),
        route: `/home/post-activity-reports?id=${par.id}`,
        badgeColor: "bg-[#FF5E36]",
        fundingBadge: isSchoolFunded ? "School Funded" : "Club Activity Report",
        fundingBadgeClass: isSchoolFunded
          ? "bg-blue-50 text-[#003B73] border-blue-200"
          : "bg-orange-50 text-orange-700 border-orange-200",
        actionLabel: isSchoolFunded ? "Release to Signatories" : "Approve",
        actionButtonClass: isSchoolFunded
          ? "bg-[#001A4D] hover:bg-[#0E4EBD] text-white"
          : "bg-emerald-600 hover:bg-emerald-700 text-white",
      });
    });

    // Sort urgent submissions first, then newest submission first (LIFO)
    items.sort((a, b) => {
      if (Boolean(a.isUrgent) !== Boolean(b.isUrgent)) {
        return a.isUrgent ? -1 : 1;
      }
      return b.timestampMs - a.timestampMs;
    });
    return items;
  }, [pendingIncomingDocs, events, liquidations, postActivityReports, orgMap]);

  // ─── Real Organization Activity Roster & Club Compliance Stats ──────────────
  const organizationActivityList = useMemo(() => {
    return activeOrgs.map((org) => {
      const orgNameLower = org.name.trim().toLowerCase();
      const orgAcronymLower = (org.acronym || "").trim().toLowerCase();

      const orgActivities = events.filter((e) => {
        if ((e as any).isArchived || (e as any).isDeleted) return false;
        if (isSasCreatedEvent(e, orgMap)) return false;
        const hOrg = String(e.hostingOrgId || (e as any).organizationId || "").trim();
        if (hOrg && hOrg === org.id) return true;
        const cleanName = resolveCleanOrgName(e, orgMap).trim().toLowerCase();
        return cleanName === orgNameLower || (Boolean(orgAcronymLower) && cleanName === orgAcronymLower);
      });

      const approvedActivitiesList = orgActivities.filter((e) => {
        const pStatus = String(e.proposalStatus || "").toLowerCase();
        const status = String((e as any).status || "").toLowerCase();
        const lifecycle = String((e as any).lifecycleStatus || "").toLowerCase();
        if (
          ["cancelled", "rejected", "draft", "archived"].includes(pStatus) ||
          ["cancelled", "rejected", "draft", "archived"].includes(status) ||
          ["cancelled", "rejected", "draft", "archived"].includes(lifecycle)
        ) {
          return false;
        }
        return (
          ["approved", "activated", "approved_president", "completed", "concluded"].includes(pStatus) ||
          ["approved", "activated", "completed", "concluded"].includes(status) ||
          ["approved", "completed", "concluded"].includes(lifecycle) ||
          (e as any).isApproved === true
        );
      });

      let missingFlCount = 0;
      let missingParCount = 0;

      approvedActivitiesList.forEach((act) => {
        if (!isActivityConcluded(act)) return;

        if (!isEventLiquidationExempt(act)) {
          const matchingLiq = liquidations.find(
            (l) =>
              !l.isDeleted &&
              l.status !== "voided" &&
              (l.status as any) !== "cancelled" &&
              (l.eventId === act.id || (l as any).eventReportId === act.id)
          );
          const flSt = String(matchingLiq?.status || "").toLowerCase();
          if (!matchingLiq || flSt === "draft") {
            missingFlCount++;
          }
        }

        const matchingPAR = postActivityReports.find(
          (p) =>
            !p.isDeleted &&
            !["voided", "cancelled"].includes(String(p.status || "").toLowerCase()) &&
            (p.eventId === act.id || (act as any).parId === p.id)
        );
        const parSt = String(matchingPAR?.status || "").toLowerCase();
        if (!matchingPAR || parSt === "draft") {
          missingParCount++;
        }
      });

      return {
        id: org.id,
        name: org.acronym || org.name,
        fullName: org.name,
        logoUrl: org.logoUrl,
        approvedCount: approvedActivitiesList.length,
        missingFlCount,
        missingParCount,
        memberCount: org.memberCount || 0,
      };
    });
  }, [activeOrgs, events, liquidations, postActivityReports, orgMap]);

  return (
    <div className="space-y-6 pb-6 relative">
      {/* Floating Right Edge Rail Trigger (When unexpanded) */}
      {!isRightPaneExpanded && (
        <button
          type="button"
          onClick={() => setIsRightPaneExpanded(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-30 bg-[#001A4D] hover:bg-[#0E4EBD] text-white py-3.5 px-2 rounded-l-2xl shadow-2xl border-l-2 border-y-2 border-[#FFD41C] flex flex-col items-center gap-2 cursor-pointer transition-all hover:pr-3 group"
          title="Expand Calendar of Activities & Monitor to the right"
        >
          <CalendarDays className="w-5 h-5 text-[#FFD41C]" />
          <span className="text-[10px] font-bold tracking-wider uppercase [writing-mode:vertical-rl] rotate-180 text-white/90 group-hover:text-white">
            Activities & Calendar
          </span>
          <ChevronLeft className="w-4 h-4 text-[#FFD41C] animate-pulse" />
        </button>
      )}

      {/* Responsive Layout: Full Width when Unexpanded, 2-Column Split when Expanded */}
      <div className={isRightPaneExpanded ? "grid grid-cols-1 xl:grid-cols-12 gap-6 items-start" : "space-y-6"}>
        {/* ── Main Section (Spans 8 cols when 3rd pane expanded, full width when collapsed) ── */}
        <div className={isRightPaneExpanded ? "xl:col-span-8 space-y-6" : "space-y-6"}>
          {/* Dynamic Welcome Banner (Top Blue Card with Personalized Greeting) */}
          <div className="relative bg-gradient-to-br from-[#001A4D] via-[#002B7F] to-[#0A47B8] rounded-3xl p-6 sm:p-8 text-white overflow-hidden shadow-lg shadow-[#001A4D]/10 border border-blue-900/40">
            <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-[#FFD41C]" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-[#FFD41C] text-[#001A4D] uppercase tracking-wider">
                    SAS Portal
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {greeting}, {adviserDisplayName}.
                </h2>
                <p className="text-white/80 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                  STI College Ormoc — Real-time overview of student activities, approved activity schedules, post-activity reports, and financial liquidations.
                </p>
              </div>
            </div>
            <Shield className="absolute right-6 top-1/2 -translate-y-1/2 w-44 h-44 opacity-10 pointer-events-none" />
          </div>

          {/* Top 4 Real-Time Reactive Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Pending Activity Proposals */}
            <MetricCard
              title="Pending Activity Proposals"
              value={kpiCounts.pendingActivityProposals}
              icon={CalendarCheck}
              gradient="blue"
              onClick={() => navigate("/home/event-approvals?tab=pending")}
            />

            {/* 2. Approved Activity Proposals */}
            <MetricCard
              title="Approved Activity Proposals"
              value={kpiCounts.approvedActivityProposals}
              icon={CalendarDays}
              gradient="green"
              onClick={() => navigate("/home/event-approvals?tab=approved")}
            />

            {/* 3. Pending Financial Liquidations */}
            <MetricCard
              title="Pending Financial Liquidations"
              value={kpiCounts.pendingFinancialLiquidations}
              icon={Receipt}
              gradient="gold"
              onClick={() => navigate("/home/liquidations?tab=pending")}
            />

            {/* 4. Pending Post-Activity Reports */}
            <MetricCard
              title="Pending Post-Activity Reports"
              value={kpiCounts.pendingPostActivityReports}
              icon={FileCheck2}
              gradient="red-orange"
              onClick={() => navigate("/home/post-activity-reports?tab=pending")}
            />
          </div>

          {/* 2 Hub Cards: Pending Approvals Queue & Organization Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Organization Submissions Queue (Fixed Height h-[500px], Newest First) */}
            <Card className="h-[500px] border-[#E0E0E0] shadow-sm rounded-2xl flex flex-col gap-0 overflow-hidden">
              <CardHeader className="border-b border-gray-100 py-3.5 px-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-[#0E4EBD]" />
                      <CardTitle className="text-[#001A4D] text-lg font-bold">
                        Organization Submissions Queue
                      </CardTitle>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Urgent &amp; newest submissions on top • Release school-funded items to signatories or approve org-funded requests
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 bg-[#001A4D] text-white rounded-full text-xs font-mono font-bold">
                    {unifiedApprovalsQueue.length} Total
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-3 pb-3 flex-1 flex flex-col justify-start overflow-hidden">
                {/* Rows Pushed Directly to Top - Scrollable newest-first queue without visible scrollbar */}
                <div className="space-y-2 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pt-0 mt-0">
                  {unifiedApprovalsQueue.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                      <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                      <p className="font-bold text-[#001A4D]">All Organization Queues are Clear!</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        There are currently no pending organization submissions awaiting SAS action.
                      </p>
                    </div>
                  ) : (
                    unifiedApprovalsQueue.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => navigate(item.route)}
                        className="flex items-center gap-3 p-2.5 hover:bg-gray-50/80 rounded-xl transition-colors border border-gray-100 cursor-pointer"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${item.badgeColor} flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {item.isUrgent && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-700" />
                                  Urgent
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                                {item.domainLabel}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border whitespace-nowrap ${item.fundingBadgeClass}`}
                              >
                                {item.fundingBadge}
                              </span>
                            </div>
                            {item.dateFormatted && (
                              <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                                {item.dateFormatted}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-[#001A4D] text-xs truncate mt-0.5">{item.title}</div>
                          <div className="text-[11px] text-gray-500 truncate mt-0.5">{item.subtitle}</div>
                        </div>
                        {/* Action Button Routing Directly to Release to Signatories or SAS Approve */}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(item.route);
                          }}
                          className={`${item.actionButtonClass} text-[11px] font-semibold h-7 px-2.5 flex-shrink-0 cursor-pointer whitespace-nowrap`}
                        >
                          {item.actionLabel}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 2. Organization Activity (Fixed Height h-[500px], Rows Pushed Directly to Top) */}
            <Card className="h-[500px] border-[#E0E0E0] shadow-sm rounded-2xl flex flex-col gap-0 overflow-hidden">
              <CardHeader className="border-b border-gray-100 py-3.5 px-4 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#0E4EBD]" />
                  <CardTitle className="text-[#001A4D] text-lg font-bold">Organization Activity</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-3 pb-3 flex-1 flex flex-col justify-start overflow-hidden">
                {/* Rows Pushed Directly to Top - Scrollable without visible scrollbar */}
                <div className="space-y-2 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pt-0 mt-0">
                  {organizationActivityList.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                      <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium">No active organizations found.</p>
                    </div>
                  ) : (
                    organizationActivityList.map((org) => (
                      <div
                        key={org.id}
                        onClick={() => navigate("/home/organizations")}
                        className="p-2.5 bg-gray-50/60 hover:bg-blue-50/40 rounded-xl border border-gray-100 hover:border-blue-200 space-y-2 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] rounded-lg flex items-center justify-center text-white font-bold text-xs uppercase overflow-hidden flex-shrink-0 shadow-xs">
                            {org.logoUrl ? (
                              <img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover" />
                            ) : (
                              org.name.slice(0, 3)
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                            <div className="font-bold text-[#001A4D] text-xs truncate">{org.fullName}</div>
                            <span className="text-[11px] text-gray-500 shrink-0">{org.memberCount} member(s)</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-[#001A4D] border border-blue-200">
                            {org.approvedCount} Approved {org.approvedCount === 1 ? "Act" : "Acts"}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              org.missingFlCount > 0
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {org.missingFlCount} Missing FL
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              org.missingParCount > 0
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {org.missingParCount} No PAR
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Bottom Button */}
                <Button
                  variant="outline"
                  onClick={() => navigate("/home/organizations")}
                  className="w-full border-gray-200 text-[#001A4D] hover:bg-gray-50 font-semibold text-xs mt-2 flex-shrink-0 cursor-pointer"
                >
                  View All Recognized Clubs →
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Right 3rd Pane (Expanded to right when isRightPaneExpanded is true) ── */}
        {isRightPaneExpanded && (
          <div className="xl:col-span-4 sticky top-6">
            <CalendarAndActivityMonitorPane
              activities={monitoredActivities}
              liquidations={liquidations}
              postActivityReports={postActivityReports}
              orgMap={orgMap}
              onOpenReminder={setSelectedReminderItem}
              onCollapse={() => setIsRightPaneExpanded(false)}
            />
          </div>
        )}
      </div>

      {/* 7-Step Activity Proposal (AP) Wizard Modal */}
      <CreateProposalModal
        isOpen={isProposalModalOpen}
        onClose={() => setIsProposalModalOpen(false)}
        currentUser={{
          uid: profile?.uid || 'sao-admin',
          name: adviserDisplayName || 'Student Affairs & Services',
          email: profile?.email || 'sao@ormoc.sti.edu.ph',
          role: 'sas_admin',
          signatureUrl: profile?.signatureUrl || (profile as any)?.signatureDataUrl || null,
        }}
      />

      {/* Send Liquidation Reminder Modal */}
      {selectedReminderItem && (
        <SendLiquidationReminderModal
          isOpen={Boolean(selectedReminderItem)}
          onClose={() => setSelectedReminderItem(null)}
          event={selectedReminderItem.event}
          daysRemaining={selectedReminderItem.daysRemaining}
          deadlineDateStr={selectedReminderItem.deadlineDateStr}
          concludedDateStr={selectedReminderItem.concludedDateStr}
        />
      )}
    </div>
  );
}

