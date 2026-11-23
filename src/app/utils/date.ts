import { format, isValid } from 'date-fns';

/**
 * Safely parses any date representation into a valid JS Date object.
 * Supports:
 * - Firestore Timestamp objects ({ toDate: () => Date } or { seconds, nanoseconds })
 * - JS Date objects
 * - ISO date/time strings
 * - Millisecond timestamps (number)
 * - YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss strings
 */
export function parseDateSafe(input: any): Date | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }

  // Firestore Timestamp with toDate() method
  if (typeof input.toDate === 'function') {
    try {
      const d = input.toDate();
      return isValid(d) ? d : null;
    } catch {
      return null;
    }
  }

  // Firestore-like object with seconds
  if (typeof input.seconds === 'number') {
    const d = new Date(input.seconds * 1000);
    return isValid(d) ? d : null;
  }

  // Native Date instance
  if (input instanceof Date) {
    return isValid(input) ? input : null;
  }

  // Numeric epoch milliseconds or seconds
  if (typeof input === 'number') {
    const d = new Date(input > 10000000000 ? input : input * 1000);
    return isValid(d) ? d : null;
  }

  // String date format
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Pure YYYY-MM-DD calendar date: parse as local date to avoid UTC timezone day-shift
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (ymd) {
      const localDate = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
      return isValid(localDate) && !isNaN(localDate.getTime()) ? localDate : null;
    }

    // Direct JS Date parse
    const parsed = new Date(trimmed);
    if (isValid(parsed) && !isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

/**
 * Formats a date into standard application format: `Aug 9 2005`
 * Example outputs:
 * - Aug 9 2005
 * - Jan 1 2026
 * - Dec 31 2024
 */
export function formatAppDate(date: any, fallback = '—'): string {
  const parsed = parseDateSafe(date);
  if (!parsed) return fallback;
  try {
    return format(parsed, 'MMM d yyyy');
  } catch {
    return fallback;
  }
}

/**
 * Formats a date as "MMM d, yyyy" (e.g. "Aug 9, 2005").
 */
export function formatShortDate(date: any, fallback = '—'): string {
  const parsed = parseDateSafe(date);
  if (!parsed) return fallback;
  try {
    return format(parsed, 'MMM d, yyyy');
  } catch {
    return fallback;
  }
}

function parseLongDateValue(date: any): Date | null {
  if (typeof date === 'string') {
    const trimmed = date.trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (ymd) {
      const localDate = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }
  }
  return parseDateSafe(date);
}

/**
 * Formats a date as "Month d, yyyy" (e.g. "November 15, 2025").
 */
export function formatLongDate(date: any, fallback = '—'): string {
  const parsed = parseLongDateValue(date);
  if (!parsed) return fallback;
  try {
    return format(parsed, 'MMMM d, yyyy');
  } catch {
    return fallback;
  }
}

/**
 * Formats a date and time as "Month d, yyyy • h:mm a".
 */
export function formatLongDateTime(date: any, fallback = '—', separator = ' • '): string {
  const parsed = parseLongDateValue(date);
  if (!parsed) return fallback;
  try {
    return `${format(parsed, 'MMMM d, yyyy')}${separator}${format(parsed, 'h:mm a')}`;
  } catch {
    return fallback;
  }
}

/**
 * Formats a pure date value or replaces YYYY-MM-DD substrings inside text
 * (e.g. "2026-11-07, 08:00 – 12:00" -> "November 7, 2026, 08:00 – 12:00").
 */
export function formatTextWithLongDates(value: any, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(trimmed)) {
      return trimmed.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, y, m, d) => {
        const localDate = new Date(Number(y), Number(m) - 1, Number(d));
        if (Number.isNaN(localDate.getTime())) return match;
        try {
          return format(localDate, 'MMMM d, yyyy');
        } catch {
          return match;
        }
      });
    }
    return formatLongDate(trimmed, trimmed);
  }
  return formatLongDate(value, fallback);
}

/**
 * Checks if a deadline has passed relative to now.
 * For date-only strings (e.g. YYYY-MM-DD), checks whether now is past 23:59:59.999 of that date.
 */
export function isDeadlinePassed(deadline: any): boolean {
  if (!deadline) return false;
  if (typeof deadline === 'string') {
    const trimmed = deadline.trim();
    if (!trimmed) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const endOfDay = new Date(`${trimmed}T23:59:59.999`);
      if (isValid(endOfDay) && !isNaN(endOfDay.getTime())) {
        return Date.now() > endOfDay.getTime();
      }
    }
  }
  const parsed = parseDateSafe(deadline);
  if (!parsed) return false;
  return Date.now() > parsed.getTime();
}

/**
 * Formats a time into standard 12-hour format: `12:49 PM` (no 24h / military time)
 * Example outputs:
 * - 12:49 PM
 * - 8:05 AM
 * - 1:15 PM
 */
export function formatAppTime(date: any, fallback = '—'): string {
  const parsed = parseDateSafe(date);
  if (!parsed) return fallback;
  try {
    return format(parsed, 'h:mm a');
  } catch {
    return fallback;
  }
}

/**
 * Formats a date & time into standard combined format: `Aug 9 2005 • 12:49 PM`
 * Example outputs:
 * - Aug 9 2005 • 12:49 PM
 * - Jan 15 2026 • 8:30 AM
 */
export function formatAppDateTime(date: any, fallback = '—', separator = ' • '): string {
  const parsed = parseDateSafe(date);
  if (!parsed) return fallback;
  try {
    return `${format(parsed, 'MMM d yyyy')}${separator}${format(parsed, 'h:mm a')}`;
  } catch {
    return fallback;
  }
}

/**
 * Formats a 24-hour time string ("10:29" or "14:30" or "08:00:00") to 12-hour AM/PM format ("10:29 AM" or "2:30 PM")
 */
export function format12HourTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const trimmed = timeStr.trim();
  if (!trimmed) return '';

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?$/i);
  if (!ampmMatch) return trimmed;

  let hours = parseInt(ampmMatch[1], 10);
  const minutes = ampmMatch[2];
  const existingAmpm = ampmMatch[3];

  if (existingAmpm) {
    return `${hours}:${minutes} ${existingAmpm.toUpperCase()}`;
  }

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${ampm}`;
}

/**
 * Formats a session's date and start/end time into standard 12-hour format: `Aug 25 2026 • 10:29 AM – 12:00 PM`
 */
export function formatSessionDateTime(dateInput: any, startTime?: string, endTime?: string): string {
  const dateFormatted = formatAppDate(dateInput, 'TBD');
  const startFormatted = format12HourTime(startTime);
  const endFormatted = format12HourTime(endTime);

  if (startFormatted && endFormatted) {
    return `${dateFormatted} • ${startFormatted} – ${endFormatted}`;
  } else if (startFormatted) {
    return `${dateFormatted} • ${startFormatted}`;
  }
  return dateFormatted;
}

/**
 * Formats a date range into standard format: `Aug 9 2005 – Aug 12 2005`
 */
export function formatAppDateRange(start: any, end: any, fallback = '—'): string {
  const pStart = parseDateSafe(start);
  const pEnd = parseDateSafe(end);

  if (!pStart && !pEnd) return fallback;
  if (pStart && !pEnd) return formatAppDate(pStart, fallback);
  if (!pStart && pEnd) return formatAppDate(pEnd, fallback);

  const startStr = format(pStart!, 'MMM d yyyy');
  const endStr = format(pEnd!, 'MMM d yyyy');

  if (startStr === endStr) return startStr;
  return `${startStr} – ${endStr}`;
}
