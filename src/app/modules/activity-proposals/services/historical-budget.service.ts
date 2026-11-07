/**
 * src/app/modules/activity-proposals/services/historical-budget.service.ts
 *
 * Search engine and data mapping for historical activity budgets.
 * Allows proposal makers to search and reference previous years' approved
 * activities and auto-populate the "Last Year's Actual (PHP)" financial column.
 */

import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { FinancialProjections, FinancialLineItem } from '../types/proposal.types';

export interface HistoricalActivityMatch {
  id: string;
  title: string;
  date?: string;
  schoolYear?: string;
  organizationName?: string;
  organizationId?: string;
  totalApprovedBudget: number;
  financialProjections?: FinancialProjections | null;
  budgetItems?: any[];
  matchScore: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'at', 'on', 'to', 'for', 'with', 'by',
  'from', 'about', 'sti', 'ormoc', 'campus', 'event', 'activity', 'proposal', 'annual',
  'held', 'celebration', 'program', 'session', 'general',
]);

/**
 * Tokenize a title string into meaningful keywords
 */
export function extractSignificantTokens(title: string): string[] {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d{4}$/.test(w));
}

/**
 * Synchronous in-memory matcher for instantaneous search results from live event stream
 */
export function filterHistoricalMatches(
  allEvents: any[],
  queryTitle: string,
  excludeEventId?: string | null,
  maxResults: number = 6
): HistoricalActivityMatch[] {
  const trimmed = queryTitle?.trim() || '';
  if (!trimmed || trimmed.length < 2) return [];

  const tokens = extractSignificantTokens(trimmed);
  const searchLower = trimmed.toLowerCase();

  const matches: HistoricalActivityMatch[] = [];

  allEvents.forEach((data) => {
    const docId = data.id;
    if (excludeEventId && docId === excludeEventId) return;

    const title = data.title || data.name || '';
    if (!title) return;

    const titleLower = title.toLowerCase();

    // Calculate match score
    let score = 0;

    // Exact or substring match
    if (titleLower.includes(searchLower)) {
      score += 15;
    } else if (searchLower.includes(titleLower)) {
      score += 12;
    }

    // Token overlap
    tokens.forEach((tok) => {
      if (titleLower.includes(tok)) {
        score += 5;
      }
    });

    if (score > 0) {
      const totalBudget =
        Number(data.financialProjections?.totalExpenses || 0) ||
        Number(data.totalApprovedBudget || data.budget || (data as any).totalBudget || 0) ||
        (Array.isArray(data.budgetItems)
          ? data.budgetItems.reduce(
              (acc: number, item: any) =>
                acc + (Number(item.approvedAmount || item.unitCost || item.amount || 0) || 0),
              0
            )
          : 0);

      matches.push({
        id: docId,
        title,
        date: data.date || data.startDate || null,
        schoolYear: data.schoolYear || null,
        organizationName: data.organizationName || data.hostOrgName || data.organizers?.[0] || 'Campus Org',
        organizationId: data.hostingOrgId || data.organizationId || null,
        totalApprovedBudget: totalBudget,
        financialProjections: data.financialProjections || null,
        budgetItems: Array.isArray(data.budgetItems) ? data.budgetItems : [],
        matchScore: score,
      });
    }
  });

  matches.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return b.totalApprovedBudget - a.totalApprovedBudget;
  });

  return matches.slice(0, maxResults);
}

/**
 * Asynchronous search directly querying both 'activities' and 'events' collections
 */
export async function searchHistoricalActivities(
  queryTitle: string,
  excludeEventId?: string | null,
  maxResults: number = 6
): Promise<HistoricalActivityMatch[]> {
  const trimmed = queryTitle?.trim() || '';
  if (!trimmed || trimmed.length < 2) return [];

  try {
    const map = new Map<string, any>();

    // Query 'activities' collection
    try {
      const snapActs = await getDocs(query(collection(db, 'activities'), limit(150)));
      snapActs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('Error fetching activities collection:', e);
    }

    // Query 'events' collection
    try {
      const snapEvents = await getDocs(query(collection(db, 'events'), limit(150)));
      snapEvents.forEach((d) => {
        if (!map.has(d.id)) {
          map.set(d.id, { id: d.id, ...d.data() });
        }
      });
    } catch (e) {
      console.warn('Error fetching events collection:', e);
    }

    return filterHistoricalMatches(Array.from(map.values()), queryTitle, excludeEventId, maxResults);
  } catch (err) {
    console.warn('[searchHistoricalActivities] Error searching past activities:', err);
    return [];
  }
}

/**
 * Smart mapping of historical line items into current financial projections
 */
export function mapHistoricalLineItems(
  historical: HistoricalActivityMatch,
  currentProjections: FinancialProjections
): {
  recalculatedProjections: FinancialProjections;
  originalHistoricalTotal: number;
} {
  const pastRevenues = historical.financialProjections?.revenues || [];
  const pastExpenses = historical.financialProjections?.expenses || [];

  // Fallback if past event only had budgetItems array
  let derivedPastExpenses = pastExpenses;
  if (derivedPastExpenses.length === 0 && historical.budgetItems && historical.budgetItems.length > 0) {
    derivedPastExpenses = historical.budgetItems.map((b: any, idx: number) => ({
      id: `past-exp-${idx}`,
      description: b.item || b.description || 'General Expense',
      lastYearActual: 0,
      thisYearProposed: Number(b.approvedAmount || b.unitCost || b.amount || 0),
      totalAmount: Number(b.approvedAmount || b.unitCost || b.amount || 0),
      adjustment: 0,
      remarks: b.description || '',
    }));
  }

  // Calculate past total
  const pastExpenseTotal = derivedPastExpenses.reduce(
    (sum, item) => sum + (Number(item.totalAmount || item.thisYearProposed || 0)),
    0
  );
  const originalHistoricalTotal = pastExpenseTotal || historical.totalApprovedBudget || 0;

  // 1. Map Expenses:
  let updatedExpenses: FinancialLineItem[];

  const isCurrentEmpty =
    !currentProjections.expenses ||
    currentProjections.expenses.length === 0 ||
    (currentProjections.expenses.length === 1 &&
      !currentProjections.expenses[0].description &&
      currentProjections.expenses[0].thisYearProposed === 0);

  if (isCurrentEmpty && derivedPastExpenses.length > 0) {
    // Clone historical items as baseline
    updatedExpenses = derivedPastExpenses.map((past, idx) => {
      const pastAmt = Number(past.totalAmount || past.thisYearProposed || 0);
      return {
        id: `exp-${Date.now()}-${idx + 1}`,
        description: past.description || 'Expense Item',
        lastYearActual: pastAmt,
        originalLastYearActual: pastAmt,
        isHistoricalEdited: false,
        thisYearProposed: pastAmt, // default proposed to last year's as starting point
        totalAmount: pastAmt,
        adjustment: 0,
        remarks: past.remarks ? `Based on ${historical.title}: ${past.remarks}` : `Historical baseline from ${historical.title}`,
      };
    });
  } else {
    // Merge into current expenses matching by description
    updatedExpenses = currentProjections.expenses.map((curr) => {
      const descLower = (curr.description || '').toLowerCase().trim();
      const matchedPast = derivedPastExpenses.find((p) => {
        const pDesc = (p.description || '').toLowerCase().trim();
        return pDesc === descLower || (descLower.length > 2 && pDesc.includes(descLower)) || (pDesc.length > 2 && descLower.includes(pDesc));
      });

      if (matchedPast) {
        const pastAmt = Number(matchedPast.totalAmount || matchedPast.thisYearProposed || 0);
        return {
          ...curr,
          lastYearActual: pastAmt,
          originalLastYearActual: pastAmt,
          isHistoricalEdited: false,
        };
      }
      return curr;
    });
  }

  // 2. Map Revenues:
  let updatedRevenues: FinancialLineItem[];
  const isCurrentRevEmpty =
    !currentProjections.revenues ||
    currentProjections.revenues.length === 0 ||
    (currentProjections.revenues.length === 1 &&
      !currentProjections.revenues[0].description &&
      currentProjections.revenues[0].thisYearProposed === 0);

  if (isCurrentRevEmpty && pastRevenues.length > 0) {
    updatedRevenues = pastRevenues.map((past, idx) => {
      const pastAmt = Number(past.totalAmount || past.thisYearProposed || 0);
      return {
        id: `rev-${Date.now()}-${idx + 1}`,
        description: past.description || 'Revenue Source',
        lastYearActual: pastAmt,
        originalLastYearActual: pastAmt,
        isHistoricalEdited: false,
        thisYearProposed: pastAmt,
        totalAmount: pastAmt,
        adjustment: 0,
        remarks: past.remarks || `Historical baseline from ${historical.title}`,
      };
    });
  } else {
    updatedRevenues = currentProjections.revenues.map((curr) => {
      const descLower = (curr.description || '').toLowerCase().trim();
      const matchedPast = pastRevenues.find((p) => {
        const pDesc = (p.description || '').toLowerCase().trim();
        return pDesc === descLower || (descLower.length > 2 && pDesc.includes(descLower)) || (pDesc.length > 2 && descLower.includes(pDesc));
      });

      if (matchedPast) {
        const pastAmt = Number(matchedPast.totalAmount || matchedPast.thisYearProposed || 0);
        return {
          ...curr,
          lastYearActual: pastAmt,
          originalLastYearActual: pastAmt,
          isHistoricalEdited: false,
        };
      }
      return curr;
    });
  }

  // Recalculate totals
  const totalRev = updatedRevenues.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  const totalExp = updatedExpenses.reduce((s, e) => s + (Number(e.totalAmount) || 0), 0);

  return {
    recalculatedProjections: {
      revenues: updatedRevenues,
      expenses: updatedExpenses,
      totalRevenue: totalRev,
      totalExpenses: totalExp,
      balance: totalRev - totalExp,
    },
    originalHistoricalTotal,
  };
}
