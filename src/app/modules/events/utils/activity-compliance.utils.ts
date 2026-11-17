import { parseDateSafe } from '../../../utils/date';

export const LIQUIDATION_SUBMISSION_DAYS = 15;
export const PAR_SUBMISSION_DAYS = 15;
export const CAMPUS_TIME_ZONE = 'Asia/Manila';

/** Date-only schedules stay date-only; timestamps use the campus calendar day. */
export function campusDateKey(value: any): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  const date = parseDateSafe(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPUS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)?.value).join('-');
}

export function activityScheduleDates(activity: any): string[] {
  const sessionDates = (Array.isArray(activity?.sessions) ? activity.sessions : [])
    .map((session: any) => campusDateKey(session.date)).filter(Boolean);
  if (sessionDates.length) return [...new Set<string>(sessionDates)].sort();
  const fallback = campusDateKey(activity?.targetDate || activity?.targetImplementationDate || activity?.implementationDate || activity?.date);
  return fallback ? [fallback] : [];
}

export function isActivityConcluded(activity: any): boolean {
  const statuses = [activity?.status, activity?.proposalStatus, activity?.lifecycleStatus]
    .map((value) => String(value || '').toLowerCase());
  if (statuses.some((status) => ['cancelled', 'canceled', 'rejected'].includes(status))) return false;
  return statuses.some((status) => ['completed', 'concluded'].includes(status)) || Boolean(activity?.completedAt || activity?.concludedAt);
}

export function activityConclusionDate(activity: any): string {
  return campusDateKey(activity?.concludedAt || activity?.completedAt || activity?.activityEndDate)
    || activityScheduleDates(activity).at(-1) || '';
}

export function addCalendarDays(date: string, days: number): string {
  if (!campusDateKey(date)) return '';
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function calendarDaysRemaining(deadline: string, now: Date = new Date()): number | null {
  const day = campusDateKey(deadline);
  if (!day) return null;
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${campusDateKey(now)}T00:00:00Z`)) / 86400000);
}

/** Both FL and PAR deadlines start counting +15 calendar days ONLY after event conclusion. */
export function liquidationSubmissionDeadline(activity: any, liquidation?: any): string {
  if (!isActivityConcluded(activity)) return '';
  const saved = campusDateKey(liquidation?.submissionDeadline || activity?.liquidationDeadline);
  if (saved) return saved;
  return addCalendarDays(activityConclusionDate(activity), LIQUIDATION_SUBMISSION_DAYS);
}

/** 15-calendar-day Post-Activity Report (PAR) submission deadline after event conclusion. */
export function parSubmissionDeadline(activity: any, par?: any): string {
  if (!isActivityConcluded(activity)) return '';
  const saved = campusDateKey(par?.submissionDeadline || activity?.parDeadline);
  if (saved) return saved;
  return addCalendarDays(activityConclusionDate(activity), PAR_SUBMISSION_DAYS);
}

export interface DueCountdownInfo {
  deadline: string;
  daysRemaining: number | null;
  isOverdue: boolean;
  isDueSoon: boolean;
}

export function getDueCountdownInfo(deadline: string, now: Date = new Date()): DueCountdownInfo {
  const clean = campusDateKey(deadline);
  const daysRemaining = clean ? calendarDaysRemaining(clean, now) : null;
  return {
    deadline: clean,
    daysRemaining,
    isOverdue: daysRemaining !== null && daysRemaining < 0,
    isDueSoon: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 3,
  };
}

export function resolveActivityName(document: any, activities: any[] = []): string {
  const linked = activities.find((activity) => [activity.id, activity.proposalId, activity.eventId]
    .filter(Boolean).includes(document?.eventId || document?.eventReportId || document?.activityId));
  return [linked?.title, linked?.activityTitle, document?.eventTitle, document?.activityTitle, document?.title]
    .find((value) => typeof value === 'string' && value.trim())?.trim() || 'Unnamed activity';
}
