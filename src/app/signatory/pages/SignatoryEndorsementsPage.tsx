/**
 * src/app/signatory/pages/SignatoryEndorsementsPage.tsx
 *
 * Dedicated dashboard for Institutional Signatories (Program Heads, Principals, Deans, President).
 * Displays real-time proposals pending review, endorsed history, and signature management.
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
} from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import { subscribeToProposals } from '../../modules/activity-proposals/services/proposal.service';
import { formatPHP } from '../../modules/activity-proposals/utils/proposal-calculations';
import { exportActivityProposalPDF } from '../../modules/activity-proposals/utils/proposal-pdf-exporter';
import ProposalEndorsementModal from '../components/ProposalEndorsementModal';

interface ContextType {
  session: any;
  onOpenSignatureModal: () => void;
  onOpenPasswordModal?: () => void;
}

export default function SignatoryEndorsementsPage() {
  const { session, onOpenSignatureModal, onOpenPasswordModal } = useOutletContext<ContextType>();
  const [activeTab, setActiveTab] = useState<'pending' | 'endorsed' | 'returned'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [allProposals, setAllProposals] = useState<ActivityProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<ActivityProposal | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const hasSignature = Boolean(session?.signatureUrl);
  const isTempPassActive = Boolean(session?.requiresPasswordChange);

  const userUid = session?.id || session?.uid;
  const userEmail = (session?.email || '').toLowerCase();
  const userRole = session?.role || '';
  const userRoleTitle = (session?.roleTitle || '').toLowerCase();

  const matchesSignatory = (step: any) => {
    if (!step) return false;
    if (step.signatoryUid && step.signatoryUid === userUid) return true;
    if (step.signatoryEmail && step.signatoryEmail.toLowerCase() === userEmail) return true;
    if (step.role && userRole && step.role === userRole) return true;
    if (step.roleTitle && userRoleTitle && step.roleTitle.toLowerCase().includes(userRoleTitle)) return true;
    return false;
  };

  const handleDownloadPdf = async (e: React.MouseEvent, prop: ActivityProposal) => {
    e.stopPropagation();
    setDownloadingId(prop.id);
    try {
      await exportActivityProposalPDF(prop);
      toast.success(`Official AP-01 PDF downloaded for ${prop.referenceNo}`);
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
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter proposals according to this signatory's role and status
  const { pendingProposals, endorsedProposals, returnedProposals } = useMemo(() => {
    const pending: ActivityProposal[] = [];
    const endorsed: ActivityProposal[] = [];
    const returned: ActivityProposal[] = [];

    allProposals.forEach((p) => {
      const chain = p.approvalChain || [];
      const currentIdx = p.currentStepIndex ?? 0;
      const currentStep = chain[currentIdx];

      // Check if pending at current stage for this signatory
      if (p.status === 'under_review') {
        const currentStage = p.currentStageIndex ?? 1;
        const hasStages = chain.some((s) => typeof s.stageIndex === 'number');

        if (hasStages) {
          const isMyTurnInStage = chain.some((s) => {
            const inStage = (s.stageIndex ?? 1) === currentStage;
            const isPending = s.status === 'current' || (!s.status && inStage);
            const isNotSigned = s.status !== 'endorsed' && s.status !== 'approved';
            return inStage && isPending && isNotSigned && matchesSignatory(s);
          });
          if (isMyTurnInStage) {
            pending.push(p);
          }
        } else if (matchesSignatory(currentStep)) {
          pending.push(p);
        }
      }

      // Check if previously endorsed or approved by this signatory
      const hasEndorsedStep = chain.some(
        (s) => (s.status === 'endorsed' || s.status === 'approved') && matchesSignatory(s)
      );
      if (hasEndorsedStep) {
        endorsed.push(p);
      }

      // Check if returned by or to this signatory
      if (p.status === 'returned_for_revision') {
        const hasReturnedStep = chain.some(
          (s) => s.status === 'returned' && matchesSignatory(s)
        );
        if (hasReturnedStep) {
          returned.push(p);
        }
      }
    });

    return {
      pendingProposals: pending,
      endorsedProposals: endorsed,
      returnedProposals: returned,
    };
  }, [allProposals, session]);

  const activeList = useMemo(() => {
    let list: ActivityProposal[] = [];
    if (activeTab === 'pending') list = pendingProposals;
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
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-sm transition-all whitespace-nowrap flex items-center justify-center gap-2"
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
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-sm transition-all whitespace-nowrap flex items-center justify-center gap-2"
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
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-300 hover:border-[#001A4D] text-gray-700 hover:text-[#001A4D] text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <KeyRound className="w-4 h-4 text-[#0E4EBD]" />
            Change Password
          </button>
          <button
            onClick={onOpenSignatureModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-300 hover:border-[#001A4D] text-gray-700 hover:text-[#001A4D] text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <FileSignature className="w-4 h-4 text-[#0E4EBD]" />
            {hasSignature ? 'Manage Signature' : 'Register Signature'}
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pending */}
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
              Pending Endorsement
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-100/60 text-[#0E4EBD] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-[#001A4D]">
            {loading ? '...' : pendingProposals.length}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {pendingProposals.length === 1
              ? '1 proposal awaiting your sign-off'
              : `${pendingProposals.length} proposals awaiting your sign-off`}
          </p>
        </div>

        {/* Endorsed */}
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
              Endorsed / Approved
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100/60 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-[#001A4D]">
            {loading ? '...' : endorsedProposals.length}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Documents signed and forwarded</p>
        </div>

        {/* Returned */}
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
          <div className="mt-3 text-3xl font-black text-[#001A4D]">
            {loading ? '...' : returnedProposals.length}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Returned with feedback remarks</p>
        </div>
      </div>

      {/* Document Queue Table Area */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        {/* Table Header / Filter */}
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#001A4D]" />
            <h2 className="font-bold text-[#001A4D] text-sm">
              {activeTab === 'pending'
                ? `Activity Proposals Pending Your Endorsement (${pendingProposals.length})`
                : activeTab === 'endorsed'
                ? `Signed & Endorsed Proposals History (${endorsedProposals.length})`
                : `Proposals Returned for Revision (${returnedProposals.length})`}
            </h2>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search proposals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#001A4D]/20 outline-none"
            />
          </div>
        </div>

        {/* Proposals List */}
        {activeList.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {activeList.map((proposal) => {
              const currentStep = proposal.approvalChain?.[proposal.currentStepIndex ?? 0];
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
                      const completedCount = stageSteps.filter((s) => s.status === 'endorsed' || s.status === 'approved').length;
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
                      title="Download Official STI AP-01 PDF"
                    >
                      {downloadingId === proposal.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                      )}
                      <span className="hidden sm:inline">AP-01 PDF</span>
                    </button>

                    {(() => {
                      const curStage = proposal.currentStageIndex ?? 1;
                      const isApproverForMe = (proposal.approvalChain || []).some(
                        (s) => (s.stageIndex ?? 1) === curStage && matchesSignatory(s) && (s.actionType === 'approve' || s.role === 'school_president')
                      );

                      return (
                        <button
                          onClick={() => setSelectedProposal(proposal)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                            activeTab === 'pending'
                              ? isApproverForMe
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
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
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>View Details</span>
                            </>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
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
    </div>
  );
}
