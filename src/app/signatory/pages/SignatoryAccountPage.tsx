/**
 * src/app/signatory/pages/SignatoryAccountPage.tsx
 *
 * Dedicated Signatory Account & Governance Center.
 * Stores account profile, dynamic approval permissions & pipeline matrix,
 * in-portal password management, and official electronic signature verification.
 */

import React, { useState, useEffect } from 'react';
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
  Ban,
  UserCog,
  CalendarClock,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import { changeSignatoryPassword } from '../../auth/services/password.service';
import DigitalSignatureModal from '../components/DigitalSignatureModal';
import { isSignatoryApplicableTo } from '../../modules/signatories/types/signatory.types';
import { ManageSignatorySubstituteModal } from '../../modules/signatories/components/ManageSignatorySubstituteModal';
import {
  getSignatoryPendingDocuments,
  type PendingDocumentInfo,
} from '../../modules/signatories/services/signatory-validation.service';

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
  const [subModalTab, setSubModalTab] = useState<'substitute' | 'leave' | null>(null);
  const [pendingDocs, setPendingDocs] = useState<PendingDocumentInfo[]>([]);
  const [loadingPendingDocs, setLoadingPendingDocs] = useState(false);

  const isActingSubstitute = Boolean(session?.actingAsSubstitute);
  const assignedSubstitute = session?.substitute || null;
  const isPortalDeactivated = Boolean(session?.portalDeactivated);

  useEffect(() => {
    if (!session?.id || isActingSubstitute) return;
    let cancelled = false;
    setLoadingPendingDocs(true);
    getSignatoryPendingDocuments(session.id, session.email)
      .then((docs) => {
        if (!cancelled) setPendingDocs(docs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingPendingDocs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.email, isActingSubstitute, subModalTab]);

  const hasSignature = Boolean(session?.signatureUrl || session?.signatureDataUrl);
  const signatureUrl = session?.signatureUrl || session?.signatureDataUrl;
  const isTempPass = Boolean(session?.requiresPasswordChange);

  // Dynamic permission determination (zero hardcoded roles)
  const isApprover = session?.actionType === 'approve';
  const isAuditor = session?.actionType === 'check';
  const authorityLevel = isApprover ? 'Institutional Approver' : isAuditor ? 'Financial Auditor' : 'Institutional Endorser';

  const canAccessProp = session ? isSignatoryApplicableTo(session, 'proposal') : true;
  const canAccessLiq = session ? isSignatoryApplicableTo(session, 'liquidation') : true;
  const canAccessPar = session ? isSignatoryApplicableTo(session, 'par') : true;

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
      await changeSignatoryPassword(currentPassword, newPassword, session);
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
            <div className={`p-4 rounded-xl border space-y-2 ${canAccessProp ? 'border-slate-200 bg-slate-50/70' : 'border-slate-200/60 bg-slate-100/50 opacity-75'}`}>
              <div className="flex items-center gap-2 text-[#0E4EBD]">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-bold text-slate-800">Activity Proposals</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Event permits, objectives, venue clearances, and budget projections.
              </p>
              {canAccessProp ? (
                <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Authorized ({session?.canApproveProposal ? 'Approver' : 'Endorser'})</span>
                </div>
              ) : (
                <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                  <Ban className="w-3.5 h-3.5 text-slate-400" />
                  <span>Cannot Sign</span>
                </div>
              )}
            </div>

            <div className={`p-4 rounded-xl border space-y-2 ${canAccessLiq ? 'border-slate-200 bg-slate-50/70' : 'border-slate-200/60 bg-slate-100/50 opacity-75'}`}>
              <div className="flex items-center gap-2 text-[#0E4EBD]">
                <FileSpreadsheet className="w-4 h-4" />
                <span className="text-xs font-bold text-slate-800">Financial Liquidations</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Disbursements, official receipts inspection, variance & surplus auditing.
              </p>
              {canAccessLiq ? (
                <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Authorized ({session?.canApproveLiquidation ? 'Approver' : 'Endorser'})</span>
                </div>
              ) : (
                <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                  <Ban className="w-3.5 h-3.5 text-slate-400" />
                  <span>Cannot Sign</span>
                </div>
              )}
            </div>

            <div className={`p-4 rounded-xl border space-y-2 ${canAccessPar ? 'border-slate-200 bg-slate-50/70' : 'border-slate-200/60 bg-slate-100/50 opacity-75'}`}>
              <div className="flex items-center gap-2 text-[#0E4EBD]">
                <FileCheck2 className="w-4 h-4" />
                <span className="text-xs font-bold text-slate-800">Post-Activity Reports</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Post-event evaluation, photo proof galleries, verified turnout certification.
              </p>
              {canAccessPar ? (
                <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Authorized ({session?.canApprovePar ? 'Approver' : 'Endorser'})</span>
                </div>
              ) : (
                <div className="pt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                  <Ban className="w-3.5 h-3.5 text-slate-400" />
                  <span>Cannot Sign</span>
                </div>
              )}
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

      {/* Substitute Signatory & Portal Availability (On-Leave Delegation) */}
      {isActingSubstitute ? (
        <div className="bg-indigo-50/80 border-2 border-indigo-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center shrink-0">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#001A4D]">
                Acting Signatory Delegation Active
              </h3>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                You are currently acting on behalf of <strong>{session?.delegatedForSignatoryName}</strong> ({session?.delegatedForRoleTitle || 'Institutional Signatory'}) while their portal is deactivated on leave. Your personal e-signature below is kept separate from the primary signatory’s profile and will be stamped as <strong>Acting {session?.delegatedForRoleTitle || 'Signatory'}</strong>.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <UserCog className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#001A4D]">
                  Substitute Signatory & Portal Availability (On-Leave Mode)
                </h3>
                <p className="text-xs text-slate-500">
                  Designate an authorized substitute to approve your pending documents whenever you deactivate your portal on leave.
                </p>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider self-start sm:self-auto ${
                isPortalDeactivated
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {isPortalDeactivated ? 'Portal Deactivated (On Leave)' : 'Portal Active'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Substitute Card */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Designated Substitute Signatory
                  </span>
                  {assignedSubstitute ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                      Assigned
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                      None Assigned
                    </span>
                  )}
                </div>

                {assignedSubstitute ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5">
                    <p className="text-sm font-black text-[#001A4D]">{assignedSubstitute.name}</p>
                    <p className="text-xs text-slate-500">{assignedSubstitute.email}</p>
                    <div className="flex items-center gap-1.5 pt-1 text-[11px] font-bold">
                      {assignedSubstitute.signatureUrl || assignedSubstitute.signatureDataUrl ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          E-Signature Ready (Reused / Registered)
                        </span>
                      ) : (
                        <span className="text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Signature setup required on first approval
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    No substitute is currently assigned. You must assign a substitute before deactivating your portal if you have pending documents to approve.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSubModalTab('substitute')}
                className="w-full py-2.5 px-4 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <UserCog className="w-4 h-4 text-[#FFD41C]" />
                <span>{assignedSubstitute ? 'Change or Remove Substitute' : 'Assign Substitute Signatory'}</span>
              </button>
            </div>

            {/* Portal Deactivation / Leave Card */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Portal Deactivation (On Leave)
                  </span>
                  <span className="text-[11px] font-bold text-slate-600">
                    {loadingPendingDocs ? 'Checking...' : `${pendingDocs.length} Pending Doc${pendingDocs.length === 1 ? '' : 's'}`}
                  </span>
                </div>

                {isPortalDeactivated ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <CalendarClock className="w-4 h-4 text-amber-700" />
                      Currently Deactivated ({session?.portalDeactivatedReason || 'On Leave'})
                    </p>
                    <p className="text-amber-800">
                      {assignedSubstitute
                        ? `${assignedSubstitute.name} can currently log in and approve your pending documents.`
                        : 'Portal is paused. Reactivate anytime to resume signing.'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Going on leave? Deactivating your portal unlocks Acting Signatory login access for your designated substitute.
                    {pendingDocs.length > 0 && !assignedSubstitute && (
                      <span className="block mt-1.5 font-bold text-rose-700">
                        Blocked: You have {pendingDocs.length} pending document{pendingDocs.length === 1 ? '' : 's'} and no substitute assigned.
                      </span>
                    )}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSubModalTab('leave')}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isPortalDeactivated
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                }`}
              >
                <Power className="w-4 h-4" />
                <span>{isPortalDeactivated ? 'Reactivate My Signatory Portal' : 'Deactivate Portal (On Leave)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
          signatoryUid={
            session?.actingAsSubstitute
              ? (session?.substituteUid || session?.authUid || session?.uid)
              : (session?.id || session?.uid)
          }
          signatoryEmail={session?.email}
          signatoryName={session?.name || 'Signatory'}
          signatoryRole={session?.roleTitle || session?.role || 'Signatory'}
          currentSignatureUrl={signatureUrl || undefined}
          actingAsSubstitute={isActingSubstitute}
          delegatedForSignatoryId={session?.delegatedForSignatoryId || session?.id}
          onSignatureSaved={handleSignatureSaved}
        />
      )}

      {/* Substitute & Leave Modal */}
      {subModalTab && session?.id && !isActingSubstitute && (
        <ManageSignatorySubstituteModal
          isOpen={Boolean(subModalTab)}
          onClose={() => setSubModalTab(null)}
          initialTab={subModalTab}
          signatory={{
            id: session.id,
            uid: session.uid,
            name: session.name || 'Institutional Signatory',
            email: session.email || '',
            roleTitle: session.roleTitle || session.role || 'Institutional Signatory',
            department: session.department || '',
            substitute: session.substitute || null,
            portalDeactivated: Boolean(session.portalDeactivated),
            portalDeactivatedReason: session.portalDeactivatedReason || null,
            portalDeactivatedUntil: session.portalDeactivatedUntil || null,
          }}
          actor={{
            uid: session.uid || session.id,
            name: session.name || 'Institutional Signatory',
            role: 'signatory',
          }}
          onUpdated={(updates) => {
            setSession((prev: any) => {
              if (!prev) return prev;
              const next = { ...prev, ...updates };
              localStorage.setItem('sti_sync_signatory_session', JSON.stringify(next));
              return next;
            });
          }}
        />
      )}
    </div>
  );
}
