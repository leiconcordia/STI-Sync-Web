/**
 * src/app/utils/name.utils.ts
 *
 * Universal utility for structured name formatting and parsing.
 * Supports standard Philippine and institutional naming conventions:
 * First Name, Middle Initial (e.g. "B." or "B"), and Last Name.
 */

/**
 * Assembles First Name, Middle Initial, and Last Name into standard institutional format.
 * Example: ("Riselle Mae", "Lucanas", "B") -> "Riselle Mae B. Lucanas"
 * Example: ("Maria", "Santos", "") -> "Maria Santos"
 * Example: ("Emily", "Rojas", "L.") -> "Emily L. Rojas"
 */
export function formatStructuredFullName(
  firstName?: string | null,
  lastName?: string | null,
  middleInitial?: string | null
): string {
  const cleanFirst = (firstName || '').trim();
  const cleanLast = (lastName || '').trim();
  const rawMi = (middleInitial || '').trim();

  let formattedMi = '';
  if (rawMi) {
    // Strip non-letters, take up to 2 characters (e.g., "B" or "Ma"), and format with period
    const letters = rawMi.replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (letters) {
      formattedMi = `${letters.slice(0, 2)}.`;
    }
  }

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

  // Check if second-to-last word is a single initial or initial with dot (e.g. "B" or "B.")
  const middleCandidate = parts[parts.length - 2];
  if (/^[A-Za-z]{1,2}\.?$/.test(middleCandidate)) {
    const cleanLetters = middleCandidate.replace(/[^a-zA-Z]/g, '').toUpperCase();
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

