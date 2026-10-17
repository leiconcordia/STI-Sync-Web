/**
 * src/app/signatory/components/LiquidationEndorsementModal.tsx
 *
 * Synchronized Dual-Pane Verification Studio for Financial Liquidations (Form LF-01).
 * Features zero-click instant receipt rendering, live expense-to-receipt matching bar,
 * zoom/rotation controls, multi-attachment switching, and smart revision change highlighting.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  PenTool,
  Send,
  ShieldCheck,
  Building,
  UserCheck,
  Calendar,
  AlertCircle,
  Eye,
  ExternalLink,
  FileText,
  File,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Layers,
  Sparkles,
  Clock,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  GitCompare,
} from 'lucide-react';
import { toast } from 'sonner';
import RevisionDiffViewerModal from '../../modules/workflow/components/RevisionDiffViewerModal';
import InlineRevisionBadge from '../../modules/workflow/components/InlineRevisionBadge';
import RevisionFeedbackBanner from '../../modules/workflow/components/RevisionFeedbackBanner';
import StepReturnRevisionModal from '../../modules/workflow/components/StepReturnRevisionModal';
import { diffFinancialLiquidation } from '../../modules/workflow/utils/document-diff-engine';
import {
  buildLiquidationReturnSteps,
  type LiquidationDocument,
  type ExpenseLineItem,
  type ReceiptAttachment,
} from '../../modules/finance/types/liquidation.types';
import {
  endorseLiquidationStep,
  returnLiquidationStep,
} from '../../modules/finance/services/liquidation.service';
import LiquidationSignatoryTracker from '../../modules/finance/components/LiquidationSignatoryTracker';
import { formatCurrency, formatVariance } from '../../utils/currency';
import { formatAppDateTime } from '../../utils/date';
import ReceiptLightboxModal from '../../modules/finance/components/ReceiptLightboxModal';

interface LiquidationEndorsementModalProps {
  isOpen?: boolean;
  onClose: () => void;
  liquidation: LiquidationDocument | null;
  signatorySession: any;
  onOpenSignaturePad: () => void;
  onLiquidationUpdated?: () => void;
}

function normalizeItemAttachments(item: ExpenseLineItem | undefined): ReceiptAttachment[] {
  if (!item) return [];
  if (Array.isArray(item.receiptFiles) && item.receiptFiles.length > 0) {
    return item.receiptFiles;
  }
  if (Array.isArray(item.receiptUrls) && item.receiptUrls.length > 0) {
    return item.receiptUrls.map((url, idx) => ({
      id: `url-rec-${idx}`,
      url,
      name: `Receipt File ${idx + 1}`,
      fileType: url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
    }));
  }
  if (item.receiptUrl) {
    return [
      {
        id: 'legacy-rec-0',
        url: item.receiptUrl,
        name: 'Official Receipt Attachment',
        fileType: item.receiptUrl.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
      },
    ];
  }
  return [];
}

export default function LiquidationEndorsementModal({
  isOpen = true,
  onClose,
  liquidation,
  signatorySession,
  onOpenSignaturePad,
  onLiquidationUpdated,
}: LiquidationEndorsementModalProps) {
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotationDeg, setRotationDeg] = useState(0);

  const [remarks, setRemarks] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [initialReturnFlags, setInitialReturnFlags] = useState<string[]>([]);
  const [initialStepRemarks, setInitialStepRemarks] = useState<Record<string, string>>({});
  const [isReturning, setIsReturning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [lightboxData, setLightboxData] = useState<{
    url: string;
    title: string;
    vendor?: string;
    amount?: number;
    fileName?: string;
    fileType?: string;
  } | null>(null);

  // Reset viewer parameters when changing selected expense item
  useEffect(() => {
    setActiveFileIndex(0);
    setZoomLevel(100);
    setRotationDeg(0);
  }, [selectedItemIndex]);

  if (!isOpen || !liquidation) return null;

  const lineItems: ExpenseLineItem[] = liquidation.lineItems || [];
  const selectedItem: ExpenseLineItem | undefined = lineItems[selectedItemIndex] || lineItems[0];
  const selectedItemAttachments = normalizeItemAttachments(selectedItem);
  const activeReceiptFile = selectedItemAttachments[activeFileIndex] || selectedItemAttachments[0] || null;

  const returnSteps = useMemo(() => {
    return buildLiquidationReturnSteps(lineItems);
  }, [lineItems]);

  // Compute previous snapshot and line item diffs if liquidation was revised
  const latestSnapshot = useMemo(() => {
    const history = liquidation?.revisionHistory || [];
    if (history.length > 0) {
      const last = history[history.length - 1];
      return (last as any)?.dataSnapshot || (last as any)?.previousSnapshot || null;
    }
    return null;
  }, [liquidation]);

  const liquidationDiffs = useMemo(() => {
    if (!liquidation || !latestSnapshot) return [];
    return diffFinancialLiquidation(latestSnapshot, liquidation);
  }, [liquidation, latestSnapshot]);

  const diffByPath = useMemo(() => {
    const map = new Map<string, any>();
    for (const d of liquidationDiffs) {
      map.set(d.path, d);
    }
    return map;
  }, [liquidationDiffs]);

  const hasRevisions = Boolean(
    (liquidation?.revisionCount && liquidation.revisionCount > 1) ||
    (liquidation?.revisionHistory && liquidation.revisionHistory.length > 0) ||
    liquidation?.status === 'returned'
  );

  const userUid = signatorySession?.id || signatorySession?.uid;
  const userEmail = (signatorySession?.email || '').toLowerCase();
  const userRole = signatorySession?.role || '';
  const currentStage = liquidation.currentStageIndex ?? 1;

  const matchesCurrentSigner = (s: any) => {
    if (!s) return false;
    if (userUid && (s.signatoryUid === userUid || s.signatoryUid === signatorySession?.uid || s.signatoryUid === signatorySession?.id)) return true;
    if (userEmail && s.signatoryEmail?.toLowerCase() === userEmail) return true;
    if (userRole && s.role && s.role.toLowerCase() === userRole.toLowerCase()) return true;
    if (s.roleTitle && signatorySession?.roleTitle) {
      const sT = s.roleTitle.toLowerCase();
      const uT = signatorySession.roleTitle.toLowerCase();
      if (sT === uT || sT.includes(uT) || uT.includes(sT)) return true;
    }
    return false;
  };

  const isUnderReview = liquidation.status === 'under_review' || liquidation.status === 'pending';
  const stageSteps = (liquidation.approvalChain || []).filter((s) => (s.stageIndex ?? 1) === currentStage);
  const myStepInCurrentStage = stageSteps.find((s) => matchesCurrentSigner(s));

  const isMyTurnNow = Boolean(
    isUnderReview &&
    myStepInCurrentStage &&
    myStepInCurrentStage.status !== 'endorsed' &&
    myStepInCurrentStage.status !== 'approved' &&
    myStepInCurrentStage.status !== 'waived'
  );

  const myFutureStep = (liquidation.approvalChain || []).find((s) => {
    const isFuture = (s.stageIndex ?? 1) > currentStage;
    return isFuture && matchesCurrentSigner(s);
  });

  const isPipelinePreview = isUnderReview && !isMyTurnNow && Boolean(myFutureStep);

  const currentStep =
    myStepInCurrentStage ||
    liquidation.approvalChain?.find((s) => matchesCurrentSigner(s)) ||
    liquidation.approvalChain?.[liquidation.currentStepIndex ?? 0];

  const activeSignatureUrl = useMemo(() => {
    if (signatorySession?.signatureUrl) return signatorySession.signatureUrl;
    if (signatorySession?.signatureDataUrl) return signatorySession.signatureDataUrl;
    try {
      const raw =
        localStorage.getItem('sti_sync_signatory_session') ||
        localStorage.getItem('sti_sync_officer_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.signatureUrl || parsed.signatureDataUrl || null;
      }
    } catch {}
    return null;
  }, [signatorySession?.signatureUrl, signatorySession?.signatureDataUrl]);

  const hasSignature = Boolean(activeSignatureUrl);
  const chain = liquidation.approvalChain || [];
  const myStepIndex = chain.findIndex((s) => matchesCurrentSigner(s));
  const myStep = myStepIndex >= 0 ? chain[myStepIndex] : currentStep;

  // Strict dynamic approver check based on step actionType
  const isApprover = myStep?.actionType === 'approve' || signatorySession?.actionType === 'approve';
  const isChecker = myStep?.actionType === 'check' || signatorySession?.actionType === 'check';

  // Count remaining approvers in the pipeline AFTER my step
  const subsequentApproversCount = chain.filter((s, idx) => {
    return idx > myStepIndex && s.actionType === 'approve';
  }).length;

  const hasSubsequentApprover = isApprover && subsequentApproversCount > 0;
  const isFinalApprover = isApprover && subsequentApproversCount === 0;

  const allocatedBudget = liquidation.allocatedBudget || 0;
  const totalActualSpending =
    liquidation.totalActualSpending || lineItems.reduce((acc, i) => acc + (i.totalCost || 0), 0);
  const surplusOrDeficit =
    liquidation.surplusOrDeficit ?? (allocatedBudget - totalActualSpending);
  const isDeficit = surplusOrDeficit < 0;

  const handleEndorse = async (overrideActionType?: 'endorse' | 'approve' | 'check') => {
    if (!hasSignature) {
      toast.error('Please register your electronic signature before endorsing this liquidation.');
      onOpenSignaturePad();
      return;
    }

    const action = overrideActionType || (isFinalApprover ? 'approve' : (isChecker ? 'check' : 'endorse'));

    setIsSubmitting(true);
    try {
      const result = await endorseLiquidationStep(
        liquidation.id,
        {
          uid: signatorySession?.id || signatorySession?.uid || '',
          id: signatorySession?.id || signatorySession?.uid || '',
          name: signatorySession?.name || '',
          email: signatorySession?.email || '',
          roleTitle: signatorySession?.roleTitle || '',
          role: signatorySession?.role || '',
          actionType: action,
          signatureUrl: activeSignatureUrl || undefined,
        },
        remarks
      );

      if (result.isFullyApproved) {
        toast.success(`Liquidation fully approved! Financial ledger and event status updated.`);
      } else if (result.stageAdvanced) {
        toast.success(`Stage ${currentStage} completed! Liquidation forwarded to the next approval stage.`);
      } else {
        toast.success(`Digital signature endorsement recorded successfully.`);
      }

      if (onLiquidationUpdated) onLiquidationUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to endorse liquidation:', err);
      toast.error(err?.message || 'Failed to endorse liquidation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnSubmit = async (payload: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRevisionRemarks: Record<string, string>;
    returnDeadline: string;
  }) => {
    setIsSubmitting(true);
    try {
      await returnLiquidationStep(
        liquidation.id,
        {
          uid: signatorySession.id || signatorySession.uid,
          name: signatorySession.name,
          email: signatorySession.email,
          roleTitle: signatorySession.roleTitle,
        },
        payload.overallRemarks,
        payload.stepRevisionRemarks,
        payload.flaggedSteps,
        payload.returnDeadline
      );

      toast.success(`Liquidation returned for revision with section-by-section instructions.`);
      if (onLiquidationUpdated) onLiquidationUpdated();
      setIsReturning(false);
      onClose();
    } catch (err: any) {
      console.error('Failed to return liquidation:', err);
      toast.error(err?.message || 'Failed to return liquidation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(250, Math.max(50, prev + delta)));
  };

  const handleRotate = () => {
    setRotationDeg((prev) => (prev + 90) % 360);
  };

  const flagMissingReceiptInRemarks = (itemIndex: number, desc: string) => {
    const item = lineItems[itemIndex];
    const itemKey = item ? `item_${item.id || itemIndex}` : `item_${itemIndex}`;
    const addition = `Line item #${itemIndex + 1} ("${desc}"): Official receipt or proof document is missing or invalid. Please attach verified BIR receipt or invoice.`;
    setReturnRemarks((prev) => (prev ? `${prev}\n\n${addition}` : addition));
    setInitialReturnFlags((prev) => Array.from(new Set([...prev, itemKey])));
    setInitialStepRemarks((prev) => ({
      ...prev,
      [itemKey]: prev[itemKey] || `Official receipt or proof document is missing or invalid for "${desc}". Please attach verified BIR receipt or invoice.`,
    }));
    setIsReturning(true);
  };

  const flagItemForRevision = (itemIndex: number, desc: string) => {
    const item = lineItems[itemIndex];
    const itemKey = item ? `item_${item.id || itemIndex}` : `item_${itemIndex}`;
    const addition = `Line item #${itemIndex + 1} ("${desc}"): Please review and revise this line item.`;
    setReturnRemarks((prev) => (prev ? `${prev}\n\n${addition}` : addition));
    setInitialReturnFlags((prev) => Array.from(new Set([...prev, itemKey])));
    setInitialStepRemarks((prev) => ({
      ...prev,
      [itemKey]: prev[itemKey] || `Please revise line item #${itemIndex + 1} ("${desc}"): `,
    }));
    setIsReturning(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-hidden">
      <div className="relative w-full max-w-[1440px] h-[95vh] bg-white rounded-3xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
        {/* ── TOP HEADER BAR ── */}
        <div className="bg-[#001A4D] text-white px-6 py-3.5 flex items-center justify-between flex-shrink-0 border-b border-blue-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0E4EBD] text-white flex items-center justify-center shadow-md shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white leading-tight">
                  {isFinalApprover
                    ? 'Executive Presidential Approval Studio'
                    : isChecker
                    ? 'Financial Audit & Receipt Verification Studio'
                    : 'Institutional Endorsement Studio'}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-400/20 text-blue-200 border border-blue-400/30">
                  Financial Liquidation
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Stage {currentStage}
                </span>
                {liquidation.revisionCount && liquidation.revisionCount > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/40">
                    Revision v{liquidation.revisionCount}.0
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {liquidation.eventTitle} • Organization: <strong>{liquidation.organizationName}</strong> • Submitted By:{' '}
                <strong>{liquidation.submittedByName || liquidation.createdByName}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasRevisions && (
              <button
                type="button"
                onClick={() => setShowDiffModal(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Compare what was revised in this financial liquidation"
              >
                <GitCompare className="w-3.5 h-3.5 text-[#FFD41C]" />
                <span>Compare Changes</span>
                {liquidationDiffs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-900 text-amber-300 text-[10px] font-black">
                    {liquidationDiffs.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── SPLIT VIEW BODY (55% LEFT / 45% RIGHT) ── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0 bg-slate-100">
          {/* ═════════════════════════════════════════════════════════════ */}
          {/* LEFT PANE: LINE ITEMS & FINANCIAL AUDIT (COL-SPAN-7) */}
          {/* ═════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-y-auto p-5 sm:p-6 space-y-5 border-r border-slate-200 bg-white">
            {/* Revision Banner if liquidation has past revision history */}
            {hasRevisions && (
              <RevisionFeedbackBanner
                returnedBy={{
                  name: (liquidation as any).returnedByName || (liquidation.revisionHistory?.[0] as any)?.returnedByName || 'Institutional Signatory',
                  roleTitle: (liquidation as any).returnedByRoleTitle || (liquidation.revisionHistory?.[0] as any)?.returnedByRoleTitle || 'Signatory Reviewer',
                  email: (liquidation as any).returnedByEmail || (liquidation.revisionHistory?.[0] as any)?.returnedByEmail,
                }}
                returnedAt={liquidation.returnedAt || (liquidation.revisionHistory?.[0] as any)?.returnedAt}
                returnRemarks={liquidation.returnRemarks || (liquidation.revisionHistory?.[0] as any)?.returnRemarks}
                revisionHistory={liquidation.revisionHistory}
                versionLabel={liquidation.revisionCount ? `v${liquidation.revisionCount}.0` : undefined}
                documentTitle={liquidation.eventTitle}
                documentType="FL"
                currentDocument={liquidation}
                previousSnapshot={latestSnapshot}
              />
            )}
            {/* KPI Cards: Budget Ceiling vs Actual Spending vs Variance */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Budget Allocation Ceiling
                </span>
                <span className="text-lg font-black text-[#001A4D] mt-0.5 block">
                  {formatCurrency(allocatedBudget)}
                </span>
                <span className="text-[10px] text-slate-400">Approved Activity Budget</span>
              </div>

              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                  Total Actual Spending
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-lg font-black text-blue-950 mt-0.5 block">
                    {formatCurrency(totalActualSpending)}
                  </span>
                  {diffByPath.get('totalActualSpending') && (
                    <InlineRevisionBadge diff={diffByPath.get('totalActualSpending')} />
                  )}
                </div>
                <span className="text-[10px] text-blue-600 font-medium">
                  {lineItems.length} Itemized Expense Line{lineItems.length === 1 ? '' : 's'}
                </span>
              </div>

              <div
                className={`p-3.5 rounded-2xl border ${
                  isDeficit ? 'bg-rose-50/80 border-rose-300' : 'bg-emerald-50/80 border-emerald-300'
                }`}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider block ${
                    isDeficit ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {isDeficit ? 'Net Deficit (Over Budget)' : 'Net Surplus (To Return)'}
                </span>
                <span
                  className={`text-lg font-black mt-0.5 block ${
                    isDeficit ? 'text-rose-900' : 'text-emerald-900'
                  }`}
                >
                  {formatVariance(surplusOrDeficit)}
                </span>
                <span className={`text-[10px] font-medium ${isDeficit ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {isDeficit ? 'Requires ledger deficit absorption' : 'Refundable to student organization'}
                </span>
              </div>
            </div>

            {/* Instruction Notice for Signatories */}
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#0E4EBD] shrink-0" />
                <span>
                  <strong>Synchronized Verification Mode:</strong> Click any line item below to instantly inspect its uploaded receipt evidence in the right pane.
                </span>
              </div>
              <span className="text-[11px] font-mono font-bold text-[#0E4EBD] bg-white px-2 py-0.5 rounded border border-blue-200 shrink-0">
                Item {selectedItemIndex + 1} of {lineItems.length}
              </span>
            </div>

            {/* Interactive Line Items List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                <span>Expense Line Items ({lineItems.length})</span>
                <span className="text-slate-400 font-normal">Click a card to verify receipt</span>
              </div>

              <div className="space-y-2">
                {lineItems.map((item, idx) => {
                  const isSelected = idx === selectedItemIndex;
                  const itemFiles = normalizeItemAttachments(item);
                  const hasReceipt = itemFiles.length > 0;
                  const itemVariance = (item.allocatedCost || 0) > 0 ? (item.allocatedCost || 0) - (item.totalCost || 0) : null;

                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => setSelectedItemIndex(idx)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/80 border-[#0E4EBD] shadow-sm ring-2 ring-[#0E4EBD]/20'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-lg text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                              isSelected
                                ? 'bg-[#001A4D] text-[#FFD41C]'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {idx + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {item.description}
                              </h4>
                              <span className="text-[10px] font-semibold px-2 py-0.2 bg-slate-100 text-slate-700 rounded border border-slate-200">
                                {item.category}
                              </span>
                              {diffByPath.get(`lineItems.${idx}.totalCost`) && (
                                <InlineRevisionBadge diff={diffByPath.get(`lineItems.${idx}.totalCost`)} />
                              )}
                              {diffByPath.get(`lineItems.${idx}.receiptNumber`) && (
                                <InlineRevisionBadge diff={diffByPath.get(`lineItems.${idx}.receiptNumber`)} />
                              )}
                              {diffByPath.get(`lineItems.${idx}.receiptUrls`) && (
                                <InlineRevisionBadge diff={diffByPath.get(`lineItems.${idx}.receiptUrls`)} />
                              )}
                              {!diffByPath.get(`lineItems.${idx}.totalCost`) && item.wasModifiedInRev && (
                                <span className="text-[10px] font-bold px-2 py-0.2 bg-amber-100 text-amber-900 rounded border border-amber-300">
                                  ✏️ Revised
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                              <span>
                                <strong>{item.quantity}</strong> × {formatCurrency(item.unitCost)}
                              </span>
                              <span>•</span>
                              <span>Vendor: <strong>{item.vendorName || 'Not recorded'}</strong></span>
                              {item.receiptNumber && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono">OR #: <strong>{item.receiptNumber}</strong></span>
                                </>
                              )}
                            </div>

                            {item.allocatedCost !== undefined && item.allocatedCost > 0 && (
                              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                                <span>Baseline: {formatCurrency(item.allocatedCost)}</span>
                                {itemVariance !== null && (
                                  <span
                                    className={`font-semibold px-1.5 py-0.2 rounded text-[10px] ${
                                      itemVariance < 0
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {itemVariance < 0
                                      ? `Deficit -${formatCurrency(Math.abs(itemVariance))}`
                                      : `Surplus +${formatCurrency(itemVariance)}`}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                          <span className="text-sm font-black text-[#001A4D]">
                            {formatCurrency(item.totalCost)}
                          </span>

                          {hasReceipt ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {itemFiles.length} Receipt{itemFiles.length === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItemIndex(idx);
                                flagMissingReceiptInRemarks(idx, item.description);
                              }}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                              title="Flag missing receipt in return remarks"
                            >
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              No Receipt (Flag)
                            </button>
                          )}

                          {isMyTurnNow && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItemIndex(idx);
                                flagItemForRevision(idx, item.description);
                              }}
                              className="text-[10px] font-bold text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1 cursor-pointer mt-0.5"
                              title="Flag this specific line item for revision"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Flag Item</span>
                            </button>
                          )}

                          {isSelected && (
                            <span className="text-[10px] font-bold text-[#0E4EBD] flex items-center gap-0.5 mt-0.5">
                              <span>Active</span>
                              <ChevronRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Historical Remarks Log */}
            {liquidation.remarksHistory && liquidation.remarksHistory.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Audit Trail &amp; Revision Log</span>
                </h4>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {liquidation.remarksHistory.map((rem, rIdx) => (
                    <div
                      key={rem.id || rIdx}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>
                          {rem.authorName} ({rem.authorRole})
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatAppDateTime(rem.timestamp)}
                        </span>
                      </div>
                      <p className="text-slate-800 font-normal">{rem.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline Notice Card */}
            {isPipelinePreview && myFutureStep && (
              <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-2xl flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h5 className="text-xs font-bold text-purple-950">Pipeline Preview Mode</h5>
                  <p className="text-[11px] text-purple-800 leading-relaxed">
                    This liquidation is undergoing Stage {currentStage} audit review. You are scheduled to sign in <strong>Stage {myFutureStep.stageIndex}: {myFutureStep.stageName || myFutureStep.roleTitle}</strong>. You may inspect all expenses, receipts, and line items in advance.
                  </p>
                </div>
              </div>
            )}

            {/* Visual Signatory Progress Tracker */}
            <div className="space-y-2 pt-3 border-t border-slate-200">
              <h4 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>Multi-Stage Endorsement Route</span>
              </h4>
              <LiquidationSignatoryTracker
                approvalChain={liquidation.approvalChain}
                currentStageIndex={liquidation.currentStageIndex ?? 1}
                liquidationStatus={liquidation.status}
              />
            </div>

            {/* E-Signature Verification & Signing Card (Only active when it is this user's turn) */}
            {isMyTurnNow ? (
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  <span>Signatory Electronic Signature Verification</span>
                </h4>

                {hasSignature ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="border border-slate-300 bg-white p-1.5 rounded-xl shadow-xs shrink-0">
                        <img
                          src={activeSignatureUrl!}
                          alt="Registered Signature"
                          className="h-9 w-24 object-contain"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Verified Digital Ink Signature Ready</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Stamping as <strong>{signatorySession?.name}</strong> ({signatorySession?.roleTitle})
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onOpenSignaturePad}
                      className="text-xs text-blue-700 hover:text-blue-800 font-semibold underline cursor-pointer"
                    >
                      Re-draw
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                      <div>
                        <h5 className="text-xs font-bold text-amber-950">No Electronic Signature on File</h5>
                        <p className="text-[11px] text-amber-800">
                          Register your official digital signature to endorse this liquidation.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenSignaturePad}
                      className="px-3 py-1.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                    >
                      Register Signature
                    </button>
                  </div>
                )}

                {/* Endorsement Remarks Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isFinalApprover
                      ? 'Executive Approval Directive / Directives (Optional)'
                      : isChecker
                      ? 'Audit Verification Notes (Optional)'
                      : 'Endorsement Notes (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder={
                      isFinalApprover
                        ? 'e.g. Approved. Proceed with official ledger entry and fund refund...'
                        : isChecker
                        ? 'e.g. Verified official receipts against line items and amounts...'
                        : 'e.g. Reviewed and endorsed by department head...'
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

              </div>
            ) : null}
          </div>

          {/* ═════════════════════════════════════════════════════════════ */}
          {/* RIGHT PANE: SYNCHRONIZED RECEIPT INSPECTION STUDIO (COL-5) */}
          {/* ═════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 flex flex-col h-full bg-slate-900 text-white overflow-hidden border-t lg:border-t-0 border-slate-700">
            {/* Live Matching Header Bar */}
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Receipt Matching Studio
                </span>
                <span className="text-[11px] font-mono font-bold text-[#FFD41C]">
                  {formatCurrency(selectedItem?.totalCost || 0)}
                </span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-[#0E4EBD] text-white font-mono text-[10px] flex items-center justify-center shrink-0">
                    #{selectedItemIndex + 1}
                  </span>
                  <span className="truncate">{selectedItem?.description || 'No item selected'}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between gap-2">
                  <span>Vendor: <strong className="text-slate-200">{selectedItem?.vendorName || 'Not specified'}</strong></span>
                  <span className="font-mono">Ref OR: <strong className="text-slate-200">{selectedItem?.receiptNumber || 'None'}</strong></span>
                </div>
              </div>

              {/* Multiple Attachments Switcher Tabs */}
              {selectedItemAttachments.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
                  {selectedItemAttachments.map((att, attIdx) => (
                    <button
                      key={att.id || attIdx}
                      type="button"
                      onClick={() => setActiveFileIndex(attIdx)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                        activeFileIndex === attIdx
                          ? 'bg-[#0E4EBD] text-white shadow-xs'
                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      Receipt {attIdx + 1} {att.fileType === 'pdf' ? '(PDF)' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Viewer Controls Toolbar */}
            <div className="bg-slate-900/90 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 flex-shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleZoom(-25)}
                  disabled={!activeReceiptFile}
                  className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 rounded font-semibold text-slate-300">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={() => handleZoom(25)}
                  disabled={!activeReceiptFile}
                  className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer disabled:opacity-30"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoomLevel(100);
                    setRotationDeg(0);
                  }}
                  disabled={!activeReceiptFile}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-30"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  disabled={!activeReceiptFile}
                  className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-30"
                  title="Rotate 90 Degrees"
                >
                  <RotateCw className="w-4 h-4" />
                  <span className="text-[10px] font-mono">{rotationDeg}°</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                {activeReceiptFile && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxData({
                          url: activeReceiptFile.url,
                          title: selectedItem?.description || 'Receipt Inspection',
                          vendor: selectedItem?.vendorName,
                          amount: selectedItem?.totalCost,
                          fileName: activeReceiptFile.name,
                          fileType: activeReceiptFile.fileType,
                        })
                      }
                      className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                      title="Open Fullscreen Lightbox"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <a
                      href={activeReceiptFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                      title="Open Original Document in New Tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Zero-Click Viewer Canvas */}
            <div className="flex-1 overflow-auto bg-slate-950 p-4 flex items-center justify-center relative select-none">
              {activeReceiptFile ? (
                activeReceiptFile.fileType === 'pdf' || activeReceiptFile.url.toLowerCase().endsWith('.pdf') ? (
                  <div className="w-full h-full min-h-[450px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex flex-col">
                    <div className="px-3 py-1.5 bg-slate-800 text-[11px] text-slate-300 font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        PDF Document Preview
                      </span>
                      <a
                        href={activeReceiptFile.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline flex items-center gap-1 text-[10px]"
                      >
                        Open In New Tab <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <iframe
                      src={activeReceiptFile.url}
                      title="PDF Document"
                      className="w-full h-full flex-1 border-0 bg-white"
                    />
                  </div>
                ) : (
                  <div
                    className="transition-transform duration-200 ease-out flex items-center justify-center"
                    style={{
                      transform: `scale(${zoomLevel / 100}) rotate(${rotationDeg}deg)`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <img
                      src={activeReceiptFile.url}
                      alt={`Receipt proof for ${selectedItem?.description}`}
                      className="max-w-full max-h-[70vh] rounded-xl object-contain shadow-2xl border border-slate-800"
                    />
                  </div>
                )
              ) : (
                <div className="text-center p-8 max-w-sm space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">No Receipt Attached</h5>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      The submitter entered <strong>{formatCurrency(selectedItem?.totalCost || 0)}</strong> for "
                      {selectedItem?.description}" without attaching official receipts or invoice documents.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => flagMissingReceiptInRemarks(selectedItemIndex, selectedItem?.description || '')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Flag in Return Remarks
                  </button>
                </div>
              )}
            </div>

            {/* Viewer Footer Status Bar */}
            <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between flex-shrink-0">
              <span className="truncate">
                {activeReceiptFile?.name || 'No attachment selected'}
              </span>
              <span className="text-slate-500 font-mono shrink-0">
                {selectedItemAttachments.length > 0
                  ? `File ${activeFileIndex + 1} of ${selectedItemAttachments.length}`
                  : '0 Files'}
              </span>
            </div>
          </div>
        </div>

        {/* ── STICKY FOOTER ACTIONS ── */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          {!isMyTurnNow ? (
            <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
              <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                {isPipelinePreview ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    Pipeline Preview: Awaiting Stage {currentStage} review before your turn.
                  </span>
                ) : liquidation.status === 'approved' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Liquidation is fully approved and completed.
                  </span>
                ) : liquidation.status === 'returned' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    Liquidation is returned for revision.
                  </span>
                ) : (
                  <span>Read-only inspection mode.</span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-[#001A4D] hover:bg-[#0A2E6D] rounded-xl transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {!isReturning && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsReturning(true);
                    }}
                    disabled={isSubmitting}
                    className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-amber-100/60 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Return for Revision</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>

                {hasSubsequentApprover ? (
                  <button
                    type="button"
                    onClick={() => handleEndorse('endorse')}
                    disabled={isSubmitting || !hasSignature}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-[#0E4EBD] hover:bg-blue-700 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-4 h-4 text-[#FFD41C]" />
                    <span>{isSubmitting ? 'Processing...' : 'Endorse & Forward to Higher-Ups'}</span>
                  </button>
                ) : isFinalApprover ? (
                  <button
                    type="button"
                    onClick={() => handleEndorse('approve')}
                    disabled={isSubmitting || !hasSignature}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/40 shadow-blue-900/25 ring-2 ring-[#FFD41C]/30 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                    <span>{isSubmitting ? 'Processing...' : 'Authorize & Approve Financial Liquidation'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleEndorse(isChecker ? 'check' : 'endorse')}
                    disabled={isSubmitting || !hasSignature}
                    className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
                      isChecker
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {isSubmitting
                        ? 'Processing...'
                        : isChecker
                        ? 'Audit & Endorse Liquidation'
                        : 'Stamp E-Signature & Endorse Liquidation'}
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox / Document Viewer */}
      {lightboxData && (
        <ReceiptLightboxModal
          isOpen={!!lightboxData}
          onClose={() => setLightboxData(null)}
          imageUrl={lightboxData.url}
          itemTitle={lightboxData.title}
          vendorName={lightboxData.vendor}
          amount={lightboxData.amount}
          fileName={lightboxData.fileName}
          fileType={lightboxData.fileType}
        />
      )}

      {/* Visual Diff Comparison Modal */}
      <RevisionDiffViewerModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        documentTitle={liquidation.eventTitle || 'Financial Liquidation'}
        documentType="FL"
        currentDocument={liquidation}
        previousSnapshot={latestSnapshot}
        customDiffs={liquidationDiffs}
        revisionNumber={liquidation.revisionCount || ((liquidation.revisionHistory?.length || 0) + 1)}
      />

      {/* Step-by-Step Return Revision Modal */}
      <StepReturnRevisionModal
        isOpen={isReturning}
        onClose={() => setIsReturning(false)}
        documentTitle={liquidation.eventTitle || 'Financial Liquidation'}
        referenceNo={liquidation.referenceNo}
        documentType="FL"
        steps={returnSteps}
        onSubmit={handleReturnSubmit}
        isSubmitting={isSubmitting}
        initialOverallRemarks={returnRemarks}
        initialFlags={initialReturnFlags}
        initialStepRemarks={initialStepRemarks}
      />
    </div>
  );
}
