import type { EventDocument } from '../../events/types/event.types';
import type { PostActivityReportDocument } from '../../post-activity-reports/types/par.types';
import type { LiquidationDocument } from '../../finance/types/liquidation.types';
import type { MiscFeeConfigDocument } from '../../finance/types/misc-fee.types';
import type { SemesterDocument } from '../../academic/types/academic.types';
import {
  getDueCountdownInfo,
  isActivityConcluded,
  liquidationSubmissionDeadline,
  parSubmissionDeadline,
} from '../../events/utils/activity-compliance.utils';
import {
  resolveUnifiedActiveAcademicTerm,
  buildAvailableSchoolYears,
  matchesSchoolYearFilter,
  resolveDefaultSchoolYearFilter,
  matchesRecordAcademicPeriod,
} from './academic-period-filter.utils';

export {
  resolveUnifiedActiveAcademicTerm,
  buildAvailableSchoolYears,
  matchesSchoolYearFilter,
  resolveDefaultSchoolYearFilter,
  matchesRecordAcademicPeriod,
};

/** Extracts epoch milliseconds from Firestore Timestamp, serialized timestamp, Date, or string. */
export function extractTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime();
  if (typeof val.toMillis === 'function') {
    const ms = val.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof val.toDate === 'function') {
    const d = val.toDate();
    return d && !isNaN(d.getTime()) ? d.getTime() : 0;
  }
  if (typeof val.seconds === 'number') {
    return val.seconds * 1000 + Math.round((val.nanoseconds || 0) / 1e6);
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/**
 * Resolves submission timestamp priority: submittedAt -> resubmittedAt -> returnedAt -> updatedAt -> createdAt -> fallbackDate.
 * Ensures drafts started days earlier sort by their actual submission time once submitted.
 */
export function getSubmissionTimestampMs(record: any, fallbackDateStr?: string): number {
  if (!record) return extractTimestampMs(fallbackDateStr);
  return (
    extractTimestampMs(record.submittedAt) ||
    extractTimestampMs(record.versionSummary?.latestResubmissionAt) ||
    extractTimestampMs(record.resubmittedAt) ||
    extractTimestampMs(record.updatedAt) ||
    extractTimestampMs(record.createdAt) ||
    extractTimestampMs(fallbackDateStr) ||
    0
  );
}

const AP_CLOSED_STATUSES = new Set(['approved', 'completed', 'rejected', 'cancelled', 'canceled']);

export function getActivityProposalUrgencyRank(event: EventDocument): number {
  if (!Boolean((event as any).isUrgent)) return 0;
  const propStatus = String(event.proposalStatus || event.status || '').toLowerCase();
  if (AP_CLOSED_STATUSES.has(propStatus)) return 0;
  return 2;
}

/** Orders AP rows: actionable Urgent on top -> newest submission first. */
export function compareActivityProposals(a: EventDocument, b: EventDocument): number {
  const rankDiff = getActivityProposalUrgencyRank(b) - getActivityProposalUrgencyRank(a);
  if (rankDiff !== 0) return rankDiff;
  const aFirstSession = a.sessions?.[0]?.date;
  const bFirstSession = b.sessions?.[0]?.date;
  return getSubmissionTimestampMs(b, bFirstSession) - getSubmissionTimestampMs(a, aFirstSession);
}

/** 2 = Urgent / Overdue, 1 = Due Soon (<= 3 days), 0 = Standard */
export function getParUrgencyRank(
  par: PostActivityReportDocument,
  eventsById?: Map<string, EventDocument>
): number {
  const st = String(par.status || '').toLowerCase();
  if (st === 'approved' || st === 'archived') return 0;

  const parentEvent = par.eventId ? eventsById?.get(par.eventId) : undefined;
  if (Boolean((par as any).isUrgent) || Boolean((parentEvent as any)?.isUrgent)) {
    return 2;
  }

  const returnDue = par.returnDeadline ? getDueCountdownInfo(par.returnDeadline) : null;
  const complianceDeadline =
    (par as any).submissionDeadline ||
    (parentEvent && isActivityConcluded(parentEvent)
      ? parSubmissionDeadline(parentEvent, par)
      : '');
  const complianceDue = complianceDeadline ? getDueCountdownInfo(complianceDeadline) : null;

  if (returnDue?.isOverdue || complianceDue?.isOverdue) return 2;
  if (returnDue?.isDueSoon || complianceDue?.isDueSoon) return 1;
  return 0;
}

/** Orders PAR rows: Urgent / Overdue -> Due Soon -> newest submission first. */
export function comparePostActivityReports(
  a: PostActivityReportDocument,
  b: PostActivityReportDocument,
  eventsById?: Map<string, EventDocument>
): number {
  const rankDiff = getParUrgencyRank(b, eventsById) - getParUrgencyRank(a, eventsById);
  if (rankDiff !== 0) return rankDiff;
  return getSubmissionTimestampMs(b) - getSubmissionTimestampMs(a);
}

/** 2 = Urgent / Overdue, 1 = Due Soon (<= 3 days) or Pending Settlement Proof, 0 = Standard */
export function getLiquidationUrgencyRank(
  liq: LiquidationDocument,
  eventsById?: Map<string, EventDocument>
): number {
  const st = String(liq.status || '').toLowerCase();
  if (st === 'voided') return 0;

  if (st === 'approved') {
    const settle = String(liq.cashierSettlementStatus || '').toLowerCase();
    if (settle === 'pending_proof' || settle === 'proof_uploaded') return 1;
    return 0;
  }

  const parentEvent = liq.eventId ? eventsById?.get(liq.eventId) : undefined;
  if (
    Boolean((liq as any).isUrgent) ||
    Boolean((parentEvent as any)?.isUrgent)
  ) {
    return 2;
  }

  const deadline =
    liq.submissionDeadline ||
    (parentEvent && isActivityConcluded(parentEvent)
      ? liquidationSubmissionDeadline(parentEvent, liq)
      : '');
  const due = deadline ? getDueCountdownInfo(deadline) : null;
  if (due?.isOverdue) return 2;
  if (due?.isDueSoon) return 1;
  return 0;
}

/** Orders Liquidation rows: Urgent / Overdue -> Due Soon -> newest submission first. */
export function compareLiquidations(
  a: LiquidationDocument,
  b: LiquidationDocument,
  eventsById?: Map<string, EventDocument>
): number {
  const rankDiff = getLiquidationUrgencyRank(b, eventsById) - getLiquidationUrgencyRank(a, eventsById);
  if (rankDiff !== 0) return rankDiff;
  return getSubmissionTimestampMs(b) - getSubmissionTimestampMs(a);
}
