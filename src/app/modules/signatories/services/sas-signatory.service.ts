/**
 * src/app/modules/signatories/services/sas-signatory.service.ts
 *
 * Dedicated service for Student Affairs & Services (SAS) Signatory Maintenance.
 * Manages the authorized SAS head/coordinator name, position title, official email,
 * and master digital e-signature stored in Firestore.
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { SIGNATORIES_COLLECTION } from './signatory.service';

export interface SasSignatoryConfig {
  name: string;
  roleTitle: string; // Position Title, e.g. "Student Affairs & Services Head" or "SAS Coordinator"
  email: string;
  department: string;
  employeeId?: string;
  signatureUrl?: string;
  signatureDataUrl?: string;
  signatureUpdatedAt?: any;
  updatedAt?: any;
  updatedByUid?: string;
  isActive?: boolean;
}

export const DEFAULT_SAS_SIGNATORY_CONFIG: SasSignatoryConfig = {
  name: 'Riselle Mae B. Lucanas',
  roleTitle: 'Student Affairs & Services Head',
  email: 'sao@ormoc.sti.edu.ph',
  department: 'Student Affairs & Services',
  employeeId: 'SAS-001',
  isActive: true,
};

const SAS_SETTINGS_DOC = 'sas_signatory';
const SETTINGS_COLLECTION = 'system_settings';

/**
 * Fetch the configured SAS Signatory details from Firestore.
 * Falls back to institutional_signatories or default config if not initialized.
 */
export async function getSasSignatoryConfig(): Promise<SasSignatoryConfig> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, SAS_SETTINGS_DOC);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      return {
        ...DEFAULT_SAS_SIGNATORY_CONFIG,
        ...data,
        name: data.name?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.name,
        roleTitle: data.roleTitle?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.roleTitle,
        email: data.email?.trim().toLowerCase() || DEFAULT_SAS_SIGNATORY_CONFIG.email,
        department: data.department?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.department,
        signatureUrl: data.signatureUrl || data.signatureDataUrl || undefined,
        signatureDataUrl: data.signatureDataUrl || data.signatureUrl || undefined,
      };
    }

    // Secondary fallback: search institutional_signatories for role 'sas_coordinator'
    const q = query(
      collection(db, SIGNATORIES_COLLECTION),
      where('role', '==', 'sas_coordinator')
    );
    const sigSnap = await getDocs(q);
    if (!sigSnap.empty) {
      const sigData = sigSnap.docs[0].data();
      return {
        ...DEFAULT_SAS_SIGNATORY_CONFIG,
        name: sigData.name?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.name,
        roleTitle: sigData.roleTitle?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.roleTitle,
        email: sigData.email?.trim().toLowerCase() || DEFAULT_SAS_SIGNATORY_CONFIG.email,
        department: sigData.department?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.department,
        signatureUrl: sigData.signatureUrl || sigData.signatureDataUrl || undefined,
        signatureDataUrl: sigData.signatureDataUrl || sigData.signatureUrl || undefined,
      };
    }
  } catch (err) {
    console.warn('[SasSignatoryService] Error reading SAS signatory config, using fallback:', err);
  }

  // Fallback to localStorage if available
  try {
    const cached = localStorage.getItem('sti_sync_sas_signatory');
    if (cached) {
      return { ...DEFAULT_SAS_SIGNATORY_CONFIG, ...JSON.parse(cached) };
    }
  } catch {}

  return DEFAULT_SAS_SIGNATORY_CONFIG;
}

/**
 * Synchronous cached getter for immediate UI hydration without async delay.
 */
export function getCachedSasSignatoryConfig(): SasSignatoryConfig {
  try {
    const cached = localStorage.getItem('sti_sync_sas_signatory');
    if (cached) {
      return { ...DEFAULT_SAS_SIGNATORY_CONFIG, ...JSON.parse(cached) };
    }
  } catch {}
  return DEFAULT_SAS_SIGNATORY_CONFIG;
}

/**
 * Real-time subscription to SAS Signatory configuration.
 */
export function subscribeToSasSignatoryConfig(
  callback: (config: SasSignatoryConfig) => void
): () => void {
  const docRef = doc(db, SETTINGS_COLLECTION, SAS_SETTINGS_DOC);

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const resolved: SasSignatoryConfig = {
          ...DEFAULT_SAS_SIGNATORY_CONFIG,
          ...data,
          name: data.name?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.name,
          roleTitle: data.roleTitle?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.roleTitle,
          email: data.email?.trim().toLowerCase() || DEFAULT_SAS_SIGNATORY_CONFIG.email,
          department: data.department?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.department,
          signatureUrl: data.signatureUrl || data.signatureDataUrl || undefined,
          signatureDataUrl: data.signatureDataUrl || data.signatureUrl || undefined,
        };
        try {
          localStorage.setItem('sti_sync_sas_signatory', JSON.stringify(resolved));
        } catch {}
        callback(resolved);
      } else {
        // Fallback to fetch or default
        getSasSignatoryConfig().then(callback);
      }
    },
    (err) => {
      console.warn('[SasSignatoryService] Real-time listener error:', err);
      getSasSignatoryConfig().then(callback);
    }
  );
}

/**
 * Save and persist the official SAS Signatory profile and e-signature.
 * Synchronizes across system_settings and institutional_signatories.
 */
export async function saveSasSignatoryConfig(
  payload: Partial<SasSignatoryConfig>,
  adminUid?: string
): Promise<{ success: boolean; config: SasSignatoryConfig }> {
  const cleanName = payload.name?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.name;
  const cleanRoleTitle = payload.roleTitle?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.roleTitle;
  const cleanEmail = payload.email?.trim().toLowerCase() || DEFAULT_SAS_SIGNATORY_CONFIG.email;
  const cleanDept = payload.department?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.department;
  const cleanEmployeeId = payload.employeeId?.trim() || DEFAULT_SAS_SIGNATORY_CONFIG.employeeId;
  const sigUrl = payload.signatureUrl || payload.signatureDataUrl || undefined;

  const docPayload: Record<string, any> = {
    name: cleanName,
    roleTitle: cleanRoleTitle,
    email: cleanEmail,
    department: cleanDept,
    employeeId: cleanEmployeeId,
    isActive: true,
    updatedAt: serverTimestamp(),
    updatedByUid: adminUid || 'admin',
  };

  if (sigUrl) {
    docPayload.signatureUrl = sigUrl;
    docPayload.signatureDataUrl = sigUrl;
    docPayload.hasSignature = true;
    docPayload.signatureUpdatedAt = serverTimestamp();
  }

  // 1. Write to system_settings/sas_signatory
  const settingsRef = doc(db, SETTINGS_COLLECTION, SAS_SETTINGS_DOC);
  await setDoc(settingsRef, docPayload, { merge: true });

  // 2. Synchronize to institutional_signatories for role 'sas_coordinator'
  try {
    const instSignatoryRef = doc(db, SIGNATORIES_COLLECTION, 'sas_coordinator');
    await setDoc(
      instSignatoryRef,
      {
        id: 'sas_coordinator',
        uid: adminUid || 'sas_coordinator',
        name: cleanName,
        email: cleanEmail,
        role: 'sas_coordinator',
        roleTitle: cleanRoleTitle,
        department: cleanDept,
        employeeId: cleanEmployeeId,
        actionType: 'endorse',
        isActive: true,
        ...(sigUrl
          ? {
              signatureUrl: sigUrl,
              signatureDataUrl: sigUrl,
              hasSignature: true,
              signatureUpdatedAt: serverTimestamp(),
            }
          : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (syncErr) {
    console.warn('[SasSignatoryService] Sync to institutional_signatories warning:', syncErr);
  }

  // 3. Cache in localStorage
  const resolvedConfig: SasSignatoryConfig = {
    name: cleanName,
    roleTitle: cleanRoleTitle,
    email: cleanEmail,
    department: cleanDept,
    employeeId: cleanEmployeeId,
    signatureUrl: sigUrl,
    signatureDataUrl: sigUrl,
    isActive: true,
  };

  try {
    localStorage.setItem('sti_sync_sas_signatory', JSON.stringify(resolvedConfig));
  } catch {}

  return { success: true, config: resolvedConfig };
}
