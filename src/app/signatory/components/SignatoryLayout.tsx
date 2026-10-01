/**
 * src/app/signatory/components/SignatoryLayout.tsx
 *
 * Dedicated executive top-navigation and shell for Institutional Signatories.
 * Includes prominent change password controls and automatic modal prompting
 * when a temporary password is active.
 */

import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, Navigate } from 'react-router';
import {
  FileSignature,
  LogOut,
  Building,
  CheckCircle,
  AlertTriangle,
  User,
  Shield,
  FileCheck,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import stiOrmocLogo from '../../../imports/STI_ORMOC_LOGO.jpg';
import { SIGNATORY_SESSION_KEY } from '../../auth/hooks/useOfficerAuth';
import DigitalSignatureModal from './DigitalSignatureModal';
import SignatoryChangePasswordModal from './SignatoryChangePasswordModal';

export default function SignatoryLayout() {
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

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

  const hasSignature = Boolean(session?.signatureUrl);
  const isTempPassActive = Boolean(session?.requiresPasswordChange);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Executive Top Navigation Bar */}
      <header className="bg-[#001A4D] text-white border-b border-[#0A2E6D] sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Left Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white p-0.5 shadow-sm border border-white/20">
              <img
                src={stiOrmocLogo}
                alt="STI College Ormoc Logo"
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-wide">STI SYNC</span>
                <span className="px-2 py-0.5 bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C] text-[10px] font-black uppercase rounded tracking-wider">
                  Signatory Portal
                </span>
              </div>
              <p className="text-[11px] text-gray-300">
                Institutional Document Approvals & Governance
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            {/* Password Change / Security Button */}
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                isTempPassActive
                  ? 'bg-amber-400 text-[#001A4D] hover:bg-amber-300 animate-pulse'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/15'
              }`}
              title="Change Account Password"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>{isTempPassActive ? 'Change Temp Password' : 'Password'}</span>
            </button>

            {/* Signature Status Button */}
            <button
              onClick={() => setIsSignatureModalOpen(true)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                hasSignature
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                  : 'bg-amber-400 text-[#001A4D] hover:bg-amber-300'
              }`}
            >
              {hasSignature ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">E-Signature Registered</span>
                  <span className="sm:hidden">Signature</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Setup Official E-Signature</span>
                  <span className="sm:hidden">Setup Signature</span>
                </>
              )}
            </button>

            {/* User Profile Capsule */}
            <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-[#FFD41C] text-[#001A4D] font-extrabold text-xs flex items-center justify-center shadow-xs">
                {session?.name ? session.name.charAt(0).toUpperCase() : 'S'}
              </div>
              <div className="text-left text-xs">
                <div className="font-bold text-white leading-tight">{session?.name || 'Signatory'}</div>
                <div className="text-[11px] text-[#FFD41C] font-medium leading-tight">
                  {session?.roleTitle || session?.role || 'Institutional Approver'}
                </div>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Persistent Security Alert Banner if Temporary Password is still active */}
      {isTempPassActive && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-white px-4 py-2.5 shadow-xs border-b border-amber-600">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs font-medium">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-white text-amber-700 flex items-center justify-center flex-shrink-0 shadow-xs">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <span>
                <strong>Action Required:</strong> You are currently using an administrative temporary password. Please set your permanent password to secure your account. Once updated, your temporary password will be permanently disabled.
              </span>
            </div>
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              className="px-3.5 py-1 bg-[#001A4D] hover:bg-[#0A2E6D] text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap flex-shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#FFD41C]" />
              Update Password Now
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet
          context={{
            session,
            onOpenSignatureModal: () => setIsSignatureModalOpen(true),
            onOpenPasswordModal: () => setIsPasswordModalOpen(true),
          }}
        />
      </main>

      {/* Digital Signature Studio Modal */}
      {session && (
        <DigitalSignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          signatoryUid={session.id || session.uid}
          signatoryName={session.name}
          signatoryEmail={session.email}
          currentSignatureUrl={session.signatureUrl}
          onSignatureSaved={handleSignatureSaved}
        />
      )}

      {/* Signatory Change Password Modal */}
      {session && (
        <SignatoryChangePasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
          session={session}
          isMandatory={isTempPassActive}
          onPasswordChanged={handlePasswordChanged}
        />
      )}
    </div>
  );
}
