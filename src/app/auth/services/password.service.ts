/**
 * src/app/auth/services/password.service.ts
 *
 * Handles changing user passwords with real Firebase Auth and synchronizing
 * requiresPasswordChange status across Firestore collections (organization_advisers,
 * organizations, students, and local session).
 */

import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { auth, db } from '../../../services/firebase';
import type { OfficerProfile } from '../hooks/useOfficerProfile';

const SESSION_KEY = 'sti_sync_officer_session';

export async function changeOfficerOrAdviserPassword(
  currentPassword: string,
  newPassword: string,
  profile: OfficerProfile
): Promise<void> {
  const email = profile.email?.trim().toLowerCase();
  if (!email) {
    throw new Error('No email found in active session profile.');
  }

  // ── 1. Re-authenticate / Ensure Firebase Auth User is signed in ──
  let user = auth.currentUser;
  if (!user || user.email?.toLowerCase() !== email) {
    const cred = await signInWithEmailAndPassword(auth, email, currentPassword);
    user = cred.user;
  } else {
    try {
      const cred = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(user, cred);
    } catch (reauthErr: any) {
      console.warn('[passwordService] Reauth failed, trying fresh signIn:', reauthErr);
      const cred = await signInWithEmailAndPassword(auth, email, currentPassword);
      user = cred.user;
    }
  }

  // ── 2. Update Password in Firebase Auth ──
  if (user) {
    await updatePassword(user, newPassword);
  } else {
    throw new Error('Could not authenticate user session to update password.');
  }

  // ── 3. Update Firestore Records ──
  try {
    if (profile.isAdviser) {
      // Update organization_advisers
      const qAdv = query(
        collection(db, 'organization_advisers'),
        where('email', '==', email)
      );
      const advSnap = await getDocs(qAdv);
      for (const d of advSnap.docs) {
        await updateDoc(doc(db, 'organization_advisers', d.id), {
          requiresPasswordChange: false,
          temporaryPassword: null,
          updatedAt: serverTimestamp(),
        });
      }

      // If activeOrganizationId is present, update embedded adviser in organizations
      if (profile.activeOrganizationId) {
        const orgRef = doc(db, 'organizations', profile.activeOrganizationId);
        await updateDoc(orgRef, {
          'adviser.requiresPasswordChange': false,
          'adviser.temporaryPassword': null,
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      // Officer / Student - clear temporaryPassword so old/temp passwords can no longer log in
      const qStudent = query(
        collection(db, 'students'),
        where('email', '==', email)
      );
      const studentSnap = await getDocs(qStudent);
      for (const d of studentSnap.docs) {
        await updateDoc(doc(db, 'students', d.id), {
          requiresPasswordChange: false,
          requiresChangePassword: deleteField(),
          temporaryPassword: null,
          defaultPassword: deleteField(),
          updatedAt: serverTimestamp(),
        });
      }

      if (profile.studentId) {
        const qOfficer = query(
          collection(db, 'organization_officers'),
          where('studentId', '==', profile.studentId)
        );
        const officerSnap = await getDocs(qOfficer);
        for (const d of officerSnap.docs) {
          await updateDoc(doc(db, 'organization_officers', d.id), {
            requiresPasswordChange: false,
            temporaryPassword: null,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Also ensure all officer docs with matching email are cleared
      const qOfficerEmail = query(
        collection(db, 'organization_officers'),
        where('email', '==', email)
      );
      const officerEmailSnap = await getDocs(qOfficerEmail);
      for (const d of officerEmailSnap.docs) {
        await updateDoc(doc(db, 'organization_officers', d.id), {
          requiresPasswordChange: false,
          temporaryPassword: null,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (dbErr) {
    console.warn('[passwordService] Firestore status update warning:', dbErr);
  }

  // ── 4. Update Local Session ──
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.requiresPasswordChange = false;
      localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
    }
  } catch (sessErr) {
    console.warn('[passwordService] Session update warning:', sessErr);
  }
}

/**
 * SHA-256 password hashing helper for client-side verifiable credential caching
 */
export async function hashPassword(str: string): Promise<string> {
  const buffer = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Change password for Institutional Signatories.
 * Sets requiresPasswordChange to false, clears temporaryPassword, and stores new credentials.
 * Ensures the temporary password can NEVER be used again until Admin resets it.
 */
export async function changeSignatoryPassword(
  currentPassword: string,
  newPassword: string,
  signatorySession: { id?: string; uid?: string; email: string }
): Promise<void> {
  const email = signatorySession.email?.trim().toLowerCase();
  if (!email) {
    throw new Error('No email found in active signatory session.');
  }

  const trimmedCurrent = currentPassword.trim();
  const trimmedNew = newPassword.trim();

  if (trimmedNew.length < 8) {
    throw new Error('New password must be at least 8 characters long.');
  }

  if (trimmedCurrent === trimmedNew) {
    throw new Error('New password must be different from your current/temporary password.');
  }

  // ── 1. Verify Current Password against Firestore Signatory Document ──
  const qSig = query(
    collection(db, 'institutional_signatories'),
    where('email', '==', email)
  );
  const sigSnap = await getDocs(qSig);
  const sigDoc = sigSnap.docs[0];
  const sigData = sigDoc ? sigDoc.data() : null;

  if (sigData) {
    const isTempActive = sigData.requiresPasswordChange === true;
    if (isTempActive) {
      if (sigData.temporaryPassword && sigData.temporaryPassword !== trimmedCurrent) {
        throw new Error('The current temporary password you entered is incorrect. Please check your credentials email.');
      }
    } else {
      const currentHash = await hashPassword(trimmedCurrent);
      const matchesCustom = sigData.customPassword && sigData.customPassword === trimmedCurrent;
      const matchesHash = sigData.passwordHash && sigData.passwordHash === currentHash;
      if (!matchesCustom && !matchesHash) {
        // Fallback to checking Firebase Auth before throwing
        try {
          await signInWithEmailAndPassword(auth, email, trimmedCurrent);
        } catch {
          throw new Error('The current password you entered is incorrect.');
        }
      }
    }
  }

  // ── 2. Re-authenticate / Update Firebase Auth User if available ──
  let user = auth.currentUser;
  try {
    if (!user || user.email?.toLowerCase() !== email) {
      const cred = await signInWithEmailAndPassword(auth, email, trimmedCurrent);
      user = cred.user;
    } else {
      const cred = EmailAuthProvider.credential(email, trimmedCurrent);
      await reauthenticateWithCredential(user, cred);
    }

    if (user) {
      await updatePassword(user, trimmedNew);
    }
  } catch (authErr: any) {
    console.warn('[passwordService] Firebase Auth update note:', authErr?.message || authErr);
  }

  // ── 3. Update Firestore Document in institutional_signatories ──
  // Compute secure hash of new password
  const newPasswordHash = await hashPassword(trimmedNew);

  try {
    for (const d of sigSnap.docs) {
      await updateDoc(doc(db, 'institutional_signatories', d.id), {
        requiresPasswordChange: false,
        temporaryPassword: null,
        customPassword: trimmedNew,
        passwordHash: newPasswordHash,
        updatedAt: serverTimestamp(),
      });
    }

    if (signatorySession.id && (!sigDoc || sigDoc.id !== signatorySession.id)) {
      await updateDoc(doc(db, 'institutional_signatories', signatorySession.id), {
        requiresPasswordChange: false,
        temporaryPassword: null,
        customPassword: trimmedNew,
        passwordHash: newPasswordHash,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (dbErr) {
    console.error('[passwordService] Firestore signatory update error:', dbErr);
    throw new Error('Failed to save updated password in institutional records.');
  }

  // ── 4. Update Local Session (Both Keys) ──
  try {
    const rawSig = localStorage.getItem('sti_sync_signatory_session');
    if (rawSig) {
      const parsed = JSON.parse(rawSig);
      parsed.requiresPasswordChange = false;
      delete parsed.temporaryPassword;
      localStorage.setItem('sti_sync_signatory_session', JSON.stringify(parsed));
    }

    const rawOfficer = localStorage.getItem('sti_sync_officer_session');
    if (rawOfficer) {
      const parsed = JSON.parse(rawOfficer);
      parsed.requiresPasswordChange = false;
      delete parsed.temporaryPassword;
      localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsed));
    }
  } catch (sessErr) {
    console.warn('[passwordService] Session update warning:', sessErr);
  }
}

