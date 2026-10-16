/**
 * src/app/signatory/pages/SignatoryEndorsementsPage.tsx
 *
 * Dedicated dashboard for Institutional Signatories (Accountants, Program Heads, Principals, Deans, President).
 * Displays real-time Activity Proposals (Form AP-01) and Financial Liquidations (Form LF-01)
 * pending review, endorsed history, and signature management.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router';
import {
  FileSignature,
  Clock,
  CheckCircle,
  RotateCcw,
  Search,
  Filter,
  FileText,
  AlertCircle,
  Building,
  UserCheck,
  Calendar,
  PenTool,
  ShieldCheck,
  KeyRound,
  AlertTriangle,
  ChevronRight,
  Send,
  Eye,
  Download,
  Loader2,
  FileSpreadsheet,
  FileCheck2,
  DollarSign,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import { subscribeToProposals } from '../../modules/activity-proposals/services/proposal.service';
import { useAllLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import { useAllPARsForSignatories } from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import { formatPHP } from '../../modules/activity-proposals/utils/proposal-calculations';
import { formatCurrency, formatVariance } from '../../utils/currency';
import { exportActivityProposalPDF } from '../../modules/activity-proposals/utils/proposal-pdf-exporter';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import ProposalEndorsementModal from '../components/ProposalEndorsementModal';
import LiquidationEndorsementModal from '../components/LiquidationEndorsementModal';
import PAREndorsementModal from '../components/PAREndorsementModal';

interface ContextType {
  session: any;
  onOpenSignatureModal: () => void;
  onOpenPasswordModal?: () => void;
}

export default function SignatoryEndorsementsPage() {
  const { session, onOpenSignatureModal, onOpenPasswordModal } = useOutletContext<ContextType>();
  const [documentCategory, setDocumentCategory] = useState<'proposals' | 'liquidations' | 'pars'>('proposals');
  const [activeTab, setActiveTab] = useState<'pending' | 'endorsed' | 'returned'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [allProposals, setAllProposals] = useState<ActivityProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<ActivityProposal | null>(null);
  const [selectedLiquidation, setSelectedLiquidation] = useState<LiquidationDocument | null>(null);
  const [selectedPAR, setSelectedPAR] = useState<PostActivityReportDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Sync tab with URL search parameter if present (e.g. ?tab=endorsed)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'endorsed' || tab === 'returned' || tab === 'pending') {
      setActiveTab(tab as any);
    }
  }, [window.location.search]);

  const { liquidations: allLiquidations, loading: liquidationsLoading } = useAllLiquidations();
  const { pars: allPARs, loading: parsLoading } = useAllPARsForSignatories();

  const hasSignature = Boolean(session?.signatureUrl);
  const isTempPassActive = Boolean(session?.requiresPasswordChange);

  const userUid = session?.id || session?.uid;
  const userEmail = (session?.email || '').toLowerCase();
  const userRole = session?.role || '';
  const userRoleTitle = (session?.roleTitle || '').toLowerCase();

  const matchesSignatory = (step: any) => {
    if (!step) return false;
    if (step.signatoryUid && (step.signatoryUid === userUid || step.signatoryUid === session?.uid || step.signatoryUid === session?.id)) return true;
    if (step.signatoryEmail && userEmail && step.signatoryEmail.toLowerCase() === userEmail) return true;
    if (step.role && userRole && step.role.toLowerCase() === userRole.toLowerCase()) return true;
    if (step.roleTitle && userRoleTitle) {
      const sTitle = step.roleTitle.toLowerCase();
      if (sTitle === userRoleTitle || sTitle.includes(userRoleTitle) || userRoleTitle.includes(sTitle)) return true;
    }
    return false;
  };

  const handleDownloadPdf = async (e: React.MouseEvent, prop: ActivityProposal) => {
    e.stopPropagation();
    setDownloadingId(prop.id);
    try {
      await exportActivityProposalPDF(prop);
      toast.success(`Official Proposal PDF downloaded for ${prop.referenceNo}`);
    } catch (err: any) {
      toast.error('Failed to export PDF: ' + (err?.message || 'Please try again.'));
    } finally {
      setDownloadingId(null);
    }
  };

  // Subscribe to all proposals from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToProposals((list) => {
      setAllProposals(list);
      setProposalsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter proposals according to this signatory's role and status
  const { pendingProposals, pipelineProposals, endorsedProposals, returnedProposals } = useMemo(() => {
    const pending: ActivityProposal[] = [];
    const pipeline: ActivityProposal[] = [];
    const endorsed: ActivityProposal[] = [];
    const returned: ActivityProposal[] = [];

    allProposals.forEach((p) => {
      const chain = p.approvalChain || [];
      const currentIdx = p.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isReturnedStatus =
        p.status === 'returned_for_revision' ||
        p.status === 'returned' ||
        (p as any).proposalStatus === 'returned' ||
        (p as any).proposalStatus === 'returned_for_revision' ||
        (p as any).lifecycleStatus === 'returned' ||
        Boolean(p.isReturned) ||
        Boolean((p as any).stepRevisionRemarks && Object.keys((p as any).stepRevisionRemarks).length > 0);

      const isUnderReview =
        !isReturnedStatus &&
        (p.status === 'under_review' ||
        (p as any).proposalStatus === 'pending' ||
        (p as any).proposalStatus === 'pending_review');

      if (isUnderReview) {
        const currentStage = p.currentStageIndex ?? 1;
        const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

        if (hasStages) {
          // Strictly show only when it is my stage and my turn right now
          const isMyTurnInStage = chain.some((s) => {
            const inStage = (s.stageIndex ?? 1) === currentStage;
            const isPending = s.status === 'current' || (!s.status && inStage);
            const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved' && s.status !== 'waived';
            return inStage && isPending && isNotSigned && matchesSignatory(s);
          });

          // Future stage signatories (e.g. stage 3 while document is at stage 1 or 2) CANNOT see the proposal
          if (isMyTurnInStage) {
            pending.push(p);
          }
        } else if (matchesSignatory(currentStep)) {
          pending.push(p);
        }
      }

      const hasEndorsedStep = !isReturnedStatus && chain.some(
        (s) => (s.status === 'endorsed' || s.status === 'approved') && matchesSignatory(s)
      );
      if (hasEndorsedStep) {
        endorsed.push(p);
      }

      if (isReturnedStatus) {
        const hasReturnedStep = chain.some(
          (s) => (s.status === 'returned' || s.status === 'returned_for_revision') && matchesSignatory(s)
        );
        const isInvolvedInChain = chain.some(matchesSignatory);
        if (hasReturnedStep || isInvolvedInChain) {
          returned.push(p);
        }
      }
    });

    return {
      pendingProposals: pending,
      pipelineProposals: [],
      endorsedProposals: endorsed,
      returnedProposals: returned,
    };
  }, [allProposals, session]);

  // Filter liquidations according to this signatory's role and status (Strict stage-lock)
  const { pendingLiquidations, pipelineLiquidations, endorsedLiquidations, returnedLiquidations } = useMemo(() => {
    const pending: LiquidationDocument[] = [];
    const endorsed: LiquidationDocument[] = [];
    const returned: LiquidationDocument[] = [];

    allLiquidations.forEach((l) => {
      const chain = l.approvalChain || [];
      const currentIdx = l.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isUnderReview = l.status === 'under_review' || l.status === 'pending';

      if (isUnderReview) {
        const currentStage = l.currentStageIndex ?? 1;
        const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

        if (hasStages) {
          // Strictly show only when it is my stage and my turn right now
          const isMyTurnInStage = chain.some((s) => {
            const inStage = (s.stageIndex ?? 1) === currentStage;
            const isPending = s.status === 'current' || (!s.status && inStage);
            const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved' && s.status !== 'waived';
            return inStage && isPending && isNotSigned && matchesSignatory(s);
          });

          // Future stage signatories CANNOT see the liquidation
          if (isMyTurnInStage) {
            pending.push(l);
          }
        } else if (matchesSignatory(currentStep)) {
          pending.push(l);
        }
      }

      const hasEndorsedStep = chain.some(
        (s) => (s.status === 'endorsed' || s.status === 'approved') && matchesSignatory(s)
      );
      if (hasEndorsedStep) {
        endorsed.push(l);
      }

      if (l.status === 'returned') {
        const hasReturnedStep = chain.some(
          (s) => s.status === 'returned' && matchesSignatory(s)
        );
        if (hasReturnedStep) {
          returned.push(l);
        }
      }
    });

    return {
      pendingLiquidations: pending,
      pipelineLiquidations: [],
      endorsedLiquidations: endorsed,
      returnedLiquidations: returned,
    };
  }, [allLiquidations, session]);

  // Filter PARs according to this signatory's role and status (Strict stage-lock)
  const {
    pendingPARs,
    pipelinePARs,
    endorsedPARs,
    returnedPARs,
  } = useMemo(() => {
    const pending: PostActivityReportDocument[] = [];
    const endorsed: PostActivityReportDocument[] = [];
    const returned: PostActivityReportDocument[] = [];

    allPARs.forEach((p) => {
      const chain = p.approvalChain || [];
      const currentIdx = p.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      const isUnderReview = p.status === 'under_review';

      if (isUnderReview) {
        const currentStage = p.currentStageIndex ?? 1;
        const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

        if (hasStages) {
          // Strictly show only when it is my stage and my turn right now
          const isMyTurnInStage = chain.some((s) => {
            const inStage = (s.stageIndex ?? 1) === currentStage;
            const isPending = s.status === 'current' || (!s.status && inStage);
            const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved';
            return inStage && isPending && isNotSigned && matchesSignatory(s);
          });

          // Future stage signatories CANNOT see the post-activity report
          if (isMyTurnInStage) {
            pending.push(p);
          }
        } else if (matchesSignatory(currentStep)) {
          pending.push(p);
        }
      }

      const hasEndorsedStep = chain.some(
        (s) => (s.status === 'endorsed' || s.status === 'approved') && matchesSignatory(s)
      );
      if (hasEndorsedStep) {
        endorsed.push(p);
      }

      if (p.status === 'returned') {
        const hasReturnedStep = chain.some(
          (s) => s.status === 'returned' && matchesSignatory(s)
        );
        if (hasReturnedStep) {
          returned.push(p);
        }
      }
    });

    return {
      pendingPARs: pending,
      pipelinePARs: [],
      endorsedPARs: endorsed,
      returnedPARs: returned,
    };
  }, [allPARs, session]);

  const activeProposalsList = useMemo(() => {
    let list: ActivityProposal[] = [];
    if (activeTab === 'pending') list = pendingProposals;
    else if (activeTab === 'pipeline') list = pipelineProposals;
    else if (activeTab === 'endorsed') list = endorsedProposals;
    else if (activeTab === 'returned') list = returnedProposals;

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.referenceNo?.toLowerCase().includes(q) ||
        p.organizers?.some((o) => o.toLowerCase().includes(q))
    );
  }, [activeTab, pendingProposals, endorsedProposals, returnedProposals, searchQuery]);

  const activeLiquidationsList = useMemo(() => {
    let list: LiquidationDocument[] = [];
    if (activeTab === 'pending') list = pendingLiquidations;
    else if (activeTab === 'endorsed') list = endorsedLiquidations;
    else if (activeTab === 'returned') list = returnedLiquidations;

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(
      (l) =>
        l.eventTitle?.toLowerCase().includes(q) ||
        l.organizationName?.toLowerCase().includes(q) ||
        l.createdByName?.toLowerCase().includes(q)
    );
  }, [activeTab, pendingLiquidations, endorsedLiquidations, returnedLiquidations, searchQuery]);

  const activePARsList = useMemo(() => {
    let list: PostActivityReportDocument[] = [];
    if (activeTab === 'pending') list = pendingPARs;
    else if (activeTab === 'endorsed') list = endorsedPARs;
    else if (activeTab === 'returned') list = returnedPARs;

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(
      (p) =>
        p.eventTitle?.toLowerCase().includes(q) ||
        p.referenceNo?.toLowerCase().includes(q) ||
        p.organizationName?.toLowerCase().includes(q)
    );
  }, [activeTab, pendingPARs, endorsedPARs, returnedPARs, searchQuery]);

  const currentPendingCount =
    documentCategory === 'proposals'
      ? pendingProposals.length
      : documentCategory === 'liquidations'
      ? pendingLiquidations.length
      : pendingPARs.length;
  const currentEndorsedCount =
    documentCategory === 'proposals'
      ? endorsedProposals.length
      : documentCategory === 'liquidations'
      ? endorsedLiquidations.length
      : endorsedPARs.length;
  const currentReturnedCount =
    documentCategory === 'proposals'
      ? returnedProposals.length
      : documentCategory === 'liquidations'
      ? returnedLiquidations.length
      : returnedPARs.length;

  const loading =
    documentCategory === 'proposals'
      ? proposalsLoading
      : documentCategory === 'liquidations'
      ? liquidationsLoading
      : parsLoading;

  return (
    <div className="space-y-6">
      {/* Temporary Password Warning Prompt if active */}
      {isTempPassActive && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
              <KeyRound className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[#001A4D] text-base">Setup Your Permanent Password</h3>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black uppercase rounded tracking-wider">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                You are currently logged in with a temporary password. For security, please choose a permanent password. Once changed, your temporary password will be disabled permanently until reset by an administrator.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenPasswordModal}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-sm transition-all whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#FFD41C]" />
            Change Password Now
          </button>
        </div>
      )}

      {/* Signature Setup Prompt if missing */}
      {!hasSignature && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300/80 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <PenTool className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <h3 className="font-bold text-[#001A4D] text-base">Setup Your Official Electronic Signature</h3>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                Before endorsing Activity Proposals or institutional budget requests, please register your verified digital signature by drawing it on the black ink signature pad.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenSignatureModal}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-sm transition-all whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer"
          >
            <PenTool className="w-3.5 h-3.5 text-[#FFD41C]" />
            Register E-Signature
          </button>
        </div>
      )}

      {/* Header Profile Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#001A4D] text-xs font-bold mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0E4EBD]" />
            {session?.roleTitle || 'Institutional Signatory'}
          </div>
          <h1 className="text-2xl font-black text-[#001A4D] tracking-tight">
            Welcome, {session?.name || 'Signatory'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and digitally endorse campus Activity Proposals, event schedules, and financial liquidations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenPasswordModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-300 hover:border-[#001A4D] text-gray-700 hover:text-[#001A4D] text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-[#0E4EBD]" />
            Change Password
          </button>
          <button
            onClick={onOpenSignatureModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-300 hover:border-[#001A4D] text-gray-700 hover:text-[#001A4D] text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileSignature className="w-4 h-4 text-[#0E4EBD]" />
            {hasSignature ? 'Manage Signature' : 'Register Signature'}
          </button>
        </div>
      </div>

      {/* ── DOCUMENT CATEGORY SWITCHER ── */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 rounded-2xl max-w-xl border border-slate-200 shadow-2xs">
        <button
          type="button"
          onClick={() => setDocumentCategory('proposals')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            documentCategory === 'proposals'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Activity Proposals</span>
          {pendingProposals.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                documentCategory === 'proposals'
                  ? 'bg-[#FFD41C] text-[#001A4D]'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {pendingProposals.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setDocumentCategory('liquidations')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            documentCategory === 'liquidations'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Financial Liquidations</span>
          {pendingLiquidations.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                documentCategory === 'liquidations'
                  ? 'bg-[#FFD41C] text-[#001A4D]'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {pendingLiquidations.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setDocumentCategory('pars')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            documentCategory === 'pars'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>Post-Activity Reports</span>
          {pendingPARs.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                documentCategory === 'pars'
                  ? 'bg-[#FFD41C] text-[#001A4D]'
                  : 'bg-indigo-600 text-white'
              }`}
            >
              {pendingPARs.length}
            </span>
          )}
        </button>
      </div>

      {/* Metric Cards - 3 Executive Action Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. Requires My Signature */}
        <div
          onClick={() => setActiveTab('pending')}
          className={`cursor-pointer p-5 rounded-2xl border transition-all ${
            activeTab === 'pending'
              ? 'bg-blue-50/50 border-[#0E4EBD] shadow-md ring-2 ring-[#0E4EBD]/20'
              : 'bg-white border-gray-200 hover:border-gray-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Requires My Signature
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-100/60 text-[#0E4EBD] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-[#001A4D]">
            {loading ? '...' : currentPendingCount}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {currentPendingCount === 1
              ? `1 item active in your stage awaiting your sign-off`
              : `${currentPendingCount} items active in your stage awaiting your sign-off`}
          </p>
        </div>

        {/* 2. Signed History & Archive */}
        <div
          onClick={() => setActiveTab('endorsed')}
          className={`cursor-pointer p-5 rounded-2xl border transition-all ${
            activeTab === 'endorsed'
              ? 'bg-emerald-50/50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white border-gray-200 hover:border-gray-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Signed History & Archive
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100/60 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-[#001A4D]">
            {loading ? '...' : currentEndorsedCount}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Certified records with your electronic signature</p>
        </div>

        {/* 3. Returned for Revision */}
        <div
          onClick={() => setActiveTab('returned')}
          className={`cursor-pointer p-5 rounded-2xl border transition-all ${
            activeTab === 'returned'
              ? 'bg-amber-50/50 border-amber-500 shadow-md ring-2 ring-amber-500/20'
              : 'bg-white border-gray-200 hover:border-gray-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Returned for Revision
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-100/60 text-amber-600 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-amber-600">
            {loading ? '...' : currentReturnedCount}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Returned with feedback remarks</p>
        </div>
      </div>

      {/* Document Queue Table Area */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Table Header / Filter */}
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {documentCategory === 'proposals' ? (
              <FileText className="w-5 h-5 text-[#001A4D]" />
            ) : (
              <FileSpreadsheet className="w-5 h-5 text-[#001A4D]" />
            )}
            <h2 className="font-bold text-[#001A4D] text-sm">
              {documentCategory === 'proposals'
                ? activeTab === 'pending'
                  ? `Activity Proposals Pending Your Endorsement (${pendingProposals.length})`
                  : activeTab === 'pipeline'
                  ? `Activity Proposals in Review Pipeline (${pipelineProposals.length})`
                  : activeTab === 'endorsed'
                  ? `Signed & Endorsed Proposals History (${endorsedProposals.length})`
                  : `Proposals Returned for Revision (${returnedProposals.length})`
                : activeTab === 'pending'
                ? `Financial Liquidations Pending Your Endorsement (${pendingLiquidations.length})`
                : activeTab === 'pipeline'
                ? `Financial Liquidations in Review Pipeline (${pipelineLiquidations.length})`
                : activeTab === 'endorsed'
                ? `Signed & Endorsed Liquidations History (${endorsedLiquidations.length})`
                : `Liquidations Returned for Revision (${returnedLiquidations.length})`}
            </h2>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder={documentCategory === 'proposals' ? 'Search proposals...' : 'Search liquidations...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#001A4D]/20 outline-none"
            />
          </div>
        </div>

        {/* ── PROPOSALS LIST ── */}
        {documentCategory === 'proposals' && (
          <>
            {activeProposalsList.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {activeProposalsList.map((proposal) => {
                  const totalSessions = proposal.sessions?.length || 0;
                  const earliestDate = proposal.sessions?.[0]?.date || 'TBD';

                  return (
                    <div
                      key={proposal.id}
                      className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/80">
                            {proposal.referenceNo}
                          </span>
                          {proposal.isUrgent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              URGENT FILING
                            </span>
                          )}
                          <span className="text-[11px] text-gray-500">
                            Submitted: {proposal.submissionDate}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                          {proposal.title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-0.5">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span>{proposal.organizers?.join(', ')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{earliestDate} ({totalSessions} session{totalSessions > 1 ? 's' : ''})</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                            <span>Budget: {formatPHP(proposal.financialProjections?.totalExpenses || 0)}</span>
                          </div>
                        </div>

                        {/* Step / Stage Tracker */}
                        {(() => {
                          const curStage = proposal.currentStageIndex ?? 1;
                          const stageSteps = (proposal.approvalChain || []).filter((s) => (s.stageIndex ?? 1) === curStage);
                          const completedCount = stageSteps.filter((s) => s.status === 'endorsed' || s.status === 'approved' || s.status === 'waived').length;
                          const stageTitle = stageSteps[0]?.stageName || `Stage ${curStage}`;
                          const isApproverForMe = (proposal.approvalChain || []).some(
                            (s) => (s.stageIndex ?? 1) === curStage && matchesSignatory(s) && (s.actionType === 'approve' || s.role === 'school_president')
                          );

                          return (
                            <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                              <span className="font-medium">Active Stage:</span>
                              <span className="font-bold text-blue-900 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1.5">
                                <span>Stage {curStage}: {stageTitle}</span>
                                {stageSteps.length > 1 && (
                                  <span className="text-[10px] text-blue-700 bg-blue-200/60 px-1.5 py-0.2 rounded-full font-black">
                                    {completedCount}/{stageSteps.length} Signed
                                  </span>
                                )}
                              </span>
                              {isApproverForMe && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  Approver Action
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Right Action */}
                      <div className="flex items-center gap-2 self-end lg:self-center flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDownloadPdf(e, proposal)}
                          disabled={downloadingId === proposal.id}
                          className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                          title="Download Official STI Proposal PDF"
                        >
                          {downloadingId === proposal.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                          ) : (
                            <Download className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          <span className="hidden sm:inline">Proposal PDF</span>
                        </button>

                        {(() => {
                          const curStage = proposal.currentStageIndex ?? 1;
                          const isApproverForMe = (proposal.approvalChain || []).some(
                            (s) => (s.stageIndex ?? 1) === curStage && matchesSignatory(s) && (s.actionType === 'approve' || s.role === 'school_president')
                          );

                          const myFutureProposalStep = (proposal.approvalChain || []).find(
                            (s) => (s.stageIndex ?? 1) > curStage && matchesSignatory(s)
                          );

                          return (
                            <div className="flex items-center gap-2">
                              {activeTab === 'pipeline' && myFutureProposalStep && (
                                <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 items-center gap-1">
                                  <Layers className="w-3 h-3 text-purple-600" />
                                  Stage {myFutureProposalStep.stageIndex}
                                </span>
                              )}
                              <button
                                onClick={() => setSelectedProposal(proposal)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                                  activeTab === 'pending'
                                    ? isApproverForMe
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                    : activeTab === 'pipeline'
                                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                                }`}
                              >
                                {activeTab === 'pending' ? (
                                  isApproverForMe ? (
                                    <>
                                      <ShieldCheck className="w-3.5 h-3.5" />
                                      <span>Review & Approve</span>
                                    </>
                                  ) : (
                                    <>
                                      <PenTool className="w-3.5 h-3.5" />
                                      <span>Review & Endorse</span>
                                    </>
                                  )
                                ) : activeTab === 'pipeline' ? (
                                  <>
                                    <Eye className="w-3.5 h-3.5 text-purple-600" />
                                    <span>Preview Pipeline</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                                    <span>View Details</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#001A4D] flex items-center justify-center mx-auto mb-4 border border-blue-100">
                  <FileSignature className="w-8 h-8 text-[#0E4EBD]" />
                </div>
                <h3 className="font-bold text-gray-800 text-base">Your Queue is All Clear</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 leading-relaxed">
                  {searchQuery
                    ? 'No activity proposals match your search query.'
                    : 'When Student Organizations or the SAS Department submit an Activity Proposal targeting your program or requiring your executive sign-off, it will appear here for your interactive review and digital endorsement.'}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── LIQUIDATIONS LIST ── */}
        {documentCategory === 'liquidations' && (
          <>
            {activeLiquidationsList.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {activeLiquidationsList.map((liquidation) => {
                  const lineItemsCount = liquidation.lineItems?.length || 0;
                  const curStage = liquidation.currentStageIndex ?? 1;
                  const stageSteps = (liquidation.approvalChain || []).filter((s) => (s.stageIndex ?? 1) === curStage);
                  const completedCount = stageSteps.filter((s) => s.status === 'endorsed' || s.status === 'approved' || s.status === 'waived').length;
                  const stageTitle = stageSteps[0]?.stageName || `Stage ${curStage}`;

                  const isApproverForMe = (liquidation.approvalChain || []).some(
                    (s) =>
                      (s.stageIndex ?? 1) === curStage &&
                      matchesSignatory(s) &&
                      (s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator')
                  );

                  const isCheckerForMe = (liquidation.approvalChain || []).some(
                    (s) =>
                      (s.stageIndex ?? 1) === curStage &&
                      matchesSignatory(s) &&
                      (s.actionType === 'check' || s.role === 'accountant')
                  );

                  const isDeficit = (liquidation.surplusOrDeficit ?? 0) < 0;

                  return (
                    <div
                      key={liquidation.id}
                      className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">
                            Liquidation
                          </span>
                          <span className="text-[11px] text-gray-500">
                            Org: <strong>{liquidation.organizationName || 'Student Affairs & Services'}</strong>
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                          {liquidation.eventTitle}
                        </h3>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-0.5">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span>Submitted by: {liquidation.createdByName}</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-medium text-slate-700">
                            <span>Allocated: {formatCurrency(liquidation.allocatedBudget || 0)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
                            <span>Spent: {formatCurrency(liquidation.totalActualSpending || 0)} ({lineItemsCount} items)</span>
                          </div>
                          <div
                            className={`flex items-center gap-1.5 font-bold ${
                              isDeficit ? 'text-rose-600' : 'text-emerald-700'
                            }`}
                          >
                            <span>Variance: {formatVariance(liquidation.surplusOrDeficit || 0)}</span>
                          </div>
                        </div>

                        {/* Stage Progress */}
                        <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                          <span className="font-medium">Active Stage:</span>
                          <span className="font-bold text-blue-900 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1.5">
                            <span>Stage {curStage}: {stageTitle}</span>
                            {stageSteps.length > 1 && (
                              <span className="text-[10px] text-blue-700 bg-blue-200/60 px-1.5 py-0.2 rounded-full font-black">
                                {completedCount}/{stageSteps.length} Signed
                              </span>
                            )}
                          </span>

                          {isApproverForMe && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#001A4D] text-[#FFD41C] flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Presidential Approver
                            </span>
                          )}

                          {isCheckerForMe && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-blue-600" />
                              Audit Verification
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action */}
                      <div className="flex items-center gap-2 self-end lg:self-center flex-shrink-0">
                        {activeTab === 'pipeline' && (
                          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 items-center gap-1">
                            <Layers className="w-3 h-3 text-purple-600" />
                            Awaiting Stage {curStage}
                          </span>
                        )}
                        <button
                          onClick={() => setSelectedLiquidation(liquidation)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                            activeTab === 'pending'
                              ? isApproverForMe
                                ? 'bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/30'
                                : isCheckerForMe
                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                              : activeTab === 'pipeline'
                              ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                          }`}
                        >
                          {activeTab === 'pending' ? (
                            isApproverForMe ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Review & Approve</span>
                              </>
                            ) : isCheckerForMe ? (
                              <>
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Audit & Verify</span>
                              </>
                            ) : (
                              <>
                                <PenTool className="w-3.5 h-3.5" />
                                <span>Review & Endorse</span>
                              </>
                            )
                          ) : activeTab === 'pipeline' ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-purple-600" />
                              <span>Preview Pipeline</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>View Details</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-[#001A4D] flex items-center justify-center mx-auto mb-4 border border-emerald-100">
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="font-bold text-gray-800 text-base">No Financial Liquidations in this Queue</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 leading-relaxed">
                  {searchQuery
                    ? 'No financial liquidations match your search query.'
                    : 'When campus organizations submit completed event liquidations with itemized expenses and receipt evidence, they will appear here for your audit review and digital signature endorsement.'}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── POST-ACTIVITY REPORTS LIST ── */}
        {documentCategory === 'pars' && (
          <>
            {activePARsList.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {activePARsList.map((parDoc) => {
                  const curStage = parDoc.currentStageIndex ?? 1;
                  const stageSteps = (parDoc.approvalChain || []).filter((s) => (s.stageIndex ?? 1) === curStage);
                  const completedCount = stageSteps.filter((s) => s.status === 'endorsed' || s.status === 'approved').length;
                  const stageTitle = stageSteps[0]?.stageName || `Stage ${curStage}`;

                  const isApproverForMe = (parDoc.approvalChain || []).some(
                    (s) =>
                      (s.stageIndex ?? 1) === curStage &&
                      matchesSignatory(s) &&
                      (s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator')
                  );

                  return (
                    <div
                      key={parDoc.id}
                      className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/80">
                            Form PAR
                          </span>
                          <span className="font-mono text-xs text-slate-500 font-bold">
                            {parDoc.referenceNo}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            Org: <strong>{parDoc.organizationName}</strong>
                          </span>
                          {((parDoc as any).version > 1 || (parDoc as any).revisionCount > 1 || (parDoc as any).revisionHistory?.length > 0 || (parDoc as any).previousSnapshot) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Revision v{(parDoc as any).version || (parDoc as any).revisionCount || 2}.0
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-slate-900 leading-snug">
                          {parDoc.eventTitle}
                        </h3>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-0.5">
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span>Authored by: {parDoc.createdByName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Conducted: {parDoc.eventDateFormatted}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            <span>
                              {parDoc.attendanceSummary?.attendedCount || 0} Attended / {parDoc.attendanceSummary?.registeredCount || 0} Registered
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                            <span>Liquidation Clearance: {parDoc.liquidationRefNumber || 'Cleared'}</span>
                          </div>
                        </div>

                        {/* Stage Progress */}
                        <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                          <span className="font-medium">Active Stage:</span>
                          <span className="font-bold text-blue-900 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1.5">
                            <span>Stage {curStage}: {stageTitle}</span>
                            {stageSteps.length > 1 && (
                              <span className="text-[10px] text-blue-700 bg-blue-200/60 px-1.5 py-0.2 rounded-full font-black">
                                {completedCount}/{stageSteps.length} Signed
                              </span>
                            )}
                          </span>

                          {isApproverForMe && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#001A4D] text-[#FFD41C] flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Executive Approver
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action */}
                      <div className="flex items-center gap-2 self-end lg:self-center flex-shrink-0">
                        {activeTab === 'pipeline' && (
                          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 items-center gap-1">
                            <Layers className="w-3 h-3 text-purple-600" />
                            Awaiting Stage {curStage}
                          </span>
                        )}
                        <button
                          onClick={() => setSelectedPAR(parDoc)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                            activeTab === 'pending'
                              ? isApproverForMe
                                ? 'bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/30'
                                : 'bg-[#0E4EBD] hover:bg-[#001A4D] text-white shadow-blue-500/20'
                              : activeTab === 'pipeline'
                              ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                          }`}
                        >
                          {activeTab === 'pending' ? (
                            isApproverForMe ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Review & Approve</span>
                              </>
                            ) : (
                              <>
                                <PenTool className="w-3.5 h-3.5" />
                                <span>Review & Endorse</span>
                              </>
                            )
                          ) : activeTab === 'pipeline' ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-purple-600" />
                              <span>Preview Pipeline</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>View Details</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-[#001A4D] flex items-center justify-center mx-auto mb-4 border border-indigo-100">
                  <FileCheck2 className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="font-bold text-gray-800 text-base">No Post-Activity Reports in this Queue</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 leading-relaxed">
                  {searchQuery
                    ? 'No Post-Activity Reports match your search query.'
                    : 'When concluded events submit their Post-Activity Report with attendance audits and categorized recommendations, they will appear here for your endorsement.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Proposal Endorsement Modal */}
      {selectedProposal && (
        <ProposalEndorsementModal
          isOpen={!!selectedProposal}
          onClose={() => setSelectedProposal(null)}
          proposal={selectedProposal}
          signatorySession={session}
          onOpenSignaturePad={onOpenSignatureModal}
          onProposalUpdated={() => {
            setSelectedProposal(null);
          }}
        />
      )}

      {/* Liquidation Endorsement Modal */}
      {selectedLiquidation && (
        <LiquidationEndorsementModal
          isOpen={!!selectedLiquidation}
          onClose={() => setSelectedLiquidation(null)}
          liquidation={selectedLiquidation}
          signatorySession={session}
          onOpenSignaturePad={onOpenSignatureModal}
          onLiquidationUpdated={() => {
            setSelectedLiquidation(null);
          }}
        />
      )}

      {/* Post-Activity Report Endorsement Modal */}
      {selectedPAR && (
        <PAREndorsementModal
          isOpen={!!selectedPAR}
          onClose={() => setSelectedPAR(null)}
          report={selectedPAR}
          signatorySession={session}
          onOpenSignaturePad={onOpenSignatureModal}
          onReportUpdated={() => {
            setSelectedPAR(null);
          }}
        />
      )}
    </div>
  );
}
