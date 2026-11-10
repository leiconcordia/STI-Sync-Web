import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldAlert, Users } from 'lucide-react';
import { useAdviserProfile } from '../../auth';
import { getAccounts, type AccountKind, type AccountRow } from '../services/account-directory.service';
import { ResetPasswordModal } from './ResetPasswordModal';

const tabs: { id: AccountKind; label: string }[] = [
  { id: 'advisers', label: 'Organization Advisers' },
  { id: 'students', label: 'Students' },
  { id: 'signatories', label: 'Signatories' },
];
const PAGE_SIZE = 8;

export function AccountManagementDashboard() {
  const { profile, loading: authLoading, error: authError } = useAdviserProfile();
  const [kind, setKind] = useState<AccountKind>('advisers');
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetTarget, setResetTarget] = useState<{ kind: AccountKind; row: AccountRow } | null>(null);
  const [message, setMessage] = useState('');
  // Enable only after the trusted function and its security prerequisites are deployed.
  const resetEnabled = import.meta.env.VITE_ACCOUNT_RESET_ENABLED !== 'false';


  useEffect(() => {
    if (!profile?.isActive) return;
    let cancelled = false;
    setRows([]);
    setError('');
    setLoading(true);
    getAccounts(kind).then((result) => {
      if (!cancelled) setRows(result);
    }).catch(() => {
      if (!cancelled) setError('Could not load accounts. Check your connection and try again.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [kind, profile?.uid, profile?.isActive]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => [row.name, row.identifier, row.email].some((value) => value.toLowerCase().includes(term)));
  }, [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (authLoading) return <p className="text-gray-500">Checking your account…</p>;
  if (authError || !profile?.isActive) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">An active SAS administrator account is required to view account management.</div>;

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-[#001A4D]">Account Management</h1><p className="mt-1 text-sm text-gray-500">View adviser, student, and signatory accounts.</p></div>
    {!resetEnabled && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="h-5 w-5 shrink-0" /><p>Password reset is unavailable until the reset service and security controls are configured.</p></div>}
    {message && <p role="status" className="rounded-lg bg-green-50 p-4 text-sm text-green-800">{message}</p>}
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 p-4" role="tablist" aria-label="Account type">
        {tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={kind === tab.id} onClick={() => { setKind(tab.id); setPage(1); setSearch(''); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${kind === tab.id ? 'bg-[#001A4D] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{tab.label}</button>)}
      </div>
      <div className="p-4"><label className="relative block max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input aria-label="Search accounts" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name, ID, or email" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" /></label></div>
      {error && <p role="alert" className="px-4 pb-4 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Password</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-gray-100">
        {visible.map((row) => <tr key={row.id}><td className="px-4 py-3 font-medium text-[#001A4D]">{row.name}</td><td className="px-4 py-3">{row.identifier}</td><td className="px-4 py-3">{row.email || <span className="text-amber-700">No email</span>}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.requiresPasswordChange ? 'Change required' : '—'}</td><td className="px-4 py-3"><button disabled={!resetEnabled || !row.email || row.status !== 'ACTIVE' || resetTarget !== null} onClick={() => { setMessage(''); setResetTarget({ kind, row }); }} className="rounded-md border border-gray-200 px-3 py-1.5 text-[#001A4D] disabled:cursor-not-allowed disabled:text-gray-400">Reset password</button></td></tr>)}
      </tbody></table></div>
      {!loading && !error && visible.length === 0 && <div className="flex flex-col items-center gap-2 p-10 text-sm text-gray-500"><Users className="h-6 w-6" />No accounts found.</div>}
      {loading && <p className="p-6 text-sm text-gray-500">Loading accounts…</p>}
      <div className="flex items-center justify-between border-t border-gray-200 p-4 text-xs text-gray-500"><span>{filtered.length ? `Showing ${(page - 1) * PAGE_SIZE + 1} to ${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} accounts` : 'Showing 0 accounts'}</span><div className="flex items-center gap-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Previous</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Next</button></div></div>
    </section>
    {resetTarget && <ResetPasswordModal account={resetTarget.row} kind={resetTarget.kind} onClose={() => setResetTarget(null)} onCompleted={(result) => {
      setMessage(result.delivery === 'accepted' ? 'Password reset completed. The email provider accepted the message.' : 'Password reset completed, but email delivery failed. Copy the active password in the reset window.');
      if (resetTarget.kind === kind) setRows((items) => items.map((item) => item.id === resetTarget.row.id ? { ...item, requiresPasswordChange: true } : item));
    }} />}
  </div>;
}
