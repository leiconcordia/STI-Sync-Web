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
  ChevronRight,
} from "lucide-react";
import { MetricCard } from "../components/dashboard/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import CreateProposalModal from "../../modules/activity-proposals/components/CreateProposalModal";
import { CalendarAndActivityMonitorPane } from "../components/dashboard/CalendarAndActivityMonitorPane";
import { SendLiquidationReminderModal } from "../../modules/finance/components/SendLiquidationReminderModal";
import { resolveCleanOrgName } from "../../modules/events/utils/organization-display.utils";

import { useAdviserProfile } from "../../modules/auth/hooks/useAdviserProfile";
import { useStudents } from "../../modules/students/hooks/useStudentStream";
import { useAllEvents } from "../../modules/events/hooks/useEventStream";
import { useAllLiquidations } from "../../modules/finance/hooks/useLiquidationStream";
import { useOrganizationStream } from "../../modules/organizations/hooks/useOrganizationStream";
import { formatCurrency } from "../../utils/currency";
import { useIncomingDocuments } from "../../modules/documents/hooks/useDocumentStream";
import { useActiveAcademicPeriods } from "../../modules/academic/hooks/useAcademicStream";
import { useAdminPARs } from "../../modules/post-activity-reports/hooks/usePostActivityReportStream";
import { getMillis, formatTimestampDate } from "../../modules/students/utils/date.utils";
import { formatAppDate, format12HourTime } from "../../utils/date";

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
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();

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

  // Pending activity proposals awaiting administrative review
  const pendingActivities = useMemo(() => {
    return events.filter(
      (e) =>
        e.proposalStatus === "pending_review" ||
        e.proposalStatus === "pending" ||
        (e as any).proposalStatus === "submitted" ||
        (e as any).status === "pending"
    );
  }, [events]);

  // Pending financial liquidations awaiting review
  const pendingLiquidations = useMemo(() => {
    return liquidations.filter(
      (l) =>
        l.status === "pending" ||
        l.status === "pending_adviser_review" ||
        (l as any).status === "submitted" ||
        (l as any).status === "pending_review"
    );
  }, [liquidations]);

  // Pending post-activity reports awaiting administrative review
  const pendingPARs = useMemo(() => {
    return postActivityReports.filter(
      (p) => p.status === "under_review" || (p as any).status === "pending"
    );
  }, [postActivityReports]);

  // Pending incoming submitted documents awaiting review
  const pendingIncomingDocs = useMemo(() => {
    return incomingDocs.filter((d) => d.status === "Pending" || (d as any).status === "pending");
  }, [incomingDocs]);

  // Approved activities strictly cleared for execution (excluding pending, draft, returned, or concluded)
  const approvedActivities = useMemo(() => {
    const list = events.filter((e) => {
      const pStatus = (e.proposalStatus || '').toLowerCase();
      const status = ((e as any).status || '').toLowerCase();

      // Must be approved / activated
      const isApproved =
        pStatus === 'approved' ||
        pStatus === 'activated' ||
        pStatus === 'approved_president';

      if (!isApproved) return false;

      const lifecycle = (((e as any).lifecycleStatus || '') as string).toLowerCase();

      // Exclude concluded / completed / cancelled / archived
      if (
        pStatus === 'completed' ||
        pStatus === 'concluded' ||
        status === 'completed' ||
        status === 'concluded' ||
        status === 'cancelled' ||
        status === 'archived' ||
        lifecycle === 'completed' ||
        lifecycle === 'concluded' ||
        lifecycle === 'cancelled' ||
        lifecycle === 'archived' ||
        (e as any).isArchived
      ) {
        return false;
      }

      return true;
    });

    return list.sort((a, b) => {
      const dateA = a.sessions?.[0]?.date || (a as any).targetImplementationDate || '';
      const dateB = b.sessions?.[0]?.date || (b as any).targetImplementationDate || '';
      if (dateA && dateB) return dateA.localeCompare(dateB);
      return getMillis(b.createdAt) - getMillis(a.createdAt);
    });
  }, [events]);

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

  // ─── Unified Approvals Queue Feed (Scrollable, No Visible Scrollbar) ────────
  const unifiedApprovalsQueue = useMemo(() => {
    const items: ApprovalItem[] = [];

    // 1. Pending Incoming Submitted Documents (Route directly to specific document review)
    pendingIncomingDocs.forEach((doc) => {
      const ms = getMillis(doc.createdAt);
      items.push({
        id: `doc-${doc.id}`,
        rawId: doc.id,
        domain: "document",
        domainLabel: "Document Submission",
        title: doc.title || doc.referenceNumber || "Document Review",
        subtitle: `${doc.senderOrgName || "STI SAS"} · ${doc.category}`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate(doc.createdAt),
        route: `/home/documents/${doc.id}/review`,
        badgeColor: "bg-[#0284C7]",
      });
    });

    // 2. Pending Activity Proposals (Route directly to specific activity proposal review)
    pendingActivities.forEach((e) => {
      const ms = getMillis(e.createdAt);
      const cleanOrg = resolveCleanOrgName(e, orgMap);
      items.push({
        id: `activity-${e.id}`,
        rawId: e.id,
        domain: "activity",
        domainLabel: "Activity Proposal",
        title: e.title || "Untitled Proposal",
        subtitle: `${cleanOrg} · Proposed`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate(e.createdAt),
        route: `/home/event-approvals?tab=pending&id=${e.id}`,
        badgeColor: "bg-[#0E4EBD]",
      });
    });

    // 3. Pending Liquidations (Route directly to specific liquidation review)
    pendingLiquidations.forEach((l) => {
      const ms = getMillis(l.submittedAt || l.updatedAt || l.createdAt);
      const totalExp = Number(l.totalActualSpending ?? (l as any).totalExpenses ?? (l as any).totalAmount ?? 0);
      const orgName = resolveCleanOrgName(l, orgMap);
      const title = l.eventTitle || (l as any).eventName || (l as any).title || "Financial Liquidation";
      items.push({
        id: `liq-${l.id}`,
        rawId: l.id,
        domain: "liquidation",
        domainLabel: "Financial Liquidation",
        title: title,
        subtitle: `${orgName} · ${formatCurrency(totalExp)}`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate(l.submittedAt || l.updatedAt || l.createdAt),
        route: `/home/liquidations?tab=pending&id=${l.id}`,
        badgeColor: "bg-amber-500",
      });
    });

    // 4. Pending Post-Activity Reports (Route directly to specific PAR review)
    pendingPARs.forEach((par) => {
      const ms = getMillis(par.createdAt || (par as any).updatedAt);
      const orgName = resolveCleanOrgName(par, orgMap);
      items.push({
        id: `par-${par.id}`,
        rawId: par.id,
        domain: "par",
        domainLabel: "Post-Activity Report",
        title: par.eventTitle || par.referenceNo || "Post-Activity Report",
        subtitle: `${orgName} · Post-Activity Report`,
        timestampMs: ms,
        dateFormatted: formatTimestampDate(par.createdAt || (par as any).updatedAt),
        route: `/home/post-activity-reports?id=${par.id}`,
        badgeColor: "bg-[#FF5E36]",
      });
    });

    // Sort FIFO: oldest pending items first (first in, first out)
    items.sort((a, b) => a.timestampMs - b.timestampMs);
    return items;
  }, [pendingIncomingDocs, pendingActivities, pendingLiquidations, pendingPARs, orgMap]);

  // ─── Real Organization Activity Roster ─────────────────────────────────────
  const organizationActivityList = useMemo(() => {
    return activeOrgs.map((org) => {
      const orgActivities = events.filter((e) => e.hostingOrgId === org.id);
      const approvedCount = orgActivities.filter((e) => e.proposalStatus === "approved").length;
      const totalActivities = orgActivities.length || 1;
      const progress = Math.min(100, Math.round((approvedCount / totalActivities) * 100));

      return {
        id: org.id,
        name: org.acronym || org.name,
        fullName: org.name,
        logoUrl: org.logoUrl,
        activitiesCount: approvedCount,
        totalActivities: orgActivities.length,
        memberCount: org.memberCount || 0,
        progress: progress === 0 && approvedCount > 0 ? 100 : progress,
      };
    });
  }, [activeOrgs, events]);

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
                    SAO Portal
                  </span>
                  {activeCollegePeriod && (
                    <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white">
                      College: {activeCollegePeriod.semester}
                    </span>
                  )}
                  {activeShsPeriod && (
                    <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-amber-400/25 text-amber-200 border border-amber-400/30">
                      SHS: {activeShsPeriod.semester}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {greeting}, {adviserDisplayName}.
                </h2>
                <p className="text-white/80 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                  STI College Ormoc — Real-time overview of student activities, approved activity schedules, post-activity reports, and financial liquidations.
                </p>
              </div>

              <div className="flex items-center gap-3 z-10 flex-shrink-0">
                {!isRightPaneExpanded && (
                  <Button
                    type="button"
                    onClick={() => setIsRightPaneExpanded(true)}
                    className="bg-[#FFD41C] hover:bg-amber-400 text-[#001A4D] font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
                  >
                    <CalendarDays className="w-4 h-4 text-[#001A4D]" />
                    <span>Activities & Calendar</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <Shield className="absolute right-6 top-1/2 -translate-y-1/2 w-44 h-44 opacity-10 pointer-events-none" />
          </div>

          {/* Top 4 Real-Time Reactive Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Pending Activities */}
            <MetricCard
              title="Pending Activities"
              value={pendingActivities.length}
              icon={CalendarCheck}
              gradient="blue"
              change="Proposals awaiting SAO"
            />

            {/* 2. Approved Activities */}
            <MetricCard
              title="Approved Activities"
              value={approvedActivities.length}
              icon={CalendarDays}
              gradient="green"
              change="Cleared for execution"
            />

            {/* 3. Pending Liquidations */}
            <MetricCard
              title="Pending Liquidations"
              value={pendingLiquidations.length}
              icon={Receipt}
              gradient="gold"
              change="Post-activity reviews"
            />

            {/* 4. Post-Activity Reports */}
            <MetricCard
              title="Post-Activity Reports"
              value={pendingPARs.length}
              icon={FileCheck2}
              gradient="red-orange"
              change="PAR reviews awaiting SAO"
            />
          </div>

          {/* 2 Hub Cards: Pending Approvals Queue & Organization Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Unified Approvals Queue (Fixed Height h-[500px], Rows Pushed Directly to Top) */}
            <Card className="h-[500px] border-[#E0E0E0] shadow-sm rounded-2xl flex flex-col gap-0 overflow-hidden">
              <CardHeader className="border-b border-gray-100 py-3.5 px-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-[#0E4EBD]" />
                      <CardTitle className="text-[#001A4D] text-lg font-bold">Pending Approvals Queue</CardTitle>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Showing oldest pending submissions (FIFO)
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 bg-[#001A4D] text-white rounded-full text-xs font-mono font-bold">
                    {unifiedApprovalsQueue.length} Total
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pt-3 pb-3 flex-1 flex flex-col justify-start overflow-hidden">
                {/* Rows Pushed Directly to Top - Scrollable FIFO queue without visible scrollbar */}
                <div className="space-y-2 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pt-0 mt-0">
                  {unifiedApprovalsQueue.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                      <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                      <p className="font-bold text-[#001A4D]">All Approval Queues are Clear!</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        There are currently no pending items awaiting adviser review.
                      </p>
                    </div>
                  ) : (
                    unifiedApprovalsQueue.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 hover:bg-gray-50/80 rounded-xl transition-colors border border-gray-100"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${item.badgeColor} flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                              {item.domainLabel}
                            </span>
                            {item.dateFormatted && (
                              <span className="text-[10px] text-gray-400 font-medium">
                                Submitted: {item.dateFormatted}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-[#001A4D] text-xs truncate">{item.title}</div>
                          <div className="text-[11px] text-gray-500 truncate mt-0.5">{item.subtitle}</div>
                        </div>
                        {/* Review Button Redirecting Directly to Specific Item Review Page */}
                        <Button
                          size="sm"
                          onClick={() => navigate(item.route)}
                          className="bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-semibold h-7 px-3 flex-shrink-0 cursor-pointer"
                        >
                          Review
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
                      <div key={org.id} className="p-2.5 bg-gray-50/60 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <div className="w-8 h-8 bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] rounded-lg flex items-center justify-center text-white font-bold text-xs uppercase overflow-hidden flex-shrink-0 shadow-xs">
                            {org.logoUrl ? (
                              <img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover" />
                            ) : (
                              org.name.slice(0, 3)
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[#001A4D] text-xs truncate">{org.fullName}</div>
                            <div className="text-[11px] text-gray-500 flex items-center justify-between mt-0.5">
                              <span>{org.activitiesCount} activity(ies) approved</span>
                              <span>{org.memberCount} member(s)</span>
                            </div>
                          </div>
                        </div>
                        <Progress value={org.progress} className="h-1.5 bg-gray-200" />
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

