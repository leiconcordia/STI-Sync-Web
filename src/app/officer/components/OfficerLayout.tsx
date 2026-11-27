import { useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation, Navigate, useNavigate } from 'react-router';
import { ShieldAlert, LogOut, Mail, Lock, KeyRound, ArrowRight, UserCog, Power, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { OfficerSidebar } from './OfficerSidebar';
import { OfficerTopNav } from './OfficerTopNav';
import { useOfficerProfile } from '../../auth/hooks/useOfficerProfile';
import { useNotificationStream } from '../../modules/notifications';
import { FirstTimePasswordReminderModal } from './FirstTimePasswordReminderModal';
import { RequiredPasswordChange } from './RequiredPasswordChange';
import { RequiredAdviserSignatureSetup } from './RequiredAdviserSignatureSetup';
import { resolveUserSignature } from '../../modules/signatories';
import { setOrganizationAdviserPortalStatus } from '../../modules/organizations/services/organization.service';

const pageTitles: Record<string, string> = {
  '/officer/dashboard': 'Dashboard',
  '/officer/events': 'Activities',
  '/officer/attendance': 'Attendance Logs',
  '/officer/certificates': 'Certificates',
  '/officer/finance': 'Finance Center',
  '/officer/liquidation': 'Financial Liquidation',
  '/officer/post-activity-reports': 'Post-Activity Reports',
  '/officer/documents': 'Documents',
  '/officer/members': 'Member Directory',
  '/officer/reports': 'Reports & Analytics',
  '/officer/organization': 'Organization Profile',
  '/officer/announcements': 'Announcements',
  '/officer/settings': 'Settings',
};

export function OfficerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    profile,
    activeOrgStatus,
    activeOrgName,
    adviserAuthority,
    loading,
    markSignatureRegistered,
    logout,
  } = useOfficerProfile();
  const title = pageTitles[location.pathname] || 'Officer Portal';

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [sigCheckedKey, setSigCheckedKey] = useState<string | null>(null);
  const [resolvedAdviserSigUrl, setResolvedAdviserSigUrl] = useState<string>('');
  const [isReactivatingAdviser, setIsReactivatingAdviser] = useState(false);

  const handleReactivateAdviserPortal = async () => {
    if (!profile?.activeOrganizationId) return;
    setIsReactivatingAdviser(true);
    try {
      const res = await setOrganizationAdviserPortalStatus(
        profile.activeOrganizationId,
        { inactive: false },
        profile.studentName || profile.email || 'Club Adviser'
      );
      if (!res.success) {
        toast.error(res.error || 'Could not reactivate Adviser Portal.');
        return;
      }
      toast.success('Adviser Portal reactivated! Primary approval authority restored.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reactivate Adviser Portal.');
    } finally {
      setIsReactivatingAdviser(false);
    }
  };

  const adviserSigKey = profile?.isAdviser
    ? `${profile.authUid || profile.uid || ''}|${(profile.email || '').toLowerCase()}`
    : '';

  // Verify whether a logged-in Primary Adviser or Co-Adviser already has a registered e-signature
  useEffect(() => {
    if (!profile?.isAdviser || profile.requiresPasswordChange) {
      return;
    }
    if (profile.signatureUrl) {
      setResolvedAdviserSigUrl(profile.signatureUrl);
      setSigCheckedKey(adviserSigKey);
      return;
    }
    let cancelled = false;
    resolveUserSignature({
      uid: profile.authUid || profile.uid,
      email: profile.email,
      name: profile.studentName,
      role: 'adviser',
      profile,
    })
      .then((sig) => {
        if (cancelled) return;
        if (sig) {
          setResolvedAdviserSigUrl(sig);
          markSignatureRegistered(sig);
        } else {
          setResolvedAdviserSigUrl('');
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedAdviserSigUrl('');
      })
      .finally(() => {
        if (!cancelled) setSigCheckedKey(adviserSigKey);
      });
    return () => {
      cancelled = true;
    };
  }, [
    adviserSigKey,
    profile?.isAdviser,
    profile?.requiresPasswordChange,
    profile?.signatureUrl,
    profile?.authUid,
    profile?.uid,
    profile?.email,
    profile?.studentName,
  ]);

  const notificationUserId = useMemo(
    () =>
      [
        profile?.studentId,
        profile?.uid,
        profile?.email,
        profile?.isAdviser && profile?.activeOrganizationId
          ? `adviser:${profile.activeOrganizationId}`
          : null,
        profile?.isAdviser ? 'adviser' : null,
      ]
        .filter(Boolean)
        .join('|') || undefined,
    [profile?.studentId, profile?.uid, profile?.email, profile?.isAdviser, profile?.activeOrganizationId]
  );

  const { notifications } = useNotificationStream(
    'officer',
    profile?.activeOrganizationId || undefined,
    notificationUserId
  );

  useEffect(() => {
    if (!profile || profile.requiresPasswordChange) return;
    const unreadAssignment = notifications.find(
      (n) => !n.isRead && n.type === 'role_assigned'
    );
    if (!unreadAssignment) return;

    const seenKey = `sti_sync_seen_assign_toast_${unreadAssignment.id}`;
    if (sessionStorage.getItem(seenKey)) return;
    sessionStorage.setItem(seenKey, 'true');

    toast.success(unreadAssignment.title, {
      description: unreadAssignment.message,
      duration: 8000,
    });
  }, [notifications, profile]);

  useEffect(() => {
    if (profile?.requiresPasswordChange) {
      const dismissed = sessionStorage.getItem('sti_dismissed_pwd_reminder');
      if (!dismissed) {
        setShowReminderModal(true);
      }
    }
  }, [profile?.requiresPasswordChange]);

  const handleDismissReminder = () => {
    sessionStorage.setItem('sti_dismissed_pwd_reminder', 'true');
    setShowReminderModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
        <div className="w-8 h-8 border-4 border-[#0E4EBD] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/officer/login" replace />;
  }

  // If active user is purely a signatory without an active officer role, redirect to signatory portal
  if (profile.isSignatory && !profile.activeOrganizationId) {
    return <Navigate to="/signatory/endorsements" replace />;
  }

  if (profile.requiresPasswordChange) {
    return <RequiredPasswordChange profile={profile} orgName={activeOrgName} />;
  }

  // Mandatory electronic signature registration for newly assigned Primary Advisers & Co-Advisers
  if (profile.isAdviser) {
    const hasRegisteredAdviserSignature = Boolean(
      profile.signatureUrl || resolvedAdviserSigUrl
    );
    if (!hasRegisteredAdviserSignature && sigCheckedKey !== adviserSigKey) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
          <div className="w-8 h-8 border-4 border-[#0E4EBD] border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (!hasRegisteredAdviserSignature) {
      return (
        <RequiredAdviserSignatureSetup
          profile={profile}
          orgName={activeOrgName}
          onComplete={(sigUrl) => {
            setResolvedAdviserSigUrl(sigUrl);
            setSigCheckedKey(adviserSigKey);
            markSignatureRegistered(sigUrl);
          }}
        />
      );
    }
  }

  // Intercept layout if organization status is suspended, inactive, or archived
  const isSuspendedOrInactive = ['suspended', 'inactive', 'archived'].includes(activeOrgStatus);
  if (isSuspendedOrInactive) {
    return (
      <div className="min-h-screen bg-[#001A4D] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl text-center space-y-6 border border-amber-200 relative overflow-hidden">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl mx-auto flex items-center justify-center text-amber-600 shadow-inner">
            <ShieldAlert className="w-10 h-10" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
              <Lock className="w-3.5 h-3.5" /> Account Restricted
            </div>
            <h2 className="text-2xl font-extrabold text-[#001A4D]">Organization {activeOrgStatus === 'suspended' ? 'Suspended' : 'Inactive'}</h2>
            <p className="text-sm font-semibold text-gray-700 mt-1">{activeOrgName}</p>
          </div>

          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-950 leading-relaxed text-left space-y-2">
            <p className="font-bold text-amber-900 flex items-center gap-1.5">
              ⚠️ SAO Administrative Restriction
            </p>
            <p>
              The SAO Administration has set <strong>{activeOrgName}</strong> to <strong>{activeOrgStatus}</strong> status.
            </p>
            <p>
              While in this state, officers are restricted from hosting events, launching attendance scanning, submitting proposals, or accessing portal resources.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <button
              onClick={() => logout()}
              className="w-full py-3 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Log Out of Officer Account
            </button>
            <p className="text-[11px] text-gray-400">
              Need assistance? Contact SAO Adviser / Student Affairs Office.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex">
      <OfficerSidebar />
      <div className="ml-[240px] flex-1 flex flex-col min-w-0 min-h-screen">
        <OfficerTopNav title={title} />
        <main className="p-6 flex-1">
          {/* Club Adviser Portal Availability & Substitute Delegation Banner */}
          {profile.isAdviser && adviserAuthority.isPrimaryAdviser && adviserAuthority.isPrimaryUnavailable && (
            <div className="mb-6 px-4 py-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-200/70 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
                  <Power className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Adviser Portal Inactive (On Leave)
                  </p>
                  <p className="text-xs text-amber-950/90 mt-0.5">
                    {adviserAuthority.approvalBlockedReason}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isReactivatingAdviser}
                onClick={handleReactivateAdviserPortal}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-xs disabled:opacity-60 transition-colors cursor-pointer shrink-0"
              >
                {isReactivatingAdviser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                <span>Reactivate My Adviser Portal</span>
              </button>
            </div>
          )}

          {profile.isAdviser && adviserAuthority.isCoAdviser && (
            <div
              className={`mb-6 px-4 py-3 rounded-2xl border shadow-xs flex flex-wrap items-center justify-between gap-3 ${
                adviserAuthority.canReviewOfficerSubmissions
                  ? 'bg-indigo-950 border-indigo-800 text-white'
                  : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    adviserAuthority.canReviewOfficerSubmissions
                      ? 'bg-[#FFD41C]/20 border border-[#FFD41C]/40 text-[#FFD41C]'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {adviserAuthority.canReviewOfficerSubmissions ? (
                    <UserCog className="w-4.5 h-4.5" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <p
                    className={`text-[11px] font-black uppercase tracking-wider ${
                      adviserAuthority.canReviewOfficerSubmissions ? 'text-[#FFD41C]' : 'text-slate-600'
                    }`}
                  >
                    {adviserAuthority.canReviewOfficerSubmissions
                      ? 'Acting Club Adviser Mode • Approval Authority Transferred'
                      : 'Standby Mode • Primary Adviser Active (Approvals Locked)'}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      adviserAuthority.canReviewOfficerSubmissions ? 'text-indigo-100' : 'text-slate-600'
                    }`}
                  >
                    {adviserAuthority.statusBannerText}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Subtle Security Reminder Banner if temporary password is in use */}
          {profile.requiresPasswordChange && location.pathname !== '/officer/settings' && (
            <div className="mb-6 px-4 py-3 bg-white border-l-4 border-[#FFC107] border-y border-r border-gray-200/80 rounded-r-2xl shadow-xs flex items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                  <KeyRound className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#001A4D]">Temporary Password In Use</p>
                  <p className="text-[11px] text-gray-500">Protect your account by creating your personal password in Settings.</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/officer/settings?tab=security')}
                className="px-3.5 py-1.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-[#FFD41C] text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
              >
                <span>Change Password</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <Outlet />
        </main>
      </div>

      {/* Exitable First-Time Login Password Reminder Modal */}
      <FirstTimePasswordReminderModal
        isOpen={showReminderModal}
        onClose={handleDismissReminder}
        isAdviser={profile.isAdviser}
      />
    </div>
  );
}

