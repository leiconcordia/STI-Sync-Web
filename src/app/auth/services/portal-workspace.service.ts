import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../../services/firebase';
import { formatPersonName, structuredNameFields } from '../../utils/name.utils';
import { getSignatoryAuthorizedWorkflows } from '../../modules/signatories/types/signatory.types';

export const PORTAL_WORKSPACES_KEY = 'sti_sync_portal_workspaces';
const OFFICER_KEY = 'sti_sync_officer_session';
const SIGNATORY_KEY = 'sti_sync_signatory_session';
export interface PortalWorkspace { id: string; label: string; organizationName?: string; subtitle?: string; path: string; session: any; kind: 'signatory' | 'adviser' | 'officer' }
const normalize = (value: any) => String(value || '').trim().toLowerCase();
const active = (value: any) => value.isActive !== false && !value.isDeleted && !value.archived && !['inactive', 'revoked', 'archived', 'suspended'].includes(normalize(value.status));

export function buildPortalWorkspaces(data: { signatories: any[]; advisers: any[]; officers: any[]; students: any[]; organizations: any[] }, identity: { uid: string; email?: string | null }): PortalWorkspace[] {
  const owned = (record: any) => record.authUid
    ? record.authUid === identity.uid
    : (record.uid === identity.uid || normalize(record.email) === normalize(identity.email));
  const student = data.students.find((record) => active(record) && owned(record));
  const needsPasswordChange = [...data.signatories, ...data.advisers, ...data.officers, ...data.students].filter((record) => active(record) && owned(record)).some((record) => record.tempPass || record.requiresPasswordChange || record.requiresChangePassword || record.resetInProgress);
  const workspaces: PortalWorkspace[] = [];
  data.signatories.filter((record) => active(record) && owned(record)).forEach((record) => workspaces.push({
    id: `signatory:${record.id}`, kind: 'signatory', label: 'Institutional Signatory',
    subtitle: [record.roleTitle || record.role, record.department].filter(Boolean).join(' · ') || undefined,
    path: '/signatory/dashboard', session: {
      id: record.id, uid: record.uid || record.id, authUid: identity.uid, ...structuredNameFields(record), email: identity.email,
      role: record.role, roleTitle: record.roleTitle, actionType: record.actionType, department: record.department || '', departmentId: record.departmentId || '', employeeId: record.employeeId || '',
      applicableScope: record.applicableScope, applicableWorkflows: getSignatoryAuthorizedWorkflows(record),
      canApproveProposal: record.canApproveProposal, canApproveLiquidation: record.canApproveLiquidation, canApprovePar: record.canApprovePar,
      signatureUrl: record.signatureUrl || record.signatureDataUrl || null, isSignatory: true, requiresPasswordChange: Boolean(needsPasswordChange),
    },
  }));
  for (const [kind, records] of [['adviser', data.advisers], ['officer', data.officers.filter((record) => record.hasWebPortalAccess !== false)]] as const) {
    records.filter((record) => active(record) && (owned(record) || (kind === 'officer' && student && record.studentId === student.studentId && (!record.authUid || record.authUid === identity.uid)))).forEach((record) => {
      const organization = data.organizations.find((org) => org.id === record.organizationId);
      if (!organization || !active(organization)) return;
      workspaces.push({ id: `${kind}:${record.id}`, kind, label: kind === 'adviser' ? 'Club Adviser' : 'Organization Officer', organizationName: organization.name, path: '/officer/dashboard', session: {
        uid: identity.uid,
        authUid: identity.uid,
        role: kind === 'adviser' ? 'adviser' : 'officer',
        studentId: record.studentId || record.employeeId || record.email,
        studentName: formatPersonName(kind === 'officer' && student ? student : record), email: identity.email,
        activeOrganizationId: record.organizationId, activeRoleId: kind === 'adviser' ? 'adviser' : record.roleId,
        isAdviser: kind === 'adviser', isSignatory: false, signatureUrl: record.signatureUrl || null, requiresPasswordChange: Boolean(needsPasswordChange),
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
    const snapshots = await Promise.all(queries);
    return [...new Map(snapshots.flatMap((snapshot) => snapshot.docs.map((record) => [record.id, { ...record.data(), id: record.id }] as const))).values()];
  };
  const [signatories, advisers, initialOfficers, students] = await Promise.all(['institutional_signatories', 'organization_advisers', 'organization_officers', 'students'].map(load));
  // Keep legacy organizations usable while their adviser exists only in the embedded profile.
  const embedded = await Promise.all([
    getDocs(query(collection(db, 'organizations'), where('adviser.email', '==', user.email.trim().toLowerCase()))),
    getDocs(query(collection(db, 'organizations'), where('adviser.authUid', '==', user.uid))),
  ]);
  const adviserOrganizations = new Set(advisers.map((record: any) => record.organizationId));
  for (const snapshot of embedded) for (const record of snapshot.docs) {
    const organization = record.data();
    if (!organization.adviser || adviserOrganizations.has(record.id)) continue;
    advisers.push({ ...organization.adviser, id: `embedded:${record.id}`, organizationId: record.id });
    adviserOrganizations.add(record.id);
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

export function activatePortalWorkspace(workspace: PortalWorkspace) {
  if (!auth.currentUser || workspace.session.authUid !== auth.currentUser.uid) throw new Error('This workspace does not belong to the signed-in account.');
  localStorage.removeItem(OFFICER_KEY); localStorage.removeItem(SIGNATORY_KEY);
  if (workspace.kind === 'signatory') {
    localStorage.setItem(SIGNATORY_KEY, JSON.stringify(workspace.session));
    localStorage.setItem(OFFICER_KEY, JSON.stringify({ ...workspace.session, studentName: workspace.session.name, activeRoleId: workspace.session.role }));
  } else localStorage.setItem(OFFICER_KEY, JSON.stringify(workspace.session));
  return workspace.path;
}

export function clearPortalSessions() {
  [OFFICER_KEY, SIGNATORY_KEY, PORTAL_WORKSPACES_KEY].forEach((key) => localStorage.removeItem(key));
}
