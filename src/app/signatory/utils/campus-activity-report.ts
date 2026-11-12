import type { EventDocument } from '../../modules/events/types/event.types';
import type { ActivityProposal } from '../../modules/activity-proposals/types/proposal.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import type { SemesterDocument } from '../../modules/academic/types/academic.types';
import {
  activityScheduleDates, calendarDaysRemaining, campusDateKey, isActivityConcluded,
  liquidationSubmissionDeadline, resolveActivityName,
} from '../../modules/events/utils/activity-compliance.utils';
import { isEventLiquidationExempt, isSasCreatedEvent, resolveCleanOrgName } from '../../modules/events/utils/organization-display.utils';

export type DocumentStatus = 'missing' | 'draft' | 'under_review' | 'returned' | 'approved' | 'archived';
export type ActivityState = 'under_review' | 'upcoming' | 'ongoing' | 'awaiting_conclusion' | 'concluded' | 'cancelled' | 'rejected';
export const STATUS_LABELS: Record<string, string> = {
  missing: 'Not submitted', draft: 'Draft', under_review: 'Under review', returned: 'Returned for revision',
  approved: 'Approved', archived: 'Archived', exempt: 'Exempt — No budget required', not_required: 'Not required',
  not_due: 'Not due yet', upcoming: 'Upcoming', ongoing: 'Ongoing', awaiting_conclusion: 'Awaiting conclusion',
  concluded: 'Concluded', cancelled: 'Cancelled', rejected: 'Rejected',
};
export interface CampusActivityRow {
  id: string;
  title: string;
  reference: string;
  organizationId: string;
  organizer: string;
  academicYear: string;
  semester: string;
  semesterId: string;
  scope: 'COLLEGE' | 'SHS' | 'BOTH' | 'UNKNOWN';
  dates: string[];
  venue: string;
  proposalStatus: string;
  activityState: ActivityState;
  flStatus: DocumentStatus | 'exempt' | 'not_required' | 'not_due';
  parStatus: DocumentStatus | 'not_required' | 'not_due';
  exempt: boolean;
  concluded: boolean;
  missingFL: boolean;
  missingPAR: boolean;
  returned: boolean;
  fullyCleared: boolean;
  awaitingMySignature: boolean;
  outstanding: string;
  deadline: string;
  daysRemaining: number | null;
  overdue: boolean;
  attendees: number | null;
  activity: EventDocument;
  proposal?: ActivityProposal;
  liquidation?: LiquidationDocument;
  par?: PostActivityReportDocument;
}
export interface CampusReportFilters {
  period: string;
  academicYear: string;
  semester: string;
  organizationId: string;
  scope: string;
  search: string;
  startDate: string;
  endDate: string;
  proposalStatus: string;
  activityState: string;
  flStatus: string;
  parStatus: string;
  quick: string;
}
export const DEFAULT_CAMPUS_FILTERS: CampusReportFilters = {
  period: 'ACTIVE', academicYear: 'ALL', semester: 'ALL', organizationId: 'ALL', scope: 'ALL', search: '',
  startDate: '', endDate: '', proposalStatus: 'ALL', activityState: 'ALL', flStatus: 'ALL', parStatus: 'ALL', quick: 'ALL',
};

const normalized = (value: any) => String(value || '').toLowerCase();
const millis = (value: any): number => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};
export function isCurrentDocument(record: any): boolean {
  return Boolean(record) && record.isDeleted !== true && !['voided', 'cancelled', 'canceled', 'deleted'].includes(normalized(record.status));
}
function newest<T>(records: T[]): T | undefined {
  return [...records].sort((a: any, b: any) =>
    millis(b.updatedAt || b.submittedAt || b.createdAt) - millis(a.updatedAt || a.submittedAt || a.createdAt)
    || Number(b.revisionCount || b.version || 0) - Number(a.revisionCount || a.version || 0)
    || String(b.id || '').localeCompare(String(a.id || '')))[0];
}

/**
 * Checks whether a document is currently and strictly in "returned for revision" status.
 * If a proposal/report has been resubmitted and is now under review, pending, or approved,
 * it is NOT returned and must be immediately removed from the returned list.
 */
export function isDocumentCurrentlyReturned(record: any): boolean {
  if (!record) return false;
  const status = normalized(record.status || record.reportStatus);
  const pStatus = normalized(record.proposalStatus);
  const lStatus = normalized(record.lifecycleStatus);

  // If actively under review / pending or approved / completed, it is NOT currently returned!
  if (
    ['under_review', 'pending', 'pending_review', 'pending_adviser_review', 'submitted'].includes(status) ||
    ['under_review', 'pending', 'pending_review'].includes(pStatus) ||
    ['pending_review'].includes(lStatus)
  ) {
    return false;
  }
  if (
    ['approved', 'approved_president', 'activated', 'completed', 'concluded'].includes(status) ||
    ['approved', 'approved_president', 'activated', 'completed', 'concluded'].includes(pStatus)
  ) {
    return false;
  }
  if (['draft', 'voided', 'cancelled', 'canceled', 'deleted'].includes(status)) {
    return false;
  }

  // Strictly returned
  return (
    ['returned', 'returned_for_revision', 'rejected'].includes(status) ||
    ['returned', 'returned_for_revision'].includes(pStatus) ||
    lStatus === 'returned' ||
    (record.isReturned === true && status !== 'draft')
  );
}

/**
 * Checks whether the logged-in signatory personally signed an individual step.
 * Strictly verifies identity (UID, email, or name with signature timestamp).
 * Never matches by generic role or role title.
 */
export function hasSignatorySignedStep(step: any, session: any): boolean {
  if (!step || !session) return false;

  const isSignedStatus = step.status === 'endorsed' || step.status === 'approved';
  const hasSigEvidence = Boolean(step.signedAt || step.signatureUrl);
  if (!isSignedStatus && !hasSigEvidence) return false;

  const userUid = session.id || session.uid;
  const userEmail = (session.email || '').toLowerCase().trim();
  const userName = (session.name || '').toLowerCase().trim();

  // 1. Direct UID match
  if (userUid) {
    const stepSignerUid = step.signedByUid || step.signatoryUid;
    if (stepSignerUid && stepSignerUid === userUid) return true;
  }

  // 2. Direct Email match
  if (userEmail) {
    const stepEmail = (step.signedByEmail || step.signatoryEmail || '').toLowerCase().trim();
    if (stepEmail && stepEmail === userEmail) return true;
  }

  // Disqualification: if step clearly specifies another user's UID or Email, reject
  const stepSignerUid = step.signedByUid || step.signatoryUid;
  if (stepSignerUid && userUid && stepSignerUid !== userUid) return false;

  const stepEmail = (step.signedByEmail || step.signatoryEmail || '').toLowerCase().trim();
  if (stepEmail && userEmail && stepEmail !== userEmail) return false;

  // 3. Fallback name match only if signature timestamp or signature URL is present
  if (userName && hasSigEvidence) {
    const stepName = (step.signedByName || step.signatoryName || '').toLowerCase().trim();
    if (stepName && (stepName === userName || stepName.includes(userName) || userName.includes(stepName))) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether the logged-in signatory personally signed anywhere on this document.
 */
export function hasSignatorySignedDocument(doc: any, session: any): boolean {
  if (!doc || !session) return false;
  const chain = doc.approvalChain || [];
  if (chain.some((s: any) => hasSignatorySignedStep(s, session))) return true;

  const userUid = session.id || session.uid;
  const userEmail = (session.email || '').toLowerCase().trim();
  if (userUid && (doc.approvedByUid === userUid || doc.endorsedByUid === userUid || doc.approvedBy === userUid)) return true;
  if (userEmail && (doc.approvedByEmail?.toLowerCase().trim() === userEmail || doc.endorsedByEmail?.toLowerCase().trim() === userEmail)) return true;

  return false;
}

export function documentStatus(record: any): DocumentStatus {
  if (!record) return 'missing';
  const status = normalized(record.status || record.reportStatus || record.proposalStatus);
  if (['approved', 'approved_president', 'activated', 'completed', 'concluded'].includes(status)) return 'approved';
  if (['under_review', 'pending', 'pending_review', 'pending_adviser_review', 'submitted'].includes(status)) return 'under_review';
  if (status === 'archived') return record.approvedAt || record.archivedFromStatus === 'approved' ? 'approved' : 'archived';
  if (isDocumentCurrentlyReturned(record)) return 'returned';
  return 'draft';
}
function proposalStatus(record: any): string {
  const status = normalized(record?.status || record?.proposalStatus);
  if (['completed', 'concluded', 'approved', 'approved_president', 'activated'].includes(status)) return 'approved';
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (status === 'rejected') return 'rejected';
  return documentStatus(record);
}
function activityScope(activity: any, period?: SemesterDocument): CampusActivityRow['scope'] {
  const explicit = normalized(activity.targetAcademicLevel || activity.academicLevel);
  if (explicit === 'both' || explicit === 'all') return 'BOTH';
  if (explicit === 'college') return 'COLLEGE';
  if (explicit === 'shs') return 'SHS';
  const levels = (activity.targetAudience?.academicLevels || []).map(normalized);
  if (levels.includes('shs') && levels.includes('college')) return 'BOTH';
  if (levels.includes('shs')) return 'SHS';
  if (levels.includes('college')) return 'COLLEGE';
  if (period) return period.academicLevel || (String(period.semester).includes('Trimester') ? 'SHS' : 'COLLEGE');
  return 'UNKNOWN';
}

/** Join by persisted IDs only. A renamed activity or a report revision is never a new activity. */
export function buildCampusActivityRows({
  events = [], proposals = [], liquidations = [], pars = [], organizations = [], periods = [],
  pendingIds = new Set<string>(), now = new Date(),
}: {
  events?: EventDocument[]; proposals?: ActivityProposal[]; liquidations?: LiquidationDocument[];
  pars?: PostActivityReportDocument[]; organizations?: any[]; periods?: SemesterDocument[];
  pendingIds?: Set<string>; now?: Date;
}): CampusActivityRow[] {
  const orgMap = new Map(organizations.map((org) => [org.id, { name: org.name, acronym: org.acronym || org.name }]));
  const groups = new Map<string, { events: any[]; proposals: any[]; ids: Set<string> }>();
  const aliases = new Map<string, string>();
  proposals.forEach((proposal: any) => [proposal.eventId, proposal.activityId, proposal.linkedEventId].filter((key) => key && key !== proposal.id)
    .forEach((key) => aliases.set(key, proposal.proposalId || proposal.id)));
  [...proposals, ...events].forEach((record: any) => {
    if (record.proposalId && record.proposalId !== record.id) aliases.set(record.id, record.proposalId);
  });
  const canonicalId = (key: string): string => {
    const visited = new Set<string>();
    while (aliases.has(key) && !visited.has(key)) { visited.add(key); key = aliases.get(key)!; }
    return key;
  };
  const add = (key: string, type: 'events' | 'proposals', record: any) => {
    const group = groups.get(key) || { events: [], proposals: [], ids: new Set<string>() };
    group[type].push(record);
    [record.id, record.proposalId, record.eventId, record.activityId, record.linkedEventId].filter(Boolean).forEach((id) => group.ids.add(id));
    groups.set(key, group);
  };
  proposals.forEach((proposal) => add(canonicalId(proposal.id), 'proposals', proposal));
  events.forEach((event) => add(canonicalId(event.id), 'events', event));
  const today = campusDateKey(now);
  return [...groups.entries()].flatMap(([id, group]): CampusActivityRow[] => {
    const proposal: any = group.proposals.find((record) => record.id === id) || newest(group.proposals);
    const event: any = newest(group.events);
    // An author withdrawing/deleting a proposal must not leave its stale mirror in campus reports.
    if ((proposal && (proposal.isDeleted || normalized(proposal.status) === 'draft')) || (!proposal && (event?.isDeleted || normalized(event?.status || event?.proposalStatus) === 'draft'))) return [];
    const source: any = { ...proposal, ...event, id: event?.id || id };
    const sessionSource: any = event?.sessions?.length ? event : newest(group.events.filter((record) => record.sessions?.length)) || proposal;
    const sessions = sessionSource?.sessions || [];
    source.sessions = sessions;
    const period = periods.find((item) => item.id === source.semesterId);
    const dates = activityScheduleDates(source);
    const excluded = [source.status, source.proposalStatus, source.lifecycleStatus, proposal?.status].map(normalized)
      .find((status) => ['cancelled', 'canceled', 'rejected'].includes(status));
    const concluded = !excluded && isActivityConcluded(source);
    const apStatus = excluded ? (excluded === 'rejected' ? 'rejected' : 'cancelled')
      : concluded ? 'approved' : proposalStatus(proposal || source);
    const activityState: ActivityState = excluded ? (excluded === 'rejected' ? 'rejected' : 'cancelled')
      : concluded ? 'concluded' : apStatus !== 'approved' ? 'under_review'
      : dates.length && dates.at(-1)! < today ? 'awaiting_conclusion'
      : dates.length && dates[0] <= today ? 'ongoing' : 'upcoming';
    const findLinked = <T,>(records: T[], pointer?: string): T | undefined => newest(records.filter((record: any) =>
      isCurrentDocument(record) && (group.ids.has(record.eventId) || group.ids.has(record.eventReportId) || (pointer && record.id === pointer))));
    const liquidation = findLinked(liquidations, source.liquidationReportId || source.liquidationId);
    const par = findLinked(pars, source.parId);
    // A linked report may retain financial obligations missing from a legacy activity mirror.
    const recordedFunds = Math.max(Number(liquidation?.allocatedBudget || 0), Number(liquidation?.amountAdvanced || 0), Number(liquidation?.totalActualSpending || 0));
    const exempt = isEventLiquidationExempt({ ...source, approvedBudget: Math.max(Number(source.approvedBudget || 0), recordedFunds) });
    const flStatus = exempt ? 'exempt' : liquidation ? documentStatus(liquidation) : excluded ? 'not_required' : concluded ? 'missing' : 'not_due';
    const parStatus = par ? documentStatus(par) : excluded ? 'not_required' : concluded ? 'missing' : 'not_due';
    const missingFL = Boolean(concluded && !exempt && ['missing', 'draft'].includes(flStatus));
    const missingPAR = Boolean(concluded && ['missing', 'draft'].includes(parStatus));
    const returned = !excluded && [apStatus, flStatus, parStatus].includes('returned');
    const fullyCleared = Boolean(concluded && apStatus === 'approved' && parStatus === 'approved' && (exempt || flStatus === 'approved'));
    const deadline = concluded && !exempt ? liquidationSubmissionDeadline(source, liquidation) : '';
    const daysRemaining = deadline ? calendarDaysRemaining(deadline, now) : null;
    const overdue = missingFL && daysRemaining !== null && daysRemaining < 0;
    const outstandingParts: string[] = [];
    if (!excluded && apStatus === 'returned') outstandingParts.push('Proposal needs revision');
    if (concluded) {
      if (missingFL) outstandingParts.push(flStatus === 'draft' ? 'FL draft not submitted' : 'FL not submitted');
      else if (flStatus === 'returned') outstandingParts.push('FL needs revision');
      else if (flStatus === 'under_review') outstandingParts.push('Awaiting FL approval');
      else if (flStatus === 'archived') outstandingParts.push('FL approval not recorded');
      if (missingPAR) outstandingParts.push(parStatus === 'draft' ? 'PAR draft not submitted' : 'PAR not submitted');
      else if (parStatus === 'returned') outstandingParts.push('PAR needs revision');
      else if (parStatus === 'under_review') outstandingParts.push('Awaiting PAR approval');
      else if (parStatus === 'archived') outstandingParts.push('PAR approval not recorded');
    }
    const organizationId = isSasCreatedEvent(source, orgMap) ? 'sas' : source.hostingOrgId || source.organizationId || '';
    const attendance = par?.attendanceSummary?.attendedCount ?? source.actualAttendanceCount;
    return [{
      id, title: resolveActivityName(source), reference: source.referenceId || source.referenceNo || source.referenceNumber || proposal?.referenceNo || id,
      organizationId, organizer: resolveCleanOrgName(source, orgMap),
      academicYear: source.schoolYear || source.academicYear || period?.academicYear || '',
      semester: source.semester || period?.semester || '', semesterId: source.semesterId || '',
      scope: activityScope(source, period), dates,
      venue: source.customVenueName || sessions.map((session: any) => session.venueName).filter(Boolean).filter((value: string, index: number, values: string[]) => values.indexOf(value) === index).join(', ') || par?.eventVenue || 'Not available',
      proposalStatus: apStatus, activityState, flStatus, parStatus, exempt, concluded: Boolean(concluded),
      missingFL, missingPAR, returned: Boolean(returned), fullyCleared,
      awaitingMySignature: [proposal, liquidation, par].some((record) => record && pendingIds.has(record.id)),
      outstanding: excluded ? 'No post-activity requirements' : fullyCleared ? 'All required reports approved' : outstandingParts.join('; ') || (concluded ? 'Awaiting required approvals' : 'Post-activity reports not due yet'),
      deadline, daysRemaining, overdue, attendees: typeof attendance === 'number' && Number.isFinite(attendance) ? attendance : null,
      activity: source, proposal, liquidation, par,
    }];
  }).sort((a, b) => (b.dates.at(-1) || '').localeCompare(a.dates.at(-1) || '') || a.title.localeCompare(b.title));
}

export function filterCampusActivityRows(rows: CampusActivityRow[], filters: CampusReportFilters, periods: SemesterDocument[] = []): CampusActivityRow[] {
  return rows.filter((row) => {
    if (filters.period !== 'ALL') {
      const candidates = periods.filter((period) => filters.period === 'ACTIVE' ? period.status === 'ACTIVE' && !period.archived : period.id === filters.period);
      if (!candidates.some((period) => row.semesterId ? row.semesterId === period.id
        : row.academicYear === period.academicYear && row.semester === period.semester)) return false;
    }
    if (filters.academicYear !== 'ALL' && row.academicYear !== filters.academicYear) return false;
    if (filters.semester !== 'ALL' && row.semester !== filters.semester) return false;
    if (filters.organizationId !== 'ALL' && row.organizationId !== filters.organizationId) return false;
    if (filters.scope !== 'ALL' && row.scope !== filters.scope && row.scope !== 'BOTH') return false;
    if ((filters.startDate || filters.endDate) && !row.dates.some((date) => (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate))) return false;
    for (const key of ['proposalStatus', 'activityState', 'flStatus', 'parStatus'] as const) {
      if (filters[key] !== 'ALL' && row[key] !== filters[key]) return false;
    }
    const quickMatches: Record<string, boolean> = {
      missing_par: row.missingPAR, missing_fl: row.missingFL, returned: row.returned,
      my_signature: row.awaitingMySignature, cleared: row.fullyCleared,
      needs_action: row.missingFL || row.missingPAR || row.returned, overdue: row.overdue,
    };
    if (filters.quick !== 'ALL' && !quickMatches[filters.quick]) return false;
    const query = filters.search.toLowerCase().trim();
    return !query || [row.title, row.reference, row.organizer, row.proposal?.referenceNo, row.liquidation?.referenceNo,
      row.liquidation?.referenceNumber, row.par?.referenceNo].some((value) => String(value || '').toLowerCase().includes(query));
  });
}

export function campusActivitySummary(rows: CampusActivityRow[]) {
  return {
    total: rows.length, concluded: rows.filter((row) => row.concluded).length,
    missingPAR: rows.filter((row) => row.missingPAR).length, missingFL: rows.filter((row) => row.missingFL).length,
    returned: rows.filter((row) => row.returned).length, cleared: rows.filter((row) => row.fullyCleared).length,
  };
}

export function campusActivityHighlights(rows: CampusActivityRow[]) {
  return rows.filter((row) => !['cancelled', 'rejected', 'under_review'].includes(row.activityState) || row.awaitingMySignature || row.returned)
    .map((row) => ({
      row,
      priority: row.overdue ? 0 : row.returned ? 1 : row.missingFL || row.missingPAR ? 2 : row.awaitingMySignature ? 3 : row.concluded && !row.fullyCleared ? 4 : row.fullyCleared ? 6 : 5,
      message: row.awaitingMySignature ? `Awaiting your signature. ${row.concluded ? row.outstanding : ''}`.trim()
        : row.concluded ? row.outstanding : row.returned ? row.outstanding : STATUS_LABELS[row.activityState],
    }))
    .sort((a, b) => a.priority - b.priority || (a.row.daysRemaining ?? Infinity) - (b.row.daysRemaining ?? Infinity) || (a.row.dates[0] || '').localeCompare(b.row.dates[0] || ''));
}
