export type FundSourceDisplayCategory =
  | 'misc'
  | 'club_funded'
  | 'student_allocation'
  | 'student_contribution'
  | 'non_monetary';

export interface FundSourceDisplayInfo {
  category: FundSourceDisplayCategory;
  label: string;
  detail: string;
  badgeClass: string;
}

export const SAS_FUND_SOURCE_FILTER_OPTIONS: ReadonlyArray<{
  value: FundSourceDisplayCategory;
  label: string;
}> = [
  { value: 'misc', label: 'Miscellaneous Fee' },
  { value: 'student_allocation', label: 'Student Allocation' },
  { value: 'non_monetary', label: 'Non-Monetary' },
];

export const ORG_FUND_SOURCE_FILTER_OPTIONS: ReadonlyArray<{
  value: FundSourceDisplayCategory;
  label: string;
}> = [
  { value: 'misc', label: 'Miscellaneous Fee' },
  { value: 'club_funded', label: 'Club Funded' },
  { value: 'student_contribution', label: 'Student Contribution' },
  { value: 'non_monetary', label: 'Non-Monetary' },
];

function extractMiscParticularSummary(event: any): string {
  const names: string[] = [];

  if (Array.isArray(event?.miscFeeBucketNames)) {
    for (const n of event.miscFeeBucketNames) {
      if (typeof n === 'string' && n.trim() && !names.includes(n.trim())) {
        names.push(n.trim());
      }
    }
  }
  if (Array.isArray(event?.miscFeeBucketAllocations)) {
    for (const a of event.miscFeeBucketAllocations) {
      const n = a?.bucketName;
      if (typeof n === 'string' && n.trim() && !names.includes(n.trim())) {
        names.push(n.trim());
      }
    }
  }
  if (Array.isArray(event?.allocations)) {
    for (const a of event.allocations) {
      if (a?.fundType === 'misc_fee' && typeof a?.bucketName === 'string' && a.bucketName.trim()) {
        const n = a.bucketName.trim();
        if (!names.includes(n)) names.push(n);
      }
    }
  }
  if (names.length === 0 && typeof event?.miscFeeBucketName === 'string' && event.miscFeeBucketName.trim()) {
    names.push(event.miscFeeBucketName.trim());
  }

  if (names.length === 0) return 'School Activity Pool';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

function inferEffectiveRawFundingSource(event: any, isSasAuthor: boolean): string {
  const explicit = String(event?.fundingSource || '').trim().toLowerCase();
  if (explicit) return explicit;

  if (Boolean(event?.studentPayablesEnabled)) {
    return 'student_contributions';
  }

  const hasMiscAllocations =
    Boolean(event?.miscFeeBucketId) ||
    (Array.isArray(event?.miscFeeBucketIds) && event.miscFeeBucketIds.length > 0) ||
    (Array.isArray(event?.miscFeeBucketNames) && event.miscFeeBucketNames.length > 0) ||
    (Array.isArray(event?.allocations) && event.allocations.some((a: any) => a?.fundType === 'misc_fee'));

  if (hasMiscAllocations) {
    return 'school_budget';
  }

  const budget = Number(event?.totalApprovedBudget ?? event?.totalRequestedBudget ?? 0) || 0;
  if (budget <= 0) {
    return 'zero_budget';
  }

  return isSasAuthor ? 'school_budget' : 'organization_funds';
}

/**
 * Resolves the normalized Fund Source label, badge styling, and subtitle detail.
 * - SAS Admin activities resolve strictly to the 3 institutional categories:
 *   Miscellaneous Fee, Student Allocation, Non-Monetary.
 * - Organization activities resolve to the 4 club categories:
 *   Miscellaneous Fee, Club Funded, Student Contribution, Non-Monetary.
 */
export function resolveEventFundSourceDisplay(
  event: any,
  isSasAuthor: boolean
): FundSourceDisplayInfo {
  const rawSource = inferEffectiveRawFundingSource(event, isSasAuthor);

  if (rawSource === 'zero_budget') {
    return {
      category: 'non_monetary',
      label: 'Non-Monetary',
      detail: '₱0.00 Budget',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    };
  }

  if (rawSource === 'student_contributions' || rawSource === 'retained_sao_fund') {
    const rate = Number(event?.studentContributionRate ?? event?.suggestedFeePerStudent ?? 0) || 0;
    const rateText = rate > 0 ? `₱${rate.toLocaleString('en-US')}/student` : undefined;

    if (isSasAuthor) {
      return {
        category: 'student_allocation',
        label: 'Student Allocation',
        detail: rateText || 'SAS Student Pool',
        badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
      };
    }

    return {
      category: 'student_contribution',
      label: 'Student Contribution',
      detail: rateText || 'Student Payables',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }

  if (rawSource === 'organization_funds' && !isSasAuthor) {
    return {
      category: 'club_funded',
      label: 'Club Funded',
      detail: 'Club Treasury Ledger',
      badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    };
  }

  return {
    category: 'misc',
    label: 'Miscellaneous Fee',
    detail: extractMiscParticularSummary(event),
    badgeClass: 'bg-blue-50 text-[#001A4D] border-blue-200',
  };
}
