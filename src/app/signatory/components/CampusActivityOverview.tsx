import React, { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import ActivityCalendar from '../../modules/events/components/ActivityCalendar';
import { formatAppDate } from '../../utils/date';
import { campusActivityHighlights, campusActivitySummary, DEFAULT_CAMPUS_FILTERS, filterCampusActivityRows } from '../utils/campus-activity-report';
import type { useCampusActivityData } from '../hooks/useCampusActivityData';

export default function CampusActivityOverview({ data }: { data: ReturnType<typeof useCampusActivityData> }) {
  const navigate = useNavigate();
  const rows = useMemo(() => filterCampusActivityRows(data.rows, {
    ...DEFAULT_CAMPUS_FILTERS, period: 'ALL',
  }, data.periods), [data.rows, data.periods]);
  const summary = useMemo(() => campusActivitySummary(rows), [rows]);
  const highlights = useMemo(() => campusActivityHighlights(rows).slice(0, 6), [rows]);
  const calendarActivities = useMemo(() => rows
    .filter((row) => row.proposalStatus === 'approved' && !['cancelled', 'rejected'].includes(row.activityState))
    .map((row) => ({
      ...row.activity,
      id: row.id,
      title: row.title,
      sessions: row.activity?.sessions?.length
        ? row.activity.sessions
        : row.dates.map((date) => ({ date })),
      targetImplementationDate:
        (row.activity as any)?.targetImplementationDate ||
        row.dates[0] ||
        undefined,
    })), [rows]);
  const orgMap = useMemo(() => new Map(data.organizations.map((org) => [org.id, { name: org.name, acronym: org.acronym || org.name }])), [data.organizations]);
  const openActivity = (id: string) => navigate(`/signatory/reports?activity=${encodeURIComponent(id)}`);
  if (data.error) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Campus activity records could not be loaded. Refresh to try again.</div>;
  if (data.loading) return <div role="status" className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Loading campus calendar and activity highlights…</div>;
  return <div className="space-y-6">
    <ActivityCalendar activities={calendarActivities} orgMap={orgMap} title="Calendar of Activities" subtitle="Approved campus activities and their scheduled sessions" viewAllLink="/signatory/reports" layoutMode="split" onViewActivity={(activity) => openActivity(activity.id)} />
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="activity-highlights-title">
      <div className="flex flex-col justify-between gap-4 border-b p-5 sm:flex-row sm:items-center">
        <div>
          <h2 id="activity-highlights-title" className="text-base font-bold text-[#001A4D]">Activity Highlights</h2>
          <p className="mt-1 text-xs text-slate-500">All campus activities · Requirements and recent activity progress</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-80">
          <button type="button" onClick={() => navigate('/signatory/reports?quick=missing_par')} className="rounded-lg bg-amber-50 p-2 text-left text-xs text-amber-900"><strong className="block text-lg">{summary.missingPAR}</strong>PAR not submitted</button>
          <button type="button" onClick={() => navigate('/signatory/reports?quick=missing_fl')} className="rounded-lg bg-rose-50 p-2 text-left text-xs text-rose-900"><strong className="block text-lg">{summary.missingFL}</strong>Required FL not submitted</button>
        </div>
      </div>
      <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
        {!highlights.length && <p className="col-span-full p-5 text-sm text-slate-500">No campus activities recorded yet.</p>}
        {highlights.map(({ row, message, priority }) => <button type="button" key={row.id} onClick={() => openActivity(row.id)} className="flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left hover:bg-slate-50 sm:border-r">
          {priority < 3 ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
          <span className="min-w-0"><strong className="block text-sm text-[#001A4D]">{row.title}</strong><span className="mt-1 block text-xs text-slate-600">{message}</span><span className="mt-1 block text-[11px] text-slate-400">{row.organizer}{row.dates.length ? ` · ${formatAppDate(row.dates.at(-1))}` : ''}</span>{row.overdue && <span className="mt-1 block text-xs font-semibold text-rose-700">FL {Math.abs(row.daysRemaining!)} days overdue</span>}</span>
        </button>)}
      </div>
      <button type="button" onClick={() => navigate('/signatory/reports')} className="flex w-full items-center justify-between border-t p-4 text-xs font-bold text-blue-700 hover:bg-blue-50">View Campus Reports<ArrowRight className="h-4 w-4" /></button>
    </section>
  </div>;
}
