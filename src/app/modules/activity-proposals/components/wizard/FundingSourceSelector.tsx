import React, { useMemo, useEffect, useState } from 'react';
import {
  Wallet,
  Landmark,
  Users,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Coins,
  CheckSquare,
  Square,
  Sparkles,
  Ban,
  Search,
  Check,
  RotateCcw,
  Eye,
  X,
} from 'lucide-react';
import { MiscFeeBucketTransactionsModal } from '../../../finance/components/MiscFeeBucketTransactionsModal';
import type {
  ActivityFundingSource,
  ProposalBucketAllocation,
  StudentContributionFilterConfig,
} from '../../types/proposal.types';
import {
  validateBucketAllocations,
  rebalanceBucketAllocations,
} from '../../utils/proposal-calculations';
import { useOrgLedger } from '../../../finance/hooks/useFinanceStream';
import { useMiscFeeConfigs, useMiscFeeLedger } from '../../../finance/hooks/useMiscFeeStream';
import { useRetainedActivityFunds } from '../../../finance/hooks/useRetainedFundStream';
import type { ComputedBucketBalance } from '../../../finance/types/misc-fee.types';
import { useStudents } from '../../../students/hooks/useStudentStream';
import { useTargetAudienceStructure } from '../../../academic';
import {
  type ReachEstimatorMode,
  filterActiveStudents,
  computeStudentDemographics,
  filterMatchingStudents,
  filterVisibleCourses,
  filterVisibleSections,
} from '../../utils/student-reach.utils';
import {
  formatMiscFeeFundDescription,
  formatStudentContributionDescription,
  formatRetainedFundDescription,
} from '../../../finance/utils/fund-source-formatter';

const STUDENT_MODE_OPTIONS: Array<{ key: ReachEstimatorMode; label: string }> = [
  { key: 'all', label: 'All Enrolled Students' },
  { key: 'shs', label: 'SHS Only' },
  { key: 'college', label: 'College Only' },
  { key: 'custom', label: 'Custom Filter' },
];

export interface StudentContributionCalcPayload {
  rate: number;
  targetCount: number;
  totalProjected: number;
  audienceSummary: string;
  description: string;
  remarks: string;
  applyRetainedBucket: boolean;
  retainedBucketBalance: number;
  retainedDescription?: string;
  retainedRemarks?: string;
  filter: StudentContributionFilterConfig;
}

interface FundingSourceSelectorProps {
  value?: ActivityFundingSource;
  onChange: (source: ActivityFundingSource, note?: string) => void;
  selectedBucketId?: string;
  selectedBucketIds?: string[];
  onSelectBucket?: (bucket: ComputedBucketBalance) => void;
  onSelectBuckets?: (buckets: ComputedBucketBalance[]) => void;
  allocations?: ProposalBucketAllocation[];
  onAllocationsChange?: (allocations: ProposalBucketAllocation[]) => void;
  studentContributionRate?: number;
  studentContributionTargetCount?: number;
  studentContributionFilter?: StudentContributionFilterConfig;
  defaultStudentCount?: number;
  applyRetainedBucket?: boolean;
  onStudentContributionChange?: (params: StudentContributionCalcPayload) => void;
  onRetainedBalanceResolved?: (balance: number) => void;
  organizationId?: string | null;
  organizationName?: string;
  isOfficer?: boolean;
  proposedBudget?: number;
  className?: string;
}

export default function FundingSourceSelector({
  value = 'school_budget',
  onChange,
  selectedBucketId,
  selectedBucketIds,
  onSelectBucket,
  onSelectBuckets,
  allocations = [],
  onAllocationsChange,
  studentContributionRate = 0,
  studentContributionFilter,
  applyRetainedBucket: controlledApplyRetained,
  onStudentContributionChange,
  onRetainedBalanceResolved,
  organizationId,
  organizationName,
  isOfficer = false,
  proposedBudget = 0,
  className = '',
}: FundingSourceSelectorProps) {
  const { data: orgLedgerData = [], loading: orgLoading } = useOrgLedger(
    isOfficer ? organizationId || null : null
  );
  const {
    activeConfig,
    effectiveHeadcounts,
    saoEligibleBuckets,
    loading: miscLoading,
  } = useMiscFeeConfigs();
  const { data: miscFeeLedger = [] } = useMiscFeeLedger();
  const [inspectedMiscBucket, setInspectedMiscBucket] = useState<ComputedBucketBalance | null>(null);
  const {
    saoRetainedFund,
    loading: retainedLoading,
  } = useRetainedActivityFunds(null);

  // Live Enrolled Students & Academic Structure for Student Contribution Calculator
  const { data: allStudentsData = [] } = useStudents();
  const audienceStructure = useTargetAudienceStructure();
  const activeStudents = useMemo(
    () => filterActiveStudents(allStudentsData),
    [allStudentsData]
  );

  // Student Contribution Filter State (Default = All Enrolled Students)
  const [contribMode, setContribMode] = useState<ReachEstimatorMode>(
    studentContributionFilter?.mode || 'all'
  );
  const [selectedYears, setSelectedYears] = useState<string[]>(
    studentContributionFilter?.selectedYears || []
  );
  const [selectedCourses, setSelectedCourses] = useState<string[]>(
    studentContributionFilter?.selectedCourses || []
  );
  const [selectedSections, setSelectedSections] = useState<string[]>(
    studentContributionFilter?.selectedSections || []
  );
  const [sectionSearch, setSectionSearch] = useState<string>('');
  const [manualCountEnabled, setManualCountEnabled] = useState<boolean>(
    Boolean(studentContributionFilter?.manualCountEnabled)
  );
  const [manualStudentCount, setManualStudentCount] = useState<number>(
    Number(studentContributionFilter?.manualStudentCount) || 0
  );
  const [showTargetStudentsPreview, setShowTargetStudentsPreview] = useState(false);
  const [targetPreviewSearch, setTargetPreviewSearch] = useState('');
  const [localApplyRetained, setLocalApplyRetained] = useState<boolean>(
    Boolean(controlledApplyRetained)
  );

  useEffect(() => {
    if (controlledApplyRetained !== undefined) {
      setLocalApplyRetained(controlledApplyRetained);
    }
  }, [controlledApplyRetained]);

  // Enforce valid role options WITHOUT removing zero_budget (Non-Monetary)
  useEffect(() => {
    if (!isOfficer && value === 'organization_funds') {
      onChange('school_budget');
    } else if (!isOfficer && value === 'retained_sao_fund') {
      onChange('student_contributions');
    } else if (isOfficer && value === 'retained_sao_fund') {
      onChange('organization_funds');
    }
  }, [isOfficer, value, onChange]);

  const orgTreasuryBalance = useMemo(() => {
    if (!isOfficer || !orgLedgerData || orgLedgerData.length === 0) return 0;
    const totalIncome = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalExpenses = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return Math.max(0, totalIncome - totalExpenses);
  }, [isOfficer, orgLedgerData]);

  // Previous Student Contribution Retained Bucket Balance (SAO Campus only; Orgs use single Club Treasury Ledger)
  const previousContribBucketBalance = useMemo(() => {
    if (isOfficer) {
      return 0;
    }
    return Math.max(0, Number(saoRetainedFund?.availableBalance) || 0);
  }, [isOfficer, saoRetainedFund]);

  useEffect(() => {
    if (onRetainedBalanceResolved) {
      onRetainedBalanceResolved(
        isOfficer ? orgTreasuryBalance : previousContribBucketBalance
      );
    }
  }, [isOfficer, orgTreasuryBalance, previousContribBucketBalance, onRetainedBalanceResolved]);

  // Enrolled Student Filter Calculations
  const {
    courses: activeCourses,
    sections: activeSections,
    shsPrograms,
    collegePrograms,
    allPrograms,
    shsCourseCodes,
    shsYearLevels,
    collegeYearLevels,
    allYearLevels,
  } = audienceStructure;

  const availableYears = useMemo(() => {
    if (contribMode === 'shs') return shsYearLevels;
    if (contribMode === 'college') return collegeYearLevels;
    return allYearLevels;
  }, [contribMode, shsYearLevels, collegeYearLevels, allYearLevels]);

  const visibleCourses = useMemo(
    () =>
      filterVisibleCourses(
        allPrograms,
        shsPrograms,
        collegePrograms,
        activeSections,
        contribMode,
        selectedYears
      ),
    [allPrograms, shsPrograms, collegePrograms, activeSections, contribMode, selectedYears]
  );

  const visibleSections = useMemo(
    () =>
      filterVisibleSections(activeSections, activeCourses, shsCourseCodes, {
        mode: contribMode,
        courseCodes: selectedCourses,
        years: selectedYears,
        search: sectionSearch,
      }),
    [activeSections, activeCourses, shsCourseCodes, contribMode, selectedCourses, selectedYears, sectionSearch]
  );

  const matchingStudents = useMemo(
    () =>
      filterMatchingStudents(activeStudents, {
        mode: contribMode,
        years: selectedYears,
        courseCodes: selectedCourses,
        sections: selectedSections,
        shsCourseCodes,
        activeCourses,
      }),
    [activeStudents, contribMode, selectedYears, selectedCourses, selectedSections, shsCourseCodes, activeCourses]
  );

  const filteredDemographics = useMemo(
    () =>
      computeStudentDemographics(
        matchingStudents,
        shsPrograms,
        collegePrograms,
        shsCourseCodes,
        activeCourses
      ),
    [matchingStudents, shsPrograms, collegePrograms, shsCourseCodes, activeCourses]
  );

  const effectiveContribStudentCount = manualCountEnabled
    ? Math.max(0, manualStudentCount)
    : matchingStudents.length;

  const audienceSummary = useMemo(() => {
    const scopeParts: string[] = [];
    if (contribMode === 'all' && !selectedYears.length && !selectedCourses.length && !selectedSections.length) {
      scopeParts.push('All Enrolled Students');
    } else if (contribMode === 'shs' && !selectedYears.length && !selectedCourses.length && !selectedSections.length) {
      scopeParts.push('All SHS Students');
    } else if (contribMode === 'college' && !selectedYears.length && !selectedCourses.length && !selectedSections.length) {
      scopeParts.push('All College Students');
    } else {
      const detail: string[] = [];
      if (contribMode === 'shs') detail.push('SHS');
      if (contribMode === 'college') detail.push('College');
      if (selectedCourses.length > 0) detail.push(selectedCourses.join(', '));
      if (selectedYears.length > 0) detail.push(selectedYears.join(', '));
      if (selectedSections.length > 0) detail.push(`${selectedSections.length} section(s)`);
      scopeParts.push(detail.join(' • ') || 'Filtered Students');
    }

    if (manualCountEnabled) {
      return `${scopeParts.join('')} (Manual: ${effectiveContribStudentCount.toLocaleString()} students)`;
    }
    const breakdown: string[] = [];
    if (filteredDemographics.shs > 0) breakdown.push(`${filteredDemographics.shs} SHS`);
    if (filteredDemographics.college > 0) breakdown.push(`${filteredDemographics.college} College`);
    const bdStr = breakdown.length > 0 ? ` (${breakdown.join(' + ')})` : '';
    return `${scopeParts.join('')}${bdStr}`;
  }, [
    contribMode,
    selectedYears,
    selectedCourses,
    selectedSections,
    manualCountEnabled,
    effectiveContribStudentCount,
    filteredDemographics.shs,
    filteredDemographics.college,
  ]);

  const formattedContrib = useMemo(() => {
    return formatStudentContributionDescription({
      ratePerStudent: studentContributionRate,
      targetStudents: effectiveContribStudentCount,
      audienceSummary,
      ownerLabel: isOfficer
        ? `${organizationName || 'Organization'} Treasury`
        : 'Student Contribution Retained Fund',
    });
  }, [
    studentContributionRate,
    effectiveContribStudentCount,
    audienceSummary,
    isOfficer,
    organizationName,
  ]);

  const emitStudentContributionUpdate = (overrides?: {
    rate?: number;
    count?: number;
    summary?: string;
    applyRetained?: boolean;
  }) => {
    if (!onStudentContributionChange) return;
    const rate = overrides?.rate !== undefined ? overrides.rate : studentContributionRate;
    const count = overrides?.count !== undefined ? overrides.count : effectiveContribStudentCount;
    const summary = overrides?.summary !== undefined ? overrides.summary : audienceSummary;
    const applyRetained =
      overrides?.applyRetained !== undefined ? overrides.applyRetained : localApplyRetained;

    const ownerLabel = isOfficer
      ? `${organizationName || 'Organization'} Treasury`
      : 'Student Contribution Retained Fund';

    const formatted = formatStudentContributionDescription({
      ratePerStudent: rate,
      targetStudents: count,
      audienceSummary: summary,
      ownerLabel,
    });

    const retainedFormatted = formatRetainedFundDescription({
      ownerType: isOfficer ? 'organization' : 'sao',
      organizationName,
      availableBalance: previousContribBucketBalance,
    });

    onStudentContributionChange({
      rate,
      targetCount: count,
      totalProjected: formatted.totalProjected,
      audienceSummary: summary,
      description: formatted.description,
      remarks: formatted.remarks,
      applyRetainedBucket: !isOfficer && applyRetained && previousContribBucketBalance > 0,
      retainedBucketBalance: isOfficer ? 0 : previousContribBucketBalance,
      retainedDescription: retainedFormatted.description,
      retainedRemarks: retainedFormatted.remarks,
      filter: {
        mode: contribMode,
        selectedYears,
        selectedCourses,
        selectedSections,
        manualCountEnabled,
        manualStudentCount: count,
        audienceSummary: summary,
      },
    });
  };

  // Re-emit Student Contribution projection automatically whenever live filters change while active
  useEffect(() => {
    if (value === 'student_contributions') {
      emitStudentContributionUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    value,
    effectiveContribStudentCount,
    audienceSummary,
    localApplyRetained,
    previousContribBucketBalance,
  ]);

  const activeBucketIds = useMemo(() => {
    const ids = new Set<string>();
    if (Array.isArray(selectedBucketIds)) {
      selectedBucketIds.forEach((id) => id && ids.add(id));
    }
    if (ids.size === 0 && selectedBucketId) {
      ids.add(selectedBucketId);
    }
    return Array.from(ids);
  }, [selectedBucketIds, selectedBucketId]);

  const selectedBuckets = useMemo(() => {
    if (!saoEligibleBuckets.length || activeBucketIds.length === 0) return [];
    return activeBucketIds
      .map((id) => saoEligibleBuckets.find((b) => b.bucket.id === id))
      .filter((b): b is ComputedBucketBalance => Boolean(b));
  }, [saoEligibleBuckets, activeBucketIds]);

  const formattedMiscBreakdown = useMemo(() => {
    return formatMiscFeeFundDescription(selectedBuckets, activeConfig.activeSemester);
  }, [selectedBuckets, activeConfig.activeSemester]);

  const miscAllocations = useMemo<ProposalBucketAllocation[]>(() => {
    if (value !== 'school_budget' || selectedBuckets.length === 0) return [];
    if (selectedBuckets.length === 1) {
      const cb = selectedBuckets[0];
      return [
        {
          bucketId: cb.bucket.id,
          bucketName: cb.bucket.particular,
          fundType: 'misc_fee',
          allocatedAmount: Math.max(0, Number(proposedBudget) || 0),
          availableAmount: cb.currentAvailable,
          poolAmount: cb.currentPool,
          disbursedAmount: cb.currentDisbursed,
        },
      ];
    }
    return selectedBuckets.map((cb) => {
      const existing = allocations.find((a) => a.bucketId === cb.bucket.id);
      return {
        bucketId: cb.bucket.id,
        bucketName: cb.bucket.particular,
        fundType: 'misc_fee',
        allocatedAmount: existing ? Number(existing.allocatedAmount) || 0 : 0,
        availableAmount: cb.currentAvailable,
        poolAmount: cb.currentPool,
        disbursedAmount: cb.currentDisbursed,
      };
    });
  }, [value, selectedBuckets, allocations, proposedBudget]);

  const allocationValidation = useMemo(() => {
    return validateBucketAllocations({
      fundingSource: value,
      totalExpenses: proposedBudget,
      allocations: value === 'school_budget' ? miscAllocations : allocations,
    });
  }, [value, proposedBudget, miscAllocations, allocations]);

  // Keep bucket allocations auto-computed whenever selectedBuckets or proposedBudget changes
  useEffect(() => {
    if (value !== 'school_budget' || !onAllocationsChange || selectedBuckets.length === 0) return;

    if (selectedBuckets.length === 1) {
      const target = miscAllocations[0];
      const current = allocations.length === 1 ? allocations[0] : null;
      if (
        !current ||
        current.bucketId !== target.bucketId ||
        Math.abs((current.allocatedAmount || 0) - target.allocatedAmount) >= 0.01
      ) {
        onAllocationsChange([target]);
      }
      return;
    }

    const sameIds =
      allocations.length === miscAllocations.length &&
      miscAllocations.every((m, idx) => allocations[idx]?.bucketId === m.bucketId);
    const currentSum = Math.round(
      allocations.reduce((s, a) => s + (Number(a.allocatedAmount) || 0), 0) * 100
    ) / 100;
    const expSum = Math.round((Number(proposedBudget) || 0) * 100) / 100;

    if (!sameIds || Math.abs(currentSum - expSum) >= 0.01) {
      const balanced = rebalanceBucketAllocations({
        allocations: miscAllocations,
        totalExpenses: expSum,
      });
      onAllocationsChange(balanced);
    }
  }, [value, selectedBuckets.length, miscAllocations, allocations, proposedBudget, onAllocationsChange]);

  const handleToggleBucket = (bucketId: string) => {
    if (!bucketId) return;
    const exists = activeBucketIds.includes(bucketId);
    const nextIds = exists
      ? activeBucketIds.filter((id) => id !== bucketId)
      : [...activeBucketIds, bucketId];
    const nextBuckets = nextIds
      .map((id) => saoEligibleBuckets.find((b) => b.bucket.id === id))
      .filter((b): b is ComputedBucketBalance => Boolean(b));

    if (onSelectBuckets) {
      onSelectBuckets(nextBuckets);
    } else if (nextBuckets[0] && onSelectBucket) {
      onSelectBucket(nextBuckets[0]);
    }

    if (onAllocationsChange) {
      const rawNext = nextBuckets.map((cb) => ({
        bucketId: cb.bucket.id,
        bucketName: cb.bucket.particular,
        fundType: 'misc_fee' as const,
        allocatedAmount: 0,
        availableAmount: cb.currentAvailable,
        poolAmount: cb.currentPool,
        disbursedAmount: cb.currentDisbursed,
      }));
      onAllocationsChange(
        rebalanceBucketAllocations({
          allocations: rawNext,
          totalExpenses: Number(proposedBudget) || 0,
        })
      );
    }
  };

  const handleBucketAmountChange = (bucketId: string, rawVal: string) => {
    if (!onAllocationsChange) return;
    const parsed = rawVal === '' ? 0 : Math.max(0, parseFloat(rawVal) || 0);
    const balanced = rebalanceBucketAllocations({
      allocations: miscAllocations,
      totalExpenses: Number(proposedBudget) || 0,
      editedBucketId: bucketId,
      editedAmount: parsed,
    });
    onAllocationsChange(balanced);
  };

  const toggleSelection = (list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const getRecentBucketMetrics = (cb: ComputedBucketBalance) => {
    const bId = cb.bucket.id;
    const bNameLower = (cb.bucket.particular || '').toLowerCase();
    const matching = (miscFeeLedger || []).filter((entry) => {
      const mPrimary =
        entry.bucketId === bId ||
        (entry.bucketName && bNameLower && entry.bucketName.toLowerCase().includes(bNameLower));
      const mAlloc = Array.isArray(entry.allocations) && entry.allocations.some((a) => a.bucketId === bId);
      return mPrimary || mAlloc;
    });

    const getShareAmount = (entry: any) => {
      if (Array.isArray(entry.allocations)) {
        const hit = entry.allocations.find((a: any) => a.bucketId === bId);
        if (hit) return Number(hit.amount) || 0;
      }
      return Number(entry.amount) || 0;
    };

    const deductions = matching.filter(
      (e) => e.type === 'disbursement_deduction' || e.type === 'liquidation_deficit_deduction'
    );
    const returns = matching.filter((e) => e.type === 'liquidation_surplus_return');

    const recentDeduction = deductions.length > 0 ? getShareAmount(deductions[0]) : cb.currentDisbursed;
    const recentReturn = returns.length > 0 ? getShareAmount(returns[0]) : cb.currentReturnedSurplus;

    return {
      recentDeduction,
      deductionCount: deductions.length,
      recentReturn,
      returnCount: returns.length,
      totalTxCount: matching.length,
    };
  };

  const hasOrgShortage =
    isOfficer &&
    value === 'organization_funds' &&
    proposedBudget > 0 &&
    orgTreasuryBalance < proposedBudget;

  const hasBucketShortage =
    value === 'school_budget' &&
    selectedBuckets.length > 0 &&
    proposedBudget > 0 &&
    formattedMiscBreakdown.totalAvailable < proposedBudget;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
            Source of Fund <span className="text-red-500">*</span>
          </label>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {isOfficer
              ? 'Select Miscellaneous Fee Bucket(s), Organization Treasury, Student Contribution, or Non-Monetary (₱0).'
              : 'Select Miscellaneous Fee Bucket(s), Student Contribution, or Non-Monetary (₱0).'}
          </p>
        </div>

        {isOfficer && value === 'organization_funds' && (
          <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
            {orgLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                <span>Checking club ledger...</span>
              </>
            ) : (
              <>
                <Wallet className="w-3.5 h-3.5 text-purple-600" />
                <span>
                  Live Club Balance:{' '}
                  <strong className="font-mono">{formatCurrency(orgTreasuryBalance)}</strong>
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Fund Source Cards (Non-Monetary preserved; SAO Retained standalone card removed) */}
      <div
        className={`grid grid-cols-1 gap-3 ${
          isOfficer ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'
        }`}
      >
        {/* Option 1: Miscellaneous Fee Fund (School Activity Bucket) */}
        <button
          type="button"
          onClick={() => onChange('school_budget')}
          className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col justify-between cursor-pointer ${
            value === 'school_budget'
              ? 'border-[#001A4D] bg-blue-50/70 shadow-sm ring-2 ring-[#001A4D]/20'
              : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  value === 'school_budget'
                    ? 'bg-[#001A4D] text-white shadow-xs'
                    : 'bg-blue-100 text-[#001A4D]'
                }`}
              >
                <Landmark className="w-4 h-4" />
              </div>
              {value === 'school_budget' && (
                <CheckCircle2 className="w-5 h-5 text-[#001A4D]" />
              )}
            </div>
            <h4 className="text-xs font-bold text-gray-900 mb-1">
              Miscellaneous Fee Fund
            </h4>
            <p className="text-[11px] text-gray-600 leading-snug">
              Select 1 or more Particulars (e.g., Athletic Fee, Sportsfest, LAA). Auto-calculates from enrolled students.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-blue-200/60 flex items-center justify-between text-[10px]">
            <span className="font-bold text-[#001A4D] uppercase tracking-wide">
              SY {activeConfig.schoolYear} • {activeConfig.activeSemester}
            </span>
            <span className="font-semibold text-blue-800">
              {selectedBuckets.length > 0
                ? formatCurrency(formattedMiscBreakdown.totalAvailable)
                : `${saoEligibleBuckets.length} Buckets`}
            </span>
          </div>
        </button>

        {/* Option 2 (Organization / Officer Only): Organization Fund / Club Treasury */}
        {isOfficer && (
          <button
            type="button"
            onClick={() => onChange('organization_funds')}
            className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col justify-between cursor-pointer ${
              value === 'organization_funds'
                ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-2 ring-purple-500/20'
                : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    value === 'organization_funds'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                </div>
                {value === 'organization_funds' && (
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                )}
              </div>
              <h4 className="text-xs font-bold text-gray-900 mb-1">
                Organization Fund (Club Treasury)
              </h4>
              <p className="text-[11px] text-gray-600 leading-snug">
                Funded from your club treasury &amp; retained previous contribution balances. Persistent across SY.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-purple-200/60 flex items-center justify-between text-[10px]">
              <span className="font-bold text-purple-800 uppercase tracking-wide">
                Club Treasury
              </span>
              <span className="font-mono font-bold text-purple-900">
                {orgLoading ? '...' : formatCurrency(orgTreasuryBalance)}
              </span>
            </div>
          </button>
        )}

        {/* Option 3: Student Contribution — Live Student Filter + (for SAS) Retained Bucket Detection */}
        <button
          type="button"
          onClick={() => onChange('student_contributions')}
          className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col justify-between cursor-pointer ${
            value === 'student_contributions'
              ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
              : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  value === 'student_contributions'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <Users className="w-4 h-4" />
              </div>
              {value === 'student_contributions' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <h4 className="text-xs font-bold text-gray-900 mb-1">
              Student Contribution
            </h4>
            <p className="text-[11px] text-gray-600 leading-snug">
              {isOfficer
                ? 'Auto-calculates from filtered students, generates mobile payables on approval, and deposits collections into your Club Ledger.'
                : 'Auto-calculates from filtered enrolled students, generates mobile payables on approval & detects prior SAS surplus buckets.'}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-emerald-200/60 flex items-center justify-between text-[10px]">
            <span className="font-bold text-emerald-800 uppercase tracking-wide">
              {effectiveContribStudentCount.toLocaleString()} Students
            </span>
            <span className="font-semibold text-emerald-700">
              {formattedContrib.totalProjected > 0
                ? formatCurrency(formattedContrib.totalProjected)
                : previousContribBucketBalance > 0
                ? `Bucket: ${formatCurrency(previousContribBucketBalance)}`
                : 'Rate × Students'}
            </span>
          </div>
        </button>

        {/* Option 4: Non-Monetary Activity (₱0.00 Budget) */}
        <button
          type="button"
          onClick={() => onChange('zero_budget')}
          className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col justify-between cursor-pointer ${
            value === 'zero_budget'
              ? 'border-slate-700 bg-slate-100 shadow-sm ring-2 ring-slate-500/20'
              : 'border-gray-200 bg-white hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  value === 'zero_budget'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Ban className="w-4 h-4" />
              </div>
              {value === 'zero_budget' && (
                <CheckCircle2 className="w-5 h-5 text-slate-800" />
              )}
            </div>
            <h4 className="text-xs font-bold text-gray-900 mb-1">
              Non-Monetary (₱0.00 Budget)
            </h4>
            <p className="text-[11px] text-gray-600 leading-snug">
              Free campus / org activity with ₱0 funding needed. Automatically exempt from Disbursement Vouchers &amp; Financial Liquidation.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-[10px]">
            <span className="font-bold text-slate-700 uppercase tracking-wide">
              ₱0.00 Exempt
            </span>
            <span className="font-semibold text-slate-600">
              No Liquidation Required
            </span>
          </div>
        </button>
      </div>

      {/* PANEL A: Multi-Particular Miscellaneous Fee Selector & Live STI Breakdown Preview */}
      {value === 'school_budget' && (
        <div className="p-4 bg-white border border-blue-200 rounded-xl space-y-3 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider">
                Select Miscellaneous Fee Particular(s) <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-gray-500">
                Select one or more Particulars — each selected bucket automatically generates a separate Revenue Projection row below.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                  effectiveHeadcounts.isUsingLiveRegistry
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {effectiveHeadcounts.isUsingLiveRegistry ? 'Live Registry' : 'Manual Override'}:{' '}
                {(activeConfig.activeSemester === '2nd Semester'
                  ? effectiveHeadcounts.college2ndSemEnrolled
                  : effectiveHeadcounts.college1stSemEnrolled
                ).toLocaleString()}{' '}
                College • {effectiveHeadcounts.shsEnrolled.toLocaleString()} SHS
              </span>
              {selectedBuckets.length > 0 && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#001A4D]">
                  {selectedBuckets.length} Bucket{selectedBuckets.length > 1 ? 's' : ''} Selected
                </span>
              )}
            </div>
          </div>

          {miscLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading Miscellaneous Fee buckets...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              {saoEligibleBuckets.map((cb) => {
                const isChecked = activeBucketIds.includes(cb.bucket.id);
                return (
                  <button
                    key={cb.bucket.id}
                    type="button"
                    onClick={() => handleToggleBucket(cb.bucket.id)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isChecked
                        ? 'bg-blue-50 border-[#001A4D] ring-1 ring-[#001A4D]/25'
                        : 'bg-slate-50/70 border-gray-200 hover:bg-slate-100/80'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-[#001A4D] shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#001A4D] truncate">
                        {cb.bucket.particular}
                      </p>
                      <p className="text-[10px] text-gray-600 font-mono">
                        Available: <strong>{formatCurrency(cb.currentAvailable)}</strong>
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {cb.bucket.college1stSemRateTY > 0 && `Col 1st: ₱${cb.bucket.college1stSemRateTY}`}
                        {cb.bucket.college2ndSemRateTY > 0 && ` • 2nd: ₱${cb.bucket.college2ndSemRateTY}`}
                        {cb.bucket.shsRateTY > 0 && ` • SHS: ₱${cb.bucket.shsRateTY}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedBuckets.length === 1 && (() => {
            const single = selectedBuckets[0];
            const isOver = proposedBudget > single.currentAvailable + 0.009;
            const metrics = getRecentBucketMetrics(single);
            return (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#001A4D] mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Auto-Generated Proposal Fund Breakdown (Single Source Bucket)
                    </div>
                    <pre className="text-[11px] font-mono text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {formattedMiscBreakdown.description}
                    </pre>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-[#001A4D] uppercase tracking-wider">
                        Single-Bucket Balance Summary
                      </span>
                      <button
                        type="button"
                        onClick={() => setInspectedMiscBucket(single)}
                        title="View all transactions and total reconciliation"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-blue-200 text-[10px] font-bold text-[#0E4EBD] hover:bg-blue-50 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View All{metrics.totalTxCount > 0 ? ` (${metrics.totalTxCount})` : ''}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-gray-600">Gross Allocation ({activeConfig.activeSemester})</span>
                      <span className="font-mono font-bold text-[#001A4D]">
                        {formatCurrency(single.currentPool)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-gray-600">
                        {metrics.deductionCount > 1 ? 'Recent Used in Prior AP' : 'Used in Prior Approved AP'}
                      </span>
                      <span className="font-mono font-bold text-amber-800">
                        {metrics.recentDeduction > 0 ? `-${formatCurrency(metrics.recentDeduction)}` : formatCurrency(0)}
                      </span>
                    </div>
                    {(metrics.recentReturn > 0 || single.currentReturnedSurplus > 0) && (
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-gray-600">
                          {metrics.returnCount > 1 ? 'Recent Returned Surplus' : 'Returned Liquidation Surplus'}
                        </span>
                        <span className="font-mono font-bold text-purple-700">
                          +{formatCurrency(metrics.recentReturn)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                      <span className="font-bold text-gray-700">Available Balance</span>
                      <span className="font-mono font-black text-emerald-700">
                        {formatCurrency(single.currentAvailable)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Auto-Deducted on AP Approval</span>
                      <span className={`font-mono font-black ${isOver ? 'text-rose-700' : 'text-[#001A4D]'}`}>
                        {formatCurrency(proposedBudget)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {selectedBuckets.length >= 2 && (
            <div className="space-y-3 pt-2">
              {/* Maker-Specified Split Panel */}
              <div className="bg-slate-50 border border-blue-200 rounded-xl p-3.5 space-y-3">
                <div>
                  <h5 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider">
                    Maker-Specified Multi-Bucket Allocation (Auto-Balanced)
                  </h5>
                  <p className="text-[11px] text-gray-600">
                    Enter <strong>Amount to Pull (₱)</strong> in any bucket — the remaining buckets automatically adjust so the total strictly equals{' '}
                    <strong>Total Anticipated Expenses ({formatCurrency(proposedBudget)})</strong>.
                  </p>
                </div>

                <div className="space-y-2">
                  {selectedBuckets.map((cb) => {
                    const rowAlloc = miscAllocations.find((a) => a.bucketId === cb.bucket.id);
                    const val = rowAlloc?.allocatedAmount ?? 0;
                    const errMsg = allocationValidation.perBucketErrors[cb.bucket.id];
                    const metrics = getRecentBucketMetrics(cb);
                    return (
                      <div
                        key={cb.bucket.id}
                        className={`p-3 rounded-xl border bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          errMsg ? 'border-rose-400 ring-1 ring-rose-300' : 'border-gray-200'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#001A4D] truncate">
                              {cb.bucket.particular}
                            </span>
                            <button
                              type="button"
                              onClick={() => setInspectedMiscBucket(cb)}
                              title="View all transactions & totals for this bucket"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-[#0E4EBD] border border-slate-200 text-[10px] font-semibold cursor-pointer shrink-0"
                            >
                              <Eye className="w-3 h-3" />
                              <span>{metrics.totalTxCount > 0 ? `${metrics.totalTxCount}` : 'View'}</span>
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-600 font-mono">
                            <span>Gross: {formatCurrency(cb.currentPool)}</span>
                            <span className="text-amber-800">
                              {metrics.deductionCount > 1 ? 'Recent Used:' : 'Used in Prior APs:'}{' '}
                              {metrics.recentDeduction > 0 ? `-${formatCurrency(metrics.recentDeduction)}` : formatCurrency(0)}
                            </span>
                            {(metrics.recentReturn > 0 || cb.currentReturnedSurplus > 0) && (
                              <span className="text-purple-700 font-semibold">
                                {metrics.returnCount > 1 ? 'Recent Returned:' : 'Returned:'}{' '}
                                +{formatCurrency(metrics.recentReturn)}
                              </span>
                            )}
                            <span className="font-bold text-emerald-700">
                              Available: {formatCurrency(cb.currentAvailable)}
                            </span>
                          </div>
                          {errMsg && (
                            <p className="text-[11px] font-semibold text-rose-600">{errMsg}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-[11px] font-bold text-gray-700 whitespace-nowrap">
                            Amount to Pull (₱):
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={val}
                            onChange={(e) => handleBucketAmountChange(cb.bucket.id, e.target.value)}
                            className={`w-36 px-2.5 py-1.5 border rounded-lg text-xs text-right font-mono font-bold outline-none ${
                              errMsg
                                ? 'border-rose-400 bg-rose-50 text-rose-900'
                                : 'border-blue-300 bg-white text-[#001A4D] focus:ring-2 focus:ring-blue-500/20'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Real-time Allocation Totals Bar */}
                <div
                  className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                    allocationValidation.isValid
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-4 font-mono">
                    <span>
                      Total Anticipated Expenses: <strong>{formatCurrency(proposedBudget)}</strong>
                    </span>
                    <span>
                      Total Allocated:{' '}
                      <strong>{formatCurrency(allocationValidation.totalAllocated)}</strong>
                    </span>
                    <span>
                      Remaining to Allocate:{' '}
                      <strong>{formatCurrency(allocationValidation.remainingToAllocate)}</strong>
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      allocationValidation.isValid
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {allocationValidation.isValid ? 'Exact Match' : 'Allocation Mismatch'}
                  </span>
                </div>

                {allocationValidation.summaryError && (
                  <p className="text-[11px] font-semibold text-rose-700">
                    {allocationValidation.summaryError}
                  </p>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#001A4D] mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Auto-Generated Proposal Fund Breakdown ({selectedBuckets.length} Separate Bucket Projections)
                </div>
                <pre className="text-[11px] font-mono text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {formattedMiscBreakdown.description}
                </pre>
              </div>
            </div>
          )}

          {hasBucketShortage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Insufficient Bucket Balance:</strong> Anticipated expenses of{' '}
                <strong>{formatCurrency(proposedBudget)}</strong> exceed the combined remaining balance of{' '}
                <strong>{formatCurrency(formattedMiscBreakdown.totalAvailable)}</strong>.
              </div>
            </div>
          )}
        </div>
      )}

      {/* PANEL B: Student Contribution Live Enrolled Student Calculator + Retained Bucket Detection (SAS only) */}
      {value === 'student_contributions' && (
        <div className="p-4 bg-white border border-emerald-200 rounded-xl space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
              <Coins className="w-4 h-4 text-emerald-600" />
              Student Contribution Revenue &amp; Surplus Calculator
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTargetPreviewSearch('');
                  setShowTargetStudentsPreview(true);
                }}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Eye className="w-3.5 h-3.5" />
                View Target Students ({matchingStudents.length.toLocaleString()})
              </button>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                Live Active Enrolled: <strong>{activeStudents.length.toLocaleString()}</strong>
              </span>
            </div>
          </div>

          {/* Detected Previous Student Contribution Bucket Banner (SAS Only — Orgs use single Club Treasury Ledger) */}
          {isOfficer ? (
            <div className="p-3 rounded-xl border bg-purple-50/70 border-purple-200 text-purple-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-purple-900 block">
                  Single Organization Ledger Active ({organizationName || 'Club'} Treasury: {formatCurrency(orgTreasuryBalance)})
                </span>
                <span className="text-[11px] text-purple-800">
                  Collected student contributions and any unspent liquidation surplus flow straight into your Organization Ledger—no separate retained bucket needed.
                </span>
              </div>
            </div>
          ) : (
            <div
              className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                previousContribBucketBalance > 0
                  ? 'bg-purple-50/70 border-purple-200 text-purple-950'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {retainedLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  <span>Checking for retained buckets from previous Student Contribution activities...</span>
                </div>
              ) : previousContribBucketBalance > 0 ? (
                <>
                  <div>
                    <span className="font-bold text-purple-900 block">
                      Previous Student Contribution Bucket Detected: {formatCurrency(previousContribBucketBalance)}
                    </span>
                    <span className="text-[11px] text-purple-800">
                      Retained unspent surplus from prior Student Contribution events (Campus Student Activity Fund).
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-purple-300 rounded-xl text-[11px] font-bold text-purple-900 cursor-pointer hover:bg-purple-50 shrink-0">
                    <input
                      type="checkbox"
                      checked={localApplyRetained}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setLocalApplyRetained(next);
                        emitStudentContributionUpdate({ applyRetained: next });
                      }}
                      className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                    />
                    Apply Retained Bucket (+{formatCurrency(previousContribBucketBalance)})
                  </label>
                </>
              ) : (
                <span>
                  No previous Student Contribution surplus bucket detected (₱0.00) — calculating projected revenue strictly from the filtered students below.
                </span>
              )}
            </div>
          )}

          {/* Enrolled Student Target Audience Filters (Default: All Enrolled Students) */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {STUDENT_MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setContribMode(opt.key);
                      setManualCountEnabled(false);
                      if (opt.key === 'all') {
                        setSelectedYears([]);
                        setSelectedCourses([]);
                        setSelectedSections([]);
                      } else if (opt.key === 'shs') {
                        setSelectedYears([]);
                        setSelectedCourses([]);
                        setSelectedSections([]);
                      } else if (opt.key === 'college') {
                        setSelectedYears([]);
                        setSelectedCourses([]);
                        setSelectedSections([]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      contribMode === opt.key
                        ? 'bg-[#001A4D] text-white shadow-2xs'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {(selectedYears.length > 0 || selectedCourses.length > 0 || selectedSections.length > 0 || contribMode !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setContribMode('all');
                    setSelectedYears([]);
                    setSelectedCourses([]);
                    setSelectedSections([]);
                    setSectionSearch('');
                    setManualCountEnabled(false);
                  }}
                  className="text-[11px] font-semibold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to All Students
                </button>
              )}
            </div>

            {/* Granular Year Level / Program / Section Filters */}
            {(contribMode !== 'all' || availableYears.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* Year Levels */}
                <div className="bg-white border border-gray-200 rounded-lg p-2.5 max-h-40 overflow-y-auto">
                  <span className="block text-[10px] font-bold uppercase text-gray-500 mb-1.5">
                    Year Levels ({selectedYears.length || 'All'})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableYears.map((yr) => {
                      const active = selectedYears.includes(yr);
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => toggleSelection(selectedYears, setSelectedYears, yr)}
                          className={`px-2 py-1 rounded-md text-[10px] font-semibold border flex items-center gap-1 cursor-pointer ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-gray-700 border-gray-200 hover:bg-slate-100'
                          }`}
                        >
                          {active && <Check className="w-2.5 h-2.5" />}
                          {yr}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Courses / Strands */}
                <div className="bg-white border border-gray-200 rounded-lg p-2.5 max-h-40 overflow-y-auto">
                  <span className="block text-[10px] font-bold uppercase text-gray-500 mb-1.5">
                    Programs / Strands ({selectedCourses.length || 'All'})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleCourses.map((c) => {
                      const active = selectedCourses.includes(c.code);
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => toggleSelection(selectedCourses, setSelectedCourses, c.code)}
                          className={`px-2 py-1 rounded-md text-[10px] font-semibold border flex items-center gap-1 cursor-pointer ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-gray-700 border-gray-200 hover:bg-slate-100'
                          }`}
                        >
                          {active && <Check className="w-2.5 h-2.5" />}
                          {c.code}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sections */}
                <div className="bg-white border border-gray-200 rounded-lg p-2.5 max-h-40 flex flex-col">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-gray-500">
                      Sections ({selectedSections.length || 'All'})
                    </span>
                    <div className="relative">
                      <Search className="w-2.5 h-2.5 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={sectionSearch}
                        onChange={(e) => setSectionSearch(e.target.value)}
                        placeholder="Search section"
                        className="pl-5 pr-1.5 py-0.5 text-[10px] border border-gray-200 rounded bg-slate-50 w-24 outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 overflow-y-auto">
                    {visibleSections.length === 0 ? (
                      <span className="text-[10px] text-gray-400">No sections matched</span>
                    ) : (
                      visibleSections.slice(0, 60).map((sec) => {
                        const active = selectedSections.includes(sec.name);
                        return (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => toggleSelection(selectedSections, setSelectedSections, sec.name)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                              active
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-slate-50 text-gray-700 border-gray-200 hover:bg-slate-100'
                            }`}
                          >
                            {sec.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contribution Rate & Auto-Calculated Revenue Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                Contribution Rate per Student (₱)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={studentContributionRate || 0}
                onChange={(e) => {
                  const rate = Math.max(0, parseFloat(e.target.value) || 0);
                  emitStudentContributionUpdate({ rate });
                }}
                className="w-full px-3 py-2 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-gray-700">
                  Contributing Students
                </label>
                <label className="text-[10px] text-gray-500 flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualCountEnabled}
                    onChange={(e) => {
                      const nextManual = e.target.checked;
                      setManualCountEnabled(nextManual);
                      if (nextManual) {
                        setManualStudentCount(matchingStudents.length);
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  Manual
                </label>
              </div>
              <input
                type="number"
                min="0"
                disabled={!manualCountEnabled}
                value={effectiveContribStudentCount}
                onChange={(e) => {
                  const cnt = Math.max(0, parseInt(e.target.value, 10) || 0);
                  setManualStudentCount(cnt);
                  emitStudentContributionUpdate({ count: cnt });
                }}
                className="w-full px-3 py-2 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 bg-white disabled:bg-emerald-50/70 disabled:text-emerald-900 font-mono"
              />
              <span className="block text-[10px] text-gray-500 mt-0.5 truncate">
                {audienceSummary}
              </span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
              <span className="block text-[10px] font-bold uppercase text-emerald-700">
                Projected Collection Revenue
              </span>
              <span className="text-sm font-black font-mono text-emerald-900">
                {formatCurrency(formattedContrib.totalProjected)}
              </span>
              {localApplyRetained && previousContribBucketBalance > 0 && (
                <span className="block text-[10px] font-semibold text-purple-800 mt-0.5">
                  + {formatCurrency(previousContribBucketBalance)} Retained Bucket
                </span>
              )}
            </div>
          </div>

          <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-xl text-[11px] text-emerald-900">
            <strong>Isolated Surplus Rule:</strong> Unspent cash surplus after Financial Liquidation stays permanently in{' '}
            <strong>
              {isOfficer
                ? `${organizationName || 'your Organization'}'s Treasury Balance`
                : 'a Retained Student Contribution Bucket'}
            </strong>{' '}
            (never mixed with School Miscellaneous Fees and does not reset at School Year-end).
          </div>
        </div>
      )}

      {/* PANEL C: Non-Monetary Activity Info Banner */}
      {value === 'zero_budget' && (
        <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl flex items-start gap-3 text-xs text-slate-800">
          <Ban className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-slate-900">
              Non-Monetary Activity (₱0.00 Budget) — Active
            </p>
            <p className="text-slate-600 leading-relaxed">
              This activity requires <strong>₱0.00</strong> financial allocation and collects no fees. It is automatically{' '}
              <strong>exempt from Disbursement Vouchers and Financial Liquidation</strong> upon approval.
            </p>
          </div>
        </div>
      )}

      {/* Shortage Warning for Organization Fund */}
      {hasOrgShortage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-900">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Insufficient Club Treasury Funds:</strong>
            Proposed budget of <strong className="font-mono">{formatCurrency(proposedBudget)}</strong>{' '}
            exceeds your club&apos;s available balance of{' '}
            <strong className="font-mono">{formatCurrency(orgTreasuryBalance)}</strong>.
          </div>
        </div>
      )}

      {/* Shared Bucket Financial Summary & All Activity Ledger Modal */}
      <MiscFeeBucketTransactionsModal
        isOpen={Boolean(inspectedMiscBucket)}
        onClose={() => setInspectedMiscBucket(null)}
        bucket={inspectedMiscBucket}
        schoolYear={activeConfig.schoolYear}
        activeSemester={activeConfig.activeSemester}
        ledgerEntries={miscFeeLedger}
      />

      {/* Target Contributing Students Preview Modal */}
      {showTargetStudentsPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-[#001A4D] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#FFD41C]" />
                  Selected Contributing Students ({matchingStudents.length.toLocaleString()})
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5">{audienceSummary}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTargetStudentsPreview(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={targetPreviewSearch}
                  onChange={(e) => setTargetPreviewSearch(e.target.value)}
                  placeholder="Search by Student ID, name, course, year, or section..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#001A4D]"
                />
              </div>
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                Rate: <strong>{formatCurrency(studentContributionRate || 0)}</strong> / student
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 sticky top-0 text-[10px] font-bold uppercase text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Student ID</th>
                    <th className="px-4 py-2.5">Student Name</th>
                    <th className="px-4 py-2.5">Program / Strand</th>
                    <th className="px-4 py-2.5">Year</th>
                    <th className="px-4 py-2.5">Section</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchingStudents
                    .filter((s: any) => {
                      const q = targetPreviewSearch.trim().toLowerCase();
                      if (!q) return true;
                      const fullName = `${s.firstName || ''} ${s.lastName || ''} ${s.name || ''}`.toLowerCase();
                      const sid = String(s.studentId || s.schoolId || '').toLowerCase();
                      const crs = String(s.courseCode || s.course || '').toLowerCase();
                      const yr = String(s.yearLevel || '').toLowerCase();
                      const sec = String(s.section || '').toLowerCase();
                      return fullName.includes(q) || sid.includes(q) || crs.includes(q) || yr.includes(q) || sec.includes(q);
                    })
                    .slice(0, 300)
                    .map((s: any, idx: number) => {
                      const fullName = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.name || 'Student';
                      return (
                        <tr key={s.id || idx} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-mono text-slate-700">{s.studentId || s.schoolId || '—'}</td>
                          <td className="px-4 py-2 font-semibold text-slate-900">{fullName}</td>
                          <td className="px-4 py-2 text-slate-600">{s.courseCode || s.course || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{s.yearLevel || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{s.section || '—'}</td>
                        </tr>
                      );
                    })}
                  {matchingStudents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No active students match the selected filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {matchingStudents.length > 300 && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                  Showing first 300 students. Use the search box to filter specific students.
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>Payables will be automatically generated for these filtered students once AP is approved.</span>
              <button
                type="button"
                onClick={() => setShowTargetStudentsPreview(false)}
                className="px-4 py-2 rounded-xl bg-[#001A4D] text-white font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
