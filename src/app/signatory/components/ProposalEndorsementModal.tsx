/**
 * src/app/signatory/components/ProposalEndorsementModal.tsx
 *
 * Official Review and Digital Endorsement Studio for Institutional Signatories.
 * Allows Program Heads, Principals, Deans, and the School President to review
 * the complete Activity Proposal, examine financial allocations, verify the 15-day rule,
 * and stamp their verified black ink electronic signature to advance the endorsement chain.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Clock,
  MapPin,
  Building,
  DollarSign,
  PenTool,
  Send,
  ShieldCheck,
  UserCheck,
  Check,
  AlertCircle,
  Download,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import {
  endorseProposal,
  returnProposalForRevision,
  rejectProposal,
} from '../../modules/activity-proposals/services/proposal.service';
import { formatPHP } from '../../modules/activity-proposals/utils/proposal-calculations';
import { exportActivityProposalPDF } from '../../modules/activity-proposals/utils/proposal-pdf-exporter';

interface ProposalEndorsementModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: ActivityProposal | null;
  signatorySession: any;
  onOpenSignaturePad: () => void;
  onProposalUpdated?: () => void;
}

export default function ProposalEndorsementModal({
  isOpen,
  onClose,
  proposal,
  signatorySession,
  onOpenSignaturePad,
  onProposalUpdated,
}: ProposalEndorsementModalProps) {
  const [remarks, setRemarks] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    if (!proposal) return;
    setIsExportingPdf(true);
    try {
      await exportActivityProposalPDF(proposal);
      toast.success('Official STI Form AP-01 Activity Proposal PDF downloaded successfully!');
    } catch (err: any) {
      console.error('PDF export error:', err);
      toast.error('Failed to generate PDF: ' + (err?.message || 'Please try again.'));
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen || !proposal) return null;

  const userUid = signatorySession?.id || signatorySession?.uid;
  const userEmail = (signatorySession?.email || '').toLowerCase();
  const userRole = signatorySession?.role || '';
  const currentStage = proposal.currentStageIndex ?? 1;

  const currentStep =
    proposal.approvalChain?.find((s) => {
      const stageMatch = s.stageIndex ? s.stageIndex === currentStage : true;
      if (!stageMatch) return false;
      if (userUid && s.signatoryUid === userUid) return true;
      if (userEmail && s.signatoryEmail?.toLowerCase() === userEmail) return true;
      if (userRole && s.role === userRole) return true;
      return false;
    }) || proposal.approvalChain?.[proposal.currentStepIndex ?? 0];

  const activeSignatureUrl = useMemo(() => {
    if (signatorySession?.signatureUrl) return signatorySession.signatureUrl;
    if (signatorySession?.signatureDataUrl) return signatorySession.signatureDataUrl;
    try {
      const raw = localStorage.getItem('sti_sync_signatory_session') || localStorage.getItem('sti_sync_officer_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.signatureUrl || parsed.signatureDataUrl || null;
      }
    } catch {}
    return null;
  }, [signatorySession?.signatureUrl, signatorySession?.signatureDataUrl]);

  const hasSignature = Boolean(activeSignatureUrl);
  const isFinalApprover =
    currentStep?.actionType === 'approve' ||
    currentStep?.role === 'school_president' ||
    signatorySession?.actionType === 'approve' ||
    signatorySession?.role === 'school_president';

  const handleEndorse = async () => {
    if (!hasSignature) {
      toast.error('Please register your electronic signature before endorsing this proposal.');
      onOpenSignaturePad();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await endorseProposal(
        proposal.id,
        {
          uid: signatorySession?.id || signatorySession?.uid || '',
          id: signatorySession?.id || signatorySession?.uid || '',
          name: signatorySession?.name || '',
          email: signatorySession?.email || '',
          roleTitle: signatorySession?.roleTitle || '',
          role: signatorySession?.role || '',
          actionType: isFinalApprover ? 'approve' : 'endorse',
          signatureUrl: activeSignatureUrl || undefined,
        },
        remarks
      );

      if (result.isFullyApproved) {
        toast.success(`Proposal fully approved! Final presidential authorization recorded for ${proposal.referenceNo}`);
      } else if (result.stageAdvanced) {
        toast.success(`Stage ${currentStage} completed! Proposal forwarded to the next approval stage.`);
      } else {
        toast.success(`Endorsement recorded successfully! Awaiting remaining signatures for this stage.`);
      }

      if (onProposalUpdated) onProposalUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to endorse proposal:', err);
      toast.error(err?.message || 'Failed to endorse proposal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = async () => {
    if (!returnRemarks.trim()) {
      toast.error('Please provide specific feedback/revision instructions before returning.');
      return;
    }

    setIsSubmitting(true);
    try {
      await returnProposalForRevision(
        proposal.id,
        {
          uid: signatorySession.id || signatorySession.uid,
          name: signatorySession.name,
          email: signatorySession.email,
          roleTitle: signatorySession.roleTitle,
        },
        returnRemarks
      );

      toast.success(`Proposal returned for revision with your feedback remarks.`);
      if (onProposalUpdated) onProposalUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to return proposal:', err);
      toast.error(err?.message || 'Failed to return proposal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please specify the official reason for declining/rejecting this proposal.');
      return;
    }

    setIsSubmitting(true);
    try {
      await rejectProposal(
        proposal.id,
        {
          uid: signatorySession.id || signatorySession.uid,
          name: signatorySession.name,
          email: signatorySession.email,
          roleTitle: signatorySession.roleTitle,
        },
        rejectionReason
      );

      toast.success('Proposal officially rejected and archived for audit records.');
      if (onProposalUpdated) onProposalUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to reject proposal:', err);
      toast.error(err?.message || 'Failed to reject proposal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── HEADER ── */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white leading-tight">
                  {isFinalApprover ? 'Executive Review & Final Approval' : 'Review & Institutional Endorsement'}
                </h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {proposal.referenceNo}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Stage {currentStage}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Official STI Activity Proposal • {isFinalApprover ? 'Final Executive Decision' : 'Reviewing as'}{' '}
                <strong>{signatorySession?.roleTitle || (isFinalApprover ? 'School President' : 'Institutional Signatory')}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 hover:text-white border border-blue-400/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
              title="Download official STI Form AP-01 PDF"
            >
              <Download className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span className="hidden sm:inline">{isExportingPdf ? 'Exporting...' : 'Official PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── BODY: SCROLLABLE PROPOSAL CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-slate-800">
          {/* Urgent Warning if applicable */}
          {proposal.isUrgent && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Urgent Filing Justification (Fast-Track Review)
                </h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed italic">
                  "{proposal.urgentJustification || 'No justification text provided'}"
                </p>
              </div>
            </div>
          )}

          {/* Proposal Title & Metadata Header */}
          <div className="pb-5 border-b border-slate-200">
            <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">
              1. Activity title
            </span>
            <h1 className="text-2xl font-black text-slate-900 mt-1">{proposal.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <div>
                <strong className="text-slate-700">Date:</strong> {proposal.submissionDate}
              </div>
              <div>•</div>
              <div>
                <strong className="text-slate-700">3. Organizer/s:</strong> {proposal.organizers?.join(', ')}
              </div>
              <div>•</div>
              <div>
                <strong className="text-slate-700">9. Est. attendance:</strong> {proposal.estimatedAttendance}
              </div>
            </div>
          </div>

          {/* 2. Description */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              2. Description
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              {proposal.description}
            </p>
          </div>

          {/* 4. Objective/s & 5. Success indicator/s */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                4. Objective/s
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {proposal.objectives?.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                5. Success indicator/s
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {proposal.successIndicators?.map((ind, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 flex-shrink-0" />
                    <span>{ind}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 6. Mechanics & 7. Materials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                6. Mechanics
              </h4>
              {proposal.mechanics && proposal.mechanics.length > 0 ? (
                <ol className="space-y-1.5 text-xs text-slate-700 list-decimal pl-4">
                  {proposal.mechanics.map((m, i) => (
                    <li key={i} className="pl-1">
                      <span>{m}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-slate-400 italic">No mechanics specified.</p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                7. Materials
              </h4>
              {proposal.materials && proposal.materials.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {proposal.materials.map((mat, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded-md text-[11px]"
                    >
                      {mat}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No materials specified.</p>
              )}
            </div>
          </div>

          {/* 8. Target market */}
          <div className="space-y-2 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              8. Target market
            </h3>
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
              <div>
                <strong className="text-slate-700">Programs / Strands:</strong>{' '}
                <span className="text-blue-900 font-medium">
                  {proposal.targetAudience?.courseCodes?.length
                    ? proposal.targetAudience.courseCodes.join(', ')
                    : proposal.targetAudience?.departments?.join(', ') || 'All Programs'}
                </span>
              </div>
              <div>
                <strong className="text-slate-700">Year Levels:</strong>{' '}
                <span className="text-slate-800">
                  {proposal.targetAudience?.yearLevels?.join(', ') || 'All Levels'}
                </span>
              </div>
            </div>
          </div>

          {/* 10. Marketing plan & 11. Documentation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                10. Marketing plan
              </h4>
              {proposal.marketingPlan && proposal.marketingPlan.length > 0 ? (
                <ul className="space-y-1 text-xs text-slate-700">
                  {proposal.marketingPlan.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-[#0E4EBD]">›</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">No marketing plan specified.</p>
              )}
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                11. Documentation
              </h4>
              {proposal.documentationPlan && proposal.documentationPlan.length > 0 ? (
                <ul className="space-y-1 text-xs text-slate-700">
                  {proposal.documentationPlan.map((d, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-600">✓</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic">No documentation items specified.</p>
              )}
            </div>
          </div>

          {/* 12. Date & time (and Venue) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              12. Date & time (and Venue)
            </h3>
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Date</span>
                <span className="font-semibold text-slate-800">
                  {proposal.date || proposal.sessions?.[0]?.date || 'Date TBD'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Time</span>
                <span className="font-semibold text-slate-800">
                  {(proposal.startTime || proposal.sessions?.[0]?.startTime || '08:00')} -{' '}
                  {(proposal.endTime || proposal.sessions?.[0]?.endTime || '12:00')}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Venue</span>
                <span className="font-semibold text-blue-900">
                  {proposal.venueName || proposal.sessions?.[0]?.venueName || 'Venue TBD'}
                </span>
              </div>
            </div>
          </div>

          {/* 13. Task list */}
          {proposal.tasks && proposal.tasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                13. Task list
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                      <th className="p-2.5">Task</th>
                      <th className="p-2.5">Person Assigned</th>
                      <th className="p-2.5">Date to be Completed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {proposal.tasks.map((t, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 font-medium">{t.taskName}</td>
                        <td className="p-2.5 text-slate-600">{t.assignedPerson}</td>
                        <td className="p-2.5 text-slate-600">{t.completionDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 14. Financial projections */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                14. Financial projections
              </h3>
              <div className="text-xs font-bold">
                Projected Balance: <span className="text-emerald-700">{formatPHP(proposal.financialProjections?.balance || 0)}</span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5 text-right">Proposed Budget</th>
                    <th className="p-2.5 text-right">Adjustment</th>
                    <th className="p-2.5 text-right">Total Amount</th>
                    <th className="p-2.5">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-emerald-50/40 font-bold text-emerald-900">
                    <td colSpan={5} className="p-2 text-[11px] uppercase tracking-wider">
                      Sources of Funds / Revenues
                    </td>
                  </tr>
                  {proposal.financialProjections?.revenues?.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2.5 font-medium">{r.description}</td>
                      <td className="p-2.5 text-right text-emerald-700">{formatPHP(r.thisYearProposed)}</td>
                      <td className="p-2.5 text-right">{formatPHP(r.adjustment)}</td>
                      <td className="p-2.5 text-right font-bold">{formatPHP(r.totalAmount)}</td>
                      <td className="p-2.5 text-slate-500">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-rose-50/40 font-bold text-rose-900">
                    <td colSpan={5} className="p-2 text-[11px] uppercase tracking-wider">
                      Operational Expenses
                    </td>
                  </tr>
                  {proposal.financialProjections?.expenses?.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2.5 font-medium">{e.description}</td>
                      <td className="p-2.5 text-right text-rose-700">{formatPHP(e.thisYearProposed)}</td>
                      <td className="p-2.5 text-right">{formatPHP(e.adjustment)}</td>
                      <td className="p-2.5 text-right font-bold">{formatPHP(e.totalAmount)}</td>
                      <td className="p-2.5 text-slate-500">{e.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 15. Signatories */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              15. Signatories
            </h3>
            <div className="space-y-2">
              {proposal.approvalChain?.map((step, idx) => {
                const isCurrent = idx === (proposal.currentStepIndex ?? 0);
                const isSigned = step.status === 'endorsed';
                const isReturned = step.status === 'returned';

                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                      isCurrent
                        ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-400/20'
                        : isSigned
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : isReturned
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center ${
                          isSigned
                            ? 'bg-emerald-600 text-white'
                            : isCurrent
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isSigned ? <Check className="w-4 h-4" /> : step.step}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>{step.signatoryName}</span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            ({step.signatoryEmail})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-medium">
                          {step.roleTitle} {step.department && `• ${step.department}`}
                        </div>
                        {step.remarks && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                            Note: "{step.remarks}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {isSigned && step.signatureUrl && (
                        <div className="hidden sm:block text-center border border-emerald-200 bg-white rounded-lg p-1">
                          <img
                            src={step.signatureUrl}
                            alt="Signature"
                            className="h-7 w-auto object-contain mx-auto"
                          />
                          <span className="text-[9px] text-emerald-700 block font-mono">Digitally Endorsed</span>
                        </div>
                      )}

                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isSigned
                            ? 'bg-emerald-100 text-emerald-800'
                            : isCurrent
                            ? 'bg-blue-100 text-blue-800 font-black animate-pulse'
                            : isReturned
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isSigned
                          ? 'ENDORSED'
                          : isCurrent
                          ? 'AWAITING YOUR SIGNATURE'
                          : isReturned
                          ? 'RETURNED'
                          : 'PENDING'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ENDORSEMENT STUDIO ── */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-blue-600" />
              <span>Signatory Electronic Signature Verification</span>
            </h3>

            {hasSignature ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="border border-slate-300 bg-white p-2 rounded-xl shadow-xs">
                    <img
                      src={activeSignatureUrl!}
                      alt="Registered E-Signature"
                      className="h-10 w-28 object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Verified Digital Ink Signature Active</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Stamping as <strong>{signatorySession.name}</strong> ({signatorySession.roleTitle})
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenSignaturePad}
                  className="text-xs text-blue-700 hover:text-blue-800 font-semibold underline self-start sm:self-center"
                >
                  Re-draw Signature
                </button>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-700" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-950">No Electronic Signature on File</h4>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Please register your black ink signature before endorsing this proposal.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenSignaturePad}
                  className="px-3.5 py-1.5 bg-[#001A4D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <PenTool className="w-3.5 h-3.5 text-[#FFD41C]" />
                  <span>Register Signature</span>
                </button>
              </div>
            )}

            {/* Endorsement Remarks */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isFinalApprover ? 'Executive Approval Directives / Remarks (Optional)' : 'Endorsement Notes / Recommendations (Optional)'}
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={
                  isFinalApprover
                    ? 'e.g. Approved. Proceed with facility scheduling and student safety coordination...'
                    : 'e.g. Endorsed with recommendation to coordinate AV setup with IT staff...'
                }
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
              />
            </div>

            {/* Return Mode Textarea if toggled */}
            {isReturning && (
              <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                  <span>Return Feedback Remarks (Required)</span>
                </label>
                <textarea
                  rows={3}
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  placeholder="Detail the corrections needed (e.g. adjust honorarium line item, add detailed speaker itinerary, update target attendance)..."
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsReturning(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReturn}
                    disabled={isSubmitting || !returnRemarks.trim()}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                  >
                    {isSubmitting ? 'Returning...' : 'Confirm Return for Revision'}
                  </button>
                </div>
              </div>
            )}

            {/* Reject Mode Textarea if toggled (Approver only) */}
            {isRejecting && (
              <div className="p-4 bg-rose-50/90 border border-rose-300 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-rose-950 flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5 text-rose-700" />
                  <span>Official Reason for Rejection / Decline (Required)</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="State the institutional reason for declining this proposal (e.g. unapproved venue risk, scheduling conflict with institutional exams, or policy violation)..."
                  className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rose-500/30"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={isSubmitting || !rejectionReason.trim()}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs disabled:opacity-50"
                  >
                    {isSubmitting ? 'Rejecting...' : 'Confirm Proposal Rejection'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── MODAL FOOTER ACTIONS ── */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!isReturning && !isRejecting && (
              <>
                <button
                  type="button"
                  onClick={() => setIsReturning(true)}
                  disabled={isSubmitting}
                  className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-amber-100/50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Return for Revision</span>
                </button>
                {isFinalApprover && (
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    disabled={isSubmitting}
                    className="text-xs text-rose-700 hover:text-rose-800 font-bold flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-rose-100/50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-3.5 py-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50"
              title="Download official PDF copy of proposal"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>{isExportingPdf ? 'Generating...' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleEndorse}
              disabled={isSubmitting || !hasSignature}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
                isFinalApprover
                  ? 'bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/40 shadow-blue-900/25 ring-2 ring-[#FFD41C]/30'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
              }`}
            >
              {isFinalApprover ? (
                <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {isSubmitting
                  ? 'Processing...'
                  : isFinalApprover
                  ? 'Authorize & Approve Activity Proposal'
                  : 'Stamp E-Signature & Endorse Proposal'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
