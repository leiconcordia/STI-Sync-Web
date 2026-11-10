import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { Search, FileSpreadsheet, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import { useAllEvents } from '../../modules/events/hooks/useEventStream';
import { resolveActivityName } from '../../modules/events/utils/activity-compliance.utils';
import { documentStatus } from '../utils/campus-activity-report';
import { formatCurrency } from '../../utils/currency';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import { LiquidationExportPreviewModal } from '../../modules/finance/components/LiquidationExportPreviewModal';
import LiquidationEndorsementModal from './LiquidationEndorsementModal';
import PAREndorsementModal from './PAREndorsementModal';
import CampusStatusBadge from './CampusStatusBadge';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';

export default function SignatoryDocumentTable({ kind }: { kind: 'liquidation' | 'par' }) {
  const { session, onOpenSignatureModal } = useOutletContext<{ session: any; onOpenSignatureModal: () => void }>();
  const documents = useSignatoryDocuments(session);
  const { events } = useAllEvents();
  const activities = useMemo(() => [...events, ...documents.allProposals], [events, documents.allProposals]);
  const [tab, setTab] = useState<'pending' | 'endorsed' | 'returned'>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LiquidationDocument | PostActivityReportDocument | null>(null);
  const [exportReport, setExportReport] = useState<LiquidationDocument | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const isFL = kind === 'liquidation';
  const money = (amount: unknown) => typeof amount === 'number' && Number.isFinite(amount) ? formatCurrency(amount) : 'Not available';
  const lists = isFL ? { pending: documents.pendingLiquidations, endorsed: documents.endorsedLiquidations, returned: documents.returnedLiquidations }
    : { pending: documents.pendingPARs, endorsed: documents.endorsedPARs, returned: documents.returnedPARs };
  const rows = lists[tab].filter((record) => {
    const query = search.toLowerCase().trim();
    return !query || [resolveActivityName(record, activities), record.organizationName, record.referenceNo, (record as LiquidationDocument).referenceNumber, record.id]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  const downloadPAR = async (record: PostActivityReportDocument) => {
    setDownloading(record.id);
    try {
      await exportPostActivityReportPDF(record);
      toast.success(`Downloaded Post-Activity Report for ${resolveActivityName(record, activities)}`);
    } catch (error: any) { toast.error(error?.message || 'Unable to download the report. Please try again.'); }
    finally { setDownloading(null); }
  };
  return <div className="mx-auto max-w-7xl space-y-6 pb-12">
    <div><h1 className="text-2xl font-bold text-[#001A4D] sm:text-3xl">{isFL ? 'Financial Liquidation' : 'Post-Activity Reports'}</h1>
      <p className="mt-1 text-sm text-slate-500">{isFL ? 'Review activity expenses and financial liquidation reports.' : 'Review activity outcomes, attendance, and documentation.'}</p></div>
    <div className="flex flex-wrap gap-2 border-b pb-3">
      {(['pending', 'endorsed', 'returned'] as const).map((value) => <button type="button" key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === value ? 'bg-[#001A4D] text-[#FFD41C]' : 'bg-slate-100 text-slate-700'}`}>
        {value === 'pending' ? 'Pending My Signature' : value === 'endorsed' ? 'Signed History & Archive' : 'Returned for Revision'} <span className="ml-1">({lists[value].length})</span>
      </button>)}
    </div>
    <label className="relative block max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">Search {isFL ? 'financial liquidations' : 'post-activity reports'}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity name, organization, or reference..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></label>
    {documents.error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Unable to load reports. Please refresh and try again.</div>
      : documents.loading ? <p role="status" className="rounded-xl border bg-white p-8 text-center text-slate-500">Loading reports…</p>
      : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600"><tr>
            {['Activity Name', 'Organization', 'Reference', ...(isFL ? ['Allocated Budget', 'Actual Spending'] : ['Verified Attendees', 'Photos']), 'Status', 'Stage', 'Actions'].map((header) => <th scope="col" key={header} className="px-4 py-3 font-semibold">{header}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!rows.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">No reports match this category or search.</td></tr>}
            {rows.map((record) => {
              const liquidation = record as LiquidationDocument;
              const par = record as PostActivityReportDocument;
              const attendance = par.attendanceSummary?.attendedCount;
              return <tr key={record.id} className="hover:bg-slate-50">
                <td className="max-w-xs px-4 py-4 font-bold text-[#001A4D]"><button type="button" onClick={() => setSelected(record)} className="text-left hover:underline">{resolveActivityName(record, activities)}</button>{(record.revisionCount || 1) > 1 && <span className="mt-1 block text-[11px] font-normal text-amber-700">Revision {record.revisionCount}</span>}</td>
                <td className="px-4 py-4">{record.organizationName || 'Not available'}</td>
                <td className="px-4 py-4 text-xs text-slate-500">{record.referenceNo || liquidation.referenceNumber || record.id}</td>
                <td className="px-4 py-4">{isFL ? money(liquidation.allocatedBudget) : typeof attendance === 'number' ? attendance.toLocaleString() : 'Not available'}</td>
                <td className="px-4 py-4">{isFL ? money(liquidation.totalActualSpending) : par.photos?.length || 0}</td>
                <td className="px-4 py-4"><CampusStatusBadge status={documentStatus(record)} /></td>
                <td className="px-4 py-4">{record.currentStageIndex ?? 1}</td>
                <td className="px-4 py-4"><div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSelected(record)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-[#001A4D] px-3 py-2 text-xs font-semibold text-white"><Eye className="h-3.5 w-3.5" />{tab === 'pending' ? 'Review & Sign' : 'View Report'}</button>
                  <button type="button" disabled={downloading === record.id} onClick={() => isFL ? setExportReport(liquidation) : void downloadPAR(par)} aria-label={`Export ${resolveActivityName(record, activities)}`} className="rounded-lg border p-2 text-blue-700 disabled:opacity-50">{isFL ? <FileSpreadsheet className="h-4 w-4" /> : <Download className="h-4 w-4" />}</button>
                </div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    {selected && (isFL ? <LiquidationEndorsementModal isOpen liquidation={selected as LiquidationDocument} signatorySession={session} onClose={() => setSelected(null)} onOpenSignaturePad={onOpenSignatureModal} />
      : <PAREndorsementModal isOpen report={selected as PostActivityReportDocument} signatorySession={session} onClose={() => setSelected(null)} onOpenSignaturePad={onOpenSignatureModal} />)}
    {exportReport && <LiquidationExportPreviewModal isOpen report={exportReport} onClose={() => setExportReport(null)} />}
  </div>;
}
