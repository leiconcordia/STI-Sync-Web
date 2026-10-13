import React, { useState } from 'react';
import {
  X,
  FileCheck2,
  Calendar,
  Building,
  Users,
  DollarSign,
  PenTool,
  Send,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Download,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import { endorsePARStep, returnPAR } from '../../modules/post-activity-reports/services/par.service';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import { formatCurrency, formatVariance } from '../../utils/currency';

interface PAREndorsementModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: PostActivityReportDocument | null;
  signatorySession: any;
  onOpenSignaturePad: () => void;
  onReportUpdated?: () => void;
}

export default function PAREndorsementModal({
  isOpen,
  onClose,
  report,
  signatorySession,
  onOpenSignaturePad,
  onReportUpdated,
}: PAREndorsementModalProps) {
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !report) return null;

  const hasSignature = Boolean(signatorySession?.signatureUrl);
  const activeSignatureUrl = signatorySession?.signatureUrl;

  const currentStep = (report.approvalChain || []).find(
    (s) =>
      s.status === 'current' &&
      ((s.signatoryUid && (s.signatoryUid === signatorySession?.id || s.signatoryUid === signatorySession?.uid)) ||
        (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (signatorySession?.email || '').toLowerCase()) ||
        (s.role && signatorySession?.role && s.role.toLowerCase() === signatorySession.role.toLowerCase()))
  );

  const isFinalApprover =
    currentStep?.actionType === 'approve' ||
    signatorySession?.role === 'school_president' ||
    signatorySession?.role === 'school_administrator';

  const handleEndorse = async () => {
    if (!hasSignature) {
      toast.error('Please register your electronic signature before endorsing this report.');
      onOpenSignaturePad();
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await endorsePARStep(
        report.id,
        {
          uid: signatorySession?.id || signatorySession?.uid,
          id: signatorySession?.id || signatorySession?.uid,
          name: signatorySession?.name || '',
          email: signatorySession?.email || '',
          roleTitle: signatorySession?.roleTitle || '',
          role: signatorySession?.role || '',
          signatureUrl: activeSignatureUrl,
        },
        remarks
      );

      if (result.isFullyApproved) {
        toast.success(`Post-Activity Report cleared & approved! Automatically archived to EDMS.`);
      } else if (result.stageAdvanced) {
        toast.success(`Endorsement recorded! Advanced to the next institutional clearance stage.`);
      } else {
        toast.success(`Endorsement recorded successfully.`);
      }

      if (onReportUpdated) onReportUpdated();
      onClose();
    } catch (err: any) {
      console.error('[PAREndorsementModal] Error endorsing:', err);
      toast.error(err?.message || 'Failed to endorse report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = async () => {
    if (!returnComment.trim()) {
      toast.error('Please enter revision remarks.');
      return;
    }

    setIsSubmitting(true);
    try {
      await returnPAR(
        report.id,
        signatorySession?.id || signatorySession?.uid || '',
        signatorySession?.name || 'Signatory',
        returnComment
      );
      toast.success('Report returned to organizer for revision.');
      if (onReportUpdated) onReportUpdated();
      setShowReturnDialog(false);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to return report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      await exportPostActivityReportPDF(report);
      toast.success(`Official Form PAR PDF downloaded.`);
    } catch (err: any) {
      toast.error('Failed to export PDF: ' + (err?.message || 'Error'));
    } finally {
      setIsExporting(false);
    }
  };

  const netBalance =
    (report.financialSummary?.totalRevenue || 0) -
    (report.financialSummary?.totalDisbursed || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] via-[#0E4EBD] to-[#1E70E8] p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <FileCheck2 className="w-6 h-6 text-[#FFD41C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full text-white">
                  Institutional Endorsement
                </span>
                <span className="text-xs text-blue-200 font-mono font-bold">
                  {report.referenceNo}
                </span>
              </div>
              <h2 className="text-lg font-black tracking-tight text-white mt-0.5">
                {report.eventTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Facts Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Hosting Body</span>
              <strong className="text-slate-900 font-bold">{report.organizationName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Conducted At</span>
              <strong className="text-slate-900 font-bold">{report.eventDateFormatted}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Venue</span>
              <strong className="text-slate-900 font-bold">{report.eventVenue}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">LF-01 Clearance</span>
              <strong className="text-emerald-700 font-bold">{report.liquidationRefNumber || 'Cleared'}</strong>
            </div>
          </div>

          {/* Verification Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attendance Verification */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Attendance Verification
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center my-2">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Registered</span>
                  <span className="text-base font-bold text-slate-800">
                    {report.attendanceSummary?.registeredCount || 0}
                  </span>
                </div>
                <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                  <span className="text-[10px] text-blue-700 block font-medium">Verified (Scanned)</span>
                  <span className="text-base font-bold text-blue-800">
                    {report.attendanceSummary?.attendedCount || 0}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-600">
                <strong>Participants:</strong> {report.attendanceSummary?.whoAttended || 'College students'}
              </p>
            </div>

            {/* Financial Clearance Summary */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Financial Clearance (Form LF-01)
                </h4>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center my-2">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Collections</span>
                  <span className="text-xs font-bold text-slate-800">
                    {formatCurrency(report.financialSummary?.totalRevenue || 0)}
                  </span>
                </div>
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Disbursed</span>
                  <span className="text-xs font-bold text-slate-800">
                    {formatCurrency(report.financialSummary?.totalDisbursed || 0)}
                  </span>
                </div>
                <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 block font-medium">Balance</span>
                  <span className="text-xs font-bold text-emerald-800">
                    {formatVariance(netBalance)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Audited & cleared under Form LF-01 financial liquidation.
              </p>
            </div>
          </div>

          {/* Objectives Narrative & Key Learnings */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Objectives Achievement & Key Learnings
            </h4>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Status:</span>
              <span className="font-bold text-blue-700 uppercase bg-blue-50 px-2 py-0.5 rounded">
                {(report.results?.objectiveStatus || 'fully_achieved').replace('_', ' ')}
              </span>
            </div>
            {report.results?.achievementNarrative && (
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                {report.results.achievementNarrative}
              </p>
            )}

            {report.results?.keyLearnings && report.results.keyLearnings.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-xs font-bold text-slate-700 block">Key Learnings & Insights:</span>
                <ul className="space-y-1 text-xs text-slate-700">
                  {report.results.keyLearnings.map((k, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold">•</span>
                      <span>{k}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 4 Categorized Recommendations */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              STI Categorized Recommendations
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <strong className="text-slate-900 block mb-1">1. Program Flow</strong>
                <p className="text-slate-600">• Obs: {report.recommendations?.programFlow?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.programFlow?.recommendations || '—'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <strong className="text-slate-900 block mb-1">2. Participant Engagement</strong>
                <p className="text-slate-600">• Obs: {report.recommendations?.participantEngagement?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.participantEngagement?.recommendations || '—'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <strong className="text-slate-900 block mb-1">3. Technical Setup</strong>
                <p className="text-slate-600">• Obs: {report.recommendations?.technicalSetup?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.technicalSetup?.recommendations || '—'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <strong className="text-slate-900 block mb-1">4. Participant Preparedness</strong>
                <p className="text-slate-600">• Obs: {report.recommendations?.participantPreparedness?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.participantPreparedness?.recommendations || '—'}</p>
              </div>
            </div>
          </div>

          {/* Attached Photos */}
          {report.photos && report.photos.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Photo Documentation ({report.photos.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {report.photos.map((p) => (
                  <div key={p.id} className="rounded-lg overflow-hidden border border-slate-200 aspect-video relative group">
                    <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1 text-white text-[10px] truncate">
                      {p.caption}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signatory Action Card */}
          <div className="border-2 border-blue-200 rounded-2xl p-5 bg-gradient-to-br from-blue-50/60 to-slate-50 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PenTool className="w-5 h-5 text-blue-700" />
                <h4 className="text-xs font-black uppercase tracking-wider text-[#001A4D]">
                  Signatory Digital Endorsement & Clearance
                </h4>
              </div>
              <span className="text-xs font-bold text-slate-700">
                {signatorySession?.name} ({signatorySession?.roleTitle || 'Signatory'})
              </span>
            </div>

            {hasSignature ? (
              <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-blue-200">
                <img
                  src={activeSignatureUrl}
                  alt="Registered Signature"
                  className="h-10 max-w-[120px] object-contain border border-slate-100 rounded p-1 bg-slate-50"
                />
                <div className="text-xs">
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Electronic Signature Registered
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Your official signature will be stamped on Form PAR.
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700" />
                  <span>No electronic signature found for your account.</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenSignaturePad}
                  className="text-xs font-bold text-blue-700 underline hover:text-blue-900"
                >
                  Register Signature Now
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Endorsement Remarks / Administrative Notes (Optional)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Cleared and verified with academic department."
                className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 px-6 flex items-center justify-between">
          <button
            type="button"
            disabled={isExporting}
            onClick={handleDownloadPdf}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-blue-600" />}
            Export PDF
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setShowReturnDialog(true)}
              className="px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" /> Return for Revision
            </button>
            <button
              type="button"
              disabled={isSubmitting || !hasSignature}
              onClick={handleEndorse}
              className="px-5 py-2 text-xs font-black text-white bg-gradient-to-r from-[#0E4EBD] to-[#001A4D] hover:opacity-95 rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Recording...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-[#FFD41C]" />
                  {isFinalApprover ? 'Approve & Clear Form PAR' : 'Endorse & Forward'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Return Dialog */}
      {showReturnDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-5 w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-red-600" />
              Return Report for Revision
            </h3>
            <textarea
              rows={3}
              value={returnComment}
              onChange={(e) => setReturnComment(e.target.value)}
              placeholder="State clear reasons for return (e.g., photo documentation required, narrative clarity)..."
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReturnDialog(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleReturn}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
