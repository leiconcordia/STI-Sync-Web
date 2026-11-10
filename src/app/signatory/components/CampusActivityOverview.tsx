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
    ...DEFAULT_CAMPUS_FILTERS, period: data.periods.some((period) => period.status === 'ACTIVE' && !period.archived) ? 'ACTIVE' : 'ALL',
  }, data.periods), [data.rows, data.periods]);
  const summary = useMemo(() => campusActivitySummary(rows), [rows]);
  const highlights = useMemo(() => campusActivityHighlights(rows).slice(0, 6), [rows]);
  const calendarActivities = useMemo(() => rows.filter((row) => row.proposalStatus === 'approved' && !['cancelled', 'rejected'].includes(row.activityState))
    .map((row) => ({ ...row.activity, id: row.id, title: row.title })), [rows]);
  const orgMap = useMemo(() => new Map(data.organizations.map((org) => [org.id, { name: org.name, acronym: org.acronym || org.name }])), [data.organizations]);
  const openActivity = (id: string) => navigate(`/signatory/reports?activity=${encodeURIComponent(id)}`);
  if (data.error) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Campus activity records could not be loaded. Refresh to try again.</div>;
  if (data.loading) return <div role="status" className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Loading campus calendar and activity highlights…</div>;
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
    <ActivityCalendar activities={calendarActivities} orgMap={orgMap} title="Calendar of Activities" subtitle="Approved campus activities and their scheduled sessions" viewAllLink="/signatory/reports" layoutMode="stacked" onViewActivity={(activity) => openActivity(activity.id)} />
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="activity-highlights-title">
      <div className="border-b p-5"><h2 id="activity-highlights-title" className="text-base font-bold text-[#001A4D]">Activity Highlights</h2><p className="mt-1 text-xs text-slate-500">Current academic periods · Requirements and recent activity progress</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => navigate('/signatory/reports?quick=missing_par')} className="rounded-lg bg-amber-50 p-2 text-left text-xs text-amber-900"><strong className="block text-lg">{summary.missingPAR}</strong>PAR not submitted</button>
          <button type="button" onClick={() => navigate('/signatory/reports?quick=missing_fl')} className="rounded-lg bg-rose-50 p-2 text-left text-xs text-rose-900"><strong className="block text-lg">{summary.missingFL}</strong>Required FL not submitted</button>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {!highlights.length && <p className="p-5 text-sm text-slate-500">No campus activities in the selected academic periods.</p>}
        {highlights.map(({ row, message, priority }) => <button type="button" key={row.id} onClick={() => openActivity(row.id)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50">
          {priority < 3 ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
          <span className="min-w-0"><strong className="block text-sm text-[#001A4D]">{row.title}</strong><span className="mt-1 block text-xs text-slate-600">{message}</span><span className="mt-1 block text-[11px] text-slate-400">{row.organizer}{row.dates.length ? ` · ${formatAppDate(row.dates.at(-1))}` : ''}</span>{row.overdue && <span className="mt-1 block text-xs font-semibold text-rose-700">FL {Math.abs(row.daysRemaining!)} days overdue</span>}</span>
        </button>)}
      </div>
      <button type="button" onClick={() => navigate('/signatory/reports')} className="flex w-full items-center justify-between border-t p-4 text-xs font-bold text-blue-700 hover:bg-blue-50">View Campus Reports<ArrowRight className="h-4 w-4" /></button>
    </section>
  </div>;
}
