import { parseFullNameToParts, type PersonNameFields } from '../../../utils/name.utils';

export interface AdviserIdentity extends PersonNameFields {
  id?: string;
  authUid?: string;
  email?: string;
  employeeId?: string;
  organizationId?: string;
  organizationName?: string;
  isActive?: boolean;
  status?: string;
  existingAccountUid?: string;
  sourceType?: 'adviser' | 'signatory' | 'student' | 'admin' | 'account';
}
export interface AdviserNameVerification {
  candidateKey: string;
  matchedAdvisers: string[];
  verifiedBy?: string;
  verifiedAt?: unknown;
}

const normalized = (value: unknown) => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const middleKey = (value: unknown) => normalized(value).replace(/\./g, '');
const parts = (person: PersonNameFields) => {
  const parsed = parseFullNameToParts(person.name);
  return {
    first: normalized(person.firstName || parsed.firstName),
    last: normalized(person.lastName || parsed.lastName),
    middle: middleKey(person.middleName ?? person.middleInitial ?? parsed.middleInitial),
  };
};

export function adviserFullName(person: PersonNameFields): string {
  if (person.firstName?.trim() && person.lastName?.trim()) {
    return [person.firstName, person.middleName ?? person.middleInitial, person.lastName].filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');
  }
  return (person.name || '').trim();
}

/** Full middle names distinguish namesakes. Legacy initials are possible matches only. */
export function adviserNamesMayMatch(first: PersonNameFields, second: PersonNameFields): boolean {
  const a = parts(first); const b = parts(second);
  const completeA = normalized(adviserFullName(first)); const completeB = normalized(adviserFullName(second));
  if (completeA && completeA === completeB) return true;
  if (!a.first || !a.last || a.first !== b.first || a.last !== b.last) return false;
  if (!a.middle || !b.middle) return true;
  if (a.middle.length > 1 && b.middle.length > 1) return a.middle === b.middle;
  return a.middle[0] === b.middle[0];
}

/** Include embedded legacy advisers, then deduplicate the same account from both sources. */
export function collectAdviserIdentities(records: AdviserIdentity[], organizations: any[] = [], excludeOrgId?: string): AdviserIdentity[] {
  const all = [
    ...records.map((record) => ({ sourceType: 'adviser' as const, ...record })),
    ...organizations.filter((org) => org.adviser).map((org) => ({ ...org.adviser, sourceType: 'adviser' as const, id: `embedded:${org.id}`, organizationId: org.id, organizationName: org.name })),
  ];
  const active = all.filter((record) => record.sourceType !== 'student'
    && record.isActive !== false && !['inactive', 'revoked', 'deleted', 'archived'].includes(normalized(record.status))
    && (!excludeOrgId || record.organizationId !== excludeOrgId));
  const unique = new Map<string, AdviserIdentity>();
  active.sort((a, b) => (a.sourceType === 'adviser' ? 0 : 1) - (b.sourceType === 'adviser' ? 0 : 1)).forEach((record) => {
    const key = normalized(record.email) || normalized(record.employeeId) || record.authUid || record.id || JSON.stringify(parts(record));
    if (!unique.has(key)) unique.set(key, record);
  });
  return [...unique.values()];
}

export function inspectAdviserIdentity(candidate: AdviserIdentity, records: AdviserIdentity[]) {
  const email = normalized(candidate.email);
  const employeeId = normalized(candidate.employeeId);
  const emailMatch = email ? records.find((record) => normalized(record.email) === email) : undefined;
  const employeeMatch = employeeId ? records.find((record) => normalized(record.employeeId) === employeeId) : undefined;
  const selected = (record?: AdviserIdentity) => Boolean(record && candidate.existingAccountUid && normalized(record.email) === email
    && (!record.authUid || record.authUid === candidate.existingAccountUid) && canReuseAdviserIdentity(record));
  const matches = records.filter((record) => adviserNamesMayMatch(candidate, record));
  return {
    matches, emailMatch, employeeMatch,
    matchedPeople: [...new Set([...matches, ...[emailMatch, employeeMatch].filter(Boolean)])] as AdviserIdentity[],
    emailError: emailMatch && !selected(emailMatch) ? `This email already belongs to ${adviserFullName(emailMatch)}${emailMatch.organizationName ? ` (${emailMatch.organizationName})` : ''}. Use this person's existing account instead of creating another.` : '',
    employeeIdError: employeeMatch && !selected(employeeMatch) ? `This Faculty / Employee ID already belongs to ${adviserFullName(employeeMatch)}${employeeMatch.organizationName ? ` (${employeeMatch.organizationName})` : ''}. Use this person's existing account instead of creating another.` : '',
  };
}

export function canReuseAdviserIdentity(record: AdviserIdentity): boolean {
  return Boolean(record.email && record.sourceType !== 'student' && !(record.sourceType === 'adviser' && record.organizationId));
}

export function adviserCandidateKey(candidate: AdviserIdentity): string {
  return JSON.stringify([parts(candidate), normalized(candidate.email), normalized(candidate.employeeId), candidate.existingAccountUid || '']);
}

/** Bind verification to the entered identity AND the current set of matching accounts. */
export function adviserNameVerification(candidate: AdviserIdentity, matches: AdviserIdentity[]): AdviserNameVerification {
  return {
    candidateKey: adviserCandidateKey(candidate),
    matchedAdvisers: matches.map((record) => JSON.stringify([
      record.id || '', record.authUid || '', parts(record), normalized(record.email), normalized(record.employeeId), record.organizationId || '',
    ])).sort(),
  };
}

export function isAdviserNameVerified(candidate: AdviserIdentity, matches: AdviserIdentity[], verification?: AdviserNameVerification | null): boolean {
  if (!matches.length) return true;
  if (!verification) return false;
  const expected = adviserNameVerification(candidate, matches);
  return expected.candidateKey === verification.candidateKey
    && JSON.stringify(expected.matchedAdvisers) === JSON.stringify(verification.matchedAdvisers);
}

export const ADVISER_NAME_REVIEW_REQUIRED = 'An adviser with the same or a similar name already exists. Review the matching accounts and verify that this is a different person before continuing.';
