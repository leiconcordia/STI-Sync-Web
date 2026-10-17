import React, { useState, useMemo } from 'react';
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
  GitCompare,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import { endorsePARStep, returnPAR } from '../../modules/post-activity-reports/services/par.service';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import { formatCurrency, formatVariance } from '../../utils/currency';
import RevisionDiffViewerModal from '../../modules/workflow/components/RevisionDiffViewerModal';
import RevisionFeedbackBanner from '../../modules/workflow/components/RevisionFeedbackBanner';
import InlineRevisionBadge from '../../modules/workflow/components/InlineRevisionBadge';
import { diffPostActivityReport } from '../../modules/workflow/utils/document-diff-engine';
import StepReturnRevisionModal from '../../modules/workflow/components/StepReturnRevisionModal';
import { PAR_SECTIONS_FOR_REVISION } from '../../modules/post-activity-reports/types/par.types';

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
  const [isExporting, setIsExporting] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);

  // Compute latest snapshot and differences if report was revised
  const latestSnapshot = useMemo(() => {
    const history = report?.revisionHistory || [];
    if (history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        const snap =
          (item as any)?.dataSnapshot ||
          (item as any)?.previousSnapshot ||
          (item as any)?.snapshot ||
          (item as any)?.returnedSnapshot;
        if (snap && (snap.attendanceSummary || snap.results || !(report as any)?.previousSnapshot)) {
          return snap;
        }
      }
    }
    return (
      (report as any)?.previousSnapshot ||
      (report as any)?.returnedSnapshot ||
      (report as any)?.initialSnapshot ||
      (history.length > 0 ? (history[history.length - 1] as any)?.dataSnapshot : null) ||
      null
    );
  }, [report]);

  const parDiffs = useMemo(() => {
    if (!report || !latestSnapshot) return [];
    return diffPostActivityReport(latestSnapshot, report);
  }, [report, latestSnapshot]);

  const diffByPath = useMemo(() => {
    const map = new Map<string, any>();
    for (const d of parDiffs) {
      map.set(d.fieldPath, d);
    }
    return map;
  }, [parDiffs]);

  const hasRevisions = Boolean(
    (report?.version && report.version > 1) ||
    (report?.revisionCount && report.revisionCount > 1) ||
    (report?.revisionHistory && report.revisionHistory.length > 0) ||
    Boolean((report as any)?.previousSnapshot) ||
    Boolean((report as any)?.returnedSnapshot) ||
    report?.status === 'returned'
  );

  if (!isOpen || !report) return null;

  const hasSignature = Boolean(signatorySession?.signatureUrl);
  const activeSignatureUrl = signatorySession?.signatureUrl;

  const chain = report.approvalChain || [];
  const myStepIndex = chain.findIndex((s) => {
    if (s.signatoryUid && (s.signatoryUid === signatorySession?.id || s.signatoryUid === signatorySession?.uid)) return true;
    if (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (signatorySession?.email || '').toLowerCase()) return true;
    if (s.role && signatorySession?.role && s.role.toLowerCase() === signatorySession.role.toLowerCase()) return true;
    if (s.roleTitle && signatorySession?.roleTitle) {
      const sT = s.roleTitle.toLowerCase();
      const uT = signatorySession.roleTitle.toLowerCase();
      if (sT === uT || sT.includes(uT) || uT.includes(sT)) return true;
    }
    return false;
  });

  const myStep = myStepIndex >= 0 ? chain[myStepIndex] : chain.find((s) => s.status === 'current');

  // Strict dynamic approver check based on step actionType
  const isApprover = myStep?.actionType === 'approve' || signatorySession?.actionType === 'approve';

  // Count remaining approvers in the pipeline AFTER my step
  const subsequentApproversCount = chain.filter((s, idx) => {
    return idx > myStepIndex && s.actionType === 'approve';
  }).length;

  const hasSubsequentApprover = isApprover && subsequentApproversCount > 0;
  const isFinalApprover = isApprover && subsequentApproversCount === 0;

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

  const handleReturn = async (data: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRemarks: Record<string, string>;
    revisionDeadline: string;
  }) => {
    setIsSubmitting(true);
    try {
      await returnPAR(
        report.id,
        signatorySession?.id || signatorySession?.uid || '',
        signatorySession?.name || 'Signatory',
        data.overallRemarks,
        signatorySession?.roleTitle || 'Institutional Signatory',
        signatorySession?.email || undefined,
        data.stepRemarks,
        data.flaggedSteps,
        data.revisionDeadline
      );
      toast.success('Post-Activity Report returned to organizer with section-level revision notes.');
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
                {hasRevisions && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/40">
                    Revision v{report.version || 2}.0
                  </span>
                )}
              </div>
              <h2 className="text-lg font-black tracking-tight text-white mt-0.5">
                {report.eventTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasRevisions && (
              <button
                type="button"
                onClick={() => setShowDiffModal(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Compare what was revised in this Post-Activity Report"
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Compare Changes</span>
                {parDiffs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-amber-300 text-[10px] font-black">
                    {parDiffs.length}
                  </span>
                )}
              </button>
            )}
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
          {/* Revision Banner if report has past revision history */}
          {hasRevisions && (
            <RevisionFeedbackBanner
              returnedBy={{
                name: (report as any).returnedByName || (report as any).returnedBy || 'Institutional Signatory',
                roleTitle: (report as any).returnedByRoleTitle || 'Signatory Reviewer',
                email: (report as any).returnedByEmail,
              }}
              returnedAt={report.returnedAt}
              returnRemarks={report.returnRemarks}
              revisionHistory={report.revisionHistory}
              versionLabel={report.version ? `v${report.version}.0` : undefined}
              documentTitle={report.eventTitle}
              documentType="PAR"
              currentDocument={report}
              previousSnapshot={latestSnapshot}
            />
          )}

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
              <span className="text-slate-400 block font-medium">Liquidation Clearance</span>
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
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base font-bold text-slate-800">
                      {report.attendanceSummary?.registeredCount || 0}
                    </span>
                    {diffByPath.get('attendanceSummary.registeredCount') && (
                      <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.registeredCount')} />
                    )}
                  </div>
                </div>
                <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                  <span className="text-[10px] text-blue-700 block font-medium">Verified (Scanned)</span>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base font-bold text-blue-800">
                      {report.attendanceSummary?.attendedCount || 0}
                    </span>
                    {diffByPath.get('attendanceSummary.attendedCount') && (
                      <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.attendedCount')} />
                    )}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                <span><strong>Participants:</strong> {report.attendanceSummary?.whoAttended || 'College students'}</span>
                {diffByPath.get('attendanceSummary.whoAttended') && (
                  <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.whoAttended')} />
                )}
              </div>
            </div>

            {/* Financial Clearance Summary */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Financial Clearance
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
                Audited & cleared under institutional financial liquidation.
              </p>
            </div>
          </div>

          {/* Objectives Narrative & Key Learnings */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Objectives Achievement & Key Learnings
              </h4>
              {diffByPath.get('results.objectiveStatus') && (
                <InlineRevisionBadge diff={diffByPath.get('results.objectiveStatus')} />
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Status:</span>
              <span className="font-bold text-blue-700 uppercase bg-blue-50 px-2 py-0.5 rounded">
                {(report.results?.objectiveStatus || 'fully_achieved').replace('_', ' ')}
              </span>
            </div>
            {report.results?.achievementNarrative && (
              <div className="space-y-1">
                {diffByPath.get('results.achievementNarrative') && (
                  <div className="mb-1">
                    <InlineRevisionBadge diff={diffByPath.get('results.achievementNarrative')} />
                  </div>
                )}
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {report.results.achievementNarrative}
                </p>
              </div>
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
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">1. Program Flow</strong>
                  {diffByPath.get('recommendations.programFlow') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.programFlow')} />
                  )}
                </div>
                <p className="text-slate-600">• Obs: {report.recommendations?.programFlow?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.programFlow?.recommendations || '—'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">2. Participant Engagement</strong>
                  {diffByPath.get('recommendations.participantEngagement') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.participantEngagement')} />
                  )}
                </div>
                <p className="text-slate-600">• Obs: {report.recommendations?.participantEngagement?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.participantEngagement?.recommendations || '—'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">3. Technical Setup</strong>
                  {diffByPath.get('recommendations.technicalSetup') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.technicalSetup')} />
                  )}
                </div>
                <p className="text-slate-600">• Obs: {report.recommendations?.technicalSetup?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.technicalSetup?.recommendations || '—'}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">4. Participant Preparedness</strong>
                  {diffByPath.get('recommendations.participantPreparedness') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.participantPreparedness')} />
                  )}
                </div>
                <p className="text-slate-600">• Obs: {report.recommendations?.participantPreparedness?.observations || '—'}</p>
                <p className="text-slate-700 mt-1">• Rec: {report.recommendations?.participantPreparedness?.recommendations || '—'}</p>
              </div>
            </div>
          </div>

          {/* Attached Photos */}
          {report.photos && report.photos.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Photo Documentation ({report.photos.length})
                </h4>
                {diffByPath.get('photos') && (
                  <InlineRevisionBadge diff={diffByPath.get('photos')} />
                )}
              </div>
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
                  {hasSubsequentApprover
                    ? 'Endorse & Forward to Higher-Ups'
                    : isFinalApprover
                    ? 'Grant Final Approval'
                    : 'Stamp E-Signature & Endorse Report'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Step/Section-Level Return for Revision Modal */}
      <StepReturnRevisionModal
        isOpen={showReturnDialog}
        onClose={() => setShowReturnDialog(false)}
        onSubmit={handleReturn}
        title="Return Post-Activity Report for Revision"
        subtitle={`Flag specific sections and write targeted feedback for ${report.eventTitle || report.referenceNo}.`}
        steps={PAR_SECTIONS_FOR_REVISION}
        isSubmitting={isSubmitting}
        documentType="PAR"
      />

      {/* Visual Diff Comparison Modal */}
      <RevisionDiffViewerModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        documentTitle={report.eventTitle || 'Post-Activity Report'}
        documentType="PAR"
        currentDocument={report}
        previousSnapshot={latestSnapshot}
        customDiffs={parDiffs}
        revisionNumber={report.version || report.revisionCount || ((report.revisionHistory?.length || 0) + 1)}
        revisionHistory={report.revisionHistory}
      />
    </div>
  );
}
