import React, { useEffect, useRef, useState } from 'react';
import { X, FileText, FileSpreadsheet, FileCheck2 } from 'lucide-react';
import { formatAppDate, format12HourTime } from '../../utils/date';
import { formatCurrency } from '../../utils/currency';
import type { CampusActivityRow } from '../utils/campus-activity-report';
import CampusStatusBadge from './CampusStatusBadge';
import ProposalEndorsementModal from './ProposalEndorsementModal';
import LiquidationEndorsementModal from './LiquidationEndorsementModal';
import PAREndorsementModal from './PAREndorsementModal';

export default function CampusActivityDetail({ row, inspectable, session, onClose, onOpenSignaturePad }: {
  row: CampusActivityRow;
  inspectable: { proposal: Set<string>; liquidation: Set<string>; par: Set<string> };
  session: any; onClose: () => void; onOpenSignaturePad: () => void;
}) {
  const [documentType, setDocumentType] = useState<'proposal' | 'liquidation' | 'par' | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !documentType) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, documentType]);
  const allowed = (type: 'proposal' | 'liquidation' | 'par', record: any) => record && inspectable[type].has(record.id);
  const value = (amount: any) => typeof amount === 'number' && Number.isFinite(amount) ? formatCurrency(amount) : 'Not available';
  return <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="campus-activity-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b p-5 sm:p-6">
          <div><p className="text-xs text-slate-500">{row.reference} · {row.organizer}</p><h2 id="campus-activity-title" className="mt-1 text-xl font-bold text-[#001A4D]">{row.title}</h2></div>
          <button ref={closeRef} type="button" aria-label="Close activity details" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div><p className="text-xs text-slate-500">Activity status</p><CampusStatusBadge status={row.activityState} /></div>
            <div><p className="text-xs text-slate-500">Academic period</p><p>{[row.academicYear, row.semester].filter(Boolean).join(' · ') || 'Not available'}</p></div>
            <div><p className="text-xs text-slate-500">Venue</p><p>{row.venue}</p></div>
            <div><p className="text-xs text-slate-500">Verified attendees</p><p>{row.attendees === null ? 'Not available' : row.attendees.toLocaleString()}</p></div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-4"><p className="font-semibold text-[#001A4D]">{row.fullyCleared ? 'Fully cleared' : 'Requirements'}</p><p className="mt-1 text-sm text-slate-700">{row.outstanding}</p>
            {row.deadline && <p className={`mt-2 text-xs ${row.overdue ? 'text-rose-700' : 'text-slate-500'}`}>FL submission deadline: {formatAppDate(row.deadline)}{row.missingFL && row.daysRemaining !== null ? ` · ${row.daysRemaining < 0 ? `${Math.abs(row.daysRemaining)} days overdue` : `${row.daysRemaining} days remaining`}` : ''}</p>}
          </div>
          <div><h3 className="mb-2 text-sm font-bold text-[#001A4D]">Activity sessions</h3>
            {row.activity.sessions?.length ? <ul className="space-y-2 text-sm">{row.activity.sessions.map((session, index) => <li key={session.id || index} className="rounded-lg border p-3">{formatAppDate(session.date)} · {session.title || `Session ${index + 1}`}<span className="block text-xs text-slate-500">{[format12HourTime(session.startTime), format12HourTime(session.endTime)].filter(Boolean).join(' – ')}{session.venueName ? ` · ${session.venueName}` : ''}</span></li>)}</ul> : <p className="text-sm text-slate-500">{row.dates.map((date) => formatAppDate(date)).join(', ') || 'Schedule not available'}</p>}
          </div>
          {!row.exempt && <div><h3 className="mb-2 text-sm font-bold text-[#001A4D]">Recorded finances</h3><div className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-slate-500">Approved budget</p><p>{value(row.activity.totalApprovedBudget ?? row.liquidation?.allocatedBudget)}</p></div>
            <div><p className="text-xs text-slate-500">Actual spending</p><p>{value(row.liquidation?.totalActualSpending)}</p></div>
            <div><p className="text-xs text-slate-500">Surplus / deficit</p><p>{value(row.liquidation?.surplusOrDeficit)}</p></div>
          </div></div>}
          <div><h3 className="mb-2 text-sm font-bold text-[#001A4D]">Linked documents</h3><div className="space-y-2">
            {([
              ['proposal', 'Activity Proposal', row.proposalStatus, row.proposal, FileText],
              ['liquidation', 'Financial Liquidation', row.flStatus, row.liquidation, FileSpreadsheet],
              ['par', 'Post-Activity Report', row.parStatus, row.par, FileCheck2],
            ] as const).map(([type, label, status, record, Icon]) => <div key={type} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <div className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-blue-700" /><span>{label}</span><CampusStatusBadge status={status} /></div>
              {allowed(type, record) && !(type === 'liquidation' && row.exempt) && <button type="button" onClick={() => setDocumentType(type)} className="rounded-lg bg-[#001A4D] px-3 py-2 text-xs font-semibold text-white">View {type === 'proposal' ? 'Proposal' : type === 'par' ? 'PAR' : 'FL'}</button>}
            </div>)}
          </div><p className="mt-2 text-xs text-slate-500">Document details are available for your authorized workflows once your review stage is reached, and for approved reports.</p></div>
        </div>
      </section>
    </div>
    {documentType === 'proposal' && allowed('proposal', row.proposal) && <ProposalEndorsementModal proposal={row.proposal!} signatorySession={session} onClose={() => setDocumentType(null)} onOpenSignaturePad={onOpenSignaturePad} />}
    {documentType === 'liquidation' && allowed('liquidation', row.liquidation) && <LiquidationEndorsementModal isOpen liquidation={row.liquidation!} signatorySession={session} onClose={() => setDocumentType(null)} onOpenSignaturePad={onOpenSignaturePad} />}
    {documentType === 'par' && allowed('par', row.par) && <PAREndorsementModal isOpen report={row.par!} signatorySession={session} onClose={() => setDocumentType(null)} onOpenSignaturePad={onOpenSignaturePad} />}
  </>;
}
