import type { MiscFeeConfigDocument } from '../../finance/types/misc-fee.types';
import type { SemesterDocument } from '../../academic/types/academic.types';

/** Normalizes SY strings such as "SY 2026-2027", "A.Y. 2026–2027" -> "2026-2027". */
export function normalizeAcademicSchoolYear(sy?: string | null): string {
  return String(sy || '')
    .replace(/^sy\s*/i, '')
    .replace(/^a\.?y\.?\s*/i, '')
    .replace(/–/g, '-')
    .trim();
}

/**
 * Resolves the unified active academic context (MiscFeeConfigs first, falling back to Semesters).
 */
export function resolveUnifiedActiveAcademicTerm(params: {
  activeConfig?: MiscFeeConfigDocument | null;
  configs?: MiscFeeConfigDocument[];
  activeCollegePeriod?: SemesterDocument | null;
  activeShsPeriod?: SemesterDocument | null;
}): { schoolYear: string; semester: string } {
  const { activeConfig, configs = [], activeCollegePeriod, activeShsPeriod } = params;
  const openMisc =
    (activeConfig && activeConfig.status !== 'CLOSED' ? activeConfig : null) ||
    configs.find((c) => c.isActive === true && c.status !== 'CLOSED') ||
    configs.find((c) => c.status !== 'CLOSED') ||
    activeConfig;

  const miscSy = normalizeAcademicSchoolYear(openMisc?.schoolYear);
  const legacyPeriod = activeCollegePeriod || activeShsPeriod;
  const schoolYear = miscSy || normalizeAcademicSchoolYear(legacyPeriod?.academicYear) || '';
  const semester =
    (miscSy && openMisc?.activeSemester) ||
    legacyPeriod?.semester ||
    (legacyPeriod as any)?.term ||
    openMisc?.activeSemester ||
    '1st Semester';

  return { schoolYear, semester };
}

/**
 * Builds the sorted list of available School Years combining MiscFeeConfigs, Semesters, and record values.
 */
export function buildAvailableSchoolYears(params: {
  configs?: MiscFeeConfigDocument[];
  semesters?: SemesterDocument[];
  records?: Array<{ schoolYear?: string | null }>;
  activeSchoolYear?: string;
}): string[] {
  const set = new Set<string>();
  const addSy = (raw?: string | null) => {
    const clean = normalizeAcademicSchoolYear(raw);
    if (clean) set.add(clean);
  };
  (params.configs || []).forEach((c) => addSy(c.schoolYear));
  (params.semesters || []).forEach((s) => addSy(s.academicYear));
  (params.records || []).forEach((r) => addSy(r.schoolYear));
  addSy(params.activeSchoolYear);
  return Array.from(set).sort().reverse();
}

/**
 * Strict School Year matcher: prevents untagged legacy records from leaking into
 * newly initialized School Years (e.g., SY 2027-2028 after Zero Reset).
 */
export function matchesSchoolYearFilter(params: {
  recordSchoolYear?: string | null;
  filterSchoolYear: string;
  availableSchoolYears: string[];
}): boolean {
  const filterNorm = normalizeAcademicSchoolYear(params.filterSchoolYear).toLowerCase();
  if (!filterNorm || filterNorm === 'all') return true;

  const recNorm = normalizeAcademicSchoolYear(params.recordSchoolYear).toLowerCase();
  if (recNorm) {
    return recNorm === filterNorm;
  }

  // Legacy records without a stamped schoolYear only belong under the oldest/baseline SY
  if (params.availableSchoolYears.length <= 1) return true;
  const oldestSy = normalizeAcademicSchoolYear(
    params.availableSchoolYears[params.availableSchoolYears.length - 1]
  ).toLowerCase();
  return !oldestSy || filterNorm === oldestSy;
}

/**
 * Resolves the default School Year filter value, preferring the active/current SY
 * and falling back to the latest available SY so lists default to Current SY instead of "all".
 */
export function resolveDefaultSchoolYearFilter(params: {
  unifiedSchoolYear?: string | null;
  availableSchoolYears: string[];
}): string {
  return normalizeAcademicSchoolYear(params.unifiedSchoolYear) || params.availableSchoolYears[0] || '';
}

/**
 * Matches a workflow record (Activity Proposal, Liquidation, or PAR) against both the
 * selected School Year and Semester/Term filters, resolving inherited metadata from parentEvent/semesters.
 */
export function matchesRecordAcademicPeriod(params: {
  record: any;
  parentEvent?: any;
  semesters?: SemesterDocument[];
  filterSchoolYear: string;
  filterSemester: string;
  availableSchoolYears: string[];
  fallbackDate?: string;
}): boolean {
  const {
    record,
    parentEvent,
    semesters = [],
    filterSchoolYear,
    filterSemester,
    availableSchoolYears,
    fallbackDate,
  } = params;

  const semId = record?.semesterId || parentEvent?.semesterId;
  const sem = semId ? semesters.find((s) => s.id === semId) : null;

  const filterSyNorm = normalizeAcademicSchoolYear(filterSchoolYear).toLowerCase();
  if (filterSyNorm && filterSyNorm !== 'all') {
    const recordSy = record?.schoolYear || parentEvent?.schoolYear || sem?.academicYear;
    if (
      !matchesSchoolYearFilter({
        recordSchoolYear: recordSy,
        filterSchoolYear,
        availableSchoolYears,
      })
    ) {
      return false;
    }
  }

  const filterSemNorm = String(filterSemester || '').trim().toLowerCase();
  if (filterSemNorm && filterSemNorm !== 'all') {
    const term =
      record?.semester ||
      record?.term ||
      parentEvent?.semester ||
      parentEvent?.term ||
      sem?.semester ||
      (sem as any)?.term;
    if (term) {
      if (String(term).trim().toLowerCase() !== filterSemNorm) return false;
    } else if (sem?.startDate && sem?.endDate) {
      if (!fallbackDate || fallbackDate < sem.startDate || fallbackDate > sem.endDate) {
        return false;
      }
    }
  }

  return true;
}

function isChainFullyApproved(chain?: any[] | null): boolean {
  if (!Array.isArray(chain) || chain.length === 0) return false;
  return chain.every((s) => s && (s.status === 'endorsed' || s.status === 'approved'));
}

function isEventReturnedStatus(e: any): boolean {
  const pStatus = String(e?.proposalStatus || '').toLowerCase().trim();
  const status = String(e?.status || '').toLowerCase().trim();
  const lifecycle = String(e?.lifecycleStatus || '').toLowerCase().trim();
  return (
    pStatus === 'returned' ||
    pStatus === 'returned_for_revision' ||
    status === 'returned' ||
    lifecycle === 'returned' ||
    Boolean(e?.isReturned) ||
    Boolean(e?.stepRevisionRemarks && Object.keys(e.stepRevisionRemarks).length > 0)
  );
}

/**
 * Computes the 4 top Dashboard KPI counts strictly for the specified School Year
 * across both Student Organization and SAS submissions:
 *  - Pending Activity Proposals: awaiting signatory approval
 *  - Approved Activity Proposals: approved by signatories
 *  - Pending Financial Liquidations: awaiting signatory approval
 *  - Pending Post-Activity Reports: awaiting signatory approval
 */
export function computeDashboardKpiCounts(params: {
  events: any[];
  liquidations: any[];
  pars: any[];
  semesters?: SemesterDocument[];
  schoolYear: string;
  availableSchoolYears: string[];
}): {
  pendingActivityProposals: number;
  approvedActivityProposals: number;
  pendingFinancialLiquidations: number;
  pendingPostActivityReports: number;
} {
  const {
    events = [],
    liquidations = [],
    pars = [],
    semesters = [],
    schoolYear,
    availableSchoolYears,
  } = params;

  const eventsById = new Map<string, any>();
  events.forEach((ev) => {
    if (ev?.id) eventsById.set(ev.id, ev);
  });

  const filterSy = schoolYear || 'all';

  let pendingActivityProposals = 0;
  let approvedActivityProposals = 0;

  for (const e of events) {
    if (!e || e.isArchived || e.isDeleted) continue;
    if (
      !matchesRecordAcademicPeriod({
        record: e,
        semesters,
        filterSchoolYear: filterSy,
        filterSemester: 'all',
        availableSchoolYears,
        fallbackDate: e.sessions?.[0]?.date,
      })
    ) {
      continue;
    }

    const pStatus = String(e.proposalStatus || '').toLowerCase().trim();
    const status = String(e.status || '').toLowerCase().trim();
    const lifecycle = String(e.lifecycleStatus || '').toLowerCase().trim();

    if (
      pStatus === 'draft' ||
      status === 'draft' ||
      lifecycle === 'draft' ||
      pStatus === 'cancelled' ||
      status === 'cancelled' ||
      lifecycle === 'cancelled' ||
      Boolean(e.isCancelled) ||
      pStatus === 'rejected' ||
      status === 'rejected'
    ) {
      continue;
    }

    const returned = isEventReturnedStatus(e);
    const fullySigned = isChainFullyApproved(e.approvalChain);
    const isApproved =
      fullySigned ||
      (!returned &&
        (['approved', 'activated', 'approved_president', 'completed', 'concluded'].includes(pStatus) ||
          ['approved', 'activated', 'approved_president', 'completed', 'concluded'].includes(status) ||
          ['approved', 'completed', 'concluded'].includes(lifecycle) ||
          e.isApproved === true));

    if (isApproved) {
      approvedActivityProposals += 1;
      continue;
    }

    if (
      !returned &&
      ['pending', 'pending_review', 'under_review', 'submitted'].includes(pStatus || status)
    ) {
      pendingActivityProposals += 1;
    }
  }

  let pendingFinancialLiquidations = 0;
  for (const l of liquidations) {
    if (!l || l.isArchived || l.isDeleted) continue;
    const st = String(l.status || '').toLowerCase().trim();
    if (['draft', 'approved', 'returned', 'voided'].includes(st)) continue;
    if (isChainFullyApproved(l.approvalChain)) continue;
    if (!['pending', 'under_review', 'pending_adviser_review', 'pending_review', 'submitted'].includes(st)) {
      continue;
    }
    const parentEvent = l.eventId ? eventsById.get(l.eventId) : null;
    if (
      !matchesRecordAcademicPeriod({
        record: l,
        parentEvent,
        semesters,
        filterSchoolYear: filterSy,
        filterSemester: 'all',
        availableSchoolYears,
        fallbackDate: parentEvent?.sessions?.[0]?.date,
      })
    ) {
      continue;
    }
    pendingFinancialLiquidations += 1;
  }

  let pendingPostActivityReports = 0;
  for (const p of pars) {
    if (!p || p.isArchived || p.isDeleted) continue;
    const st = String(p.status || '').toLowerCase().trim();
    if (['draft', 'approved', 'returned', 'archived'].includes(st)) continue;
    if (isChainFullyApproved(p.approvalChain)) continue;
    if (!['under_review', 'pending', 'pending_review', 'submitted'].includes(st)) {
      continue;
    }
    const parentEvent = p.eventId ? eventsById.get(p.eventId) : null;
    if (
      !matchesRecordAcademicPeriod({
        record: p,
        parentEvent,
        semesters,
        filterSchoolYear: filterSy,
        filterSemester: 'all',
        availableSchoolYears,
        fallbackDate: parentEvent?.sessions?.[0]?.date,
      })
    ) {
      continue;
    }
    pendingPostActivityReports += 1;
  }

  return {
    pendingActivityProposals,
    approvedActivityProposals,
    pendingFinancialLiquidations,
    pendingPostActivityReports,
  };
}
