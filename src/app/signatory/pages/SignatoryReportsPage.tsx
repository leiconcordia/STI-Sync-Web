import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import { Download, Search, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import { useCampusActivityData } from '../hooks/useCampusActivityData';
import { campusActivitySummary, DEFAULT_CAMPUS_FILTERS, filterCampusActivityRows, STATUS_LABELS } from '../utils/campus-activity-report';
import type { CampusReportFilters } from '../utils/campus-activity-report';
import { activityDateLabel, activityDeadlineLabel, campusReportSnapshot, downloadCampusCSV, downloadCampusPDF } from '../utils/campus-report-export';
import CampusActivityDetail from '../components/CampusActivityDetail';
import CampusStatusBadge from '../components/CampusStatusBadge';

const QUICK_FILTERS = [
  ['ALL', 'All activities'], ['needs_action', 'Needs action'], ['missing_par', 'Missing PAR'], ['missing_fl', 'Missing FL'],
  ['returned', 'Returned'], ['my_signature', 'Awaiting My Signature'], ['cleared', 'Fully Cleared'], ['overdue', 'Overdue FL'],
] as const;
const SELECT_CLASS = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600';
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={SELECT_CLASS}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}

export default function SignatoryReportsPage() {
  const { session, onOpenSignatureModal } = useOutletContext<{ session: any; onOpenSignatureModal: () => void }>();
  const documents = useSignatoryDocuments(session);
  const data = useCampusActivityData(documents, session);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<CampusReportFilters>({ ...DEFAULT_CAMPUS_FILTERS });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const quickParam = params.get('quick') || 'ALL';
  const quick = QUICK_FILTERS.some(([value]) => value === quickParam) ? quickParam : 'ALL';
  const effectiveFilters = useMemo(() => ({ ...filters, quick }), [filters, quick]);
  const rows = useMemo(() => filterCampusActivityRows(data.rows, effectiveFilters, data.periods), [data.rows, data.periods, effectiveFilters]);
  const summary = useMemo(() => campusActivitySummary(rows), [rows]);
  const selectedId = params.get('activity');
  const selected = selectedId ? data.rows.find((row) => row.id === selectedId || row.activity.id === selectedId) : undefined;
  const years = useMemo(() => [...new Set([...data.periods.map((period) => period.academicYear), ...data.rows.map((row) => row.academicYear)].filter(Boolean))].sort().reverse(), [data.periods, data.rows]);
  const terms = useMemo(() => [...new Set([...data.periods.map((period) => period.semester), ...data.rows.map((row) => row.semester)].filter(Boolean))].sort(), [data.periods, data.rows]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [filters, quick, pageSize]);
  const change = (updates: Partial<CampusReportFilters>) => setFilters((previous) => ({ ...previous, ...updates }));
  const setQuick = (value: string) => setParams((previous) => { const next = new URLSearchParams(previous); value === 'ALL' ? next.delete('quick') : next.set('quick', value); return next; });
  const selectActivity = (id?: string) => setParams((previous) => { const next = new URLSearchParams(previous); id ? next.set('activity', id) : next.delete('activity'); return next; });
  const reset = () => { setFilters({ ...DEFAULT_CAMPUS_FILTERS }); setQuick('ALL'); };
  const statusOptions = (values: string[]): [string, string][] => [['ALL', 'All'], ...values.map((value): [string, string] => [value, STATUS_LABELS[value] || value])];
  const exportReport = async (format: 'pdf' | 'csv') => {
    setExporting(true);
    try {
      const snapshot = campusReportSnapshot(rows, effectiveFilters, data.periods, data.organizations, session?.name);
      if (format === 'pdf') await downloadCampusPDF(snapshot); else downloadCampusCSV(snapshot);
      toast.success(`Exported ${rows.length} filtered activities as ${format.toUpperCase()}.`);
    } catch (error: any) { toast.error(error?.message || 'Unable to export the report. Please try again.'); }
    finally { setExporting(false); }
  };
  const invalidDates = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const exportDisabled = data.loading || Boolean(data.error) || !rows.length || exporting || invalidDates;

  return <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><h1 className="text-2xl font-bold text-[#001A4D] sm:text-3xl">Campus Activity Reports</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">One activity record from proposal to financial liquidation and post-activity report. Track what has concluded and what still needs to be cleared.</p></div>
      <div className="flex shrink-0 gap-2">{(['pdf', 'csv'] as const).map((format) => <button type="button" key={format} onClick={() => void exportReport(format)} disabled={exportDisabled} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? 'Exporting…' : `Export ${format.toUpperCase()}`}</button>)}</div>
    </div>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Filtered activity summary">
      {[
        ['Activities', summary.total], ['Concluded', summary.concluded], ['PAR not submitted', summary.missingPAR],
        ['Required FL not submitted', summary.missingFL], ['Returned for revision', summary.returned], ['Fully cleared', summary.cleared],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#001A4D]">{data.loading || data.error ? '—' : value}</p></div>)}
    </section>
    <section aria-label="Campus report filters" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Search campus activities</span><input aria-label="Search campus activities" value={filters.search} onChange={(event) => change({ search: event.target.value })} placeholder="Search activity name, organizer, or document reference..." className={`${SELECT_CLASS} pl-10`} /></label>
        <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Reset filters</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FilterSelect label="Academic period" value={filters.period} onChange={(period) => change({ period, academicYear: 'ALL', semester: 'ALL' })} options={[
          ['ACTIVE', 'Active academic periods'], ['ALL', 'All academic periods'],
          ...data.periods.map((period): [string, string] => [period.id, `${period.label || `${period.academicYear} ${period.semester}`} (${period.academicLevel || (String(period.semester).includes('Trimester') ? 'SHS' : 'College')})`]),
        ]} />
        <FilterSelect label="Academic year" value={filters.academicYear} onChange={(academicYear) => change({ academicYear, period: 'ALL' })} options={[['ALL', 'All academic years'], ...years.map((year): [string, string] => [year, year])]} />
        <FilterSelect label="Semester / Term" value={filters.semester} onChange={(semester) => change({ semester, period: 'ALL' })} options={[['ALL', 'All terms'], ...terms.map((term): [string, string] => [term, term])]} />
        <FilterSelect label="Academic scope" value={filters.scope} onChange={(scope) => change({ scope })} options={[['ALL', 'College & SHS'], ['COLLEGE', 'College'], ['SHS', 'SHS']]} />
        <FilterSelect label="Organizer" value={filters.organizationId} onChange={(organizationId) => change({ organizationId })} options={[
          ['ALL', 'All organizations & SAS'], ['sas', 'Student Affairs & Services (SAS)'],
          ...data.organizations.filter((org) => org.id !== 'sas').map((org): [string, string] => [org.id, org.acronym || org.name]),
        ]} />
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Quick report filters">{QUICK_FILTERS.map(([value, label]) => <button type="button" key={value} onClick={() => setQuick(value)} aria-pressed={quick === value} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${quick === value ? 'border-[#001A4D] bg-[#001A4D] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div>
      <details className="border-t border-slate-100 pt-3"><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-blue-800"><SlidersHorizontal className="h-4 w-4" />Date and document status filters</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-600">Activity date from<input aria-label="Activity date from" type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={(event) => change({ startDate: event.target.value })} className={SELECT_CLASS} /></label>
          <label className="space-y-1 text-xs text-slate-600">Activity date to<input aria-label="Activity date to" type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={(event) => change({ endDate: event.target.value })} className={SELECT_CLASS} /></label>
          <FilterSelect label="Proposal status" value={filters.proposalStatus} onChange={(proposalStatus) => change({ proposalStatus })} options={statusOptions(['under_review', 'returned', 'approved', 'cancelled', 'rejected'])} />
          <FilterSelect label="Activity status" value={filters.activityState} onChange={(activityState) => change({ activityState })} options={statusOptions(['under_review', 'upcoming', 'ongoing', 'awaiting_conclusion', 'concluded', 'cancelled', 'rejected'])} />
          <FilterSelect label="FL status" value={filters.flStatus} onChange={(flStatus) => change({ flStatus })} options={statusOptions(['missing', 'draft', 'under_review', 'returned', 'approved', 'exempt', 'not_due', 'not_required', 'archived'])} />
          <FilterSelect label="PAR status" value={filters.parStatus} onChange={(parStatus) => change({ parStatus })} options={statusOptions(['missing', 'draft', 'under_review', 'returned', 'approved', 'not_due', 'not_required', 'archived'])} />
        </div>
      </details>
      <p className="text-xs text-slate-500">Dates filter individual activity sessions. Zero-budget activities are excluded from FL requirements. PAR has no configured overdue policy.</p>
      {invalidDates && <p role="alert" className="text-xs text-rose-700">The end date must be on or after the start date.</p>}
      {!data.loading && !data.error && filters.period === 'ACTIVE' && !data.periods.some((period) => period.status === 'ACTIVE' && !period.archived) && <p role="status" className="text-xs text-amber-800">No active academic period is configured. Select “All academic periods” to view historical records.</p>}
    </section>
    {data.error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">Unable to load campus records. Refresh and try again. Compliance counts and exports are unavailable until all sources load successfully.</div>
      : data.loading ? <p role="status" className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">Loading campus activity records…</p>
      : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto"><table className="w-full min-w-[1350px] text-left text-xs" aria-label="Campus activity compliance report">
          <thead className="bg-slate-50 text-slate-600"><tr>{['Activity Name / Reference', 'Organizer', 'Activity Dates', 'Proposal', 'Activity Status', 'FL', 'PAR', 'Outstanding Requirements', 'FL Deadline', 'Actions'].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!visibleRows.length && <tr><td colSpan={10} className="p-12 text-center text-sm text-slate-500">No activities match the selected filters.</td></tr>}
            {visibleRows.map((row) => <tr key={row.id} data-activity-id={row.id} className="hover:bg-slate-50">
              <td className="min-w-[180px] max-w-[250px] px-4 py-4"><button type="button" onClick={() => selectActivity(row.id)} className="text-left text-sm font-bold text-[#001A4D] hover:underline">{row.title}</button><span className="mt-1 block text-[11px] text-slate-400">{row.reference}</span>{row.fullyCleared && <span className="mt-1 block font-semibold text-emerald-700">Fully cleared</span>}</td>
              <td className="max-w-[160px] px-4 py-4">{row.organizer}</td><td className="min-w-[120px] max-w-[180px] px-4 py-4">{activityDateLabel(row)}</td>
              <td className="px-4 py-4"><CampusStatusBadge status={row.proposalStatus} /></td><td className="px-4 py-4"><CampusStatusBadge status={row.activityState} /></td>
              <td className="min-w-[120px] px-4 py-4"><CampusStatusBadge status={row.flStatus} /></td><td className="min-w-[110px] px-4 py-4"><CampusStatusBadge status={row.parStatus} /></td>
              <td className="min-w-[180px] max-w-[250px] px-4 py-4 text-slate-600">{row.outstanding}{row.awaitingMySignature && <span className="mt-1 block font-semibold text-blue-700">Awaiting your signature</span>}</td>
              <td className={`min-w-[130px] px-4 py-4 ${row.overdue ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>{activityDeadlineLabel(row)}</td>
              <td className="px-4 py-4"><button type="button" onClick={() => selectActivity(row.id)} aria-label={`View activity ${row.title}`} className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50">View Activity</button></td>
            </tr>)}
          </tbody>
        </table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-xs text-slate-500"><span>{rows.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, rows.length)} of ${rows.length}` : '0'} activities · Exports include all filtered rows</span>
          <div className="flex items-center gap-3"><label>Rows <select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded border p-1">{[10, 20, 50].map((size) => <option key={size}>{size}</option>)}</select></label><button type="button" aria-label="Previous report page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded border p-1 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><span>{currentPage} / {pages}</span><button type="button" aria-label="Next report page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded border p-1 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div>
        </div>
      </section>}
    {selected && !data.loading && !data.error && <CampusActivityDetail key={selected.id} row={selected} inspectable={data.inspectable} session={session} onClose={() => selectActivity()} onOpenSignaturePad={onOpenSignatureModal} />}
    {selectedId && !selected && !data.loading && !data.error && <div role="status" className="rounded-xl border bg-white p-4 text-sm text-slate-600">This activity is no longer available. <button type="button" onClick={() => selectActivity()} className="font-semibold text-blue-700 underline">Dismiss</button></div>}
  </div>;
}
