import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../../services/firebase';

export interface OfficerRole {
  id: string; // Document ID
  organizationId: string;
  roleId: string;
  isActive: boolean;
}

export interface OfficerProfile {
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

export function useOfficerProfile() {
  const [profile, setProfile] = useState<OfficerProfile | null>(null);
  const [roles, setRoles] = useState<OfficerRole[]>([]);
  const [activeOrgStatus, setActiveOrgStatus] = useState<string>('active');
  const [activeOrgName, setActiveOrgName] = useState<string>('Organization');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cached: any;
    try { cached = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return; }
    if (!cached?.email) return;
    const states = new Map<string, { found: boolean; pending: boolean }>();
    const names = ['organization_advisers', 'institutional_signatories', 'students', 'organization_officers'];
    const unsubscribes = names.map((name) => onSnapshot(query(collection(db, name), where('email', '==', cached.email.trim().toLowerCase())), (snap) => {
      states.set(name, { found: !snap.empty, pending: snap.docs.some((item) => {
        const value = item.data();
        return Boolean(value.tempPass || value.requiresPasswordChange || value.requiresChangePassword || value.resetInProgress);
      }) });
      if (states.size !== names.length || ![...states.values()].some((value) => value.found)) return;
      const pending = [...states.values()].some((value) => value.pending);
      setProfile((previous) => previous ? { ...previous, requiresPasswordChange: pending } : previous);
    }, () => { /* Preserve the existing mandatory notice if a read fails. */ }));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);

  useEffect(() => {
    const rawSession = localStorage.getItem(SESSION_KEY);
    if (!rawSession) {
      setProfile(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    let parsedSession: any;
    try {
      parsedSession = JSON.parse(rawSession);
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
      setProfile(null);
      setLoading(false);
      return;
    }

    const { studentId, studentName, email, activeOrganizationId, activeRoleId, isAdviser, isSignatory, requiresPasswordChange, signatureUrl } = parsedSession;
    setProfile({
      studentId: studentId || '',
      studentName: studentName || '',
      email: email || '',
      activeOrganizationId: activeOrganizationId || null,
      activeRoleId: activeRoleId || null,
      isAdviser: isAdviser ?? false,
      isSignatory: isSignatory ?? false,
      requiresPasswordChange: requiresPasswordChange ?? false,
      signatureUrl: signatureUrl || null,
    });

    // Guard against missing/undefined studentId (e.g. signatory session in officer path)
    if (!studentId || typeof studentId !== 'string') {
      setRoles([]);
      setLoading(false);
      return;
    }

    // Listen for their roles to ensure they are still active and to get their list of orgs
    const q = query(
      collection(db, 'organization_officers'),
      where('studentId', '==', studentId),
      where('isActive', '==', true)
    );

    const unsubscribeRoles = onSnapshot(q, (snapshot) => {
      const activeRoles = snapshot.docs.map(doc => ({
        id: doc.id,
        organizationId: doc.data().organizationId,
        roleId: doc.data().roleId,
        isActive: doc.data().isActive
      }));
      
      setRoles(activeRoles);
      
      // Auto-select if there is exactly 1 role and none is currently selected
      if (activeRoles.length === 1 && !activeOrganizationId) {
        setProfile(prev => {
          if (!prev) return prev;
          const newProfile = { ...prev, activeOrganizationId: activeRoles[0].organizationId, activeRoleId: activeRoles[0].roleId };
          localStorage.setItem(SESSION_KEY, JSON.stringify(newProfile));
          return newProfile;
        });
      }
      
      setLoading(false);
    });

    return () => unsubscribeRoles();
  }, []);

  // Listen to active organization status in real-time
  useEffect(() => {
    const activeOrgId = profile?.activeOrganizationId;
    if (!activeOrgId) {
      setActiveOrgStatus('active');
      return;
    }

    const unsubOrg = onSnapshot(
      doc(db, 'organizations', activeOrgId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setActiveOrgStatus(data.status || 'active');
          setActiveOrgName(data.name || 'Organization');
        } else {
          setActiveOrgStatus('archived');
        }
      },
      (err) => {
        console.warn('[useOfficerProfile] Error streaming org status:', err);
      }
    );

    return () => unsubOrg();
  }, [profile?.activeOrganizationId]);

  const switchOrganization = (organizationId: string, roleId: string) => {
    if (!profile) return;
    const newProfile = { ...profile, activeOrganizationId: organizationId, activeRoleId: roleId };
    setProfile(newProfile);
    localStorage.setItem(SESSION_KEY, JSON.stringify(newProfile));
  };

  const markPasswordChanged = () => {
    if (!profile) return;
    const newProfile = { ...profile, requiresPasswordChange: false };
    setProfile(newProfile);
    localStorage.setItem(SESSION_KEY, JSON.stringify(newProfile));
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('sti_dismissed_pwd_reminder');
    setProfile(null);
    setRoles([]);
  };

  return { profile, roles, activeOrgStatus, activeOrgName, loading, switchOrganization, markPasswordChanged, logout };
}

