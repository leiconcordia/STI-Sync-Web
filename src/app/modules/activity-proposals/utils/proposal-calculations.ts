/**
 * src/app/modules/activity-proposals/utils/proposal-calculations.ts
 *
 * Automated calculation engines for financial projections and STI 15-day policy verification.
 */

import { addDays, differenceInCalendarDays, parseISO, isValid, format } from 'date-fns';
import type {
  FinancialLineItem,
  FinancialProjections,
  ProposalBucketAllocation,
  ProposalSession,
  ProposalTask,
  SurplusReturnAllocation,
  DeficitDeductionAllocation,
} from '../types/proposal.types';

/**
 * Warning message shown when projected revenue is lower than projected expenses.
 */
export const PROJECTED_REVENUE_DEFICIT_WARNING =
  'Projected revenue cannot be less than total expenses. Please add a funding source (e.g., Org Funds or Student Miscellaneous) or reduce expenses.';

/**
 * Compute authoritative Total Revenue, Total Expenses, Projected Balance, and whether
 * projected revenue falls short of total expenses (Balance < 0).
 */
export function checkProjectedBalance(
  financialProjections?: Partial<FinancialProjections> | null,
  fundingSource?: string | null
): {
  totalRevenue: number;
  totalExpenses: number;
  balance: number;
  isDeficit: boolean;
} {
  const revItems = Array.isArray(financialProjections?.revenues)
    ? financialProjections.revenues
    : [];
  const rawExpItems = Array.isArray(financialProjections?.expenses)
    ? financialProjections.expenses
    : Array.isArray((financialProjections as any)?.expenditures)
    ? (financialProjections as any).expenditures
    : [];

  const totalRevenue =
    revItems.length > 0
      ? revItems.reduce(
          (sum: number, item: any) =>
            sum + (Number(item?.totalAmount ?? item?.thisYearProposed) || 0),
          0
        )
      : Number(financialProjections?.totalRevenue || 0);

  const totalExpenses =
    rawExpItems.length > 0
      ? rawExpItems.reduce(
          (sum: number, item: any) =>
            sum + (Number(item?.totalAmount ?? item?.thisYearProposed) || 0),
          0
        )
      : Number(financialProjections?.totalExpenses || 0);

  const roundedRev = Math.round(totalRevenue * 100) / 100;
  const roundedExp = Math.round(totalExpenses * 100) / 100;
  const balance = Math.round((roundedRev - roundedExp) * 100) / 100;
  const isDeficit =
    fundingSource === 'zero_budget' ? roundedExp > 0 && balance < 0 : balance < 0;

  return {
    totalRevenue: roundedRev,
    totalExpenses: roundedExp,
    balance,
    isDeficit,
  };
}

/**
 * Recalculate line totals and balance for the formal 6-column STI financial matrix
 */
export function calculateFinancialTotals(
  revenues: FinancialLineItem[],
  expenses: FinancialLineItem[]
): FinancialProjections {
  const cleanRevenues = revenues.map((item) => {
    const proposed = Number(item.thisYearProposed) || 0;
    const lastYear = Number(item.lastYearActual) || 0;
    const adjustment = proposed - lastYear;
    const totalAmount = proposed;
    return {
      ...item,
      adjustment,
      totalAmount,
    };
  });

  const cleanExpenses = expenses.map((item) => {
    const proposed = Number(item.thisYearProposed) || 0;
    const lastYear = Number(item.lastYearActual) || 0;
    const adjustment = proposed - lastYear;
    const totalAmount = proposed;
    return {
      ...item,
      adjustment,
      totalAmount,
    };
  });

  const totalRevenue = cleanRevenues.reduce(
    (sum, item) => sum + (Number(item.totalAmount) || 0),
    0
  );
  const totalExpenses = cleanExpenses.reduce(
    (sum, item) => sum + (Number(item.totalAmount) || 0),
    0
  );
  const balance = totalRevenue - totalExpenses;

  return {
    revenues: cleanRevenues,
    expenses: cleanExpenses,
    totalRevenue,
    totalExpenses,
    balance,
  };
}

/**
 * Check compliance with the STI 15-Calendar-Day Rule:
 * "Note: This proposal must be submitted to the Administrator at least 15 calendar days before the start of the initial task."
 */
export function check15DayRule(
  submissionDateStr: string,
  sessions: ProposalSession[] = [],
  tasks: ProposalTask[] = [],
  eventDate?: string
): {
  isCompliant: boolean;
  daysDiff: number;
  earliestDate: string | null;
  policyRequirement: string;
} {
  const dates: Date[] = [];

  // 1. Collect target implementation / event date
  if (eventDate) {
    const parsed = parseISO(eventDate);
    if (isValid(parsed)) {
      dates.push(parsed);
    }
  }

  // 2. Collect session dates
  if (sessions && sessions.length > 0) {
    sessions.forEach((s) => {
      if (s.date) {
        const parsed = parseISO(s.date);
        if (isValid(parsed)) dates.push(parsed);
      }
    });
  }

  // 3. Collect task completion dates (15-day rule applies before the start of the initial task)
  if (tasks && tasks.length > 0) {
    tasks.forEach((t) => {
      if (t.completionDate) {
        const parsed = parseISO(t.completionDate);
        if (isValid(parsed)) dates.push(parsed);
      }
    });
  }

  if (dates.length === 0) {
    return {
      isCompliant: true,
      daysDiff: 15,
      earliestDate: null,
      policyRequirement: '15 calendar days before start of initial task/event',
    };
  }

  // Find minimum date
  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
  const submissionDate = submissionDateStr ? new Date(submissionDateStr) : new Date();

  const daysDiff = differenceInCalendarDays(earliest, submissionDate);
  const isCompliant = daysDiff >= 15;

  return {
    isCompliant,
    daysDiff,
    earliestDate: earliest.toISOString().split('T')[0],
    policyRequirement: '15 calendar days before start of initial task/event',
  };
}

export const POST_EVENT_TASK_WINDOW_DAYS = 15;

/**
 * Computes valid task completion date bounds for Step 5 Task List:
 * - Minimum: today (if Urgent) or today + 15 calendar days (standard rule).
 * - Maximum: up to +15 calendar days after the latest implementation/session date
 *   (allowing post-event wrap-up, FL, and PAR tasks, but never past +15 days).
 */
export function resolveTaskDateBounds(params: {
  eventDate?: string;
  sessions?: Array<{ date?: string }>;
  isUrgent?: boolean;
  todayStr?: string;
}): {
  todayStr: string;
  standardMinDate: string;
  minTaskDate: string;
  implementationStartDate: string;
  implementationEndDate: string;
  maxTaskDate: string;
} {
  const now = params.todayStr && isValid(parseISO(params.todayStr))
    ? parseISO(params.todayStr)
    : new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const standardMinDate = format(addDays(now, 15), 'yyyy-MM-dd');
  const minTaskDate = params.isUrgent ? todayStr : standardMinDate;

  const validDates = Array.from(
    new Set(
      [
        params.eventDate || '',
        ...((params.sessions || []).map((s) => s?.date || '')),
      ]
        .filter((d) => Boolean(d) && isValid(parseISO(d)))
    )
  ).sort();

  const implementationStartDate = validDates[0] || '';
  const implementationEndDate = validDates[validDates.length - 1] || '';
  const maxTaskDate = implementationEndDate
    ? format(addDays(parseISO(implementationEndDate), POST_EVENT_TASK_WINDOW_DAYS), 'yyyy-MM-dd')
    : '';

  return {
    todayStr,
    standardMinDate,
    minTaskDate,
    implementationStartDate,
    implementationEndDate,
    maxTaskDate,
  };
}

/**
 * Format currency in Philippine Peso (PHP)
 */
export function formatPHP(amount: number | string | null | undefined): string {
  const num =
    typeof amount === 'number'
      ? amount
      : typeof amount === 'string'
      ? Number(amount.replace(/[₱,\s]/g, ''))
      : Number(amount);
  const safeNum = isNaN(num) ? 0 : num;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNum);
}

/**
 * Format a date string (YYYY-MM-DD, ISO, etc.) to long format e.g. "November 12, 2026"
 */
export function formatDateLong(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  try {
    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      if (!trimmed) return '';
      if (/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(trimmed)) {
        return trimmed;
      }
      const parsed = parseISO(trimmed);
      if (isValid(parsed)) {
        return format(parsed, 'MMMM d, yyyy');
      }
      const fallback = new Date(trimmed);
      if (!isNaN(fallback.getTime())) {
        return new Intl.DateTimeFormat('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(fallback);
      }
    } else if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      return format(dateInput, 'MMMM d, yyyy');
    }
  } catch {
    // fallback
  }
  return String(dateInput);
}

export interface BucketAllocationValidationResult {
  isValid: boolean;
  totalAllocated: number;
  remainingToAllocate: number;
  perBucketErrors: Record<string, string>;
  summaryError?: string;
}

/**
 * Validates maker-specified bucket split rules for Activity Proposal (AP):
 * - Single bucket: Total Anticipated Expenses <= Available Balance (no split needed).
 * - Two+ buckets: each Amount to Pull >= 0 and <= Available Balance, and
 *   sum(Amount to Pull) strictly equals Total Anticipated Expenses.
 */
export function validateBucketAllocations(params: {
  fundingSource?: string;
  totalExpenses: number;
  allocations?: ProposalBucketAllocation[];
}): BucketAllocationValidationResult {
  const totalExpenses = Math.round((Number(params.totalExpenses) || 0) * 100) / 100;
  const allocations = Array.isArray(params.allocations) ? params.allocations : [];
  const perBucketErrors: Record<string, string> = {};

  if (params.fundingSource === 'zero_budget') {
    return {
      isValid: true,
      totalAllocated: 0,
      remainingToAllocate: 0,
      perBucketErrors: {},
    };
  }

  if (params.fundingSource === 'school_budget' && allocations.length === 0) {
    return {
      isValid: totalExpenses === 0,
      totalAllocated: 0,
      remainingToAllocate: totalExpenses,
      perBucketErrors: {},
      summaryError:
        totalExpenses > 0
          ? 'Please select at least one Miscellaneous Fee Particular bucket.'
          : undefined,
    };
  }

  if (allocations.length === 1) {
    const only = allocations[0];
    const avail = only.availableAmount;
    const allocated =
      only.allocatedAmount > 0 ? only.allocatedAmount : totalExpenses;
    if (avail !== undefined && totalExpenses > avail + 0.009) {
      const msg = `Anticipated expenses (${formatPHP(totalExpenses)}) exceed "${only.bucketName}" Available Balance (${formatPHP(avail)}).`;
      perBucketErrors[only.bucketId] = msg;
      return {
        isValid: false,
        totalAllocated: allocated,
        remainingToAllocate: 0,
        perBucketErrors,
        summaryError: msg,
      };
    }
    return {
      isValid: true,
      totalAllocated: totalExpenses,
      remainingToAllocate: 0,
      perBucketErrors: {},
    };
  }

  // 2 or more buckets (Maker-Specified Split)
  let totalAllocated = 0;
  for (const a of allocations) {
    const val = Number(a.allocatedAmount);
    if (Number.isNaN(val) || val < 0) {
      perBucketErrors[a.bucketId] = 'Amount to Pull must be ₱0.00 or greater.';
    } else if (a.availableAmount !== undefined && val > a.availableAmount + 0.009) {
      perBucketErrors[a.bucketId] = `Exceeds available balance (${formatPHP(a.availableAmount)}).`;
    }
    totalAllocated += Math.max(0, Number.isNaN(val) ? 0 : val);
  }
  totalAllocated = Math.round(totalAllocated * 100) / 100;
  const remainingToAllocate = Math.round((totalExpenses - totalAllocated) * 100) / 100;

  let summaryError: string | undefined;
  if (Math.abs(remainingToAllocate) >= 0.01) {
    summaryError =
      remainingToAllocate > 0
        ? `Remaining ${formatPHP(remainingToAllocate)} unallocated. Total Allocated (${formatPHP(totalAllocated)}) must strictly equal Total Anticipated Expenses (${formatPHP(totalExpenses)}).`
        : `Over-allocated by ${formatPHP(Math.abs(remainingToAllocate))}. Total Allocated (${formatPHP(totalAllocated)}) must strictly equal Total Anticipated Expenses (${formatPHP(totalExpenses)}).`;
  }

  return {
    isValid: Object.keys(perBucketErrors).length === 0 && !summaryError,
    totalAllocated,
    remainingToAllocate,
    perBucketErrors,
    summaryError,
  };
}

/**
 * Automatically balances maker-specified split across 2+ buckets so their sum
 * stays equal to `totalExpenses`. When `editedBucketId` is updated (e.g. 24k on
 * bucket 1 out of 50k expenses), the remaining buckets automatically cover the difference.
 */
export function rebalanceBucketAllocations(params: {
  allocations: ProposalBucketAllocation[];
  totalExpenses: number;
  editedBucketId?: string;
  editedAmount?: number;
}): ProposalBucketAllocation[] {
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const totalExpenses = Math.max(0, round2(params.totalExpenses));
  const list = Array.isArray(params.allocations) ? params.allocations : [];

  if (list.length === 0) return [];
  if (list.length === 1) {
    return [{ ...list[0], allocatedAmount: totalExpenses }];
  }

  const next = list.map((a) => ({ ...a }));
  const editedIdx = params.editedBucketId
    ? next.findIndex((a) => a.bucketId === params.editedBucketId)
    : -1;

  if (editedIdx !== -1 && params.editedAmount !== undefined) {
    const editedVal = Math.max(0, round2(params.editedAmount));
    next[editedIdx].allocatedAmount = editedVal;

    let remaining = Math.max(0, round2(totalExpenses - editedVal));
    // Walk through other buckets starting right after editedIdx so the next bucket covers first
    const otherIndices: number[] = [];
    for (let offset = 1; offset < next.length; offset++) {
      otherIndices.push((editedIdx + offset) % next.length);
    }

    otherIndices.forEach((idx, pos) => {
      const avail = next[idx].availableAmount;
      const isLastOther = pos === otherIndices.length - 1;
      if (isLastOther) {
        next[idx].allocatedAmount = Math.max(0, round2(remaining));
        remaining = 0;
      } else {
        const cap = avail !== undefined ? Math.max(0, avail) : remaining;
        const take = Math.min(remaining, cap);
        next[idx].allocatedAmount = Math.max(0, round2(take));
        remaining = Math.max(0, round2(remaining - take));
      }
    });
    return next;
  }

  // Initial / expense-change distribution: allocate cleanly up to available balance, remainder on final bucket
  let remaining = totalExpenses;
  next.forEach((item, idx) => {
    const isLast = idx === next.length - 1;
    if (isLast) {
      item.allocatedAmount = Math.max(0, round2(remaining));
      remaining = 0;
    } else {
      const cap = item.availableAmount !== undefined ? Math.max(0, item.availableAmount) : remaining;
      const take = Math.min(remaining, cap);
      item.allocatedAmount = Math.max(0, round2(take));
      remaining = Math.max(0, round2(remaining - take));
    }
  });
  return next;
}

export interface SurplusReturnValidationResult {
  isValid: boolean;
  totalReturned: number;
  remainingSurplusToAssign: number;
  requiresCashierReceipt: boolean;
  perBucketErrors: Record<string, string>;
  summaryError?: string;
}

/**
 * Validates SAS/Admin Surplus Return Allocation during Financial Liquidation (FL) approval:
 * - Each bucket Return Amount >= 0 and <= original allocatedAmount pulled.
 * - Sum of Return Amounts strictly equals Total Surplus.
 * - Cashier Return Receipt required whenever any Miscellaneous Fee bucket receives > 0.
 */
export function validateSurplusReturnAllocations(params: {
  totalSurplus: number;
  rows: SurplusReturnAllocation[];
  isSasEvent?: boolean;
}): SurplusReturnValidationResult {
  const totalSurplus = Math.max(0, Math.round((Number(params.totalSurplus) || 0) * 100) / 100);
  const rows = Array.isArray(params.rows) ? params.rows : [];
  const perBucketErrors: Record<string, string> = {};

  if (totalSurplus <= 0 || rows.length === 0) {
    return {
      isValid: true,
      totalReturned: 0,
      remainingSurplusToAssign: 0,
      requiresCashierReceipt: false,
      perBucketErrors: {},
    };
  }

  let totalReturned = 0;
  let requiresCashierReceipt = false;

  for (const r of rows) {
    const ret = Number(r.returnAmount);
    const maxCap = Math.max(0, Number(r.originalAllocatedAmount) || 0);
    if (Number.isNaN(ret) || ret < 0) {
      perBucketErrors[r.bucketId] = 'Return amount cannot be negative.';
    } else if (rows.length >= 2 && maxCap > 0 && ret > maxCap + 0.009) {
      perBucketErrors[r.bucketId] = `Cannot exceed originally pulled ${formatPHP(maxCap)}.`;
    }
    const safeRet = Math.max(0, Number.isNaN(ret) ? 0 : ret);
    const isSasRetainedTarget =
      Boolean(params.isSasEvent) &&
      (r.fundType === 'student_contributions' ||
        r.fundType === 'student_contribution_retained' ||
        r.bucketId === 'SAO_CAMPUS' ||
        r.bucketId === 'CONTRIB_NEW');
    if ((r.fundType === 'misc_fee' || isSasRetainedTarget) && safeRet > 0.009) {
      requiresCashierReceipt = true;
    }
    totalReturned += safeRet;
  }

  totalReturned = Math.round(totalReturned * 100) / 100;
  const remainingSurplusToAssign = Math.round((totalSurplus - totalReturned) * 100) / 100;

  let summaryError: string | undefined;
  if (Math.abs(remainingSurplusToAssign) >= 0.01) {
    summaryError =
      remainingSurplusToAssign > 0
        ? `Assign ${formatPHP(remainingSurplusToAssign)} more so Return Amounts strictly equal Total Surplus (${formatPHP(totalSurplus)}).`
        : `Return Amounts exceed Total Surplus by ${formatPHP(Math.abs(remainingSurplusToAssign))}. Adjust so total strictly equals ${formatPHP(totalSurplus)}.`;
  }

  return {
    isValid: Object.keys(perBucketErrors).length === 0 && !summaryError,
    totalReturned,
    remainingSurplusToAssign,
    requiresCashierReceipt,
    perBucketErrors,
    summaryError,
  };
}

/**
 * Auto-populates or rebalances Surplus Return Allocations so all buckets sum to exact Total Surplus
 * (e.g., entering ₱2,000 in Bucket 1 auto-fills the remaining surplus in Bucket 2, capped per bucket's original pull).
 */
export function rebalanceSurplusReturnAllocations(params: {
  totalSurplus: number;
  rows: SurplusReturnAllocation[];
  editedBucketId?: string;
  editedAmount?: number;
}): SurplusReturnAllocation[] {
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const totalSurplus = Math.max(0, round2(params.totalSurplus));
  const list = Array.isArray(params.rows) ? params.rows : [];

  if (list.length === 0) return [];
  if (list.length === 1) {
    return [{ ...list[0], returnAmount: totalSurplus }];
  }

  const next = list.map((r) => ({ ...r }));
  const editedIdx = params.editedBucketId
    ? next.findIndex((r) => r.bucketId === params.editedBucketId)
    : -1;

  if (editedIdx !== -1 && params.editedAmount !== undefined) {
    const editedCap = Number(next[editedIdx].originalAllocatedAmount) > 0
      ? Math.min(totalSurplus, round2(next[editedIdx].originalAllocatedAmount))
      : totalSurplus;
    const editedVal = Math.min(editedCap, Math.max(0, round2(params.editedAmount)));
    next[editedIdx].returnAmount = editedVal;

    let remaining = Math.max(0, round2(totalSurplus - editedVal));
    const otherIndices: number[] = [];
    for (let offset = 1; offset < next.length; offset++) {
      otherIndices.push((editedIdx + offset) % next.length);
    }

    otherIndices.forEach((idx, pos) => {
      const cap = Number(next[idx].originalAllocatedAmount) > 0
        ? round2(next[idx].originalAllocatedAmount)
        : remaining;
      const isLastOther = pos === otherIndices.length - 1;
      const take = isLastOther ? Math.min(remaining, cap) : Math.min(remaining, cap);
      next[idx].returnAmount = Math.max(0, round2(take));
      remaining = Math.max(0, round2(remaining - next[idx].returnAmount));
    });
    return next;
  }

  // Initial auto-populate: proportional by originalAllocatedAmount, capped at original pull
  const totalOrig = next.reduce((s, r) => s + Math.max(0, Number(r.originalAllocatedAmount) || 0), 0);
  let remaining = totalSurplus;
  next.forEach((row, idx) => {
    const cap = Math.max(0, round2(row.originalAllocatedAmount || 0));
    const isLast = idx === next.length - 1;
    let share = isLast
      ? remaining
      : totalOrig > 0
        ? round2(totalSurplus * (cap / totalOrig))
        : round2(totalSurplus / next.length);
    if (cap > 0) share = Math.min(share, cap);
    share = Math.min(remaining, Math.max(0, round2(share)));
    row.returnAmount = share;
    remaining = Math.max(0, round2(remaining - share));
  });

  // Top up any leftover cents into buckets that still have headroom
  if (remaining > 0.009) {
    for (const row of next) {
      if (remaining <= 0.009) break;
      const cap = Number(row.originalAllocatedAmount) > 0 ? round2(row.originalAllocatedAmount) : totalSurplus;
      const headroom = Math.max(0, round2(cap - row.returnAmount));
      const add = Math.min(remaining, headroom);
      if (add > 0) {
        row.returnAmount = round2(row.returnAmount + add);
        remaining = Math.max(0, round2(remaining - add));
      }
    }
  }

  return next;
}

export interface DeficitDeductionValidationResult {
  isValid: boolean;
  totalDeducted: number;
  remainingDeficitToAssign: number;
  totalCapacityAvailable: number;
  needsAdditionalBucket: boolean;
  requiresReimbursementProof: boolean;
  perBucketErrors: Record<string, string>;
  summaryError?: string;
}

/**
 * Waterfall-allocates an overspent deficit sequentially across selected buckets (Bucket 1 -> Bucket 2 -> ...),
 * capping each bucket at its live availableBalance so insufficient Bucket 1 cascades automatically to Bucket 2.
 */
export function computeWaterfallDeficitAllocations(params: {
  totalDeficit: number;
  rows: DeficitDeductionAllocation[];
}): DeficitDeductionAllocation[] {
  let rem = Math.max(0, Math.round((Number(params.totalDeficit) || 0) * 100) / 100);
  const rows = Array.isArray(params.rows) ? params.rows : [];
  return rows.map((row) => {
    const cap = Math.max(0, Math.round((Number(row.availableBalance) || 0) * 100) / 100);
    const take = Math.min(rem, cap);
    rem = Math.round((rem - take) * 100) / 100;
    return {
      ...row,
      deductAmount: Math.round(take * 100) / 100,
    };
  });
}

/**
 * Auto-rebalances Deficit Deduction Allocations when the user edits one bucket's deduction amount
 * (e.g., entering ₱2,000 in Bucket 1 cascades remaining deficit automatically to Bucket 2..N,
 * capped by each bucket's live availableBalance).
 */
export function rebalanceDeficitDeductionAllocations(params: {
  totalDeficit: number;
  rows: DeficitDeductionAllocation[];
  editedBucketId?: string;
  editedAmount?: number;
}): DeficitDeductionAllocation[] {
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const totalDeficit = Math.max(0, round2(params.totalDeficit));
  const list = Array.isArray(params.rows) ? params.rows : [];

  if (list.length === 0) return [];
  if (!params.editedBucketId || params.editedAmount === undefined) {
    return computeWaterfallDeficitAllocations({ totalDeficit, rows: list });
  }

  const next = list.map((r) => ({ ...r }));
  const editedIdx = next.findIndex((r) => r.bucketId === params.editedBucketId);
  if (editedIdx === -1) {
    return computeWaterfallDeficitAllocations({ totalDeficit, rows: next });
  }

  const editedCap = Math.max(0, round2(next[editedIdx].availableBalance));
  const editedVal = Math.min(totalDeficit, editedCap, Math.max(0, round2(params.editedAmount)));
  next[editedIdx].deductAmount = editedVal;

  let remaining = Math.max(0, round2(totalDeficit - editedVal));
  for (let offset = 1; offset < next.length; offset++) {
    const idx = (editedIdx + offset) % next.length;
    const cap = Math.max(0, round2(next[idx].availableBalance));
    const take = Math.min(remaining, cap);
    next[idx].deductAmount = Math.max(0, round2(take));
    remaining = Math.max(0, round2(remaining - take));
  }

  return next;
}

/**
 * Validates Maker/SAS Overspent Deficit Deduction Allocation during post-approval Liquidation Settlement:
 * - No unrecorded absorption: sum of Deduct Amounts across buckets must strictly equal Total Deficit.
 * - Each bucket's Deduct Amount >= 0 and <= live availableBalance.
 * - Reimbursement / Supplemental Disbursement Proof is always required whenever Total Deficit > 0.
 */
export function validateDeficitDeductionAllocations(params: {
  totalDeficit: number;
  rows: DeficitDeductionAllocation[];
}): DeficitDeductionValidationResult {
  const totalDeficit = Math.max(0, Math.round((Number(params.totalDeficit) || 0) * 100) / 100);
  const rows = Array.isArray(params.rows) ? params.rows : [];
  const perBucketErrors: Record<string, string> = {};

  if (totalDeficit <= 0) {
    return {
      isValid: true,
      totalDeducted: 0,
      remainingDeficitToAssign: 0,
      totalCapacityAvailable: 0,
      needsAdditionalBucket: false,
      requiresReimbursementProof: false,
      perBucketErrors: {},
    };
  }

  let totalDeducted = 0;
  let totalCapacityAvailable = 0;

  for (const r of rows) {
    const deduct = Number(r.deductAmount);
    const avail = Math.max(0, Math.round((Number(r.availableBalance) || 0) * 100) / 100);
    totalCapacityAvailable += avail;

    if (Number.isNaN(deduct) || deduct < 0) {
      perBucketErrors[r.bucketId] = 'Deduction amount cannot be negative.';
    } else if (deduct > avail + 0.009) {
      perBucketErrors[r.bucketId] = `Exceeds available bucket balance (${formatPHP(avail)}). Waterfall remainder to another bucket.`;
    }

    totalDeducted += Math.max(0, Number.isNaN(deduct) ? 0 : deduct);
  }

  totalDeducted = Math.round(totalDeducted * 100) / 100;
  totalCapacityAvailable = Math.round(totalCapacityAvailable * 100) / 100;
  const remainingDeficitToAssign = Math.round((totalDeficit - totalDeducted) * 100) / 100;
  const needsAdditionalBucket = totalCapacityAvailable + 0.009 < totalDeficit;

  let summaryError: string | undefined;
  if (rows.length === 0) {
    summaryError = `Select at least one fund bucket to cover the ${formatPHP(totalDeficit)} overspend.`;
  } else if (needsAdditionalBucket) {
    summaryError = `Selected bucket balances (${formatPHP(totalCapacityAvailable)}) cannot cover full overspend (${formatPHP(totalDeficit)}). Add another bucket with at least ${formatPHP(Math.max(0, totalDeficit - totalCapacityAvailable))}.`;
  } else if (Math.abs(remainingDeficitToAssign) >= 0.01) {
    summaryError =
      remainingDeficitToAssign > 0
        ? `Assign ${formatPHP(remainingDeficitToAssign)} more across buckets so total deductions strictly equal Total Overspend (${formatPHP(totalDeficit)}).`
        : `Assigned deductions exceed Total Overspend by ${formatPHP(Math.abs(remainingDeficitToAssign))}. Adjust so total strictly equals ${formatPHP(totalDeficit)}.`;
  }

  return {
    isValid: Object.keys(perBucketErrors).length === 0 && !summaryError,
    totalDeducted,
    remainingDeficitToAssign,
    totalCapacityAvailable,
    needsAdditionalBucket,
    requiresReimbursementProof: totalDeficit > 0.009,
    perBucketErrors,
    summaryError,
  };
}
