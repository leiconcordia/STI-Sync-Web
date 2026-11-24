import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc } from 'firebase/firestore';
import { db, auth } from '../../../services/firebase';
import { signOut } from 'firebase/auth';
import { clearPortalSessions } from '../services/portal-workspace.service';
import { registerSingletonResetter } from '../../utils/createSingletonStream';
import type {
  OrgAdviserAvailability,
  OrgAdviserData,
  OrgAdviserRole,
} from '../../modules/organizations/types/organization.types';
import {
  resolveEffectiveAdviserAuthority,
  type EffectiveAdviserAuthority,
} from '../../modules/organizations/utils/adviser-authority.utils';

export interface OfficerRole {
  id: string; // Document ID
  organizationId: string;
  roleId: string;
  adviserRole?: OrgAdviserRole;
  isActive: boolean;
}

export interface OfficerProfile {
  uid?: string;
  authUid?: string;
  role?: string;
  adviserRole?: OrgAdviserRole;
  isCoAdviser?: boolean;
  studentId: string;
  studentName: string;
  email: string;
  activeOrganizationId: string | null;
  activeRoleId: string | null;
  isAdviser?: boolean;
  isSignatory?: boolean;
  requiresPasswordChange?: boolean;
  signatureUrl?: string | null;
}

const SESSION_KEY = 'sti_sync_officer_session';

// Shared singleton state for useOfficerProfile so OfficerLayout, OfficerSidebar,
// OfficerTopNav, and active pages share 1 set of listeners instead of opening 4x-6x copies.
interface OfficerProfileStoreState {
  profile: OfficerProfile | null;
  roles: OfficerRole[];
  activeOrgStatus: string;
  activeOrgName: string;
  activeOrgAdviser: OrgAdviserData | null;
  activeOrgCoAdviser: OrgAdviserData | null;
  activeOrgAdviserAvailability: OrgAdviserAvailability | null;
  loading: boolean;
}

let storeState: OfficerProfileStoreState = {
  profile: null,
  roles: [],
  activeOrgStatus: 'active',
  activeOrgName: 'Organization',
  activeOrgAdviser: null,
  activeOrgCoAdviser: null,
  activeOrgAdviserAvailability: null,
  loading: true,
};

let storeSubscribers = 0;
let tearDownTimer: ReturnType<typeof setTimeout> | null = null;
let activeSessionSignature: string | null = null;
let activeRolesUnsub: (() => void) | null = null;
let activeOrgDocUnsub: (() => void) | null = null;
let activeOrgDocId: string | null = null;
let pwdCheckEmail: string | null = null;
const storeListeners = new Set<(state: OfficerProfileStoreState) => void>();

function notifyStore() {
  const snapshot = { ...storeState };
  storeListeners.forEach((l) => l(snapshot));
}

function setStoreState(updater: (prev: OfficerProfileStoreState) => OfficerProfileStoreState) {
  storeState = updater(storeState);
  notifyStore();
}

function stopOrgDocListener() {
  if (activeOrgDocUnsub) {
    activeOrgDocUnsub();
    activeOrgDocUnsub = null;
  }
  activeOrgDocId = null;
}

function ensureOrgDocListener(activeOrgId: string | null | undefined) {
  const targetId = activeOrgId || null;
  if (targetId === activeOrgDocId) return;

  stopOrgDocListener();

  if (!targetId) {
    setStoreState((prev) => ({
      ...prev,
      activeOrgStatus: 'active',
      activeOrgAdviser: null,
      activeOrgCoAdviser: null,
      activeOrgAdviserAvailability: null,
    }));
    return;
  }

  activeOrgDocId = targetId;
  activeOrgDocUnsub = onSnapshot(
    doc(db, 'organizations', targetId),
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStoreState((prev) => ({
          ...prev,
          activeOrgStatus: data.status || 'active',
          activeOrgName: data.name || 'Organization',
          activeOrgAdviser: data.adviser || null,
          activeOrgCoAdviser: data.coAdviser || null,
          activeOrgAdviserAvailability: data.adviserAvailability || null,
        }));
      } else {
        setStoreState((prev) => ({
          ...prev,
          activeOrgStatus: 'archived',
          activeOrgAdviser: null,
          activeOrgCoAdviser: null,
          activeOrgAdviserAvailability: null,
        }));
      }
    },
    (err) => {
      console.warn('[useOfficerProfile] Error streaming org status:', err);
    }
  );
}

async function runSingleShotPasswordChangeCheck(cleanEmail: string) {
  if (!cleanEmail || pwdCheckEmail === cleanEmail) return;
  pwdCheckEmail = cleanEmail;

  const names = ['organization_advisers', 'institutional_signatories', 'students', 'organization_officers'];
  try {
    const snaps = await Promise.all(
      names.map((name) =>
        getDocs(query(collection(db, name), where('email', '==', cleanEmail))).catch(() => null)
      )
    );
    if (pwdCheckEmail !== cleanEmail) return;

    const anyFound = snaps.some((s) => s && !s.empty);
    if (!anyFound) return;

    const pending = snaps.some(
      (snap) =>
        snap &&
        snap.docs.some((item) => {
          const value = item.data();
          return Boolean(
            value.tempPass ||
              value.requiresPasswordChange ||
              value.requiresChangePassword ||
              value.resetInProgress
          );
        })
    );
    setStoreState((prev) =>
      prev.profile
        ? { ...prev, profile: { ...prev.profile, requiresPasswordChange: pending } }
        : prev
    );
  } catch {
    // Preserve existing notice if check fails
  }
}

function stopOfficerStore() {
  if (tearDownTimer) {
    clearTimeout(tearDownTimer);
    tearDownTimer = null;
  }
  if (activeRolesUnsub) {
    activeRolesUnsub();
    activeRolesUnsub = null;
  }
  stopOrgDocListener();
  activeSessionSignature = null;
  pwdCheckEmail = null;
}

registerSingletonResetter(() => {
  stopOfficerStore();
  storeState = {
    profile: null,
    roles: [],
    activeOrgStatus: 'active',
    activeOrgName: 'Organization',
    loading: false,
  };
  notifyStore();
});

function startOrSyncOfficerStore() {
  if (tearDownTimer) {
    clearTimeout(tearDownTimer);
    tearDownTimer = null;
  }

  const rawSession = localStorage.getItem(SESSION_KEY);
  if (!rawSession) {
    stopOfficerStore();
    storeState = {
      profile: null,
      roles: [],
      activeOrgStatus: 'active',
      activeOrgName: 'Organization',
      activeOrgAdviser: null,
      activeOrgCoAdviser: null,
      activeOrgAdviserAvailability: null,
      loading: false,
    };
    notifyStore();
    return;
  }

  if (activeSessionSignature === rawSession && (activeRolesUnsub || !storeState.loading)) {
    ensureOrgDocListener(storeState.profile?.activeOrganizationId);
    return;
  }

  let parsedSession: any;
  try {
    parsedSession = JSON.parse(rawSession);
  } catch {
    localStorage.removeItem(SESSION_KEY);
    stopOfficerStore();
    storeState = {
      profile: null,
      roles: [],
      activeOrgStatus: 'active',
      activeOrgName: 'Organization',
      activeOrgAdviser: null,
      activeOrgCoAdviser: null,
      activeOrgAdviserAvailability: null,
      loading: false,
    };
    notifyStore();
    return;
  }

  if (activeRolesUnsub) {
    activeRolesUnsub();
    activeRolesUnsub = null;
  }

  activeSessionSignature = rawSession;
  const {
    uid,
    authUid,
    role,
    adviserRole,
    isCoAdviser,
    studentId,
    studentName,
    email,
    activeOrganizationId,
    activeRoleId,
    isAdviser,
    isSignatory,
    requiresPasswordChange,
    signatureUrl,
  } = parsedSession;

  const computedIsAdviser = Boolean(
    isAdviser ||
      isCoAdviser ||
      activeRoleId?.toLowerCase() === 'adviser' ||
      role?.toLowerCase() === 'adviser'
  );
  const computedAdviserRole: OrgAdviserRole | undefined = computedIsAdviser
    ? (adviserRole === 'co_adviser' || isCoAdviser ? 'co_adviser' : 'primary')
    : undefined;

  const initialProfile: OfficerProfile = {
    uid: uid || authUid || auth.currentUser?.uid || '',
    authUid: authUid || uid || auth.currentUser?.uid || '',
    role: computedIsAdviser ? 'adviser' : (role || 'officer'),
    adviserRole: computedAdviserRole,
    isCoAdviser: computedAdviserRole === 'co_adviser',
    studentId: studentId || '',
    studentName: studentName || '',
    email: email || '',
    activeOrganizationId: activeOrganizationId || null,
    activeRoleId: activeRoleId || (computedIsAdviser ? 'adviser' : null),
    isAdviser: computedIsAdviser,
    isSignatory: isSignatory ?? false,
    requiresPasswordChange: requiresPasswordChange ?? false,
    signatureUrl: signatureUrl || null,
  };

  setStoreState((prev) => ({
    ...prev,
    profile: initialProfile,
    loading: true,
  }));

  ensureOrgDocListener(initialProfile.activeOrganizationId);

  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanEmail) {
    void runSingleShotPasswordChangeCheck(cleanEmail);
  }

  if (computedIsAdviser) {
    // Subscribe to organization_advisers so BOTH Primary Adviser and Secondary Co-Adviser resolve cleanly
    const qAdviserRecords = query(
      collection(db, 'organization_advisers'),
      where('email', '==', cleanEmail)
    );

    activeRolesUnsub = onSnapshot(
      qAdviserRecords,
      (snapshot) => {
        const activeDocs = snapshot.docs.filter((d) => d.data()?.isActive !== false);
        const adviserRoles: OfficerRole[] = activeDocs.map((d) => {
          const rec = d.data();
          return {
            id: d.id,
            organizationId: rec.organizationId,
            roleId: 'adviser',
            adviserRole: rec.adviserRole === 'co_adviser' ? 'co_adviser' : 'primary',
            isActive: true,
          };
        });
        const liveSignatureUrl =
          activeDocs
            .map((d) => d.data()?.signatureUrl || d.data()?.signatureDataUrl || '')
            .find((val) => Boolean(String(val || '').trim())) || null;

        setStoreState((prev) => {
          let nextProfile = prev.profile;
          if (adviserRoles.length > 0 && nextProfile) {
            const matchedRole =
              adviserRoles.find((r) => r.organizationId === nextProfile!.activeOrganizationId) ||
              adviserRoles[0];
            const resolvedSig = liveSignatureUrl || nextProfile.signatureUrl || null;
            const needsOrgOrRoleUpdate =
              !nextProfile.activeOrganizationId ||
              nextProfile.adviserRole !== matchedRole.adviserRole ||
              (resolvedSig && nextProfile.signatureUrl !== resolvedSig);
            if (needsOrgOrRoleUpdate) {
              nextProfile = {
                ...nextProfile,
                activeOrganizationId: nextProfile.activeOrganizationId || matchedRole.organizationId,
                activeRoleId: 'adviser',
                isAdviser: true,
                role: 'adviser',
                adviserRole: matchedRole.adviserRole,
                isCoAdviser: matchedRole.adviserRole === 'co_adviser',
                signatureUrl: resolvedSig,
              };
              const serialized = JSON.stringify(nextProfile);
              activeSessionSignature = serialized;
              localStorage.setItem(SESSION_KEY, serialized);
              ensureOrgDocListener(nextProfile.activeOrganizationId);
            }
          }
          return {
            ...prev,
            roles: adviserRoles,
            profile: nextProfile,
            loading: false,
          };
        });
      },
      (err) => {
        console.warn('[useOfficerProfile] Adviser orgs stream notice:', err);
        setStoreState((prev) => ({ ...prev, loading: false }));
      }
    );
    return;
  }

  if (cleanEmail) {
    Promise.all([
      getDocs(query(collection(db, 'organizations'), where('adviser.email', '==', cleanEmail))),
      getDocs(query(collection(db, 'organizations'), where('coAdviser.email', '==', cleanEmail))),
    ])
      .then(([primarySnap, coSnap]) => {
        const isPrimaryMatch = !primarySnap.empty;
        const isCoMatch = !coSnap.empty;
        if (isPrimaryMatch || isCoMatch) {
          const advOrgId = isPrimaryMatch ? primarySnap.docs[0].id : coSnap.docs[0].id;
          const resolvedAdvRole: OrgAdviserRole = isPrimaryMatch ? 'primary' : 'co_adviser';
          setStoreState((prev) => {
            if (!prev.profile || prev.profile.isAdviser) return prev;
            const updated: OfficerProfile = {
              ...prev.profile,
              isAdviser: true,
              role: 'adviser',
              adviserRole: resolvedAdvRole,
              isCoAdviser: resolvedAdvRole === 'co_adviser',
              activeRoleId: 'adviser',
              activeOrganizationId: prev.profile.activeOrganizationId || advOrgId,
            };
            try {
              const serialized = JSON.stringify(updated);
              activeSessionSignature = serialized;
              localStorage.setItem(SESSION_KEY, serialized);
            } catch {}
            ensureOrgDocListener(updated.activeOrganizationId);
            return { ...prev, profile: updated };
          });
        }
      })
      .catch(() => {});
  }

  if (!studentId || typeof studentId !== 'string') {
    setStoreState((prev) => ({ ...prev, roles: [], loading: false }));
    return;
  }

  const qRoles = query(
    collection(db, 'organization_officers'),
    where('studentId', '==', studentId),
    where('isActive', '==', true)
  );

  activeRolesUnsub = onSnapshot(
    qRoles,
    (snapshot) => {
      const activeRoles = snapshot.docs.map((d) => ({
        id: d.id,
        organizationId: d.data().organizationId,
        roleId: d.data().roleId,
        isActive: d.data().isActive,
      }));

      setStoreState((prev) => {
        let nextProfile = prev.profile;
        if (activeRoles.length === 1 && nextProfile && !nextProfile.activeOrganizationId) {
          nextProfile = {
            ...nextProfile,
            activeOrganizationId: activeRoles[0].organizationId,
            activeRoleId: activeRoles[0].roleId,
          };
          const serialized = JSON.stringify(nextProfile);
          activeSessionSignature = serialized;
          localStorage.setItem(SESSION_KEY, serialized);
          ensureOrgDocListener(nextProfile.activeOrganizationId);
        }
        return {
          ...prev,
          roles: activeRoles,
          profile: nextProfile,
          loading: false,
        };
      });
    },
    (err) => {
      console.warn('[useOfficerProfile] Officer roles stream notice:', err);
      setStoreState((prev) => ({ ...prev, loading: false }));
    }
  );
}

function hasStoredOfficerSession(): boolean {
  try {
    return Boolean(localStorage.getItem(SESSION_KEY));
  } catch {
    return false;
  }
}

export function useOfficerProfile() {
  const [state, setState] = useState<OfficerProfileStoreState>(() => {
    // Synchronously treat an un-hydrated stored session as loading on first render so
    // OfficerLayout does not bounce a newly signed-in user back to /portal/login
    // before useEffect runs startOrSyncOfficerStore().
    if (!storeState.profile && hasStoredOfficerSession()) {
      return { ...storeState, loading: true };
    }
    return storeState;
  });

  useEffect(() => {
    storeSubscribers++;
    storeListeners.add(setState);
    startOrSyncOfficerStore();
    setState({ ...storeState });

    return () => {
      storeListeners.delete(setState);
      storeSubscribers = Math.max(0, storeSubscribers - 1);
      if (storeSubscribers === 0) {
        if (tearDownTimer) clearTimeout(tearDownTimer);
        tearDownTimer = setTimeout(() => {
          if (storeSubscribers === 0) {
            stopOfficerStore();
          }
          tearDownTimer = null;
        }, 30_000);
      }
    };
  }, []);

  const switchOrganization = (organizationId: string, roleId: string) => {
    if (!storeState.profile) return;
    const isAdv = storeState.profile.isAdviser || roleId?.toLowerCase() === 'adviser';
    const newProfile: OfficerProfile = {
      ...storeState.profile,
      activeOrganizationId: organizationId,
      activeRoleId: isAdv ? 'adviser' : roleId,
      role: isAdv ? 'adviser' : (storeState.profile.role || 'officer'),
      isAdviser: isAdv,
    };
    const serialized = JSON.stringify(newProfile);
    activeSessionSignature = serialized;
    localStorage.setItem(SESSION_KEY, serialized);
    ensureOrgDocListener(organizationId);
    setStoreState((prev) => ({ ...prev, profile: newProfile }));
  };

  const markPasswordChanged = () => {
    if (!storeState.profile) return;
    const newProfile = { ...storeState.profile, requiresPasswordChange: false };
    const serialized = JSON.stringify(newProfile);
    activeSessionSignature = serialized;
    localStorage.setItem(SESSION_KEY, serialized);
    setStoreState((prev) => ({ ...prev, profile: newProfile }));
  };

  const markSignatureRegistered = (signatureUrl: string) => {
    if (!storeState.profile || !signatureUrl) return;
    const newProfile = { ...storeState.profile, signatureUrl };
    const serialized = JSON.stringify(newProfile);
    activeSessionSignature = serialized;
    localStorage.setItem(SESSION_KEY, serialized);
    setStoreState((prev) => ({ ...prev, profile: newProfile }));
  };

  const logout = () => {
    clearPortalSessions();
    void signOut(auth);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('sti_dismissed_pwd_reminder');
    stopOfficerStore();
    storeState = {
      profile: null,
      roles: [],
      activeOrgStatus: 'active',
      activeOrgName: 'Organization',
      activeOrgAdviser: null,
      activeOrgCoAdviser: null,
      activeOrgAdviserAvailability: null,
      loading: false,
    };
    notifyStore();
  };

  const pendingSessionSync = !state.profile && hasStoredOfficerSession();

  const adviserAuthority: EffectiveAdviserAuthority = resolveEffectiveAdviserAuthority({
    organization: {
      adviser: state.activeOrgAdviser,
      coAdviser: state.activeOrgCoAdviser,
      adviserAvailability: state.activeOrgAdviserAvailability,
    },
    viewerUid: state.profile?.authUid || state.profile?.uid,
    viewerEmail: state.profile?.email,
    viewerAdviserRole: state.profile?.adviserRole,
    isAdviserSession: Boolean(state.profile?.isAdviser),
  });

  return {
    profile: state.profile,
    roles: state.roles,
    activeOrgStatus: state.activeOrgStatus,
    activeOrgName: state.activeOrgName,
    activeOrgAdviser: state.activeOrgAdviser,
    activeOrgCoAdviser: state.activeOrgCoAdviser,
    activeOrgAdviserAvailability: state.activeOrgAdviserAvailability,
    adviserAuthority,
    loading: state.loading || pendingSessionSync,
    switchOrganization,
    markPasswordChanged,
    markSignatureRegistered,
    logout,
  };
}
