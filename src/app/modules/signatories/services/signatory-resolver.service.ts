/**
 * src/app/modules/signatories/services/signatory-resolver.service.ts
 *
 * Centralized service for signature resolution and cross-profile synchronization.
 * Ensures that once a user (SAS Admin, Club Adviser, or Institutional Signatory)
 * registers or updates their e-signature, it is detected and reused everywhere
 * without redundant signature collection prompts.
 */

import { doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { getSasSignatoryConfig, getCachedSasSignatoryConfig, saveSasSignatoryConfig } from './sas-signatory.service';
import { SIGNATORIES_COLLECTION, saveSignatorySignatureInDatabase } from './signatory.service';
import { SAS_ADMINS_COLLECTION } from '../../auth/services/auth.service';

export interface UserSignatureIdentifier {
  uid?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  profile?: any | null;
}

/**
 * Fast, synchronous signature lookup from in-memory objects and local storage.
 * Useful for initial state rendering to prevent UI flickering.
 */
export function getFastCachedSignature(profile?: any): string {
  const profileRole = (profile?.role || '').trim().toLowerCase();
  const isOfficerOnly =
    (profileRole === 'officer' || profileRole === 'student_officer') &&
    profile?.isAdviser !== true;

  // Student officers do not register or attach signatures to Activity Proposals
  if (isOfficerOnly) {
    return '';
  }

  if (profile?.signatureUrl && typeof profile.signatureUrl === 'string' && profile.signatureUrl.trim().length > 0) {
    return profile.signatureUrl.trim();
  }
  if (profile?.signatureDataUrl && typeof profile.signatureDataUrl === 'string' && profile.signatureDataUrl.trim().length > 0) {
    return profile.signatureDataUrl.trim();
  }

  const profileEmail = (profile?.email || '').trim().toLowerCase();
  const isSasUser =
    profileRole === 'sas_admin' ||
    profileRole === 'admin' ||
    profileRole === 'sas_head' ||
    profileEmail.includes('sas') ||
    profileEmail.includes('sao');

  // 1. Check signatory session ONLY if email strictly matches
  try {
    const rawSig = localStorage.getItem('sti_sync_signatory_session');
    if (rawSig) {
      const parsed = JSON.parse(rawSig);
      const sessionEmail = (parsed.email || '').trim().toLowerCase();
      if (profileEmail && sessionEmail === profileEmail) {
        const sig = parsed.signatureUrl || parsed.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) return sig.trim();
      }
    }
  } catch {}

  // 2. Check officer / adviser session ONLY if email strictly matches AND session is an Adviser
  try {
    const rawOff = localStorage.getItem('sti_sync_officer_session');
    if (rawOff) {
      const parsed = JSON.parse(rawOff);
      const sessionEmail = (parsed.email || '').trim().toLowerCase();
      const sessionIsAdviser = parsed.isAdviser === true || (parsed.role || '').toLowerCase() === 'adviser';
      if (profileEmail && sessionEmail === profileEmail && sessionIsAdviser) {
        const sig = parsed.signatureUrl || parsed.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) return sig.trim();
      }
    }
  } catch {}

  // 3. ONLY return SAS global config if the user is verified to be SAS Admin!
  // NEVER fall back to SAS Head's signature for an adviser or student officer!
  if (isSasUser) {
    const sasCached = getCachedSasSignatoryConfig();
    if (sasCached?.signatureUrl && typeof sasCached.signatureUrl === 'string' && sasCached.signatureUrl.trim().length > 0) {
      return sasCached.signatureUrl.trim();
    }
    if (sasCached?.signatureDataUrl && typeof sasCached.signatureDataUrl === 'string' && sasCached.signatureDataUrl.trim().length > 0) {
      return sasCached.signatureDataUrl.trim();
    }
  }

  return '';
}

/**
 * Asynchronously resolves a user's verified digital signature from all potential database sources:
 * 1. Fast cache & profile props
 * 2. Global SAS Signatory configuration
 * 3. sas_admins collection
 * 4. institutional_signatories collection
 * 5. organization_advisers collection
 */
export async function resolveUserSignature(identifier: UserSignatureIdentifier): Promise<string> {
  const role = (identifier.role?.trim() || identifier.profile?.role || '').toLowerCase();
  const isOfficerOnly =
    (role === 'officer' || role === 'student_officer') &&
    identifier.profile?.isAdviser !== true;
  if (isOfficerOnly) {
    return '';
  }

  const cached = getFastCachedSignature({
    ...identifier.profile,
    email: identifier.email || identifier.profile?.email,
    role: identifier.role || identifier.profile?.role,
    uid: identifier.uid || identifier.profile?.uid,
  });
  if (cached) return cached;

  const uid = identifier.uid?.trim() || identifier.profile?.uid || identifier.profile?.id || '';
  const email = (identifier.email?.trim() || identifier.profile?.email || '').toLowerCase();

  const isSasOrAdmin =
    role === 'admin' ||
    role === 'sas_admin' ||
    email.includes('sas') ||
    email.includes('sao');

  // 1. If SAS Admin, check global SAS Signatory settings document
  if (isSasOrAdmin) {
    try {
      const sasConfig = await getSasSignatoryConfig();
      const sig = sasConfig.signatureUrl || sasConfig.signatureDataUrl;
      if (sig && typeof sig === 'string' && sig.trim().length > 0) {
        return sig.trim();
      }
    } catch (e) {
      console.warn('[SignatureResolver] SAS config lookup warning:', e);
    }
  }

  // 2. Direct UID check in sas_admins
  if (uid) {
    try {
      const adminSnap = await getDoc(doc(db, SAS_ADMINS_COLLECTION, uid));
      if (adminSnap.exists()) {
        const d = adminSnap.data();
        const sig = d.signatureUrl || d.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) {
          return sig.trim();
        }
      }
    } catch (e) {
      console.warn('[SignatureResolver] sas_admins UID lookup warning:', e);
    }
  }

  // 3. Check institutional_signatories by UID
  if (uid) {
    try {
      const sigSnap = await getDoc(doc(db, SIGNATORIES_COLLECTION, uid));
      if (sigSnap.exists()) {
        const d = sigSnap.data();
        const sig = d.signatureUrl || d.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) {
          return sig.trim();
        }
      }
    } catch (e) {
      console.warn('[SignatureResolver] institutional_signatories UID lookup warning:', e);
    }
  }

  // 4. Check institutional_signatories by Email
  if (email) {
    try {
      const q = query(collection(db, SIGNATORIES_COLLECTION), where('email', '==', email));
      const querySnap = await getDocs(q);
      for (const d of querySnap.docs) {
        const data = d.data();
        const sig = data.signatureUrl || data.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) {
          return sig.trim();
        }
      }
    } catch (e) {
      console.warn('[SignatureResolver] institutional_signatories email lookup warning:', e);
    }
  }

  // 5. Check organization_advisers by UID or Email
  if (uid) {
    try {
      const advSnap = await getDoc(doc(db, 'organization_advisers', uid));
      if (advSnap.exists()) {
        const d = advSnap.data();
        const sig = d.signatureUrl || d.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) {
          return sig.trim();
        }
      }
    } catch (e) {
      console.warn('[SignatureResolver] organization_advisers UID lookup warning:', e);
    }
  }

  if (email) {
    try {
      const qAdv = query(collection(db, 'organization_advisers'), where('email', '==', email));
      const advQuerySnap = await getDocs(qAdv);
      for (const d of advQuerySnap.docs) {
        const data = d.data();
        const sig = data.signatureUrl || data.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) {
          return sig.trim();
        }
      }
    } catch (e) {
      console.warn('[SignatureResolver] organization_advisers email lookup warning:', e);
    }
  }

  // 6. Check embedded adviser in organizations collection
  if (email || uid) {
    try {
      const qOrg = email
        ? query(collection(db, 'organizations'), where('adviser.email', '==', email))
        : query(collection(db, 'organizations'), where('adviser.authUid', '==', uid));
      const orgQuerySnap = await getDocs(qOrg);
      for (const d of orgQuerySnap.docs) {
        const adv = d.data()?.adviser;
        const sig = adv?.signatureUrl || adv?.signatureDataUrl;
        if (sig && typeof sig === 'string' && sig.trim().length > 0) {
          return sig.trim();
        }
      }
    } catch (e) {
      console.warn('[SignatureResolver] organizations embedded adviser lookup warning:', e);
    }
  }

  return '';
}

/**
 * Synchronizes a newly drawn or uploaded signature across all relevant collections
 * so that settings, document creation wizards, and approval workflows all immediately
 * recognize the updated signature without requiring a reload.
 */
export async function syncUserSignatureAcrossProfiles(params: {
  uid?: string | null;
  email?: string | null;
  name?: string | null;
  roleTitle?: string | null;
  signatureUrl: string;
  role?: string | null;
}): Promise<void> {
  const { uid, email, name, roleTitle, signatureUrl, role } = params;
  if (!signatureUrl) return;

  const effectiveEmail = (email || '').toLowerCase().trim();
  const effectiveUid = uid || '';
  const effectiveName = name || 'Signatory';
  const effectiveRoleTitle = roleTitle || 'Institutional Signatory';
  const isSasOrAdmin =
    role === 'admin' ||
    role === 'sas_admin' ||
    effectiveEmail.includes('sas') ||
    effectiveEmail.includes('sao');

  // 1. Update sas_admins if UID is present and user is admin
  if (effectiveUid && isSasOrAdmin) {
    try {
      const adminRef = doc(db, SAS_ADMINS_COLLECTION, effectiveUid);
      await setDoc(adminRef, {
        signatureUrl,
        signatureDataUrl: signatureUrl,
        signatureUpdatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[SignatureResolver] Sync to sas_admins notice:', e);
    }
  }

  // 2. Update global SAS Signatory Settings if admin
  if (isSasOrAdmin) {
    try {
      await saveSasSignatoryConfig({
        name: effectiveName,
        email: effectiveEmail,
        roleTitle: effectiveRoleTitle,
        signatureUrl,
        signatureDataUrl: signatureUrl,
      });
    } catch (e) {
      console.warn('[SignatureResolver] Sync to sas_signatory notice:', e);
    }
  }

  // 3. Save to institutional_signatories and audit records
  try {
    await saveSignatorySignatureInDatabase(
      { id: effectiveUid, email: effectiveEmail },
      null,
      signatureUrl
    );
  } catch (e) {
    console.warn('[SignatureResolver] Sync to institutional_signatories notice:', e);
  }

  // 4. Update organization_advisers if adviser
  if (effectiveUid) {
    try {
      const advRef = doc(db, 'organization_advisers', effectiveUid);
      await setDoc(advRef, {
        signatureUrl,
        signatureDataUrl: signatureUrl,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[SignatureResolver] Sync to organization_advisers notice:', e);
    }
  }

  // 4b. Update embedded adviser in organizations collection
  if (effectiveEmail || effectiveUid) {
    try {
      const qOrg = effectiveEmail
        ? query(collection(db, 'organizations'), where('adviser.email', '==', effectiveEmail))
        : query(collection(db, 'organizations'), where('adviser.authUid', '==', effectiveUid));
      const orgQuerySnap = await getDocs(qOrg);
      for (const d of orgQuerySnap.docs) {
        const adv = d.data()?.adviser || {};
        await setDoc(doc(db, 'organizations', d.id), {
          adviser: {
            ...adv,
            signatureUrl,
            signatureDataUrl: signatureUrl,
          }
        }, { merge: true });
      }
    } catch (e) {
      console.warn('[SignatureResolver] Sync to embedded organizations adviser notice:', e);
    }
  }

  // 5. Update localStorage sessions immediately
  try {
    const rawSig = localStorage.getItem('sti_sync_signatory_session');
    if (rawSig) {
      const parsed = JSON.parse(rawSig);
      parsed.signatureUrl = signatureUrl;
      parsed.signatureDataUrl = signatureUrl;
      parsed.hasSignature = true;
      localStorage.setItem('sti_sync_signatory_session', JSON.stringify(parsed));
    }
    const rawOff = localStorage.getItem('sti_sync_officer_session');
    if (rawOff) {
      const parsedOff = JSON.parse(rawOff);
      parsedOff.signatureUrl = signatureUrl;
      parsedOff.signatureDataUrl = signatureUrl;
      localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsedOff));
    }
  } catch {}
}

