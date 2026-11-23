import {
  collection,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  limit,
  deleteField,
  writeBatch,
} from 'firebase/firestore';
import { db, createSecondaryAuthUser, rollbackSecondaryAuthUser } from '../../../../services/firebase';
import { generateTemporaryPassword } from '../../accounts/services/temporary-password.mjs';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { sendAdviserWelcomeCredentialsEmail } from '../../../../services/email.service';
import { createNotification } from '../../notifications';
import type { CreateOrganizationPayload, OrgAdviserData, OrgAutoPayableRule } from '../types/organization.types';
import { structuredNameFields } from '../../../utils/name.utils';
import {
  normalizeAdviserEmail,
  validateAdviserRecordsConflict,
  type OrganizationAdviserRecord,
  type SignatoryEmailRecord,
} from '../utils/adviser-validation.utils';
import { findDepartmentScopeConflicts } from '../utils/department-eligibility.utils';

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
  };
  adminUser?: string;
  sendEmailNotice?: boolean;
}

export class AdviserValidationError extends Error {
  field: 'email' | 'employeeId';
  constructor(field: 'email' | 'employeeId', message: string) {
    super(message);
    this.name = 'AdviserValidationError';
    this.field = field;
  }
}

/**
 * Lightweight Signatory-style adviser uniqueness check using indexed single-field
 * queries (`limit(5)`) instead of full-collection scans or `/api/accounts/check-adviser`.
 */
export async function validateAdviserUniqueness(params: {
  email: string;
  employeeId?: string;
  excludeOrgId?: string;
}): Promise<void> {
  const cleanEmail = normalizeAdviserEmail(params.email);
  const cleanEmpId = String(params.employeeId || '').trim();

  const queries: Promise<any>[] = [
    getDocs(query(collection(db, 'organization_advisers'), where('email', '==', cleanEmail), limit(5))),
    getDocs(query(collection(db, 'institutional_signatories'), where('email', '==', cleanEmail), limit(5))),
  ];
  if (cleanEmpId) {
    queries.push(
      getDocs(query(collection(db, 'organization_advisers'), where('employeeId', '==', cleanEmpId), limit(5)))
    );
  }

  const [adviserEmailSnap, signatoryEmailSnap, empIdSnap] = await Promise.all(queries);

  const adviserRecords: OrganizationAdviserRecord[] = [
    ...adviserEmailSnap.docs.map((d: any) => d.data() as OrganizationAdviserRecord),
    ...(empIdSnap ? empIdSnap.docs.map((d: any) => d.data() as OrganizationAdviserRecord) : []),
  ];
  const signatoryRecords: SignatoryEmailRecord[] = signatoryEmailSnap.docs.map(
    (d: any) => d.data() as SignatoryEmailRecord
  );

  const conflict = validateAdviserRecordsConflict({
    email: cleanEmail,
    employeeId: cleanEmpId,
    adviserRecords,
    signatoryRecords,
    excludeOrgId: params.excludeOrgId,
  });

  if (conflict) {
    throw new AdviserValidationError(conflict.field, conflict.message);
  }
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
      await validateAdviserUniqueness({
        email: cleanEmail,
        employeeId: newAdviser.employeeId,
        excludeOrgId: orgId,
      });
      authUid = await createSecondaryAuthUser(cleanEmail, tempPassword);
      createdAuthUid = authUid;
      adviser = {
        authUid,
        ...structuredNameFields(newAdviser),
        email: cleanEmail,
        employeeId: newAdviser.employeeId?.trim() || '',
        departmentId: newAdviser.departmentId || '',
        title: 'Club Adviser',
        temporaryPassword: tempPassword,
        tempPass: tempPassword,
        requiresPasswordChange: true,
        accountProvisioning: 'created',
        resetInProgress: false,
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
  if (adviser) {
    void createNotification({
      recipientRole: 'officer',
      recipientId: [adviser.authUid, cleanEmail, `adviser:${orgId}`].filter(Boolean).join('|'),
      targetOrgId: orgId,
      targetOrgName: orgName,
      type: 'role_assigned',
      category: 'system',
      title: 'Assigned as Club Adviser',
      message: `You have been assigned as the Club Adviser for ${orgName}. Welcome to the Organization Portal!`,
      resourceId: orgId,
      resourceType: 'system',
      actionRoute: '/officer/organization',
      senderName: adminUser,
      senderRoleTitle: 'SAS Administration',
    }).catch((err) => console.warn('Failed to dispatch adviser assignment notification:', err));
  }
  if (adviser && sendEmailNotice) {
    void sendAdviserWelcomeCredentialsEmail({
      to: cleanEmail,
      adviserName: adviser.name,
      orgName,
      employeeId: adviser.employeeId || '',
      temporaryPassword: tempPassword,
      existingAccount: false,
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
  if (adviserProfile?.name && adviserProfile.email) {
    await validateAdviserUniqueness({
      email: adviserProfile.email,
      employeeId: adviserProfile.employeeId,
    });
    delete adviserProfile.existingAccountUid;
    delete adviserProfile.nameVerification;
    adviserProfile.accountProvisioning = 'created';
  }
  // ── Logo upload → Cloudinary (app-wide upload standard; see services/cloudinary.ts) ──
  let logoUrl: string | null = null;
  if (logoFile) {
    const { secureUrl } = await uploadToCloudinary(logoFile, {
      folder: 'organizations/logos',
    });
    logoUrl = secureUrl;
  }

  const rawAllowedIds = Array.isArray(payload.allowedDepartmentIds)
    ? payload.allowedDepartmentIds.map((id) => String(id || '').trim()).filter((id) => id && id !== 'cross-departmental')
    : [];
  const rawAllowedNames = Array.isArray(payload.allowedDepartmentNames)
    ? payload.allowedDepartmentNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  const rawAllowedCodes = Array.isArray(payload.allowedDepartmentCodes)
    ? payload.allowedDepartmentCodes.map((c) => String(c || '').trim()).filter(Boolean)
    : [];

  const isCross =
    payload.isCrossDepartmental === true ||
    payload.scope === 'cross-departmental' ||
    (rawAllowedIds.length === 0 && (!payload.departmentId || payload.departmentId === 'cross-departmental'));

  const effectiveAllowedIds = isCross
    ? []
    : rawAllowedIds.length > 0
      ? rawAllowedIds
      : payload.departmentId && payload.departmentId !== 'cross-departmental'
        ? [payload.departmentId]
        : [];
  const effectiveAllowedNames = isCross
    ? []
    : rawAllowedNames.length > 0
      ? rawAllowedNames
      : payload.departmentName
        ? [payload.departmentName]
        : [];
  const effectiveAllowedCodes = isCross
    ? []
    : rawAllowedCodes.length > 0
      ? rawAllowedCodes
      : payload.departmentCode
        ? [payload.departmentCode]
        : [];

  const combinedDeptName = isCross
    ? (payload.departmentName || 'Cross-Departmental / All Students')
    : (effectiveAllowedNames.join(', ') || payload.departmentName || 'Academic Department');
  const combinedDeptCode = isCross
    ? (payload.departmentCode || 'ALL')
    : (effectiveAllowedCodes.join(', ') || payload.departmentCode || '');

  const normalizedPayload: CreateOrganizationPayload = {
    ...payload,
    departmentId: isCross ? 'cross-departmental' : (effectiveAllowedIds[0] || payload.departmentId),
    departmentName: combinedDeptName,
    departmentCode: combinedDeptCode,
    department: combinedDeptName,
    allowedDepartmentIds: effectiveAllowedIds,
    allowedDepartmentNames: effectiveAllowedNames,
    allowedDepartmentCodes: effectiveAllowedCodes,
    scope: isCross ? 'cross-departmental' : 'departmental',
    isCrossDepartmental: isCross,
  };

  let createdAdviserUid = '';
  const adviserPassword = payload.adviser?.temporaryPassword || generateTemporaryPassword();
  try {
    if (adviserProfile?.name && adviserProfile.email) {
      createdAdviserUid = await createSecondaryAuthUser(adviserProfile.email, adviserPassword);
    }
    const docRef = doc(collection(db, COLLECTION));
    const batch = writeBatch(db);
    batch.set(docRef, {
      ...normalizedPayload,
      ...(adviserProfile?.email
        ? {
            adviser: {
              ...adviserProfile,
              email: adviserProfile.email.trim().toLowerCase(),
              authUid: createdAdviserUid,
              temporaryPassword: adviserPassword,
              tempPass: adviserPassword,
              requiresPasswordChange: true,
              accountProvisioning: 'created',
              resetInProgress: false,
            },
          }
        : {}),
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
      batch.set(doc(collection(db, 'organization_advisers')), {
        authUid: createdAdviserUid,
        organizationId: orgId,
        organizationName: payload.name,
        ...structuredNameFields(payload.adviser),
        email: payload.adviser.email.trim().toLowerCase(),
        employeeId: (payload.adviser.employeeId || '').trim(),
        departmentId: payload.adviser.departmentId || '',
        title: payload.adviser.title || 'Club Adviser',
        temporaryPassword: adviserPassword,
        tempPass: adviserPassword,
        accountProvisioning: 'created',
        resetInProgress: false,
        requiresPasswordChange: true,
        isActive: true,
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    if (payload.adviser && payload.adviser.name && payload.adviser.email) {
      const cleanEmail = payload.adviser.email.trim().toLowerCase();
      void createNotification({
        recipientRole: 'officer',
        recipientId: [createdAdviserUid, cleanEmail, `adviser:${orgId}`].filter(Boolean).join('|'),
        targetOrgId: orgId,
        targetOrgName: payload.name,
        type: 'role_assigned',
        category: 'system',
        title: 'Assigned as Club Adviser',
        message: `You have been assigned as the Club Adviser for ${payload.name}. Welcome to the Organization Portal!`,
        resourceId: orgId,
        resourceType: 'system',
        actionRoute: '/officer/organization',
        senderName: createdBy || 'SAS Administration',
        senderRoleTitle: 'SAS Administration',
      }).catch((err) => console.warn('Failed to dispatch adviser assignment notification:', err));
    }

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

    if (
      payload.departmentId !== undefined ||
      payload.allowedDepartmentIds !== undefined ||
      payload.isCrossDepartmental !== undefined
    ) {
      const rawAllowedIds = Array.isArray(payload.allowedDepartmentIds)
        ? payload.allowedDepartmentIds.map((id) => String(id || '').trim()).filter((id) => id && id !== 'cross-departmental')
        : [];
      const rawAllowedNames = Array.isArray(payload.allowedDepartmentNames)
        ? payload.allowedDepartmentNames.map((n) => String(n || '').trim()).filter(Boolean)
        : [];
      const rawAllowedCodes = Array.isArray(payload.allowedDepartmentCodes)
        ? payload.allowedDepartmentCodes.map((c) => String(c || '').trim()).filter(Boolean)
        : [];

      const isCross =
        payload.isCrossDepartmental === true ||
        payload.scope === 'cross-departmental' ||
        (rawAllowedIds.length === 0 && (!payload.departmentId || payload.departmentId === 'cross-departmental'));

      const effectiveAllowedIds = isCross
        ? []
        : rawAllowedIds.length > 0
          ? rawAllowedIds
          : payload.departmentId && payload.departmentId !== 'cross-departmental'
            ? [payload.departmentId]
            : [];
      const effectiveAllowedNames = isCross
        ? []
        : rawAllowedNames.length > 0
          ? rawAllowedNames
          : payload.departmentName
            ? [payload.departmentName]
            : [];
      const effectiveAllowedCodes = isCross
        ? []
        : rawAllowedCodes.length > 0
          ? rawAllowedCodes
          : payload.departmentCode
            ? [payload.departmentCode]
            : [];

      const combinedDeptName = isCross
        ? (payload.departmentName || 'Cross-Departmental / All Students')
        : (effectiveAllowedNames.join(', ') || payload.departmentName || 'Academic Department');
      const combinedDeptCode = isCross
        ? (payload.departmentCode || 'ALL')
        : (effectiveAllowedCodes.join(', ') || payload.departmentCode || '');

      updateData.departmentId = isCross ? 'cross-departmental' : (effectiveAllowedIds[0] || payload.departmentId);
      updateData.departmentName = combinedDeptName;
      updateData.departmentCode = combinedDeptCode;
      updateData.department = combinedDeptName;
      updateData.allowedDepartmentIds = effectiveAllowedIds;
      updateData.allowedDepartmentNames = effectiveAllowedNames;
      updateData.allowedDepartmentCodes = effectiveAllowedCodes;
      updateData.scope = isCross ? 'cross-departmental' : 'departmental';
      updateData.isCrossDepartmental = isCross;

      // Enforce that narrowing Department / Audience Scope does not strand active members from excluded departments
      if (!isCross) {
        const [membersSnap, deptsSnap, coursesSnap] = await Promise.all([
          getDocs(query(collection(db, 'organization_members'), where('organizationId', '==', orgId))),
          getDocs(collection(db, 'departments')).catch(() => null),
          getDocs(collection(db, 'courses')).catch(() => null),
        ]);
        const membersList = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const deptsList = deptsSnap ? deptsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
        const coursesList = coursesSnap ? coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

        const conflictCheck = findDepartmentScopeConflicts({
          proposedOrg: {
            id: orgId,
            departmentId: updateData.departmentId,
            departmentName: updateData.departmentName,
            departmentCode: updateData.departmentCode,
            allowedDepartmentIds: updateData.allowedDepartmentIds,
            allowedDepartmentNames: updateData.allowedDepartmentNames,
            allowedDepartmentCodes: updateData.allowedDepartmentCodes,
            scope: updateData.scope,
            isCrossDepartmental: false,
          },
          members: membersList,
          departments: deptsList,
          courses: coursesList,
        });

        if (conflictCheck.hasConflicts) {
          throw new Error(
            conflictCheck.summaryMessage ||
              'Cannot restrict department scope while active members from excluded departments are still enrolled.'
          );
        }
      }
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

/**
 * Adds or updates an automatic payable rule on /organizations/{orgId}.
 * Rules marked active are automatically applied to incoming members when they join or are approved.
 */
export async function saveOrgAutoPayableRule(
  orgId: string,
  ruleInput: Omit<OrgAutoPayableRule, 'id' | 'createdAt' | 'isActive'> & { id?: string; isActive?: boolean }
): Promise<OrgAutoPayableRule> {
  if (!orgId) throw new Error('Organization ID is required.');
  const orgRef = doc(db, COLLECTION, orgId);
  const orgSnap = await getDoc(orgRef);
  if (!orgSnap.exists()) throw new Error('Organization not found.');

  const existing: OrgAutoPayableRule[] = Array.isArray(orgSnap.data()?.autoPayableRules)
    ? orgSnap.data()!.autoPayableRules
    : [];

  const normalizedLabel = ruleInput.label.trim().toLowerCase();
  const duplicateIndex = existing.findIndex(
    (r) =>
      (ruleInput.id && r.id === ruleInput.id) ||
      (r.type === ruleInput.type && r.label.trim().toLowerCase() === normalizedLabel)
  );

  const rule: OrgAutoPayableRule = {
    id: ruleInput.id || (duplicateIndex >= 0 ? existing[duplicateIndex].id : `RULE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`),
    type: ruleInput.type,
    label: ruleInput.label.trim(),
    description: ruleInput.description.trim(),
    amount: Number(ruleInput.amount) || 0,
    dueDate: ruleInput.dueDate || null,
    semesterId: ruleInput.semesterId || '',
    semester: ruleInput.semester || '',
    schoolYear: ruleInput.schoolYear || '',
    isActive: ruleInput.isActive ?? true,
    createdBy: ruleInput.createdBy,
    createdAt: duplicateIndex >= 0 ? existing[duplicateIndex].createdAt : new Date().toISOString(),
  };

  const nextRules =
    duplicateIndex >= 0
      ? existing.map((r, idx) => (idx === duplicateIndex ? rule : r))
      : [...existing, rule];

  await updateDoc(orgRef, {
    autoPayableRules: nextRules,
    updatedAt: serverTimestamp(),
  });

  return rule;
}

export async function removeOrgAutoPayableRule(orgId: string, ruleId: string): Promise<void> {
  if (!orgId || !ruleId) return;
  const orgRef = doc(db, COLLECTION, orgId);
  const orgSnap = await getDoc(orgRef);
  if (!orgSnap.exists()) return;

  const existing: OrgAutoPayableRule[] = Array.isArray(orgSnap.data()?.autoPayableRules)
    ? orgSnap.data()!.autoPayableRules
    : [];
  const nextRules = existing.filter((r) => r.id !== ruleId);

  await updateDoc(orgRef, {
    autoPayableRules: nextRules,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleOrgAutoPayableRule(orgId: string, ruleId: string, isActive: boolean): Promise<void> {
  if (!orgId || !ruleId) return;
  const orgRef = doc(db, COLLECTION, orgId);
  const orgSnap = await getDoc(orgRef);
  if (!orgSnap.exists()) return;

  const existing: OrgAutoPayableRule[] = Array.isArray(orgSnap.data()?.autoPayableRules)
    ? orgSnap.data()!.autoPayableRules
    : [];
  const nextRules = existing.map((r) => (r.id === ruleId ? { ...r, isActive } : r));

  await updateDoc(orgRef, {
    autoPayableRules: nextRules,
    updatedAt: serverTimestamp(),
  });
}
