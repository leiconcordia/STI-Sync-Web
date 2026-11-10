import { useState, type FormEvent } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../../services/firebase';
import { changeOfficerOrAdviserPassword } from '../../auth/services/password.service';
import type { OfficerProfile } from '../../auth/hooks/useOfficerProfile';

export function RequiredPasswordChange({ profile }: { profile: OfficerProfile }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cleanupPassword, setCleanupPassword] = useState('');

  async function retryCleanup() {
    setBusy(true); setError('');
    try {
      await changeOfficerOrAdviserPassword(cleanupPassword, cleanupPassword, profile);
      window.location.assign('/officer/dashboard');
    } catch (err: any) { setError(err?.message || 'Could not complete account setup.'); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!current || next.length < 8 || !/[A-Z]/.test(next) || !/[0-9\W_]/.test(next)) {
      setError('Enter your current password and a new password with at least 8 characters, an uppercase letter, and a number or symbol.'); return;
    }
    if (next !== confirm || next === current) { setError('Passwords must match and the new password must differ from the current one.'); return; }
    setBusy(true); setError('');
    try {
      await changeOfficerOrAdviserPassword(current, next, profile);
      window.location.assign('/officer/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Could not change your password.');
      if (err?.message?.startsWith('Your password was saved')) setCleanupPassword(next);
    }
    finally { setBusy(false); }
  }

  async function logout() {
    await signOut(auth);
    localStorage.removeItem('sti_sync_officer_session');
    window.location.assign('/portal/login');
  }

  return <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
    <h1 className="text-xl font-bold text-[#001A4D]">Change your password</h1><p className="text-sm text-gray-600">Choose a private password before continuing.</p>
    <label className="block text-sm">Current or temporary password<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 p-2" /></label>
    <label className="block text-sm">New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 p-2" /></label>
    <label className="block text-sm">Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 p-2" /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {cleanupPassword && <button type="button" disabled={busy} onClick={retryCleanup} className="w-full rounded-lg border p-2">Retry account setup</button>}
    <button disabled={busy} className="w-full rounded-lg bg-[#001A4D] p-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Change password'}</button>
    <button type="button" disabled={busy} onClick={logout} className="w-full text-sm text-gray-600">Sign out</button>
  </form></main>;
}
