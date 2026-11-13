import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router';
import { CheckCircle2, Download, Eye, FileCheck2, FileSpreadsheet, FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import { resolveActivityName } from '../../modules/events/utils/activity-compliance.utils';
import { formatAppDate } from '../../utils/date';
import { exportActivityProposalPDF } from '../../modules/activity-proposals/utils/proposal-pdf-exporter';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import ProposalEndorsementModal from '../components/ProposalEndorsementModal';
import LiquidationEndorsementModal from '../components/LiquidationEndorsementModal';
import PAREndorsementModal from '../components/PAREndorsementModal';
import CampusStatusBadge from '../components/CampusStatusBadge';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';

type DocFilter = 'all' | 'proposal' | 'liquidation' | 'par';

interface SignedEntry {
  id: string;
  docType: 'proposal' | 'liquidation' | 'par';
  typeLabel: string;
  title: string;
  organization: string;
  status: string;
  signedAt: any;
  raw: ActivityProposal | LiquidationDocument | PostActivityReportDocument;
}

function resolveSignedAt(doc: any, session: any) {
  const chain = Array.isArray(doc?.approvalChain) ? doc.approvalChain : [];
  const uid = session?.id || session?.uid;
  const email = String(session?.email || '').trim().toLowerCase();
  const matched = chain.find((step: any) => {
    const sUid = step?.signedByUid || step?.signatoryUid;
    const sEmail = String(step?.signedByEmail || step?.signatoryEmail || '').trim().toLowerCase();
    return Boolean(
      (sUid && ((session?.id && sUid === session.id) || (session?.uid && sUid === session.uid) || (uid && sUid === uid))) ||
      (sEmail && email && sEmail === email)
    );
  });
  return matched?.signedAt || matched?.endorsedAt || doc?.updatedAt || doc?.createdAt || null;
}

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export default function SignatorySignedDocumentsPage() {
  const { session, onOpenSignatureModal } = useOutletContext<{ session: any; onOpenSignatureModal: () => void }>();
  const documents = useSignatoryDocuments(session);
  const [filter, setFilter] = useState<DocFilter>('all');
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<ActivityProposal | null>(null);
  const [selectedLiquidation, setSelectedLiquidation] = useState<LiquidationDocument | null>(null);
  const [selectedPAR, setSelectedPAR] = useState<PostActivityReportDocument | null>(null);

  const items = useMemo<SignedEntry[]>(() => {
    const proposals: SignedEntry[] = documents.endorsedProposals.map((p) => ({
      id: p.id,
      docType: 'proposal',
      typeLabel: 'Activity Proposal',
      title: p.title || p.activityTitle || 'Untitled Activity Proposal',
      organization: p.organizationName || 'Student Organization',
      status: String((p as any).proposalStatus || p.status || 'endorsed'),
      signedAt: resolveSignedAt(p, session),
      raw: p,
    }));
    const liquidations: SignedEntry[] = documents.endorsedLiquidations.map((l) => ({
      id: l.id,
      docType: 'liquidation',
      typeLabel: 'Financial Liquidation',
      title: resolveActivityName(l, documents.allProposals),
      organization: l.organizationName || 'Student Organization',
      status: String(l.status || 'endorsed'),
      signedAt: resolveSignedAt(l, session),
      raw: l,
    }));
    const pars: SignedEntry[] = documents.endorsedPARs.map((par) => ({
      id: par.id,
      docType: 'par',
      typeLabel: 'Post-Activity Report',
      title: resolveActivityName(par, documents.allProposals),
      organization: par.organizationName || 'Student Organization',
      status: String((par as any).reportStatus || par.status || 'endorsed'),
      signedAt: resolveSignedAt(par, session),
      raw: par,
    }));
    return [...proposals, ...liquidations, ...pars].sort((a, b) => toMillis(b.signedAt) - toMillis(a.signedAt));
  }, [documents.endorsedProposals, documents.endorsedLiquidations, documents.endorsedPARs, documents.allProposals, session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'all' && item.docType !== filter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.organization.toLowerCase().includes(q) ||
        item.typeLabel.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const handleOpen = (entry: SignedEntry) => {
    if (entry.docType === 'proposal') setSelectedProposal(entry.raw as ActivityProposal);
    else if (entry.docType === 'liquidation') setSelectedLiquidation(entry.raw as LiquidationDocument);
    else setSelectedPAR(entry.raw as PostActivityReportDocument);
  };

  const handleDownloadPdf = async (entry: SignedEntry) => {
    setDownloadingId(entry.id);
    try {
      if (entry.docType === 'proposal') {
        await exportActivityProposalPDF(entry.raw as ActivityProposal);
      } else if (entry.docType === 'par') {
        await exportPostActivityReportPDF(entry.raw as PostActivityReportDocument);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Unable to export PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  const typeIcon = (type: SignedEntry['docType']) => {
    if (type === 'proposal') return <FileText className="h-4 w-4 text-[#0E4EBD]" />;
    if (type === 'liquidation') return <FileSpreadsheet className="h-4 w-4 text-emerald-700" />;
    return <FileCheck2 className="h-4 w-4 text-amber-700" />;
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Signed Archive
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#001A4D] sm:text-3xl">Documents I Signed</h1>
          <p className="mt-1 text-sm text-slate-500">
            All Activity Proposals, Financial Liquidations, and Post-Activity Reports bearing your digital signature.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right shadow-2xs">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Signed</span>
          <span className="text-2xl font-black text-emerald-700">{items.length}</span>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', `All (${items.length})`],
                ['proposal', `Proposals (${documents.endorsedProposals.length})`],
                ['liquidation', `Liquidations (${documents.endorsedLiquidations.length})`],
                ['par', `PARs (${documents.endorsedPARs.length})`],
              ] as [DocFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  filter === key ? 'bg-[#001A4D] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search signed documents..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]"
            />
          </label>
        </div>

        {documents.error ? (
          <p role="alert" className="p-6 text-sm text-rose-700">Unable to load signed documents. Refresh and try again.</p>
        ) : documents.loading ? (
          <p role="status" className="p-8 text-center text-sm text-slate-500">Loading your signed documents…</p>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            {items.length === 0 ? 'You have not signed any documents yet.' : 'No signed documents match your current filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Document Type</th>
                  <th className="px-4 py-3 font-semibold">Title / Activity</th>
                  <th className="px-4 py-3 font-semibold">Organization</th>
                  <th className="px-4 py-3 font-semibold">Signed Date</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((entry) => (
                  <tr key={`${entry.docType}:${entry.id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                        {typeIcon(entry.docType)}
                        {entry.typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-[#001A4D] max-w-[280px] truncate" title={entry.title}>
                      {entry.title}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{entry.organization}</td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {entry.signedAt ? formatAppDate(entry.signedAt) : 'Recorded'}
                    </td>
                    <td className="px-4 py-3.5">
                      <CampusStatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpen(entry)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-[#001A4D] hover:bg-blue-50 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        {(entry.docType === 'proposal' || entry.docType === 'par') && (
                          <button
                            type="button"
                            disabled={downloadingId === entry.id}
                            onClick={() => void handleDownloadPdf(entry)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 cursor-pointer"
                          >
                            {downloadingId === entry.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            PDF
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedProposal && (
        <ProposalEndorsementModal
          isOpen={Boolean(selectedProposal)}
          proposal={selectedProposal}
          signatorySession={session}
          onClose={() => setSelectedProposal(null)}
          onOpenSignaturePad={onOpenSignatureModal}
        />
      )}
      {selectedLiquidation && (
        <LiquidationEndorsementModal
          isOpen={Boolean(selectedLiquidation)}
          liquidation={selectedLiquidation}
          signatorySession={session}
          onClose={() => setSelectedLiquidation(null)}
          onOpenSignaturePad={onOpenSignatureModal}
        />
      )}
      {selectedPAR && (
        <PAREndorsementModal
          isOpen={Boolean(selectedPAR)}
          report={selectedPAR}
          signatorySession={session}
          onClose={() => setSelectedPAR(null)}
          onOpenSignaturePad={onOpenSignatureModal}
        />
      )}
    </div>
  );
}

