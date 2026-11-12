import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { auth, db } from '../../../services/firebase';
import type { OfficerProfile } from '../hooks/useOfficerProfile';

export async function changeAccountPassword(currentPassword: string, newPassword: string, emailInput: string): Promise<void> {
  const email = emailInput?.trim().toLowerCase();
  if (!email || !currentPassword) throw new Error('Enter your current or temporary password.');
  if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9\W_]/.test(newPassword)) {
    throw new Error('Use at least 8 characters, an uppercase letter, and a number or symbol.');
  }

  let user = auth.currentUser;
  try {
    if (!user || user.email?.toLowerCase() !== email) {
      user = (await signInWithEmailAndPassword(auth, email, currentPassword)).user;
    } else {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, currentPassword));
    }
  } catch (authErr: any) {
    const code = authErr?.code || '';
    const rawMsg = authErr?.message || '';
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      rawMsg.includes('auth/invalid-credential') ||
      rawMsg.includes('auth/wrong-password') ||
      rawMsg.toLowerCase().includes('invalid-credential')
    ) {
      throw new Error('Incorrect current password. Please check your current or temporary password and try again.');
    }
    if (code === 'auth/user-not-found' || rawMsg.includes('auth/user-not-found')) {
      throw new Error('No user account found for this email address. Please contact SAS.');
    }
    if (code === 'auth/too-many-requests' || rawMsg.includes('auth/too-many-requests')) {
      throw new Error('Too many failed attempts. Account temporarily locked for security. Please try again later.');
    }
    if (code === 'auth/network-request-failed' || rawMsg.includes('auth/network-request-failed')) {
      throw new Error('Network error. Please check your internet connection and try again.');
    }
    throw new Error(rawMsg || 'Authentication failed. Please verify your current password.');
  }

  const refs = new Map<string, any>();
  const studentIds = new Set<string>();
  let pendingTemporary: string | null = null;
  for (const name of ['organization_advisers', 'institutional_signatories', 'students', 'organization_officers']) {
    for (const [field, value] of [['email', email], ['authUid', user.uid]]) {
      const matches = await getDocs(query(collection(db, name), where(field, '==', value)));
      matches.docs.forEach((item) => {
        refs.set(item.ref.path, item.ref);
        const data = item.data();
        if (name === 'students' && data.studentId) studentIds.add(data.studentId);
        if (typeof data.tempPass === 'string' && data.tempPass.length) pendingTemporary = data.tempPass;
      });
    }
  }
  for (const studentId of studentIds) {
    const matches = await getDocs(query(collection(db, 'organization_officers'), where('studentId', '==', studentId)));
    matches.docs.forEach((item) => refs.set(item.ref.path, item.ref));
  }
  if (!refs.size) throw new Error('No linked account profile was found. Contact SAS.');
  // Same-password requests may finish a failed Firestore cleanup only after
  // Firebase reauthentication proves the permanent password was already saved.
  const cleanupOnly = currentPassword === newPassword && pendingTemporary && pendingTemporary !== currentPassword;
  if (currentPassword === newPassword && !cleanupOnly) throw new Error('Choose a password different from your current or temporary password.');
  if (pendingTemporary === newPassword) throw new Error('You cannot reuse the temporary password.');
  const organizations = await getDocs(query(collection(db, 'organizations'), where('adviser.email', '==', email)));
  if (refs.size + organizations.size > 450) throw new Error('Too many duplicate account records. Contact SAS.');
  if (!cleanupOnly) {
    try {
      await updatePassword(user, newPassword);
    } catch (updateErr: any) {
      const code = updateErr?.code || '';
      const rawMsg = updateErr?.message || '';
      if (code === 'auth/weak-password' || rawMsg.includes('auth/weak-password')) {
        throw new Error('New password is too weak. Please use at least 8 characters with uppercase letters and numbers or symbols.');
      }
      if (code === 'auth/requires-recent-login' || rawMsg.includes('auth/requires-recent-login')) {
        throw new Error('For security, your login session has expired. Please sign out and sign in again before changing your password.');
      }
      throw new Error(rawMsg || 'Failed to update password.');
    }
  }
  try {
    const batch = writeBatch(db);
    refs.forEach((ref) => batch.update(ref, {
      tempPass: null, requiresPasswordChange: false, resetInProgress: false,
      ...(ref.parent.id === 'organization_officers' ? { authUid: user.uid, email } : {}),
      temporaryPassword: deleteField(), defaultPassword: deleteField(), customPassword: deleteField(),
      passwordHash: deleteField(), requiresChangePassword: deleteField(), updatedAt: serverTimestamp(),
    }));
    organizations.docs.forEach((item) => batch.update(item.ref, {
      'adviser.tempPass': null, 'adviser.requiresPasswordChange': false,
      'adviser.temporaryPassword': deleteField(), updatedAt: serverTimestamp(),
    }));
    await batch.commit();
  } catch {
    throw new Error('Your password was saved in Firebase, but account cleanup failed. Sign in with the new password and retry account setup.');
  }
  for (const key of ['sti_sync_officer_session', 'sti_sync_signatory_session']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (session.email?.toLowerCase() !== email) continue;
      session.requiresPasswordChange = false;
      delete session.tempPass; delete session.temporaryPassword; delete session.defaultPassword;
      delete session.customPassword; delete session.passwordHash;
      localStorage.setItem(key, JSON.stringify(session));
    } catch { /* A stale browser cache must not undo a completed Auth change. */ }
  }
}

export function changeOfficerOrAdviserPassword(currentPassword: string, newPassword: string, profile: OfficerProfile): Promise<void> {
  return changeAccountPassword(currentPassword, newPassword, profile.email);
}

export function changeSignatoryPassword(currentPassword: string, newPassword: string, session: { email: string; id?: string; uid?: string }): Promise<void> {
  return changeAccountPassword(currentPassword, newPassword, session.email);
}
