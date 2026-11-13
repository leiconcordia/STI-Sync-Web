import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ArrowRight, Building2, Layers, LogOut, ShieldCheck, Users } from 'lucide-react';
import { auth } from '../../services/firebase';
import { activatePortalWorkspace, clearPortalSessions, loadPortalWorkspaces, type PortalWorkspace } from './services/portal-workspace.service';

export default function PortalWorkspaces() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<PortalWorkspace[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate('/portal/login', { replace: true }); return; }
      if (live) setUserEmail(user.email || '');
      try { const choices = await loadPortalWorkspaces(); if (live) setWorkspaces(choices); }
      catch (failure: any) { if (live) setError(failure.message || 'Unable to load your workspaces.'); }
      finally { if (live) setLoading(false); }
    });
    return () => { live = false; unsubscribe(); };
  }, [navigate]);

  const handleSignOut = async () => {
    clearPortalSessions();
    await signOut(auth);
    navigate('/portal/login', { replace: true });
  };

  const renderBadge = (kind: PortalWorkspace['kind']) => {
    if (kind === 'signatory') return { icon: ShieldCheck, badge: 'Signatory Portal', cls: 'bg-[#001A4D]/10 text-[#001A4D]' };
    if (kind === 'adviser') return { icon: Building2, badge: 'Adviser Workspace', cls: 'bg-amber-100 text-amber-900' };
    return { icon: Users, badge: 'Officer Workspace', cls: 'bg-blue-100 text-blue-900' };
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <section className="w-full max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#001A4D]/5 px-3 py-1 text-xs font-bold text-[#001A4D]">
              <Layers className="h-3.5 w-3.5" />
              STI Sync Portal
            </div>
            <h1 className="text-2xl font-bold text-[#001A4D]">Choose your workspace</h1>
            <p className="text-sm text-slate-500">
              {userEmail ? <>Signed in as <span className="font-semibold text-slate-700">{userEmail}</span>. Select which role you want to open.</> : 'Select the role workspace you want to open.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>

        {loading ? (
          <p role="status" className="py-6 text-center text-sm text-slate-500">Loading your workspaces…</p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
        ) : !workspaces.length ? (
          <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No active role is assigned to this account. Contact SAS.</p>
        ) : (
          <div className="space-y-3">
            {workspaces.map((workspace) => {
              const meta = renderBadge(workspace.kind);
              const Icon = meta.icon;
              return (
                <button
                  type="button"
                  key={workspace.id}
                  onClick={() => {
                    try { navigate(activatePortalWorkspace(workspace), { replace: true }); }
                    catch (failure: any) { setError(failure.message); }
                  }}
                  className="group flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-[#0E4EBD] hover:bg-blue-50/50"
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.cls}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-base text-[#001A4D]">{workspace.label}</strong>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>{meta.badge}</span>
                      </div>
                      {(workspace.organizationName || workspace.subtitle) && (
                        <span className="mt-1 block text-sm text-slate-600">
                          {workspace.organizationName || workspace.subtitle}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#0E4EBD]" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
