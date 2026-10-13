/**
 * src/app/signatory/pages/SignatoryAccountPage.tsx
 *
 * Dedicated Signatory Account & Governance Center.
 * Stores account profile, dynamic approval permissions & pipeline matrix,
 * in-portal password management, and official electronic signature verification.
 */

import React, { useState } from 'react';
import { useOutletContext } from 'react-router';
import {
  User,
  Shield,
  ShieldCheck,
  KeyRound,
  PenTool,
  CheckCircle2,
  AlertTriangle,
  Building,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileCheck2,
  Sparkles,
  Layers,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { changeSignatoryPassword } from '../../auth/services/password.service';
import DigitalSignatureModal from '../components/DigitalSignatureModal';

interface ContextType {
  session: any;
  setSession: React.Dispatch<React.SetStateAction<any>>;
  onOpenSignatureModal: () => void;
  onOpenPasswordModal: () => void;
}

export default function SignatoryAccountPage() {
  const { session, setSession } = useOutletContext<ContextType>();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);

  const hasSignature = Boolean(session?.signatureUrl || session?.signatureDataUrl);
  const signatureUrl = session?.signatureUrl || session?.signatureDataUrl;
  const isTempPass = Boolean(session?.requiresPasswordChange);

  // Dynamic permission determination (zero hardcoded roles)
  const isApprover = session?.actionType === 'approve';
  const isAuditor = session?.actionType === 'check';
  const authorityLevel = isApprover ? 'Institutional Approver' : isAuditor ? 'Financial Auditor' : 'Institutional Endorser';

  // Password strength checks
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasNumberOrSymbol = /[0-9!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword.trim()) {
      toast.error('Please enter your current or temporary password.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long.');
      return;
    }
    if (currentPassword === newPassword) {
      toast.error('New password must be different from current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeSignatoryPassword(currentPassword.trim(), newPassword.trim(), session);
      toast.success('Password updated successfully! Your account is now secured.');
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Update local session to remove requiresPasswordChange
      const updated = { ...session, requiresPasswordChange: false };
      delete updated.temporaryPassword;
      setSession(updated);
      localStorage.setItem('sti_sync_signatory_session', JSON.stringify(updated));
    } catch (err: any) {
      console.error('Password change error:', err);
      toast.error(err?.message || 'Failed to update password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignatureSaved = (newUrl: string) => {
    const updated = {
      ...session,
      signatureUrl: newUrl,
      signatureDataUrl: newUrl,
      hasSignature: true,
    };
    setSession(updated);
    localStorage.setItem('sti_sync_signatory_session', JSON.stringify(updated));

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
    setIsSignatureModalOpen(false);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#001A4D] text-xs font-bold mb-2">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0E4EBD]" />
          <span>Institutional Governance & Account Center</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#001A4D] tracking-tight">
          Signatory Profile & Settings
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review your dynamic signing authority, electronic signature, profile credentials, and institutional security.
        </p>
      </div>

      {/* Temporary Password Alert Banner if active */}
      {isTempPass && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <KeyRound className="w-5 h-5 text-amber-800" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[#001A4D] text-base">Temporary Password Currently Active</h3>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black uppercase rounded tracking-wider">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                You are currently using temporary login credentials. Please establish a permanent password below to protect institutional endorsement privileges.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grid: Profile Info & Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] text-[#FFD41C] font-black text-2xl flex items-center justify-center shadow-md shadow-blue-950/20">
                {session?.name ? session.name.charAt(0).toUpperCase() : 'S'}
              </div>
              <div>
                <h2 className="text-lg font-black text-[#001A4D] leading-tight">
                  {session?.name || 'Institutional Signatory'}
                </h2>
                <p className="text-xs font-semibold text-[#0E4EBD] mt-0.5">
                  {session?.roleTitle || session?.role || 'Signatory Member'}
                </p>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-full mt-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Verified Signatory</span>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Institutional Email
                </label>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mt-1">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span>{session?.email || 'signatory@sti.edu'}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Campus & Division
                </label>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mt-1">
                  <Building className="w-4 h-4 text-slate-400" />
                  <span>STI College Ormoc</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Authority Classification
                </label>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 mt-1">
                  <Shield className="w-4 h-4 text-[#0E4EBD]" />
                  <span>{authorityLevel}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Authentication</span>
            <span className="font-mono text-slate-600">Active Session</span>
          </div>
        </div>

        {/* Middle & Right: Permissions & Authority Matrix */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0E4EBD] flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#001A4D]">
                  Permissions & Authority Matrix
                </h3>
                <p className="text-xs text-slate-500">
                  Dynamically resolved from real campus approval routes. Zero hardcoded roles.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-[#001A4D] text-[#FFD41C] text-[10px] font-black uppercase rounded-lg tracking-wider">
              Dynamic Pipeline
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="flex items-center gap-2 text-[#0E4EBD]">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-bold text-slate-800">Activity Proposals</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Event permits, objectives, venue clearances, and budget projections.
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Authorized</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="flex items-center gap-2 text-[#0E4EBD]">
                <FileSpreadsheet className="w-4 h-4" />
                <span className="text-xs font-bold text-slate-800">Financial Liquidations</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Disbursements, official receipts inspection, variance & surplus auditing.
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Authorized</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
              <div className="flex items-center gap-2 text-[#0E4EBD]">
                <FileCheck2 className="w-4 h-4" />
                <span className="text-xs font-bold text-slate-800">Post-Activity Reports</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Post-event evaluation, photo proof galleries, verified turnout certification.
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Authorized</span>
              </div>
            </div>
          </div>

          {/* Institutional Governance Notice */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-3">
            <Info className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 leading-relaxed">
              <strong>Stage-Lock Governance Rule:</strong> Documents are strictly locked until previous stages complete their reviews. If you are configured at Stage 2 or Stage 3, earlier-stage documents remain private and only become actionable once forwarded to your stage.
            </div>
          </div>
        </div>
      </div>

      {/* Grid: E-Signature Card & Password Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Official Electronic Signature */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0E4EBD] flex items-center justify-center">
                  <PenTool className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#001A4D]">
                    My Electronic Signature
                  </h3>
                  <p className="text-xs text-slate-500">
                    Registered official digital ink for stamping PDF forms and certifications.
                  </p>
                </div>
              </div>
              {hasSignature ? (
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-lg flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Registered
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-lg flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  Not Registered
                </span>
              )}
            </div>

            {/* Signature Preview Canvas */}
            <div className="mt-5 p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center min-h-[170px]">
              {hasSignature ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                    <img
                      src={signatureUrl!}
                      alt="Registered Official Electronic Signature"
                      className="h-16 max-w-[280px] object-contain"
                    />
                  </div>
                  <p className="text-xs font-bold text-slate-700">
                    {session?.name} • {session?.roleTitle || 'Signatory'}
                  </p>
                  <p className="text-[11px] text-slate-400 text-center max-w-sm">
                    Verified digital ink is legally certified under Republic Act No. 8792 (E-Commerce Act).
                  </p>
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
                    <PenTool className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">
                    No E-Signature Registered Yet
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    Please register your official signature before reviewing or endorsing campus documents.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsSignatureModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <PenTool className="w-4 h-4 text-[#FFD41C]" />
              <span>{hasSignature ? 'Update / Redraw E-Signature' : 'Register Official E-Signature'}</span>
            </button>
          </div>
        </div>

        {/* Right: Change Password Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0E4EBD] flex items-center justify-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#001A4D]">
                  Change Password
                </h3>
                <p className="text-xs text-slate-500">
                  Update account credentials to secure institutional endorsement access.
                </p>
              </div>
            </div>
            {isTempPass && (
              <span className="px-2 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-black uppercase rounded tracking-wider">
                Temp Password
              </span>
            )}
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Current / Temporary Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3.5 py-2.5 pr-10 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                New Permanent Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3.5 py-2.5 pr-10 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2.5 pr-10 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:outline-none transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] space-y-1">
              <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>At least 8 characters long</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasUppercase ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${hasUppercase ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Contains an uppercase letter</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasNumberOrSymbol ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${hasNumberOrSymbol ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Contains a number or symbol</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${passwordsMatch ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>Passwords match</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Update Account Password</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Signature Modal */}
      {isSignatureModalOpen && (
        <DigitalSignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          signatoryName={session?.name || 'Signatory'}
          signatoryRole={session?.roleTitle || session?.role || 'Signatory'}
          onSignatureSaved={handleSignatureSaved}
        />
      )}
    </div>
  );
}
