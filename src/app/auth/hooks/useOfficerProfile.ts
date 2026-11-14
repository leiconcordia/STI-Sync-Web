import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc } from 'firebase/firestore';
import { db, auth } from '../../../services/firebase';
import { signOut } from 'firebase/auth';
import { clearPortalSessions } from '../services/portal-workspace.service';
import { registerSingletonResetter } from '../../utils/createSingletonStream';

export interface OfficerRole {
  id: string; // Document ID
  organizationId: string;
  roleId: string;
  isActive: boolean;
}

export interface OfficerProfile {
  uid?: string;
  authUid?: string;
  role?: string;
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
  loading: boolean;
}

let storeState: OfficerProfileStoreState = {
  profile: null,
  roles: [],
  activeOrgStatus: 'active',
  activeOrgName: 'Organization',
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
    setStoreState((prev) => ({ ...prev, activeOrgStatus: 'active' }));
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
        }));
      } else {
        setStoreState((prev) => ({ ...prev, activeOrgStatus: 'archived' }));
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
      activeRoleId?.toLowerCase() === 'adviser' ||
      role?.toLowerCase() === 'adviser'
  );

  const initialProfile: OfficerProfile = {
    uid: uid || authUid || auth.currentUser?.uid || '',
    authUid: authUid || uid || auth.currentUser?.uid || '',
    role: computedIsAdviser ? 'adviser' : (role || 'officer'),
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
    const qAdviserOrgs = query(
      collection(db, 'organizations'),
      where('adviser.email', '==', cleanEmail)
    );

    activeRolesUnsub = onSnapshot(
      qAdviserOrgs,
      (snapshot) => {
        const adviserRoles = snapshot.docs.map((d) => ({
          id: d.id,
          organizationId: d.id,
          roleId: 'adviser',
          isActive: true,
        }));

        setStoreState((prev) => {
          let nextProfile = prev.profile;
          if (adviserRoles.length > 0 && nextProfile && !nextProfile.activeOrganizationId) {
            nextProfile = {
              ...nextProfile,
              activeOrganizationId: adviserRoles[0].organizationId,
              activeRoleId: 'adviser',
              isAdviser: true,
              role: 'adviser',
            };
            const serialized = JSON.stringify(nextProfile);
            activeSessionSignature = serialized;
            localStorage.setItem(SESSION_KEY, serialized);
            ensureOrgDocListener(nextProfile.activeOrganizationId);
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
    const qAdviserCheck = query(
      collection(db, 'organizations'),
      where('adviser.email', '==', cleanEmail)
    );
    getDocs(qAdviserCheck)
      .then((snap) => {
        if (!snap.empty) {
          const advOrgId = snap.docs[0].id;
          setStoreState((prev) => {
            if (!prev.profile || prev.profile.isAdviser) return prev;
            const updated: OfficerProfile = {
              ...prev.profile,
              isAdviser: true,
              role: 'adviser',
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

  activeRolesUnsub = onSnapshot(qRoles, (snapshot) => {
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
  });
}

export function useOfficerProfile() {
  const [state, setState] = useState<OfficerProfileStoreState>(() => storeState);

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
      loading: false,
    };
    notifyStore();
  };

  return {
    profile: state.profile,
    roles: state.roles,
    activeOrgStatus: state.activeOrgStatus,
    activeOrgName: state.activeOrgName,
    loading: state.loading,
    switchOrganization,
    markPasswordChanged,
    logout,
  };
}
