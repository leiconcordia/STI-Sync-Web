/**
 * src/app/signatory/components/SignatoryLayout.tsx
 *
 * Dedicated executive sidebar navigation and shell for Institutional Signatories.
 * Eliminates redundant top-level action pills and scattered buttons.
 * Inspired by modern executive card-based layouts while preserving STI Sync brand identity.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, Navigate, NavLink, useLocation } from 'react-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { formatPersonName } from '../../utils/name.utils';
import { WorkspaceSwitcher } from '../../auth/components/WorkspaceSwitcher';
import {
  clearPortalSessions,
  readStoredPortalWorkspaces,
} from '../../auth/services/portal-workspace.service';
import { auth } from '../../../services/firebase';
import { signOut } from 'firebase/auth';
import { toast } from 'sonner';
import {
  isSignatoryApplicableTo,
  getSignatoryAuthorizedWorkflows,
} from '../../modules/signatories/types/signatory.types';
import { resolveUserSignature } from '../../modules/signatories/services/signatory-resolver.service';
import {
  saveSignatorySignatureInDatabase,
  setSignatoryPortalDeactivation,
} from '../../modules/signatories/services/signatory.service';
import {
  LayoutDashboard,
  FileText,
  FileSpreadsheet,
  FileCheck2,
  BarChart3,
  UserCheck,
  LogOut,
  Building,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  PenTool,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  Power,
  UserCog,
  CalendarClock,
  Loader2,
} from 'lucide-react';
import stiOrmocLogo from '../../../imports/STI_ORMOC_LOGO.jpg';
import { SIGNATORY_SESSION_KEY } from '../../auth/hooks/useOfficerAuth';
import DigitalSignatureModal from './DigitalSignatureModal';
import SignatoryChangePasswordModal from './SignatoryChangePasswordModal';
import { NotificationDropdown } from '../../modules/notifications/components/NotificationDropdown';

export default function SignatoryLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<any>(null);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const attemptedSubSigResolveRef = useRef(false);

  useEffect(() => {
    if (session?.requiresPasswordChange) setIsPasswordModalOpen(true);
  }, [session?.requiresPasswordChange]);

  useEffect(() => {
    const raw = localStorage.getItem(SIGNATORY_SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        const roleLower = String(parsed.role || '').trim().toLowerCase();
        if (
          parsed.id === 'sas_coordinator' ||
          ['sas_coordinator', 'sas_head', 'sao_head', 'sas_admin', 'sao_admin'].includes(roleLower)
        ) {
          clearPortalSessions();
          void signOut(auth);
          navigate('/portal/login', { replace: true });
          return;
        }
        setSession({ ...parsed, name: formatPersonName(parsed) });
        // Automatically open password modal if user is on temporary credentials
        if (parsed.requiresPasswordChange) {
          setIsPasswordModalOpen(true);
        }
      } catch (e) {
        console.error('Failed to parse signatory session', e);
      }
    }
  }, []);

  // Real-time synchronization of signatory record from Firestore (Substitute-isolated)
  useEffect(() => {
    const targetPrimaryId = session?.delegatedForSignatoryId || session?.id;
    if (!targetPrimaryId) return;
    const unsub = onSnapshot(
      doc(db, 'institutional_signatories', targetPrimaryId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const workflows = getSignatoryAuthorizedWorkflows(data as any);

          let shouldExitDelegation = false;
          setSession((prev: any) => {
            if (!prev) return prev;

            if (prev.actingAsSubstitute) {
              const sub = data.substitute || null;
              const subEmailLower = String(data.substituteEmail || sub?.email || '').trim().toLowerCase();
              const prevEmailLower = String(prev.email || '').trim().toLowerCase();
              const stillAuthorizedSub =
                data.isActive !== false &&
                data.portalDeactivated === true &&
                Boolean(sub) &&
                (!subEmailLower || !prevEmailLower || subEmailLower === prevEmailLower);

              if (!stillAuthorizedSub) {
                shouldExitDelegation = true;
                return prev;
              }

              const baseRoleTitle = data.roleTitle || data.role || prev.delegatedForRoleTitle || 'Institutional Signatory';
              const subSig = sub?.signatureUrl || sub?.signatureDataUrl || prev.signatureUrl || prev.signatureDataUrl || null;
              const updated = {
                ...prev,
                id: docSnap.id,
                delegatedForSignatoryId: docSnap.id,
                delegatedForSignatoryUid: data.uid || docSnap.id,
                delegatedForSignatoryName: formatPersonName(data, prev.delegatedForSignatoryName),
                delegatedForSignatoryEmail: data.email || prev.delegatedForSignatoryEmail || '',
                delegatedForRoleTitle: baseRoleTitle,
                role: data.role || prev.role,
                roleTitle: `Acting ${baseRoleTitle}`,
                actionType: data.actionType || prev.actionType,
                department: data.department || prev.department || '',
                departmentId: data.departmentId || prev.departmentId || '',
                applicableWorkflows: workflows,
                applicableScope: data.applicableScope,
                canApproveProposal: data.canApproveProposal ?? (data.actionType === 'approver'),
                canApproveLiquidation: data.canApproveLiquidation ?? (data.actionType === 'approver'),
                canApprovePar: data.canApprovePar ?? (data.actionType === 'approver'),
                name: formatPersonName(sub, prev.name),
                signatureUrl: subSig,
                signatureDataUrl: subSig,
                portalDeactivated: true,
                portalDeactivatedReason: data.portalDeactivatedReason || null,
                portalDeactivatedUntil: data.portalDeactivatedUntil || null,
                requiresPasswordChange: Boolean(sub?.tempPass || sub?.requiresPasswordChange),
              };
              delete updated.tempPass;
              delete updated.temporaryPassword;
              delete updated.customPassword;
              delete updated.passwordHash;
              localStorage.setItem(SIGNATORY_SESSION_KEY, JSON.stringify(updated));
              return updated;
            }

            const updated = {
              ...prev,
              ...data,
              name: formatPersonName(data, prev.name),
              requiresPasswordChange: Boolean(data.tempPass || data.requiresPasswordChange || data.requiresChangePassword || data.resetInProgress),
              id: docSnap.id,
              actingAsSubstitute: false,
              portalDeactivated: Boolean(data.portalDeactivated),
              portalDeactivatedReason: data.portalDeactivatedReason || null,
              portalDeactivatedUntil: data.portalDeactivatedUntil || null,
              substitute: data.substitute || null,
              substituteEmail: data.substituteEmail || data.substitute?.email || null,
              applicableWorkflows: workflows,
              applicableScope: data.applicableScope,
              canApproveProposal: data.canApproveProposal ?? (data.actionType === 'approver'),
              canApproveLiquidation: data.canApproveLiquidation ?? (data.actionType === 'approver'),
              canApprovePar: data.canApprovePar ?? (data.actionType === 'approver'),
            };
            delete updated.tempPass;
            delete updated.temporaryPassword;
            delete updated.customPassword;
            delete updated.passwordHash;
            localStorage.setItem(SIGNATORY_SESSION_KEY, JSON.stringify(updated));
            return updated;
          });

          if (shouldExitDelegation) {
            toast.info('The Primary Signatory portal has been reactivated. Exiting Acting Signatory mode.');
            const remaining = readStoredPortalWorkspaces().filter((w) => w.id !== `signatory_sub:${targetPrimaryId}`);
            if (remaining.length > 0) {
              navigate('/portal/workspaces', { replace: true });
            } else {
              clearPortalSessions();
              void signOut(auth);
              navigate('/portal/login', { replace: true });
            }
          }
        }
      },
      (err) => {
        console.warn('Signatory live sync warning:', err);
      }
    );
    return () => unsub();
  }, [session?.id, session?.delegatedForSignatoryId, navigate]);

  // Auto-reuse an existing verified e-signature for a Substitute Signatory if not yet cached on the substitute slot
  useEffect(() => {
    if (!session?.actingAsSubstitute) return;
    if (session?.signatureUrl || session?.signatureDataUrl) return;
    if (attemptedSubSigResolveRef.current) return;
    attemptedSubSigResolveRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const foundSig = await resolveUserSignature({
          uid: session.substituteUid || session.authUid || session.uid,
          email: session.email,
          name: session.name,
        });
        if (!cancelled && foundSig) {
          setSession((prev: any) => {
            if (!prev || prev.signatureUrl) return prev;
            const next = { ...prev, signatureUrl: foundSig, signatureDataUrl: foundSig, hasSignature: true };
            localStorage.setItem(SIGNATORY_SESSION_KEY, JSON.stringify(next));
            return next;
          });
          // Persist reused signature onto the substitute slot without touching Primary's signature
          saveSignatorySignatureInDatabase(
            {
              uid: session.substituteUid || session.authUid || session.uid,
              email: session.email,
              actingAsSubstitute: true,
              delegatedForSignatoryId: session.delegatedForSignatoryId || session.id,
            },
            null,
            foundSig
          ).catch(() => {});
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.actingAsSubstitute, session?.email, session?.uid, session?.signatureUrl, session?.signatureDataUrl]);

  const handleReactivateMyPortal = async () => {
    if (!session?.id || session?.actingAsSubstitute) return;
    setIsReactivating(true);
    try {
      const res = await setSignatoryPortalDeactivation(
        session.id,
        { deactivated: false },
        { uid: session.uid || session.id, name: session.name, role: 'signatory' }
      );
      if (!res.success) {
        toast.error(res.error || 'Could not reactivate your Signatory Portal.');
        return;
      }
      setSession((prev: any) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          portalDeactivated: false,
          portalDeactivatedReason: null,
          portalDeactivatedUntil: null,
        };
        localStorage.setItem(SIGNATORY_SESSION_KEY, JSON.stringify(next));
        return next;
      });
      toast.success('Your Signatory Portal is now active again. Delegated substitute access has been paused.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reactivate portal.');
    } finally {
      setIsReactivating(false);
    }
  };

  const handleLogout = () => {
    clearPortalSessions();
    void signOut(auth);
    navigate('/portal/login');
  };

  const handleSignatureSaved = (newUrl: string) => {
    const updated = {
      ...session,
      signatureUrl: newUrl,
      signatureDataUrl: newUrl,
      hasSignature: true,
    };
    setSession(updated);
    localStorage.setItem(SIGNATORY_SESSION_KEY, JSON.stringify(updated));

    const rawOfficer = localStorage.getItem('sti_sync_officer_session');
    if (rawOfficer) {
      try {
        const parsedOff = JSON.parse(rawOfficer);
        parsedOff.signatureUrl = newUrl;
        parsedOff.signatureDataUrl = newUrl;
        localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsedOff));
      } catch (e) {
        console.warn('Could not update officer session copy:', e);
      }
    }
  };

  const handlePasswordChanged = () => {
    const updated = { ...session, requiresPasswordChange: false };
    delete updated.temporaryPassword;
    setSession(updated);
    localStorage.setItem(SIGNATORY_SESSION_KEY, JSON.stringify(updated));

    const rawOfficer = localStorage.getItem('sti_sync_officer_session');
    if (rawOfficer) {
      try {
        const parsedOff = JSON.parse(rawOfficer);
        parsedOff.requiresPasswordChange = false;
        delete parsedOff.temporaryPassword;
        localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsedOff));
      } catch (e) {
        console.warn('Could not update officer session copy:', e);
      }
    }
  };

  if (!session && !localStorage.getItem(SIGNATORY_SESSION_KEY)) {
    return <Navigate to="/portal/login" replace />;
  }

  const hasSignature = Boolean(session?.signatureUrl || session?.signatureDataUrl);
  const isTempPassActive = Boolean(session?.requiresPasswordChange);

  // Dynamic workflow access capabilities
  const canAccessProposal = session ? isSignatoryApplicableTo(session, 'proposal') : true;
  const canAccessLiquidation = session ? isSignatoryApplicableTo(session, 'liquidation') : true;
  const canAccessPAR = session ? isSignatoryApplicableTo(session, 'par') : true;

  // Primary authorized fallback route for unauthorized document page visits
  const defaultFallbackRoute = canAccessLiquidation
    ? '/signatory/liquidations'
    : canAccessProposal
    ? '/signatory/proposals'
    : canAccessPAR
    ? '/signatory/post-activity-reports'
    : '/signatory/dashboard';

  // Guard direct unauthorized URL accesses
  if (session && location.pathname.startsWith('/signatory/proposals') && !canAccessProposal) {
    return <Navigate to={defaultFallbackRoute} replace />;
  }
  if (session && location.pathname.startsWith('/signatory/liquidations') && !canAccessLiquidation) {
    return <Navigate to={defaultFallbackRoute} replace />;
  }
  if (session && location.pathname.startsWith('/signatory/post-activity-reports') && !canAccessPAR) {
    return <Navigate to={defaultFallbackRoute} replace />;
  }

  const navLinks = [
    {
      to: '/signatory/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      to: '/signatory/proposals',
      label: 'Activity Proposals',
      icon: FileText,
      visible: canAccessProposal,
    },
    {
      to: '/signatory/liquidations',
      label: 'Financial Liquidation',
      icon: FileSpreadsheet,
      visible: canAccessLiquidation,
    },
    {
      to: '/signatory/post-activity-reports',
      label: 'Post-Activity Reports',
      icon: FileCheck2,
      visible: canAccessPAR,
    },
    {
      to: '/signatory/reports',
      label: 'Campus Reports',
      icon: BarChart3,
      visible: true,
    },
    {
      to: '/signatory/signed',
      label: 'Documents I Signed',
      icon: CheckCircle2,
      visible: true,
    },
    {
      to: '/signatory/account',
      label: 'Account & Settings',
      icon: UserCheck,
      visible: true,
    },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-slate-800 flex flex-col md:flex-row antialiased">
      {/* ── MOBILE TOP BAR ── */}
      <div className="md:hidden bg-[#001A4D] text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-8 rounded-lg overflow-hidden flex items-center justify-center">
            <img src={stiOrmocLogo} alt="STI College Ormoc Logo" className="w-full h-full object-contain rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-wide">STI SYNC</span>
              <span className="px-1.5 py-0.2 bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] text-[9px] font-black uppercase rounded">
                Signatory
              </span>
            </div>
            <p className="text-[10px] text-gray-300 truncate max-w-[160px]">
              {session?.name || 'Signatory Portal'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white rounded-xl shadow-xs">
            <NotificationDropdown
              role="signatory"
              userId={
                [session?.id, session?.uid, session?.employeeId, session?.email]
                  .filter(Boolean)
                  .join('|') || undefined
              }
            />
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── EXECUTIVE SIDEBAR ── */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-40 w-72 bg-[#001A4D] text-white flex flex-col justify-between transition-transform duration-300 shadow-2xl md:shadow-none ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full p-4 overflow-y-auto [scrollbar-width:none]">
          {/* Brand Header */}
          <div className="pt-2 pb-6 px-2 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-14 h-11 rounded-xl overflow-hidden shadow-md shrink-0 border border-white/20 flex items-center justify-center">
                <img
                  src={stiOrmocLogo}
                  alt="STI College Ormoc Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-black text-white text-base tracking-wide">STI SYNC</span>
                  <span className="px-2 py-0.5 bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] text-[10px] font-black uppercase rounded tracking-wider">
                    Signatory
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 truncate">
                  Institutional Governance
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="py-6 space-y-1.5 flex-1">
            <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-[#FFD41C]/70">
              Institutional Navigation
            </div>
            {navLinks.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all group ${
                      isActive
                        ? 'bg-[#0E4EBD] text-white shadow-md shadow-blue-950/40 ring-1 ring-white/20'
                        : 'text-gray-300 hover:text-white hover:bg-white/8'
                    }`
                  }
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-black/20 text-[#FFD41C]/90">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>

          {/* Sidebar Footer: User Capsule & Logout */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <WorkspaceSwitcher />
            {/* Quick Profile Capsule */}
            <NavLink
              to="/signatory/account"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors group cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-[#FFD41C] text-[#001A4D] font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                {session?.name ? session.name.charAt(0).toUpperCase() : 'S'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate group-hover:text-[#FFD41C] transition-colors">
                  {session?.name || 'Signatory'}
                </div>
                <div className="text-[10px] text-gray-300 truncate">
                  {session?.roleTitle || session?.role || 'Signatory Member'}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </NavLink>

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-bold transition-all cursor-pointer border border-rose-500/20"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Sleek Top Header Bar */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Building className="w-4 h-4 text-[#0E4EBD]" />
            <span className="font-semibold text-slate-700">STI College Ormoc</span>
            <span>/</span>
            <span className="font-bold text-[#001A4D]">Institutional Governance</span>
          </div>

          <div className="flex items-center gap-4">
            <NotificationDropdown
              role="signatory"
              userId={
                [session?.id, session?.uid, session?.employeeId, session?.email]
                  .filter(Boolean)
                  .join('|') || undefined
              }
            />
            <div className="text-right text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Session Active
              </span>
              <span className="font-extrabold text-[#001A4D]">
                {session?.roleTitle || 'Institutional Signatory'}
              </span>
            </div>

            <NavLink
              to="/signatory/account"
              className="flex items-center gap-2 p-1.5 pr-3 rounded-xl hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] text-[#FFD41C] font-black text-xs flex items-center justify-center shadow-xs">
                {session?.name ? session.name.charAt(0).toUpperCase() : 'S'}
              </div>
              <div className="text-left text-xs">
                <span className="font-bold text-slate-800 block leading-tight">{session?.name}</span>
                <span className="text-[10px] text-emerald-600 font-semibold block leading-tight">
                  {hasSignature ? 'Signature Ready' : 'Setup Signature'}
                </span>
              </div>
            </NavLink>
          </div>
        </header>

        {/* Acting Signatory Delegation Banner */}
        {session?.actingAsSubstitute && (
          <div className="bg-indigo-950 text-white px-4 sm:px-8 py-3 border-b border-indigo-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] flex items-center justify-center shrink-0">
                <UserCog className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold tracking-wide text-[#FFD41C] uppercase">
                  Acting Signatory Mode • Delegated Approval Authority
                </p>
                <p className="text-xs text-indigo-100">
                  Signing on behalf of <strong className="text-white">{session?.delegatedForSignatoryName}</strong> ({session?.delegatedForRoleTitle || 'Institutional Signatory'}) while on leave. Your personal e-signature will be applied.
                </p>
              </div>
            </div>
            {!hasSignature && (
              <button
                type="button"
                onClick={() => setIsSignatureModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FFD41C] hover:bg-amber-300 text-[#001A4D] text-xs font-black shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <PenTool className="w-3.5 h-3.5" />
                Register Your E-Signature
              </button>
            )}
          </div>
        )}

        {/* Dynamic Route Content */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          {!session?.actingAsSubstitute && session?.portalDeactivated && !location.pathname.startsWith('/signatory/account') ? (
            <div className="max-w-2xl mx-auto mt-6 bg-white rounded-3xl border border-amber-200 shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-[#001A4D] to-[#0A2E6D] px-6 py-5 text-white flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] flex items-center justify-center shrink-0">
                  <CalendarClock className="w-6 h-6" />
                </div>
                <div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-400/20 text-[#FFD41C] text-[10px] font-black uppercase tracking-wider mb-1">
                    Portal Deactivated • On Leave
                  </span>
                  <h2 className="text-lg font-black tracking-tight">
                    Your Signatory Portal is Currently Deactivated
                  </h2>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Your approval workspace is paused while you are on leave.
                  {session?.substitute?.name ? (
                    <> Your designated Substitute Signatory, <strong className="text-slate-900">{session.substitute.name}</strong> ({session.substitute.email}), currently has Acting Signatory access to process your pending documents.</>
                  ) : (
                    <> No substitute signatory is currently assigned.</>
                  )}
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Leave Reason</span>
                  <span className="font-bold text-slate-800">{session?.portalDeactivatedReason || 'On Leave'}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isReactivating}
                    onClick={handleReactivateMyPortal}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md disabled:opacity-60 transition-all cursor-pointer"
                  >
                    {isReactivating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Reactivating Portal...
                      </>
                    ) : (
                      <>
                        <Power className="w-4 h-4" />
                        Reactivate My Signatory Portal
                      </>
                    )}
                  </button>
                  <NavLink
                    to="/signatory/account"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    Manage Substitute & Settings
                  </NavLink>
                </div>
              </div>
            </div>
          ) : (
            <Outlet
              context={{
                session,
                setSession,
                onOpenSignatureModal: () => setIsSignatureModalOpen(true),
                onOpenPasswordModal: () => setIsPasswordModalOpen(true),
                canAccessProposal,
                canAccessLiquidation,
                canAccessPAR,
              }}
            />
          )}
        </div>
      </main>

      {/* Global Modals for E-Signature and Password Change */}
      {isSignatureModalOpen && (
        <DigitalSignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          signatoryUid={
            session?.actingAsSubstitute
              ? (session?.substituteUid || session?.authUid || session?.uid)
              : (session?.id || session?.uid)
          }
          signatoryEmail={session?.email}
          signatoryName={session?.name || 'Signatory'}
          signatoryRole={session?.roleTitle || session?.role || 'Signatory'}
          currentSignatureUrl={session?.signatureUrl || session?.signatureDataUrl}
          actingAsSubstitute={Boolean(session?.actingAsSubstitute)}
          delegatedForSignatoryId={session?.delegatedForSignatoryId || session?.id}
          onSignatureSaved={handleSignatureSaved}
        />
      )}

      {isPasswordModalOpen && (
        <SignatoryChangePasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
          session={session}
          onPasswordChanged={handlePasswordChanged}
          isMandatory={isTempPassActive}
        />
      )}
    </div>
  );
}
