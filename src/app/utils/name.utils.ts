/**
 * src/app/utils/name.utils.ts
 *
 * Universal utility for structured name formatting and parsing.
 * Supports standard Philippine and institutional naming conventions:
 * Store full middle names and use their first letter in signing/display names.
 */

/**
 * Assembles a display/signing name from a full middle name or legacy initial.
 * Example: ("Riselle Mae", "Lucanas", "B") -> "Riselle Mae B. Lucanas"
 * Example: ("Maria", "Santos", "") -> "Maria Santos"
 * Example: ("Emily", "Rojas", "L.") -> "Emily L. Rojas"
 */
export function formatStructuredFullName(
  firstName?: string | null,
  lastName?: string | null,
  middleName?: string | null
): string {
  const cleanFirst = (firstName || '').trim();
  const cleanLast = (lastName || '').trim();
  const formattedMi = formatMiddleInitial(middleName);

  if (cleanFirst && cleanLast) {
    return formattedMi
      ? `${cleanFirst} ${formattedMi} ${cleanLast}`
      : `${cleanFirst} ${cleanLast}`;
  }

  if (cleanFirst) {
    return formattedMi ? `${cleanFirst} ${formattedMi}` : cleanFirst;
  }

  return cleanLast || '';
}

export function formatMiddleInitial(middleName?: string | null): string {
  const letter = (middleName || '').trim().match(/\p{L}/u)?.[0];
  return letter ? `${letter.toLocaleUpperCase()}.` : '';
}

export interface PersonNameFields {
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  middleInitial?: string | null;
  name?: string | null;
  displayName?: string | null;
  studentName?: string | null;
}

/** Preserve compound first/last names and the casing entered for them. */
export function formatPersonName(person?: PersonNameFields | null, fallback = ''): string {
  if (!person) return fallback;
  const stored = person.name || person.displayName || person.studentName || fallback;
  if (person.firstName?.trim() && person.lastName?.trim()) {
    return formatStructuredFullName(person.firstName, person.lastName, person.middleName ?? person.middleInitial);
  }
  return stored.trim() || formatStructuredFullName(person.firstName, person.lastName, person.middleName ?? person.middleInitial);
}

/** Keep the full middle name and a derived initial for older readers of the record. */
export function structuredNameFields(person: PersonNameFields) {
  const parsed = parseFullNameToParts(person.name || person.displayName || person.studentName);
  const firstName = (person.firstName ?? parsed.firstName).trim();
  const lastName = (person.lastName ?? parsed.lastName).trim();
  const middleName = (person.middleName ?? person.middleInitial ?? parsed.middleInitial).trim();
  return {
    firstName,
    lastName,
    middleName,
    middleInitial: formatMiddleInitial(middleName),
    name: formatPersonName({ ...person, firstName, lastName, middleName }),
  };
}

/**
 * Parses existing legacy full name strings into structured parts.
 * Example: "Riselle Mae B. Lucanas" -> { firstName: "Riselle Mae", middleInitial: "B.", lastName: "Lucanas" }
 * Example: "Maria Santos" -> { firstName: "Maria", middleInitial: "", lastName: "Santos" }
 * Example: "Engr. Sheena Joy S. Muyuela" -> { firstName: "Engr. Sheena Joy", middleInitial: "S.", lastName: "Muyuela" }
 */
export function parseFullNameToParts(fullName?: string | null): {
  firstName: string;
  lastName: string;
  middleInitial: string;
} {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: '', lastName: '', middleInitial: '' };
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '', middleInitial: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '', middleInitial: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1], middleInitial: '' };

  // Only unambiguous initials; surname particles such as "de" and "la" are words.
  const middleCandidate = parts[parts.length - 2];
  if (/^(?:\p{L}\.?|\p{L}{2}\.)$/u.test(middleCandidate)) {
    const cleanLetters = middleCandidate.replace(/[^\p{L}]/gu, '').toUpperCase();
    const middleInitial = cleanLetters ? `${cleanLetters}.` : '';
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, parts.length - 2).join(' ');
    return { firstName, lastName, middleInitial };
  }

  // Default fallback: last item is last name, everything preceding is first name
  return {
    firstName: parts.slice(0, -1).join(' '),
    middleInitial: '',
    lastName: parts[parts.length - 1],
  };
}

