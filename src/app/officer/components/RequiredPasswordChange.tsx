import { useState, type FormEvent } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../../services/firebase';
import { changeOfficerOrAdviserPassword } from '../../auth/services/password.service';
import type { OfficerProfile } from '../../auth/hooks/useOfficerProfile';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';

export function RequiredPasswordChange({ profile }: { profile: OfficerProfile }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cleanupPassword, setCleanupPassword] = useState('');

  const isAdviser = Boolean(profile.isAdviser);

  async function retryCleanup() {
    setBusy(true);
    setError('');
    try {
      await changeOfficerOrAdviserPassword(cleanupPassword, cleanupPassword, profile);
      window.location.assign('/officer/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Could not complete account setup.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const trimmedCurrent = current.trim();
    const trimmedNext = next.trim();
    const trimmedConfirm = confirm.trim();

    if (!trimmedCurrent) {
      setError('Please enter your current or temporary password.');
      return;
    }

    if (trimmedNext.length < 8 || !/[A-Z]/.test(trimmedNext) || !/[0-9\W_]/.test(trimmedNext)) {
      setError('New password must have at least 8 characters, an uppercase letter, and a number or symbol.');
      return;
    }

    if (trimmedNext === trimmedCurrent) {
      setError('New password must be different from your current or temporary password.');
      return;
    }

    if (trimmedNext !== trimmedConfirm) {
      setError('Passwords do not match. Please verify your password confirmation.');
      return;
    }

    setBusy(true);
    try {
      await changeOfficerOrAdviserPassword(trimmedCurrent, trimmedNext, profile);
      window.location.assign('/officer/dashboard');
    } catch (err: any) {
      const code = err?.code || '';
      const rawMsg = err?.message || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        rawMsg.includes('auth/invalid-credential') ||
        rawMsg.includes('auth/wrong-password') ||
        rawMsg.toLowerCase().includes('invalid-credential')
      ) {
        setError('Incorrect current password. Please check your current or temporary password and try again.');
      } else {
        setError(rawMsg || 'Could not change your password.');
      }
      if (rawMsg.startsWith('Your password was saved')) {
        setCleanupPassword(trimmedNext);
      }
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await signOut(auth);
    localStorage.removeItem('sti_sync_officer_session');
    window.location.assign('/portal/login');
  }

  // Live password requirements
  const hasMinLength = next.length >= 8;
  const hasUpper = /[A-Z]/.test(next);
  const hasNumberOrSymbol = /[0-9\W_]/.test(next);
  const passwordsMatch = Boolean(next && confirm && next === confirm);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200/80 p-4 sm:p-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl animate-in fade-in duration-200">
        {/* Top Accent Stripe */}
        <div className="h-2 w-full bg-gradient-to-r from-[#FFD41C] via-[#0E4EBD] to-[#001A4D]" />

        <div className="p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-[#001A4D] flex items-center justify-center shrink-0 shadow-inner">
              <ShieldCheck className="w-6 h-6 text-[#0E4EBD]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1">
                Required Security Setup
              </div>
              <h1 className="text-xl font-extrabold text-[#001A4D]">Change your password</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAdviser ? 'Club Adviser Account' : 'Student Officer Account'} · {profile.email}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-600 bg-blue-50/70 border border-blue-100 rounded-xl p-3 leading-relaxed">
            Please set your own private, permanent password before continuing to your dashboard.
          </p>

          {/* Form */}
          <form onSubmit={submit} className="space-y-4">
            {/* Current / Temporary Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                Current or Temporary Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  placeholder="Enter current or temporary password"
                  required
                  autoComplete="current-password"
                  className="w-full pr-10 pl-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                  tabIndex={-1}
                  title={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNext ? 'text' : 'password'}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  placeholder="Enter new permanent password"
                  required
                  autoComplete="new-password"
                  className="w-full pr-10 pl-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNext(!showNext)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                  tabIndex={-1}
                  title={showNext ? 'Hide password' : 'Show password'}
                >
                  {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirm new permanent password"
                  required
                  autoComplete="new-password"
                  className="w-full pr-10 pl-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                  tabIndex={-1}
                  title={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Criteria Checklist */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] space-y-1.5 text-slate-600">
              <div className="font-semibold text-slate-800">Password requirements:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-0.5">
                <span className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-600' : 'text-slate-300'}`} />
                  At least 8 characters
                </span>
                <span className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${hasUpper ? 'text-emerald-600' : 'text-slate-300'}`} />
                  1 uppercase letter
                </span>
                <span className={`flex items-center gap-1.5 ${hasNumberOrSymbol ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${hasNumberOrSymbol ? 'text-emerald-600' : 'text-slate-300'}`} />
                  1 number or symbol
                </span>
                <span className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className={`w-3.5 h-3.5 ${passwordsMatch ? 'text-emerald-600' : 'text-slate-300'}`} />
                  Passwords match
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs animate-in fade-in duration-150"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{error}</span>
              </div>
            )}

            {/* Cleanup Retry if needed */}
            {cleanupPassword && (
              <button
                type="button"
                disabled={busy}
                onClick={retryCleanup}
                className="w-full rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
              >
                Retry Account Cleanup
              </button>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={busy || !current || !next || !confirm}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] p-3 text-xs font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFD41C]" />
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-[#FFD41C]" />
                  <span>Change Password & Continue</span>
                </>
              )}
            </button>

            {/* Sign Out Link */}
            <div className="pt-2 text-center">
              <button
                type="button"
                disabled={busy}
                onClick={logout}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors font-medium cursor-pointer"
              >
                Sign out of this session
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
