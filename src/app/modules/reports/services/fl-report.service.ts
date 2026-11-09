import type { LiquidationDocument } from '../../finance/types/liquidation.types';
import type { EventDocument } from '../../events/types/event.types';
import type { OrganizationDocument } from '../../organizations/types/organization.types';
import type {
  UniversalFilterState,
  FLAnalyticsSummary,
  FLReportRow,
} from '../types/report.types';
import { isEventInTrack } from './report-generator.service';

/**
 * Filter liquidations according to universal filters
 */
export function filterLiquidationsByUniversalFilters(
  liquidations: LiquidationDocument[],
  eventsMap: Map<string, EventDocument>,
  filters: UniversalFilterState
): LiquidationDocument[] {
  return liquidations.filter((liq) => {
    if (liq.isDeleted) return false;

    // Scope check via linked event or liq fields
    const linkedEvent = eventsMap.get(liq.eventId);
    if (linkedEvent && !isEventInTrack(linkedEvent, filters.scope)) {
      return false;
    }

    // Semester filter
    if (filters.semesterId !== 'ALL') {
      const sy = liq.schoolYear || linkedEvent?.schoolYear;
      const sem = liq.semester || (linkedEvent as any)?.semester;
      if (filters.academicYear && sy && sy !== filters.academicYear) {
        return false;
      }
      if (filters.semester && sem && sem !== filters.semester) {
        return false;
      }
    }

    // Organization filter
    if (filters.organizationId !== 'ALL') {
      if (filters.organizationId === 'sas') {
        if (liq.organizationId !== 'sas' && liq.createdByRole !== 'sas_admin') return false;
      } else {
        if (liq.organizationId !== filters.organizationId) return false;
      }
    }

    // Search query
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const ref = (liq.referenceNo || liq.referenceNumber || liq.id).toLowerCase();
      const eventTitle = (liq.eventTitle || '').toLowerCase();
      const orgName = (liq.organizationName || '').toLowerCase();
      const cheq = (liq.chequeNumber || '').toLowerCase();
      if (!ref.includes(q) && !eventTitle.includes(q) && !orgName.includes(q) && !cheq.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Standardize expense category names into institutional groups
 */
export function normalizeExpenseCategory(rawCat: string): string {
  const c = (rawCat || '').toLowerCase();
  if (c.includes('token') || c.includes('honor') || c.includes('speaker') || c.includes('judge')) {
    return 'Tokens & Honoraria';
  }
  if (c.includes('food') || c.includes('meal') || c.includes('catering') || c.includes('snack') || c.includes('refresh')) {
    return 'Food & Refreshments';
  }
  if (c.includes('material') || c.includes('print') || c.includes('banner') || c.includes('stationery') || c.includes('suppl')) {
    return 'Materials & Printing';
  }
  if (c.includes('venue') || c.includes('sound') || c.includes('light') || c.includes('transport') || c.includes('logist')) {
    return 'Venue & Logistics';
  }
  return 'Other Expenses';
}

/**
 * Compute Financial Liquidations Sub-Directory Analytics
 */
export function computeFLAnalytics(
  liquidations: LiquidationDocument[],
  events: EventDocument[],
  filters: UniversalFilterState,
  organizations: OrganizationDocument[]
): FLAnalyticsSummary {
  const eventsMap = new Map<string, EventDocument>(events.map((e) => [e.id, e]));
  const orgsMap = new Map<string, OrganizationDocument>(organizations.map((o) => [o.id, o]));
  const filteredLiquidations = filterLiquidationsByUniversalFilters(liquidations, eventsMap, filters);

  let totalDisbursedAdvances = 0;
  let totalLiquidatedExpenses = 0;
  let surplusReturned = 0;

  // Track spend per organization
  const orgSpendMap = new Map<string, { allocated: number; spent: number }>();

  // Track categories
  const categoryMap = new Map<string, number>([
    ['Tokens & Honoraria', 0],
    ['Food & Refreshments', 0],
    ['Materials & Printing', 0],
    ['Venue & Logistics', 0],
    ['Other Expenses', 0],
  ]);

  const rows: FLReportRow[] = filteredLiquidations.map((liq) => {
    const disbursed = liq.amountAdvanced || liq.allocatedBudget || 0;
    const spent = liq.totalActualSpending || 0;
    const surplusDeficit = liq.surplusOrDeficit !== undefined ? liq.surplusOrDeficit : (disbursed - spent);

    totalDisbursedAdvances += disbursed;
    totalLiquidatedExpenses += spent;
    if (surplusDeficit > 0) surplusReturned += surplusDeficit;

    // Org spend map
    const orgKey = liq.organizationName || 'Student Club';
    const currentOrg = orgSpendMap.get(orgKey) || { allocated: 0, spent: 0 };
    currentOrg.allocated += disbursed;
    currentOrg.spent += spent;
    orgSpendMap.set(orgKey, currentOrg);

    // Categories
    if (Array.isArray(liq.lineItems)) {
      liq.lineItems.forEach((item) => {
        const cat = normalizeExpenseCategory(item.category || item.description);
        const prev = categoryMap.get(cat) || 0;
        categoryMap.set(cat, prev + (item.totalCost || 0));
      });
    }

    // Official receipts count
    let orCount = 0;
    let attachmentsCount = 0;
    if (Array.isArray(liq.lineItems)) {
      liq.lineItems.forEach((item) => {
        if (item.receiptUrl || item.receiptNumber) orCount += 1;
        if (Array.isArray(item.receiptFiles)) attachmentsCount += item.receiptFiles.length;
        else if (Array.isArray(item.receiptUrls)) attachmentsCount += item.receiptUrls.length;
        else if (item.receiptUrl) attachmentsCount += 1;
      });
    }

    // Days lapsed & overdue check
    let daysLapsedVal: number | string = liq.daysLapsed || '—';
    let isOverdue = false;
    if (liq.submissionDeadline && liq.status !== 'approved') {
      const deadline = new Date(liq.submissionDeadline);
      const now = new Date();
      if (!isNaN(deadline.getTime()) && now > deadline) {
        isOverdue = true;
        const diff = Math.round((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
        daysLapsedVal = `${diff} days overdue`;
      }
    }

    return {
      id: liq.id,
      liquidationId: liq.referenceNo || liq.referenceNumber || `LF-${liq.id.slice(0, 6)}`,
      eventTitle: liq.eventTitle || 'Campus Activity',
      organization: liq.organizationName || 'Student Organization',
      organizationId: liq.organizationId,
      disbursedAmount: disbursed,
      totalActualExpense: spent,
      surplusDeficit,
      orCount: orCount || (liq.orNumber ? 1 : 0),
      attachmentsCount: Math.max(attachmentsCount, orCount),
      auditStatus: liq.status || 'pending',
      daysLapsed: daysLapsedVal,
      isOverdue,
      dateSubmitted: liq.dateSubmitted || '—',
      rawLiquidation: liq,
    };
  });

  // Calculate unliquidated aging count: completed events without approved liquidation past 7 days
  const unliquidatedAgingCount = events.filter((e) => {
    if (e.isDeleted) return false;
    if (e.proposalStatus !== 'completed') return false;
    const hasApprovedLiq = liquidations.some(
      (l) => l.eventId === e.id && l.status === 'approved' && !l.isDeleted
    );
    if (hasApprovedLiq) return false;

    // Check completion date
    let completedDate: Date | null = null;
    if (e.completedAt) {
      if (typeof (e.completedAt as any).toDate === 'function') completedDate = (e.completedAt as any).toDate();
      else if (typeof (e.completedAt as any).seconds === 'number') completedDate = new Date((e.completedAt as any).seconds * 1000);
      else completedDate = new Date(e.completedAt as any);
    } else if (e.sessions && e.sessions.length > 0 && e.sessions[0].date) {
      completedDate = new Date(e.sessions[0].date);
    }

    if (completedDate && !isNaN(completedDate.getTime())) {
      const daysSince = (Date.now() - completedDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= 7;
    }
    return false;
  }).length;

  const budgetVarianceRate =
    totalDisbursedAdvances > 0
      ? Number((((totalLiquidatedExpenses - totalDisbursedAdvances) / totalDisbursedAdvances) * 100).toFixed(1))
      : 0;

  // Top 6 organizations for clustered bar chart
  const disbursedVsActual = Array.from(orgSpendMap.entries())
    .slice(0, 6)
    .map(([org, data]) => ({
      org: org.length > 12 ? org.slice(0, 10) + '...' : org,
      allocated: data.allocated,
      spent: data.spent,
    }));

  // Categories breakdown
  const totalCatAmount = Array.from(categoryMap.values()).reduce((a, b) => a + b, 0);
  const expenseCategories = Array.from(categoryMap.entries()).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalCatAmount > 0 ? Number(((amount / totalCatAmount) * 100).toFixed(1)) : 0,
  }));

  return {
    kpis: {
      totalDisbursedAdvances,
      totalLiquidatedExpenses,
      surplusReturned,
      budgetVarianceRate,
      unliquidatedAgingCount,
    },
    charts: {
      disbursedVsActual,
      expenseCategories,
    },
    rows,
  };
}

