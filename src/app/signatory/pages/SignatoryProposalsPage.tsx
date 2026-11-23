/**
 * src/app/signatory/pages/SignatoryProposalsPage.tsx
 *
 * Dedicated institutional review portal for Activity Proposals (Form AP-01).
 * Features sub-tabs: Pending My Signature | Signed History & Archive | Returned for Revision.
 */

import React, { useState } from 'react';
import { useOutletContext } from 'react-router';
import {
  FileText,
  Search,
  Clock,
  CheckCircle2,
  RotateCcw,
  Building,
  Calendar,
  Download,
  Send,
  Eye,
  Filter,
  Layers,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import { exportActivityProposalPDF } from '../../modules/activity-proposals/utils/proposal-pdf-exporter';
import { formatPHP } from '../../modules/activity-proposals/utils/proposal-calculations';
import { formatLongDate } from '../../utils/date';
import ProposalEndorsementModal from '../components/ProposalEndorsementModal';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import {
  SupplementalBudgetDetailModal,
  type SupplementalBudgetRequest,
} from '../../modules/supplemental-budget';

interface ContextType {
  session: any;
  onOpenSignatureModal: () => void;
  onOpenPasswordModal: () => void;
}

export default function SignatoryProposalsPage() {
  const { session, onOpenSignatureModal } = useOutletContext<ContextType>();
  const {
    pendingProposals,
    endorsedProposals,
    returnedProposals,
    pendingSbrs,
    endorsedSbrs,
    returnedSbrs,
    loading,
  } = useSignatoryDocuments(session);

  const [activeTab, setActiveTab] = useState<'pending' | 'endorsed' | 'returned'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProposal, setSelectedProposal] = useState<ActivityProposal | null>(null);
  const [selectedSbr, setSelectedSbr] = useState<SupplementalBudgetRequest | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const currentSbrList =
    activeTab === 'pending'
      ? pendingSbrs
      : activeTab === 'endorsed'
      ? endorsedSbrs
      : returnedSbrs;

  const filteredSbrList = currentSbrList.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.referenceCode.toLowerCase().includes(q) ||
      s.eventTitle.toLowerCase().includes(q) ||
      s.organizationName.toLowerCase().includes(q)
    );
  });

  const currentList =
    activeTab === 'pending'
      ? pendingProposals
      : activeTab === 'endorsed'
      ? endorsedProposals
      : returnedProposals;

  const filteredList = currentList
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const title = (p.title || p.activityTitle || '').toLowerCase();
      const org = (p.organizationName || '').toLowerCase();
      const ref = (p.referenceNo || '').toLowerCase();
      return title.includes(q) || org.includes(q) || ref.includes(q);
    })
    .sort((a, b) => Number(Boolean((b as any).isUrgent)) - Number(Boolean((a as any).isUrgent)));

  const handleDownloadPdf = async (e: React.MouseEvent, prop: ActivityProposal) => {
    e.stopPropagation();
    setDownloadingId(prop.id);
    try {
      await exportActivityProposalPDF(prop);
      toast.success(`Official Proposal PDF downloaded for ${prop.referenceNo || prop.title}`);
    } catch (err: any) {
      toast.error('Failed to export PDF: ' + (err?.message || 'Please try again.'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#001A4D] text-xs font-bold mb-2">
            <FileText className="w-3.5 h-3.5 text-[#0E4EBD]" />
            <span>Activity Proposals Clearance Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#001A4D] tracking-tight">
            Activity Proposals
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review event objectives, itineraries, budget projections, and stamp digital endorsements.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'pending'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Pending My Signature</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'pending' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {pendingProposals.length + pendingSbrs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('endorsed')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'endorsed'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Signed History & Archive</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'endorsed' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {endorsedProposals.length + endorsedSbrs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('returned')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'returned'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Returned for Revision</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'returned' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {returnedProposals.length}
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search proposals by title, organization, or reference..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:outline-none transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* Proposal Cards List */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Proposals in this category</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {activeTab === 'pending'
                ? 'All activity proposals for your stage are cleared or not yet submitted.'
                : 'No proposals currently match this archive filter.'}
            </p>
          </div>
        ) : (
          filteredList.map((prop) => {
            const totalBudget = prop.budgetItems?.reduce((acc, b) => acc + (b.totalCost || 0), 0) || 0;
            const isUrgent = Boolean((prop as any).isUrgent);
            return (
              <div
                key={prop.id}
                onClick={() => setSelectedProposal(prop)}
                className={`rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 border ${
                  isUrgent
                    ? 'bg-amber-50/35 hover:bg-amber-50/70 border-amber-300'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200/90'
                }`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isUrgent && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black uppercase tracking-wider">
                        <AlertTriangle className="w-3 h-3 text-rose-700" />
                        Urgent (&lt;15 Days)
                      </span>
                    )}
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#001A4D] text-[#FFD41C]">
                      {prop.referenceNo || 'Proposal'}
                    </span>
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {prop.organizationName || 'Student Club'}
                    </span>
                    <span className="text-xs text-slate-400">
                      • Stage {prop.currentStageIndex ?? 1}
                    </span>
                    {totalBudget > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md">
                        {formatPHP(totalBudget)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-[#001A4D] hover:text-[#0E4EBD] transition-colors">
                    {prop.title || prop.activityTitle}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Target Date: {formatLongDate(prop.date || prop.sessions?.[0]?.date || prop.targetDate, 'TBD')}
                    </span>
                  </div>
                  {isUrgent && (prop as any).urgentJustification && (
                    <div className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <strong className="text-amber-900">Urgent Justification:</strong> {(prop as any).urgentJustification}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start md:self-center">
                  <button
                    type="button"
                    onClick={(e) => handleDownloadPdf(e, prop)}
                    disabled={downloadingId === prop.id}
                    className="p-2 border border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                    title="Download Official Proposal PDF"
                  >
                    <Download className="w-4 h-4 text-[#0E4EBD]" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedProposal(prop)}
                    className="px-4 py-2 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                  >
                    {activeTab === 'pending' ? (
                      <>
                        <Send className="w-3.5 h-3.5 text-[#FFD41C]" />
                        <span>Review & Sign</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#FFD41C]" />
                        <span>View Details</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Supplemental Budget Requests Queue (School Budget / Institutional Addendums) */}
      {filteredSbrList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-indigo-600" />
              Supplemental Budget Requests ({filteredSbrList.length})
            </h2>
          </div>
          {filteredSbrList.map((sbr) => (
            <div
              key={sbr.id}
              onClick={() => setSelectedSbr(sbr)}
              className="bg-indigo-50/40 border border-indigo-200 hover:border-indigo-400 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all shadow-2xs"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded bg-indigo-600 text-white">
                    Supplemental Budget
                  </span>
                  <span className="font-mono text-xs font-bold text-[#001A4D]">{sbr.referenceCode}</span>
                  <span className="text-xs font-semibold text-slate-600">• {sbr.organizationName}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 truncate">{sbr.eventTitle}</h3>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                  <span>Base Approved: <strong>{formatPHP(sbr.baseApprovedBudget)}</strong></span>
                  <span className="text-amber-700 font-bold">
                    Additional Requested: +{formatPHP(sbr.requestedAmount)}
                  </span>
                  <span className="text-emerald-700 font-bold">
                    New Total: {formatPHP(sbr.baseApprovedBudget + sbr.priorSupplementalTotal + sbr.requestedAmount)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedSbr(sbr);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs shrink-0 self-start md:self-center"
              >
                {activeTab === 'pending' ? (
                  <>
                    <Send className="w-3.5 h-3.5 text-[#FFD41C]" />
                    <span>Review &amp; Sign SBR</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-[#FFD41C]" />
                    <span>View SBR Details</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Proposal Modal */}
      {selectedProposal && (
        <ProposalEndorsementModal
          isOpen={Boolean(selectedProposal)}
          proposal={selectedProposal}
          signatorySession={session}
          onClose={() => setSelectedProposal(null)}
          onOpenSignaturePad={onOpenSignatureModal}
        />
      )}

      {/* Supplemental Budget Review & Sign Modal */}
      <SupplementalBudgetDetailModal
        isOpen={Boolean(selectedSbr)}
        onClose={() => setSelectedSbr(null)}
        sbr={selectedSbr}
        viewerRole="signatory"
        actor={{
          uid: session?.uid || session?.id || '',
          name: session?.name || 'Institutional Signatory',
          email: session?.email || '',
          role: 'signatory',
          roleTitle: session?.roleTitle || session?.role || '',
          signatureUrl: session?.signatureUrl || session?.signatureDataUrl || undefined,
        }}
      />
    </div>
  );
}
