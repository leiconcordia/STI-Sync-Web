import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { activatePortalWorkspace, loadPortalWorkspaces, type PortalWorkspace } from './services/portal-workspace.service';

export default function PortalWorkspaces() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<PortalWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate('/portal/login', { replace: true }); return; }
      try { const choices = await loadPortalWorkspaces(); if (live) setWorkspaces(choices); }
      catch (failure: any) { if (live) setError(failure.message || 'Unable to load your workspaces.'); }
      finally { if (live) setLoading(false); }
    });
    return () => { live = false; unsubscribe(); };
  }, [navigate]);
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5"><section className="w-full max-w-xl space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
    <h1 className="text-2xl font-bold text-[#001A4D]">Choose your workspace</h1><p className="text-sm text-slate-500">Use your existing account to open the role you need.</p>
    {loading ? <p role="status">Loading your workspaces…</p> : error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : !workspaces.length ? <p role="status">No active role is assigned to this account. Contact SAS.</p> : <div className="space-y-3">{workspaces.map((workspace) => <button type="button" key={workspace.id} onClick={() => { try { navigate(activatePortalWorkspace(workspace), { replace: true }); } catch (failure: any) { setError(failure.message); } }} className="block w-full rounded-xl border p-4 text-left hover:border-blue-500 hover:bg-blue-50"><strong className="block text-[#001A4D]">{workspace.label}</strong>{workspace.organizationName && <span className="mt-1 block text-sm text-slate-600">{workspace.organizationName}</span>}</button>)}</div>}
  </section></main>;
}
