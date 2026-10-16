import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteField,
} from 'firebase/firestore';
import { db, createSecondaryAuthUser } from '../../../../services/firebase';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { sendAdviserWelcomeCredentialsEmail } from '../../../../services/email.service';
import type { CreateOrganizationPayload, OrgAdviserData } from '../types/organization.types';

const COLLECTION = 'organizations';

export interface AdviserUpdateOptions {
  action: 'keep' | 'assign' | 'unassign';
  currentAdviser?: OrgAdviserData | null;
  newAdviser?: {
    name: string;
    email: string;
    employeeId?: string;
    departmentId?: string;
    temporaryPassword?: string;
  };
  adminUser?: string;
  sendEmailNotice?: boolean;
}

/**
 * Assigns a new adviser or unassigns an adviser, revoking access to the current adviser if one was assigned.
 * If unassigned initially, no revocation is performed.
 */
export const assignOrRevokeOrganizationAdviser = async (
  orgId: string,
  orgName: string,
  options: AdviserUpdateOptions
): Promise<OrgAdviserData | null> => {
  const {
    action,
    currentAdviser,
    newAdviser,
    adminUser = 'SAS Administrator',
    sendEmailNotice = true,
  } = options;

  if (action === 'keep') {
    return currentAdviser || null;
  }

  // ── 1. Revoke access to current adviser if one was assigned ──
  if (currentAdviser && currentAdviser.email) {
    try {
      const qAdvisers = query(
        collection(db, 'organization_advisers'),
        where('organizationId', '==', orgId)
      );
      const snap = await getDocs(qAdvisers);

      const updatePromises = snap.docs
        .filter((d) => {
          const data = d.data();
          return (
            data.isActive !== false ||
            data.email?.toLowerCase() === currentAdviser.email.toLowerCase()
          );
        })
        .map((d) =>
          updateDoc(doc(db, 'organization_advisers', d.id), {
            isActive: false,
            status: 'revoked',
            revokedAt: serverTimestamp(),
            revokedBy: adminUser,
            revocationReason:
              action === 'assign'
                ? `Replaced by new adviser: ${newAdviser?.name || 'Newly appointed adviser'}`
                : 'Unassigned by administrator in organization edit',
            updatedAt: serverTimestamp(),
          })
        );

      await Promise.all(updatePromises);
      console.info(
        `[assignOrRevokeOrganizationAdviser] Revoked ${updatePromises.length} adviser document(s) for org ${orgId}`
      );
    } catch (revokeErr) {
      console.warn(
        '[assignOrRevokeOrganizationAdviser] Could not revoke existing adviser documents:',
        revokeErr
      );
    }
  }

  // ── 2. Handle Action: 'unassign' ──
  if (action === 'unassign') {
    return null;
  }

  // ── 3. Handle Action: 'assign' ──
  if (action === 'assign' && newAdviser && newAdviser.name && newAdviser.email) {
    const cleanEmail = newAdviser.email.trim().toLowerCase();
    const cleanName = newAdviser.name.trim();
    const cleanEmployeeId = (newAdviser.employeeId || '').trim();
    const tempPassword = newAdviser.temporaryPassword || 'Adv-2026!#';

    // A. Provision Firebase Auth User if not existing
    let authUid = '';
    try {
      authUid = await createSecondaryAuthUser(cleanEmail, tempPassword);
    } catch (authErr) {
      console.warn('[assignOrRevokeOrganizationAdviser] Firebase Auth creation notice:', authErr);
    }

    // B. Create new active document in organization_advisers
    try {
      await addDoc(collection(db, 'organization_advisers'), {
        authUid,
        organizationId: orgId,
        organizationName: orgName,
        name: cleanName,
        email: cleanEmail,
        employeeId: cleanEmployeeId,
        departmentId: newAdviser.departmentId || '',
        title: 'Club Adviser',
        temporaryPassword: tempPassword,
        requiresPasswordChange: true,
        isActive: true,
        createdBy: adminUser,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (createErr) {
      console.warn(
        '[assignOrRevokeOrganizationAdviser] Could not create organization_advisers record:',
        createErr
      );
    }

    // C. Dispatch welcome credentials email asynchronously
    if (sendEmailNotice) {
      sendAdviserWelcomeCredentialsEmail({
        to: cleanEmail,
        adviserName: cleanName,
        orgName: orgName,
        employeeId: cleanEmployeeId,
        temporaryPassword: tempPassword,
      }).catch((err) => {
        console.warn('[assignOrRevokeOrganizationAdviser] Welcome email notice:', err);
      });
    }

    return {
      name: cleanName,
      email: cleanEmail,
      employeeId: cleanEmployeeId,
      departmentId: newAdviser.departmentId || '',
      title: 'Club Adviser',
      temporaryPassword: tempPassword,
      requiresPasswordChange: true,
    };
  }

  return null;
};

export const createOrganization = async (
  payload: CreateOrganizationPayload,
  createdBy: string,
  logoFile?: File | null
): Promise<string> => {
  // ── Logo upload → Cloudinary (app-wide upload standard; see services/cloudinary.ts) ──
  let logoUrl: string | null = null;
  if (logoFile) {
    const { secureUrl } = await uploadToCloudinary(logoFile, {
      folder: 'organizations/logos',
    });
    logoUrl = secureUrl;
  }

  const isCross =
    !payload.departmentId ||
    payload.departmentId === 'cross-departmental' ||
    payload.scope === 'cross-departmental' ||
    payload.isCrossDepartmental === true;

  const normalizedPayload: CreateOrganizationPayload = {
    ...payload,
    departmentId: isCross ? 'cross-departmental' : payload.departmentId,
    departmentName: isCross
      ? (payload.departmentName || 'Cross-Departmental / All Students')
      : (payload.departmentName || 'Academic Department'),
    departmentCode: isCross ? (payload.departmentCode || 'ALL') : (payload.departmentCode || ''),
    department: isCross
      ? (payload.departmentName || 'Cross-Departmental / All Students')
      : (payload.departmentName || 'Academic Department'),
    scope: isCross ? 'cross-departmental' : 'departmental',
    isCrossDepartmental: isCross,
  };

  try {
    const addPromise = addDoc(collection(db, COLLECTION), {
      ...normalizedPayload,
      logoUrl,
      status: 'active',
      memberCount: 0,
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as Omit<CreateOrganizationPayload, never> & {
      logoUrl: string | null;
      status: string;
      memberCount: number;
      createdBy: string;
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              'Firestore database write timed out. Check your network or Firestore security rules.'
            )
          ),
        15000
      );
    });

    const docRef = await Promise.race([addPromise, timeoutPromise]);
    const orgId = docRef.id;

    // ── Create Real Firebase Auth Account & Document for Club Adviser ──
    if (payload.adviser && payload.adviser.name && payload.adviser.email) {
      let authUid = '';
      const adviserPassword = payload.adviser.temporaryPassword || 'Adv-2026!#';

      try {
        authUid = await createSecondaryAuthUser(payload.adviser.email, adviserPassword);
      } catch (authErr: any) {
        console.warn('[createOrganization] Could not create Firebase Auth user for adviser:', authErr);
      }

      try {
        await addDoc(collection(db, 'organization_advisers'), {
          authUid,
          organizationId: orgId,
          organizationName: payload.name,
          name: payload.adviser.name.trim(),
          email: payload.adviser.email.trim().toLowerCase(),
          employeeId: (payload.adviser.employeeId || '').trim(),
          departmentId: payload.adviser.departmentId,
          title: payload.adviser.title || 'Club Adviser',
          temporaryPassword: adviserPassword,
          requiresPasswordChange: true,
          isActive: true,
          createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (advErr) {
        console.warn('Could not create organization_advisers document:', advErr);
      }
    }

    return orgId;
  } catch (error: any) {
    console.error('Organization creation failed:', error);
    throw new Error(`Organization creation failed: ${error.message}`);
  }
};

export const updateOrganization = async (
  orgId: string,
  payload: Partial<CreateOrganizationPayload>,
  logoFile?: File | null,
  adviserUpdate?: AdviserUpdateOptions
): Promise<void> => {
  let logoUrl: string | null | undefined = payload.logoUrl;

  if (logoFile) {
    const { secureUrl } = await uploadToCloudinary(logoFile, {
      folder: 'organizations/logos',
    });
    logoUrl = secureUrl;
  }

  try {
    const docRef = doc(db, COLLECTION, orgId);

    const updateData: any = {
      ...payload,
      updatedAt: serverTimestamp(),
    };

    if (payload.departmentId !== undefined) {
      const isCross =
        payload.departmentId === 'cross-departmental' ||
        payload.scope === 'cross-departmental' ||
        payload.isCrossDepartmental === true;

      updateData.departmentId = isCross ? 'cross-departmental' : payload.departmentId;
      updateData.departmentName = isCross
        ? (payload.departmentName || 'Cross-Departmental / All Students')
        : (payload.departmentName || 'Academic Department');
      updateData.departmentCode = isCross ? (payload.departmentCode || 'ALL') : (payload.departmentCode || '');
      updateData.department = updateData.departmentName;
      updateData.scope = isCross ? 'cross-departmental' : 'departmental';
      updateData.isCrossDepartmental = isCross;
    }

    if (logoUrl !== undefined) {
      updateData.logoUrl = logoUrl;
    }

    // ── Handle Adviser Assignment / Revocation if specified ──
    if (adviserUpdate && adviserUpdate.action !== 'keep') {
      const orgName = payload.name || 'Organization';
      const updatedAdviser = await assignOrRevokeOrganizationAdviser(
        orgId,
        orgName,
        adviserUpdate
      );

      if (adviserUpdate.action === 'assign' && updatedAdviser) {
        updateData.adviser = updatedAdviser;
      } else if (adviserUpdate.action === 'unassign') {
        updateData.adviser = deleteField();
      }
    }

    const updatePromise = updateDoc(docRef, updateData);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Firestore database write timed out.')), 15000);
    });

    await Promise.race([updatePromise, timeoutPromise]);
  } catch (error: any) {
    console.error('Organization update failed:', error);
    throw new Error(`Organization update failed: ${error.message}`);
  }
};
