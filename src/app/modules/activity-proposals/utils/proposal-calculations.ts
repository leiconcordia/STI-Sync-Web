/**
 * src/app/modules/activity-proposals/utils/proposal-calculations.ts
 *
 * Automated calculation engines for financial projections and STI 15-day policy verification.
 */

import { differenceInCalendarDays, parseISO, isValid, format } from 'date-fns';
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
