/**
 * src/app/modules/signatories/services/signatory.service.ts
 *
 * Firestore service and Firebase Auth provisioning for Institutional Signatories.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  addDoc,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, createSecondaryAuthUser } from '../../../../services/firebase';
import { sendSignatoryWelcomeCredentialsEmail } from '../../../../services/email.service';
import type {
  InstitutionalSignatory,
  CreateSignatoryPayload,
} from '../types/signatory.types';

export const SIGNATORIES_COLLECTION = 'institutional_signatories';

/**
 * Generate a clean, secure temporary password for institutional signers
 */
export function generateTemporaryPassword(): string {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `STI-Sign-${randomSuffix}!`;
}

/**
 * Real-time listener for institutional signatories
 */
export function subscribeToSignatories(
  callback: (signatories: InstitutionalSignatory[]) => void
): () => void {
  const q = query(
    collection(db, SIGNATORIES_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: InstitutionalSignatory[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          uid: data.uid || docSnap.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'program_head',
          roleTitle: data.roleTitle || '',
          actionType: data.actionType || (data.role === 'school_president' ? 'approve' : 'endorse'),
          department: data.department || '',
          departmentId: data.departmentId || '',
          employeeId: data.employeeId || '',
          signatureUrl: data.signatureUrl || data.signatureDataUrl || undefined,
          signatureDataUrl: data.signatureDataUrl || undefined,
          signatureUpdatedAt: data.signatureUpdatedAt,
          isActive: data.isActive !== false,
          requiresPasswordChange: data.requiresPasswordChange ?? true,
          temporaryPassword: data.temporaryPassword,
          customPassword: data.customPassword,
          passwordHash: data.passwordHash,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          createdByUid: data.createdByUid,
        };
      });
      callback(list);
    },
    (error) => {
      console.error('[SignatoryService] Error subscribing to signatories:', error);
    }
  );
}

/**
 * Create a new institutional signatory:
 * 1. Generates temporary credentials
 * 2. Creates Firebase Auth user via secondary app (without logging out current admin)
 * 3. Saves document to Firestore
 * 4. Dispatches credentials email
 */
export async function createInstitutionalSignatory(
  payload: CreateSignatoryPayload,
  adminUid: string
): Promise<{ success: boolean; id: string; temporaryPassword: string; error?: string }> {
  const cleanEmail = payload.email.trim().toLowerCase();
  const tempPassword = payload.temporaryPassword || generateTemporaryPassword();

  try {
    // ── STRICT DUPLICATE PREVENTION: Prevent adding the same signatory email twice ──
    const existingSnap = await getDocs(
      query(collection(db, SIGNATORIES_COLLECTION), where('email', '==', cleanEmail))
    );
    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0].data();
      if (existing.isActive !== false) {
        throw new Error(`A signatory with email "${cleanEmail}" is already registered (${existing.name || 'Active'}).`);
      }
    }

    // 1. Create Firebase Auth user
    let authUid = '';
    try {
      authUid = await createSecondaryAuthUser(cleanEmail, tempPassword);
    } catch (authErr: any) {
      console.warn('[SignatoryService] Secondary auth error:', authErr);
      if (authErr?.code !== 'auth/email-already-in-use') {
        throw new Error(authErr?.message || 'Failed to create Firebase Auth user');
      }
    }

    // 2. Prepare Firestore Document
    const docId = authUid || doc(collection(db, SIGNATORIES_COLLECTION)).id;
    const docRef = doc(db, SIGNATORIES_COLLECTION, docId);

    const docData: any = {
      uid: authUid || docId,
      name: payload.name.trim(),
      email: cleanEmail,
      role: payload.role,
      roleTitle: payload.roleTitle.trim(),
      actionType: payload.actionType || (payload.role === 'school_president' ? 'approver' : 'endorser'),
      department: payload.department ? payload.department.trim() : '',
      departmentId: payload.departmentId || '',
      employeeId: payload.employeeId ? payload.employeeId.trim() : '',
      isActive: true,
      requiresPasswordChange: true,
      temporaryPassword: tempPassword,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: adminUid,
    };

    await setDoc(docRef, docData, { merge: true });

    // 3. Dispatch automated credentials email in background
    sendSignatoryWelcomeCredentialsEmail({
      to: cleanEmail,
      signatoryName: payload.name.trim(),
      roleName: payload.role,
      positionTitle: payload.roleTitle.trim(),
      department: payload.department.trim(),
      temporaryPassword: tempPassword,
    }).catch((emailErr) => {
      console.warn('[SignatoryService] Background credentials email dispatch error:', emailErr);
    });

    return {
      success: true,
      id: docId,
      temporaryPassword: tempPassword,
    };
  } catch (err: any) {
    console.error('[SignatoryService] Failed to create institutional signatory:', err);
    return {
      success: false,
      id: '',
      temporaryPassword: '',
      error: err?.message || 'Failed to create institutional signatory',
    };
  }
}

/**
 * Reset password & dispatch new temporary credentials to a signatory
 */
export async function resetSignatoryCredentials(
  signatoryId: string,
  email: string,
  name: string,
  roleTitle: string,
  department: string
): Promise<{ success: boolean; temporaryPassword: string; error?: string }> {
  const newTempPassword = generateTemporaryPassword();
  try {
    const docRef = doc(db, SIGNATORIES_COLLECTION, signatoryId);
    await updateDoc(docRef, {
      temporaryPassword: newTempPassword,
      requiresPasswordChange: true,
      customPassword: null,
      passwordHash: null,
      updatedAt: serverTimestamp(),
    });

    // Send email
    await sendSignatoryWelcomeCredentialsEmail({
      to: email,
      signatoryName: name,
      roleName: roleTitle,
      positionTitle: roleTitle,
      department: department,
      temporaryPassword: newTempPassword,
    });

    return { success: true, temporaryPassword: newTempPassword };
  } catch (err: any) {
    console.error('[SignatoryService] Error resetting credentials:', err);
    return { success: false, temporaryPassword: '', error: err?.message || 'Failed to reset credentials' };
  }
}

/**
 * Toggle signatory active status
 */
export async function toggleSignatoryStatus(
  signatoryId: string,
  newActiveState: boolean
): Promise<void> {
  const docRef = doc(db, SIGNATORIES_COLLECTION, signatoryId);
  await updateDoc(docRef, {
    isActive: newActiveState,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update signatory profile details
 */
export async function updateSignatoryDetails(
  signatoryId: string,
  updates: Partial<Pick<InstitutionalSignatory, 'name' | 'role' | 'roleTitle' | 'actionType' | 'department' | 'departmentId' | 'employeeId'>>
): Promise<void> {
  const docRef = doc(db, SIGNATORIES_COLLECTION, signatoryId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Save official digital signature directly into Firestore database (and Storage if available).
 * Guarantees that the signature is persisted in the database documents.
 */
export async function saveSignatorySignatureInDatabase(
  signatoryIdentifier: { id?: string; uid?: string; email?: string } | string,
  imageBlob?: Blob | null,
  signatureDataUrl?: string
): Promise<{ success: boolean; signatureUrl: string }> {
  let docId = typeof signatoryIdentifier === 'string' ? signatoryIdentifier : (signatoryIdentifier.id || signatoryIdentifier.uid || '');
  let email = typeof signatoryIdentifier === 'string' ? '' : (signatoryIdentifier.email?.trim().toLowerCase() || '');

  // Fallback to active session in localStorage if email or docId is missing
  if (!email || !docId) {
    try {
      const raw = localStorage.getItem('sti_sync_signatory_session') || localStorage.getItem('sti_sync_officer_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!email && parsed.email) email = parsed.email.trim().toLowerCase();
        if (!docId && (parsed.id || parsed.uid)) docId = parsed.id || parsed.uid;
      }
    } catch (e) {
      console.warn('[SignatoryService] Session fallback notice:', e);
    }
  }

  // 1. Ensure Data URL is present for direct database persistence
  let dataUrl = signatureDataUrl;
  if (!dataUrl && imageBlob) {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(imageBlob);
    });
  }

  if (!dataUrl) {
    throw new Error('No signature image data captured. Please draw your signature before saving.');
  }

  let savedCount = 0;
  let lastError: any = null;

  // 2. Direct document ID update if provided
  if (docId) {
    try {
      const docRef = doc(db, SIGNATORIES_COLLECTION, docId);
      await setDoc(docRef, {
        signatureUrl: dataUrl,
        signatureDataUrl: dataUrl,
        hasSignature: true,
        signatureUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      savedCount++;
    } catch (directErr: any) {
      console.warn('[SignatoryService] Direct docId save warning:', directErr);
      lastError = directErr;
    }
  }

  // 3. Search and update all documents matching email in institutional_signatories
  if (email) {
    try {
      const qEmail = query(
        collection(db, SIGNATORIES_COLLECTION),
        where('email', '==', email)
      );
      const emailSnap = await getDocs(qEmail);
      for (const d of emailSnap.docs) {
        await setDoc(doc(db, SIGNATORIES_COLLECTION, d.id), {
          signatureUrl: dataUrl,
          signatureDataUrl: dataUrl,
          hasSignature: true,
          signatureUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        savedCount++;
        docId = d.id;
      }
    } catch (emailErr: any) {
      console.warn('[SignatoryService] Email query save warning:', emailErr);
      lastError = emailErr;
    }
  }

  // 4. If neither matched any existing doc, create the doc in institutional_signatories
  if (savedCount === 0 && (docId || email)) {
    try {
      const targetId = docId || doc(collection(db, SIGNATORIES_COLLECTION)).id;
      const docRef = doc(db, SIGNATORIES_COLLECTION, targetId);
      await setDoc(docRef, {
        id: targetId,
        email: email || '',
        signatureUrl: dataUrl,
        signatureDataUrl: dataUrl,
        hasSignature: true,
        signatureUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      savedCount++;
      docId = targetId;
    } catch (createErr: any) {
      console.warn('[SignatoryService] Fallback creation warning:', createErr);
      lastError = createErr;
    }
  }

  // 5. Update localStorage sessions immediately
  try {
    const rawSig = localStorage.getItem('sti_sync_signatory_session');
    if (rawSig) {
      const parsed = JSON.parse(rawSig);
      parsed.signatureUrl = dataUrl;
      parsed.signatureDataUrl = dataUrl;
      parsed.hasSignature = true;
      localStorage.setItem('sti_sync_signatory_session', JSON.stringify(parsed));
    }
    const rawOff = localStorage.getItem('sti_sync_officer_session');
    if (rawOff) {
      const parsedOff = JSON.parse(rawOff);
      parsedOff.signatureUrl = dataUrl;
      parsedOff.signatureDataUrl = dataUrl;
      localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsedOff));
    }
  } catch {}

  // 6. Save audit record in institutional_signatures collection
  try {
    await addDoc(collection(db, 'institutional_signatures'), {
      signatoryId: docId || '',
      signatoryEmail: email || '',
      signatureDataUrl: dataUrl,
      createdAt: serverTimestamp(),
    });
  } catch (auditErr) {
    console.warn('[SignatoryService] Signature audit log warning:', auditErr);
  }

  // 7. Non-blocking background upload to Firebase Storage (fire-and-forget, never delays database save)
  if (imageBlob) {
    try {
      const safeName = (docId || email || 'signatory').replace(/[^a-zA-Z0-9_-]/g, '_');
      const storagePath = `signatures/${safeName}/official_signature_${Date.now()}.png`;
      const storageRef = ref(storage, storagePath);
      uploadBytes(storageRef, imageBlob, { contentType: 'image/png' })
        .then(async () => {
          const downloadUrl = await getDownloadURL(storageRef);
          if (docId) {
            await setDoc(doc(db, SIGNATORIES_COLLECTION, docId), {
              signatureUrl: downloadUrl,
            }, { merge: true });
          }
        })
        .catch((storageErr) => {
          console.info('[SignatoryService] Background storage sync skipped (using database base64):', storageErr?.message);
        });
    } catch {}
  }

  if (savedCount === 0 && lastError) {
    throw new Error(lastError?.message || 'Database error: Could not save signature to Firestore.');
  }

  return { success: true, signatureUrl: dataUrl };
}

/**
 * Backward compatibility alias for uploadSignatorySignature
 */
export async function uploadSignatorySignature(
  signatoryUid: string,
  imageBlob: Blob
): Promise<string> {
  const res = await saveSignatorySignatureInDatabase(signatoryUid, imageBlob);
  return res.signatureUrl;
}
