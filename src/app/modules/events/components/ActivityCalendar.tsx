/**
 * src/app/modules/events/components/ActivityCalendar.tsx
 *
 * Dedicated, interactive Calendar of Activities for Admin and Officer Dashboards.
 * Plots approved activities based on implementation dates and session schedules.
 * Provides month navigation, indicator dots (with multi-activity indicators),
 * and a dynamic selected-day activity inspector.
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  ArrowRight,
  Sparkles,
  Users,
  CheckCircle2,
  Calendar as CalendarIcon,
  Layers,
  Building,
  Eye,
} from 'lucide-react';
import type { EventDocument, EventSession } from '../types/event.types';
import { formatAppDate, format12HourTime } from '../../../utils/date';
import { resolveCleanOrgAcronym } from '../utils/organization-display.utils';

interface OrganizationMeta {
  name: string;
  acronym: string;
  logoUrl?: string | null;
}

interface ActivityCalendarProps {
  activities: EventDocument[];
  orgMap?: Map<string, OrganizationMeta>;
  title?: string;
  subtitle?: string;
  viewAllLink: string;
  isOfficer?: boolean;
  activeOrgAcronym?: string;
  layoutMode?: 'split' | 'stacked' | 'auto';
  onViewActivity?: (activity: EventDocument) => void;
}

/**
 * Safely extracts a YYYY-MM-DD string from various date formats
 */
function normalizeDateStr(raw: any): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  if (typeof raw.toDate === 'function') {
    try {
      const d = raw.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch {
      return null;
    }
  }
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const day = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return null;
}

/**
 * Extracts all implementation dates (YYYY-MM-DD) for an activity
 */
function getActivityDateKeys(activity: EventDocument): string[] {
  const dates = new Set<string>();

  if (Array.isArray(activity.sessions) && activity.sessions.length > 0) {
    activity.sessions.forEach((s) => {
      const d = normalizeDateStr(s.date);
      if (d) dates.add(d);
    });
  }

  const fallback = normalizeDateStr(
    (activity as any).targetImplementationDate ||
    (activity as any).implementationDate ||
    (activity as any).startDate ||
    (activity as any).targetDate ||
    (activity as any).eventDate ||
    (activity as any).date
  );
  if (fallback) {
    dates.add(fallback);
  }

  return Array.from(dates);
}

/**
 * Resolves the matching session for a given date, or defaults to the first session
 */
function getMatchingSession(activity: EventDocument, dateKey: string): EventSession | undefined {
  if (Array.isArray(activity.sessions) && activity.sessions.length > 0) {
    const exact = activity.sessions.find((s) => normalizeDateStr(s.date) === dateKey);
    return exact || activity.sessions[0];
  }
  return undefined;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ActivityCalendar({
  activities = [],
  orgMap,
  title = 'Calendar of Activities',
  subtitle,
  viewAllLink,
  isOfficer = false,
  activeOrgAcronym,
  layoutMode = 'auto',
  onViewActivity,
}: ActivityCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const basePath = useMemo(() => {
    if (viewAllLink) return viewAllLink.split('?')[0];
    return isOfficer ? '/officer/events' : '/home/event-approvals';
  }, [viewAllLink, isOfficer]);

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => todayStr);

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth(); // 0-indexed

  const monthName = useMemo(() => {
    return currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [currentMonthDate]);

  // Index activities by YYYY-MM-DD
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, EventDocument[]>();
    activities.forEach((act) => {
      const dateKeys = getActivityDateKeys(act);
      dateKeys.forEach((dKey) => {
        const list = map.get(dKey) || [];
        if (!list.some((existing) => existing.id === act.id)) {
          list.push(act);
        }
        map.set(dKey, list);
      });
    });
    return map;
  }, [activities]);

  // Total unique dates with activities this month
  const activeDaysThisMonthCount = useMemo(() => {
    let count = 0;
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    activitiesByDate.forEach((list, dateStr) => {
      if (dateStr.startsWith(prefix) && list.length > 0) {
        count++;
      }
    });
    return count;
  }, [activitiesByDate, year, month]);

  // Calendar grid calculation
  const calendarGrid = useMemo(() => {
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDaysCount = new Date(year, month, 0).getDate();

    // Padding from previous month
    const prevPadding = Array.from({ length: firstDayOfWeek }, (_, idx) => {
      const dayNum = prevMonthDaysCount - firstDayOfWeek + idx + 1;
      const d = new Date(year, month - 1, dayNum);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return { dayNum, isCurrentMonth: false, dateStr, date: d };
    });

    // Days in current month
    const currentDays = Array.from({ length: totalDaysInMonth }, (_, idx) => {
      const dayNum = idx + 1;
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return { dayNum, isCurrentMonth: true, dateStr, date: new Date(year, month, dayNum) };
    });

    // Next month padding to fill out 35 or 42 cells
    const currentCells = prevPadding.length + currentDays.length;
    const nextPaddingCount = currentCells % 7 === 0 ? 0 : 7 - (currentCells % 7);
    const nextPadding = Array.from({ length: nextPaddingCount }, (_, idx) => {
      const dayNum = idx + 1;
      const d = new Date(year, month + 1, dayNum);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      return { dayNum, isCurrentMonth: false, dateStr, date: d };
    });

    return [...prevPadding, ...currentDays, ...nextPadding];
  }, [year, month]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const handleGoToToday = () => {
    const now = new Date();
    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(todayStr);
  };

  // Selected date activities
  const selectedDateActivities = useMemo(() => {
    return activitiesByDate.get(selectedDate) || [];
  }, [activitiesByDate, selectedDate]);

  // Upcoming activities across current month for fallback / preview
  const upcomingActivitiesThisMonth = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const allMatching: { activity: EventDocument; dateKey: string }[] = [];
    const seen = new Set<string>();

    activities.forEach((act) => {
      const dateKeys = getActivityDateKeys(act);
      const matchingKey = dateKeys.find((k) => k.startsWith(prefix) && k >= todayStr) || dateKeys.find((k) => k.startsWith(prefix));
      if (matchingKey && !seen.has(act.id)) {
        seen.add(act.id);
        allMatching.push({ activity: act, dateKey: matchingKey });
      }
    });

    return allMatching.sort((a, b) => a.dateKey.localeCompare(b.dateKey)).slice(0, 3);
  }, [activities, year, month, todayStr]);

  // Resolve acronym for an activity
  const resolveHostAcronym = (act: EventDocument): string => {
    if (activeOrgAcronym && isOfficer) {
      return activeOrgAcronym;
    }
    return resolveCleanOrgAcronym(act, orgMap as any);
  };

  // Formatted selected date text
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return 'Select a date';
    const [y, m, d] = selectedDate.split('-').map(Number);
    if (!y || !m || !d) return selectedDate;
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('default', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDate]);

  const defaultSubtitle = isOfficer
    ? 'Approved activities scheduled for your organization by implementation date'
    : 'Official institutional (STI SAS) and organization activities approved for execution';

  return (
    <div className="bg-white border border-[#E0E0E0] shadow-sm rounded-2xl overflow-hidden">
      {/* ── CARD HEADER ── */}
      <div className="border-b border-gray-100 py-4 px-5 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
            <CalendarDays className="w-5 h-5 text-[#0E4EBD]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[#001A4D] text-base sm:text-lg font-bold tracking-tight">
                {title}
              </h3>
              <span className="px-2.5 py-0.5 bg-[#001A4D] text-[#FFD41C] rounded-full text-[11px] font-mono font-bold shadow-2xs">
                {activities.length} {activities.length === 1 ? 'Approved' : 'Approved'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {subtitle || defaultSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          {/* Quick Today button */}
          <button
            type="button"
            onClick={handleGoToToday}
            className="px-3 py-1.5 text-xs font-bold rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer shadow-2xs"
            title="Jump to today"
          >
            Today
          </button>

          {/* View All Activities Link */}
          <Link
            to={viewAllLink}
            className="px-3 py-1.5 text-xs font-bold text-[#0E4EBD] hover:text-[#001A4D] hover:bg-blue-50 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ── MAIN CONTENT (CALENDAR + DAY INSPECTOR) ── */}
      <div className="p-4 sm:p-6">
        <div className={`grid gap-6 ${layoutMode === 'stacked' ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-12'}`}>
          {/* ── LEFT: MONTHLY CALENDAR GRID ── */}
          <div className={`${layoutMode === 'stacked' ? 'w-full' : 'xl:col-span-7'} space-y-4`}>
            {/* Calendar Controls (Month Selector) */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black text-[#001A4D]">
                  {monthName}
                </span>
                {activeDaysThisMonthCount > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    {activeDaysThisMonthCount} active {activeDaysThisMonthCount === 1 ? 'date' : 'dates'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer"
                  title="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors cursor-pointer"
                  title="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-[11px] font-black uppercase tracking-wider text-gray-400 py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Month Day Cells */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {calendarGrid.map((day, idx) => {
                const dayActivities = activitiesByDate.get(day.dateStr) || [];
                const hasActivities = dayActivities.length > 0;
                const isSelected = selectedDate === day.dateStr;
                const isToday = day.dateStr === todayStr;
                const activityCount = dayActivities.length;

                return (
                  <button
                    key={`${day.dateStr}_${idx}`}
                    type="button"
                    onClick={() => setSelectedDate(day.dateStr)}
                    className={`min-h-[52px] sm:min-h-[60px] p-1 sm:p-1.5 rounded-xl border flex flex-col items-center justify-between transition-all cursor-pointer relative group ${
                      isSelected
                        ? 'bg-[#001A4D] text-white border-[#001A4D] shadow-md ring-2 ring-[#0E4EBD]/30'
                        : isToday
                        ? 'bg-blue-50/60 border-blue-300 text-[#001A4D] hover:bg-blue-100/60'
                        : hasActivities
                        ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-400 text-gray-800 hover:bg-emerald-50/80 shadow-2xs'
                        : day.isCurrentMonth
                        ? 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-700'
                        : 'bg-gray-50/50 border-gray-100 text-gray-400 opacity-60'
                    }`}
                    title={`${day.dateStr}: ${activityCount > 0 ? `${activityCount} activity/activities scheduled` : 'No scheduled activities'}`}
                  >
                    {/* Top Row: Day Number & Today indicator */}
                    <div className="w-full flex items-center justify-between px-0.5">
                      <span
                        className={`text-xs sm:text-sm font-bold ${
                          isSelected
                            ? 'text-[#FFD41C]'
                            : isToday
                            ? 'text-[#0E4EBD] font-black'
                            : 'text-gray-800'
                        }`}
                      >
                        {day.dayNum}
                      </span>
                      {isToday && !isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0E4EBD]" title="Today" />
                      )}
                    </div>

                    {/* Bottom Indicator Dots & Badge */}
                    <div className="w-full flex items-center justify-center pb-0.5">
                      {hasActivities ? (
                        activityCount === 1 ? (
                          // Single Activity: Clean solid dot
                          <span
                            className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${
                              isSelected
                                ? 'bg-[#FFD41C] ring-2 ring-[#001A4D]'
                                : 'bg-emerald-500 ring-1 ring-white'
                            }`}
                          />
                        ) : (
                          // 2 or More Activities: Multi-dot indicator with count pill
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none shadow-2xs transition-transform group-hover:scale-105 ${
                              isSelected
                                ? 'bg-[#FFD41C] text-[#001A4D]'
                                : 'bg-emerald-600 text-white'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span>{activityCount}</span>
                          </div>
                        )
                      ) : (
                        <span className="h-2" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Calendar Legend */}
            <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 font-medium">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Scheduled Activity</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white leading-none">
                    2+
                  </span>
                  <span>Multiple Activities</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0E4EBD]" />
                  <span>Today</span>
                </span>
              </div>
              <div className="text-[11px] text-gray-400">
                Click any date to inspect details
              </div>
            </div>
          </div>

          {/* ── RIGHT: SELECTED DATE ACTIVITY INSPECTOR ── */}
          <div className={`${layoutMode === 'stacked' ? 'w-full' : 'xl:col-span-5'} flex flex-col justify-between space-y-4`}>
            <div className="bg-gray-50/70 border border-gray-200 rounded-2xl p-4 sm:p-5 flex-1 flex flex-col">
              {/* Inspector Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-200/80 mb-4">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[#0E4EBD]" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Date Inspector
                    </h4>
                    <p className="text-sm font-black text-[#001A4D] leading-tight">
                      {formattedSelectedDate}
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold shadow-2xs ${
                    selectedDateActivities.length > 0
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-gray-200/70 text-gray-600'
                  }`}
                >
                  {selectedDateActivities.length} {selectedDateActivities.length === 1 ? 'Activity' : 'Activities'}
                </span>
              </div>

              {/* Inspector Body: Activities on Selected Date */}
              {selectedDateActivities.length > 0 ? (
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[420px] pr-1">
                  {selectedDateActivities.map((act) => {
                    const session = getMatchingSession(act, selectedDate);
                    const hostAcronym = resolveHostAcronym(act);
                    const timeStr = session?.startTime
                      ? `${format12HourTime(session.startTime)}${session.endTime ? ` – ${format12HourTime(session.endTime)}` : ''}`
                      : 'Schedule TBD';
                    const venueStr = act.customVenueName || session?.venueName || 'Campus Venue';
                    const refNo = (act as any).referenceNo || (act as any).referenceNumber || act.referenceId || '';
                    const rawParticipants = (act as any).estimatedAttendance || (act as any).estAttendanceCount || act.expectedParticipantCount;
                    const cleanParticipantCount = rawParticipants
                      ? String(rawParticipants).replace(/\s*participants?/gi, '').trim()
                      : null;
                    const activityDetailUrl = `${basePath}?id=${encodeURIComponent(act.id)}&tab=approved`;

                    return (
                      <div
                        key={act.id}
                        className="bg-white border border-gray-200/90 rounded-xl p-3.5 shadow-2xs hover:border-blue-300 hover:shadow-xs transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#001A4D] text-[#FFD41C] uppercase tracking-wider">
                              {hostAcronym}
                            </span>
                            {refNo && (
                              <span className="text-[11px] text-gray-400 font-mono">
                                {refNo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Approved</span>
                            </span>
                            {act.fundingSource === 'organization_funds' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                💼 Club Treasury
                              </span>
                            ) : act.fundingSource === 'zero_budget' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                📄 ₱0 Budget
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#001A4D] border border-blue-200">
                                🏛️ School Budget
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <Link
                            to={activityDetailUrl}
                            className="text-sm font-bold text-[#001A4D] hover:text-[#0E4EBD] transition-colors line-clamp-2 block"
                          >
                            {act.title}
                          </Link>
                          {session?.title && session.title !== 'General' && (
                            <p className="text-[11px] text-blue-700 font-semibold mt-0.5">
                              Session: {session.title}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 pt-1 border-t border-gray-100">
                          <div className="flex items-center gap-1.5 truncate">
                            <Clock className="w-3.5 h-3.5 text-[#0E4EBD] shrink-0" />
                            <span className="truncate">{timeStr}</span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-[#0E4EBD] shrink-0" />
                            <span className="truncate">{venueStr}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 gap-2 flex-wrap sm:flex-nowrap">
                          {cleanParticipantCount ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                              <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>Estimated {cleanParticipantCount} participants</span>
                            </div>
                          ) : (
                            <div />
                          )}

                          {onViewActivity ? (
                            <button
                              type="button"
                              onClick={() => onViewActivity(act)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#0E4EBD] bg-blue-50/90 hover:bg-[#0E4EBD] hover:text-white border border-blue-200/80 hover:border-[#0E4EBD] transition-all shadow-2xs group cursor-pointer ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#0E4EBD] group-hover:text-white group-hover:scale-110 transition-all" />
                              <span>View Activity</span>
                              <ArrowRight className="w-3 h-3 text-[#0E4EBD] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                            </button>
                          ) : (
                            <Link
                              to={activityDetailUrl}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#0E4EBD] bg-blue-50/90 hover:bg-[#0E4EBD] hover:text-white border border-blue-200/80 hover:border-[#0E4EBD] transition-all shadow-2xs group cursor-pointer ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#0E4EBD] group-hover:text-white group-hover:scale-110 transition-all" />
                              <span>View Activity</span>
                              <ArrowRight className="w-3 h-3 text-[#0E4EBD] group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Empty State for Selected Date + Upcoming Activities preview
                <div className="flex-1 flex flex-col justify-between py-2">
                  <div className="text-center py-6 px-2 space-y-2">
                    <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                      <CalendarDays className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-xs font-bold text-gray-700">
                      No activities scheduled on this date
                    </p>
                    <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                      Click any date with an indicator dot (•) on the calendar to inspect its scheduled activities.
                    </p>
                  </div>

                  {/* Upcoming Activities This Month Quick List */}
                  {upcomingActivitiesThisMonth.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-200/70">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#FFD41C]" />
                          <span>Upcoming This Month</span>
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {upcomingActivitiesThisMonth.length} scheduled
                        </span>
                      </div>
                      <div className="space-y-2">
                        {upcomingActivitiesThisMonth.map(({ activity, dateKey }) => (
                          <div
                            key={activity.id}
                            className="p-2.5 rounded-xl bg-white border border-gray-200/80 hover:border-blue-300 hover:bg-blue-50/30 transition-all flex items-center justify-between gap-2 group"
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedDate(dateKey)}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <p className="text-xs font-bold text-gray-800 truncate group-hover:text-[#0E4EBD]">
                                {activity.title}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {formatAppDate(dateKey)} • {resolveHostAcronym(activity)}
                              </p>
                            </button>
                            {onViewActivity ? <button
                              type="button"
                              onClick={() => onViewActivity(activity)}
                              className="text-[10px] font-bold text-[#0E4EBD] bg-blue-50 hover:bg-[#0E4EBD] hover:text-white px-2.5 py-1 rounded-md border border-blue-200/70 transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                              title="View Activity Details"
                            ><Eye className="w-3 h-3" /><span>View</span></button> : <Link
                              to={`${basePath}?id=${encodeURIComponent(activity.id)}&tab=approved`}
                              className="text-[10px] font-bold text-[#0E4EBD] bg-blue-50 hover:bg-[#0E4EBD] hover:text-white px-2.5 py-1 rounded-md border border-blue-200/70 transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                              title="View Activity Details"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </Link>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

