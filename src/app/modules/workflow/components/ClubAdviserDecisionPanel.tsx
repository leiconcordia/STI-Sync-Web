/**
 * src/app/modules/workflow/components/ClubAdviserDecisionPanel.tsx
 *
 * Reusable Club Adviser Checker Gate Decision Panel for AP, PAR, and Financial Liquidation.
 * Provides exactly 3 Club Adviser decisions:
 *  1. Approve & Forward (with Adviser e-signature verification/capture)
 *  2. Return for Revision (reusing StepReturnRevisionModal with step-by-step directives)
 *  3. Reject Proposal / Report (with preset reason + required remarks)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Gavel,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Send,
  ShieldCheck,
  Clock,
  FileSignature,
  PenTool,
  AlertTriangle,
  X,
  Loader2,
  Coins,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import StepReturnRevisionModal, { type ReturnStepItem } from './StepReturnRevisionModal';
import {
  isDocumentForAdviserReview,
  requiresInstitutionalSignatories,
} from '../../activity-proposals/utils/proposal-status-tracker.utils';
import {
  resolveUserSignature,
  getFastCachedSignature,
  syncUserSignatureAcrossProfiles,
} from '../../signatories';
import { formatAppDateTime } from '../../../utils/date';
import { useOfficerProfile } from '../../../auth/hooks/useOfficerProfile';

const ADVISER_REJECTION_REASONS = [
  'Incomplete or Missing Supporting Details',
  'Budget or Financial Figures Require Major Overhaul',
  'Scheduling or Academic Calendar Conflict',
  'Not Aligned with Organization Objectives or Policy',
  'Duplicate Submission',
  'Other',
];

interface ClubAdviserDecisionPanelProps {
  documentType: 'AP' | 'PAR' | 'FL' | 'SBR';
  documentTitle: string;
  referenceNo?: string;
  record: any;
  isAdviser: boolean;
  adviserProfile: {
    uid: string;
    name: string;
    email: string;
    signatureUrl?: string | null;
  };
  returnSteps: ReturnStepItem[];
  onApproveAndForward: (payload: { signatureUrl: string; remarks: string }) => Promise<void>;
  onReturnForRevision: (payload: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRevisionRemarks: Record<string, string>;
    returnDeadline: string;
  }) => Promise<void>;
  onReject: (payload: { reason: string }) => Promise<void>;
  onDecisionComplete?: () => void;
  layout?: 'sidebar' | 'inline';
  className?: string;
}

export default function ClubAdviserDecisionPanel({
  documentType,
  documentTitle,
  referenceNo,
  record,
  isAdviser,
  adviserProfile,
  returnSteps,
  onApproveAndForward,
  onReturnForRevision,
  onReject,
  onDecisionComplete,
  layout = 'sidebar',
  className = '',
}: ClubAdviserDecisionPanelProps) {
  const isForAdviserReview = isDocumentForAdviserReview(record);
  const adviserReview = record?.adviserReview || null;
  const needsSignatories = requiresInstitutionalSignatories(record);
  const { adviserAuthority } = useOfficerProfile();

  const docLabel =
    documentType === 'PAR'
      ? 'Post-Activity Report'
      : documentType === 'FL'
      ? 'Financial Liquidation'
      : 'Activity Proposal';

  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Approve modal state
  const [approveRemarks, setApproveRemarks] = useState('');
  const [registeredSigUrl, setRegisteredSigUrl] = useState<string>(() =>
    getFastCachedSignature(adviserProfile) || adviserProfile.signatureUrl || ''
  );
  const [drawnSigUrl, setDrawnSigUrl] = useState<string>('');
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [hasDrawnStrokes, setHasDrawnStrokes] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reject modal state
  const [selectedRejectPreset, setSelectedRejectPreset] = useState('');
  const [rejectDetails, setRejectDetails] = useState('');

  // Resolve Adviser's registered e-signature
  useEffect(() => {
    if (!isAdviser) return;
    let cancelled = false;
    resolveUserSignature({
      uid: adviserProfile.uid,
      email: adviserProfile.email,
      name: adviserProfile.name,
      role: 'adviser',
      profile: adviserProfile,
    }).then((sig) => {
      if (!cancelled && sig) {
        setRegisteredSigUrl(sig);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAdviser, adviserProfile.uid, adviserProfile.email, adviserProfile.name, adviserProfile.signatureUrl]);

  const effectiveSigUrl = drawnSigUrl || registeredSigUrl;

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) * canvas.width) / rect.width,
      y: ((clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    setIsPointerDown(true);
    setHasDrawnStrokes(true);
  };

  const drawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPointerDown) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isPointerDown) return;
    setIsPointerDown(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setDrawnSigUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnStrokes(false);
    setDrawnSigUrl('');
  };

  const handleConfirmApprove = async () => {
    const sigToUse = effectiveSigUrl.trim();
    if (!sigToUse) {
      toast.error('Please draw or register your Club Adviser electronic signature before forwarding to SAS.');
      return;
    }
    setSubmitting(true);
    try {
      // Persist newly drawn signature for future approvals
      if (drawnSigUrl && drawnSigUrl !== registeredSigUrl) {
        try {
          await syncUserSignatureAcrossProfiles(
            { uid: adviserProfile.uid, email: adviserProfile.email, role: 'adviser' },
            drawnSigUrl
          );
          setRegisteredSigUrl(drawnSigUrl);
        } catch (_) {}
      }
      await onApproveAndForward({
        signatureUrl: sigToUse,
        remarks: approveRemarks.trim(),
      });
      toast.success(`${docLabel} approved by Club Adviser and forwarded to SAS!`);
      setShowApproveModal(false);
      setApproveRemarks('');
      onDecisionComplete?.();
    } catch (err: any) {
      console.error('[ClubAdviserDecisionPanel] Approve error:', err);
      toast.error(err?.message || `Failed to approve and forward ${docLabel}.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReturn = async (payload: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRevisionRemarks: Record<string, string>;
    returnDeadline: string;
  }) => {
    setSubmitting(true);
    try {
      await onReturnForRevision(payload);
      toast.success(`${docLabel} returned to officer for revision.`);
      setShowReturnModal(false);
      onDecisionComplete?.();
    } catch (err: any) {
      console.error('[ClubAdviserDecisionPanel] Return error:', err);
      toast.error(err?.message || `Failed to return ${docLabel} for revision.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReject = async () => {
    const combinedReason = [
      selectedRejectPreset && selectedRejectPreset !== 'Other' ? selectedRejectPreset : '',
      rejectDetails.trim(),
    ]
      .filter(Boolean)
      .join(' — ');

    if (!combinedReason) {
      toast.error('Please select a rejection reason or provide remarks.');
      return;
    }

    setSubmitting(true);
    try {
      await onReject({ reason: combinedReason });
      toast.success(`${docLabel} has been rejected.`);
      setShowRejectModal(false);
      setSelectedRejectPreset('');
      setRejectDetails('');
      onDecisionComplete?.();
    } catch (err: any) {
      console.error('[ClubAdviserDecisionPanel] Reject error:', err);
      toast.error(err?.message || `Failed to reject ${docLabel}.`);
    } finally {
      setSubmitting(false);
    }
  };

  // Render nothing if not awaiting adviser review and no adviserReview record exists
  if (!isForAdviserReview && !adviserReview) {
    return null;
  }

  return (
    <>
      <div
        className={`space-y-4 ${
          layout === 'inline'
            ? 'bg-slate-50/90 border border-slate-200 rounded-2xl p-4 sm:p-5'
            : ''
        } ${className}`}
      >
        {/* 1. ACTIVE CLUB ADVISER DECISION CONTROLS */}
        {isForAdviserReview && isAdviser ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center shrink-0 shadow-xs">
                <Gavel className="w-4.5 h-4.5" />
              </div>
              <div>
                <h4 className="text-[#001A4D] font-extrabold text-sm leading-tight">
                  {adviserAuthority.isCoAdviser ? 'Club Co-Adviser Decision' : 'Club Adviser Decision'}
                </h4>
                <p className="text-gray-500 text-[11px] leading-tight mt-0.5">
                  Check this officer submission before forwarding to SAS.
                </p>
              </div>
            </div>

            {adviserAuthority.statusBannerText && (
              <div
                className={`p-3 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2 ${
                  adviserAuthority.isAuthorityTransferredToCoAdviser
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                }`}
              >
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    adviserAuthority.isAuthorityTransferredToCoAdviser ? 'text-amber-600' : 'text-indigo-600'
                  }`}
                />
                <span>{adviserAuthority.statusBannerText}</span>
              </div>
            )}

            {/* Officer Submission Info */}
            <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  Submitted By Officer
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  <Clock className="w-3 h-3 animate-pulse" />
                  For Adviser Review
                </span>
              </div>
              <p className="font-bold text-slate-900">
                {record?.createdByName || 'Organization Officer'}
              </p>
              {record?.submittedToAdviserAt && (
                <p className="text-[11px] text-indigo-800/80">
                  Submitted: {formatAppDateTime(record.submittedToAdviserAt)}
                </p>
              )}
            </div>

            {/* Forwarding Destination Preview */}
            <div
              className={`p-3 rounded-xl border text-[11px] flex items-start gap-2.5 ${
                needsSignatories
                  ? 'bg-sky-50/80 border-sky-200 text-sky-900'
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              }`}
            >
              {needsSignatories ? (
                <Building2 className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
              ) : (
                <Coins className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold">
                  {needsSignatories
                    ? 'Route: SAS Vetting → Signatories'
                    : 'Route: Direct SAS Approval'}
                </p>
                <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                  {needsSignatories
                    ? 'Funded via School Budget / Misc Fee. Approving forwards to SAS first, then campus signatories.'
                    : 'Funded via Organization / Student Contribution / ₱0. Approving forwards directly to SAS.'}
                </p>
              </div>
            </div>

            {/* 3 Decision Buttons (No Request Clarification) */}
            <div
              className={
                layout === 'inline'
                  ? 'grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1'
                  : 'space-y-2.5 pt-1'
              }
            >
              <button
                type="button"
                onClick={() => {
                  setIsDrawingMode(!registeredSigUrl);
                  setShowApproveModal(true);
                }}
                disabled={submitting}
                className="w-full h-11 px-4 flex items-center justify-center gap-2 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#15803D] disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>Approve &amp; Forward</span>
              </button>

              <button
                type="button"
                onClick={() => setShowReturnModal(true)}
                disabled={submitting}
                className="w-full h-11 px-4 flex items-center justify-center gap-2 bg-[#FFC107] text-[#001A4D] font-bold text-xs rounded-xl hover:bg-[#F59E0B] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Return for Revision</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                disabled={submitting}
                className="w-full h-11 px-4 flex items-center justify-center gap-2 bg-white border border-[#EF4444] text-[#EF4444] font-bold text-xs rounded-xl hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject {documentType === 'AP' ? 'Proposal' : 'Report'}</span>
              </button>
            </div>
          </div>
        ) : isForAdviserReview && !isAdviser ? (
          /* 2. OFFICER VIEW WHILE AWAITING CLUB ADVISER */
          <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Clock className="w-4.5 h-4.5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-indigo-950 font-bold text-sm">Awaiting Club Adviser Review</h4>
                <p className="text-[11px] text-indigo-700">
                  Pending endorsement before forwarding to SAS
                </p>
              </div>
            </div>
            <p className="text-xs text-indigo-900/90 leading-relaxed">
              Your {docLabel.toLowerCase()} has been submitted to your Organization&apos;s Club Adviser. Once approved and signed by your Adviser, it will be forwarded to <strong>Student Affairs &amp; Services (SAS)</strong>
              {needsSignatories ? ' and institutional signatories' : ''}.
            </p>
          </div>
        ) : adviserReview && adviserReview.status !== 'pending' ? (
          /* 3. COMPLETED ADVISER DECISION SUMMARY CARD */
          <div
            className={`rounded-2xl p-4 border space-y-2.5 ${
              adviserReview.status === 'approved'
                ? 'bg-emerald-50/70 border-emerald-200'
                : adviserReview.status === 'returned'
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-rose-50/70 border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {adviserReview.status === 'approved' ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                ) : adviserReview.status === 'returned' ? (
                  <RotateCcw className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                ) : (
                  <XCircle className="w-4.5 h-4.5 text-rose-600 shrink-0" />
                )}
                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                  {adviserReview.status === 'approved'
                    ? adviserReview.reviewedByAdviserRole === 'co_adviser'
                      ? 'Approved by Club Co-Adviser'
                      : 'Approved by Club Adviser'
                    : adviserReview.status === 'returned'
                    ? adviserReview.reviewedByAdviserRole === 'co_adviser'
                      ? 'Returned by Club Co-Adviser'
                      : 'Returned by Club Adviser'
                    : adviserReview.reviewedByAdviserRole === 'co_adviser'
                    ? 'Rejected by Club Co-Adviser'
                    : 'Rejected by Club Adviser'}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-700 space-y-1">
              {adviserReview.reviewedByName && (
                <p>
                  <span className="text-slate-500">
                    {adviserReview.reviewedByAdviserRole === 'co_adviser' ? 'Co-Adviser: ' : 'Adviser: '}
                  </span>
                  <strong className="text-slate-900">{adviserReview.reviewedByName}</strong>
                  {adviserReview.actingOnBehalfOfName && (
                    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                      Acting for {adviserReview.actingOnBehalfOfName}
                    </span>
                  )}
                </p>
              )}
              {adviserReview.reviewedAt && (
                <p className="text-[11px] text-slate-500">
                  {formatAppDateTime(adviserReview.reviewedAt)}
                </p>
              )}
              {adviserReview.remarks && (
                <p className="mt-1.5 p-2.5 bg-white/90 rounded-xl border border-slate-200/80 text-xs text-slate-700 italic">
                  &ldquo;{adviserReview.remarks}&rdquo;
                </p>
              )}
              {adviserReview.status === 'approved' && adviserReview.signatureUrl && (
                <div className="mt-2 p-2 bg-white rounded-xl border border-emerald-200 flex items-center justify-center h-12">
                  <img
                    src={adviserReview.signatureUrl}
                    alt="Club Adviser Signature"
                    className="max-h-full max-w-[140px] object-contain filter contrast-125"
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── MODAL 1: APPROVE & FORWARD WITH ADVISER E-SIGNATURE ── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="px-6 py-5 bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5 text-[#FFD41C]" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base leading-tight">
                    Approve &amp; Forward to SAS
                  </h3>
                  <p className="text-xs text-blue-200 truncate">{documentTitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Club Adviser Endorsement &amp; Forwarding</p>
                  <p className="text-emerald-800 mt-0.5 leading-relaxed">
                    Your official e-signature will be stamped onto this {docLabel.toLowerCase()} as Club Adviser and it will advance to{' '}
                    <strong>
                      {needsSignatories
                        ? 'SAS Review → Institutional Signatory Pipeline'
                        : 'For SAS Review (Direct SAS Approval)'}
                    </strong>.
                  </p>
                </div>
              </div>

              {/* Adviser Signature Block */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#001A4D] flex items-center gap-1.5">
                    <FileSignature className="w-4 h-4 text-[#0E4EBD]" />
                    Club Adviser Electronic Signature
                  </span>
                  {effectiveSigUrl && !isDrawingMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDrawingMode(true);
                        setTimeout(() => clearCanvas(), 50);
                      }}
                      className="text-[11px] font-bold text-[#0E4EBD] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <PenTool className="w-3 h-3" />
                      Redraw Signature
                    </button>
                  )}
                </div>

                {effectiveSigUrl && !isDrawingMode ? (
                  <div className="bg-white border-2 border-emerald-400/50 rounded-xl p-3 flex flex-col items-center justify-center relative">
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Verified Signature
                    </span>
                    <img
                      src={effectiveSigUrl}
                      alt="Club Adviser Signature"
                      className="h-16 max-w-[200px] object-contain filter contrast-125 my-1"
                    />
                    <span className="text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-1 w-full text-center">
                      {adviserProfile.name} • Club Adviser
                    </span>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-300 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Draw your signature below:</span>
                      <div className="flex items-center gap-3">
                        {registeredSigUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setDrawnSigUrl('');
                              setIsDrawingMode(false);
                            }}
                            className="text-blue-600 font-bold hover:underline cursor-pointer"
                          >
                            Use Saved
                          </button>
                        )}
                        {hasDrawnStrokes && (
                          <button
                            type="button"
                            onClick={clearCanvas}
                            className="text-rose-600 font-bold hover:underline cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50/50 touch-none">
                      <canvas
                        ref={canvasRef}
                        width={460}
                        height={130}
                        onMouseDown={startDrawing}
                        onMouseMove={drawMove}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={drawMove}
                        onTouchEnd={stopDrawing}
                        className="w-full h-28 cursor-crosshair block"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Endorsement Remarks */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Adviser Endorsement Remarks <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={approveRemarks}
                  onChange={(e) => setApproveRemarks(e.target.value)}
                  placeholder="e.g. Checked schedule, objectives, and budget allocations. Endorsed for SAS review."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0E4EBD]"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowApproveModal(false)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={submitting || !effectiveSigUrl}
                className="px-5 py-2.5 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#15803D] shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Forwarding...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm Approve &amp; Forward</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: RETURN FOR REVISION (Step-by-Step) ── */}
      <StepReturnRevisionModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        documentTitle={documentTitle}
        referenceNo={referenceNo}
        documentType={documentType}
        steps={returnSteps}
        onSubmit={handleConfirmReturn}
        isSubmitting={submitting}
      />

      {/* ── MODAL 3: REJECT PROPOSAL / REPORT ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-5 bg-gradient-to-r from-rose-600 to-red-700 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base leading-tight">
                    Reject {docLabel}
                  </h3>
                  <p className="text-xs text-rose-100 truncate">{documentTitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Rejecting this {docLabel.toLowerCase()} marks it as <strong>Rejected</strong> inside your organization and notifies the submitting officer. It will <strong>not</strong> be forwarded to SAS.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Primary Rejection Reason
                </label>
                <select
                  value={selectedRejectPreset}
                  onChange={(e) => setSelectedRejectPreset(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 bg-white outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                >
                  <option value="">Select a reason...</option>
                  {ADVISER_REJECTION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Explanation / Remarks <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={rejectDetails}
                  onChange={(e) => setRejectDetails(e.target.value)}
                  placeholder="Provide clear feedback explaining why this submission is rejected..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={submitting || (!selectedRejectPreset && !rejectDetails.trim())}
                className="px-5 py-2.5 text-xs font-bold rounded-xl text-white bg-rose-600 hover:bg-rose-700 shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rejecting...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
