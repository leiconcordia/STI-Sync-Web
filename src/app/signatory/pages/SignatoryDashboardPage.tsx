/**
 * src/app/signatory/pages/SignatoryDashboardPage.tsx
 *
 * Executive Dashboard for Institutional Signatories.
 * Features unified pending queue across Proposals, Liquidations, and PARs,
 * quick access cards inspired by modern executive layouts, and stage-lock integrity.
 */

import React, { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router';
import {
  FileText,
  FileSpreadsheet,
  FileCheck2,
  Clock,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building,
  Calendar,
  AlertCircle,
  Folder,
  Layers,
  ChevronRight,
  Send,
  Eye,
  PenTool,
} from 'lucide-react';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import ProposalEndorsementModal from '../components/ProposalEndorsementModal';
import LiquidationEndorsementModal from '../components/LiquidationEndorsementModal';
import PAREndorsementModal from '../components/PAREndorsementModal';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';

interface ContextType {
  session: any;
  onOpenSignatureModal: () => void;
  onOpenPasswordModal: () => void;
}

export default function SignatoryDashboardPage() {
  const { session, onOpenSignatureModal } = useOutletContext<ContextType>();
  const navigate = useNavigate();

  const {
    pendingProposals,
    endorsedProposals,
    returnedProposals,
    pendingLiquidations,
    endorsedLiquidations,
    returnedLiquidations,
    pendingPARs,
    endorsedPARs,
    returnedPARs,
    totalPending,
    totalSigned,
    totalReturned,
    loading,
  } = useSignatoryDocuments(session);

  const [selectedProposal, setSelectedProposal] = useState<ActivityProposal | null>(null);
  const [selectedLiquidation, setSelectedLiquidation] = useState<LiquidationDocument | null>(null);
  const [selectedPAR, setSelectedPAR] = useState<PostActivityReportDocument | null>(null);

  const hasSignature = Boolean(session?.signatureUrl || session?.signatureDataUrl);

  // Unified urgent queue
  const urgentQueue = [
    ...pendingProposals.map((p) => ({
      id: p.id,
      docType: 'proposal' as const,
      badgeText: 'Proposal',
      title: p.title || p.activityTitle || 'Untitled Activity Proposal',
      org: p.organizationName || 'Student Organization',
      date: p.targetDate || (p as any).createdAt,
      stage: p.currentStageIndex ?? 1,
      raw: p,
    })),
    ...pendingLiquidations.map((l) => ({
      id: l.id,
      docType: 'liquidation' as const,
      badgeText: 'Liquidation',
      title: l.activityTitle || 'Financial Liquidation Report',
      org: l.organizationName || 'Student Organization',
      date: l.submittedAt || (l as any).createdAt,
      stage: l.currentStageIndex ?? 1,
      raw: l,
    })),
    ...pendingPARs.map((par) => ({
      id: par.id,
      docType: 'par' as const,
      badgeText: 'Post-Activity Report',
      title: par.activityTitle || 'Post-Activity Report',
      org: par.organizationName || 'Student Organization',
      date: par.createdAt,
      stage: par.currentStageIndex ?? 1,
      raw: par,
    })),
  ];

  const handleOpenItem = (item: (typeof urgentQueue)[0]) => {
    if (item.docType === 'proposal') {
      setSelectedProposal(item.raw as ActivityProposal);
    } else if (item.docType === 'liquidation') {
      setSelectedLiquidation(item.raw as LiquidationDocument);
    } else if (item.docType === 'par') {
      setSelectedPAR(item.raw as PostActivityReportDocument);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#001A4D] via-[#0A2E6D] to-[#0E4EBD] rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[#FFD41C] text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{session?.roleTitle || session?.role || 'Institutional Signatory'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Welcome, {session?.name || 'Signatory'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-200 max-w-xl leading-relaxed">
              Review and digitally endorse campus Activity Proposals, financial liquidations, and verified post-activity reports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!hasSignature && (
              <button
                type="button"
                onClick={onOpenSignatureModal}
                className="px-4 py-2.5 rounded-xl bg-[#FFD41C] hover:bg-[#FFE052] text-[#001A4D] text-xs font-black flex items-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <PenTool className="w-4 h-4 text-[#001A4D]" />
                <span>Register E-Signature</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/signatory/account')}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold flex items-center gap-2 backdrop-blur-md transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
              <span>Account & Matrix</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top 3 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Requires My Signature
            </span>
            <div className="text-3xl font-black text-[#001A4D]">{totalPending}</div>
            <p className="text-[11px] text-slate-500">
              {totalPending === 1 ? '1 item pending your review' : `${totalPending} items pending your review`}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${totalPending > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Certified & Endorsed
            </span>
            <div className="text-3xl font-black text-emerald-600">{totalSigned}</div>
            <p className="text-[11px] text-slate-500">Official stamps recorded</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Returned for Revision
            </span>
            <div className="text-3xl font-black text-amber-600">{totalReturned}</div>
            <p className="text-[11px] text-slate-500">Action sent back to officers</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <RotateCcw className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Access Folders (Adopting Reference Design Pattern) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Folder className="w-4 h-4 text-[#0E4EBD]" />
            <span>Document Hub & Governance</span>
          </h2>
          <span className="text-xs text-slate-400">Dedicated institutional clearance portals</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Proposals */}
          <div
            onClick={() => navigate('/signatory/proposals')}
            className="group relative bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200/90 hover:border-[#0E4EBD]/40 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0E4EBD] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                {pendingProposals.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFD41C] text-[#001A4D]">
                    {pendingProposals.length} Pending
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-[#001A4D] group-hover:text-[#0E4EBD] transition-colors">
                Activity Proposals
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                Event permits, objectives, guest lists, and projected financial budgets.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0E4EBD]">
              <span>Review Proposals</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Liquidations */}
          <div
            onClick={() => navigate('/signatory/liquidations')}
            className="group relative bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200/90 hover:border-[#0E4EBD]/40 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                {pendingLiquidations.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFD41C] text-[#001A4D]">
                    {pendingLiquidations.length} Pending
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-[#001A4D] group-hover:text-[#0E4EBD] transition-colors">
                Financial Liquidation
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                Disbursements, official receipts inspection, variance & surplus reconciliation.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0E4EBD]">
              <span>Audit Liquidations</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 3: Post-Activity Reports */}
          <div
            onClick={() => navigate('/signatory/post-activity-reports')}
            className="group relative bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200/90 hover:border-[#0E4EBD]/40 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                {pendingPARs.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFD41C] text-[#001A4D]">
                    {pendingPARs.length} Pending
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-[#001A4D] group-hover:text-[#0E4EBD] transition-colors">
                Post-Activity Reports
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                Evaluation narratives, verified attendance turnout, and final documentation.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0E4EBD]">
              <span>Inspect Reports</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 4: Campus Reports */}
          <div
            onClick={() => navigate('/signatory/reports')}
            className="group relative bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200/90 hover:border-[#0E4EBD]/40 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  Campus Feed
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#001A4D] group-hover:text-[#0E4EBD] transition-colors">
                Campus Activity Reports
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                Real-time executive view of what happened in school: attendance turnout, achievements, and photos.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#0E4EBD]">
              <span>View School Reports</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Urgent Action Queue: Items Pending My Turn */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#001A4D]">
                Action Required ({urgentQueue.length})
              </h2>
              <p className="text-xs text-slate-500">
                Documents currently waiting at your stage for official review and e-signature.
              </p>
            </div>
          </div>
          {urgentQueue.length > 0 && (
            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-lg tracking-wider">
              Stage Turn Active
            </span>
          )}
        </div>

        {urgentQueue.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-[#001A4D]">Your Signature Queue is All Clear!</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              There are no documents awaiting your turn at this moment. You will be notified when subsequent proposals, liquidations, or reports arrive.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {urgentQueue.map((item) => (
              <div
                key={`${item.docType}-${item.id}`}
                className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#001A4D] text-[#FFD41C]">
                      {item.badgeText}
                    </span>
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                      <Building className="w-3 h-3 text-slate-400" />
                      {item.org}
                    </span>
                    <span className="text-xs text-slate-400">
                      • Stage {item.stage}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-[#001A4D]">
                    {item.title}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenItem(item)}
                  className="px-4 py-2 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap self-start sm:self-center"
                >
                  <Send className="w-3.5 h-3.5 text-[#FFD41C]" />
                  <span>Review & Sign</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Modals */}
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
