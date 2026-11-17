import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  Receipt,
  CheckCircle2,
  RotateCcw,
  Clock,
  FileText,
  Eye,
  AlertCircle,
  Loader2,
  Check,
  X,
  ExternalLink,
  FileSpreadsheet,
  Search,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  Edit3,
  Trash2,
  Shield,
  Undo2,
  Send,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useAllLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import { useSemesters, useActiveAcademicPeriods } from '../../modules/academic/hooks/useAcademicStream';
import { useAllEvents } from '../../modules/events/hooks/useEventStream';
import {
  approveLiquidationReport,
  returnLiquidationReport,
  deleteLiquidationReport,
  withdrawLiquidationReport,
  attachCashierSettlementProofs,
  verifyCashierSettlementProofs,
  absorbRemainingCollectionDeficit,
  resolveLiquidationSourceAllocations,
} from '../../modules/finance/services/liquidation.service';
import type {
  ProposalBucketAllocation,
  SurplusReturnAllocation,
  DeficitDeductionAllocation,
} from '../../modules/activity-proposals/types/proposal.types';
import {
  validateSurplusReturnAllocations,
  validateDeficitDeductionAllocations,
  rebalanceSurplusReturnAllocations,
} from '../../modules/activity-proposals/utils/proposal-calculations';
import { CashierProofUploader } from '../../modules/finance/components/CashierProofUploader';
import {
  DeficitCoverageAllocationPanel,
  buildDeficitSeedAndSupplementalOptions,
  type SupplementalBucketOption,
} from '../../modules/finance/components/DeficitCoverageAllocationPanel';
import { useMiscFeeConfigs } from '../../modules/finance/hooks/useMiscFeeStream';
import { useRetainedActivityFunds } from '../../modules/finance/hooks/useRetainedFundStream';
import { useOrgLedger } from '../../modules/finance/hooks/useFinanceStream';
import type { ReceiptAttachment } from '../../modules/finance/types/liquidation.types';
import ReceiptLightboxModal from '../../modules/finance/components/ReceiptLightboxModal';
import { LiquidationExportPreviewModal } from '../../modules/finance/components/LiquidationExportPreviewModal';
import LiquidationSignatoryTracker from '../../modules/finance/components/LiquidationSignatoryTracker';
import type { LiquidationStatus } from '../../modules/finance/types/liquidation.types';
import {
  buildLiquidationReturnSteps,
  type LiquidationDocument,
} from '../../modules/finance/types/liquidation.types';
import { useAdviserProfile } from '../../modules/auth/hooks/useAdviserProfile';
import { resolveApprovalPermissions } from '../../modules/workflow/utils/approval-permissions.utils';
import RevisionFeedbackBanner from '../../modules/workflow/components/RevisionFeedbackBanner';
import WithdrawConfirmModal from '../../modules/workflow/components/WithdrawConfirmModal';
import StepReturnRevisionModal from '../../modules/workflow/components/StepReturnRevisionModal';
import { formatCurrency, formatVariance } from '../../utils/currency';
import { formatAppDate, formatAppDateTime } from '../../utils/date';
import {
  isActivityConcluded,
  liquidationSubmissionDeadline,
  calendarDaysRemaining,
} from '../../modules/events/utils/activity-compliance.utils';
import { isEventLiquidationExempt } from '../../modules/events/utils/organization-display.utils';
import { toast } from 'sonner';
import { TablePagination } from '../../components/common/TablePagination';
import { TrashRepositoryViewer } from '../../modules/workflow/components/TrashRepositoryViewer';
import OfficerLiquidationModal from '../../officer/components/OfficerLiquidationModal';

const ITEMS_PER_PAGE = 8;
type TabValue = 'all' | 'pending' | 'approved' | 'returned' | 'draft' | 'trash';

function getLiquidationTimestamp(liq: LiquidationDocument): number {
  if (liq.createdAt) {
    if (typeof (liq.createdAt as any).toDate === 'function') return (liq.createdAt as any).toDate().getTime();
    if (typeof (liq.createdAt as any).seconds === 'number') return (liq.createdAt as any).seconds * 1000;
    const d = new Date(liq.createdAt as any);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (liq.updatedAt) {
    if (typeof (liq.updatedAt as any).toDate === 'function') return (liq.updatedAt as any).toDate().getTime();
    if (typeof (liq.updatedAt as any).seconds === 'number') return (liq.updatedAt as any).seconds * 1000;
    const d = new Date(liq.updatedAt as any);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

function formatSubmittedDate(dateVal?: any): string {
  if (!dateVal) return '—';
  let d: Date | null = null;
  if (typeof dateVal.toDate === 'function') d = dateVal.toDate();
  else if (typeof dateVal.seconds === 'number') d = new Date(dateVal.seconds * 1000);
  else d = new Date(dateVal);

  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function FinancialLiquidations() {
  const { liquidations, loading } = useAllLiquidations();
  const [searchParams] = useSearchParams();
  const targetId = searchParams.get('id') || searchParams.get('liquidationId');

  const [lightboxData, setLightboxData] = useState<{
    url: string;
    title: string;
    vendor?: string;
    amount?: number;
    fileName?: string;
    fileType?: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [selectedReport, setSelectedReport] = useState<LiquidationDocument | null>(null);
  const [deletingReport, setDeletingReport] = useState<LiquidationDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportReport, setExportReport] = useState<LiquidationDocument | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showApproveConfirmModal, setShowApproveConfirmModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cashierProofDrafts, setCashierProofDrafts] = useState<ReceiptAttachment[]>([]);
  const [cashierRefDraft, setCashierRefDraft] = useState('');
  const [savingCashierProof, setSavingCashierProof] = useState(false);
  const [sourceAllocations, setSourceAllocations] = useState<ProposalBucketAllocation[]>([]);
  const [returnAllocationRows, setReturnAllocationRows] = useState<SurplusReturnAllocation[]>([]);
  const [deficitAllocationRows, setDeficitAllocationRows] = useState<DeficitDeductionAllocation[]>([]);
  const [deficitSupplementalOptions, setDeficitSupplementalOptions] = useState<SupplementalBucketOption[]>([]);
  const [collectionAbsorbRows, setCollectionAbsorbRows] = useState<DeficitDeductionAllocation[]>([]);
  const [collectionAbsorbOptions, setCollectionAbsorbOptions] = useState<SupplementalBucketOption[]>([]);
  const [absorbNoteDraft, setAbsorbNoteDraft] = useState('');
  const [isAbsorbingDeficit, setIsAbsorbingDeficit] = useState(false);

  const { activeConfig, computedBuckets, saoEligibleBuckets } = useMiscFeeConfigs();
  const { saoRetainedFund, orgRetainedFunds } = useRetainedActivityFunds(
    selectedReport?.organizationId || null,
    (selectedReport as any)?.schoolYear || activeConfig?.schoolYear
  );
  const { data: selectedOrgLedger = [] } = useOrgLedger(selectedReport?.organizationId || null);

  const selectedOrgLedgerBalance = useMemo(() => {
    if (!selectedOrgLedger || selectedOrgLedger.length === 0) return 0;
    const inc = selectedOrgLedger
      .filter((t) => String(t.type || '').toLowerCase() === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const exp = selectedOrgLedger
      .filter((t) => String(t.type || '').toLowerCase() === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return Math.max(0, inc - exp);
  }, [selectedOrgLedger]);

  const selectedReportRawVariance = useMemo(() => {
    if (!selectedReport) return 0;
    return (
      Number(
        selectedReport.surplusOrDeficit ??
          ((selectedReport.allocatedBudget ?? 0) - (selectedReport.totalActualSpending ?? 0))
      ) || 0
    );
  }, [selectedReport]);

  const selectedReportSurplus = Math.max(0, selectedReportRawVariance);
  const selectedReportDeficit = Math.max(0, -selectedReportRawVariance);
  const selectedCollectionDeficit = Math.max(
    0,
    Number((selectedReport as any)?.collectionDeficitAmount || 0)
  );
  const isRecoveringStudentContribution = Boolean(
    selectedReport &&
      (selectedReport as any).fundingSource === 'student_contributions' &&
      (selectedReport as any).collectionSettlementStatus === 'deficit_recovering' &&
      selectedCollectionDeficit > 0.009
  );

  useEffect(() => {
    let active = true;
    if (selectedReport) {
      setCashierProofDrafts(selectedReport.cashierSettlementProofs || []);
      setCashierRefDraft(selectedReport.cashierReferenceNo || '');
      setActionError(null);

      resolveLiquidationSourceAllocations(selectedReport)
        .then((allocs) => {
          if (!active) return;
          setSourceAllocations(allocs);
          const variance =
            Number(
              selectedReport.surplusOrDeficit ??
                ((selectedReport.allocatedBudget ?? 0) - (selectedReport.totalActualSpending ?? 0))
            ) || 0;
          const surplus = Math.max(0, variance);
          const deficit = Math.max(0, -variance);

          const savedReturns = Array.isArray(selectedReport.surplusReturnAllocations)
            ? selectedReport.surplusReturnAllocations
            : [];
          const repOrgLower = String(selectedReport.organizationId || '').trim().toLowerCase();
          const isSasOwner =
            selectedReport.fundingSource !== 'organization_funds' &&
            (!repOrgLower ||
              ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(repOrgLower) ||
              (selectedReport as any)?.createdByRole === 'admin');
          if (savedReturns.length > 0) {
            setReturnAllocationRows(savedReturns);
          } else if (allocs.length === 1) {
            const only = allocs[0];
            const isSasContribBucket =
              isSasOwner &&
              (only.fundType === 'student_contributions' ||
                only.fundType === 'student_contribution_retained' ||
                only.bucketId === 'CONTRIB_NEW' ||
                only.bucketId === 'SAO_CAMPUS');
            setReturnAllocationRows([
              {
                bucketId: isSasContribBucket ? 'SAO_CAMPUS' : only.bucketId,
                bucketName: isSasContribBucket
                  ? 'SAS Student Contribution & Retained Funds'
                  : only.bucketName,
                fundType: only.fundType,
                originalAllocatedAmount: Number(only.allocatedAmount ?? selectedReport.allocatedBudget ?? 0),
                returnAmount: Math.round(surplus * 100) / 100,
              },
            ]);
          } else if (allocs.length >= 2) {
            const baseRows: SurplusReturnAllocation[] = allocs.map((a) => ({
              bucketId:
                isSasOwner && (a.fundType === 'student_contributions' || a.bucketId === 'CONTRIB_NEW')
                  ? 'SAO_CAMPUS'
                  : a.bucketId,
              bucketName:
                isSasOwner && (a.fundType === 'student_contributions' || a.bucketId === 'CONTRIB_NEW')
                  ? 'SAS Student Contribution & Retained Funds'
                  : a.bucketName,
              fundType: a.fundType,
              originalAllocatedAmount: Number(a.allocatedAmount) || 0,
              returnAmount: 0,
            }));
            setReturnAllocationRows(
              rebalanceSurplusReturnAllocations({
                totalSurplus: surplus,
                rows: baseRows,
              })
            );
          } else {
            setReturnAllocationRows([]);
          }

          if (deficit > 0.009) {
            const { initialRows, supplementalOptions } = buildDeficitSeedAndSupplementalOptions({
              totalDeficit: deficit,
              sourceAllocations: allocs,
              savedDeficitRows: selectedReport.deficitDeductionAllocations || [],
              computedBuckets,
              saoEligibleBuckets,
              saoRetainedFund,
              orgRetainedFunds,
              targetOrgId: selectedReport.organizationId,
              targetOrgName: selectedReport.organizationName,
              orgLedgerBalance: selectedOrgLedgerBalance,
            });
            setDeficitAllocationRows(initialRows);
            setDeficitSupplementalOptions(supplementalOptions);
          } else {
            setDeficitAllocationRows([]);
            setDeficitSupplementalOptions([]);
          }
        })
        .catch(() => {
          if (active) {
            setSourceAllocations([]);
            setReturnAllocationRows([]);
            setDeficitAllocationRows([]);
            setDeficitSupplementalOptions([]);
          }
        });
    } else {
      setCashierProofDrafts([]);
      setCashierRefDraft('');
      setSourceAllocations([]);
      setReturnAllocationRows([]);
      setDeficitAllocationRows([]);
      setDeficitSupplementalOptions([]);
    }
    return () => {
      active = false;
    };
  }, [selectedReport?.id]);

  // Keep live bucket balances & supplemental choices synchronized while modal is open
  useEffect(() => {
    if (!selectedReport || selectedReportDeficit <= 0.009) return;
    const { initialRows, supplementalOptions } = buildDeficitSeedAndSupplementalOptions({
      totalDeficit: selectedReportDeficit,
      sourceAllocations,
      savedDeficitRows: selectedReport.deficitDeductionAllocations || [],
      computedBuckets,
      saoEligibleBuckets,
      saoRetainedFund,
      orgRetainedFunds,
      targetOrgId: selectedReport.organizationId,
      targetOrgName: selectedReport.organizationName,
      orgLedgerBalance: selectedOrgLedgerBalance,
    });
    setDeficitSupplementalOptions(supplementalOptions);
    setDeficitAllocationRows((prev) => {
      if (prev.length === 0) return initialRows;
      const availMap = new Map<string, number>();
      initialRows.forEach((r) => availMap.set(r.bucketId, r.availableBalance));
      supplementalOptions.forEach((o) => availMap.set(o.bucketId, o.availableBalance));
      const allZero = prev.every((r) => Number(r.deductAmount) === 0);
      if (allZero && !(selectedReport.deficitDeductionAllocations?.length)) {
        return initialRows;
      }
      return prev.map((r) => ({
        ...r,
        availableBalance: availMap.has(r.bucketId) ? availMap.get(r.bucketId)! : r.availableBalance,
      }));
    });
  }, [
    selectedReport?.id,
    selectedReportDeficit,
    sourceAllocations,
    computedBuckets,
    saoEligibleBuckets,
    saoRetainedFund,
    orgRetainedFunds,
    selectedOrgLedgerBalance,
  ]);

  const isSasSelectedLiquidation = useMemo(() => {
    if (!selectedReport) return false;
    if (selectedReport.fundingSource === 'organization_funds') return false;
    const orgLower = String(selectedReport.organizationId || '').trim().toLowerCase();
    return (
      !orgLower ||
      ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgLower) ||
      (selectedReport as any)?.createdByRole === 'admin'
    );
  }, [selectedReport]);

  const surplusReturnValidation = useMemo(() => {
    return validateSurplusReturnAllocations({
      totalSurplus: selectedReportSurplus,
      rows: returnAllocationRows,
      isSasEvent: isSasSelectedLiquidation,
    });
  }, [selectedReportSurplus, returnAllocationRows, isSasSelectedLiquidation]);

  const deficitCoverageValidation = useMemo(() => {
    return validateDeficitDeductionAllocations({
      totalDeficit: selectedReportDeficit,
      rows: deficitAllocationRows,
    });
  }, [selectedReportDeficit, deficitAllocationRows]);

  useEffect(() => {
    if (!selectedReport || !isRecoveringStudentContribution) {
      setCollectionAbsorbRows([]);
      setCollectionAbsorbOptions([]);
      return;
    }
    const { initialRows, supplementalOptions } = buildDeficitSeedAndSupplementalOptions({
      totalDeficit: selectedCollectionDeficit,
      sourceAllocations,
      savedDeficitRows: [],
      computedBuckets,
      saoEligibleBuckets,
      saoRetainedFund,
      orgRetainedFunds,
      targetOrgId: selectedReport.organizationId,
      targetOrgName: selectedReport.organizationName,
      orgLedgerBalance: selectedOrgLedgerBalance,
    });
    setCollectionAbsorbRows(initialRows);
    setCollectionAbsorbOptions(supplementalOptions);
  }, [
    selectedReport?.id,
    isRecoveringStudentContribution,
    selectedCollectionDeficit,
    sourceAllocations,
    computedBuckets,
    saoEligibleBuckets,
    saoRetainedFund,
    orgRetainedFunds,
    selectedOrgLedgerBalance,
  ]);

  const collectionAbsorbValidation = useMemo(() => {
    return validateDeficitDeductionAllocations({
      totalDeficit: selectedCollectionDeficit,
      rows: collectionAbsorbRows,
    });
  }, [selectedCollectionDeficit, collectionAbsorbRows]);

  const handleAutoProportionalSurplus = () => {
    if (returnAllocationRows.length < 2 || selectedReportSurplus <= 0) return;
    const totalOrig = returnAllocationRows.reduce(
      (s, r) => s + (Number(r.originalAllocatedAmount) || 0),
      0
    );
    let rem = Math.round(selectedReportSurplus * 100) / 100;
    const updated = returnAllocationRows.map((row, idx) => {
      const cap = Math.max(0, Number(row.originalAllocatedAmount) || 0);
      let share =
        idx === returnAllocationRows.length - 1
          ? Math.max(0, Math.round(rem * 100) / 100)
          : totalOrig > 0
            ? Math.round(selectedReportSurplus * (cap / totalOrig) * 100) / 100
            : Math.round((selectedReportSurplus / returnAllocationRows.length) * 100) / 100;
      if (cap > 0) share = Math.min(share, cap);
      rem = Math.round((rem - share) * 100) / 100;
      return { ...row, returnAmount: share };
    });
    setReturnAllocationRows(updated);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [filterOrg, setFilterOrg] = useState('all');
  const [filterSchoolYear, setFilterSchoolYear] = useState('all');
  const [filterSemester, setFilterSemester] = useState('all');
  const [hasInitializedPeriod, setHasInitializedPeriod] = useState(false);

  // Streams
  const { data: semesters = [] } = useSemesters();
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();
  const { events = [] } = useAllEvents();

  // Initialize filter to Current Active Semester
  useEffect(() => {
    if (!hasInitializedPeriod && (activeCollegePeriod || activeShsPeriod)) {
      const active = activeCollegePeriod || activeShsPeriod;
      if (active?.academicYear) setFilterSchoolYear(active.academicYear);
      if (active?.semester) setFilterSemester(active.semester);
      setHasInitializedPeriod(true);
    }
  }, [activeCollegePeriod, activeShsPeriod, hasInitializedPeriod]);

  // Derived available school years and semesters
  const availableSchoolYears = useMemo(() => {
    const set = new Set<string>();
    semesters.forEach((s) => { if (s.academicYear) set.add(s.academicYear); });
    liquidations.forEach((l) => { if (l.schoolYear) set.add(l.schoolYear); });
    events.forEach((e) => { if (e.schoolYear) set.add(e.schoolYear); });
    if (activeCollegePeriod?.academicYear) set.add(activeCollegePeriod.academicYear);
    return Array.from(set).sort().reverse();
  }, [semesters, liquidations, events, activeCollegePeriod]);

  const availableSemesters = useMemo(() => {
    const set = new Set<string>();
    semesters.forEach((s) => {
      const termName = s.semester || (s as any).term;
      if (termName) set.add(termName);
    });
    liquidations.forEach((l) => { if (l.semester) set.add(l.semester); });
    events.forEach((e) => {
      if (e.semester) set.add(e.semester);
      if ((e as any).term) set.add((e as any).term);
    });
    if (set.size === 0) {
      set.add('1st Semester');
      set.add('2nd Semester');
      set.add('1st Trimester');
      set.add('2nd Trimester');
      set.add('3rd Trimester');
      set.add('Summer');
    }
    return Array.from(set);
  }, [semesters, liquidations, events]);

  const { profile: adviserProfile } = useAdviserProfile();
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAdminCreateModal, setShowAdminCreateModal] = useState(false);
  const [editingReport, setEditingReport] = useState<LiquidationDocument | null>(null);

  const currentUser = useMemo(() => ({
    uid: adviserProfile?.uid || 'sao_admin_user',
    name: adviserProfile?.name || adviserProfile?.displayName || 'SAO Administrator',
    role: 'admin',
    organizationId: 'sao_admin',
    email: adviserProfile?.email || 'sao@ormoc.sti.edu.ph',
  }), [adviserProfile]);

  const permissions = useMemo(() => {
    return resolveApprovalPermissions(selectedReport, currentUser);
  }, [selectedReport, currentUser]);

  const handleOpenEditDraft = (report: LiquidationDocument) => {
    setSelectedReport(null);
    setEditingReport(report);
    setShowAdminCreateModal(true);
  };

  const handleWithdraw = async () => {
    if (!selectedReport) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      await withdrawLiquidationReport(selectedReport.id, currentUser.uid, currentUser.name);
      toast.success(`Liquidation report for "${selectedReport.eventTitle}" withdrawn to draft.`);
      const reportToEdit = selectedReport;
      setSelectedReport(null);
      handleOpenEditDraft({ ...reportToEdit, status: 'draft' });
    } catch (err: any) {
      console.error('[FinancialLiquidations] Withdraw failed:', err);
      setActionError(err?.message || 'Failed to withdraw liquidation report.');
      toast.error(err?.message || 'Failed to withdraw liquidation report.');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (targetId && liquidations.length > 0) {
      const found = liquidations.find((l) => l.id === targetId);
      if (found) {
        setSelectedReport(found);
      }
    }
  }, [targetId, liquidations]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['all', 'pending', 'approved', 'returned', 'draft'].includes(tabParam)) {
      setActiveTab(tabParam as TabValue);
      setCurrentPage(1);
    }
  }, [searchParams]);

  // Unique orgs list for filtering
  const orgList = useMemo(() => {
    const set = new Set<string>();
    liquidations.forEach((l) => {
      if (l.organizationName) set.add(l.organizationName);
    });
    return Array.from(set);
  }, [liquidations]);

  // Filtered & Sorted Liquidations (LATEST FIRST by default)
  const filteredLiquidations = useMemo(() => {
    return liquidations
      .filter((liq) => {
        if (activeTab === 'pending') {
          if (liq.status !== 'pending' && liq.status !== 'under_review') return false;
        } else if (activeTab !== 'all' && liq.status !== activeTab) {
          return false;
        }
        if (filterOrg !== 'all' && liq.organizationName !== filterOrg) return false;

        // School Year Filter
        if (filterSchoolYear !== 'all') {
          const parentEvent = liq.eventId ? events.find((e) => e.id === liq.eventId) : null;
          const sem = (liq.semesterId || parentEvent?.semesterId) ? semesters.find((s) => s.id === (liq.semesterId || parentEvent?.semesterId)) : null;
          const sy = liq.schoolYear || parentEvent?.schoolYear || sem?.academicYear;
          if (sy && sy !== filterSchoolYear) return false;
        }

        // Semester Filter
        if (filterSemester !== 'all') {
          const parentEvent = liq.eventId ? events.find((e) => e.id === liq.eventId) : null;
          const sem = (liq.semesterId || parentEvent?.semesterId) ? semesters.find((s) => s.id === (liq.semesterId || parentEvent?.semesterId)) : null;
          const term = liq.semester || parentEvent?.semester || (parentEvent as any)?.term || sem?.semester || (sem as any)?.term;
          if (term && term !== filterSemester) return false;
        }

        const q = searchQuery.toLowerCase().trim();
        if (q) {
          const eventMatch = (liq.eventTitle || '').toLowerCase().includes(q);
          const orgMatch = (liq.organizationName || '').toLowerCase().includes(q);
          const officerMatch = (liq.createdByName || '').toLowerCase().includes(q);
          const idMatch = (liq.id || '').toLowerCase().includes(q);
          if (!eventMatch && !orgMatch && !officerMatch && !idMatch) return false;
        }

        return true;
      })
      .sort((a, b) => getLiquidationTimestamp(b) - getLiquidationTimestamp(a));
  }, [liquidations, activeTab, filterOrg, filterSchoolYear, filterSemester, searchQuery, events, semesters]);

  // KPI calculations
  const pendingItems = useMemo(
    () => liquidations.filter((l) => l.status === 'pending' || l.status === 'under_review'),
    [liquidations]
  );
  const approvedItems = useMemo(() => liquidations.filter((l) => l.status === 'approved'), [liquidations]);
  const returnedItems = useMemo(() => liquidations.filter((l) => l.status === 'returned'), [liquidations]);
  const draftItems = useMemo(() => liquidations.filter((l) => l.status === 'draft'), [liquidations]);

  const pendingAmount = useMemo(() => {
    return pendingItems.reduce((sum, item) => sum + (item.totalActualSpending || item.allocatedBudget || 0), 0);
  }, [pendingItems]);

  const approvedAmount = useMemo(() => {
    return approvedItems.reduce((sum, item) => sum + (item.totalActualSpending || item.allocatedBudget || 0), 0);
  }, [approvedItems]);

  const eventsById = useMemo(() => {
    const map = new Map<string, any>();
    events.forEach((e) => map.set(e.id, e));
    return map;
  }, [events]);

  const pendingFlDues = useMemo(() => {
    return events
      .filter((e) => !e.isDeleted && isActivityConcluded(e) && !isEventLiquidationExempt(e))
      .map((e) => {
        const liq = liquidations.find(
          (l) => !l.isDeleted && l.status !== 'voided' && l.eventId === e.id
        );
        if (liq && !['draft', 'returned'].includes(liq.status)) return null;
        const deadline = liquidationSubmissionDeadline(e, liq);
        const daysRemaining = deadline ? calendarDaysRemaining(deadline) : null;
        return {
          event: e,
          liq,
          deadline,
          daysRemaining,
          isOverdue: daysRemaining !== null && daysRemaining < 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));
  }, [events, liquidations]);

  const pendingCount = pendingItems.length;
  const approvedCount = approvedItems.length;
  const returnedCount = returnedItems.length;
  const draftCount = draftItems.length;
  const allCount = liquidations.length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLiquidations.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLiquidations.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLiquidations, currentPage]);

  const handleTabChange = (tab: TabValue) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterOrg, filterSchoolYear, filterSemester]);

  const handleApprove = async () => {
    if (!selectedReport) return;
    setIsProcessing(true);
    setActionError(null);
    const isReleaseAction =
      (selectedReport as any).fundingSource !== 'organization_funds' &&
      (selectedReport as any).isPendingSasVetting === true;
    try {
      await approveLiquidationReport(
        selectedReport.id,
        currentUser.uid || 'sao_admin_user',
        reviewRemarks,
        selectedReport,
        {
          reviewerName: currentUser.name,
        }
      );
      if (!isReleaseAction && Math.abs(selectedReportRawVariance) >= 0.01) {
        toast.success(
          `Liquidation for "${selectedReport.eventTitle}" approved! Configure bucket settlement below.`
        );
        setSelectedReport({
          ...selectedReport,
          status: 'approved',
          isPendingSasVetting: false,
          cashierSettlementStatus: 'pending_proof',
        });
      } else {
        toast.success(
          isReleaseAction
            ? `Liquidation for "${selectedReport.eventTitle}" released to signatories.`
            : `Liquidation report for "${selectedReport.eventTitle}" approved.`
        );
        setSelectedReport(null);
      }
      setReviewRemarks('');
    } catch (err: any) {
      console.error('[FinancialLiquidations] Approve failed:', err);
      const errMsg = err?.message || 'Failed to approve liquidation report.';
      setActionError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReturnSubmit = async (payload: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRevisionRemarks: Record<string, string>;
    returnDeadline: string;
  }) => {
    if (!selectedReport) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      await returnLiquidationReport(
        selectedReport.id,
        profile?.uid || 'sao_admin_user',
        payload.overallRemarks,
        profile?.displayName || 'SAS Adviser',
        'Student Affairs & Services Head',
        profile?.email,
        payload.stepRevisionRemarks,
        payload.flaggedSteps,
        payload.returnDeadline
      );
      toast.info(`Liquidation report returned for revision with section-by-section instructions.`);
      setShowReturnModal(false);
      setSelectedReport(null);
      setReviewRemarks('');
    } catch (err: any) {
      console.error('[FinancialLiquidations] Return failed:', err);
      setActionError(err?.message || 'Failed to return liquidation report.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportAllCSV = () => {
    if (filteredLiquidations.length === 0) {
      toast.info(`No ${activeTab === 'all' ? '' : activeTab + ' '}liquidation reports to export.`);
      return;
    }
    const headers = ['Report/Event', 'Organization', 'Submitted By', 'Actual Expenses', 'Allocated Budget', 'Variance', 'Receipts Count', 'Submitted Date', 'Status'];
    const rows = filteredLiquidations.map((l) => [
      `"${(l.eventTitle || '').replace(/"/g, '""')}"`,
      `"${(l.organizationName || '').replace(/"/g, '""')}"`,
      `"${(l.createdByName || '').replace(/"/g, '""')}"`,
      `"${l.totalActualSpending || 0}"`,
      `"${l.allocatedBudget || 0}"`,
      `"${l.surplusOrDeficit || 0}"`,
      `"${l.lineItems?.length || 0}"`,
      `"${formatSubmittedDate(l.createdAt)}"`,
      `"${l.status || 'pending'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `STI_Sync_Liquidations_${activeTab.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredLiquidations.length} ${activeTab === 'all' ? '' : activeTab + ' '}liquidation report(s) to CSV.`);
  };

  const renderStatusBadge = (status: LiquidationStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Under Review
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Pending Review
          </span>
        );
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Returned
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Draft
          </span>
        );
    }
  };

  const getOrgInitials = (name?: string) => {
    if (!name) return 'ORG';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const renderSurplusRoutingContent = (readOnlyMode: boolean, contextLabel: 'pre_approval' | 'post_approval') => {
    if (!selectedReport || selectedReportSurplus <= 0.009 || sourceAllocations.length === 0) {
      return null;
    }

    const actionNoun = contextLabel === 'post_approval' ? 'settling' : 'approving';

    return (
      <div className="space-y-3">
        {sourceAllocations.length === 1 ? (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-emerald-950 text-xs uppercase tracking-wider">
                  Surplus Return Allocation (Single Source Bucket)
                </h4>
                <p className="text-xs text-emerald-800 mt-0.5">
                  100% of unspent surplus (
                  <strong className="font-mono">{formatCurrency(selectedReportSurplus)}</strong>
                  ) returns automatically to <strong>{sourceAllocations[0].bucketName}</strong>.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-600 text-white">
                Auto-Selected • No Manual Input
              </span>
            </div>

            {sourceAllocations[0].fundType !== 'misc_fee' && !isSasSelectedLiquidation && (
              <div className="p-3 rounded-xl bg-white/80 border border-emerald-200 text-xs text-emerald-900">
                <strong>No Cashier Return Receipt needed</strong> — this surplus returns directly to{' '}
                <strong>{sourceAllocations[0].bucketName}</strong> (Club Treasury).
              </div>
            )}
            {isSasSelectedLiquidation &&
              (sourceAllocations[0].fundType === 'student_contributions' ||
                sourceAllocations[0].fundType === 'student_contribution_retained') && (
              <div className="p-3 rounded-xl bg-white/80 border border-emerald-200 text-xs text-emerald-900">
                <strong>Destination: SAS Student Contribution &amp; Retained Funds</strong> — attach the return proof below to credit the{' '}
                <strong className="font-mono">{formatCurrency(selectedReportSurplus)}</strong> unspent surplus into SAS Retained Funds.
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-[#001A4D] text-xs uppercase tracking-wider">
                  Surplus Return Allocation (Multi-Bucket Split)
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Auto-populated to match{' '}
                  <strong className="font-mono text-[#001A4D]">
                    {formatCurrency(selectedReportSurplus)}
                  </strong>{' '}
                  unspent surplus. Adjusting one bucket automatically fills the remainder across the other bucket(s).
                </p>
              </div>
              {!readOnlyMode && (
                <button
                  type="button"
                  onClick={() =>
                    setReturnAllocationRows(
                      rebalanceSurplusReturnAllocations({
                        totalSurplus: selectedReportSurplus,
                        rows: returnAllocationRows,
                      })
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-[11px] font-bold text-[#001A4D] hover:bg-blue-50 cursor-pointer"
                >
                  Auto-Proportional Split
                </button>
              )}
            </div>

            <div className="space-y-2">
              {returnAllocationRows.map((row) => {
                const rowErr = surplusReturnValidation.perBucketErrors[row.bucketId];
                return (
                  <div
                    key={row.bucketId}
                    className={`p-3 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      rowErr ? 'border-rose-400 ring-1 ring-rose-300' : 'border-gray-200'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#001A4D] truncate">
                          {row.bucketName}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {row.fundType === 'misc_fee'
                            ? 'Misc Fee'
                            : row.fundType === 'org_treasury'
                              ? 'Org Treasury'
                              : 'Retained Fund'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-mono">
                        Originally Pulled: <strong>{formatCurrency(row.originalAllocatedAmount)}</strong>
                      </p>
                      {rowErr && <p className="text-[11px] font-semibold text-rose-600">{rowErr}</p>}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-[11px] font-bold text-gray-700 whitespace-nowrap">
                        Return Amount (₱):
                      </label>
                      {readOnlyMode ? (
                        <span className="font-mono font-bold text-xs text-emerald-900 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                          +{formatCurrency(row.returnAmount)}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          max={row.originalAllocatedAmount > 0 ? row.originalAllocatedAmount : selectedReportSurplus}
                          step="0.01"
                          value={row.returnAmount}
                          onChange={(e) => {
                            const val =
                              e.target.value === ''
                                ? 0
                                : Math.max(0, parseFloat(e.target.value) || 0);
                            setReturnAllocationRows((prev) =>
                              rebalanceSurplusReturnAllocations({
                                totalSurplus: selectedReportSurplus,
                                rows: prev,
                                editedBucketId: row.bucketId,
                                editedAmount: val,
                              })
                            );
                          }}
                          className={`w-36 px-2.5 py-1.5 border rounded-lg text-xs text-right font-mono font-bold outline-none ${
                            rowErr
                              ? 'border-rose-400 bg-rose-50 text-rose-900'
                              : 'border-blue-300 bg-white text-[#001A4D]'
                          }`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                surplusReturnValidation.isValid
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex flex-wrap items-center gap-4 font-mono">
                <span>
                  Total Surplus: <strong>{formatCurrency(selectedReportSurplus)}</strong>
                </span>
                <span>
                  Total Assigned: <strong>{formatCurrency(surplusReturnValidation.totalReturned)}</strong>
                </span>
                <span>
                  Remaining: <strong>{formatCurrency(surplusReturnValidation.remainingSurplusToAssign)}</strong>
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  surplusReturnValidation.isValid
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {surplusReturnValidation.isValid ? 'Exact Match' : 'Split Required'}
              </span>
            </div>

            {surplusReturnValidation.summaryError && (
              <p className="text-xs font-semibold text-rose-700">
                {surplusReturnValidation.summaryError}
              </p>
            )}

            {!surplusReturnValidation.requiresCashierReceipt && surplusReturnValidation.isValid && (
              <div className="p-3 rounded-xl bg-white/80 border border-emerald-200 text-xs text-emerald-900">
                <strong>No Cashier Return Receipt needed</strong> — all assigned return amounts go to non-Miscellaneous fund bucket(s).
              </div>
            )}
          </div>
        )}

        {(surplusReturnValidation.requiresCashierReceipt ||
          (sourceAllocations.length === 1 && sourceAllocations[0].fundType === 'misc_fee') ||
          (isSasSelectedLiquidation &&
            sourceAllocations.some(
              (a) =>
                a.fundType === 'student_contributions' ||
                a.fundType === 'student_contribution_retained'
            )) ||
          cashierProofDrafts.length > 0) && (
          <div className="space-y-2">
            <CashierProofUploader
              proofs={cashierProofDrafts}
              onChange={setCashierProofDrafts}
              cashierReferenceNo={cashierRefDraft}
              onReferenceNoChange={setCashierRefDraft}
              folderKey={selectedReport.id}
              disabled={isProcessing || savingCashierProof}
              readOnly={readOnlyMode}
              title={`Required Return Proof / Receipt (${formatCurrency(selectedReportSurplus)})`}
              description={
                isSasSelectedLiquidation &&
                sourceAllocations.some(
                  (a) =>
                    a.fundType === 'student_contributions' ||
                    a.fundType === 'student_contribution_retained'
                )
                  ? `Required before ${actionNoun} to prove the unspent money was returned into SAS Student Contribution & Retained Funds.`
                  : `Required before ${actionNoun} because unspent surplus returns to Miscellaneous Fee bucket(s).`
              }
            />
            {!readOnlyMode &&
              (surplusReturnValidation.requiresCashierReceipt ||
                (sourceAllocations.length === 1 && sourceAllocations[0].fundType === 'misc_fee')) &&
              cashierProofDrafts.length === 0 && (
                <p className="text-xs font-bold text-rose-700">
                  {isSasSelectedLiquidation &&
                  sourceAllocations.some(
                    (a) =>
                      a.fundType === 'student_contributions' ||
                      a.fundType === 'student_contribution_retained'
                  )
                    ? `Return Proof / Receipt required before ${actionNoun} so the unspent surplus credits SAS Student Contribution & Retained Funds.`
                    : `Cashier Return Receipt required before ${actionNoun} because a Miscellaneous Fee bucket receives a return amount > ₱0.00.`}
                </p>
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 w-full">
      {/* ── Header ── */}
      {/* ── Subtitle ── */}
      <div>
        <p className="text-gray-500 text-sm font-medium">
          Review and process liquidation reports from student organizations
        </p>
      </div>

      {/* ── Top 3 KPI Summary Cards (Matching Reference) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Pending Amount */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Pending Amount</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">
              {formatCurrency(pendingAmount)}
            </div>
            <div className="text-[11px] text-amber-700 font-medium">
              {pendingCount} report{pendingCount === 1 ? '' : 's'} awaiting review
            </div>
          </div>
        </div>

        {/* Card 2: Approved This Period */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Approved This Period</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">
              {formatCurrency(approvedAmount)}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium">
              {approvedCount} approved liquidation{approvedCount === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {/* Card 3: Returned for Revision */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 flex-shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Returned for Revision</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">
              {returnedCount} {returnedCount === 1 ? 'report' : 'reports'}
            </div>
            <div className="text-[11px] text-red-700 font-medium">
              Requires officer resubmission
            </div>
          </div>
        </div>
      </div>

      {/* ── 15-Day Post-Conclusion FL Dues Tracker ── */}
      {pendingFlDues.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>15-Day Financial Liquidation Dues ({pendingFlDues.length})</span>
            </div>
            <span className="text-[11px] text-amber-800 font-medium">
              Counted 15 calendar days after event conclusion
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingFlDues.slice(0, 8).map((due) => (
              <div
                key={due.event.id}
                className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 bg-white ${
                  due.isOverdue ? 'border-rose-300' : 'border-amber-200'
                }`}
              >
                <span className="font-bold text-[#001A4D] truncate max-w-[200px]">
                  {due.event.title}
                </span>
                <span
                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    due.isOverdue
                      ? 'bg-rose-100 text-rose-800'
                      : due.daysRemaining !== null && due.daysRemaining <= 3
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-blue-50 text-[#001A4D]'
                  }`}
                >
                  {due.deadline ? `Due ${formatAppDate(due.deadline)}` : 'Due'}{' '}
                  {due.daysRemaining !== null
                    ? due.isOverdue
                      ? `(${Math.abs(due.daysRemaining)}d overdue)`
                      : `(${due.daysRemaining}d left)`
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Container: Tabs + Search/Export + Fixed Height Table + Pagination ── */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xs overflow-hidden">
        {/* Top Control Bar */}
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { key: 'all', label: 'All', count: allCount },
              { key: 'pending', label: 'Pending', count: pendingCount },
              { key: 'approved', label: 'Approved', count: approvedCount },
              { key: 'returned', label: 'Returned', count: returnedCount },
              { key: 'draft', label: 'Drafts', count: draftCount },
              { key: 'trash', label: 'Trash', count: undefined },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key as TabValue)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${isActive
                      ? 'bg-[#001A4D] text-white shadow-xs'
                      : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900'
                    }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                        }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/10 focus:border-[#001A4D]"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${showFilters || filterOrg !== 'all' || filterSchoolYear !== (activeCollegePeriod?.academicYear || 'all') || filterSemester !== (activeCollegePeriod?.semester || 'all')
                  ? 'border-[#001A4D] bg-[#001A4D]/5 text-[#001A4D]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>

            {/* Export Button */}
            <button
              onClick={handleExportAllCSV}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Export filtered reports to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Filter Drawer */}
        {showFilters && (
          <div className="p-4 bg-gray-50/60 border-b border-gray-200 flex flex-wrap items-center gap-3 text-xs">
            {/* School Year Filter */}
            <div>
              <span className="text-gray-500 font-semibold mr-1.5">School Year:</span>
              <select
                value={filterSchoolYear}
                onChange={(e) => setFilterSchoolYear(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="all">All School Years</option>
                {availableSchoolYears.map((sy) => (
                  <option key={sy} value={sy}>
                    A.Y. {sy} {activeCollegePeriod?.academicYear === sy ? '• Current SY' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Filter */}
            <div>
              <span className="text-gray-500 font-semibold mr-1.5">Semester:</span>
              <select
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="all">All Semesters</option>
                {availableSemesters.map((term) => (
                  <option key={term} value={term}>
                    {term} {activeCollegePeriod?.semester === term ? '• Active Term' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-gray-500 font-semibold mr-1.5">Organization:</span>
              <select
                value={filterOrg}
                onChange={(e) => setFilterOrg(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#001A4D]"
              >
                <option value="all">All Organizations</option>
                {orgList.map((orgName) => (
                  <option key={orgName} value={orgName}>
                    {orgName}
                  </option>
                ))}
              </select>
            </div>

            {(filterOrg !== 'all' || filterSchoolYear !== (activeCollegePeriod?.academicYear || 'all') || filterSemester !== (activeCollegePeriod?.semester || 'all')) && (
              <button
                onClick={() => {
                  setFilterOrg('all');
                  setFilterSchoolYear(activeCollegePeriod?.academicYear || 'all');
                  setFilterSemester(activeCollegePeriod?.semester || 'all');
                }}
                className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to Current Semester
              </button>
            )}
          </div>
        )}

        {activeTab === 'trash' ? (
          <div className="p-4">
            <TrashRepositoryViewer
              collectionName="liquidations"
              documentTypeLabel="Financial Liquidations"
              isSasAdmin={true}
              currentUser={{
                uid: adviserProfile?.uid || 'sao_admin',
                name: adviserProfile?.displayName || 'SAO Adviser',
                role: 'admin',
              }}
            />
          </div>
        ) : (
          <>
            {/* ── Table Container (No inner vertical scroll) ── */}
            <div className="overflow-x-auto relative">
              {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Loading liquidations...
            </div>
          ) : filteredLiquidations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
              <Receipt className="w-12 h-12 text-gray-300 mx-auto" />
              <div className="font-bold text-gray-700 text-sm">No liquidation reports found</div>
              <p className="text-xs text-gray-400 max-w-sm">
                No liquidation reports match the active filter or search query.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50/90 text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-200 sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  <th className="py-3 px-4">Report / Organization</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Expenses</th>
                  <th className="py-3 px-4">Allocated</th>
                  <th className="py-3 px-4">Variance</th>
                  <th className="py-3 px-4">Receipts</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-normal">
                {paginatedItems.map((liq) => {
                  const isReturned = liq.status === 'returned';
                  const isPending = liq.status === 'pending';
                  const isApproved = liq.status === 'approved';

                  const allocated = liq.allocatedBudget || 0;
                  const spent = liq.totalActualSpending || 0;
                  const variance = (liq.surplusOrDeficit !== undefined) ? liq.surplusOrDeficit : (allocated - spent);
                  const isDeficit = variance < 0;

                  // Utilization percentage
                  const utilPct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 100;
                  const isOverBudget = spent > allocated && allocated > 0;

                  const orgInitials = getOrgInitials(liq.organizationName);

                  return (
                    <tr key={liq.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Report & Org */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#001A4D] text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
                            {orgInitials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 text-sm leading-snug truncate">
                              {liq.eventTitle || 'Liquidation Report'}
                            </div>
                            <div className="text-[11px] text-gray-500 font-medium truncate">
                              {liq.organizationName || 'Student Org'}
                            </div>
                            {isReturned && liq.returnRemarks && (
                              <div className="text-[11px] text-red-600 font-medium truncate mt-0.5">
                                {liq.returnRemarks}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Event Title */}
                      <td className="py-3.5 px-4 max-w-[180px]">
                        <div className="font-medium text-gray-800 text-xs truncate">
                          {liq.eventTitle}
                        </div>
                      </td>

                      {/* Expenses + Progress Bar */}
                      <td className="py-3.5 px-4 whitespace-nowrap min-w-[130px]">
                        <div className="font-bold text-gray-900 text-sm">
                          {formatCurrency(spent)}
                        </div>
                        <div className="w-24 bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full transition-all ${isOverBudget ? 'bg-red-500' : 'bg-[#001A4D]'
                              }`}
                            style={{ width: `${utilPct}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                          {utilPct}% utilized
                        </div>
                      </td>

                      {/* Allocated */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-gray-700 text-xs">
                        {formatCurrency(allocated)}
                      </td>

                      {/* Variance */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className={`inline-flex items-center gap-1 font-bold text-xs ${isDeficit ? 'text-red-600' : 'text-emerald-700'
                          }`}>
                          {isDeficit ? (
                            <TrendingDown className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingUp className="w-3.5 h-3.5" />
                          )}
                          <span>{formatVariance(variance)}</span>
                        </div>
                      </td>

                      {/* Receipts */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-gray-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-gray-400" />
                          <span>{liq.lineItems?.length || 0}</span>
                        </div>
                      </td>

                      {/* Submitted Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-gray-500 text-xs">
                        <div>{formatSubmittedDate(liq.createdAt)}</div>
                        {(liq.status === 'draft' || isReturned) && (() => {
                          const flDead = liquidationSubmissionDeadline(eventsById.get(liq.eventId), liq);
                          if (!flDead) return null;
                          const rem = calendarDaysRemaining(flDead);
                          const ov = rem !== null && rem < 0;
                          return (
                            <div className={`text-[10px] font-bold mt-0.5 ${ov ? 'text-rose-600' : 'text-amber-700'}`}>
                              Due {formatAppDate(flDead)}{rem !== null ? (ov ? ` (${Math.abs(rem)}d overdue)` : ` (${rem}d left)`) : ''}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {renderStatusBadge(liq.status)}
                          {(liq as any).archivedRefNumber && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#0E4EBD] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200" title="Archived into EDMS">
                              <FileText className="w-2.5 h-2.5" />
                              {(liq as any).archivedRefNumber}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Inline Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {(() => {
                            const rowPerms = resolveApprovalPermissions(liq, currentUser);
                            return (
                              <>
                                {rowPerms.isOwner && (liq.status === 'draft' || liq.status === 'returned') && (
                                  <button
                                    onClick={() => handleOpenEditDraft(liq)}
                                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#001A4D] border border-blue-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title={liq.status === 'returned' ? 'Revise & Resubmit Liquidation' : 'Edit Draft Liquidation'}
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>{liq.status === 'returned' ? 'Revise' : 'Edit'}</span>
                                  </button>
                                )}

                                {rowPerms.isOwner && isPending && (
                                  <button
                                    onClick={() => {
                                      setSelectedReport(liq);
                                      setShowWithdrawModal(true);
                                    }}
                                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title="Withdraw your liquidation submission"
                                  >
                                    <RotateCcw className="w-3 h-3 text-amber-600" />
                                    <span>Withdraw</span>
                                  </button>
                                )}

                                {!rowPerms.isOwner && isPending && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedReport(liq);
                                        setReviewRemarks('');
                                        setActionError(null);
                                      }}
                                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      title="Approve this liquidation"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Approve</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setSelectedReport(liq);
                                        setReviewRemarks(liq.returnRemarks || '');
                                        setActionError(null);
                                      }}
                                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      title="Return for revision"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>Return</span>
                                    </button>
                                  </>
                                )}

                                {rowPerms.isOwner && (liq.status === 'draft' || liq.status === 'returned') && (
                                  <button
                                    onClick={() => setDeletingReport(liq)}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    title="Delete draft report and purge ledger entries"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Delete</span>
                                  </button>
                                )}
                              </>
                            );
                          })()}

                          <button
                            onClick={() => setExportReport(liq)}
                            className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="Export official STI liquidation report"
                          >
                            <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                            <span>Export</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedReport(liq);
                              setReviewRemarks(liq.returnRemarks || '');
                              setActionError(null);
                            }}
                            className="px-2.5 py-1 bg-gray-100 hover:bg-[#001A4D] hover:text-white text-gray-700 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="View Full Report"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredLiquidations.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
          itemName="reports"
        />
          </>
        )}
      </div>

      {/* ── Review & Approval Modal ── */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
            {/* Modal Header: Solid #001A4D, no gradient */}
            <div className="px-6 py-4 bg-[#001A4D] text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">
                  {selectedReport.status === 'approved' ? 'Approved Liquidation Report' : 'Review Liquidation'}: {selectedReport.eventTitle}
                </h3>
                <div className="text-xs text-white/70 mt-0.5">
                  Host Organization: {selectedReport.organizationName} • Submitted by {selectedReport.createdByName || 'Officer'}
                </div>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Revision Feedback Banner */}
              {(selectedReport.status === 'returned' || (selectedReport.revisionHistory && selectedReport.revisionHistory.length > 0)) && (
                <RevisionFeedbackBanner
                  returnedBy={{
                    name: (selectedReport as any).returnedByName || (selectedReport as any).returnedBy || 'Institutional Signatory',
                    roleTitle: (selectedReport as any).returnedByRoleTitle || 'Signatory Reviewer',
                    email: (selectedReport as any).returnedByEmail,
                  }}
                  returnedAt={selectedReport.returnedAt}
                  returnRemarks={selectedReport.returnRemarks}
                  returnFlags={selectedReport.returnFlags}
                  stepRevisionRemarks={selectedReport.stepRevisionRemarks}
                  revisionHistory={selectedReport.revisionHistory}
                  canEdit={permissions.canEdit}
                  onEditClick={() => {
                    handleOpenEditDraft(selectedReport);
                  }}
                  documentTitle={selectedReport.eventTitle}
                  documentType="FL"
                  currentDocument={selectedReport}
                  versionLabel={`v${selectedReport.revisionCount || 1}.0`}
                />
              )}

              {/* Financial Math Bar */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-gray-500 font-medium">Approved Event Budget</div>
                  <div className="text-lg font-bold text-[#001A4D] mt-0.5">
                    {formatCurrency(selectedReport.allocatedBudget)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 font-medium">Total Actual Spending</div>
                  <div className="text-lg font-bold text-gray-900 mt-0.5">
                    {formatCurrency(selectedReport.totalActualSpending)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 font-medium">
                    {selectedReport.surplusOrDeficit < 0 ? 'Deficit (Over Budget)' : 'Surplus (Remaining)'}
                  </div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${selectedReport.surplusOrDeficit < 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}
                  >
                    {formatVariance(selectedReport.surplusOrDeficit)}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <h4 className="font-bold text-[#001A4D] text-sm mb-3">
                  Expense Line Items & Uploaded Receipts ({selectedReport.lineItems?.length || 0})
                </h4>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Item Description</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Allocated</th>
                        <th className="p-3">Actual Cost</th>
                        <th className="p-3">Variance</th>
                        <th className="p-3">Vendor / Receipt #</th>
                        <th className="p-3">Receipt Image</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedReport.lineItems?.map((item, idx) => {
                        const itemAllocated = item.allocatedCost ?? 0;
                        const itemVariance = itemAllocated > 0 ? itemAllocated - item.totalCost : null;

                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-3 font-bold text-gray-500">{idx + 1}</td>
                            <td className="p-3 font-semibold text-gray-900">{item.description}</td>
                            <td className="p-3 text-gray-600">{item.category}</td>
                            <td className="p-3">
                              {itemAllocated > 0 ? (
                                <div>
                                  <div className="font-bold text-gray-900">{formatCurrency(itemAllocated)}</div>
                                  <div className="text-[10px] text-gray-500">
                                    {item.proposedQuantity || 1} Qty × {formatCurrency(item.proposedUnitCost || 0)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="p-3">
                              <div>
                                <div className="font-bold text-gray-900">{formatCurrency(item.totalCost)}</div>
                                <div className="text-[10px] text-gray-500">
                                  {item.quantity} Qty × {formatCurrency(item.unitCost)}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-bold">
                              {itemVariance !== null ? (
                                <span className={`px-2 py-0.5 rounded text-[11px] ${itemVariance < 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                  {itemVariance < 0
                                    ? `Deficit -${formatCurrency(Math.abs(itemVariance))}`
                                    : `Surplus +${formatCurrency(itemVariance)}`}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="p-3 text-gray-600">
                              {item.vendorName || '—'} {item.receiptNumber ? `(${item.receiptNumber})` : ''}
                            </td>
                            <td className="p-3">
                              {(() => {
                                const files =
                                  item.receiptFiles && item.receiptFiles.length > 0
                                    ? item.receiptFiles
                                    : item.receiptUrls && item.receiptUrls.length > 0
                                      ? item.receiptUrls.map((u, i) => ({
                                        id: `${i}`,
                                        url: u,
                                        name: `Receipt ${i + 1}`,
                                        fileType: 'other' as const,
                                      }))
                                      : item.receiptUrl
                                        ? [
                                          {
                                            id: '1',
                                            url: item.receiptUrl,
                                            name: 'Receipt Attachment',
                                            fileType: 'other' as const,
                                          },
                                        ]
                                        : [];

                                if (files.length === 0) {
                                  return <span className="text-gray-400">No Proof</span>;
                                }

                                return (
                                  <div className="flex flex-col gap-1">
                                    {files.map((f, fIdx) => (
                                      <button
                                        key={f.id || fIdx}
                                        type="button"
                                        onClick={() =>
                                          setLightboxData({
                                            url: f.url,
                                            title: item.description,
                                            vendor: item.vendorName,
                                            amount: item.totalCost,
                                            fileName: f.name,
                                            fileType: (f as any).fileType,
                                          })
                                        }
                                        className="text-[#0E4EBD] hover:underline font-semibold text-xs flex items-center gap-1 cursor-pointer truncate text-left max-w-[170px]"
                                        title={f.name}
                                      >
                                        <Eye className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate">{f.name || `Receipt #${fIdx + 1}`}</span>
                                      </button>
                                    ))}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Student Contribution Two-Axis Collection Recovery & Semester-End Closeout */}
              {(selectedReport as any).fundingSource === 'student_contributions' && (
                <div className="space-y-3 pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-[#001A4D] text-xs uppercase tracking-wider">
                      Student Contribution Two-Axis Collection Tracker
                    </h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        (selectedReport as any).collectionSettlementStatus === 'fully_recovered'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : (selectedReport as any).collectionSettlementStatus === 'deficit_absorbed'
                            ? 'bg-slate-100 text-slate-700 border-slate-300'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {(selectedReport as any).collectionSettlementStatus === 'fully_recovered'
                        ? 'Fully Covered by Collections'
                        : (selectedReport as any).collectionSettlementStatus === 'deficit_absorbed'
                          ? 'Semester-End Deficit Absorbed'
                          : 'Recovering via Late Cashier Uploads'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">Projected Target</span>
                      <strong className="font-mono text-slate-900">
                        {formatCurrency(Number((selectedReport as any).totalProjectedCollection || 0))}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-emerald-700 block">Collected to Date</span>
                      <strong className="font-mono text-emerald-900">
                        {formatCurrency(Number((selectedReport as any).totalCollectedAtLiquidation ?? selectedReport.allocatedBudget ?? 0))}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                      <span className="text-[10px] font-bold uppercase text-amber-800 block">Uncollected Receivables</span>
                      <strong className="font-mono text-amber-900">
                        {formatCurrency(Number((selectedReport as any).uncollectedReceivablesAtLiquidation || 0))}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                      <span className="text-[10px] font-bold uppercase text-rose-700 block">Collection Deficit</span>
                      <strong className="font-mono text-rose-900">
                        {formatCurrency(selectedCollectionDeficit)}
                      </strong>
                    </div>
                  </div>

                  {selectedReport.status === 'approved' && isRecoveringStudentContribution && (
                    <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
                      <p className="text-xs text-amber-950">
                        Unpaid student payables remain active so late Cashier uploads automatically reduce this collection deficit. At semester end, if remaining students will no longer pay, allocate buckets below to close and absorb the remaining <strong>{formatCurrency(selectedCollectionDeficit)}</strong> shortfall.
                      </p>
                      <DeficitCoverageAllocationPanel
                        totalDeficit={selectedCollectionDeficit}
                        rows={collectionAbsorbRows}
                        onChange={setCollectionAbsorbRows}
                        supplementalOptions={collectionAbsorbOptions}
                        disabled={isAbsorbingDeficit}
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="text"
                          value={absorbNoteDraft}
                          onChange={(e) => setAbsorbNoteDraft(e.target.value)}
                          placeholder="Optional semester-end closeout note..."
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-[#001A4D]"
                        />
                        <Button
                          type="button"
                          disabled={isAbsorbingDeficit || !collectionAbsorbValidation.isValid}
                          onClick={async () => {
                            setIsAbsorbingDeficit(true);
                            try {
                              await absorbRemainingCollectionDeficit(
                                selectedReport.id,
                                {
                                  uid: adviserProfile?.uid || currentUser.uid,
                                  name: currentUser.name,
                                },
                                {
                                  deficitDeductionAllocations: collectionAbsorbRows,
                                  note: absorbNoteDraft,
                                }
                              );
                              setSelectedReport({
                                ...selectedReport,
                                collectionDeficitAmount: 0,
                                collectionSettlementStatus: 'deficit_absorbed',
                              });
                              setAbsorbNoteDraft('');
                              toast.success('Remaining collection deficit closed and absorbed cleanly.');
                            } catch (err: any) {
                              toast.error(err?.message || 'Failed to absorb remaining collection deficit.');
                            } finally {
                              setIsAbsorbingDeficit(false);
                            }
                          }}
                          className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer shrink-0"
                        >
                          {isAbsorbingDeficit && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                          Close &amp; Absorb Remaining Collection Deficit
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Post-Approval Settlement Proof & Bucket Routing */}
              {selectedReport.status === 'approved' &&
                (Number(selectedReport.surplusOrDeficit || 0) !== 0 ||
                  Number(selectedReport.amountToReturn || 0) > 0 ||
                  (selectedReport.cashierSettlementProofs && selectedReport.cashierSettlementProofs.length > 0)) && (() => {
                  const isVerified = selectedReport.cashierSettlementStatus === 'verified';
                  const isDeficitReport = selectedReportDeficit > 0.009;
                  const isSasStudentContribSettlement =
                    isSasSelectedLiquidation &&
                    sourceAllocations.some(
                      (a) =>
                        a.fundType === 'student_contributions' ||
                        a.fundType === 'student_contribution_retained'
                    );
                  const requiresProofForSettlement =
                    isDeficitReport ||
                    surplusReturnValidation.requiresCashierReceipt ||
                    isSasStudentContribSettlement ||
                    (sourceAllocations.length === 1 && sourceAllocations[0]?.fundType === 'misc_fee');
                  const settlementInvalid = isDeficitReport
                    ? !deficitCoverageValidation.isValid || cashierProofDrafts.length === 0
                    : !surplusReturnValidation.isValid || (requiresProofForSettlement && cashierProofDrafts.length === 0);

                  return (
                    <div className="space-y-3 pt-2 border-t border-gray-200">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-[#001A4D] text-xs uppercase tracking-wider">
                          {isDeficitReport
                            ? 'Post-Approval Overspend Coverage & Proof'
                            : requiresProofForSettlement
                              ? 'Post-Approval Cashier Return & Bucket Routing'
                              : 'Post-Approval Non-Misc Surplus Bucket Return'}
                        </h4>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            isVerified
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : selectedReport.cashierSettlementStatus === 'proof_uploaded'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {isVerified
                            ? 'Verified & Posted to Buckets'
                            : selectedReport.cashierSettlementStatus === 'proof_uploaded'
                              ? 'Proof Uploaded • Awaiting SAS Verification'
                              : isDeficitReport
                                ? 'Pending Coverage & Proof'
                                : requiresProofForSettlement
                                  ? 'Pending Cashier Return Receipt'
                                  : 'Awaiting Bucket Return Confirmation'}
                        </span>
                      </div>

                      {selectedReportSurplus > 0.009 ? (
                        renderSurplusRoutingContent(isVerified, 'post_approval')
                      ) : isDeficitReport ? (
                        <div className="space-y-3">
                          <DeficitCoverageAllocationPanel
                            totalDeficit={selectedReportDeficit}
                            rows={deficitAllocationRows}
                            onChange={setDeficitAllocationRows}
                            supplementalOptions={deficitSupplementalOptions}
                            disabled={savingCashierProof}
                            readOnly={isVerified}
                          />
                          <CashierProofUploader
                            proofs={cashierProofDrafts}
                            onChange={setCashierProofDrafts}
                            cashierReferenceNo={cashierRefDraft}
                            onReferenceNoChange={setCashierRefDraft}
                            folderKey={selectedReport.id}
                            disabled={savingCashierProof}
                            readOnly={isVerified}
                            title={`Required Reimbursement / Supplemental Proof (Overspent: ${formatCurrency(selectedReportDeficit)})`}
                            description="Attach signed Reimbursement Voucher / Supplemental Disbursement Proof before deducting from the bucket(s) above."
                          />
                        </div>
                      ) : null}

                      {!isVerified && (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {cashierProofDrafts.length > 0 && (
                            <Button
                              type="button"
                              disabled={savingCashierProof || (isDeficitReport && !deficitCoverageValidation.isValid)}
                              onClick={async () => {
                                setSavingCashierProof(true);
                                try {
                                  await attachCashierSettlementProofs(
                                    selectedReport.id,
                                    cashierProofDrafts,
                                    cashierRefDraft,
                                    {
                                      uid: adviserProfile?.uid || currentUser.uid,
                                      name: currentUser.name,
                                      role: 'admin',
                                    },
                                    isDeficitReport
                                      ? { deficitDeductionAllocations: deficitAllocationRows }
                                      : { surplusReturnAllocations: returnAllocationRows }
                                  );
                                  setSelectedReport({
                                    ...selectedReport,
                                    cashierSettlementProofs: cashierProofDrafts,
                                    cashierReferenceNo: cashierRefDraft,
                                    cashierSettlementStatus: 'proof_uploaded',
                                    ...(isDeficitReport
                                      ? { deficitDeductionAllocations: deficitAllocationRows }
                                      : { surplusReturnAllocations: returnAllocationRows }),
                                  });
                                  toast.success('Settlement proof & bucket allocation saved.');
                                } catch (err: any) {
                                  toast.error(err?.message || 'Failed to save settlement proof.');
                                } finally {
                                  setSavingCashierProof(false);
                                }
                              }}
                              className="bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold cursor-pointer"
                            >
                              {savingCashierProof && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                              Save Draft Proof &amp; Split
                            </Button>
                          )}

                          <Button
                            type="button"
                            disabled={savingCashierProof || settlementInvalid}
                            onClick={async () => {
                              setSavingCashierProof(true);
                              setActionError(null);
                              try {
                                await verifyCashierSettlementProofs(
                                  selectedReport.id,
                                  {
                                    uid: adviserProfile?.uid || currentUser.uid,
                                    name: currentUser.name,
                                  },
                                  {
                                    surplusReturnAllocations: selectedReportSurplus > 0.009 ? returnAllocationRows : undefined,
                                    deficitDeductionAllocations: isDeficitReport ? deficitAllocationRows : undefined,
                                    cashierSettlementProofs: cashierProofDrafts,
                                    cashierReferenceNo: cashierRefDraft,
                                  }
                                );
                                setSelectedReport({
                                  ...selectedReport,
                                  cashierSettlementProofs: cashierProofDrafts,
                                  cashierReferenceNo: cashierRefDraft,
                                  cashierSettlementStatus: 'verified',
                                  ...(selectedReportSurplus > 0.009
                                    ? { surplusReturnAllocations: returnAllocationRows }
                                    : {}),
                                  ...(isDeficitReport
                                    ? { deficitDeductionAllocations: deficitAllocationRows }
                                    : {}),
                                });
                                toast.success(
                                  isDeficitReport
                                    ? 'Overspend proof verified & deducted from bucket(s)!'
                                    : 'Surplus return verified & posted to bucket(s)!'
                                );
                              } catch (err: any) {
                                const msg = err?.message || 'Failed to verify and settle liquidation.';
                                setActionError(msg);
                                toast.error(msg);
                              } finally {
                                setSavingCashierProof(false);
                              }
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            {savingCashierProof && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            {isDeficitReport
                              ? 'Verify Proof & Deduct from Bucket(s)'
                              : requiresProofForSettlement
                                ? 'Verify Proof & Return to Bucket(s)'
                                : 'Confirm & Return to Bucket(s)'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}

              {/* Multi-Stage Institutional Signatory Pipeline */}
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <h4 className="font-bold text-[#001A4D] text-xs uppercase tracking-wider">
                  Institutional Signatory & Audit Route
                </h4>
                <LiquidationSignatoryTracker
                  approvalChain={selectedReport.approvalChain}
                  currentStageIndex={selectedReport.currentStageIndex ?? 1}
                  liquidationStatus={selectedReport.status}
                />
              </div>

              {/* Remarks History Log */}
              {selectedReport.remarksHistory && selectedReport.remarksHistory.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-200">
                  <h4 className="font-bold text-[#001A4D] text-xs uppercase tracking-wider">
                    Remarks & Action History
                  </h4>
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {selectedReport.remarksHistory.map((rem, rIdx) => (
                      <div key={rIdx} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between text-gray-700 font-semibold">
                          <span>{rem.authorName} ({rem.authorRole === 'admin' ? 'SAO Adviser' : 'Officer'})</span>
                          <span className="text-[10px] text-gray-500">{formatAppDateTime(rem.timestamp)}</span>
                        </div>
                        <p className="text-gray-800">{rem.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pre-Approval Read-Only Settlement Notice (Configuration unlocks strictly after Approval) */}
              {(selectedReport.status === 'pending' || selectedReport.status === 'under_review') &&
                (selectedReportSurplus > 0.009 || selectedReportDeficit > 0.009) && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                    <p className="font-bold text-[#001A4D] uppercase tracking-wider text-[11px]">
                      Post-Approval Settlement Preview (Read-Only)
                    </p>
                    <p>
                      {selectedReportDeficit > 0.009
                        ? `Once this report is approved, you will confirm which bucket(s) cover the ${formatCurrency(selectedReportDeficit)} overspend and attach Reimbursement Proof.`
                        : `Once this report is approved, you will confirm how the ${formatCurrency(selectedReportSurplus)} unspent surplus returns to the approved source bucket(s)${surplusReturnValidation.requiresCashierReceipt || (sourceAllocations.length === 1 && sourceAllocations[0]?.fundType === 'misc_fee') || (isSasSelectedLiquidation && sourceAllocations.some((a) => a.fundType === 'student_contributions' || a.fundType === 'student_contribution_retained')) ? ' and upload the Return Receipt / Proof' : ''}.`}
                    </p>
                  </div>
                )}

              {/* SAO Adviser Remarks - Only for pending submissions under review */}
              {(selectedReport.status === 'pending' || selectedReport.status === 'under_review') && (
                <div>
                  <label className="block text-sm font-bold text-[#001A4D] mb-1.5">
                    SAO Adviser Remarks / Revision Notes
                  </label>
                  <textarea
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                    placeholder="Enter approval notes or specific instructions if returning for revision..."
                    className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] h-24"
                  />
                </div>
              )}

              {actionError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-900">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{actionError}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setSelectedReport(null)}
                disabled={isProcessing}
                className="cursor-pointer"
              >
                Close
              </Button>

              {/* Status Specific Footer Actions */}
              <div className="flex items-center gap-3">
                {selectedReport.status === 'approved' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4" /> Approved by SAO Adviser
                  </span>
                )}
                <Button
                  onClick={() => setExportReport(selectedReport)}
                  className="bg-[#001A4D] hover:bg-[#002D72] text-white font-bold text-xs cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1.5 text-[#FFD41C]" />
                  Export Liquidation
                </Button>
              </div>

              {(selectedReport.status === 'pending' || selectedReport.status === 'under_review') && (
                <div className="flex items-center gap-3">
                  {permissions.isOwner ? (
                    // SAS Created this report: They CANNOT approve or return!
                    <>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        <Clock className="w-3.5 h-3.5 text-blue-600" /> Authored by SAO • Under Signatory Review
                      </span>
                      {permissions.canWithdraw && (
                        <Button
                          variant="outline"
                          onClick={() => setShowWithdrawModal(true)}
                          disabled={isProcessing}
                          className="border-amber-300 text-amber-800 hover:bg-amber-50 font-bold text-xs cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                          Withdraw Submission
                        </Button>
                      )}
                    </>
                  ) : (
                    // Reviewer actions for Student Org submissions
                    <>
                      {permissions.canReturn && (
                        <Button
                          onClick={() => setShowReturnModal(true)}
                          disabled={isProcessing}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
                        >
                          {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          <RotateCcw className="w-4 h-4 mr-1.5" />
                          Return for Revision
                        </Button>
                      )}

                      {permissions.canApprove && (() => {
                        const isReleaseAction =
                          (selectedReport as any).fundingSource !== 'organization_funds' &&
                          (selectedReport as any).isPendingSasVetting === true;

                        return (
                          <Button
                            onClick={() => setShowApproveConfirmModal(true)}
                            disabled={isProcessing}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50"
                          >
                            {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isReleaseAction
                              ? 'Approve & Release to Signatories'
                              : 'Approve & Sign as SAS'}
                          </Button>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              {selectedReport.status === 'draft' && (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                    <Clock className="w-3.5 h-3.5 text-gray-500" /> Draft Report (Unsubmitted)
                  </span>
                  {permissions.canEdit && (
                    <Button
                      onClick={() => handleOpenEditDraft(selectedReport)}
                      className="bg-[#001A4D] hover:bg-[#002D72] text-white font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#FFD41C]" />
                      Edit Draft
                    </Button>
                  )}
                </div>
              )}

              {selectedReport.status === 'returned' && (
                <div className="flex items-center gap-3">
                  {permissions.canEdit ? (
                    <Button
                      onClick={() => handleOpenEditDraft(selectedReport)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-white" />
                      Edit & Resubmit Liquidation
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Awaiting Officer Resubmission
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Author Withdraw Modal */}
      <WithdrawConfirmModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onConfirm={handleWithdraw}
        documentType="Financial Liquidation"
        documentTitle={selectedReport?.eventTitle || ''}
        isProcessing={isProcessing}
      />

      {/* Lightbox Modal */}
      <ReceiptLightboxModal
        isOpen={!!lightboxData}
        onClose={() => setLightboxData(null)}
        imageUrl={lightboxData?.url || ''}
        itemTitle={lightboxData?.title}
        vendorName={lightboxData?.vendor}
        amount={lightboxData?.amount}
        fileName={lightboxData?.fileName}
        fileType={lightboxData?.fileType}
      />

      {/* Liquidation Excel Export Preview Modal */}
      <LiquidationExportPreviewModal
        isOpen={!!exportReport}
        onClose={() => setExportReport(null)}
        report={exportReport}
      />

      {/* Delete / Void Confirmation Modal */}
      {deletingReport && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Discard Liquidation Report?</h3>
                <p className="text-xs text-gray-500">This draft will be moved to Trash where you can restore it anytime.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
              Are you sure you want to discard the liquidation report for <strong>"{deletingReport.eventTitle}"</strong>?
              It will be moved to the Trash repository where you can restore it anytime.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingReport(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!deletingReport) return;
                  setIsDeleting(true);
                  try {
                    await deleteLiquidationReport(
                      deletingReport.id,
                      {
                        uid: adviserProfile?.uid || 'sao_admin',
                        name: adviserProfile?.displayName || 'SAO Adviser',
                        role: 'admin',
                      },
                      'Draft discarded by SAO Adviser'
                    );
                    toast.success('Liquidation draft moved to Trash. You can restore it anytime.');
                    setDeletingReport(null);
                  } catch (err: any) {
                    toast.error(err?.message || 'Failed to discard liquidation report.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete & Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Step-by-Step Return Revision Modal */}
      {selectedReport && (
        <StepReturnRevisionModal
          isOpen={showReturnModal}
          onClose={() => setShowReturnModal(false)}
          documentTitle={selectedReport.eventTitle || 'Financial Liquidation'}
          referenceNo={selectedReport.referenceNumber || selectedReport.referenceNo}
          documentType="FL"
          steps={buildLiquidationReturnSteps(selectedReport.lineItems || [])}
          onSubmit={handleReturnSubmit}
          isSubmitting={isProcessing}
          initialOverallRemarks={reviewRemarks}
        />
      )}

      {/* SAS Liquidation Approval / Release Confirmation Modal */}
      {showApproveConfirmModal && selectedReport && (() => {
        const isRelease = (selectedReport as any).fundingSource !== 'organization_funds' && (selectedReport as any).isPendingSasVetting === true;
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
                    {isRelease ? 'Confirm SAS Review Clearance & Release' : 'Confirm Liquidation Report Approval'}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5 truncate max-w-xs">{selectedReport.eventTitle}</p>
                </div>
              </div>

              <div className="p-5 space-y-3.5">
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {isRelease
                    ? 'Are you sure you want to clear SAS vetting and release this liquidation report to institutional signatories?'
                    : 'Are you sure you want to approve and sign off on this financial liquidation report?'}
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
                      <li>Official SAS sign-off is stamped onto the Financial Liquidation report.</li>
                      <li>The report status transitions to <strong>Approved</strong>.</li>
                      <li>Financial ledger and budget balances are finalized.</li>
                      <li>The student organization will be notified immediately.</li>
                    </ul>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowApproveConfirmModal(false)}
                  disabled={isProcessing}
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
                  disabled={isProcessing}
                  className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 text-white ${
                    isRelease
                      ? 'bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] hover:from-[#002B7F] hover:to-[#001A4D]'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isProcessing ? (
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

      {/* SAS Admin Create / Edit Draft / Revise Liquidation Modal */}
      {showAdminCreateModal && (
        <OfficerLiquidationModal
          isOpen={showAdminCreateModal}
          onClose={() => {
            setShowAdminCreateModal(false);
            setEditingReport(null);
          }}
          orgId={editingReport?.organizationId || 'sao_admin'}
          orgName={editingReport?.organizationName || 'Student Affairs Services (SAS)'}
          userUid={currentUser.uid}
          userName={currentUser.name}
          userRole="admin"
          userSignatureUrl={
            adviserProfile?.signatureUrl ||
            (adviserProfile as any)?.signatureDataUrl ||
            null
          }
          isAdviser={true}
          editingReport={editingReport}
          existingLiquidations={liquidations}
          initialEventId={editingReport?.eventId}
          initialEvent={
            editingReport?.eventId ? eventsById.get(editingReport.eventId) : undefined
          }
        />
      )}
    </div>
  );
}
