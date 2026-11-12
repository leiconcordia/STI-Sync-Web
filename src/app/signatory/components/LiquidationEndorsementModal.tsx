/**
 * src/app/signatory/components/LiquidationEndorsementModal.tsx
 *
 * Synchronized Dual-Pane Verification Studio for Financial Liquidations (Form LF-01).
 * Features zero-click instant receipt rendering, live expense-to-receipt matching bar,
 * zoom/rotation controls, multi-attachment switching, and smart revision change highlighting.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { canSignatoryApproveDocument } from '../../modules/signatories/utils/signatory-label.utils';
import {
  X,
  Receipt,
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
  FileText, FileCheck,
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
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { toast } from 'sonner';
import RevisionDiffViewerModal from '../../modules/workflow/components/RevisionDiffViewerModal';
import InlineRevisionBadge from '../../modules/workflow/components/InlineRevisionBadge';
import RevisionFeedbackBanner from '../../modules/workflow/components/RevisionFeedbackBanner';
import StepReturnRevisionModal from '../../modules/workflow/components/StepReturnRevisionModal';
import { diffFinancialLiquidation } from '../../modules/workflow/utils/document-diff-engine';
import { formatStageTitle } from '../../modules/workflow/utils/stage-normalization.utils';
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
import { LiquidationExportPreviewModal } from '../../modules/finance/components/LiquidationExportPreviewModal';
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
  const [viewingDisbursementVoucher, setViewingDisbursementVoucher] = useState(false);
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [pendingConfirmType, setPendingConfirmType] = useState<'approve' | 'endorse' | null>(null);
  const [linkedEvent, setLinkedEvent] = useState<any>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');

  useEffect(() => {
    if (!liquidation?.eventId) return;
    let isMounted = true;
    (async () => {
      try {
        const evSnap = await getDoc(doc(db, 'events', liquidation.eventId));
        if (evSnap.exists() && isMounted) {
          setLinkedEvent(evSnap.data());
          return;
        }
        const actSnap = await getDoc(doc(db, 'activities', liquidation.eventId));
        if (actSnap.exists() && isMounted) {
          setLinkedEvent(actSnap.data());
        }
      } catch (err) {
        console.warn('[LiquidationEndorsementModal] Event lookup:', err);
      }
    })();
    return () => { isMounted = false; };
  }, [liquidation?.eventId]);

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
  const proposedBaselineItems = useMemo(() => {
    if (linkedEvent) {
      if (Array.isArray(linkedEvent.budgetItems) && linkedEvent.budgetItems.length > 0) {
        return linkedEvent.budgetItems.map((bi: any, idx: number) => {
          const allocated = Number(
            bi.approvedAmount || bi.totalCost || (Number(bi.quantity || 1) * Number(bi.unitCost || 0)) || 0
          );
          return {
            id: bi.id || `prop_bi_${idx}`,
            title: bi.item || bi.description || `Budget Item ${idx + 1}`,
            baselineAmount: allocated,
          };
        });
      }

      if (
        Array.isArray(linkedEvent.financialProjections?.expenses) &&
        linkedEvent.financialProjections.expenses.length > 0
      ) {
        return linkedEvent.financialProjections.expenses.map((exp: any, idx: number) => ({
          id: exp.id || `prop_exp_${idx}`,
          title: exp.description || exp.item || `Proposed Item ${idx + 1}`,
          baselineAmount: Number(exp.totalAmount || exp.thisYearProposed || 0),
        }));
      }

      if (
        Array.isArray(linkedEvent.budgetCustodians) &&
        linkedEvent.budgetCustodians.length > 0
      ) {
        return linkedEvent.budgetCustodians.map((c: any, idx: number) => ({
          id: c.id || `prop_cust_${idx}`,
          title: c.purpose || c.item || `Allocation ${idx + 1}`,
          baselineAmount: Number(c.allocatedAmount || 0),
        }));
      }
    }

    // Fallback: extract distinct categories from lineItems
    const map = new Map<string, { id: string; title: string; baselineAmount: number }>();
    (liquidation.lineItems || []).forEach((it, idx) => {
      const title = (it.proposedItemTitle || it.category || 'General Expenses').trim();
      if (!map.has(title)) {
        map.set(title, {
          id: it.proposedItemId || `cat_${idx}`,
          title,
          baselineAmount: Number(it.proposedBaselineAmount || it.allocatedCost || 0),
        });
      }
    });

    return Array.from(map.values());
  }, [linkedEvent, liquidation.lineItems]);

  const categoriesList = useMemo(() => {
    if (proposedBaselineItems.length > 0) {
      const hasOther = (liquidation.lineItems || []).some(
        (it) =>
          it.proposedItemId === 'cat_other' ||
          it.category === 'Other / General Expenses' ||
          (!it.proposedItemId && !proposedBaselineItems.some((p) => p.title === it.category))
      );

      const list = [...proposedBaselineItems];
      if (hasOther || !list.some((c) => c.id === 'cat_other')) {
        list.push({
          id: 'cat_other',
          title: 'Other / General Expenses',
          baselineAmount: 0,
        });
      }
      return list;
    }

    const catSet = new Set<string>();
    (liquidation.lineItems || []).forEach((it) => {
      if (it.category) catSet.add(it.category.trim());
      if (it.proposedItemTitle) catSet.add(it.proposedItemTitle.trim());
    });
    if (catSet.size === 0) catSet.add('General Expenses');

    return Array.from(catSet).map((cat, idx) => ({
      id: `cat_${idx}`,
      title: cat,
      baselineAmount: 0,
    }));
  }, [proposedBaselineItems, liquidation.lineItems]);

  const categorySpendingMap = useMemo(() => {
    const map = new Map<string, { baseline: number; spent: number; receiptCount: number; itemCount: number }>();

    categoriesList.forEach((c) => {
      map.set(c.title, { baseline: c.baselineAmount, spent: 0, receiptCount: 0, itemCount: 0 });
    });

    (liquidation.lineItems || []).forEach((item) => {
      const cat = (item.proposedItemTitle || item.category || 'Other / General Expenses').trim();
      const cost = Number(item.totalCost || 0);
      const attachments = normalizeItemAttachments(item);
      const hasReceipt = attachments.length > 0;

      if (!map.has(cat)) {
        map.set(cat, {
          baseline: Number(item.proposedBaselineAmount || item.allocatedCost || 0),
          spent: 0,
          receiptCount: 0,
          itemCount: 0,
        });
      }

      const entry = map.get(cat)!;
      entry.spent += cost;
      entry.itemCount += 1;
      if (hasReceipt) entry.receiptCount += attachments.length;
    });

    return map;
  }, [categoriesList, liquidation.lineItems]);

  const currentCategory = useMemo(() => {
    if (activeCategoryId === 'all') return null;
    return categoriesList.find((c) => c.id === activeCategoryId) || null;
  }, [activeCategoryId, categoriesList]);

  const displayedLineItems = useMemo(() => {
    const rawItems = liquidation.lineItems || [];
    if (activeCategoryId === 'all' || !currentCategory) {
      return rawItems;
    }
    return rawItems.filter((item) => {
      if (currentCategory.id === 'cat_other') {
        return (
          item.proposedItemId === 'cat_other' ||
          item.category === 'Other / General Expenses' ||
          (!item.proposedItemId && !proposedBaselineItems.some((p) => p.title === item.category))
        );
      }
      return (
        item.proposedItemId === currentCategory.id ||
        item.category === currentCategory.title ||
        item.proposedItemTitle === currentCategory.title
      );
    });
  }, [liquidation.lineItems, activeCategoryId, currentCategory, proposedBaselineItems]);

  const handleSelectCategoryTab = (catId: string) => {
    setActiveCategoryId(catId);
    const rawItems = liquidation.lineItems || [];
    let targetItems = rawItems;
    if (catId !== 'all') {
      const targetCat = categoriesList.find((c) => c.id === catId);
      if (targetCat) {
        targetItems = rawItems.filter((item) => {
          if (targetCat.id === 'cat_other') {
            return (
              item.proposedItemId === 'cat_other' ||
              item.category === 'Other / General Expenses' ||
              (!item.proposedItemId && !proposedBaselineItems.some((p) => p.title === item.category))
            );
          }
          return (
            item.proposedItemId === targetCat.id ||
            item.category === targetCat.title ||
            item.proposedItemTitle === targetCat.title
          );
        });
      }
    }
    if (targetItems.length > 0) {
      const firstTargetItem = targetItems[0];
      const realIdx = rawItems.findIndex((it) => (it.id && it.id === firstTargetItem.id) || it === firstTargetItem);
      if (realIdx !== -1) {
        setSelectedItemIndex(realIdx);
      }
    }
  };

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
  const activeVoucher = (liquidation as any)?.disbursementVoucher || (liquidation as any)?.voucher || null;
  const myStepIndex = chain.findIndex((s) => matchesCurrentSigner(s));
  const myStep = myStepIndex >= 0 ? chain[myStepIndex] : currentStep;

  // Dynamic approval authority permission check
  const isChecker = myStep?.actionType === 'check' || signatorySession?.actionType === 'check';
  const canApprove = canSignatoryApproveDocument(signatorySession, 'liquidation', myStep);

  // Subsequent approvers after my step in the pipeline
  const subsequentApproversCount = chain.filter((s, idx) => {
    return idx > myStepIndex && (s.actionType === 'approve' || (s as any).canApproveLiquidation || (s as any).isFinalApprover);
  }).length;

  const hasSubsequentApprover = canApprove && subsequentApproversCount > 0;
  const isFinalApprover = Boolean(signatorySession?.isFinalApprover) || (canApprove && (subsequentApproversCount === 0 || myStepIndex < 0));

  const allocatedBudget = liquidation.allocatedBudget || 0;
  const totalActualSpending =
    liquidation.totalActualSpending || lineItems.reduce((acc, i) => acc + (i.totalCost || 0), 0);
  const surplusOrDeficit =
    liquidation.surplusOrDeficit ?? (allocatedBudget - totalActualSpending);
  const isDeficit = surplusOrDeficit < 0;

  const handleEndorse = async (decision: 'approve' | 'forward' = 'forward') => {
    if (!hasSignature) {
      toast.error('Please register your electronic signature before endorsing this liquidation.');
      onOpenSignaturePad();
      return;
    }

    const action = decision === 'approve' ? 'approve' : (isChecker ? 'check' : 'endorse');

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
          canApproveLiquidation: signatorySession?.canApproveLiquidation,
          approvalDecision: decision,
        },
        remarks,
        decision
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
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Export official STI liquidation form (LIQUIDATION-FORMAT_v1)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>Export LF-01</span>
            </button>

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

            {/* Official Disbursement Voucher Card */}
            {activeVoucher ? (
              <div className="p-4 bg-gradient-to-r from-emerald-50 via-white to-blue-50 border-2 border-emerald-500/40 rounded-2xl shadow-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-emerald-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold shrink-0">
                      <FileCheck className="w-4 h-4 text-emerald-700" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        Official Disbursement Voucher
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Verified Release
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Uploaded by <strong>{activeVoucher.uploadedByName}</strong> ({activeVoucher.uploadedByRole?.toUpperCase()})
                        {activeVoucher.uploadedAt ? ` on ${formatAppDateTime(activeVoucher.uploadedAt)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewingDisbursementVoucher(true)}
                      className="px-3 py-1.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Voucher</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLightboxData({
                          url: activeVoucher.fileUrl,
                          fileName: activeVoucher.fileName || 'Disbursement Voucher',
                          fileType: activeVoucher.fileType || 'pdf',
                          title: `Official Disbursement Voucher - Check #${activeVoucher.chequeNumber || 'N/A'}`,
                          vendor: `Released by ${activeVoucher.uploadedByName}`,
                          amount: activeVoucher.amountDisbursed,
                        });
                      }}
                      className="p-1.5 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                      title="Open Fullscreen Lightbox"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="bg-white/80 p-2 rounded-xl border border-emerald-200/60">
                    <span className="text-[10px] text-slate-500 block font-sans">Cheque / Ref No.</span>
                    <strong className="text-slate-900">{activeVoucher.chequeNumber || liquidation.chequeNumber || 'N/A'}</strong>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-emerald-200/60">
                    <span className="text-[10px] text-slate-500 block font-sans">Date Released</span>
                    <strong className="text-slate-900">{activeVoucher.disbursementDate || liquidation.dateReleased || 'N/A'}</strong>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-emerald-200/60">
                    <span className="text-[10px] text-slate-500 block font-sans">Amount Disbursed</span>
                    <strong className="text-emerald-700">{formatCurrency(activeVoucher.amountDisbursed || liquidation.amountAdvanced || allocatedBudget)}</strong>
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-emerald-200/60">
                    <span className="text-[10px] text-slate-500 block font-sans">Attached Document</span>
                    <strong className="text-blue-700 truncate block">{activeVoucher.fileName || 'Voucher.pdf'}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-2xl flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Disbursement Voucher Missing:</strong> No official check release proof was uploaded by SAS / Adviser.
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-800 font-bold shrink-0">
                  Unverified Advance
                </span>
              </div>
            )}

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

            {/* ── CATEGORY TABS & RECEIPTS ARCHITECTURE ── */}
            <div className="space-y-3.5">
              {/* Category Tabs (Reference Guide) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#0E4EBD]" />
                    Proposed Budget Baseline Categories
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {categoriesList.length} Categories • Scroll sideways to switch
                  </span>
                </div>

                <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                  {/* All Categories Tab */}
                  <button
                    type="button"
                    onClick={() => handleSelectCategoryTab('all')}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      activeCategoryId === 'all'
                        ? 'bg-[#001A4D] text-white border-[#001A4D] shadow-md ring-2 ring-[#001A4D]/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 min-w-[150px]">
                      <span className={`text-xs font-bold truncate ${activeCategoryId === 'all' ? 'text-white' : 'text-slate-900'}`}>
                        All Categories
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          activeCategoryId === 'all'
                            ? 'bg-white/20 text-[#FFD41C]'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {lineItems.length} {lineItems.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 text-[11px] mt-1.5 pt-1.5 border-t border-current/10 font-mono">
                      <span className={activeCategoryId === 'all' ? 'text-slate-300' : 'text-slate-500'}>
                        Ceiling: {formatCurrency(allocatedBudget)}
                      </span>
                      <span
                        className={`font-bold ${
                          activeCategoryId === 'all'
                            ? isDeficit ? 'text-rose-300' : 'text-emerald-300'
                            : isDeficit ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {isDeficit ? `-${formatCurrency(Math.abs(surplusOrDeficit))}` : `+${formatCurrency(surplusOrDeficit)}`}
                      </span>
                    </div>
                  </button>

                  {/* Individual Proposed Category Tabs */}
                  {categoriesList.map((cat) => {
                    const isSelected = cat.id === activeCategoryId;
                    const stats = categorySpendingMap.get(cat.title) || { baseline: cat.baselineAmount, spent: 0, receiptCount: 0, itemCount: 0 };
                    const rem = cat.baselineAmount - stats.spent;
                    const isOver = rem < 0;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategoryTab(cat.id)}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#001A4D] text-white border-[#001A4D] shadow-md ring-2 ring-[#001A4D]/25'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 min-w-[170px]">
                          <span
                            className={`text-xs font-bold truncate max-w-[180px] ${
                              isSelected ? 'text-white' : 'text-slate-900'
                            }`}
                            title={cat.title}
                          >
                            {cat.title}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              isSelected
                                ? 'bg-white/20 text-[#FFD41C]'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {stats.itemCount} {stats.itemCount === 1 ? 'item' : 'items'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 text-[11px] mt-1.5 pt-1.5 border-t border-current/10 font-mono">
                          <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                            {cat.baselineAmount > 0 ? formatCurrency(cat.baselineAmount) : 'General'}
                          </span>
                          {cat.baselineAmount > 0 ? (
                            <span
                              className={`font-bold ${
                                isSelected
                                  ? isOver ? 'text-rose-300' : 'text-emerald-300'
                                  : isOver ? 'text-rose-600' : 'text-emerald-700'
                              }`}
                            >
                              {isOver ? `-${formatCurrency(Math.abs(rem))}` : `+${formatCurrency(rem)}`}
                            </span>
                          ) : (
                            <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                              {formatCurrency(stats.spent)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Category Context Header */}
              {currentCategory && (
                <div className="p-3 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#001A4D] text-[#FFD41C] text-[10px] font-bold uppercase tracking-wider">
                      Active Category
                    </span>
                    <h4 className="font-bold text-slate-900">{currentCategory.title}</h4>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono">
                    {currentCategory.baselineAmount > 0 ? (
                      <>
                        <span className="text-slate-600">
                          Baseline Ceiling: <strong>{formatCurrency(currentCategory.baselineAmount)}</strong>
                        </span>
                        <span>•</span>
                        <span className="text-[#0E4EBD]">
                          Spent: <strong>{formatCurrency(categorySpendingMap.get(currentCategory.title)?.spent || 0)}</strong>
                        </span>
                        <span>•</span>
                        {(() => {
                          const stats = categorySpendingMap.get(currentCategory.title) || { baseline: currentCategory.baselineAmount, spent: 0 };
                          const rem = stats.baseline - stats.spent;
                          const isOver = rem < 0;
                          return (
                            <span className={`font-bold ${isOver ? 'text-rose-600' : 'text-emerald-700'}`}>
                              {isOver ? `Over by ${formatCurrency(Math.abs(rem))}` : `Remaining: ${formatCurrency(rem)}`}
                            </span>
                          );
                        })()}
                      </>
                    ) : (
                      <span className="text-slate-600">
                        Total Spent: <strong>{formatCurrency(categorySpendingMap.get(currentCategory.title)?.spent || 0)}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Receipts Below Category Tabs */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
                  <span>
                    Receipt Line Items ({displayedLineItems.length})
                    {currentCategory ? ` in "${currentCategory.title}"` : ' (All Categories)'}
                  </span>
                  <span className="text-slate-400 font-normal">Click a receipt to inspect in right pane</span>
                </div>

                {displayedLineItems.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-2">
                    <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
                    <h5 className="text-xs font-bold text-slate-700">No receipts recorded in this category</h5>
                    <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                      {currentCategory && currentCategory.baselineAmount > 0
                        ? `The approved baseline ceiling of ${formatCurrency(currentCategory.baselineAmount)} remains unspent.`
                        : 'No expenses were filed under this category.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {displayedLineItems.map((item, localIdx) => {
                      const realIdx = lineItems.findIndex((it) => (it.id && it.id === item.id) || it === item);
                      const isSelected = realIdx === selectedItemIndex;
                      const itemFiles = normalizeItemAttachments(item);
                      const hasReceipt = itemFiles.length > 0;
                      const itemVariance = (item.allocatedCost || 0) > 0 ? (item.allocatedCost || 0) - (item.totalCost || 0) : null;

                      return (
                        <div
                          key={item.id || localIdx}
                          onClick={() => setSelectedItemIndex(realIdx !== -1 ? realIdx : localIdx)}
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
                                {localIdx + 1}
                              </span>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-xs font-bold text-slate-900 truncate">
                                    {item.description}
                                  </h4>
                                  <span className="text-[10px] font-semibold px-2 py-0.2 bg-slate-100 text-slate-700 rounded border border-slate-200">
                                    {item.category || currentCategory?.title}
                                  </span>
                                  {diffByPath.get(`lineItems.${realIdx}.totalCost`) && (
                                    <InlineRevisionBadge diff={diffByPath.get(`lineItems.${realIdx}.totalCost`)} />
                                  )}
                                  {diffByPath.get(`lineItems.${realIdx}.receiptNumber`) && (
                                    <InlineRevisionBadge diff={diffByPath.get(`lineItems.${realIdx}.receiptNumber`)} />
                                  )}
                                  {diffByPath.get(`lineItems.${realIdx}.receiptUrls`) && (
                                    <InlineRevisionBadge diff={diffByPath.get(`lineItems.${realIdx}.receiptUrls`)} />
                                  )}
                                  {!diffByPath.get(`lineItems.${realIdx}.totalCost`) && item.wasModifiedInRev && (
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
                                    setSelectedItemIndex(realIdx);
                                    flagMissingReceiptInRemarks(realIdx, item.description);
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
                                    setSelectedItemIndex(realIdx);
                                    flagItemForRevision(realIdx, item.description);
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
                )}
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
                    This liquidation is undergoing Stage {currentStage} audit review. You are scheduled to sign in <strong>{formatStageTitle(myFutureStep.stageIndex || 1, 1)} ({myFutureStep.roleTitle})</strong>. You may inspect all expenses, receipts, and line items in advance.
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
                  {viewingDisbursementVoucher ? 'Disbursement Voucher Verification' : 'Live Receipt Matching Studio'}
                </span>
                <span className="text-[11px] font-mono font-bold text-[#FFD41C]">
                  {viewingDisbursementVoucher
                    ? formatCurrency(activeVoucher?.amountDisbursed || allocatedBudget)
                    : formatCurrency(selectedItem?.totalCost || 0)}
                </span>
              </div>

              {viewingDisbursementVoucher && activeVoucher ? (
                <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div className="space-y-0.5 overflow-hidden">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">Official Disbursement Voucher</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>Check: <strong className="text-white">{activeVoucher.chequeNumber || 'N/A'}</strong></span>
                      <span>• Date: <strong className="text-white">{activeVoucher.disbursementDate || 'N/A'}</strong></span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingDisbursementVoucher(false)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold shrink-0 transition-colors cursor-pointer"
                  >
                    ← Back to Receipts
                  </button>
                </div>
              ) : null}

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
              {viewingDisbursementVoucher && activeVoucher ? (
                activeVoucher.fileType === 'pdf' || activeVoucher.fileUrl.toLowerCase().endsWith('.pdf') ? (
                  <div className="w-full h-full min-h-[450px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex flex-col">
                    <div className="px-3 py-1.5 bg-slate-800 text-[11px] text-slate-300 font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Disbursement Voucher PDF Preview
                      </span>
                      <a
                        href={activeVoucher.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline flex items-center gap-1 text-[10px]"
                      >
                        Open In New Tab <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <iframe
                      src={activeVoucher.fileUrl}
                      title="Disbursement Voucher"
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
                      src={activeVoucher.fileUrl}
                      alt="Official Disbursement Voucher"
                      className="max-w-full max-h-[70vh] rounded-xl object-contain shadow-2xl border border-slate-800"
                    />
                  </div>
                )
              ) : activeReceiptFile ? (
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

                {canApprove ? (
                  <button
                    type="button"
                    onClick={() => setPendingConfirmType('approve')}
                    disabled={isSubmitting || !hasSignature}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/40 shadow-blue-900/25 ring-2 ring-[#FFD41C]/30 transition-all disabled:opacity-50 cursor-pointer"
                    title="Grant executive approval and fully approve liquidation"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                    <span>{isSubmitting ? 'Processing...' : '✓ Sign & Fully Approve'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingConfirmType('endorse')}
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
                        ? 'Audit & Check Liquidation'
                        : 'Stamp E-Signature & Endorse'}
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Digital Signing / Approval */}
      {pendingConfirmType && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-5 flex items-center gap-3.5 border-b ${
              pendingConfirmType === 'approve'
                ? 'bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] text-white'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}>
              <div className={`p-2.5 rounded-2xl ${
                pendingConfirmType === 'approve' ? 'bg-white/10 text-[#FFD41C]' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {pendingConfirmType === 'approve' ? <ShieldCheck className="w-6 h-6" /> : <Send className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="font-bold text-sm">
                  {pendingConfirmType === 'approve' ? 'Confirm Final Executive Approval' : 'Confirm Digital Endorsement'}
                </h3>
                <p className={`text-xs mt-0.5 truncate max-w-xs ${pendingConfirmType === 'approve' ? 'text-white/80' : 'text-emerald-800'}`}>
                  {liquidation.eventTitle}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {pendingConfirmType === 'approve'
                  ? 'Are you sure you want to digitally sign and fully approve this Financial Liquidation?'
                  : 'Are you sure you want to digitally sign and endorse this Financial Liquidation?'}
              </p>

              <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed space-y-2 ${
                pendingConfirmType === 'approve'
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
                  What happens next:
                </div>
                {pendingConfirmType === 'approve' ? (
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                    <li>Your official digital signature will be sealed onto Form LF-01.</li>
                    <li>The liquidation status transitions to <strong>Fully Approved & Concluded</strong>.</li>
                    <li>Financial disbursements and balances will be officially liquidated.</li>
                    <li>The student organization and all stakeholders will be notified.</li>
                  </ul>
                ) : (
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                    <li>Your official digital signature will be sealed on Stage {currentStage}.</li>
                    <li>The liquidation will advance to the next designated signatory.</li>
                    <li>Next-stage signers will be notified automatically.</li>
                  </ul>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingConfirmType(null)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const type = pendingConfirmType;
                  setPendingConfirmType(null);
                  handleEndorse(type === 'approve' ? 'approve' : 'forward');
                }}
                disabled={isSubmitting}
                className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 ${
                  pendingConfirmType === 'approve'
                    ? 'bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/40'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {pendingConfirmType === 'approve' ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                    <span>Confirm & Fully Approve</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm & Endorse</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liquidation Export Preview Modal */}
      {showExportModal && (
        <LiquidationExportPreviewModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          report={liquidation}
        />
      )}

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
