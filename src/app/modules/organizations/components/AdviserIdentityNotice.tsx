import React from 'react';
import { adviserFullName, canReuseAdviserIdentity, type AdviserIdentity } from '../utils/adviser-identity.utils';
import type { useAdviserIdentityCheck } from '../hooks/useAdviserIdentityCheck';

export function AdviserIdentityNotice({ check, onVerificationChange, onUsePerson, busy = false }: {
  check: ReturnType<typeof useAdviserIdentityCheck>; onVerificationChange?: () => void;
  onUsePerson?: (person: AdviserIdentity) => void | Promise<void>; busy?: boolean;
}) {
  if (check.error) return <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">Adviser identities could not be checked. Refresh and try again before continuing.</p>;
  if (!check.matchedPeople.length && !check.emailError && !check.employeeIdError) return null;
  const labels = { adviser: 'Club adviser', signatory: 'Institutional signatory', student: 'Student', admin: 'SAS administrator', account: 'Existing account' };
  return <div role="region" aria-label="Possible duplicate adviser" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
    <div><p className="font-bold">Existing person found</p><p className="mt-1">This name, email, or Faculty / Employee ID matches a person already in STI Sync. Use that person's existing account instead of creating another.</p></div>
    {(check.emailError || check.employeeIdError) && <div role="alert" className="space-y-1 font-semibold text-rose-800">{check.emailError && <p>{check.emailError}</p>}{check.employeeIdError && <p>{check.employeeIdError}</p>}</div>}
    <ul className="space-y-2">{check.matchedPeople.map((record, index) => <li key={`${record.sourceType}:${record.id || index}`} className="space-y-1 rounded-lg border border-amber-200 bg-white/70 p-3">
      <strong>{adviserFullName(record)}</strong><span className="block">{record.email || 'No email recorded'} · Faculty / Employee ID: {record.employeeId || 'Not recorded'}</span>
      <span className="block">{labels[record.sourceType || 'adviser']}{record.organizationName ? ` · ${record.organizationName}` : ''}</span>
      {onUsePerson && canReuseAdviserIdentity(record) && <button type="button" onClick={() => void onUsePerson(record)} disabled={busy || check.loading || (check.account?.email === record.email && check.account.eligible === false)} className="mt-2 rounded-lg bg-[#001A4D] px-3 py-2 font-bold text-white disabled:opacity-50">Use this person</button>}
      {record.sourceType === 'adviser' && record.organizationId && <p className="font-semibold">Already assigned to {record.organizationName || 'a club'}. Manage that existing assignment; an adviser can only advise one club.</p>}
      {record.sourceType === 'student' && <p className="font-semibold">A student account cannot be used as a faculty adviser account.</p>}
    </li>)}</ul>
    {check.matches.length > 0 && !check.selectedExisting && !check.emailError && !check.employeeIdError && !check.account?.exists && <label className="flex cursor-pointer items-start gap-2 font-semibold"><input type="checkbox" aria-label="I verified this is a different person" checked={check.confirmed} disabled={check.loading || busy} onChange={(event) => { check.confirmDifferentPerson(event.target.checked); onVerificationChange?.(); }} className="mt-0.5 h-4 w-4 shrink-0" /><span>I verified this is a different person, using their email or Faculty / Employee ID.</span></label>}
  </div>;
}
