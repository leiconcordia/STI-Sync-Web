/**
 * src/app/modules/activity-proposals/utils/proposal-calculations.ts
 *
 * Automated calculation engines for financial projections and STI 15-day policy verification.
 */

import { differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import type {
  FinancialLineItem,
  FinancialProjections,
  ProposalSession,
  ProposalTask,
} from '../types/proposal.types';

/**
 * Recalculate line totals and balance for the formal 6-column STI financial matrix
 */
export function calculateFinancialTotals(
  revenues: FinancialLineItem[],
  expenses: FinancialLineItem[]
): FinancialProjections {
  const cleanRevenues = revenues.map((item) => {
    const proposed = Number(item.thisYearProposed) || 0;
    const adjustment = Number(item.adjustment) || 0;
    const totalAmount = proposed + adjustment;
    return {
      ...item,
      totalAmount,
    };
  });

  const cleanExpenses = expenses.map((item) => {
    const proposed = Number(item.thisYearProposed) || 0;
    const adjustment = Number(item.adjustment) || 0;
    const totalAmount = proposed + adjustment;
    return {
      ...item,
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
  tasks: ProposalTask[] = []
): {
  isCompliant: boolean;
  daysDiff: number;
  earliestDate: string | null;
  policyRequirement: string;
} {
  const dates: Date[] = [];

  // Parse session dates
  sessions.forEach((s) => {
    if (s.date) {
      const parsed = parseISO(s.date);
      if (isValid(parsed)) dates.push(parsed);
    }
  });

  // Parse task completion dates
  tasks.forEach((t) => {
    if (t.completionDate) {
      const parsed = parseISO(t.completionDate);
      if (isValid(parsed)) dates.push(parsed);
    }
  });

  if (dates.length === 0) {
    return {
      isCompliant: true,
      daysDiff: 15,
      earliestDate: null,
      policyRequirement: '15 calendar days before start of initial task',
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
    policyRequirement: '15 calendar days before start of initial task',
  };
}

/**
 * Format currency in Philippine Peso (PHP)
 */
export function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}
