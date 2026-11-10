import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteField,
  writeBatch,
} from 'firebase/firestore';
import { db, createSecondaryAuthUser, rollbackSecondaryAuthUser } from '../../../../services/firebase';
import { generateTemporaryPassword } from '../../accounts/services/temporary-password.mjs';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { sendAdviserWelcomeCredentialsEmail } from '../../../../services/email.service';
import type { CreateOrganizationPayload, OrgAdviserData } from '../types/organization.types';
import { structuredNameFields } from '../../../utils/name.utils';
import {
  ADVISER_NAME_REVIEW_REQUIRED, adviserNameVerification, collectAdviserIdentities,
  inspectAdviserIdentity, isAdviserNameVerified, type AdviserIdentity, type AdviserNameVerification,
} from '../utils/adviser-identity.utils';
import { readAdviserIdentities } from './adviser-identity.service';
import { checkAdviserAccount } from './adviser-account.service';

const COLLECTION = 'organizations';

export interface AdviserUpdateOptions {
  action: 'keep' | 'assign' | 'unassign';
  currentAdviser?: OrgAdviserData | null;
  newAdviser?: {
    name: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    middleInitial?: string;
    email: string;
    employeeId?: string;
    departmentId?: string;
    temporaryPassword?: string;
    nameVerification?: AdviserNameVerification;
    existingAccountUid?: string;
  };
  adminUser?: string;
  sendEmailNotice?: boolean;
}

/** Recheck before provisioning credentials or revoking the currently assigned adviser. */
async function verifyNewAdviser(candidate: AdviserIdentity & { nameVerification?: AdviserNameVerification }, reviewer: string, excludeOrgId?: string) {
  const fresh = await readAdviserIdentities();
  const existing = collectAdviserIdentities(fresh.records, fresh.organizations, excludeOrgId);
  const result = inspectAdviserIdentity(candidate, existing);
  if (result.emailError || result.employeeIdError) throw new Error(result.emailError || result.employeeIdError);
  const account = await checkAdviserAccount(candidate.email || '');
  if (candidate.existingAccountUid) {
    if (!account.exists || !account.eligible || account.uid !== candidate.existingAccountUid) throw new Error(account.reason || 'The selected account no longer matches this person. Check the adviser details again.');
    return { account, nameVerification: undefined };
  }
  if (account.exists) throw new Error(account.reason || 'This email already has an account. Use this person instead of creating another account.');
  if (!isAdviserNameVerified(candidate, result.matches, candidate.nameVerification)) throw new Error(ADVISER_NAME_REVIEW_REQUIRED);
  return { account, nameVerification: result.matches.length ? { ...adviserNameVerification(candidate, result.matches), verifiedBy: reviewer, verifiedAt: serverTimestamp() } : undefined };
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

  if (action === 'assign' && (!newAdviser?.name?.trim() || !newAdviser?.email?.trim())) {
    throw new Error('Enter the new adviser name and email.');
  }
  const cleanEmail = newAdviser?.email.trim().toLowerCase() || '';
  const tempPassword = newAdviser?.temporaryPassword || generateTemporaryPassword();
  let authUid = '';
  let createdAuthUid = '';
  let adviser: OrgAdviserData | null = null;
  try {
    // Provision before revoking the current adviser. A duplicate/failed account
    // creation must leave the existing adviser able to use the organization.
    if (action === 'assign' && newAdviser) {
      const { account, nameVerification } = await verifyNewAdviser(newAdviser, adminUser, orgId);
      authUid = account.exists ? account.uid! : await createSecondaryAuthUser(cleanEmail, tempPassword);
      if (!account.exists) createdAuthUid = authUid;
      adviser = {
        authUid, ...structuredNameFields(newAdviser),
        ...(nameVerification ? { nameVerification } : {}),
        email: cleanEmail, employeeId: newAdviser.employeeId?.trim() || '',
        departmentId: newAdviser.departmentId || '', title: 'Club Adviser',
        ...(account.exists ? { tempPass: null, requiresPasswordChange: false } : { temporaryPassword: tempPassword, tempPass: tempPassword, requiresPasswordChange: true }),
        accountProvisioning: account.exists ? 'reused' : 'created', resetInProgress: false,
      };
    }
    const current = await getDocs(query(collection(db, 'organization_advisers'), where('organizationId', '==', orgId)));
    const batch = writeBatch(db);
    for (const item of current.docs) {
      if (item.data().isActive === false) continue;
      batch.update(item.ref, {
        isActive: false, status: 'revoked', revokedAt: serverTimestamp(),
        revokedBy: adminUser, revocationReason: action === 'assign' ? `Replaced by new adviser: ${adviser?.name}` : 'Unassigned by administrator',
        updatedAt: serverTimestamp(),
      });
    }
    if (adviser) batch.set(doc(collection(db, 'organization_advisers')), {
      ...adviser, organizationId: orgId, organizationName: orgName,
      isActive: true, createdBy: adminUser, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, COLLECTION, orgId), { adviser: adviser || deleteField(), updatedAt: serverTimestamp() });
    await batch.commit();
  } catch (error) {
    if (createdAuthUid) {
      try { await rollbackSecondaryAuthUser(cleanEmail, tempPassword, createdAuthUid); }
      catch { console.warn('Could not roll back newly provisioned adviser. Account repair may be needed.'); }
    }
    throw error;
  }
  if (adviser && sendEmailNotice) {
    void sendAdviserWelcomeCredentialsEmail({
      to: cleanEmail, adviserName: adviser.name, orgName,
      employeeId: adviser.employeeId || '', temporaryPassword: adviser.accountProvisioning === 'reused' ? undefined : tempPassword, existingAccount: adviser.accountProvisioning === 'reused',
    }).catch(() => console.warn('Adviser created, but welcome email delivery failed.'));
  }
  return adviser;
};

export const createOrganization = async (
  payload: CreateOrganizationPayload,
  createdBy: string,
  logoFile?: File | null
): Promise<string> => {
  const adviserProfile = payload.adviser ? { ...payload.adviser, ...structuredNameFields(payload.adviser) } : undefined;
  let existingAuthUid = '';
  if (adviserProfile?.name && adviserProfile.email) {
    const { account, nameVerification } = await verifyNewAdviser(adviserProfile, createdBy);
    existingAuthUid = account.exists ? account.uid! : '';
    delete adviserProfile.existingAccountUid;
    adviserProfile.accountProvisioning = account.exists ? 'reused' : 'created';
    delete adviserProfile.nameVerification;
    if (nameVerification) adviserProfile.nameVerification = nameVerification;
  }
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

  let createdAdviserUid = '';
  const adviserPassword = payload.adviser?.temporaryPassword || generateTemporaryPassword();
  try {
    if (adviserProfile?.name && adviserProfile.email) {
      if (!existingAuthUid) createdAdviserUid = await createSecondaryAuthUser(adviserProfile.email, adviserPassword);
    }
    const docRef = doc(collection(db, COLLECTION));
    const batch = writeBatch(db);
    batch.set(docRef, {
      ...normalizedPayload,
      ...(adviserProfile?.email ? { adviser: { ...adviserProfile, email: adviserProfile.email.trim().toLowerCase(), authUid: existingAuthUid || createdAdviserUid, ...(existingAuthUid ? { tempPass: null, requiresPasswordChange: false, temporaryPassword: '' } : { tempPass: adviserPassword, requiresPasswordChange: true }), resetInProgress: false } } : {}),
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

    const orgId = docRef.id;

    // ── Create Real Firebase Auth Account & Document for Club Adviser ──
    if (payload.adviser && payload.adviser.name && payload.adviser.email) {
      const authUid = existingAuthUid || createdAdviserUid;

        batch.set(doc(collection(db, 'organization_advisers')), {
          authUid,
          organizationId: orgId,
          organizationName: payload.name,
          ...structuredNameFields(payload.adviser),
          ...(adviserProfile?.nameVerification ? { nameVerification: adviserProfile.nameVerification } : {}),
          email: payload.adviser.email.trim().toLowerCase(),
          employeeId: (payload.adviser.employeeId || '').trim(),
          departmentId: payload.adviser.departmentId || '',
          title: payload.adviser.title || 'Club Adviser',
          ...(existingAuthUid ? { tempPass: null } : { temporaryPassword: adviserPassword, tempPass: adviserPassword }),
          accountProvisioning: existingAuthUid ? 'reused' : 'created',
          resetInProgress: false,
          requiresPasswordChange: !existingAuthUid,
          isActive: true,
          createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
    }

    await batch.commit();
    return orgId;
  } catch (error: any) {
    if (createdAdviserUid && payload.adviser?.email) {
      try { await rollbackSecondaryAuthUser(payload.adviser.email, adviserPassword, createdAdviserUid); }
      catch { console.warn('Could not roll back newly provisioned adviser. Account repair may be needed.'); }
    }
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
