import React, { useState, useMemo } from 'react';
import {
  X,
  FileCheck2,
  Calendar,
  Building2,
  Users,
  DollarSign,
  Download,
  Edit3,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  FileText,
  Loader2,
  Eye,
  MessageSquare,
  Undo2,
  GitCompare,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PostActivityReportDocument } from '../types/par.types';
import { exportPostActivityReportPDF } from '../utils/par-pdf-exporter';
import { formatCurrency, formatVariance } from '../../../utils/currency';
import { approvePAR, returnPAR, withdrawPostActivityReport } from '../services/par.service';
import { resolveApprovalPermissions } from '../../workflow/utils/approval-permissions.utils';
import RevisionFeedbackBanner from '../../workflow/components/RevisionFeedbackBanner';
import WithdrawConfirmModal from '../../workflow/components/WithdrawConfirmModal';
import InlineRevisionBadge from '../../workflow/components/InlineRevisionBadge';
import RevisionDiffViewerModal from '../../workflow/components/RevisionDiffViewerModal';
import { diffPostActivityReport } from '../../workflow/utils/document-diff-engine';
import StepReturnRevisionModal from '../../workflow/components/StepReturnRevisionModal';
import { PAR_SECTIONS_FOR_REVISION } from '../types/par.types';

interface PostActivityReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: PostActivityReportDocument | null;
  onEdit?: (report: PostActivityReportDocument) => void;
  canEdit?: boolean;
  isSasAdmin?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  currentUser?: {
    uid: string;
    name?: string;
    role?: string;
    organizationId?: string;
    email?: string;
  };
  onRefresh?: () => void;
}

export default function PostActivityReportDetailModal({
  isOpen,
  onClose,
  report,
  onEdit,
  canEdit = false,
  isSasAdmin = false,
  currentUserId = '',
  currentUserName = '',
  currentUser,
  onRefresh,
}: PostActivityReportDetailModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [showApproveConfirmModal, setShowApproveConfirmModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
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

  const effectiveUser = useMemo(() => {
    return currentUser || {
      uid: currentUserId,
      name: currentUserName,
      role: isSasAdmin ? 'admin' : 'officer',
      organizationId: isSasAdmin ? 'sao_admin' : (report?.organizationId || ''),
    };
  }, [currentUser, currentUserId, currentUserName, isSasAdmin, report?.organizationId]);

  const permissions = useMemo(() => {
    return resolveApprovalPermissions(report, effectiveUser);
  }, [report, effectiveUser]);

  if (!isOpen || !report) return null;

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      await exportPostActivityReportPDF(report);
      toast.success(`Official Form PAR PDF generated for ${report.referenceNo}`);
    } catch (err: any) {
      console.error('[PostActivityReportDetailModal] PDF Error:', err);
      toast.error('Failed to generate PDF: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleApprove = async () => {
    if (!permissions.canApprove) return;
    setIsReviewing(true);
    try {
      const isSchoolBudgetGate =
        (report as any).fundingSource !== 'organization_funds' &&
        (report as any).isPendingSasVetting === true &&
        (report.approvalChain || []).length > 0;
      await approvePAR(report.id, effectiveUser.uid, effectiveUser.name || 'Institutional Signatory', 'Approved by Student Affairs Services.');
      toast.success(
        isSchoolBudgetGate
          ? `Post-Activity Report (${report.referenceNo}) cleared by SAS and released to Signatories!`
          : `Post-Activity Report (${report.referenceNo}) approved and archived to EDMS!`
      );
      if (onRefresh) onRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve report.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleReturn = async (data: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRemarks: Record<string, string>;
    revisionDeadline: string;
  }) => {
    if (!permissions.canReturn) return;
    setIsReviewing(true);
    try {
      await returnPAR(
        report.id,
        effectiveUser.uid,
        effectiveUser.name || 'Signatory Reviewer',
        data.overallRemarks,
        effectiveUser.roleTitle || 'Institutional Signatory',
        effectiveUser.email || undefined,
        data.stepRemarks,
        data.flaggedSteps,
        data.revisionDeadline
      );
      toast.success(`Post-Activity Report returned for revision with section-level remarks.`);
      setShowReturnModal(false);
      if (onRefresh) onRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to return report.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await withdrawPostActivityReport(report.id, effectiveUser.uid, effectiveUser.name || 'Author');
      toast.success(`Post-Activity Report (${report.referenceNo}) withdrawn to draft.`);
      setShowWithdrawModal(false);
      if (onRefresh) onRefresh();
      onClose();
      if (onEdit) onEdit({ ...report, status: 'draft' });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to withdraw report.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const netBalance =
    (report.financialSummary?.totalRevenue || 0) -
    (report.financialSummary?.totalDisbursed || 0);

  const statusBadge = () => {
    switch (report.status) {
      case 'approved':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved & Cleared
          </span>
        );
      case 'under_review':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Under Institutional Review
          </span>
        );
      case 'returned':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <RotateCcw className="w-3.5 h-3.5" /> Returned for Revision
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Draft
          </span>
        );
    }
  };

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
                  Official Form PAR
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
            {statusBadge()}
            {hasRevisions && (
              <button
                type="button"
                onClick={() => setShowDiffModal(true)}
                className="px-3 py-1 rounded-full bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
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
              className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Returned Alert Notice with full history if applicable */}
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
              canEdit={canEdit || permissions.canEdit}
              onEditClick={() => {
                onClose();
                if (onEdit) onEdit(report);
              }}
              documentTitle={report.eventTitle}
              documentType="PAR"
              currentDocument={report}
              previousSnapshot={latestSnapshot}
              versionLabel={`v${report.revisionCount || 1}.0`}
            />
          )}

          {/* Institutional Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Hosting Body</span>
              <strong className="text-slate-900 font-bold">{report.organizationName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Date Conducted</span>
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

          {/* Section 1 & 2 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attendance Verification */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Attendance Verification
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center mb-3">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Registered</span>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base font-black text-slate-800">
                      {report.attendanceSummary?.registeredCount || 0}
                    </span>
                    {diffByPath.get('attendanceSummary.registeredCount') && (
                      <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.registeredCount')} />
                    )}
                  </div>
                </div>
                <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200">
                  <span className="text-[11px] text-blue-700 block font-semibold">Attended (Turnout)</span>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base font-black text-blue-800">
                      {report.attendanceSummary?.attendedCount || 0}
                    </span>
                    {report.attendanceSummary?.turnoutRate !== undefined && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                        {report.attendanceSummary.turnoutRate}%
                      </span>
                    )}
                    {diffByPath.get('attendanceSummary.attendedCount') && (
                      <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.attendedCount')} />
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs space-y-1 text-slate-600">
                <p>
                  <strong>Target:</strong> {report.attendanceSummary?.targetAudience || 'Enrolled Students'}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p>
                    <strong>Actual:</strong> {report.attendanceSummary?.whoAttended || 'College / SHS Students'}
                  </p>
                  {diffByPath.get('attendanceSummary.whoAttended') && (
                    <InlineRevisionBadge diff={diffByPath.get('attendanceSummary.whoAttended')} />
                  )}
                </div>
              </div>
            </div>

            {/* Financial Clearance Summary */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Financial Report (Approved Proposal Budget)
                </h4>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Total Budget</span>
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
                  <span className="text-[10px] text-emerald-700 block font-semibold">Balance</span>
                  <span className="text-xs font-bold text-emerald-800">
                    {formatVariance(netBalance)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Financial allocations sourced directly from approved Form AP-01 proposal baseline.
              </p>
            </div>
          </div>

          {/* Section 3: Objectives & Results */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Evaluation of Objectives & Learning Outcomes
              </h4>
              <div className="flex items-center gap-2">
                {report.results?.compositeSuccessScore !== undefined && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {report.results.compositeSuccessScore}% Success Rating
                  </span>
                )}
                {diffByPath.get('results.objectiveStatus') && (
                  <InlineRevisionBadge diff={diffByPath.get('results.objectiveStatus')} />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Status:</span>
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

            {/* Itemized Objective Assessments */}
            {report.results?.objectiveAssessments && report.results.objectiveAssessments.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-700 block">Itemized Objective & KPI Assessment:</span>
                <div className="space-y-1.5">
                  {report.results.objectiveAssessments.map((oa: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-semibold text-slate-800">{oa.objective}</div>
                        {oa.actualResult && (
                          <div className="text-[11px] text-slate-600">
                            <span className="text-slate-400 font-medium">Actual Result: </span>{oa.actualResult}
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 border ${
                        oa.status === 'fully_achieved'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : oa.status === 'partially_achieved'
                          ? 'bg-amber-50 text-amber-700 border-amber-300'
                          : 'bg-rose-50 text-rose-700 border-rose-300'
                      }`}>
                        {oa.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.results?.keyLearnings && report.results.keyLearnings.length > 0 && (
              <div className="space-y-1.5 pt-1">
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

          {/* Section 4: 4 Categorized Recommendations */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              STI Categorized Recommendations (Post-Mortem)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">1. Program Flow</strong>
                  {diffByPath.get('recommendations.programFlow') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.programFlow')} />
                  )}
                </div>
                <p className="text-slate-600">
                  • <em>Obs:</em> {report.recommendations?.programFlow?.observations || '—'}
                </p>
                <p className="text-slate-700 mt-1">
                  • <em>Rec:</em> {report.recommendations?.programFlow?.recommendations || '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">2. Participant Engagement</strong>
                  {diffByPath.get('recommendations.participantEngagement') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.participantEngagement')} />
                  )}
                </div>
                <p className="text-slate-600">
                  • <em>Obs:</em> {report.recommendations?.participantEngagement?.observations || '—'}
                </p>
                <p className="text-slate-700 mt-1">
                  • <em>Rec:</em> {report.recommendations?.participantEngagement?.recommendations || '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">3. Technical Setup</strong>
                  {diffByPath.get('recommendations.technicalSetup') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.technicalSetup')} />
                  )}
                </div>
                <p className="text-slate-600">
                  • <em>Obs:</em> {report.recommendations?.technicalSetup?.observations || '—'}
                </p>
                <p className="text-slate-700 mt-1">
                  • <em>Rec:</em> {report.recommendations?.technicalSetup?.recommendations || '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <strong className="text-slate-900 block">4. Participant Preparedness</strong>
                  {diffByPath.get('recommendations.participantPreparedness') && (
                    <InlineRevisionBadge diff={diffByPath.get('recommendations.participantPreparedness')} />
                  )}
                </div>
                <p className="text-slate-600">
                  • <em>Obs:</em> {report.recommendations?.participantPreparedness?.observations || '—'}
                </p>
                <p className="text-slate-700 mt-1">
                  • <em>Rec:</em> {report.recommendations?.participantPreparedness?.recommendations || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Section 5: Photo Gallery */}
          {report.photos && report.photos.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Photo Documentation ({report.photos.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {report.photos.map((p) => (
                  <div key={p.id} className="rounded-lg overflow-hidden border border-slate-200 aspect-video group relative">
                    <img src={p.url} alt={p.caption} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1.5 text-white text-[10px] truncate">
                      {p.caption}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 6: Institutional Signatories Pipeline */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Signatory Endorsement Chain
            </h4>
            <div className="space-y-2">
              {(report.approvalChain || []).map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        step.status === 'endorsed' || step.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : step.status === 'current'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {step.step}
                    </div>
                    <div>
                      <strong className="text-slate-900 block font-bold">{step.signatoryName}</strong>
                      <span className="text-[11px] text-slate-500">
                        {step.roleTitle} {step.department ? `(${step.department})` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        step.status === 'endorsed' || step.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : step.status === 'current'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {step.status}
                    </span>
                    {step.signedAt && (
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {new Date(step.signedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 bg-slate-50 p-4 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadPdf}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-blue-600" />}
              Export Official PDF
            </button>
            {(canEdit || permissions.canEdit) && (report.status === 'draft' || report.status === 'returned') && onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(report);
                }}
                className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" /> {report.status === 'returned' ? 'Edit & Resubmit Report' : 'Edit Report'}
              </button>
            )}

            {permissions.canWithdraw && (
              <button
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                className="px-3.5 py-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-600" /> Withdraw Submission
              </button>
            )}
          </div>

          {/* Reviewer Actions (Guarded against author self-approval) */}
          <div className="flex items-center gap-2">
            {permissions.isOwner && report.status === 'under_review' && (
              <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Authored Report • In Signatory Pipeline
              </span>
            )}

            {permissions.canReturn && (
              <button
                type="button"
                disabled={isReviewing}
                onClick={() => setShowReturnModal(true)}
                className="px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" /> Return with Remarks
              </button>
            )}

            {permissions.canApprove && (
              <button
                type="button"
                disabled={isReviewing}
                onClick={() => setShowApproveConfirmModal(true)}
                className="px-5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isReviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {(report as any).fundingSource !== 'organization_funds' && (report as any).isPendingSasVetting === true
                  ? 'Approve & Release to Signatories'
                  : 'Approve & Sign as SAS'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Author Withdraw Modal */}
      <WithdrawConfirmModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onConfirm={handleWithdraw}
        documentType="Post-Activity Report"
        documentTitle={report.eventTitle}
        isProcessing={isWithdrawing}
      />

      {/* Step/Section-Level Return for Revision Modal */}
      <StepReturnRevisionModal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        onSubmit={handleReturn}
        title="Return Post-Activity Report for Revision"
        subtitle={`Flag specific sections and write targeted feedback for ${report.eventTitle || report.referenceNo}.`}
        steps={PAR_SECTIONS_FOR_REVISION}
        isSubmitting={isReviewing}
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

      {/* SAS PAR Approval / Release Confirmation Modal */}
      {showApproveConfirmModal && report && (() => {
        const isRelease = (report as any).fundingSource !== 'organization_funds' && (report as any).isPendingSasVetting === true;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              <div className={`p-5 flex items-center gap-3.5 border-b text-white ${
                isRelease
                  ? 'bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD]'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-700'
              }`}>
                <div className="p-2.5 rounded-2xl bg-white/10 text-white">
                  {isRelease ? <Send className="w-6 h-6 text-[#FFD41C]" /> : <CheckCircle2 className="w-6 h-6" />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-white">
                    {isRelease ? 'Confirm SAS Review Clearance & Release' : 'Confirm Post-Activity Report Approval'}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5 truncate max-w-xs">{report.eventTitle}</p>
                </div>
              </div>

              <div className="p-5 space-y-3.5">
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {isRelease
                    ? 'Are you sure you want to clear SAS vetting and release this Post-Activity Report to institutional signatories?'
                    : 'Are you sure you want to approve and finalize this Post-Activity Report?'}
                </p>

                <div className="p-3.5 rounded-2xl border bg-slate-50 border-slate-200 text-xs leading-relaxed space-y-2">
                  <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
                    What happens next:
                  </div>
                  {isRelease ? (
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                      <li>SAS clearance is recorded and the report status transitions to under review.</li>
                      <li>Stage 1 campus signatories will be notified to review and sign.</li>
                      <li>The student organization cannot withdraw this report once any signatory signs.</li>
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                      <li>Official SAS clearance is stamped onto Form PAR-01.</li>
                      <li>The report status transitions to <strong>Approved</strong>.</li>
                      <li>The report is archived into the campus EDMS repository.</li>
                      <li>The student organization will be notified immediately.</li>
                    </ul>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowApproveConfirmModal(false)}
                  disabled={isReviewing}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowApproveConfirmModal(false);
                    await handleApprove();
                  }}
                  disabled={isReviewing}
                  className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 text-white ${
                    isRelease
                      ? 'bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] hover:from-[#002B7F] hover:to-[#001A4D]'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isReviewing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      {isRelease ? <Send className="w-4 h-4 text-[#FFD41C]" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{isRelease ? 'Approve & Release to Signatories' : 'Confirm & Approve as SAS'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
