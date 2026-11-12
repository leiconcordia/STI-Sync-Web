import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  DollarSign,
  FileText, FileCheck,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
  Eye,
  Paperclip,
  ExternalLink,
  Lock,
  Shield,
  ShieldCheck,
  Layers,
  RotateCcw,
  Receipt,
  Calendar,
  Building,
  Clock,
  Save,
  Undo2,
  Download,
  Coins,
} from 'lucide-react';
import { format } from 'date-fns';
import { doc, getDoc } from 'firebase/firestore';
import { uploadToCloudinary } from '../../../services/cloudinary';
import { sanitizeFirestorePayload, db } from '../../../services/firebase';
import { useAllEvents } from '../../modules/events/hooks/useEventStream';
import { useAllLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import {
  getEventTimingStatus,
  isSasInstitutionalActivity,
  isEventConcluded,
} from '../../modules/events/utils/event-lifecycle.utils';
import { isEventLiquidationExempt } from '../../modules/events/utils/organization-display.utils';
import {
  createLiquidationReport,
  updateLiquidationReport,
  submitLiquidationReport,
  withdrawLiquidationReport,
  generateDefaultLiquidationChain,
} from '../../modules/finance/services/liquidation.service';
import { subscribeToSignatories } from '../../modules/signatories/services/signatory.service';
import type { InstitutionalSignatory } from '../../modules/signatories/types/signatory.types';
import type {
  LiquidationDocument,
  ExpenseLineItem,
  ReceiptAttachment,
  LiquidationApprovalStep,
} from '../../modules/finance/types/liquidation.types';
import { isExpenseItemFlagged } from '../../modules/finance/types/liquidation.types';
import LiquidationSignatoryTracker from '../../modules/finance/components/LiquidationSignatoryTracker';
import LiquidationFlowBuilder from '../../modules/finance/components/LiquidationFlowBuilder';
import { formatCurrency, formatVariance } from '../../utils/currency';
import ReceiptLightboxModal from '../../modules/finance/components/ReceiptLightboxModal';
import { LiquidationExportPreviewModal } from '../../modules/finance/components/LiquidationExportPreviewModal';
import WithdrawConfirmModal from '../../modules/workflow/components/WithdrawConfirmModal';
import { useOfficerProfile } from '../../auth/hooks/useOfficerProfile';
import RevisionFeedbackBanner from '../../modules/workflow/components/RevisionFeedbackBanner';
import DigitalSignatureModal from '../../signatory/components/DigitalSignatureModal';
import {
  resolveUserSignature,
  getFastCachedSignature,
  syncUserSignatureAcrossProfiles,
} from '../../modules/signatories';
import { toast } from 'sonner';

interface OfficerLiquidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  userUid: string;
  userName: string;
  userRole: 'admin' | 'officer';
  userSignatureUrl?: string;
  isAdviser?: boolean;
  editingReport?: LiquidationDocument | null;
  existingLiquidations?: LiquidationDocument[];
  initialEventId?: string;
  initialEvent?: any;
  readOnly?: boolean;
}

const EXPENSE_CATEGORIES = [
  'Food & Catering',
  'Venue & Facilities',
  'Materials & Printing',
  'Honorarium & Speakers',
  'Transportation & Travel',
  'Equipment Rental',
  'Miscellaneous',
];

function getFileTypeCategory(fileName: string, mimeType?: string): 'image' | 'pdf' | 'document' | 'spreadsheet' | 'other' {
  const name = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg|bmp|heic)$/i.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.rtf') || name.endsWith('.odt') || name.endsWith('.txt')) return 'document';
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv') || name.endsWith('.ods')) return 'spreadsheet';
  return 'other';
}

function reindexLiquidationSteps(steps: LiquidationApprovalStep[]): LiquidationApprovalStep[] {
  const stageMap = new Map<number, LiquidationApprovalStep[]>();
  steps.forEach((s) => {
    const idx = s.stageIndex ?? 1;
    if (!stageMap.has(idx)) stageMap.set(idx, []);
    stageMap.get(idx)!.push(s);
  });
  const sortedKeys = Array.from(stageMap.keys()).sort((a, b) => a - b);
  let stepNum = 1;
  const reindexed: LiquidationApprovalStep[] = [];
  sortedKeys.forEach((oldIdx, newIdxMinusOne) => {
    const newStageNum = newIdxMinusOne + 1;
    const stageSteps = stageMap.get(oldIdx)!;
    const stageName = stageSteps[0]?.stageName || `Stage ${newStageNum}`;
    stageSteps.forEach((st) => {
      reindexed.push({
        ...st,
        step: stepNum++,
        stageIndex: newStageNum,
        stageName,
        status: newStageNum === 1 ? 'current' : 'waiting',
      });
    });
  });
  return reindexed;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDateSafely(val?: any): Date | null {
  if (!val) return null;
  if (typeof val?.toDate === 'function') return val.toDate();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000);
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  return null;
}

function calculateDaysLapse(subDate: Date, deadDate: Date): string {
  const s = new Date(subDate.getFullYear(), subDate.getMonth(), subDate.getDate());
  const d = new Date(deadDate.getFullYear(), deadDate.getMonth(), deadDate.getDate());
  const diffTime = s.getTime() - d.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '-o-';
  return `+${diffDays} day${diffDays === 1 ? '' : 's'}`;
}

function normalizeLineItems(items: ExpenseLineItem[]): ExpenseLineItem[] {
  return items.map((item, idx) => {
    let files: ReceiptAttachment[] = item.receiptFiles ? [...item.receiptFiles] : [];
    if (files.length === 0) {
      if (Array.isArray(item.receiptUrls) && item.receiptUrls.length > 0) {
        files = item.receiptUrls.map((url, uIdx) => ({
          id: `receipt-url-${uIdx}-${Date.now()}`,
          url,
          name: `Receipt File ${uIdx + 1}`,
          fileType: getFileTypeCategory(url),
        }));
      } else if (item.receiptUrl) {
        files = [
          {
            id: `legacy-${Date.now()}-${idx}`,
            url: item.receiptUrl,
            name: 'Receipt Attachment',
            fileType: getFileTypeCategory(item.receiptUrl),
          },
        ];
      }
    }
    return {
      ...item,
      receiptFiles: files,
      receiptUrls: files.map((f) => f.url),
      receiptUrl: files.length > 0 ? files[0].url : '',
    };
  });
}

export default function OfficerLiquidationModal({
  isOpen,
  onClose,
  orgId,
  orgName,
  userUid,
  userName,
  userRole,
  userSignatureUrl,
  isAdviser,
  editingReport,
  existingLiquidations,
  initialEventId,
  initialEvent,
  readOnly = false,
}: OfficerLiquidationModalProps) {
  const { profile: officerProfile } = useOfficerProfile();
  const effectiveIsAdviser = Boolean(isAdviser ?? officerProfile?.isAdviser ?? (userRole === 'admin'));
  const isSasCreator =
    userRole === 'admin' ||
    orgId === 'sao_admin' ||
    orgId === 'sas' ||
    ['sas', 'sao', 'sas_admin', 'sao_admin', 'student affairs office', 'student affairs services'].includes(
      (orgId || '').toString().trim().toLowerCase()
    );

  const [makerSignatureUrl, setMakerSignatureUrl] = useState<string | null>(() => {
    return userSignatureUrl || getFastCachedSignature(officerProfile) || null;
  });
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const fastSig = userSignatureUrl || getFastCachedSignature(officerProfile);
    if (fastSig && !makerSignatureUrl) {
      setMakerSignatureUrl(fastSig);
    }

    resolveUserSignature({
      uid: userUid || officerProfile?.studentId,
      email: officerProfile?.email,
      role: userRole,
      profile: officerProfile,
    }).then((sig) => {
      if (!isCancelled && sig) {
        setMakerSignatureUrl(sig);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [makerSignatureUrl, officerProfile?.signatureUrl, userSignatureUrl, userUid, userRole]);

  const { events: allEvents } = useAllEvents();
  const { liquidations: allLiquidations } = useAllLiquidations();

  // Merge scoped org liquidations and global liquidations to ensure complete coverage without shadowing
  const liquidationsList = useMemo(() => {
    const map = new Map<string, LiquidationDocument>();
    (allLiquidations || []).forEach((l) => map.set(l.id, l));
    (existingLiquidations || []).forEach((l) => map.set(l.id, l));
    return Array.from(map.values());
  }, [allLiquidations, existingLiquidations]);

  // Set of eventIds that already have an active liquidation
  const liquidatedEventIds = useMemo(() => {
    const set = new Set<string>();
    liquidationsList.forEach((l) => {
      // Exclude voided, cancelled, or soft-deleted liquidations from blocking an event
      if (
        l.eventId &&
        l.status !== 'voided' &&
        (l.status as any) !== 'cancelled' &&
        (l as any).isDeleted !== true
      ) {
        set.add(l.eventId);
      }
    });
    return set;
  }, [liquidationsList]);

  // Helper to calculate total budget from any budget property or budgetItems array
  const calculateEventBudget = (e: any): number => {
    if (typeof e.totalApprovedBudget === 'number' && e.totalApprovedBudget > 0) return e.totalApprovedBudget;
    if (typeof e.allocatedBudget === 'number' && e.allocatedBudget > 0) return e.allocatedBudget;
    if (typeof e.adminFeeOverride === 'number' && e.adminFeeOverride > 0) return e.adminFeeOverride;
    if (typeof e.totalExpectedCollection === 'number' && e.totalExpectedCollection > 0) return e.totalExpectedCollection;
    if (typeof e.suggestedFeePerStudent === 'number' && e.suggestedFeePerStudent > 0) return e.suggestedFeePerStudent;
    if (typeof e.totalBudget === 'number' && e.totalBudget > 0) return e.totalBudget;
    if (Array.isArray(e.budgetItems) && e.budgetItems.length > 0) {
      const sum = e.budgetItems.reduce((acc: number, item: any) => {
        const itemCost = Number(item.approvedAmount || item.totalCost || (Number(item.quantity || 1) * Number(item.unitCost || 0)) || 0);
        return acc + itemCost;
      }, 0);
      if (sum > 0) return sum;
    }
    return 0;
  };

  // Filter events eligible for liquidation:
  // 1. Only events belonging to role/org (Admin = institutional/SAO only; Officer = their club only)
  // 2. Only completed events (status/proposalStatus/lifecycleStatus === 'completed' or timing completed)
  // 3. Exclude if event already has a liquidation (unless editing that existing report)
  const eligibleEvents = useMemo(() => {
    if (allEvents.length === 0) return [];

    return allEvents.filter((e: any) => {
      if (!e || e.isDeleted === true) return false;

      // When editing an existing report, always preserve the event currently linked to it
      if ((editingReport && editingReport.eventId === e.id) || (initialEventId && initialEventId === e.id)) return true;

      const isEditingThisEvent = (editingReport && editingReport.eventId === e.id) || (initialEventId && initialEventId === e.id);

      // Basic validity & non-cancellation / non-draft / non-rejected check
      const pStatus = (e.proposalStatus || '').toString().toLowerCase();
      const eStatus = (e.status || '').toString().toLowerCase();
      const lStatus = (e.lifecycleStatus || '').toString().toLowerCase();
      const isCancelled = e.isCancelled === true || pStatus === 'cancelled' || eStatus === 'cancelled' || lStatus === 'cancelled';
      const isDraft = pStatus === 'draft';
      const isRejected = pStatus === 'rejected' || eStatus === 'rejected';

      if (isCancelled || isDraft || isRejected) return false;

      // Lifecycle check: Events must be officially approved (ongoing / recording receipts mode) or completed/concluded
      const timingStatus = getEventTimingStatus(e);
      const isCompleted =
        eStatus === 'completed' ||
        pStatus === 'completed' ||
        lStatus === 'completed' ||
        lStatus === 'concluded' ||
        (e as any).isConcluded === true ||
        timingStatus === 'completed';
      const isApproved = pStatus === 'approved' || eStatus === 'approved';

      if (!isCompleted && !isApproved) return false;

      // Role & Organization ownership scoping:
      // STRICT AUTHORING ISOLATION:
      // - SAS / Admin can ONLY create Financial Liquidation for SAS / Institutional activities!
      //   (Student Organization activities MUST NOT show in SAS!)
      // Role & Organization ownership scoping:
      // STRICT AUTHORING ISOLATION:
      // - SAS / Admin can ONLY create Financial Liquidation for SAS / Institutional activities!
      //   (Student Organization activities MUST NEVER show in SAS!)
      // - Student Organizations can ONLY create Financial Liquidation for their own organization activities!
      //   (SAS activities MUST NEVER show in Student Org!)
      const isSasActivity = isSasInstitutionalActivity(e);

      if (userRole === 'admin' || orgId === 'sao_admin' || orgId === 'sas') {
        // SAS Admin: ONLY show SAS / Institutional events!
        // Student org events must NEVER show in SAS!
        if (!isSasActivity) return false;
      } else {
        // Officer: strictly student organization events only!
        // SAS events must NEVER show in Officer!
        if (isSasActivity) return false;

        const cleanOrgId = (orgId || '').trim().toLowerCase();
        const cleanOrgName = (orgName || '').trim().toLowerCase();

        const eventOrgIds = [
          e.hostingOrgId,
          e.organizationId,
          e.createdByOrgId,
          e.orgId,
          e.org,
          e.organization,
        ].filter(Boolean).map((v) => String(v).trim().toLowerCase());

        const eventOrgNames = [
          e.hostingOrgName,
          e.orgName,
          (e as any).organizationName,
        ].filter(Boolean).map((v) => String(v).trim().toLowerCase());

        const matchesOrg =
          (cleanOrgId && eventOrgIds.some((id) => id === cleanOrgId || id.includes(cleanOrgId) || cleanOrgId.includes(id))) ||
          (cleanOrgName && eventOrgNames.some((name) => name === cleanOrgName || name.includes(cleanOrgName) || cleanOrgName.includes(name))) ||
          (!cleanOrgId && !cleanOrgName);

        if (!matchesOrg) return false;
      }

      // Liquidation exclusivity check (1:1 invariant): if already liquidated or has an active/approved liquidation, exclude
      // NOTE: 'pending' means liquidation is pending to be created for this concluded event, so it is ELIGIBLE!
      const liqStatus = ((e as any).liquidationStatus || '').toString().toLowerCase();
      const lingeringReportIsActive =
        Boolean((e as any).liquidationReportId) &&
        liquidationsList.some(
          (l) =>
            l.id === (e as any).liquidationReportId &&
            l.status !== 'voided' &&
            (l.status as any) !== 'cancelled' &&
            (l as any).isDeleted !== true
        );

      const hasLiquidation =
        liquidatedEventIds.has(e.id) ||
        lingeringReportIsActive ||
        (e as any).isLiquidated === true ||
        ['submitted', 'under_review', 'approved'].includes(liqStatus) ||
        (e as any).hasLiquidation === true;

      if (hasLiquidation && !isEditingThisEvent) {
        return false;
      }

      // If no budget or no financial projection, no liquidation is required
      if (!isEditingThisEvent && isEventLiquidationExempt(e)) {
        return false;
      }

      return true;
    });
  }, [allEvents, orgId, orgName, userRole, liquidatedEventIds, editingReport, initialEventId]);

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [activeReportId, setActiveReportId] = useState<string>(editingReport?.id || '');
  const [allocatedBudget, setAllocatedBudget] = useState<number>(0);
  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>([]);
  const [approvalChain, setApprovalChain] = useState<LiquidationApprovalStep[]>([]);
  const [activeSignatories, setActiveSignatories] = useState<InstitutionalSignatory[]>([]);
  const [activeModalTab, setActiveModalTab] = useState<'expenses' | 'signatories'>('expenses');
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resubmissionNote, setResubmissionNote] = useState('');
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const selectedEvent = useMemo(() => {
    return (
      (initialEvent && (!selectedEventId || initialEvent.id === selectedEventId) ? initialEvent : null) ||
      eligibleEvents.find((e) => e.id === selectedEventId) ||
      allEvents.find((e) => e.id === selectedEventId) ||
      initialEvent ||
      null
    );
  }, [eligibleEvents, allEvents, selectedEventId, initialEvent]);

  // Derive active report from prop, tracked ID, linked event, or existing list
  const effectiveReport = useMemo(() => {
    if (editingReport) return editingReport;
    if (activeReportId) {
      const found = liquidationsList.find((l) => l.id === activeReportId);
      if (found) return found;
    }
    const targetId = (selectedEvent as any)?.liquidationReportId;
    if (targetId) {
      const found = liquidationsList.find((l) => l.id === targetId);
      if (found) return found;
    }
    const eventIdToMatch = selectedEventId || initialEventId;
    if (eventIdToMatch) {
      const found = liquidationsList.find(
        (l) =>
          l.eventId === eventIdToMatch &&
          l.status !== 'voided' &&
          (l.status as any) !== 'cancelled' &&
          (l as any).isDeleted !== true
      );
      if (found) return found;
    }
    return null;
  }, [editingReport, activeReportId, selectedEvent, selectedEventId, initialEventId, liquidationsList]);

  const activeDisbursementVoucher = useMemo(() => {
    return (
      effectiveReport?.disbursementVoucher ||
      editingReport?.disbursementVoucher ||
      selectedEvent?.disbursementVoucher ||
      null
    );
  }, [effectiveReport, editingReport, selectedEvent]);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [localStatusOverride, setLocalStatusOverride] = useState<LiquidationStatus | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setLocalStatusOverride(null);
    }
  }, [isOpen]);

  const currentStatus = localStatusOverride || effectiveReport?.status || (editingReport?.status ?? 'draft');

  const isReportSubmittedOrApproved = Boolean(
    effectiveReport &&
    (currentStatus === 'under_review' ||
     currentStatus === 'pending' ||
     currentStatus === 'approved')
  );
  const isEffectiveReadOnly = Boolean(readOnly || isReportSubmittedOrApproved);

  const handleWithdraw = async () => {
    if (!effectiveReport) return;
    setIsWithdrawing(true);
    try {
      await withdrawLiquidationReport(effectiveReport.id, userUid, userName);
      toast.success(`Liquidation report for "${effectiveReport.eventTitle}" withdrawn to draft.`);
      setShowWithdrawModal(false);
      setLocalStatusOverride('draft');
      if (effectiveReport) {
        effectiveReport.status = 'draft';
      }
      setActiveReportId(effectiveReport.id);
    } catch (err: any) {
      console.error('[OfficerLiquidationModal] Withdraw failed:', err);
      toast.error(err?.message || 'Failed to withdraw liquidation report.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const isReturnedReport = Boolean(
    effectiveReport?.status === 'returned' ||
    (effectiveReport as any)?.isReturned
  );

  const flaggedLineItemKeys = useMemo(() => {
    const flags = effectiveReport?.returnFlags || [];
    const remarkKeys = Object.keys(effectiveReport?.stepRevisionRemarks || {});
    const allKeys = Array.from(new Set([...flags, ...remarkKeys]));
    return allKeys.filter((k) => k.startsWith('item_') || k.startsWith('item-'));
  }, [effectiveReport]);

  const hasItemLevelFlags = flaggedLineItemKeys.length > 0;

  const hasLegacyLineItemFlags = Boolean(
    effectiveReport?.returnFlags?.includes('sec_line_items') ||
    effectiveReport?.returnFlags?.includes('sec_receipts') ||
    effectiveReport?.stepRevisionRemarks?.['sec_line_items'] ||
    effectiveReport?.stepRevisionRemarks?.['sec_receipts']
  );

  const isLineItemsFlagged = hasItemLevelFlags || hasLegacyLineItemFlags;

  const flaggedItemCount = useMemo(() => {
    if (!effectiveReport) return 0;
    if (!hasItemLevelFlags && hasLegacyLineItemFlags) return lineItems.length;
    return lineItems.filter((item, idx) => {
      const { isFlagged } = isExpenseItemFlagged(
        item,
        idx,
        effectiveReport.returnFlags,
        effectiveReport.stepRevisionRemarks,
        hasLegacyLineItemFlags,
        hasItemLevelFlags
      );
      return isFlagged;
    }).length;
  }, [lineItems, effectiveReport, hasItemLevelFlags, hasLegacyLineItemFlags]);

  const isEventBudgetFlagged = Boolean(
    effectiveReport?.returnFlags?.includes('sec_event_budget') ||
    effectiveReport?.stepRevisionRemarks?.['sec_event_budget']
  );
  const eventBudgetFeedback = effectiveReport?.stepRevisionRemarks?.['sec_event_budget'];

  const isSignatoriesFlagged = Boolean(
    effectiveReport?.returnFlags?.includes('sec_signatories') ||
    effectiveReport?.stepRevisionRemarks?.['sec_signatories']
  );
  const signatoriesFeedback = effectiveReport?.stepRevisionRemarks?.['sec_signatories'];

  const [lightboxData, setLightboxData] = useState<{
    url: string;
    title: string;
    vendor?: string;
    amount?: number;
    fileName?: string;
    fileType?: string;
  } | null>(null);

  const isConcluded = useMemo(() => {
    return isEventConcluded(selectedEvent);
  }, [selectedEvent]);

  const isSelectedEventExempt = useMemo(() => {
    return isEventLiquidationExempt(selectedEvent);
  }, [selectedEvent]);

  const isOrgFunds = useMemo(() => {
    return (selectedEvent as any)?.fundingSource === 'organization_funds' || effectiveReport?.fundingSource === 'organization_funds';
  }, [selectedEvent, effectiveReport]);

  // Form LF-01 Official Header Information
  const [employeeName, setEmployeeName] = useState<string>('');
  const [detectedEmployeeSource, setDetectedEmployeeSource] = useState<'club_adviser' | 'sas_admin' | 'manual'>('manual');
  const [detectedAdviserName, setDetectedAdviserName] = useState<string>('');
  const [chequeNumber, setChequeNumber] = useState<string>(''); // Manually inputted, NO default value per user request!
  const [purpose, setPurpose] = useState<string>('');
  const [amountAdvanced, setAmountAdvanced] = useState<number>(0);
  const [dateReleased, setDateReleased] = useState<string>('');
  const [activityEndDate, setActivityEndDate] = useState<string>('');
  const [submissionDeadline, setSubmissionDeadline] = useState<string>('');
  const [dateSubmitted, setDateSubmitted] = useState<string>(() => {
    try {
      return format(new Date(), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  });
  const [daysLapsed, setDaysLapsed] = useState<string>('-o-');
  const [orNumber, setOrNumber] = useState<string>('');

  const exportReportTarget = useMemo<LiquidationDocument | null>(() => {
    if (effectiveReport) {
      return {
        ...effectiveReport,
        status: currentStatus,
        employeeName: employeeName || effectiveReport.employeeName,
        chequeNumber: chequeNumber || effectiveReport.chequeNumber,
        purpose: purpose || effectiveReport.purpose,
        amountAdvanced: amountAdvanced || effectiveReport.amountAdvanced,
        dateReleased: dateReleased || effectiveReport.dateReleased,
        activityEndDate: activityEndDate || effectiveReport.activityEndDate,
        submissionDeadline: submissionDeadline || effectiveReport.submissionDeadline,
        dateSubmitted: dateSubmitted || effectiveReport.dateSubmitted,
        daysLapsed: daysLapsed || effectiveReport.daysLapsed,
        orNumber: orNumber || effectiveReport.orNumber,
        lineItems: lineItems.length > 0 ? lineItems : effectiveReport.lineItems,
        allocatedBudget: allocatedBudget || effectiveReport.allocatedBudget,
        approvalChain: approvalChain.length > 0 ? approvalChain : effectiveReport.approvalChain,
      };
    }
    return null;
  }, [
    effectiveReport,
    currentStatus,
    employeeName,
    chequeNumber,
    purpose,
    amountAdvanced,
    dateReleased,
    activityEndDate,
    submissionDeadline,
    dateSubmitted,
    daysLapsed,
    orNumber,
    lineItems,
    allocatedBudget,
    approvalChain,
  ]);

  const handleActivityEndDateChange = (val: string) => {
    setActivityEndDate(val);
    const parsed = parseDateSafely(val);
    if (parsed) {
      const newDeadline = new Date(parsed.getTime() + 15 * 24 * 60 * 60 * 1000);
      const newDeadStr = format(newDeadline, 'yyyy-MM-dd');
      setSubmissionDeadline(newDeadStr);

      const subParsed = parseDateSafely(dateSubmitted) || new Date();
      setDaysLapsed(calculateDaysLapse(subParsed, newDeadline));
    }
  };

  const handleDateSubmittedChange = (val: string) => {
    setDateSubmitted(val);
    const subParsed = parseDateSafely(val) || new Date();
    const deadParsed = parseDateSafely(submissionDeadline);
    if (deadParsed) {
      setDaysLapsed(calculateDaysLapse(subParsed, deadParsed));
    }
  };

  const handleResetEmployeeName = () => {
    if (detectedAdviserName) {
      setEmployeeName(detectedAdviserName);
      toast.info(`Reset Employee Name to detected: ${detectedAdviserName}`);
    }
  };

  // Pre-populate Form LF-01 Header Information
  useEffect(() => {
    if (!selectedEvent) return;

    // 1. If editing an existing report with stored header values, prioritize them:
    const targetReport = effectiveReport || editingReport;
    if (targetReport) {
      if (targetReport.employeeName) setEmployeeName(targetReport.employeeName);
      if (targetReport.chequeNumber) setChequeNumber(targetReport.chequeNumber);
      if (targetReport.purpose) setPurpose(targetReport.purpose);
      if (targetReport.amountAdvanced) setAmountAdvanced(targetReport.amountAdvanced);
      if (targetReport.dateReleased) setDateReleased(targetReport.dateReleased);
      if (targetReport.activityEndDate) setActivityEndDate(targetReport.activityEndDate);
      if (targetReport.submissionDeadline) setSubmissionDeadline(targetReport.submissionDeadline);
      if (targetReport.dateSubmitted) setDateSubmitted(targetReport.dateSubmitted);
      if (targetReport.daysLapsed) setDaysLapsed(targetReport.daysLapsed);
      if (targetReport.orNumber) setOrNumber(targetReport.orNumber);
      return;
    }

    // 2. Fresh Liquidation Report Defaults:
    const eventIsSas = isSasCreator || isSasInstitutionalActivity(selectedEvent);

    // A. Employee Name: Club Adviser for club events, Admin for SAS events
    let detectedName = '';
    const detectedSource: 'club_adviser' | 'sas_admin' = eventIsSas ? 'sas_admin' : 'club_adviser';

    if (eventIsSas) {
      detectedName =
        (userRole === 'admin' ? userName : '') ||
        selectedEvent.supervisorName ||
        selectedEvent.createdByName ||
        'SAO Administrator';
    } else {
      if (effectiveIsAdviser && userName) {
        detectedName = userName;
      } else if (selectedEvent.supervisorName) {
        detectedName = selectedEvent.supervisorName;
      } else if (selectedEvent.adviserName) {
        detectedName = selectedEvent.adviserName;
      }
    }

    // Query organization if student club adviser is not yet detected on event
    const hostOrgId = selectedEvent.hostingOrgId || selectedEvent.organizationId || orgId;
    if (!eventIsSas && !detectedName && hostOrgId && hostOrgId !== 'sas' && hostOrgId !== 'sao_admin') {
      getDoc(doc(db, 'organizations', hostOrgId))
        .then((orgSnap) => {
          if (orgSnap.exists()) {
            const oData = orgSnap.data() as any;
            const oAdviser = oData.adviserName || oData.adviser?.name || '';
            if (oAdviser) {
              setDetectedAdviserName(oAdviser);
              setEmployeeName((prev) => (prev ? prev : oAdviser));
            }
          }
        })
        .catch((err) => console.warn('[OfficerLiquidationModal] Org adviser fetch:', err));
    }

    if (detectedName) {
      setDetectedAdviserName(detectedName);
      setEmployeeName((prev) => (prev ? prev : detectedName));
      setDetectedEmployeeSource(detectedSource);
    }

    // B. Cheque Number & Disbursement Details from Official Voucher if present
    const attachedVoucher = selectedEvent?.disbursementVoucher || effectiveReport?.disbursementVoucher;
    if (attachedVoucher) {
      if (attachedVoucher.chequeNumber) setChequeNumber((prev) => (prev ? prev : attachedVoucher.chequeNumber));
      if (attachedVoucher.disbursementDate) setDateReleased((prev) => (prev ? prev : attachedVoucher.disbursementDate));
      if (attachedVoucher.amountDisbursed) setAmountAdvanced((prev) => (prev > 0 ? prev : attachedVoucher.amountDisbursed));
    }

    // C. Purpose: Default to event title
    setPurpose((prev) => (prev ? prev : selectedEvent.title || ''));

    // D. Amount: Default to allocated budget
    const budget = calculateEventBudget(selectedEvent);
    setAmountAdvanced((prev) => (prev > 0 ? prev : budget));

    // E. Dates:
    let relDateStr = '';
    let endDateStr = '';

    if (Array.isArray(selectedEvent.sessions) && selectedEvent.sessions.length > 0) {
      const validSessions = selectedEvent.sessions.filter((s: any) => s && s.date);
      if (validSessions.length > 0) {
        validSessions.sort((a: any, b: any) => (a.date > b.date ? 1 : -1));
        const firstSession = validSessions[0];
        const lastSession = validSessions[validSessions.length - 1];

        const pFirst = parseDateSafely(firstSession.date);
        if (pFirst) relDateStr = format(pFirst, 'yyyy-MM-dd');

        const pLast = parseDateSafely(lastSession.date);
        if (pLast) endDateStr = format(pLast, 'yyyy-MM-dd');
      }
    }

    if (!relDateStr) {
      const pCreated = parseDateSafely(selectedEvent.createdAt);
      if (pCreated) relDateStr = format(pCreated, 'yyyy-MM-dd');
    }

    if (!endDateStr) {
      const pCompleted = parseDateSafely(selectedEvent.completedAt || selectedEvent.createdAt);
      if (pCompleted) endDateStr = format(pCompleted, 'yyyy-MM-dd');
    }

    setDateReleased((prev) => (prev ? prev : relDateStr));
    setActivityEndDate((prev) => (prev ? prev : endDateStr));

    // F. Deadline (+15 days from activityEndDate)
    if (endDateStr) {
      const parsedEnd = parseDateSafely(endDateStr);
      if (parsedEnd) {
        const deadDate = new Date(parsedEnd.getTime() + 15 * 24 * 60 * 60 * 1000);
        const deadStr = format(deadDate, 'yyyy-MM-dd');
        setSubmissionDeadline((prev) => (prev ? prev : deadStr));

        const parsedSub = parseDateSafely(dateSubmitted) || new Date();
        setDaysLapsed(calculateDaysLapse(parsedSub, deadDate));
      }
    }
  }, [selectedEvent, effectiveReport, editingReport]);

  // Extract proposed baseline items from selected event
  const proposedBaselineItems = useMemo(() => {
    if (!selectedEvent) return [];

    // Check budgetItems
    if (Array.isArray(selectedEvent.budgetItems) && selectedEvent.budgetItems.length > 0) {
      return selectedEvent.budgetItems.map((bi: any, idx: number) => {
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

    // Check financialProjections.expenses
    if (
      Array.isArray(selectedEvent.financialProjections?.expenses) &&
      selectedEvent.financialProjections.expenses.length > 0
    ) {
      return selectedEvent.financialProjections.expenses.map((exp: any, idx: number) => ({
        id: exp.id || `prop_exp_${idx}`,
        title: exp.description || exp.item || `Proposed Item ${idx + 1}`,
        baselineAmount: Number(exp.totalAmount || exp.thisYearProposed || 0),
      }));
    }

    // Check budgetCustodians
    if (
      Array.isArray((selectedEvent as any).budgetCustodians) &&
      (selectedEvent as any).budgetCustodians.length > 0
    ) {
      return (selectedEvent as any).budgetCustodians.map((c: any, idx: number) => ({
        id: c.id || `prop_cust_${idx}`,
        title: c.purpose || c.item || `Allocation ${idx + 1}`,
        baselineAmount: Number(c.allocatedAmount || 0),
      }));
    }

    return [];
  }, [selectedEvent]);

  // Dynamic category list: Proposed baseline items + Other / General Expenses (or fallback categories)
  const categoriesList = useMemo(() => {
    if (proposedBaselineItems.length > 0) {
      return [
        ...proposedBaselineItems,
        {
          id: 'cat_other',
          title: 'Other / General Expenses',
          baselineAmount: 0,
        },
      ];
    }
    return EXPENSE_CATEGORIES.map((cat, idx) => ({
      id: `cat_fallback_${idx}`,
      title: cat,
      baselineAmount: 0,
    }));
  }, [proposedBaselineItems]);

  // Aggregate spending per category in real time
  const categorySpendingMap = useMemo(() => {
    const map = new Map<string, { baseline: number; spent: number; receiptCount: number }>();

    categoriesList.forEach((c) => {
      map.set(c.title, { baseline: c.baselineAmount, spent: 0, receiptCount: 0 });
    });

    lineItems.forEach((item) => {
      const cat = (item.proposedItemTitle || item.category || 'Other / General Expenses').trim();
      const cost = Number(item.totalCost || 0);
      const hasReceipt = Boolean(
        (item.receiptFiles && item.receiptFiles.length > 0) ||
        (item.receiptUrls && item.receiptUrls.length > 0) ||
        item.receiptUrl
      );

      if (!map.has(cat)) {
        map.set(cat, { baseline: Number(item.proposedBaselineAmount || 0), spent: 0, receiptCount: 0 });
      }

      const entry = map.get(cat)!;
      entry.spent += cost;
      if (hasReceipt) entry.receiptCount += 1;
    });

    return map;
  }, [categoriesList, lineItems]);

  // Keep active category synced
  useEffect(() => {
    if (!activeCategoryId && categoriesList.length > 0) {
      setActiveCategoryId(categoriesList[0].id);
    } else if (activeCategoryId && !categoriesList.some((c) => c.id === activeCategoryId)) {
      setActiveCategoryId(categoriesList[0]?.id || '');
    }
  }, [categoriesList, activeCategoryId]);

  const currentCategory = useMemo(() => {
    return categoriesList.find((c) => c.id === activeCategoryId) || categoriesList[0];
  }, [categoriesList, activeCategoryId]);

  // Line items belonging strictly to the currently active category tab (1-indexed per category)
  const currentCategoryItems = useMemo(() => {
    if (!currentCategory) return [];
    return lineItems.filter((item) => {
      if (currentCategory.id === 'cat_other') {
        return (
          item.proposedItemId === 'cat_other' ||
          (!item.proposedItemId && !proposedBaselineItems.some((p) => p.title === item.category))
        );
      }
      return (
        item.proposedItemId === currentCategory.id ||
        item.category === currentCategory.title ||
        item.proposedItemTitle === currentCategory.title
      );
    });
  }, [lineItems, currentCategory, proposedBaselineItems]);

  // Select a category tab: auto-initialize Item #1 if empty
  const handleSelectCategoryTab = (catId: string) => {
    setActiveCategoryId(catId);
    const targetCat = categoriesList.find((c) => c.id === catId);
    if (!targetCat) return;

    const existingInCat = lineItems.filter((item) => {
      if (targetCat.id === 'cat_other') {
        return (
          item.proposedItemId === 'cat_other' ||
          (!item.proposedItemId && !proposedBaselineItems.some((p) => p.title === item.category))
        );
      }
      return (
        item.proposedItemId === targetCat.id ||
        item.category === targetCat.title ||
        item.proposedItemTitle === targetCat.title
      );
    });

    if (existingInCat.length === 0 && !isEffectiveReadOnly) {
      setLineItems((prev) => [
        ...prev,
        {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          description: '',
          category: targetCat.title,
          proposedItemId: targetCat.id,
          proposedItemTitle: targetCat.title,
          proposedBaselineAmount: targetCat.baselineAmount || 0,
          quantity: 1,
          unitCost: 0,
          totalCost: 0,
          vendorName: '',
          receiptNumber: '',
          receiptUrl: '',
          receiptUrls: [],
          receiptFiles: [],
        },
      ]);
    }
  };

  // Add Item to the active category (Item #1, Item #2, etc.)
  const handleAddItemToCurrentCategory = () => {
    if (!currentCategory || isEffectiveReadOnly) return;
    setLineItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        description: '',
        category: currentCategory.title,
        proposedItemId: currentCategory.id,
        proposedItemTitle: currentCategory.title,
        proposedBaselineAmount: currentCategory.baselineAmount || 0,
        quantity: 1,
        unitCost: 0,
        totalCost: 0,
        vendorName: '',
        receiptNumber: '',
        receiptUrl: '',
        receiptUrls: [],
        receiptFiles: [],
      },
    ]);
  };

  // Remove or reset item in the active category
  const handleRemoveCategoryItem = (itemToRemoveId: string) => {
    if (isEffectiveReadOnly) return;
    if (currentCategoryItems.length <= 1) {
      setLineItems((prev) =>
        prev.map((i) =>
          i.id === itemToRemoveId
            ? {
                ...i,
                description: '',
                vendorName: '',
                receiptNumber: '',
                unitCost: 0,
                totalCost: 0,
                receiptUrl: '',
                receiptUrls: [],
                receiptFiles: [],
              }
            : i
        )
      );
      toast.info('Item cleared to blank.');
      return;
    }

    setLineItems((prev) => prev.filter((i) => i.id !== itemToRemoveId));
  };
  const eventTitle = selectedEvent?.title || effectiveReport?.eventTitle || editingReport?.eventTitle || 'Event Liquidation';


  // Ensure active category has Item #1 when initialized
  useEffect(() => {
    if (isOpen && !effectiveReport && !editingReport && lineItems.length === 0 && categoriesList.length > 0 && !isEffectiveReadOnly) {
      const firstCat = categoriesList[0];
      setLineItems([
        {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          description: '',
          category: firstCat.title,
          proposedItemId: firstCat.id,
          proposedItemTitle: firstCat.title,
          proposedBaselineAmount: firstCat.baselineAmount || 0,
          quantity: 1,
          unitCost: 0,
          totalCost: 0,
          vendorName: '',
          receiptNumber: '',
          receiptUrl: '',
          receiptUrls: [],
          receiptFiles: [],
        },
      ]);
      setActiveCategoryId(firstCat.id);
    }
  }, [isOpen, effectiveReport, editingReport, lineItems.length, categoriesList, isEffectiveReadOnly]);

  // Subscribe to active institutional signatories for dynamic pipeline builder
  useEffect(() => {
    const unsub = subscribeToSignatories((list) => {
      setActiveSignatories(list);
    });
    return () => unsub();
  }, []);

  // Pre-fill if editing an existing / returned report, or opening from an event
  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    const targetReport =
      editingReport ||
      (initialEventId
        ? liquidationsList.find(
            (l) =>
              l.eventId === initialEventId &&
              l.status !== 'voided' &&
              (l.status as any) !== 'cancelled' &&
              (l as any).isDeleted !== true
          ) || (initialEvent?.liquidationReportId ? liquidationsList.find((l) => l.id === initialEvent.liquidationReportId) : null)
        : null);

    if (targetReport) {
      setActiveReportId(targetReport.id);
      setSelectedEventId(targetReport.eventId);
      setAllocatedBudget(targetReport.allocatedBudget || 0);
      setLineItems(normalizeLineItems(targetReport.lineItems || []));

      // Hydrate LF-01 Header from existing report
      if (targetReport.employeeName) setEmployeeName(targetReport.employeeName);
      if (targetReport.chequeNumber) setChequeNumber(targetReport.chequeNumber);
      if (targetReport.purpose) setPurpose(targetReport.purpose);
      if (targetReport.amountAdvanced) setAmountAdvanced(targetReport.amountAdvanced);
      if (targetReport.dateReleased) setDateReleased(targetReport.dateReleased);
      if (targetReport.activityEndDate) setActivityEndDate(targetReport.activityEndDate);
      if (targetReport.submissionDeadline) setSubmissionDeadline(targetReport.submissionDeadline);
      if (targetReport.dateSubmitted) setDateSubmitted(targetReport.dateSubmitted);
      if (targetReport.daysLapsed) setDaysLapsed(targetReport.daysLapsed);
      if (targetReport.orNumber) setOrNumber(targetReport.orNumber);

      if (targetReport.approvalChain && targetReport.approvalChain.length > 0) {
        const validSteps = targetReport.approvalChain.filter((s) => Boolean(s.signatoryUid && s.signatoryUid.trim() !== ''));
        setApprovalChain(reindexLiquidationSteps(validSteps));
      } else {
        generateDefaultLiquidationChain(orgId, orgName, targetReport.allocatedBudget || 0, activeSignatories, isSasCreator).then((chain) => {
          setApprovalChain(chain);
        });
      }
    } else if (initialEventId) {
      setActiveReportId('');
      handleEventSelect(initialEventId);
    } else {
      setActiveReportId('');
      setSelectedEventId('');
      setAllocatedBudget(0);
      setLineItems([]);
      generateDefaultLiquidationChain(orgId, orgName, 0, activeSignatories, isSasCreator).then((chain) => {
        setApprovalChain(chain);
      });
    }
  }, [editingReport, isOpen, initialEventId, initialEvent, liquidationsList, orgId, orgName, activeSignatories, isSasCreator]);

  // Update budget & auto-fetch budgetItems when event is selected
  const handleEventSelect = async (eventId: string) => {
    setSelectedEventId(eventId);
    const event = eligibleEvents.find((e) => e.id === eventId) || allEvents.find((e) => e.id === eventId);
    if (!event) return;

    // Check if this selected event already has an active liquidation report
    const existing = liquidationsList.find(
      (l) =>
        l.eventId === eventId &&
        l.status !== 'voided' &&
        (l.status as any) !== 'cancelled' &&
        (l as any).isDeleted !== true
    ) || (event.liquidationReportId ? liquidationsList.find((l) => l.id === event.liquidationReportId) : null);

    if (existing) {
      setActiveReportId(existing.id);
      setAllocatedBudget(existing.allocatedBudget || 0);
      setLineItems(normalizeLineItems(existing.lineItems || []));

      // Hydrate LF-01 Header from existing report
      if (existing.employeeName) setEmployeeName(existing.employeeName);
      if (existing.chequeNumber) setChequeNumber(existing.chequeNumber);
      if (existing.purpose) setPurpose(existing.purpose);
      if (existing.amountAdvanced) setAmountAdvanced(existing.amountAdvanced);
      if (existing.dateReleased) setDateReleased(existing.dateReleased);
      if (existing.activityEndDate) setActivityEndDate(existing.activityEndDate);
      if (existing.submissionDeadline) setSubmissionDeadline(existing.submissionDeadline);
      if (existing.dateSubmitted) setDateSubmitted(existing.dateSubmitted);
      if (existing.daysLapsed) setDaysLapsed(existing.daysLapsed);
      if (existing.orNumber) setOrNumber(existing.orNumber);

      if (existing.approvalChain && existing.approvalChain.length > 0) {
        setApprovalChain(reindexLiquidationSteps(existing.approvalChain));
      }
      return;
    }

    setActiveReportId('');
    const budget = calculateEventBudget(event);
    setAllocatedBudget(budget);

    const eventIsSas = isSasCreator || isSasInstitutionalActivity(event);

    // Auto-load liquidation approval chain dynamically from active maintenance signatories
    if (!effectiveReport || !effectiveReport.approvalChain || effectiveReport.approvalChain.length === 0) {
      const defaultChain = await generateDefaultLiquidationChain(
        event.hostingOrgId || orgId,
        event.hostingOrgName || orgName,
        budget,
        activeSignatories,
        eventIsSas
      );
      setApprovalChain(defaultChain);
    }
  };

  const handleLineItemChange = (index: number, field: keyof ExpenseLineItem, value: any) => {
    const updated = [...lineItems];
    const item = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'unitCost') {
      const qty = field === 'quantity' ? Number(value) : item.quantity;
      const cost = field === 'unitCost' ? Number(value) : item.unitCost;
      item.totalCost = qty * cost;
    }

    updated[index] = item;
    setLineItems(updated);
  };

  // Pure receipt entry: user inputs direct amount from the receipt; no quantity/unit price calculations
  const handleReceiptAmountChange = (index: number, amountVal: string) => {
    const numeric = Math.max(0, Number(amountVal) || 0);
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      quantity: 1,
      unitCost: numeric,
      totalCost: numeric,
    };
    setLineItems(updated);
  };

  const handleAddLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: Date.now().toString(),
        description: '',
        category: 'Miscellaneous',
        isPreFilled: false,
        quantity: 1,
        unitCost: 0,
        totalCost: 0,
        vendorName: '',
        receiptUrl: '',
        receiptUrls: [],
        receiptFiles: [],
      },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // Upload one or more receipt files
  const handleReceiptUpload = async (index: number, files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploadingIndex(index);
    setError(null);

    try {
      const fileArray = Array.from(files);
      const newAttachments: ReceiptAttachment[] = [];

      for (const file of fileArray) {
        const res = await uploadToCloudinary(file, {
          folder: `liquidations/${selectedEventId || 'general'}`,
          acceptedTypes: ['*/*'],
        });

        newAttachments.push({
          id: `rec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          url: res.secureUrl,
          name: file.name,
          fileType: getFileTypeCategory(file.name, file.type),
          size: file.size,
          publicId: res.publicId,
        });
      }

      const updated = [...lineItems];
      const existingFiles = updated[index].receiptFiles || [];
      const mergedFiles = [...existingFiles, ...newAttachments];

      updated[index] = {
        ...updated[index],
        receiptFiles: mergedFiles,
        receiptUrls: mergedFiles.map((f) => f.url),
        receiptUrl: mergedFiles.length > 0 ? mergedFiles[0].url : '',
      };
      setLineItems(updated);
    } catch (err: any) {
      console.error('[OfficerLiquidationModal] Upload error:', err);
      setError(err?.message || 'Failed to upload receipt file(s). Please try again.');
    } finally {
      setUploadingIndex(null);
    }
  };

  // Remove a specific receipt file from an item
  const handleRemoveReceiptFile = (itemIndex: number, fileId: string) => {
    const updated = [...lineItems];
    const currentFiles = updated[itemIndex].receiptFiles || [];
    const filteredFiles = currentFiles.filter((f) => f.id !== fileId);

    updated[itemIndex] = {
      ...updated[itemIndex],
      receiptFiles: filteredFiles,
      receiptUrls: filteredFiles.map((f) => f.url),
      receiptUrl: filteredFiles.length > 0 ? filteredFiles[0].url : '',
    };
    setLineItems(updated);
  };

  // Live Calculations
  const totalActualSpending = lineItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  const surplusOrDeficit = allocatedBudget - totalActualSpending;
  const isDeficit = surplusOrDeficit < 0;

  const handleSave = async (shouldSubmit: boolean) => {
    // Collect non-empty line items upfront
    const meaningfulItems = lineItems.filter(
      (item) => item.description.trim() !== '' || item.totalCost > 0 || (item.receiptFiles && item.receiptFiles.length > 0)
    );

    const showValidationError = (msg: string) => {
      setError(msg);
      toast.error(msg);
    };

    if (!selectedEventId && !selectedEvent?.id) {
      showValidationError('Please select an event for this liquidation report.');
      return;
    }

    // Strict validation ONLY on final submission; save-as-draft is completely functional & flexible
    if (shouldSubmit) {
      if (!isConcluded) {
        showValidationError('Cannot submit liquidation: This event has not yet concluded. You can record receipts and save drafts anytime during the event, and officially submit once the event concludes.');
        return;
      }
      if (isReturnedReport && !resubmissionNote.trim()) {
        showValidationError('Please provide an Officer Revision Summary explaining the adjustments made before resubmitting.');
        return;
      }
      if (!effectiveIsAdviser && userRole !== 'admin') {
        showValidationError('Only appointed Club Advisers are authorized to officially submit Financial Liquidations. Student officers can prepare and save drafts.');
        return;
      }
      if (meaningfulItems.length === 0) {
        showValidationError('Please add at least one expense receipt before submitting.');
        return;
      }
      if (meaningfulItems.some((item) => !item.description.trim())) {
        showValidationError('Please provide a description or particular for all expense receipts before submitting.');
        return;
      }
      if (meaningfulItems.some((item) => item.totalCost <= 0)) {
        showValidationError('All expense receipts must have a valid amount greater than ₱0.00.');
        return;
      }
      const missingReceipts = meaningfulItems.some(
        (item) =>
          (!item.receiptFiles || item.receiptFiles.length === 0) &&
          (!item.receiptUrls || item.receiptUrls.length === 0) &&
          !item.receiptUrl
      );
      if (missingReceipts) {
        showValidationError('Please attach at least one valid receipt or proof document for every expense receipt before submitting.');
        return;
      }
      const isOrgFunds = (selectedEvent as any)?.fundingSource === 'organization_funds' || effectiveReport?.fundingSource === 'organization_funds';
      if (!isOrgFunds && approvalChain.length === 0) {
        showValidationError('Please configure the signatory pipeline in the "Signatory & Audit Route" tab before submitting.');
        return;
      }
      if (!isOrgFunds) {
        const hasApprover = approvalChain.some(
          (s) => s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator'
        );
        if (!hasApprover) {
          showValidationError('Your signatory pipeline must include at least one designated Approver (e.g. School Administrator or School President). Switch to the Signatory tab to add one.');
          return;
        }
      }

      // Mandatory Maker Signature Check for formal submission
      const effectiveSignature = makerSignatureUrl || officerProfile?.signatureUrl || userSignatureUrl;
      if (!effectiveSignature) {
        toast.error('Electronic Signature Required', {
          description: 'As the document maker, you must register your official signature before submitting this financial liquidation.',
        });
        setIsSignatureModalOpen(true);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const nextStatus = shouldSubmit ? 'under_review' : 'draft';
      const effectiveSignature = makerSignatureUrl || officerProfile?.signatureUrl || userSignatureUrl || '';
      const submitterRole = isSasCreator ? 'sas_admin' : effectiveIsAdviser ? 'adviser' : userRole;
      const submitterTitle = isSasCreator ? 'SAS Administrator' : effectiveIsAdviser ? 'Organization Adviser' : 'Student Officer';
      const submitterName = userName || (isSasCreator ? 'SAS Administrator' : effectiveIsAdviser ? 'Club Adviser' : 'Officer');

      // Ensure approval chain statuses are set appropriately on submit
      let finalizedChain = approvalChain;
      if (isOrgFunds) {
        finalizedChain = [
          {
            id: 'step_sas_approval',
            step: 1,
            stageIndex: 1,
            stageName: 'SAS Approval',
            role: 'sas_head' as const,
            roleTitle: 'Student Affairs & Services Head',
            actionType: 'approve' as const,
            signatoryUid: 'sas_admin',
            signatoryName: 'Riselle Mae B. Lucanas',
            signatoryEmail: 'sao@ormoc.sti.edu.ph',
            department: 'Student Affairs & Services',
            status: 'current' as const,
          },
        ];
      } else if (shouldSubmit) {
        finalizedChain = approvalChain.map((step) => {
          if ((step.stageIndex ?? 1) === 1) {
            return { ...step, status: 'current' as const };
          }
          return { ...step, status: 'waiting' as const };
        });
      }

      const payload: Omit<LiquidationDocument, 'id' | 'createdAt' | 'updatedAt'> = {
        eventId: selectedEventId || selectedEvent?.id || '',
        eventTitle: selectedEvent?.title || eventTitle || '',
        organizationId: selectedEvent?.organizationId || selectedEvent?.hostingOrgId || orgId || '',
        organizationName: selectedEvent?.organizationName || selectedEvent?.hostingOrgName || orgName || '',
        createdById: userUid || 'user',
        createdByRole: submitterRole,
        createdByName: submitterName,
        submittedByName: submitterName,
        submittedByRole: submitterRole,
        submittedBySignatureUrl: effectiveSignature,
        preparedBy: {
          name: submitterName,
          roleTitle: submitterTitle,
          email: officerProfile?.email || '',
          signatureUrl: effectiveSignature,
          signedAt: new Date().toISOString(),
        },
        allocatedBudget: Number(allocatedBudget || 0),
        totalActualSpending: Number(totalActualSpending || 0),
        surplusOrDeficit: Number(surplusOrDeficit || 0),
        status: nextStatus,
        approvalChain: finalizedChain,
        currentStageIndex: 1,
        currentStepIndex: 0,
        lineItems: shouldSubmit ? meaningfulItems : lineItems,

        // Official Form LF-01 Header Information
        employeeName: (employeeName || '').trim(),
        chequeNumber: (chequeNumber || '').trim(),
        purpose: (purpose || selectedEvent?.title || eventTitle || '').trim(),
        amountAdvanced: Number(amountAdvanced || allocatedBudget || 0),
        dateReleased: (dateReleased || '').trim(),
        activityEndDate: (activityEndDate || '').trim(),
        submissionDeadline: (submissionDeadline || '').trim(),
        dateSubmitted: (dateSubmitted || '').trim(),
        daysLapsed: (daysLapsed || '').trim(),
        orNumber: (orNumber || '').trim(),
        disbursementVoucher: activeDisbursementVoucher || null,
      };

      const sanitizedPayload = sanitizeFirestorePayload(payload);

      const effectiveReportId = activeReportId || effectiveReport?.id || editingReport?.id;

      if (effectiveReportId) {
        await updateLiquidationReport(effectiveReportId, {
          ...sanitizedPayload,
          status: nextStatus,
          ...(shouldSubmit ? { submittedAt: new Date() } : {}),
          ...(shouldSubmit && isReturnedReport && resubmissionNote.trim()
            ? { resubmissionNote: resubmissionNote.trim() }
            : {}),
        });
        toast.success(
          shouldSubmit
            ? isReturnedReport
              ? 'Liquidation report resubmitted successfully with your revision summary. Route reset to Stage 1.'
              : 'Liquidation report submitted successfully for institutional review.'
            : 'Draft liquidation report updated successfully.'
        );
      } else {
        const newId = await createLiquidationReport(sanitizedPayload);
        if (newId) {
          setActiveReportId(newId);
        }
        toast.success(
          shouldSubmit
            ? 'Liquidation report submitted successfully for institutional review.'
            : 'Draft liquidation report saved successfully.'
        );
      }

      onClose();
    } catch (err: any) {
      console.error('[OfficerLiquidationModal] Save failed:', err);
      const errMsg = err?.message || 'Failed to save liquidation report.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#001A4D] text-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold">
                {isEffectiveReadOnly
                  ? effectiveReport?.status === 'approved'
                    ? 'Approved Financial Liquidation Report'
                    : 'Financial Liquidation Report (Under Review)'
                  : effectiveReport || activeReportId || editingReport
                  ? 'Edit Financial Liquidation Report'
                  : 'Create Liquidation Report'}
              </h2>
              {isEffectiveReadOnly && (
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 ${
                    effectiveReport?.status === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                  }`}
                >
                  {effectiveReport?.status === 'approved' ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Approved
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-blue-400 animate-pulse" />
                      Under Signatory Review
                    </>
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-white/80 mt-0.5">
              {isEffectiveReadOnly
                ? 'Official financial liquidation report. All actual expenses, attached receipt proofs, and signatory routes are presented in view-only mode.'
                : 'Submit actual spendings, attach multiple receipt proofs/documents, and verify budget variance.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-white cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {((effectiveReport?.status === 'returned' || (effectiveReport as any)?.isReturned)) && (
            <RevisionFeedbackBanner
              returnedBy={{
                name: (effectiveReport as any).returnedByName || (effectiveReport as any).returnedBy || 'Institutional Signatory',
                roleTitle: (effectiveReport as any).returnedByRoleTitle || 'Signatory Reviewer',
                email: (effectiveReport as any).returnedByEmail,
              }}
              returnedAt={effectiveReport.returnedAt}
              returnRemarks={effectiveReport.returnRemarks}
              returnFlags={effectiveReport.returnFlags}
              stepRevisionRemarks={effectiveReport.stepRevisionRemarks}
              revisionHistory={effectiveReport.revisionHistory}
              documentTitle={effectiveReport.eventTitle}
              documentType="FL"
              currentDocument={effectiveReport}
              versionLabel={`v${effectiveReport.revisionCount || 1}.0`}
              showActionButtons={false}
            />
          )}

          {/* Empty State Warning Alert */}
          {eligibleEvents.length === 0 && !effectiveReport && !editingReport && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">No eligible completed events found</span>
                <p className="text-amber-800 mt-0.5">
                  {userRole === 'admin'
                    ? 'Only concluded institutional / SAO events that have not yet been liquidated are available for administrative liquidation.'
                    : 'Only concluded events belonging to your organization that have not yet been liquidated are available for liquidation submission.'}
                </p>
              </div>
            </div>
          )}

          {/* Event Selection & Allocated Budget (View-Only Linked Activity) */}
          <div
            className={`p-4 rounded-xl transition-all ${
              isEventBudgetFlagged
                ? 'border-2 border-amber-400 bg-amber-50/30 ring-1 ring-amber-300 shadow-xs'
                : 'border border-gray-200 bg-gray-50/40'
            }`}
          >
            <div className="flex items-center justify-between mb-3 border-b border-gray-200/60 pb-2">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-[#0E4EBD]" />
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Linked Activity &amp; Budget Ceiling Allocation
                </h4>
                {selectedEvent && (
                  <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Lock className="w-3 h-3 text-gray-400" /> View Only
                  </span>
                )}
                {isEventBudgetFlagged && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded flex items-center gap-1 animate-pulse">
                    <AlertCircle className="w-3 h-3 text-amber-700" />
                    Needs Revision
                  </span>
                )}
              </div>

              {selectedEvent && (
                <div>
                  {isSelectedEventExempt ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Liquidation Exempt (₱0 Budget)
                    </span>
                  ) : isConcluded ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Event Concluded (Ready to Submit)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      Event In Progress (Recording Receipts Mode)
                    </span>
                  )}
                </div>
              )}
            </div>

            {isSelectedEventExempt && (
              <div className="mb-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold uppercase tracking-wider text-[11px] text-emerald-800">Non-Monetary Activity — Liquidation Exempt:</span>
                  <p className="mt-0.5 text-emerald-800 leading-relaxed">
                    This activity has no budget and no monetary expense projections. Financial liquidation (Form LF-01) is strictly exempt and not required for compliance, clearing, or archiving.
                  </p>
                </div>
              </div>
            )}

            {isEventBudgetFlagged && eventBudgetFeedback && (
              <div className="mb-3 p-3 bg-amber-100/70 border border-amber-300 rounded-lg text-xs text-amber-950 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-900">Reviewer Instructions for Event &amp; Budget:</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{eventBudgetFeedback}</p>
                </div>
              </div>
            )}

            {selectedEvent ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    Linked Activity
                  </label>
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-2xs">
                    <h3 className="text-sm font-bold text-[#001A4D]">
                      {selectedEvent.title}
                    </h3>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Host: <span className="font-semibold text-gray-800">{selectedEvent.hostingOrgName || selectedEvent.organizationName || orgName}</span>
                      {selectedEvent.eventFormat ? ` • ${selectedEvent.eventFormat}` : ''}
                      {activityEndDate ? ` • Ends: ${activityEndDate}` : ''}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-500">
                      Approved Budget Ceiling
                    </label>
                    <span className="text-[10px] text-gray-400 font-mono">Allocation</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₱</span>
                    <input
                      type="number"
                      value={allocatedBudget}
                      readOnly
                      disabled
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-[#001A4D] bg-white cursor-not-allowed select-none focus:outline-none font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Linked Event <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => handleEventSelect(e.target.value)}
                    disabled={!!effectiveReport || !!editingReport || eligibleEvents.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    {eligibleEvents.length === 0 ? (
                      <option value="">No eligible events available</option>
                    ) : (
                      <>
                        <option value="">Select an event ({eligibleEvents.length} available)...</option>
                        {eligibleEvents.map((evt) => (
                          <option key={evt.id} value={evt.id}>
                            {evt.title} ({evt.eventFormat || 'Campus'})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Approved Budget Ceiling (Allocated)
                    </label>
                    <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Lock className="w-3 h-3 text-gray-400" /> Read-only
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₱</span>
                    <input
                      type="number"
                      value={allocatedBudget}
                      readOnly
                      disabled
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-gray-100/90 cursor-not-allowed select-none focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form LF-01 Official Header & Cheque Details */}
          <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#0E4EBD]" />
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Form LF-01 Official Disbursement Header
                </h4>
              </div>
              <span className="text-[11px] text-gray-500">
                Official header information exported to STI Liquidation (Form LF-01)
              </span>
            </div>

            {/* Verified Disbursement Voucher Banner */}
            {activeDisbursementVoucher && (
              <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-white to-blue-50 border border-emerald-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-950 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileCheck className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div>
                    <span className="font-bold flex items-center gap-2">
                      Official Disbursement Voucher Verified
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-200/80 text-emerald-900 border border-emerald-300">
                        Check Attached
                      </span>
                    </span>
                    <p className="text-[11px] text-emerald-800 mt-0.5 font-mono">
                      Check #{activeDisbursementVoucher.chequeNumber || 'N/A'} • Released: {activeDisbursementVoucher.disbursementDate || 'N/A'} • ₱{formatCurrency(activeDisbursementVoucher.amountDisbursed || 0)} (Uploaded by {activeDisbursementVoucher.uploadedByName})
                    </p>
                  </div>
                </div>
                <a
                  href={activeDisbursementVoucher.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Voucher</span>
                </a>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Disbursing Employee Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Disbursing Employee Name <span className="text-red-500">*</span>
                  </label>
                  {detectedAdviserName && (
                    <button
                      type="button"
                      onClick={handleResetEmployeeName}
                      className="text-[10px] text-[#0E4EBD] hover:underline flex items-center gap-0.5 cursor-pointer"
                      title="Reset to detected default"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Reset
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={employeeName}
                  disabled={isEffectiveReadOnly}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Enter employee / adviser name"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                />
                <div className="mt-1 flex items-center gap-1 text-[10px]">
                  {detectedEmployeeSource === 'club_adviser' ? (
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      🎓 Club Adviser Detected
                    </span>
                  ) : (
                    <span className="text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      🏛️ SAS Administration Detected
                    </span>
                  )}
                </div>
              </div>

              {/* Cheque Number (Manually inputted, no default value) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Cheque Number <span className="text-gray-400 font-normal">(Manual Input)</span>
                </label>
                <input
                  type="text"
                  value={chequeNumber}
                  disabled={isEffectiveReadOnly}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  placeholder="Enter Cheque / Check No."
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Enter official cheque number issued for this disbursement
                </span>
              </div>

              {/* Date Released */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Date Released <span className="text-gray-400 font-normal">(Disbursement)</span>
                </label>
                <input
                  type="date"
                  value={dateReleased}
                  disabled={isEffectiveReadOnly}
                  max={todayStr}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val > todayStr) {
                      toast.error('Date Released cannot be in the future. Please select today or an earlier date.');
                      setDateReleased(todayStr);
                    } else {
                      setDateReleased(val);
                    }
                  }}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none font-mono"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Date funds or cheque was released
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
              {/* Date of Activity End */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Date of Activity End <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={activityEndDate}
                  disabled={isEffectiveReadOnly}
                  onChange={(e) => handleActivityEndDateChange(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  End date of scheduled sessions
                </span>
              </div>

              {/* Deadline for Submission (+15 days) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Liquidation Deadline <span className="text-xs text-blue-600">(+15 Days)</span>
                </label>
                <input
                  type="date"
                  value={submissionDeadline}
                  disabled={isEffectiveReadOnly}
                  onChange={(e) => setSubmissionDeadline(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Standard 15-day liquidation policy
                </span>
              </div>

              {/* Date Submitted */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Date Submitted
                </label>
                <input
                  type="date"
                  value={dateSubmitted}
                  disabled={isEffectiveReadOnly}
                  onChange={(e) => handleDateSubmittedChange(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Defaults to today
                </span>
              </div>

              {/* No. of Days Lapse */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  No. of Days Lapse
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={daysLapsed}
                    disabled={isEffectiveReadOnly}
                    onChange={(e) => setDaysLapsed(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-bold font-mono bg-gray-50"
                  />
                  <span
                    className={`px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap ${
                      daysLapsed === '-o-'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {daysLapsed === '-o-' ? 'Compliant' : 'Lapsed'}
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Auto-calculated from deadline
                </span>
              </div>
            </div>
          </div>

          {/* Live Financial Variance Summary Cards */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-2xs">
              <div className="text-xs text-gray-500 font-medium">Approved Budget</div>
              <div className="text-lg font-bold text-[#001A4D] mt-1 font-mono">{formatCurrency(allocatedBudget)}</div>
            </div>

            <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-2xs">
              <div className="text-xs text-gray-500 font-medium">Total Actual Spendings</div>
              <div className="text-lg font-bold text-[#0E4EBD] mt-1 font-mono">{formatCurrency(totalActualSpending)}</div>
            </div>

            <div
              className={`p-3 bg-white border rounded-lg shadow-2xs ${
                isDeficit ? 'border-red-200 bg-red-50/20' : 'border-green-200 bg-green-50/20'
              }`}
            >
              <div className="text-xs text-gray-500 font-medium">
                {isDeficit ? 'Net Deficit (Over Budget)' : 'Net Surplus (Remaining)'}
              </div>
              <div className={`text-lg font-bold mt-1 font-mono ${isDeficit ? 'text-red-600' : 'text-green-600'}`}>
                {formatVariance(surplusOrDeficit)}
              </div>
            </div>

            <div className="p-3 bg-white border border-gray-100 rounded-lg shadow-2xs">
              <div className="text-xs text-gray-500 font-medium">Receipts Attached</div>
              <div className="text-lg font-bold text-slate-800 mt-1 font-mono">
                {lineItems.filter((i) => (i.receiptFiles && i.receiptFiles.length > 0) || (i.receiptUrls && i.receiptUrls.length > 0) || i.receiptUrl).length}
              </div>
            </div>
          </div>

          {/* Tab Navigation: Expenses vs Signatory Pipeline */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveModalTab('expenses')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeModalTab === 'expenses'
                  ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>1. Line Items & Receipts</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeModalTab === 'expenses' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {lineItems.length}
              </span>
              {isLineItemsFlagged && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                  {hasItemLevelFlags
                    ? `${flaggedItemCount} ${flaggedItemCount === 1 ? 'Item Needs' : 'Items Need'} Revision`
                    : 'Needs Revision'}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveModalTab('signatories')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeModalTab === 'signatories'
                  ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>2. Signatory & Audit Route</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeModalTab === 'signatories' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {approvalChain.length} Signers
              </span>
              {isSignatoriesFlagged && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                  Needs Revision
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: Expenses & Receipts */}
          {activeModalTab === 'expenses' && (
            <div className="space-y-4">
              {isLineItemsFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      {hasItemLevelFlags
                        ? `Reviewer Revision Feedback — ${flaggedItemCount} Specific Line Item(s) Flagged`
                        : 'Reviewer Revision Feedback — Line Items & Receipts'}
                    </span>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {hasItemLevelFlags
                        ? 'Specific expense line items flagged for correction are highlighted in amber below with direct reviewer remarks.'
                        : (effectiveReport?.stepRevisionRemarks?.['sec_line_items'] ||
                          effectiveReport?.stepRevisionRemarks?.['sec_receipts'] ||
                          effectiveReport?.returnRemarks ||
                          'Please update the highlighted expense line items or attach valid receipts.')}
                    </p>
                  </div>
                </div>
              )}
{/* Horizontally Scrollable Category Tabs (Reference Guide) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#0E4EBD]" />
                    Proposed Budget Baseline Categories (Reference Guide)
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {categoriesList.length} Categories • Scroll sideways to switch
                  </span>
                </div>

                <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                  {categoriesList.map((cat) => {
                    const isSelected = cat.id === activeCategoryId;
                    const stats = categorySpendingMap.get(cat.title) || { baseline: cat.baselineAmount, spent: 0, receiptCount: 0 };
                    const rem = cat.baselineAmount - stats.spent;
                    const isOver = rem < 0;

                    const catItems = lineItems.filter((it) =>
                      cat.id === 'cat_other'
                        ? it.proposedItemId === 'cat_other' || (!it.proposedItemId && !proposedBaselineItems.some((p) => p.title === it.category))
                        : it.proposedItemId === cat.id || it.category === cat.title || it.proposedItemTitle === cat.title
                    );

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
                          <span className={`text-xs font-bold truncate max-w-[180px] ${isSelected ? 'text-white' : 'text-slate-900'}`} title={cat.title}>
                            {cat.title}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isSelected ? 'bg-white/20 text-[#FFD41C]' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 text-[11px] mt-1.5 pt-1.5 border-t border-current/10 font-mono">
                          <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                            {cat.baselineAmount > 0 ? formatCurrency(cat.baselineAmount) : 'General'}
                          </span>
                          {cat.baselineAmount > 0 && (
                            <span className={`font-bold ${
                              isSelected
                                ? isOver ? 'text-rose-300' : 'text-emerald-300'
                                : isOver ? 'text-rose-600' : 'text-emerald-700'
                            }`}>
                              {isOver ? `-${formatCurrency(Math.abs(rem))}` : `+${formatCurrency(rem)}`}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Category Header & Action Banner (No '+ Add Receipt to Category' button in cards) */}
              <div className="p-4 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#001A4D] text-[#FFD41C]">
                      Active Category
                    </span>
                    <h3 className="text-sm font-extrabold text-[#001A4D]">
                      {currentCategory?.title}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mt-1">
                    {currentCategory && currentCategory.baselineAmount > 0 ? (
                      <>
                        <span>Baseline Ceiling: <strong className="font-mono text-[#001A4D]">{formatCurrency(currentCategory.baselineAmount)}</strong></span>
                        <span>•</span>
                        <span>Total Spent in Category: <strong className="font-mono text-[#0E4EBD]">{formatCurrency(categorySpendingMap.get(currentCategory.title)?.spent || 0)}</strong></span>
                        <span>•</span>
                        {(() => {
                          const stats = categorySpendingMap.get(currentCategory.title) || { baseline: currentCategory.baselineAmount, spent: 0 };
                          const rem = stats.baseline - stats.spent;
                          const isOver = rem < 0;
                          return (
                            <span className={`font-bold font-mono ${isOver ? 'text-rose-600' : 'text-emerald-700'}`}>
                              {isOver ? `Over by ${formatCurrency(Math.abs(rem))}` : `Remaining: ${formatCurrency(rem)}`}
                            </span>
                          );
                        })()}
                      </>
                    ) : (
                      <span>Unplanned / General operational items</span>
                    )}
                  </div>
                </div>

                {!isEffectiveReadOnly && (
                  <button
                    type="button"
                    onClick={handleAddItemToCurrentCategory}
                    className="px-3.5 py-2 bg-[#0E4EBD] hover:bg-[#1E70E8] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Receipt</span>
                  </button>
                )}
              </div>

              {/* Items in Active Category (1-indexed per category) */}
              <div className="space-y-4">
                {currentCategoryItems.map((item, categoryItemIndex) => {
                  const realIndex = lineItems.findIndex((i) => i.id === item.id);
                  const attachedFiles = item.receiptFiles || [];
                  const { isFlagged: isThisItemFlagged, feedback: thisItemFeedback } = isExpenseItemFlagged(
                    item,
                    realIndex,
                    effectiveReport?.returnFlags,
                    effectiveReport?.stepRevisionRemarks,
                    hasLegacyLineItemFlags,
                    hasItemLevelFlags
                  );

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl space-y-3 relative group transition-all ${
                        isThisItemFlagged
                          ? 'border-2 border-amber-400 bg-amber-50/20 shadow-xs ring-1 ring-amber-300'
                          : 'border border-gray-200 bg-white shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-3.5 h-3.5 text-[#0E4EBD]" />
                          <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                            Receipt #{categoryItemIndex + 1}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            {currentCategory?.title}
                          </span>
                          {isThisItemFlagged && (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded flex items-center gap-1 animate-pulse">
                              <AlertCircle className="w-3 h-3 text-amber-700" />
                              Needs Revision
                            </span>
                          )}
                          {attachedFiles.length > 0 ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Receipt Attached ({attachedFiles.length})
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Receipt Proof Required
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold font-mono text-[#001A4D]">
                            {formatCurrency(item.totalCost || 0)}
                          </span>
                          {!isEffectiveReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCategoryItem(item.id)}
                              className="text-red-500 hover:text-red-700 p-1 cursor-pointer transition-colors"
                              title={currentCategoryItems.length > 1 ? "Remove receipt" : "Clear receipt fields"}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reviewer Item-Level Feedback Box */}
                      {isThisItemFlagged && (
                        <div className="p-3 bg-amber-50/90 border border-amber-300 rounded-lg text-xs space-y-1">
                          <div className="font-bold text-amber-900 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            Reviewer Feedback for Receipt #{categoryItemIndex + 1} ({item.description || 'Receipt'}):
                          </div>
                          <p className="text-amber-800 font-medium pl-2 border-l-2 border-amber-500 whitespace-pre-line leading-relaxed">
                            {thisItemFeedback || 'This receipt was flagged for revision. Please review its description, amount, or attached official receipts.'}
                          </p>
                        </div>
                      )}

                      {/* Pure Receipt Entry Inputs: Description, Store, OR#, and Amount */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Receipt Particulars / Description of Purchase <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            disabled={isEffectiveReadOnly}
                            onChange={(e) => handleLineItemChange(realIndex, 'description', e.target.value)}
                            placeholder="What was bought according to this receipt (e.g. 35 Pax Packed Lunch from Jollibee)"
                            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Store / Vendor Name
                            </label>
                            <input
                              type="text"
                              value={item.vendorName || ''}
                              disabled={isEffectiveReadOnly}
                              onChange={(e) => handleLineItemChange(realIndex, 'vendorName', e.target.value)}
                              placeholder="e.g. Jollibee Ormoc"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Official Receipt (OR) / Invoice No.
                            </label>
                            <input
                              type="text"
                              value={item.receiptNumber || ''}
                              disabled={isEffectiveReadOnly}
                              onChange={(e) => handleLineItemChange(realIndex, 'receiptNumber', e.target.value)}
                              placeholder="e.g. OR #10234"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#001A4D] mb-1">
                              Receipt Amount (₱) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">₱</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.totalCost || ''}
                                disabled={isEffectiveReadOnly}
                                onChange={(e) => handleReceiptAmountChange(realIndex, e.target.value)}
                                placeholder="0.00"
                                className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm font-bold text-[#001A4D] bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Multi-file Receipt Proof Attachments */}
                      <div className="pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-semibold text-gray-700">
                            Receipts &amp; Proof Documents ({attachedFiles.length})
                          </label>
                          <span className="text-[11px] text-gray-500">
                            Allowed: Images (PNG/JPG), PDF, Word, Excel/CSV, Text
                          </span>
                        </div>

                        {attachedFiles.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            {attachedFiles.map((file) => {
                              const isImg = file.fileType === 'image';
                              const isPdf = file.fileType === 'pdf';
                              const isSheet = file.fileType === 'spreadsheet';
                              const isDoc = file.fileType === 'document';

                              return (
                                <div
                                  key={file.id}
                                  className="flex items-center justify-between gap-2 p-2 bg-gray-50 hover:bg-gray-100/80 border border-gray-200 rounded-lg transition-colors group/file text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {isImg ? (
                                      <div className="w-7 h-7 rounded border border-gray-200 overflow-hidden bg-gray-200 flex-shrink-0 flex items-center justify-center">
                                        <img
                                          src={file.url}
                                          alt={file.name}
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                            (e.target as HTMLElement).style.display = 'none';
                                          }}
                                        />
                                      </div>
                                    ) : isPdf ? (
                                      <div className="w-7 h-7 rounded bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0 border border-red-200">
                                        <FileText className="w-4 h-4" />
                                      </div>
                                    ) : isSheet ? (
                                      <div className="w-7 h-7 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 border border-emerald-200">
                                        <FileSpreadsheet className="w-4 h-4" />
                                      </div>
                                    ) : isDoc ? (
                                      <div className="w-7 h-7 rounded bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-200">
                                        <FileText className="w-4 h-4" />
                                      </div>
                                    ) : (
                                      <div className="w-7 h-7 rounded bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0 border border-gray-200">
                                        <FileIcon className="w-4 h-4" />
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <div className="font-semibold text-gray-800 truncate" title={file.name}>
                                        {file.name}
                                      </div>
                                      <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                        <span className="uppercase">{file.fileType}</span>
                                        {file.size ? (
                                          <>
                                            <span>•</span>
                                            <span>{formatFileSize(file.size)}</span>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLightboxData({
                                          url: file.url,
                                          title: item.description || 'Receipt File',
                                          vendor: item.vendorName,
                                          amount: item.totalCost,
                                          fileName: file.name,
                                          fileType: file.fileType,
                                        })
                                      }
                                      className="p-1 text-gray-500 hover:text-[#0E4EBD] hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                      title="Preview Receipt"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>

                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1 text-gray-500 hover:text-[#0E4EBD] hover:bg-blue-50 rounded transition-colors"
                                      title="Open in new tab"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>

                                    {!isEffectiveReadOnly && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveReceiptFile(realIndex, file.id)}
                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                        title="Remove file"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {!isEffectiveReadOnly && (
                          <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 hover:border-[#1E70E8] rounded-xl hover:bg-blue-50/40 text-xs font-semibold text-gray-700 transition-colors">
                            {uploadingIndex === realIndex ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin text-[#0E4EBD]" />
                                <span className="text-[#0E4EBD]">Uploading files to secure storage...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 text-[#1E70E8]" />
                                <span>
                                  {attachedFiles.length > 0 ? '+ Upload Additional Receipts / Files' : 'Upload Receipt Files (Select multiple files)'}
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf"
                              disabled={uploadingIndex === realIndex}
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  handleReceiptUpload(realIndex, e.target.files);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cross-Tab Signatory Flag Notice on Tab 1 */}
              {isSignatoriesFlagged && (
                <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5 text-amber-950 font-medium">
                    <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-900 block">Signatory &amp; Audit Route Also Flagged for Revision</span>
                      <p className="text-amber-800 mt-0.5">
                        {signatoriesFeedback || 'The reviewer has requested changes to the signatory routing or approval chain.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModalTab('signatories')}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors flex-shrink-0 cursor-pointer shadow-xs text-xs whitespace-nowrap"
                  >
                    Go to Signatories Tab ➔
                  </button>
                </div>
              )}

              {/* Navigation Helper to Next Tab */}
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 text-blue-950 font-medium">
                  <ShieldCheck className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
                  <span>
                    Ready to set your reviewers? Configure your custom multi-stage approval route (Accountants, Program Heads, President) in the next tab.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('signatories')}
                  className="px-3.5 py-1.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-[#FFD41C] font-bold rounded-lg transition-colors flex-shrink-0 cursor-pointer shadow-xs text-xs"
                >
                  Configure Route ➔
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Dynamic Liquidation Signatory & Audit Route Builder */}
          {activeModalTab === 'signatories' && (
            <div className="space-y-4">
              {isSignatoriesFlagged && (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-amber-900 uppercase tracking-wider block mb-1">
                      Reviewer Revision Feedback — Signatory Route
                    </span>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {signatoriesFeedback ||
                        effectiveReport?.returnRemarks ||
                        'Please verify and adjust the signatory routing order.'}
                    </p>
                  </div>
                </div>
              )}

              <div
                className={`p-4 rounded-xl transition-all ${
                  isSignatoriesFlagged
                    ? 'border-2 border-amber-400 bg-amber-50/20 ring-1 ring-amber-300 shadow-xs'
                    : 'border border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Approval &amp; Endorsement Chain
                    </h4>
                    {isSignatoriesFlagged && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded flex items-center gap-1 animate-pulse">
                        <AlertCircle className="w-3 h-3 text-amber-700" />
                        Needs Revision
                      </span>
                    )}
                  </div>
                </div>

                {isOrgFunds ? (
                  <div className="p-4 bg-emerald-50/90 border border-emerald-300 rounded-2xl flex items-start gap-3.5 shadow-xs">
                    <div className="p-2 bg-emerald-100 rounded-xl text-emerald-800 shrink-0">
                      <Coins className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                        Organization Internal Funds — Direct SAS Approval
                      </h4>
                      <p className="text-xs text-emerald-900/90 leading-relaxed">
                        This liquidation is funded entirely from organization treasury funds. Institutional signatory pipelines (School Director, Academic Head, Assistant Principals) are not required. This document routes directly to <strong>Student Affairs & Services (SAS)</strong> for official institutional review, digital approval, and signature.
                      </p>
                    </div>
                  </div>
                ) : (
                  <LiquidationFlowBuilder
                    approvalChain={approvalChain}
                    onChange={setApprovalChain}
                    activeSignatories={activeSignatories}
                    orgId={orgId}
                    orgName={orgName}
                    allocatedBudget={allocatedBudget}
                    isSasCreator={isSasCreator}
                  />
                )}
              </div>

              {/* If report is already in review or concluded, show visual tracker */}
              {effectiveReport && effectiveReport.status !== 'draft' && (
                <div className="space-y-2 pt-4 border-t border-gray-200">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Live Progress Tracker
                  </h4>
                  <LiquidationSignatoryTracker
                    approvalChain={approvalChain}
                    currentStageIndex={effectiveReport?.currentStageIndex ?? 1}
                    liquidationStatus={effectiveReport?.status ?? 'draft'}
                  />
                </div>
              )}
            </div>
          )}

          {/* Officer Revision Summary Card (Mandatory on Resubmission) */}
          {isReturnedReport && (
            <div className="p-4 bg-amber-50/70 border-2 border-amber-300 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <RotateCcw className="w-4 h-4 text-amber-700" />
                <span>Officer Revision Summary (Required)</span>
              </div>
              <p className="text-xs text-amber-800">
                Summarize the modifications, recalculated amounts, or newly attached receipts you provided to address the reviewer feedback.
              </p>
              <textarea
                value={resubmissionNote}
                onChange={(e) => setResubmissionNote(e.target.value)}
                placeholder="e.g. Attached official BIR receipts for line items #2 and #4; updated unit costs as requested by the Accountant."
                rows={3}
                className="w-full text-xs p-3 border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
          )}
        </div>

        {/* Modal Footer with Lifecycle Submission Sync */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          {isEffectiveReadOnly ? (
            <>
              <div className="text-xs text-gray-500 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-gray-400" />
                <span>
                  {effectiveReport?.status === 'approved'
                    ? 'Report is approved and locked. You can preview or export Form LF-01.'
                    : 'Report is submitted and locked in read-only mode during signatory routing.'}
                </span>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export Report (Form LF-01)</span>
                </button>

                {effectiveReport && (currentStatus === 'under_review' || currentStatus === 'pending') && (
                  <button
                    type="button"
                    onClick={() => setShowWithdrawModal(true)}
                    disabled={isWithdrawing}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isWithdrawing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                    <span>Withdraw Submission</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs">
                {!isConcluded ? (
                  <div className="flex items-center gap-2 text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>
                      <strong>Event In Progress:</strong> You can add receipts and save drafts anytime. Submission to signatories unlocks once the event is concluded.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-900 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>
                      <strong>Event Concluded:</strong> Spendings and receipts are ready for official liquidation submission.
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                {/* Save Draft / Save Receipts is ALWAYS enabled */}
                <button
                  onClick={() => handleSave(false)}
                  disabled={isSubmitting}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    !isConcluded
                      ? 'bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C]'
                      : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
                  }`}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {!isConcluded ? 'Save Receipts & Draft' : 'Save Draft'}
                </button>

                {/* Submit Liquidation: Unlocked ONLY when event is concluded */}
                {isConcluded ? (
                  <div className="flex items-center gap-2">
                    {!effectiveIsAdviser && userRole !== 'admin' && (
                      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
                        <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        Adviser Required to Submit
                      </span>
                    )}
                    <button
                      onClick={() => handleSave(true)}
                      disabled={isSubmitting || (!effectiveIsAdviser && userRole !== 'admin')}
                      title={
                        !effectiveIsAdviser && userRole !== 'admin'
                          ? 'Only appointed Club Advisers can submit. You can prepare and save drafts.'
                          : undefined
                      }
                      className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-xs flex items-center gap-2 ${
                        !effectiveIsAdviser && userRole !== 'admin'
                          ? 'bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed'
                          : 'bg-[#001A4D] hover:bg-[#0E4EBD] text-white cursor-pointer'
                      }`}
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin text-[#FFD41C]" />}
                      {!effectiveIsAdviser && userRole !== 'admin' && <Lock className="w-4 h-4" />}
                      {isReturnedReport ? 'Resubmit Financial Liquidation' : 'Submit Liquidation'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Event has not yet concluded. Submission to signatories unlocks once the event is concluded."
                    className="px-4 py-2 bg-gray-200 text-gray-400 border border-gray-300 rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-not-allowed select-none"
                  >
                    <Lock className="w-4 h-4" />
                    Submit Liquidation (Locked)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lower Right Validation Snackbar (Matching APs) */}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-[#001A4D] border-l-4 border-red-500 text-white p-3.5 rounded-xl shadow-2xl flex items-start justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <div>
              <span className="font-bold block text-red-300">Validation Notice</span>
              <span className="text-white/90 leading-tight block mt-0.5">{error}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-white/60 hover:text-white p-1 rounded-md transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Withdraw Confirmation Modal */}
      {showWithdrawModal && effectiveReport && (
        <WithdrawConfirmModal
          isOpen={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          onConfirm={handleWithdraw}
          documentTitle={effectiveReport.eventTitle || 'Liquidation Report'}
          documentTypeLabel="Financial Liquidation"
        />
      )}

      {/* Export Report (Form LF-01) Preview Modal */}
      {showExportModal && exportReportTarget && (
        <LiquidationExportPreviewModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          report={exportReportTarget}
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

      {/* Inline Digital Signature Modal for Document Maker */}
      {isSignatureModalOpen && (
        <DigitalSignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          signatoryUid={userUid}
          signatoryName={userName}
          signatoryEmail={officerProfile?.email || ''}
          currentSignatureUrl={makerSignatureUrl}
          onSignatureSaved={(newUrl) => {
            setMakerSignatureUrl(newUrl);
            syncUserSignatureAcrossProfiles({
              uid: userUid,
              email: officerProfile?.email,
              name: userName,
              signatureUrl: newUrl,
              role: userRole,
            });
            const raw = localStorage.getItem('sti_sync_officer_session');
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                parsed.signatureUrl = newUrl;
                localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsed));
              } catch {}
            }
          }}
        />
      )}
    </div>
  );
}

