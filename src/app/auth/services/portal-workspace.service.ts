import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../../services/firebase';
import { resetAllSingletonStreams } from '../../utils/createSingletonStream';
import { formatPersonName, structuredNameFields } from '../../utils/name.utils';
import { getSignatoryAuthorizedWorkflows } from '../../modules/signatories/types/signatory.types';

export const PORTAL_WORKSPACES_KEY = 'sti_sync_portal_workspaces';
const OFFICER_KEY = 'sti_sync_officer_session';
const SIGNATORY_KEY = 'sti_sync_signatory_session';
export interface PortalWorkspace { id: string; label: string; organizationName?: string; subtitle?: string; path: string; session: any; kind: 'signatory' | 'adviser' | 'officer' }
const normalize = (value: any) => String(value || '').trim().toLowerCase();
const active = (value: any) => value.isActive !== false && !value.isDeleted && !value.archived && !['inactive', 'revoked', 'archived', 'suspended'].includes(normalize(value.status));
const SAS_ONLY_SIGNATORY_ROLES = new Set(['sas_coordinator', 'sas_head', 'sao_head', 'sas_admin', 'sao_admin']);
const isSasSignatoryRecord = (record: any) =>
  record?.id === 'sas_coordinator' || SAS_ONLY_SIGNATORY_ROLES.has(normalize(record?.role));

export function buildPortalWorkspaces(data: { signatories: any[]; advisers: any[]; officers: any[]; students: any[]; organizations: any[] }, identity: { uid: string; email?: string | null }): PortalWorkspace[] {
  const owned = (record: any) => record.authUid
    ? record.authUid === identity.uid
    : (record.uid === identity.uid || normalize(record.email) === normalize(identity.email));
  const isAssignedSubstitute = (record: any) => {
    const sub = record?.substitute;
    if (!sub || typeof sub !== 'object') return false;
    if (record.substituteAuthUid && record.substituteAuthUid === identity.uid) return true;
    if (sub.authUid && sub.authUid === identity.uid) return true;
    const subEmail = normalize(record.substituteEmail || sub.email);
    return Boolean(subEmail && normalize(identity.email) === subEmail);
  };
  const student = data.students.find((record) => active(record) && owned(record));
  const nonSasSignatories = data.signatories.filter((record) => !isSasSignatoryRecord(record));
  const activeSubstituteSignatories = nonSasSignatories.filter(
    (record) => active(record) && record.portalDeactivated === true && isAssignedSubstitute(record)
  );
  const ownedSignatureFallback =
    [...nonSasSignatories, ...data.advisers]
      .filter((record) => active(record) && owned(record))
      .map((record) => record.signatureUrl || record.signatureDataUrl)
      .find((sig) => typeof sig === 'string' && sig.trim().length > 0) || null;
  const needsPasswordChange =
    [...nonSasSignatories, ...data.advisers, ...data.officers, ...data.students]
      .filter((record) => active(record) && owned(record))
      .some((record) => record.tempPass || record.requiresPasswordChange || record.requiresChangePassword || record.resetInProgress) ||
    activeSubstituteSignatories.some((record) => record.substitute?.tempPass || record.substitute?.requiresPasswordChange);

  const workspaces: PortalWorkspace[] = [];
  nonSasSignatories.filter((record) => active(record) && owned(record)).forEach((record) => workspaces.push({
    id: `signatory:${record.id}`, kind: 'signatory', label: record.portalDeactivated ? 'Institutional Signatory (On Leave)' : 'Institutional Signatory',
    subtitle: [record.roleTitle || record.role, record.department, record.portalDeactivated ? 'Portal Deactivated' : ''].filter(Boolean).join(' · ') || undefined,
    path: '/signatory/dashboard', session: {
      id: record.id, uid: record.uid || record.id, authUid: identity.uid, ...structuredNameFields(record), email: identity.email,
      role: record.role, roleTitle: record.roleTitle, actionType: record.actionType, department: record.department || '', departmentId: record.departmentId || '', employeeId: record.employeeId || '',
      applicableScope: record.applicableScope, applicableWorkflows: getSignatoryAuthorizedWorkflows(record),
      canApproveProposal: record.canApproveProposal, canApproveLiquidation: record.canApproveLiquidation, canApprovePar: record.canApprovePar,
      signatureUrl: record.signatureUrl || record.signatureDataUrl || null, isSignatory: true,
      actingAsSubstitute: false,
      portalDeactivated: Boolean(record.portalDeactivated),
      portalDeactivatedReason: record.portalDeactivatedReason || null,
      portalDeactivatedUntil: record.portalDeactivatedUntil || null,
      substitute: record.substitute || null,
      substituteEmail: record.substituteEmail || record.substitute?.email || null,
      requiresPasswordChange: Boolean(needsPasswordChange),
    },
  }));

  // Delegated "Acting Signatory" workspaces (ONLY active while the Primary Signatory's portal is deactivated / on leave)
  activeSubstituteSignatories.forEach((record) => {
    const sub = record.substitute || {};
    const primaryName = formatPersonName(record);
    const subSig = sub.signatureUrl || sub.signatureDataUrl || ownedSignatureFallback || null;
    const baseRoleTitle = record.roleTitle || record.role || 'Institutional Signatory';
    workspaces.push({
      id: `signatory_sub:${record.id}`,
      kind: 'signatory',
      label: `Acting Signatory (for ${primaryName})`,
      subtitle: [`Acting ${baseRoleTitle}`, record.department].filter(Boolean).join(' · ') || undefined,
      path: '/signatory/dashboard',
      session: {
        id: record.id,
        uid: identity.uid,
        authUid: identity.uid,
        substituteUid: identity.uid,
        ...structuredNameFields(sub),
        name: formatPersonName(sub, sub.name || identity.email || 'Substitute Signatory'),
        email: identity.email || sub.email,
        role: record.role,
        roleTitle: `Acting ${baseRoleTitle}`,
        actionType: record.actionType,
        department: record.department || '',
        departmentId: record.departmentId || '',
        employeeId: sub.employeeId || '',
        applicableScope: record.applicableScope,
        applicableWorkflows: getSignatoryAuthorizedWorkflows(record),
        canApproveProposal: record.canApproveProposal,
        canApproveLiquidation: record.canApproveLiquidation,
        canApprovePar: record.canApprovePar,
        signatureUrl: subSig,
        signatureDataUrl: subSig,
        isSignatory: true,
        actingAsSubstitute: true,
        delegatedForSignatoryId: record.id,
        delegatedForSignatoryUid: record.uid || record.id,
        delegatedForSignatoryName: primaryName,
        delegatedForSignatoryEmail: record.email || '',
        delegatedForRoleTitle: baseRoleTitle,
        portalDeactivated: true,
        portalDeactivatedReason: record.portalDeactivatedReason || null,
        portalDeactivatedUntil: record.portalDeactivatedUntil || null,
        requiresPasswordChange: Boolean(sub.tempPass || sub.requiresPasswordChange || needsPasswordChange),
      },
    });
  });
  for (const [kind, records] of [
    ['adviser', data.advisers],
    [
      'officer',
      data.officers.filter(
        (record) =>
          record.hasWebPortalAccess !== false &&
          (!record.appointmentStatus || record.appointmentStatus === 'accepted')
      ),
    ],
  ] as const) {
    records.filter((record) => active(record) && (owned(record) || (kind === 'officer' && student && record.studentId === student.studentId && (!record.authUid || record.authUid === identity.uid)))).forEach((record) => {
      const organization = data.organizations.find((org) => org.id === record.organizationId);
      if (!organization || !active(organization)) return;
      const isCoAdv = kind === 'adviser' && record.adviserRole === 'co_adviser';
      workspaces.push({ id: `${kind}:${record.id}`, kind, label: kind === 'adviser' ? (isCoAdv ? 'Club Co-Adviser' : 'Club Adviser') : 'Organization Officer', organizationName: organization.name, path: '/officer/dashboard', session: {
        uid: identity.uid,
        authUid: identity.uid,
        role: kind === 'adviser' ? 'adviser' : 'officer',
        adviserRole: kind === 'adviser' ? (isCoAdv ? 'co_adviser' : 'primary') : undefined,
        isCoAdviser: isCoAdv,
        studentId: record.studentId || record.employeeId || record.email,
        studentName: formatPersonName(kind === 'officer' && student ? student : record), email: identity.email,
        activeOrganizationId: record.organizationId, activeRoleId: kind === 'adviser' ? 'adviser' : record.roleId,
        isAdviser: kind === 'adviser', isSignatory: false, signatureUrl: record.signatureUrl || record.signatureDataUrl || null, requiresPasswordChange: Boolean(needsPasswordChange),
      } });
    });
  }
  const availableWorkspaces = { hasSignatory: workspaces.some((item) => item.kind === 'signatory'), hasAdviser: workspaces.some((item) => item.kind === 'adviser'), hasOfficer: workspaces.some((item) => item.kind === 'officer') };
  workspaces.forEach((workspace) => { workspace.session.availableWorkspaces = availableWorkspaces; });
  return workspaces;
}

export async function loadPortalWorkspaces(): Promise<PortalWorkspace[]> {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Sign in before selecting a workspace.');

  // SAS Admins sign in exclusively through /admin/login, never /portal/login or /signatory
  try {
    const sasSnap = await getDoc(doc(db, 'sas_admins', user.uid));
    if (sasSnap.exists() && sasSnap.data()?.isActive !== false) {
      localStorage.removeItem(PORTAL_WORKSPACES_KEY);
      return [];
    }
  } catch {}
  const load = async (name: string) => {
    const trimmedEmail = user.email!.trim();
    const lowerEmail = trimmedEmail.toLowerCase();
    const queries = [
      getDocs(query(collection(db, name), where('email', '==', lowerEmail))),
      getDocs(query(collection(db, name), where('authUid', '==', user.uid))),
      getDocs(query(collection(db, name), where('uid', '==', user.uid))),
    ];
    if (trimmedEmail !== lowerEmail) {
      queries.push(getDocs(query(collection(db, name), where('email', '==', trimmedEmail))));
    }
    if (name === 'institutional_signatories') {
      queries.push(
        getDocs(query(collection(db, name), where('substituteEmail', '==', lowerEmail))),
        getDocs(query(collection(db, name), where('substituteAuthUid', '==', user.uid)))
      );
      if (trimmedEmail !== lowerEmail) {
        queries.push(getDocs(query(collection(db, name), where('substituteEmail', '==', trimmedEmail))));
      }
    }
    const snapshots = await Promise.all(queries);
    return [...new Map(snapshots.flatMap((snapshot) => snapshot.docs.map((record) => [record.id, { ...record.data(), id: record.id }] as const))).values()];
  };
  const [signatories, advisers, initialOfficers, students] = await Promise.all(['institutional_signatories', 'organization_advisers', 'organization_officers', 'students'].map(load));
  // Keep legacy organizations usable while their primary or co-adviser exists only in the embedded profile.
  const embedded = await Promise.all([
    getDocs(query(collection(db, 'organizations'), where('adviser.email', '==', user.email.trim().toLowerCase()))),
    getDocs(query(collection(db, 'organizations'), where('adviser.authUid', '==', user.uid))),
    getDocs(query(collection(db, 'organizations'), where('coAdviser.email', '==', user.email.trim().toLowerCase()))),
    getDocs(query(collection(db, 'organizations'), where('coAdviser.authUid', '==', user.uid))),
  ]);
  const adviserOrganizations = new Set(advisers.map((record: any) => `${record.organizationId}:${record.adviserRole === 'co_adviser' ? 'co_adviser' : 'primary'}`));
  for (let i = 0; i < embedded.length; i++) {
    const isCoQuery = i >= 2;
    const roleTag = isCoQuery ? 'co_adviser' : 'primary';
    for (const record of embedded[i].docs) {
      const organization = record.data();
      const embeddedProfile = isCoQuery ? organization.coAdviser : organization.adviser;
      const key = `${record.id}:${roleTag}`;
      if (!embeddedProfile || adviserOrganizations.has(key)) continue;
      advisers.push({ ...embeddedProfile, adviserRole: roleTag, id: `embedded:${roleTag}:${record.id}`, organizationId: record.id });
      adviserOrganizations.add(key);
    }
  }
  const officerMap = new Map(initialOfficers.map((record: any) => [record.id, record]));
  for (const student of students as any[]) {
    if (!student.studentId || (student.authUid && student.authUid !== user.uid)) continue;
    const snapshot = await getDocs(query(collection(db, 'organization_officers'), where('studentId', '==', student.studentId)));
    snapshot.docs.forEach((record) => officerMap.set(record.id, { ...record.data(), id: record.id }));
  }
  const officers = [...officerMap.values()];
  const orgIds = [...new Set([...advisers, ...officers].map((record: any) => record.organizationId).filter(Boolean))];
  const orgSnapshots = await Promise.all(orgIds.map((id) => getDoc(doc(db, 'organizations', id))));
  const organizations = orgSnapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }));
  const result = buildPortalWorkspaces({ signatories, advisers, officers, students, organizations }, user);
  localStorage.setItem(PORTAL_WORKSPACES_KEY, JSON.stringify(result));
  return result;
}

export function hasMultiplePortalKinds(workspaces: PortalWorkspace[]): boolean {
  if (new Set(workspaces.map((workspace) => workspace.kind)).size > 1) return true;
  return workspaces.length > 1 && workspaces.some((workspace) => workspace.id.startsWith('signatory_sub:'));
}

export function readStoredPortalWorkspaces(): PortalWorkspace[] {
  try {
    const raw = localStorage.getItem(PORTAL_WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function activatePortalWorkspace(workspace: PortalWorkspace) {
  if (!auth.currentUser || workspace.session.authUid !== auth.currentUser.uid) throw new Error('This workspace does not belong to the signed-in account.');
  resetAllSingletonStreams();
  localStorage.removeItem(OFFICER_KEY); localStorage.removeItem(SIGNATORY_KEY);
  if (workspace.kind === 'signatory') {
    localStorage.setItem(SIGNATORY_KEY, JSON.stringify(workspace.session));
    localStorage.setItem(OFFICER_KEY, JSON.stringify({ ...workspace.session, studentName: workspace.session.name, activeRoleId: workspace.session.role }));
  } else localStorage.setItem(OFFICER_KEY, JSON.stringify(workspace.session));
  return workspace.path;
}

export function clearPortalSessions() {
  resetAllSingletonStreams();
  [OFFICER_KEY, SIGNATORY_KEY, PORTAL_WORKSPACES_KEY].forEach((key) => localStorage.removeItem(key));
}
