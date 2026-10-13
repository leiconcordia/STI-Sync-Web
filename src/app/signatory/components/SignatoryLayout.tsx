/**
 * src/app/signatory/components/SignatoryLayout.tsx
 *
 * Dedicated executive sidebar navigation and shell for Institutional Signatories.
 * Eliminates redundant top-level action pills and scattered buttons.
 * Inspired by modern executive card-based layouts while preserving STI Sync brand identity.
 */

import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, Navigate, NavLink, useLocation } from 'react-router';
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
} from 'lucide-react';
import stiOrmocLogo from '../../../imports/STI_ORMOC_LOGO.jpg';
import { SIGNATORY_SESSION_KEY } from '../../auth/hooks/useOfficerAuth';
import DigitalSignatureModal from './DigitalSignatureModal';
import SignatoryChangePasswordModal from './SignatoryChangePasswordModal';

export default function SignatoryLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<any>(null);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(SIGNATORY_SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setSession(parsed);
        // Automatically open password modal if user is on temporary credentials
        if (parsed.requiresPasswordChange) {
          setIsPasswordModalOpen(true);
        }
      } catch (e) {
        console.error('Failed to parse signatory session', e);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(SIGNATORY_SESSION_KEY);
    localStorage.removeItem('sti_sync_officer_session');
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

  const navLinks = [
    {
      to: '/signatory/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      to: '/signatory/proposals',
      label: 'Activity Proposals',
      icon: FileText,
    },
    {
      to: '/signatory/liquidations',
      label: 'Financial Liquidation',
      icon: FileSpreadsheet,
    },
    {
      to: '/signatory/post-activity-reports',
      label: 'Post-Activity Reports',
      icon: FileCheck2,
    },
    {
      to: '/signatory/reports',
      label: 'Campus Reports',
      icon: BarChart3,
    },
    {
      to: '/signatory/account',
      label: 'Account & Settings',
      icon: UserCheck,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-slate-800 flex flex-col md:flex-row antialiased">
      {/* ── MOBILE TOP BAR ── */}
      <div className="md:hidden bg-[#001A4D] text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-white p-0.5">
            <img src={stiOrmocLogo} alt="STI Logo" className="w-full h-full object-cover rounded-full" />
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
              <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white p-0.5 shadow-md shrink-0 border border-white/20">
                <img
                  src={stiOrmocLogo}
                  alt="STI College Ormoc Logo"
                  className="w-full h-full object-cover rounded-xl"
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

        {/* Dynamic Route Content */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet
            context={{
              session,
              setSession,
              onOpenSignatureModal: () => setIsSignatureModalOpen(true),
              onOpenPasswordModal: () => setIsPasswordModalOpen(true),
            }}
          />
        </div>
      </main>

      {/* Global Modals for E-Signature and Password Change */}
      {isSignatureModalOpen && (
        <DigitalSignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          signatoryName={session?.name || 'Signatory'}
          signatoryRole={session?.roleTitle || session?.role || 'Signatory'}
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
