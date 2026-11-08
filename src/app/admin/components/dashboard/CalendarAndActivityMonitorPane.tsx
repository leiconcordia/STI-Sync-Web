/**
 * src/app/admin/components/dashboard/CalendarAndActivityMonitorPane.tsx
 *
 * Dedicated 3rd Dashboard Pane:
 * - Header with Shield & SAS Institutional Activity branding + Collapse button
 * - Navy Hero Status Banner with active approved activities and host attribution
 * - Clean Tabs:
 *     1. ORG ACT: Student Organization activities, 15-day deadline countdown, 1-Click "Remind" button
 *     2. SAS ACT: SAS Institutional activities, internal status, strictly NO reminders
 *     3. Calendar: Interactive month grid + Selected Date Inspector with "View Activity" redirection
 * - Compact pagination so content appears without awkward internal scrollbars
 * - Strict clean organization name resolution (Admin -> "Student Affairs & Services (SAS)")
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  CalendarDays,
  Calendar as CalendarIcon,
  Clock,
  Receipt,
  FileCheck2,
  Bell,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Building2,
  Users,
  Eye,
  MapPin,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { EventDocument } from '../../../modules/events/types/event.types';
import type { LiquidationDocument } from '../../../modules/finance/types/liquidation.types';
import type { PostActivityReport } from '../../../modules/post-activity-reports/types/par.types';
import {
  resolveCleanOrgName,
  isSasCreatedEvent,
  isEventLiquidationExempt,
} from '../../../modules/events/utils/organization-display.utils';
import { formatAppDate, format12HourTime } from '../../../utils/date';
import { getMillis } from '../../../modules/students/utils/date.utils';

export interface CalendarAndActivityMonitorPaneProps {
  activities: EventDocument[];
  liquidations: LiquidationDocument[];
  postActivityReports: PostActivityReport[];
  orgMap: Map<string, { name: string; acronym: string; logoUrl?: string | null }>;
  onOpenReminder: (item: {
    event: any;
    daysRemaining: number;
    deadlineDateStr: string;
    concludedDateStr: string;
  }) => void;
  onCollapse?: () => void;
  className?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const ITEMS_PER_PAGE = 4;

export function CalendarAndActivityMonitorPane({
  activities = [],
  liquidations = [],
  postActivityReports = [],
  orgMap,
  onOpenReminder,
  onCollapse,
  className = '',
}: CalendarAndActivityMonitorPaneProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'org' | 'sas' | 'calendar'>('org');
  const [orgFilter, setOrgFilter] = useState<'all' | 'needs_action'>('all');
  const [sasFilter, setSasFilter] = useState<'all' | 'needs_action'>('all');
  const [orgPage, setOrgPage] = useState(1);
  const [sasPage, setSasPage] = useState(1);

  // ─── Current Date & Month State for Mini Calendar ─────────────────────────
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => todayStr);

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const monthLabel = useMemo(() => {
    return currentMonthDate.toLocaleString('default', { month: 'short', year: 'numeric' });
  }, [currentMonthDate]);

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  // ─── Index Activities by Date (YYYY-MM-DD) ────────────────────────────────
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, EventDocument[]>();

    activities.forEach((act) => {
      const dates = new Set<string>();
      if (Array.isArray(act.sessions) && act.sessions.length > 0) {
        act.sessions.forEach((s) => {
          if (s.date) dates.add(s.date.split('T')[0]);
        });
      }
      const fallback = (act.date || (act as any).targetImplementationDate || '').split('T')[0];
      if (fallback) dates.add(fallback);

      dates.forEach((dKey) => {
        const list = map.get(dKey) || [];
        if (!list.some((existing) => existing.id === act.id)) {
          list.push(act);
        }
        map.set(dKey, list);
      });
    });

    return map;
  }, [activities]);

  // ─── Mini Calendar Grid Calculation ───────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; hasEvents: boolean }[] = [];

    // Empty lead cells
    for (let i = 0; i < firstDay; i++) {
      cells.push({ dateStr: '', dayNum: 0, isCurrentMonth: false, hasEvents: false });
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasEvents = (activitiesByDate.get(dateStr) || []).length > 0;
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        hasEvents,
      });
    }

    return cells;
  }, [year, month, activitiesByDate]);

  const selectedDayActivities = useMemo(() => {
    if (!selectedDate) return [];
    return activitiesByDate.get(selectedDate) || [];
  }, [selectedDate, activitiesByDate]);

  // ─── Activity Compliance Summaries (Categorized by Org vs SAS) ─────────────
  const activitySummaries = useMemo(() => {
    return activities.map((act) => {
      const isSas = isSasCreatedEvent(act, orgMap);
      const cleanOrg = resolveCleanOrgName(act, orgMap);

      // Implementation / Concluded date
      const lastSessionDate = act.sessions && act.sessions.length > 0
        ? act.sessions[act.sessions.length - 1].date
        : (act.date || (act as any).targetImplementationDate || '');

      let concludedDate = lastSessionDate ? new Date(lastSessionDate) : null;
      if (!concludedDate || isNaN(concludedDate.getTime())) {
        concludedDate = act.createdAt ? new Date(getMillis(act.createdAt)) : new Date();
      }

      const isConcluded =
        (lastSessionDate && new Date(lastSessionDate) < today) ||
        act.lifecycleStatus === 'completed' ||
        act.status === 'completed' ||
        act.proposalStatus === 'completed';

      // 15-day liquidation deadline calculation
      const deadlineDate = new Date(concludedDate.getTime() + 15 * 86400000);
      const diffMs = deadlineDate.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const deadlineDateStr = formatAppDate(deadlineDate.toISOString().split('T')[0]);
      const concludedDateStr = formatAppDate(concludedDate.toISOString().split('T')[0]);

      // Check linked liquidation (FL)
      const matchingLiq = liquidations.find(
        (l) => l.eventId === act.id || (l as any).eventReportId === act.id
      );

      let flStatus: 'approved' | 'under_review' | 'returned' | 'draft' | 'missing' | 'upcoming' = 'upcoming';
      if (matchingLiq) {
        const s = (matchingLiq.status || '').toLowerCase();
        if (s === 'approved') flStatus = 'approved';
        else if (s === 'under_review' || s === 'pending' || s === 'pending_adviser_review') flStatus = 'under_review';
        else if (s === 'returned') flStatus = 'returned';
        else flStatus = 'draft';
      } else if (isConcluded) {
        flStatus = 'missing';
      }

      // Check linked Post-Activity Report (PAR)
      const matchingPAR = postActivityReports.find(
        (p) => p.eventId === act.id || act.parId === p.id
      );

      let parStatus: 'approved' | 'under_review' | 'returned' | 'missing' | 'upcoming' = 'upcoming';
      if (matchingPAR) {
        const s = (matchingPAR.status || '').toLowerCase();
        if (s === 'approved') parStatus = 'approved';
        else if (s === 'under_review' || s === 'pending') parStatus = 'under_review';
        else if (s === 'returned') parStatus = 'returned';
        else parStatus = 'under_review';
      } else if (isConcluded) {
        parStatus = 'missing';
      }

      // ─── Compliance Completion & Lacking Determination ─────────────────
      // If no budget or no financial projection, no need for liquidation
      const isExemptFromLiquidation = isEventLiquidationExempt(act);
      const isZeroBudget = act.fundingSource === 'zero_budget' || isExemptFromLiquidation;
      const isStatusCompleted =
        act.lifecycleStatus === 'completed' ||
        act.status === 'completed' ||
        act.proposalStatus === 'completed';

      const flDone = isExemptFromLiquidation || flStatus === 'approved';
      const parDone = parStatus === 'approved';

      // An activity is already completed if both FL and PAR are approved/cleared
      // or if its status is marked completed without lacking requirements
      const isCompletedAlready =
        (flDone && parDone) ||
        (isStatusCompleted && (isExemptFromLiquidation || flStatus !== 'missing') && parStatus !== 'missing');

      // What is lacking? (Exempt activities never lack FL)
      const needsFl = !isExemptFromLiquidation && (flStatus === 'missing' || flStatus === 'draft' || flStatus === 'returned');
      const needsPar = parStatus === 'missing' || parStatus === 'returned';

      // Needs action if concluded and either FL or PAR is lacking
      const needsAction = isConcluded && (needsFl || needsPar);

      return {
        event: act,
        isSas,
        cleanOrg,
        isConcluded,
        concludedDateStr,
        deadlineDateStr,
        daysRemaining,
        flStatus,
        parStatus,
        isZeroBudget,
        isExemptFromLiquidation,
        needsFl,
        needsPar,
        needsAction,
        isCompletedAlready,
      };
    });
  }, [activities, liquidations, postActivityReports, orgMap, today]);

  // ─── Filter Out Already Completed Activities (Only show active / lacking compliance) ─
  const activeComplianceSummaries = useMemo(() => {
    return activitySummaries.filter((a) => !a.isCompletedAlready);
  }, [activitySummaries]);

  // ─── Partition: Student Organization vs SAS Institutional Activities ───────
  const orgSummaries = useMemo(() => {
    return activeComplianceSummaries.filter((a) => !a.isSas);
  }, [activeComplianceSummaries]);

  const sasSummaries = useMemo(() => {
    return activeComplianceSummaries.filter((a) => a.isSas);
  }, [activeComplianceSummaries]);

  const needsOrgActionCount = useMemo(() => {
    return orgSummaries.filter((a) => a.needsAction).length;
  }, [orgSummaries]);

  const needsSasActionCount = useMemo(() => {
    return sasSummaries.filter((a) => a.needsAction).length;
  }, [sasSummaries]);

  const displayedOrgSummaries = useMemo(() => {
    if (orgFilter === 'needs_action') {
      return orgSummaries.filter((a) => a.needsAction);
    }
    return orgSummaries;
  }, [orgSummaries, orgFilter]);

  const displayedSasSummaries = useMemo(() => {
    if (sasFilter === 'needs_action') {
      return sasSummaries.filter((a) => a.needsAction);
    }
    return sasSummaries;
  }, [sasSummaries, sasFilter]);

  // ─── Pagination for ORG ACT (Non-scrollable look) ──────────────────────────
  const totalOrgPages = Math.max(1, Math.ceil(displayedOrgSummaries.length / ITEMS_PER_PAGE));
  const pagedOrgSummaries = useMemo(() => {
    const start = (orgPage - 1) * ITEMS_PER_PAGE;
    return displayedOrgSummaries.slice(start, start + ITEMS_PER_PAGE);
  }, [displayedOrgSummaries, orgPage]);

  // ─── Pagination for SAS ACT (Non-scrollable look) ──────────────────────────
  const totalSasPages = Math.max(1, Math.ceil(displayedSasSummaries.length / ITEMS_PER_PAGE));
  const pagedSasSummaries = useMemo(() => {
    const start = (sasPage - 1) * ITEMS_PER_PAGE;
    return displayedSasSummaries.slice(start, start + ITEMS_PER_PAGE);
  }, [displayedSasSummaries, sasPage]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── 1. Header with Collapse Option ── */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-5 h-5 text-[#0E4EBD] flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[#001A4D] font-bold text-base leading-tight truncate">SAS Institutional Activity</p>
            <p className="text-gray-500 text-xs truncate">Calendar of activities & compliance monitor</p>
          </div>
        </div>

        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-gray-600 hover:text-[#001A4D] bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer flex-shrink-0"
            title="Collapse panel to right"
          >
            <span>Collapse</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── 2. Status Banner (Dark Navy Gradient) ── */}
      <div className="bg-gradient-to-br from-[#001A4D] via-[#002B7F] to-[#0E4EBD] rounded-2xl p-4 text-white shadow-xs space-y-2.5 border border-blue-900/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-[#FFD41C]" />
          </div>
          <div className="min-w-0">
            <h4 className="font-extrabold text-sm text-white truncate">
              {activeComplianceSummaries.length} Active Compliance Monitor
            </h4>
            <p className="text-[11px] text-blue-100">
              {needsOrgActionCount + needsSasActionCount > 0
                ? `${needsOrgActionCount + needsSasActionCount} activit${needsOrgActionCount + needsSasActionCount === 1 ? 'y' : 'ies'} lacking FL or PAR`
                : 'All activities up to date'}
            </p>
          </div>
        </div>
        <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[11px] text-white/90">
          <span>Oversight:</span>
          <span className="font-semibold text-[#FFD41C]">Student Affairs & Services (SAS)</span>
        </div>
      </div>

      {/* ── 3. Tabbed Activities & Calendar Card ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
        {/* 3 Dedicated Tabs: ORG ACT, SAS ACT, Calendar */}
        <div className="p-2 border-b border-gray-100 bg-gray-50/70">
          <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-gray-200 text-[11px] font-bold shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('org');
                setOrgPage(1);
              }}
              className={`py-1.5 px-1 rounded-lg transition-colors cursor-pointer text-center truncate ${
                activeTab === 'org'
                  ? 'bg-[#001A4D] text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              ORG ACT ({orgSummaries.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('sas');
                setSasPage(1);
              }}
              className={`py-1.5 px-1 rounded-lg transition-colors cursor-pointer text-center truncate ${
                activeTab === 'sas'
                  ? 'bg-[#001A4D] text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              SAS ACT ({sasSummaries.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`py-1.5 px-1 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 truncate ${
                activeTab === 'calendar'
                  ? 'bg-[#001A4D] text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <CalendarIcon className="w-3 h-3 text-[#FFD41C]" />
              <span>Calendar</span>
            </button>
          </div>
        </div>

        {/* ── TAB 1: ORG ACT (Student Organization Activities with Remind list) ── */}
        {activeTab === 'org' && (
          <div className="flex flex-col">
            {/* Filter Bar */}
            <div className="px-3.5 py-2 bg-blue-50/40 flex items-center justify-between text-xs border-b border-gray-100">
              <span className="text-[11px] font-bold text-[#001A4D]">
                Club Compliance Roster
              </span>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setOrgFilter('all');
                    setOrgPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    orgFilter === 'all'
                      ? 'bg-[#001A4D] text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  All ({orgSummaries.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrgFilter('needs_action');
                    setOrgPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                    orgFilter === 'needs_action'
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>Remind List</span>
                  {needsOrgActionCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  )}
                </button>
              </div>
            </div>

            {/* List (Paged to fit cleanly with no internal scrollbars) */}
            <div className="p-3 space-y-2">
              {pagedOrgSummaries.length === 0 ? (
                <div className="py-8 px-4 text-center text-gray-400">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1" />
                  <p className="text-xs font-bold text-gray-700">All club activities cleared!</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {orgFilter === 'needs_action'
                      ? 'No student organization activities currently require liquidation or PAR reminders.'
                      : 'No student organization activities scheduled.'}
                  </p>
                </div>
              ) : (
                pagedOrgSummaries.map((item, idx) => {
                  const act = item.event;
                  return (
                    <div
                      key={act.id || idx}
                      className="p-2.5 rounded-xl bg-gray-50/70 border border-gray-100 hover:bg-blue-50/20 transition-colors space-y-1.5"
                    >
                      {/* Top: Clean Org Badge & Date */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold text-[#0E4EBD] bg-blue-100/70 px-2 py-0.5 rounded-md truncate max-w-[190px]">
                          {item.cleanOrg}
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>{item.concludedDateStr}</span>
                        </span>
                      </div>

                      {/* Middle: Event Title */}
                      <h4
                        className="text-xs font-bold text-[#001A4D] truncate cursor-pointer hover:text-blue-700 leading-snug"
                        title={act.title}
                        onClick={() => navigate(`/home/event-approvals?tab=approved&id=${act.id}`)}
                      >
                        {act.title || 'Untitled Activity'}
                      </h4>

                      {/* Bottom: Compliance Badges & 1-Click Reminder */}
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {item.isExemptFromLiquidation || item.isZeroBudget ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ₱0 / No Budget (Exempt)
                            </span>
                          ) : item.flStatus === 'approved' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              FL Approved
                            </span>
                          ) : item.flStatus === 'under_review' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              FL Reviewing
                            </span>
                          ) : item.flStatus === 'returned' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              FL Returned
                            </span>
                          ) : item.flStatus === 'draft' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              FL Draft
                            </span>
                          ) : item.flStatus === 'missing' ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                item.daysRemaining < 0
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : item.daysRemaining <= 3
                                  ? 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse'
                                  : 'bg-yellow-50 text-yellow-800 border-yellow-200'
                              }`}
                            >
                              {item.daysRemaining < 0
                                ? `No FL (Overdue: ${Math.abs(item.daysRemaining)}d)`
                                : `No FL (${item.daysRemaining}d left)`}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500">
                              FL Pending
                            </span>
                          )}

                          {item.parStatus === 'approved' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              PAR Approved
                            </span>
                          ) : item.parStatus === 'under_review' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              PAR Reviewing
                            </span>
                          ) : item.parStatus === 'missing' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              No PAR
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500">
                              PAR Pending
                            </span>
                          )}
                        </div>

                        {/* Remind Button: Only for ORGS */}
                        {item.needsAction ? (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenReminder({
                                event: { ...act, cleanOrgName: item.cleanOrg },
                                daysRemaining: item.daysRemaining,
                                deadlineDateStr: item.deadlineDateStr,
                                concludedDateStr: item.concludedDateStr,
                              })
                            }
                            title="Send liquidation reminder to club officers"
                            className="px-2 py-0.5 bg-[#FFD41C] hover:bg-amber-400 text-[#001A4D] rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-transform active:scale-95 whitespace-nowrap"
                          >
                            <Bell className="w-3 h-3 text-[#001A4D]" />
                            <span>Remind</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Cleared</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls (Maintains non-scrollable compact presentation) */}
            {totalOrgPages > 1 && (
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-xs bg-gray-50/50">
                <span className="text-[10px] text-gray-500 font-medium">
                  Showing {(orgPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(orgPage * ITEMS_PER_PAGE, displayedOrgSummaries.length)} of {displayedOrgSummaries.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={orgPage <= 1}
                    onClick={() => setOrgPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded-md text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-bold text-gray-700 px-1">
                    {orgPage} / {totalOrgPages}
                  </span>
                  <button
                    type="button"
                    disabled={orgPage >= totalOrgPages}
                    onClick={() => setOrgPage((p) => Math.min(totalOrgPages, p + 1))}
                    className="p-1 rounded-md text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: SAS ACT (SAS Institutional Activities, Explicit Lacking Indicators) ── */}
        {activeTab === 'sas' && (
          <div className="flex flex-col">
            {/* Subfilter Bar */}
            <div className="px-3.5 py-2 bg-blue-50/40 flex items-center justify-between text-xs border-b border-gray-100">
              <span className="text-[11px] font-bold text-[#001A4D]">
                Institutional Compliance
              </span>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setSasFilter('all');
                    setSasPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                    sasFilter === 'all'
                      ? 'bg-[#001A4D] text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  All ({sasSummaries.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSasFilter('needs_action');
                    setSasPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                    sasFilter === 'needs_action'
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>Lacking Items</span>
                  {needsSasActionCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  )}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="p-3 space-y-2">
              {pagedSasSummaries.length === 0 ? (
                <div className="py-8 px-4 text-center text-gray-400">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1" />
                  <p className="text-xs font-bold text-gray-700">All SAS activities cleared!</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {sasFilter === 'needs_action'
                      ? 'No SAS institutional activities currently lack LF-01 or PAR compliance.'
                      : 'No pending SAS institutional activities scheduled.'}
                  </p>
                </div>
              ) : (
                pagedSasSummaries.map((item, idx) => {
                  const act = item.event;
                  return (
                    <div
                      key={act.id || idx}
                      className="p-2.5 rounded-xl bg-white border border-gray-200 hover:bg-blue-50/20 transition-colors space-y-1.5 shadow-2xs"
                    >
                      {/* Top: Clean Org Badge & Date */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold text-[#001A4D] bg-[#FFD41C]/35 px-2 py-0.5 rounded-md truncate max-w-[190px]">
                          Student Affairs & Services (SAS)
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>{item.concludedDateStr}</span>
                        </span>
                      </div>

                      {/* Middle: Event Title */}
                      <h4
                        className="text-xs font-bold text-[#001A4D] truncate cursor-pointer hover:text-blue-700 leading-snug"
                        title={act.title}
                        onClick={() => navigate(`/home/event-approvals?tab=approved&id=${act.id}`)}
                      >
                        {act.title || 'Untitled SAS Activity'}
                      </h4>

                      {/* Bottom: Explicit Compliance Status Showing What Is Lacking */}
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Financial Liquidation (LF-01) Badge */}
                          {item.isExemptFromLiquidation || item.isZeroBudget ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ₱0 / No Budget (Exempt)
                            </span>
                          ) : item.flStatus === 'approved' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              FL Approved
                            </span>
                          ) : item.flStatus === 'under_review' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              FL Reviewing
                            </span>
                          ) : item.flStatus === 'returned' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              FL Returned
                            </span>
                          ) : item.flStatus === 'draft' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              FL Draft
                            </span>
                          ) : item.flStatus === 'missing' ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                item.daysRemaining < 0
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : item.daysRemaining <= 3
                                  ? 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse'
                                  : 'bg-yellow-50 text-yellow-800 border-yellow-200'
                              }`}
                            >
                              {item.daysRemaining < 0
                                ? `Lacks FL (Overdue: ${Math.abs(item.daysRemaining)}d)`
                                : `Lacks FL (${item.daysRemaining}d left)`}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500">
                              FL Upcoming
                            </span>
                          )}

                          {/* Post-Activity Report (PAR) Badge */}
                          {item.parStatus === 'approved' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              PAR Approved
                            </span>
                          ) : item.parStatus === 'under_review' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              PAR Reviewing
                            </span>
                          ) : item.parStatus === 'returned' ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              PAR Returned
                            </span>
                          ) : item.parStatus === 'missing' ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                item.daysRemaining < 0
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : 'bg-amber-100 text-amber-800 border-amber-200'
                              }`}
                            >
                              {item.daysRemaining < 0
                                ? `Lacks PAR (Overdue: ${Math.abs(item.daysRemaining)}d)`
                                : `Lacks PAR`}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-500">
                              PAR Upcoming
                            </span>
                          )}
                        </div>

                        {/* Status Chip (Action Required vs Internal SAS) */}
                        {item.needsAction ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 flex-shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                            <span>
                              {item.needsFl && item.needsPar ? 'Lacks FL & PAR' : item.needsFl ? 'Lacks FL' : 'Lacks PAR'}
                            </span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-[#0E4EBD] border border-blue-200 flex items-center gap-1 flex-shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5 text-[#0E4EBD]" />
                            <span>Internal SAS</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            {totalSasPages > 1 && (
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-xs bg-gray-50/50">
                <span className="text-[10px] text-gray-500 font-medium">
                  Showing {(sasPage - 1) * ITEMS_PER_PAGE + 1}–
                  {Math.min(sasPage * ITEMS_PER_PAGE, displayedSasSummaries.length)} of {displayedSasSummaries.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={sasPage <= 1}
                    onClick={() => setSasPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded-md text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-bold text-gray-700 px-1">
                    {sasPage} / {totalSasPages}
                  </span>
                  <button
                    type="button"
                    disabled={sasPage >= totalSasPages}
                    onClick={() => setSasPage((p) => Math.min(totalSasPages, p + 1))}
                    className="p-1 rounded-md text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: CALENDAR (Month Grid + Selected Date Inspector with View Button) ── */}
        {activeTab === 'calendar' && (
          <div className="p-3 flex flex-col">
            {/* Month Header Controller */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
              <span className="text-xs font-bold text-[#001A4D]">{monthLabel}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-gray-100 rounded-lg text-gray-600 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-gray-100 rounded-lg text-gray-600 cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday Labels */}
            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-gray-400 pb-1">
              {WEEKDAYS.map((wd) => (
                <div key={wd}>{wd}</div>
              ))}
            </div>

            {/* Calendar Cells Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((cell, idx) => {
                if (!cell.isCurrentMonth) {
                  return <div key={idx} className="h-6" />;
                }
                const isSelected = cell.dateStr === selectedDate;
                const isToday = cell.dateStr === todayStr;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`h-6 text-[10px] font-bold rounded-md flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                        : isToday
                        ? 'bg-blue-50 text-blue-700 font-black'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{cell.dayNum}</span>
                    {cell.hasEvents && (
                      <span
                        className={`w-1 h-1 rounded-full absolute bottom-0.5 ${
                          isSelected ? 'bg-[#FFD41C]' : 'bg-blue-600'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Day Inspector (Restored with direct View Redirection Button) */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#001A4D] flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  <span>{formatAppDate(selectedDate)}</span>
                </span>
                <span className="text-[10px] font-semibold text-gray-500">
                  {selectedDayActivities.length} {selectedDayActivities.length === 1 ? 'Activity' : 'Activities'}
                </span>
              </div>

              {selectedDayActivities.length === 0 ? (
                <div className="py-4 text-center bg-gray-50/70 rounded-xl border border-gray-100 text-gray-400">
                  <p className="text-xs">No activities scheduled on this day.</p>
                </div>
              ) : (
                selectedDayActivities.map((act) => {
                  const cleanOrg = resolveCleanOrgName(act, orgMap);
                  const timeStr = act.sessions?.[0]
                    ? `${format12HourTime(act.sessions[0].startTime)} - ${format12HourTime(act.sessions[0].endTime)}`
                    : '';
                  const venue = act.sessions?.[0]?.venue || (act as any).venue || '';

                  return (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-xl bg-gray-50/80 border border-gray-100 hover:border-blue-200 transition-all space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold text-[#0E4EBD] bg-blue-100/70 px-2 py-0.5 rounded-md truncate max-w-[190px]">
                          {cleanOrg}
                        </span>
                        {timeStr && (
                          <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span>{timeStr}</span>
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-[#001A4D] leading-snug">
                        {act.title}
                      </h4>

                      {venue && (
                        <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <span>{venue}</span>
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-gray-100/80">
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          Approved
                        </span>

                        {/* View Activity Button redirecting to specific activity */}
                        <button
                          type="button"
                          onClick={() => navigate(`/home/event-approvals?tab=approved&id=${act.id}`)}
                          className="px-2.5 py-1 bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-2xs active:scale-95"
                          title="View activity proposal details"
                        >
                          <Eye className="w-3 h-3 text-white" />
                          <span>View Activity</span>
                          <ArrowRight className="w-3 h-3 text-[#FFD41C]" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Bottom Action Link ── */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigate('/home/event-approvals?tab=approved')}
          className="w-full py-2.5 px-4 bg-[#001A4D] hover:bg-[#0E4EBD] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
        >
          <span>View All Approved Activities</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default CalendarAndActivityMonitorPane;
