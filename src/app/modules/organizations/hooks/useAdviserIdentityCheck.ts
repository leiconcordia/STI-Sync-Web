import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ADVISER_NAME_REVIEW_REQUIRED, adviserNameVerification, adviserCandidateKey, collectAdviserIdentities, inspectAdviserIdentity,
  type AdviserIdentity, type AdviserNameVerification,
} from '../utils/adviser-identity.utils';
import { readAdviserIdentities } from '../services/adviser-identity.service';
import { checkAdviserAccount, type AdviserAccountLookup } from '../services/adviser-account.service';
import { registerSingletonResetter } from '../../../utils/createSingletonStream';

// Short TTL cache prevents opening 3 live full-collection listeners every time a modal renders,
// while validateBeforeNext() still fetches fresh records before saving.
const IDENTITY_CACHE_TTL_MS = 60_000;
let cachedIdentityRecords: AdviserIdentity[] | null = null;
let cachedIdentityFetchedAt = 0;
let inflightIdentityPromise: Promise<{ records: AdviserIdentity[]; organizations: any[] }> | null = null;

registerSingletonResetter(() => {
  cachedIdentityRecords = null;
  cachedIdentityFetchedAt = 0;
  inflightIdentityPromise = null;
});

async function getCachedAdviserIdentities() {
  if (cachedIdentityRecords && Date.now() - cachedIdentityFetchedAt < IDENTITY_CACHE_TTL_MS) {
    return { records: cachedIdentityRecords };
  }
  if (!inflightIdentityPromise) {
    inflightIdentityPromise = readAdviserIdentities()
      .then((res) => {
        cachedIdentityRecords = res.records;
        cachedIdentityFetchedAt = Date.now();
        return res;
      })
      .finally(() => {
        inflightIdentityPromise = null;
      });
  }
  return inflightIdentityPromise;
}

export function useAdviserIdentityCheck(candidate: AdviserIdentity, organizations: any[], excludeOrgId?: string, enabled = true) {
  const [records, setRecords] = useState<AdviserIdentity[]>(() => cachedIdentityRecords || []);
  const [loading, setLoading] = useState(() => Boolean(enabled && !cachedIdentityRecords));
  const [error, setError] = useState<Error | null>(null);
  const [confirmedKey, setConfirmedKey] = useState('');
  const [accountCheck, setAccountCheck] = useState<{ email: string; account: AdviserAccountLookup } | null>(null);
  const currentKey = adviserCandidateKey(candidate);
  const latestKey = useRef(currentKey); latestKey.current = currentKey;
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(!cachedIdentityRecords || Date.now() - cachedIdentityFetchedAt >= IDENTITY_CACHE_TTL_MS);
    getCachedAdviserIdentities()
      .then((res) => {
        if (cancelled) return;
        setRecords(res.records);
        setError(null);
        setLoading(false);
      })
      .catch((failure: any) => {
        if (cancelled) return;
        setError(failure);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled]);
  const existing = useMemo(() => collectAdviserIdentities(records, organizations, excludeOrgId), [records, organizations, excludeOrgId]);
  const result = useMemo(() => inspectAdviserIdentity(candidate, existing), [candidate, existing]);
  const account = accountCheck?.email === candidate.email?.trim().toLowerCase() ? accountCheck.account : null;
  const accountPerson: AdviserIdentity | null = account?.exists && account.eligible !== false && !result.emailMatch ? { id: `account:${account.uid}`, authUid: account.uid, name: account.displayName || account.email, email: account.email, sourceType: 'account' } : null;
  const expected = adviserNameVerification(candidate, result.matches);
  const expectedKey = JSON.stringify(expected);
  useEffect(() => setConfirmedKey(''), [expectedKey]);
  const confirmed = Boolean(result.matches.length && confirmedKey === expectedKey);
  const verification: AdviserNameVerification | undefined = confirmed ? expected : undefined;
  const validationError = loading ? 'Wait for the adviser identity check to finish.' : error ? 'Adviser identities could not be checked. Refresh and try again.'
    : result.emailError || result.employeeIdError || (account?.exists && (!candidate.existingAccountUid || account.eligible === false) ? account.reason || 'This email already has an account. Choose Use this person to reuse it.' : '')
    || (result.matches.length && !confirmed && !candidate.existingAccountUid ? ADVISER_NAME_REVIEW_REQUIRED : '');
  const validateBeforeNext = async () => {
    const key = currentKey;
    const fresh = await readAdviserIdentities();
    cachedIdentityRecords = fresh.records;
    cachedIdentityFetchedAt = Date.now();
    const account = await checkAdviserAccount(candidate.email || '');
    if (latestKey.current !== key) return { valid: false, errors: { name: 'The adviser details changed during validation. Press Next again.' } };
    setRecords(fresh.records); setLoading(false); setError(null); setAccountCheck({ email: (candidate.email || '').trim().toLowerCase(), account });
    const inspection = inspectAdviserIdentity(candidate, collectAdviserIdentities(fresh.records, fresh.organizations, excludeOrgId));
    const errors: { name?: string; email?: string; employeeId?: string } = {};
    if (inspection.emailError) errors.email = inspection.emailError;
    if (inspection.employeeIdError) errors.employeeId = inspection.employeeIdError;
    if (account.exists && (!candidate.existingAccountUid || account.uid !== candidate.existingAccountUid || account.eligible === false)) errors.email = account.reason || 'This email already has an account. Choose Use this person to reuse it.';
    if (candidate.existingAccountUid && !account.exists) errors.email = 'The selected account no longer exists. Check the adviser details and select the person again.';
    const freshExpected = adviserNameVerification(candidate, inspection.matches);
    if (inspection.matches.length && !candidate.existingAccountUid && confirmedKey !== JSON.stringify(freshExpected)) errors.name = ADVISER_NAME_REVIEW_REQUIRED;
    return { valid: !Object.keys(errors).length, errors };
  };
  return {
    ...result, matchedPeople: accountPerson ? [...result.matchedPeople, accountPerson] : result.matchedPeople,
    loading, error, confirmed, verification, validationError, validateBeforeNext, account, selectedExisting: Boolean(candidate.existingAccountUid),
    confirmDifferentPerson: (checked: boolean) => setConfirmedKey(checked ? expectedKey : ''),
  };
}
