/**
 * src/app/modules/signatories/services/signatory.service.ts
 *
 * Firestore service and Firebase Auth provisioning for Institutional Signatories.
 */

import {
  collection,
  doc,
  getDocs,
  getDocsFromCache,
  getDoc,
  getDocFromCache,
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
import { db, storage, createSecondaryAuthUser, rollbackSecondaryAuthUser } from '../../../../services/firebase';
import { sendSignatoryWelcomeCredentialsEmail } from '../../../../services/email.service';
import { resetAccountPassword } from '../../accounts/services/account-reset.service';
import { createNotification } from '../../notifications/services/notification.service';
import { formatPersonName, structuredNameFields } from '../../../utils/name.utils';
import {
  getSignatoryPendingDocuments,
  validateSignatoryPortalDeactivation,
  validateRemoveSignatorySubstitute,
  type PendingDocumentInfo,
} from './signatory-validation.service';
import type {
  InstitutionalSignatory,
  CreateSignatoryPayload,
  SignatorySubstituteConfig,
} from '../types/signatory.types';

export const SIGNATORIES_COLLECTION = 'institutional_signatories';

async function getDocQuotaSafe(docRef: any) {
  try {
    return await getDoc(docRef);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || String(err?.message || '').toLowerCase().includes('quota')) {
      return await getDocFromCache(docRef);
    }
    throw err;
  }
}

async function getDocsQuotaSafe(q: any) {
  try {
    return await getDocs(q);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || String(err?.message || '').toLowerCase().includes('quota')) {
      return await getDocsFromCache(q);
    }
    throw err;
  }
}

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
        const isAccountant =
          (data.role || '').toLowerCase() === 'accountant' ||
          (data.roleTitle || '').toLowerCase().includes('accountant') ||
          (data.roleTitle || '').toLowerCase().includes('auditor');
        const resolvedScope =
          data.applicableScope || (isAccountant ? 'liquidation_only' : 'both');

        return {
          id: docSnap.id,
          uid: data.uid || docSnap.id,
          authUid: data.authUid || undefined,
          ...structuredNameFields(data),
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
          isPermanentSigner: Boolean(data.isPermanentSigner),
          canApproveProposal: data.canApproveProposal ?? (data.role === 'school_president' || (data.roleTitle || '').toLowerCase().includes('president')),
          canApproveLiquidation: data.canApproveLiquidation ?? (data.role === 'school_president' || (data.roleTitle || '').toLowerCase().includes('president')),
          canApprovePar: data.canApprovePar ?? (data.role === 'school_president' || (data.roleTitle || '').toLowerCase().includes('president')),
          defaultSignatoryLabel: data.defaultSignatoryLabel || undefined,
          applicableScope: resolvedScope,
          isActive: data.isActive !== false,
          substitute: data.substitute || null,
          substituteEmail: data.substituteEmail || data.substitute?.email || null,
          substituteAuthUid: data.substituteAuthUid || data.substitute?.authUid || null,
          substituteEmployeeId: data.substituteEmployeeId || data.substitute?.employeeId || null,
          portalDeactivated: Boolean(data.portalDeactivated),
          portalDeactivatedReason: data.portalDeactivatedReason || null,
          portalDeactivatedUntil: data.portalDeactivatedUntil || null,
          portalDeactivatedAt: data.portalDeactivatedAt || null,
          portalDeactivatedBy: data.portalDeactivatedBy || null,
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
 * Fetch all institutional signatories directly
 */
export async function getInstitutionalSignatories(): Promise<InstitutionalSignatory[]> {
  try {
    const q = query(
      collection(db, SIGNATORIES_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const isAccountant =
        (data.role || '').toLowerCase() === 'accountant' ||
        (data.roleTitle || '').toLowerCase().includes('accountant') ||
        (data.roleTitle || '').toLowerCase().includes('auditor');
      const resolvedScope =
        data.applicableScope || (isAccountant ? 'liquidation_only' : 'both');

      return {
        id: docSnap.id,
        uid: data.uid || docSnap.id,
        authUid: data.authUid || undefined,
        ...structuredNameFields(data),
        email: data.email || '',
        role: data.role || 'program_head',
        roleTitle: data.roleTitle || '',
        department: data.department || '',
        departmentId: data.departmentId,
        employeeId: data.employeeId || '',
        actionType: data.actionType || 'endorse',
        status: data.status || 'active',
        signatureUrl: data.signatureUrl || data.signatureDataUrl || undefined,
        isPermanentSigner: Boolean(data.isPermanentSigner),
        canApproveProposal: data.canApproveProposal ?? (data.role === 'school_president' || (data.roleTitle || '').toLowerCase().includes('president')),
        canApproveLiquidation: data.canApproveLiquidation ?? (data.role === 'school_president' || (data.roleTitle || '').toLowerCase().includes('president')),
        canApprovePar: data.canApprovePar ?? (data.role === 'school_president' || (data.roleTitle || '').toLowerCase().includes('president')),
        defaultSignatoryLabel: data.defaultSignatoryLabel || undefined,
        applicableScope: resolvedScope,
        isActive: data.isActive !== false,
        substitute: data.substitute || null,
        substituteEmail: data.substituteEmail || data.substitute?.email || null,
        substituteAuthUid: data.substituteAuthUid || data.substitute?.authUid || null,
        substituteEmployeeId: data.substituteEmployeeId || data.substitute?.employeeId || null,
        portalDeactivated: Boolean(data.portalDeactivated),
        portalDeactivatedReason: data.portalDeactivatedReason || null,
        portalDeactivatedUntil: data.portalDeactivatedUntil || null,
        portalDeactivatedAt: data.portalDeactivatedAt || null,
        portalDeactivatedBy: data.portalDeactivatedBy || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as InstitutionalSignatory;
    });
  } catch (err) {
    console.error('[SignatoryService] Error fetching signatories:', err);
    return [];
  }
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
  let createdAuthUid = '';

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
      createdAuthUid = authUid;
    } catch (authErr: any) {
      console.warn('[SignatoryService] Secondary auth error:', authErr);
      throw new Error(authErr?.message || 'Failed to create Firebase Auth user');
    }

    // 2. Prepare Firestore Document
    const docId = authUid || doc(collection(db, SIGNATORIES_COLLECTION)).id;
    const docRef = doc(db, SIGNATORIES_COLLECTION, docId);

    const docData: any = {
      uid: authUid || docId,
      authUid,
      ...structuredNameFields(payload),
      email: cleanEmail,
      role: payload.role,
      roleTitle: payload.roleTitle.trim(),
      actionType: payload.actionType || (payload.role === 'school_president' ? 'approver' : 'endorser'),
      department: payload.department ? payload.department.trim() : '',
      departmentId: payload.departmentId || '',
      employeeId: payload.employeeId ? payload.employeeId.trim() : '',
      isPermanentSigner: Boolean(payload.isPermanentSigner),
      canApproveProposal: Boolean(payload.canApproveProposal),
      canApproveLiquidation: Boolean(payload.canApproveLiquidation),
      canApprovePar: Boolean(payload.canApprovePar),
      defaultSignatoryLabel: payload.defaultSignatoryLabel ? payload.defaultSignatoryLabel.trim() : '',
      isMandatoryForDepartment: payload.isMandatoryForDepartment || '',
      applicableScope: payload.applicableScope || (payload.role === 'accountant' ? 'liquidation_only' : 'both'),
      isActive: true,
      requiresPasswordChange: true,
      tempPass: tempPassword,
      resetInProgress: false,
      temporaryPassword: tempPassword,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: adminUid,
    };

    await setDoc(docRef, docData, { merge: true });

    // 3. Dispatch automated credentials email in background
    sendSignatoryWelcomeCredentialsEmail({
      to: cleanEmail,
      signatoryName: formatPersonName(payload),
      roleName: payload.role,
      positionTitle: payload.roleTitle.trim(),
      department: (payload.department || '').trim(),
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
    if (createdAuthUid) {
      try { await rollbackSecondaryAuthUser(cleanEmail, tempPassword, createdAuthUid); }
      catch { console.warn('Could not roll back newly provisioned signatory. Account repair may be needed.'); }
    }
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
): Promise<{ success: boolean; temporaryPassword: string; error?: string; delivery?: 'accepted' | 'failed' }> {
  if (import.meta.env.VITE_ACCOUNT_RESET_ENABLED === 'false') {
    return { success: false, temporaryPassword: '', error: 'Password reset service is not configured.' };
  }
  try {
    const result = await resetAccountPassword('signatories', signatoryId, 'Reset requested in signatory management');
    return { success: true, temporaryPassword: result.temporaryPassword, delivery: result.delivery, error: result.deliveryError };
  } catch (err: any) {
    return { success: false, temporaryPassword: '', error: err?.message || 'Failed to reset credentials.' };
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
  updates: Partial<Pick<InstitutionalSignatory, 'name' | 'firstName' | 'lastName' | 'middleName' | 'middleInitial' | 'role' | 'roleTitle' | 'actionType' | 'department' | 'departmentId' | 'employeeId' | 'isPermanentSigner' | 'isMandatoryForDepartment' | 'applicableScope' | 'applicableWorkflows' | 'canApproveProposal' | 'canApproveLiquidation' | 'canApprovePar' | 'defaultSignatoryLabel'>>
): Promise<void> {
  const docRef = doc(db, SIGNATORIES_COLLECTION, signatoryId);
  const changesNames = ['firstName', 'lastName', 'middleName', 'middleInitial'].some((key) => Object.prototype.hasOwnProperty.call(updates, key));
  const existing = changesNames ? await getDoc(docRef) : null;
  await updateDoc(docRef, {
    ...updates,
    ...(changesNames ? structuredNameFields({ ...(existing?.data() || {}), ...updates }) : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Save official digital signature directly into Firestore database (and Storage if available).
 * Guarantees that the signature is persisted in the database documents.
 * When `actingAsSubstitute` is true, isolates writes strictly to `substitute.signatureUrl`
 * (plus the substitute's own primary/adviser profiles) so the Primary Signatory's signature
 * is never overwritten.
 */
export async function saveSignatorySignatureInDatabase(
  signatoryIdentifier: {
    id?: string;
    uid?: string;
    email?: string;
    actingAsSubstitute?: boolean;
    delegatedForSignatoryId?: string;
  } | string,
  imageBlob?: Blob | null,
  signatureDataUrl?: string
): Promise<{ success: boolean; signatureUrl: string }> {
  let docId = typeof signatoryIdentifier === 'string' ? signatoryIdentifier : (signatoryIdentifier.id || signatoryIdentifier.uid || '');
  let email = typeof signatoryIdentifier === 'string' ? '' : (signatoryIdentifier.email?.trim().toLowerCase() || '');
  let actingAsSubstitute = typeof signatoryIdentifier === 'string' ? false : Boolean(signatoryIdentifier.actingAsSubstitute);
  let delegatedForSignatoryId = typeof signatoryIdentifier === 'string' ? '' : (signatoryIdentifier.delegatedForSignatoryId || '');

  // Fallback to active session in localStorage if email or docId or substitute context is missing
  try {
    const raw = localStorage.getItem('sti_sync_signatory_session') || localStorage.getItem('sti_sync_officer_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!email && parsed.email) email = parsed.email.trim().toLowerCase();
      if (parsed.actingAsSubstitute === true && (!email || email === String(parsed.email || '').trim().toLowerCase())) {
        actingAsSubstitute = true;
        if (!delegatedForSignatoryId) {
          delegatedForSignatoryId = parsed.delegatedForSignatoryId || parsed.id || '';
        }
      }
      if (!docId && !actingAsSubstitute && (parsed.id || parsed.uid)) {
        docId = parsed.id || parsed.uid;
      }
    }
  } catch (e) {
    console.warn('[SignatoryService] Session fallback notice:', e);
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

  if (actingAsSubstitute) {
    // ── SUBSTITUTE ISOLATED PATH: Never overwrite the Primary Signatory's top-level signatureUrl ──
    const subDocIdsToUpdate = new Set<string>();
    if (delegatedForSignatoryId) subDocIdsToUpdate.add(delegatedForSignatoryId);

    if (email) {
      try {
        const subSnap = await getDocsQuotaSafe(
          query(collection(db, SIGNATORIES_COLLECTION), where('substituteEmail', '==', email))
        );
        subSnap.docs.forEach((d) => subDocIdsToUpdate.add(d.id));
      } catch (e) {
        console.warn('[SignatoryService] Substitute email query warning:', e);
      }
    }

    for (const targetPrimaryId of subDocIdsToUpdate) {
      try {
        const primaryRef = doc(db, SIGNATORIES_COLLECTION, targetPrimaryId);
        const primarySnap = await getDocQuotaSafe(primaryRef);
        const existingSub = primarySnap.exists() ? primarySnap.data()?.substitute || {} : {};
        await setDoc(
          primaryRef,
          {
            substitute: {
              ...existingSub,
              signatureUrl: dataUrl,
              signatureDataUrl: dataUrl,
              signatureUpdatedAt: new Date().toISOString(),
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        savedCount++;
      } catch (subErr: any) {
        console.warn('[SignatoryService] Substitute doc save warning:', subErr);
        lastError = subErr;
      }
    }

    // If the substitute ALSO holds their own primary signatory or adviser profile, keep those synced too
    if (email) {
      try {
        const ownSigSnap = await getDocsQuotaSafe(
          query(collection(db, SIGNATORIES_COLLECTION), where('email', '==', email))
        );
        for (const d of ownSigSnap.docs) {
          await setDoc(
            doc(db, SIGNATORIES_COLLECTION, d.id),
            {
              signatureUrl: dataUrl,
              signatureDataUrl: dataUrl,
              hasSignature: true,
              signatureUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          savedCount++;
        }
      } catch {}

      try {
        const ownAdvSnap = await getDocsQuotaSafe(
          query(collection(db, 'organization_advisers'), where('email', '==', email))
        );
        for (const d of ownAdvSnap.docs) {
          await setDoc(
            doc(db, 'organization_advisers', d.id),
            {
              signatureUrl: dataUrl,
              signatureDataUrl: dataUrl,
              signatureUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch {}
    }
  } else {
    // ── PRIMARY SIGNATORY PATH ──
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
        const emailSnap = await getDocsQuotaSafe(qEmail);
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
  }

  // 5. Update localStorage sessions immediately (only when email matches or no email constraint)
  try {
    const rawSig = localStorage.getItem('sti_sync_signatory_session');
    if (rawSig) {
      const parsed = JSON.parse(rawSig);
      if (!email || !parsed.email || String(parsed.email).trim().toLowerCase() === email) {
        parsed.signatureUrl = dataUrl;
        parsed.signatureDataUrl = dataUrl;
        parsed.hasSignature = true;
        localStorage.setItem('sti_sync_signatory_session', JSON.stringify(parsed));
      }
    }
    const rawOff = localStorage.getItem('sti_sync_officer_session');
    if (rawOff) {
      const parsedOff = JSON.parse(rawOff);
      if (!email || !parsedOff.email || String(parsedOff.email).trim().toLowerCase() === email) {
        parsedOff.signatureUrl = dataUrl;
        parsedOff.signatureDataUrl = dataUrl;
        localStorage.setItem('sti_sync_officer_session', JSON.stringify(parsedOff));
      }
    }
  } catch {}

  // 6. Save audit record in institutional_signatures collection
  try {
    await addDoc(collection(db, 'institutional_signatures'), {
      signatoryId: actingAsSubstitute ? (delegatedForSignatoryId || docId || '') : (docId || ''),
      signatoryEmail: email || '',
      actingAsSubstitute: Boolean(actingAsSubstitute),
      signatureDataUrl: dataUrl,
      createdAt: serverTimestamp(),
    });
  } catch (auditErr) {
    console.warn('[SignatoryService] Signature audit log warning:', auditErr);
  }

  // 7. Non-blocking background upload to Firebase Storage (only for Primary; Substitute keeps base64 in substitute.signatureUrl safely)
  if (imageBlob && !actingAsSubstitute) {
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
 * Assign or replace a Substitute Signatory for an Institutional Signatory.
 * - Reuses existing Firebase Auth account & e-signature if the employee already has one in STI Sync.
 * - Provisions a new Firebase Auth account + temporary password only if the employee is brand new.
 */
export async function assignSignatorySubstitute(
  signatoryId: string,
  employeePayload: {
    name: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    middleInitial?: string;
    email: string;
    employeeId?: string;
    department?: string;
    departmentId?: string;
    title?: string;
    temporaryPassword?: string;
  },
  actor: { uid?: string; name?: string; role: 'signatory' | 'admin' }
): Promise<{
  success: boolean;
  substitute?: SignatorySubstituteConfig;
  accountProvisioning?: 'created' | 'reused';
  reusedSignature?: boolean;
  temporaryPassword?: string;
  error?: string;
}> {
  const cleanEmail = (employeePayload.email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'Selected employee must have a valid institutional email address.' };
  }

  let createdAuthUid = '';
  let generatedTempPassword = '';

  try {
    const primaryRef = doc(db, SIGNATORIES_COLLECTION, signatoryId);
    const primarySnap = await getDocQuotaSafe(primaryRef);
    if (!primarySnap.exists()) {
      return { success: false, error: 'Primary signatory record not found.' };
    }
    const primaryData = primarySnap.data();
    const primaryEmail = String(primaryData.email || '').trim().toLowerCase();
    const primaryName = formatPersonName(primaryData, primaryData.name || 'Institutional Signatory');

    if (cleanEmail === primaryEmail) {
      return { success: false, error: 'A signatory cannot assign themselves as their own substitute.' };
    }

    // Block assigning an active SAS Admin as a Substitute Signatory
    try {
      const sasSnap = await getDocsQuotaSafe(
        query(collection(db, 'sas_admins'), where('email', '==', cleanEmail))
      );
      if (sasSnap.docs.some((d) => d.data()?.isActive !== false)) {
        return {
          success: false,
          error: 'SAS Admin accounts cannot be assigned as a Substitute Signatory. Please choose another employee.',
        };
      }
    } catch {}

    // 1. Check if this employee already has an active account in STI Sync
    let existingAuthUid = '';
    let existingUid = '';
    let accountAlreadyExists = false;

    for (const colName of [SIGNATORIES_COLLECTION, 'organization_advisers', 'organization_officers']) {
      try {
        const matchSnap = await getDocsQuotaSafe(
          query(collection(db, colName), where('email', '==', cleanEmail))
        );
        const activeMatch = matchSnap.docs.find((d) => d.data()?.isActive !== false);
        if (activeMatch) {
          const d = activeMatch.data();
          accountAlreadyExists = true;
          existingAuthUid = existingAuthUid || d.authUid || d.uid || '';
          existingUid = existingUid || d.uid || activeMatch.id;
        }
      } catch {}
    }

    // Also check if already assigned as a substitute elsewhere (reuse existing authUid)
    if (!accountAlreadyExists) {
      try {
        const existingSubSnap = await getDocsQuotaSafe(
          query(collection(db, SIGNATORIES_COLLECTION), where('substituteEmail', '==', cleanEmail))
        );
        const matchWithAuth = existingSubSnap.docs.find((d) => d.data()?.substituteAuthUid || d.data()?.substitute?.authUid);
        if (matchWithAuth) {
          const sub = matchWithAuth.data()?.substitute;
          accountAlreadyExists = true;
          existingAuthUid = matchWithAuth.data()?.substituteAuthUid || sub?.authUid || '';
          existingUid = sub?.uid || existingAuthUid;
        }
      } catch {}
    }

    // 2. Provision new Firebase Auth user ONLY if no account exists yet
    let accountProvisioning: 'created' | 'reused' = accountAlreadyExists ? 'reused' : 'created';
    if (!accountAlreadyExists) {
      generatedTempPassword = (employeePayload.temporaryPassword || '').trim() || generateTemporaryPassword();
      try {
        createdAuthUid = await createSecondaryAuthUser(cleanEmail, generatedTempPassword);
        existingAuthUid = createdAuthUid;
        existingUid = createdAuthUid;
        accountProvisioning = 'created';
      } catch (authErr: any) {
        const errMsg = String(authErr?.message || '').toLowerCase();
        const errCode = String(authErr?.code || '');
        if (errCode === 'auth/email-already-in-use' || errMsg.includes('already has a firebase account') || errMsg.includes('email-already-in-use')) {
          accountProvisioning = 'reused';
          generatedTempPassword = '';
        } else {
          throw new Error(authErr?.message || 'Failed to provision Firebase Auth account for substitute signatory.');
        }
      }
    }

    // 3. Auto-detect & reuse any existing verified e-signature for this employee across STI Sync
    let resolvedSig = '';
    try {
      const { resolveUserSignature } = await import('./signatory-resolver.service');
      resolvedSig = await resolveUserSignature({
        uid: existingAuthUid || existingUid || undefined,
        email: cleanEmail,
        name: formatPersonName(employeePayload, employeePayload.name),
      });
    } catch (sigErr) {
      console.warn('[SignatoryService] Substitute signature lookup notice:', sigErr);
    }

    const structuredNames = structuredNameFields(employeePayload);
    const substituteConfig: SignatorySubstituteConfig = {
      uid: existingUid || existingAuthUid || cleanEmail,
      authUid: existingAuthUid || undefined,
      employeeId: (employeePayload.employeeId || '').trim() || undefined,
      ...structuredNames,
      name: formatPersonName(structuredNames, employeePayload.name),
      email: cleanEmail,
      department: (employeePayload.department || '').trim() || '',
      departmentId: employeePayload.departmentId || '',
      title: (employeePayload.title || '').trim() || '',
      signatureUrl: resolvedSig || null,
      signatureDataUrl: resolvedSig || null,
      accountProvisioning,
      requiresPasswordChange: accountProvisioning === 'created',
      tempPass: accountProvisioning === 'created' ? generatedTempPassword : null,
      assignedAt: new Date().toISOString(),
      assignedByUid: actor.uid || '',
      assignedByName: actor.name || (actor.role === 'admin' ? 'SAS Administrator' : primaryName),
      assignedByRole: actor.role,
    };

    // Strip undefined fields before Firestore write
    const cleanSub: any = {};
    Object.entries(substituteConfig).forEach(([k, v]) => {
      if (v !== undefined) cleanSub[k] = v;
    });

    await updateDoc(primaryRef, {
      substitute: cleanSub,
      substituteEmail: cleanEmail,
      substituteAuthUid: existingAuthUid || null,
      substituteEmployeeId: (employeePayload.employeeId || '').trim() || null,
      updatedAt: serverTimestamp(),
    });

    // 4. Send credentials email in background if a brand-new account was provisioned
    if (accountProvisioning === 'created' && generatedTempPassword) {
      sendSignatoryWelcomeCredentialsEmail({
        to: cleanEmail,
        signatoryName: substituteConfig.name,
        roleName: `Substitute Signatory (for ${primaryName})`,
        positionTitle: `Acting ${primaryData.roleTitle || primaryData.role || 'Signatory'}`,
        department: primaryData.department || employeePayload.department || '',
        temporaryPassword: generatedTempPassword,
      }).catch((emailErr) => {
        console.warn('[SignatoryService] Substitute welcome email warning:', emailErr);
      });
    }

    // 5. Notify the assigned Substitute in-app
    const recipientTokens = [existingAuthUid, existingUid, cleanEmail, employeePayload.employeeId]
      .filter((t): t is string => Boolean(t && String(t).trim()));
    if (recipientTokens.length > 0) {
      createNotification({
        recipientRole: 'signatory',
        recipientId: recipientTokens[0],
        recipientIds: [...new Set(recipientTokens)],
        type: 'info',
        category: 'system',
        title: 'Designated as Substitute Signatory',
        message: `You have been designated as Substitute Signatory for ${primaryName} (${primaryData.roleTitle || 'Institutional Signatory'}). You will be able to access their pending approvals whenever their portal is deactivated (On Leave).`,
        resourceId: signatoryId,
        resourceType: 'signatory',
        actionRoute: '/signatory/dashboard',
        actorName: actor.name || primaryName,
      }).catch(() => {});
    }

    return {
      success: true,
      substitute: substituteConfig,
      accountProvisioning,
      reusedSignature: Boolean(resolvedSig),
      temporaryPassword: generatedTempPassword || undefined,
    };
  } catch (err: any) {
    if (createdAuthUid && generatedTempPassword) {
      try {
        await rollbackSecondaryAuthUser(cleanEmail, generatedTempPassword, createdAuthUid);
      } catch {}
    }
    console.error('[SignatoryService] Failed to assign substitute signatory:', err);
    return {
      success: false,
      error: err?.message || 'Failed to assign substitute signatory.',
    };
  }
}

/**
 * Remove the assigned Substitute Signatory from an Institutional Signatory.
 * Blocked if the Primary Signatory's portal is currently deactivated AND has pending documents.
 */
export async function removeSignatorySubstitute(
  signatoryId: string
): Promise<{ success: boolean; error?: string; pendingDocuments?: PendingDocumentInfo[] }> {
  try {
    const primaryRef = doc(db, SIGNATORIES_COLLECTION, signatoryId);
    const primarySnap = await getDocQuotaSafe(primaryRef);
    if (!primarySnap.exists()) {
      return { success: false, error: 'Signatory record not found.' };
    }
    const primaryData = primarySnap.data();
    const isDeactivated = primaryData.portalDeactivated === true;

    if (isDeactivated) {
      const pendingDocuments = await getSignatoryPendingDocuments(signatoryId, primaryData.email);
      const check = validateRemoveSignatorySubstitute({
        portalDeactivated: true,
        pendingDocuments,
      });
      if (!check.allowed) {
        return { success: false, error: check.reason || undefined, pendingDocuments };
      }
    }

    await updateDoc(primaryRef, {
      substitute: null,
      substituteEmail: null,
      substituteAuthUid: null,
      substituteEmployeeId: null,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err: any) {
    console.error('[SignatoryService] Failed to remove substitute signatory:', err);
    return { success: false, error: err?.message || 'Failed to remove substitute signatory.' };
  }
}

/**
 * Deactivate (On Leave) or Reactivate an Institutional Signatory's portal.
 * Enforces the strict guardrail: cannot deactivate if there are pending documents to approve
 * AND no Substitute Signatory is assigned.
 */
export async function setSignatoryPortalDeactivation(
  signatoryId: string,
  options: {
    deactivated: boolean;
    reason?: string;
    until?: string;
  },
  actor: { uid?: string; name?: string; role: 'signatory' | 'admin' }
): Promise<{
  success: boolean;
  blocked?: boolean;
  error?: string;
  pendingDocuments?: PendingDocumentInfo[];
}> {
  try {
    const primaryRef = doc(db, SIGNATORIES_COLLECTION, signatoryId);
    const primarySnap = await getDocQuotaSafe(primaryRef);
    if (!primarySnap.exists()) {
      return { success: false, error: 'Signatory record not found.' };
    }
    const primaryData = primarySnap.data();
    const primaryName = formatPersonName(primaryData, primaryData.name || 'Institutional Signatory');
    const sub = primaryData.substitute;
    const hasSubstitute = Boolean(sub && (sub.email || sub.authUid || sub.uid));

    if (options.deactivated) {
      const pendingDocuments = await getSignatoryPendingDocuments(signatoryId, primaryData.email);
      const validation = validateSignatoryPortalDeactivation({
        hasSubstitute,
        pendingDocuments,
      });
      if (!validation.allowed) {
        return {
          success: false,
          blocked: true,
          error: validation.reason || 'Cannot deactivate portal while pending documents exist without a substitute.',
          pendingDocuments,
        };
      }
    }

    await updateDoc(primaryRef, {
      portalDeactivated: Boolean(options.deactivated),
      portalDeactivatedReason: options.deactivated ? (options.reason?.trim() || 'On Leave') : null,
      portalDeactivatedUntil: options.deactivated ? (options.until?.trim() || null) : null,
      portalDeactivatedAt: options.deactivated ? serverTimestamp() : null,
      portalDeactivatedBy: options.deactivated ? (actor.name || actor.uid || actor.role) : null,
      updatedAt: serverTimestamp(),
    });

    // Notify Substitute when leave starts or ends
    if (hasSubstitute) {
      const recipientTokens = [sub.authUid, sub.uid, sub.email, sub.employeeId]
        .filter((t): t is string => Boolean(t && String(t).trim()));
      if (recipientTokens.length > 0) {
        createNotification({
          recipientRole: 'signatory',
          recipientId: recipientTokens[0],
          recipientIds: [...new Set(recipientTokens)],
          type: options.deactivated ? 'warning' : 'info',
          category: 'system',
          title: options.deactivated
            ? `Acting Signatory Access Enabled (${primaryName})`
            : `Primary Signatory Returned (${primaryName})`,
          message: options.deactivated
            ? `${primaryName} has deactivated their Signatory Portal (${options.reason?.trim() || 'On Leave'}). You can now sign in and approve their pending documents as Acting ${primaryData.roleTitle || 'Signatory'}.`
            : `${primaryName} has reactivated their Signatory Portal. Delegated Acting Signatory access has been paused.`,
          resourceId: signatoryId,
          resourceType: 'signatory',
          actionRoute: '/signatory/dashboard',
          actorName: actor.name || primaryName,
        }).catch(() => {});
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[SignatoryService] Failed to update portal deactivation status:', err);
    return { success: false, error: err?.message || 'Failed to update portal availability.' };
  }
}

/**
 * Auto-fetch an employee's existing institutional email across STI Sync collections
 * (employee record, institutional_signatories, substitute slots, organization_advisers,
 * and embedded organization advisers/co-advisers) by employeeId or normalized name.
 */
export async function resolveExistingEmployeeEmail(employee: {
  employeeId?: string;
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
}): Promise<{ email: string; source?: string } | null> {
  const directEmail = String(employee.email || '').trim().toLowerCase();
  if (directEmail && directEmail.includes('@')) {
    return { email: directEmail, source: 'Employee Masterlist' };
  }

  const empId = String(employee.employeeId || '').trim();
  const normName = (v?: string) =>
    String(v || '')
      .toLowerCase()
      .replace(/\b(engr|atty|dr|mr|ms|mrs|prof)\.?\s+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const targetNames = new Set(
    [
      normName(employee.fullName),
      normName([employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ')),
      normName([employee.firstName, employee.lastName].filter(Boolean).join(' ')),
    ].filter(Boolean)
  );

  const nameMatches = (record: any) => {
    if (!record || targetNames.size === 0) return false;
    const candidates = [
      normName(record.name),
      normName(record.fullName),
      normName(record.displayName),
      normName([record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ')),
      normName([record.firstName, record.lastName].filter(Boolean).join(' ')),
    ].filter(Boolean);
    return candidates.some((c) => targetNames.has(c));
  };

  // 1. Direct employeeId lookups first (fastest)
  if (empId) {
    try {
      const [sigById, subById, advById] = await Promise.all([
        getDocsQuotaSafe(query(collection(db, SIGNATORIES_COLLECTION), where('employeeId', '==', empId))),
        getDocsQuotaSafe(query(collection(db, SIGNATORIES_COLLECTION), where('substituteEmployeeId', '==', empId))),
        getDocsQuotaSafe(query(collection(db, 'organization_advisers'), where('employeeId', '==', empId))),
      ]);
      for (const d of sigById.docs) {
        const em = String(d.data()?.email || '').trim().toLowerCase();
        if (em.includes('@')) return { email: em, source: 'Institutional Signatory' };
      }
      for (const d of subById.docs) {
        const em = String(d.data()?.substituteEmail || d.data()?.substitute?.email || '').trim().toLowerCase();
        if (em.includes('@')) return { email: em, source: 'Substitute Signatory' };
      }
      for (const d of advById.docs) {
        const em = String(d.data()?.email || '').trim().toLowerCase();
        if (em.includes('@')) return { email: em, source: 'Club Adviser' };
      }
    } catch {}
  }

  // 2. Normalized name fallback across signatories, advisers, and organizations
  if (targetNames.size > 0) {
    try {
      const [sigSnap, advSnap, orgSnap] = await Promise.all([
        getDocsQuotaSafe(collection(db, SIGNATORIES_COLLECTION)),
        getDocsQuotaSafe(collection(db, 'organization_advisers')),
        getDocsQuotaSafe(collection(db, 'organizations')),
      ]);

      for (const d of sigSnap.docs) {
        const data = d.data();
        if (nameMatches(data) && String(data.email || '').includes('@')) {
          return { email: String(data.email).trim().toLowerCase(), source: 'Institutional Signatory' };
        }
        if (data.substitute && nameMatches(data.substitute) && String(data.substitute.email || '').includes('@')) {
          return { email: String(data.substitute.email).trim().toLowerCase(), source: 'Substitute Signatory' };
        }
      }

      for (const d of advSnap.docs) {
        const data = d.data();
        if (data.isActive !== false && nameMatches(data) && String(data.email || '').includes('@')) {
          return { email: String(data.email).trim().toLowerCase(), source: 'Club Adviser' };
        }
      }

      for (const d of orgSnap.docs) {
        const data = d.data();
        if (data.adviser && nameMatches(data.adviser) && String(data.adviser.email || '').includes('@')) {
          return { email: String(data.adviser.email).trim().toLowerCase(), source: 'Club Adviser' };
        }
        if (data.coAdviser && nameMatches(data.coAdviser) && String(data.coAdviser.email || '').includes('@')) {
          return { email: String(data.coAdviser.email).trim().toLowerCase(), source: 'Club Co-Adviser' };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Lightweight check for whether an email already belongs to an existing STI Sync account.
 */
export async function checkEmailHasExistingPortalAccount(
  email: string
): Promise<{ exists: boolean; source?: string }> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return { exists: false };

  try {
    const [sigSnap, subSnap, advSnap, offSnap] = await Promise.all([
      getDocsQuotaSafe(query(collection(db, SIGNATORIES_COLLECTION), where('email', '==', cleanEmail))),
      getDocsQuotaSafe(query(collection(db, SIGNATORIES_COLLECTION), where('substituteEmail', '==', cleanEmail))),
      getDocsQuotaSafe(query(collection(db, 'organization_advisers'), where('email', '==', cleanEmail))),
      getDocsQuotaSafe(query(collection(db, 'organization_officers'), where('email', '==', cleanEmail))),
    ]);

    if (sigSnap.docs.some((d) => d.data()?.isActive !== false)) {
      return { exists: true, source: 'Institutional Signatory' };
    }
    if (subSnap.docs.some((d) => d.data()?.substituteAuthUid || d.data()?.substitute?.authUid)) {
      return { exists: true, source: 'Substitute Signatory' };
    }
    if (advSnap.docs.some((d) => d.data()?.isActive !== false)) {
      return { exists: true, source: 'Club Adviser' };
    }
    if (offSnap.docs.some((d) => d.data()?.isActive !== false)) {
      return { exists: true, source: 'Organization Officer' };
    }
  } catch {}

  return { exists: false };
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
