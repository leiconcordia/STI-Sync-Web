import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { formatPersonName } from '../../../utils/name.utils';
import { createPayable } from '../../finance/services/payable.service';
import type { OrgAutoPayableRule } from '../types/organization.types';
import type {
  AddMemberPayload,
  OrganizationMemberDocument,
  OrganizationMemberStatus,
} from '../types/member.types';
import {
  extractExcludedMemberIdentifiers,
  isActivityEndedOrCancelled,
  isClubActivity,
  isMemberCurrentlyInClub,
  isStudentSignedUpForActivity,
  normalizeMemberIdentifiers,
} from '../utils/member-removal.utils';
import {
  checkStudentDepartmentEligibility,
  isOrganizationCrossDepartmental,
  resolveCanonicalDepartment,
} from '../utils/department-eligibility.utils';
import {
  checkStudentMembershipLimits,
  normalizeMaxMembershipsPerStudent,
} from '../utils/org-type-quota.utils';
import { getOrganizationRules } from './organization_rules.service';
import { createNotification } from '../../notifications';

const COLLECTION = 'organization_members';

/**
 * Enforces BOTH the global maximum organizations per student (`system_settings/organization_rules`)
 * AND the organization type's `maxMembershipsPerStudent` quota (if configured)
 * before adding or approving a student into an organization.
 */
async function verifyStudentOrgTypeMembershipQuota(
  orgData: any,
  studentIdentifiers: { studentId?: string; authUid?: string }
): Promise<void> {
  const typeId = String(orgData?.typeId || '').trim();

  const [rulesDoc, typeSnap] = await Promise.all([
    getOrganizationRules().catch(() => null),
    typeId ? getDoc(doc(db, 'organization_types', typeId)).catch(() => null) : Promise.resolve(null),
  ]);

  const globalMax = normalizeMaxMembershipsPerStudent(rulesDoc?.maxTotalOrganizationsPerStudent);
  const orgType = typeSnap && typeSnap.exists() ? { id: typeSnap.id, ...(typeSnap.data() as any) } : null;
  const typeMax = normalizeMaxMembershipsPerStudent(orgType?.maxMembershipsPerStudent);

  // Short-circuit with 0 extra reads when both Global and Per-Type limits are unlimited
  if (globalMax === null && typeMax === null) {
    return;
  }

  const candidateStudentId = String(studentIdentifiers.studentId || '').trim();
  const candidateAuthUid = String(studentIdentifiers.authUid || '').trim();
  if (!candidateStudentId && !candidateAuthUid) return;

  const membershipDocsMap = new Map<string, { organizationId?: string; status?: string }>();
  const queryTasks: Promise<any>[] = [];

  if (candidateStudentId) {
    queryTasks.push(
      getDocs(query(collection(db, COLLECTION), where('studentId', '==', candidateStudentId)))
        .then((snap) => {
          snap.docs.forEach((d) => membershipDocsMap.set(d.id, d.data() as any));
        })
        .catch(() => null)
    );
  }
  if (candidateAuthUid) {
    queryTasks.push(
      getDocs(query(collection(db, COLLECTION), where('authUid', '==', candidateAuthUid)))
        .then((snap) => {
          snap.docs.forEach((d) => membershipDocsMap.set(d.id, d.data() as any));
        })
        .catch(() => null)
    );
  }

  const [orgsSnap] = await Promise.all([
    getDocs(collection(db, 'organizations')).catch(() => null),
    ...queryTasks,
  ]);

  const allOrganizations = orgsSnap
    ? orgsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    : [];

  const result = checkStudentMembershipLimits({
    targetOrg: orgData,
    orgType,
    maxTotalOrganizationsPerStudent: globalMax,
    allOrganizations,
    studentMemberships: Array.from(membershipDocsMap.values()),
  });

  if (!result.allowed) {
    throw new Error(
      result.reason ||
        (result.failedRule === 'global'
          ? 'Student has reached the global maximum allowed active organizations.'
          : `Student has reached the maximum allowed memberships for "${result.typeQuota.orgTypeName}" organizations.`)
    );
  }
}

interface MemberStudentHint {
  authUid?: string;
  studentSchoolId?: string;
  course?: string;
  year?: string;
  section?: string;
  department?: string;
}

/**
 * Resolves a student's canonical Firestore /students record using a targeted lookup
 * so club payables always store Firebase authUid in `studentId` (required by Mobile App)
 * alongside the 11-digit `studentSchoolId`, yearLevel, and section.
 */
async function resolveStudentForClubPayable(
  rawIdentifier: string,
  hint?: MemberStudentHint
): Promise<{
  authUid: string;
  studentSchoolId: string;
  courseCode: string;
  courseName: string;
  departmentId: string;
  departmentName: string;
  yearLevel: string;
  section: string;
  academicLevel: string;
  semester: string;
  schoolYear: string;
}> {
  const cleanId = (rawIdentifier || '').toString().trim();
  let sData: Record<string, any> | null = null;

  if (cleanId) {
    try {
      const bySchoolIdSnap = await getDocs(
        query(collection(db, 'students'), where('studentId', '==', cleanId))
      );
      if (!bySchoolIdSnap.empty) {
        sData = { id: bySchoolIdSnap.docs[0].id, ...bySchoolIdSnap.docs[0].data() };
      } else {
        const byAuthSnap = await getDocs(
          query(collection(db, 'students'), where('authUid', '==', cleanId))
        );
        if (!byAuthSnap.empty) {
          sData = { id: byAuthSnap.docs[0].id, ...byAuthSnap.docs[0].data() };
        } else {
          const directSnap = await getDoc(doc(db, 'students', cleanId));
          if (directSnap.exists()) {
            sData = { id: directSnap.id, ...directSnap.data() };
          }
        }
      }
    } catch (lookupErr) {
      console.warn('[member.service] Student lookup warning:', lookupErr);
    }
  }

  const resolvedYear = sData?.yearLevel || hint?.year || '';
  const inferredLevel =
    sData?.academicLevel ||
    (String(resolvedYear).toLowerCase().includes('grade') ? 'SHS' : 'COLLEGE');

  return {
    authUid: sData?.authUid || sData?.id || hint?.authUid || cleanId,
    studentSchoolId: sData?.studentId || hint?.studentSchoolId || cleanId,
    courseCode: sData?.courseCode || hint?.course || '',
    courseName: sData?.courseName || '',
    departmentId: sData?.departmentId || '',
    departmentName: sData?.departmentName || sData?.department || hint?.department || '',
    yearLevel: resolvedYear,
    section: sData?.section || hint?.section || '',
    academicLevel: inferredLevel,
    semester: sData?.semester || '',
    schoolYear: sData?.schoolYear || '',
  };
}

/**
 * Helper to ensure all active auto-assigned club payables (plus configured membership dues)
 * are generated for an active member the moment they enter/join or are approved into a club.
 * Resolves Firebase authUid + full Mobile /payables fields so fees immediately appear on Mobile.
 */
export async function ensureMembershipPayable(
  organizationId: string,
  studentId: string,
  studentName: string,
  paymentStatus: 'paid' | 'outstanding' = 'outstanding',
  addedBy: string = 'Officer',
  studentHint?: MemberStudentHint
): Promise<{ payableCreated: boolean; createdCount?: number; feeAmount?: number }> {
  try {
    if (!organizationId || !studentId) return { payableCreated: false };

    const [orgSnap, studentInfo, existingOrgPayablesSnap] = await Promise.all([
      getDoc(doc(db, 'organizations', organizationId)),
      resolveStudentForClubPayable(studentId, studentHint),
      getDocs(query(collection(db, 'payables'), where('organizationId', '==', organizationId))),
    ]);

    const orgData = orgSnap.exists() ? orgSnap.data() : null;
    const organizationName = orgData?.name || 'Organization';
    const orgAcronym = orgData?.acronym || organizationName;

    const identifierSet = new Set(
      [studentId, studentInfo.authUid, studentInfo.studentSchoolId, studentHint?.authUid, studentHint?.studentSchoolId]
        .filter(Boolean)
        .map((val) => String(val).trim().toLowerCase())
    );

    const existingForStudent = existingOrgPayablesSnap.docs
      .map((d) => d.data())
      .filter((data) => {
        const sid = String(data.studentId || '').trim().toLowerCase();
        const schoolId = String(data.studentSchoolId || '').trim().toLowerCase();
        return (sid && identifierSet.has(sid)) || (schoolId && identifierSet.has(schoolId));
      });

    const isAlreadyAssigned = (ruleId?: string | null, label?: string, type?: string): boolean => {
      const normLabel = String(label || '').trim().toLowerCase();
      return existingForStudent.some((data) => {
        if (ruleId && data.autoRuleId && data.autoRuleId === ruleId) return true;
        const existingLabel = String(data.label || data.title || '').trim().toLowerCase();
        if (normLabel && existingLabel && existingLabel === normLabel) return true;
        if (!ruleId && type === 'membership_due' && data.type === 'membership_due') return true;
        return false;
      });
    };

    const autoRules: OrgAutoPayableRule[] = Array.isArray(orgData?.autoPayableRules)
      ? orgData.autoPayableRules.filter((r: any) => r?.isActive !== false && Number(r?.amount) > 0)
      : [];

    const isPaid = paymentStatus === 'paid';
    let createdCount = 0;
    let totalCreatedAmount = 0;
    let coveredMembershipDue = false;

    for (const rule of autoRules) {
      if (rule.type === 'membership_due') coveredMembershipDue = true;
      if (isAlreadyAssigned(rule.id, rule.label, rule.type)) continue;

      await createPayable({
        studentId: studentInfo.authUid,
        studentName: studentName || 'Student',
        studentSchoolId: studentInfo.studentSchoolId,
        type: rule.type || 'custom',
        label: rule.label,
        title: rule.label,
        feeTitle: rule.label,
        description: rule.description || `Auto-assigned club payable for ${organizationName}`,
        organizationId,
        organizationName,
        semesterId: rule.semesterId || 'active',
        semester: rule.semester || studentInfo.semester,
        schoolYear: rule.schoolYear || studentInfo.schoolYear,
        eventId: null,
        autoRuleId: rule.id,
        assignedAmount: Number(rule.amount) || 0,
        amount: Number(rule.amount) || 0,
        paidAmount: isPaid && rule.type === 'membership_due' ? Number(rule.amount) || 0 : 0,
        status: isPaid && rule.type === 'membership_due' ? 'paid' : 'pending',
        recordedBy: isPaid && rule.type === 'membership_due' ? addedBy : null,
        paymentMethod: isPaid && rule.type === 'membership_due' ? 'cash' : null,
        dueDate: rule.dueDate ? new Date(rule.dueDate) : null,
        courseCode: studentInfo.courseCode,
        courseName: studentInfo.courseName,
        departmentId: studentInfo.departmentId,
        departmentName: studentInfo.departmentName,
        yearLevel: studentInfo.yearLevel,
        section: studentInfo.section,
        academicLevel: studentInfo.academicLevel,
        createdBy: addedBy || 'Officer Management',
      });

      createdCount++;
      totalCreatedAmount += Number(rule.amount) || 0;
    }

    // Legacy fallback: check org.membershipFee or existing membership_due template if no autoRule covered membership_due
    if (!coveredMembershipDue && !isAlreadyAssigned(null, undefined, 'membership_due')) {
      let fallbackFee = Number(orgData?.membershipFee || 0);
      let fallbackLabel = `${orgAcronym} Membership Due`;
      let fallbackDesc = `Semester membership fee for ${organizationName}`;
      let fallbackSemesterId = 'active';
      let fallbackDueDate: any = null;

      if (fallbackFee <= 0) {
        const existingDueDoc = existingOrgPayablesSnap.docs.find((d) => d.data().type === 'membership_due');
        if (existingDueDoc) {
          const sample = existingDueDoc.data();
          fallbackFee = Number(sample.assignedAmount ?? sample.amount ?? 0);
          fallbackLabel = sample.label || fallbackLabel;
          fallbackDesc = sample.description || fallbackDesc;
          fallbackSemesterId = sample.semesterId || fallbackSemesterId;
          fallbackDueDate = sample.dueDate || null;
        }
      }

      if (fallbackFee > 0) {
        await createPayable({
          studentId: studentInfo.authUid,
          studentName: studentName || 'Student',
          studentSchoolId: studentInfo.studentSchoolId,
          type: 'membership_due',
          label: fallbackLabel,
          title: fallbackLabel,
          feeTitle: fallbackLabel,
          description: fallbackDesc,
          organizationId,
          organizationName,
          semesterId: fallbackSemesterId,
          semester: studentInfo.semester,
          schoolYear: studentInfo.schoolYear,
          eventId: null,
          assignedAmount: fallbackFee,
          amount: fallbackFee,
          paidAmount: isPaid ? fallbackFee : 0,
          status: isPaid ? 'paid' : 'pending',
          recordedBy: isPaid ? addedBy : null,
          paymentMethod: isPaid ? 'cash' : null,
          dueDate: fallbackDueDate,
          courseCode: studentInfo.courseCode,
          courseName: studentInfo.courseName,
          departmentId: studentInfo.departmentId,
          departmentName: studentInfo.departmentName,
          yearLevel: studentInfo.yearLevel,
          section: studentInfo.section,
          academicLevel: studentInfo.academicLevel,
          createdBy: addedBy || 'Officer Management',
        });

        createdCount++;
        totalCreatedAmount += fallbackFee;
      }
    }

    return {
      payableCreated: createdCount > 0,
      createdCount,
      feeAmount: totalCreatedAmount > 0 ? totalCreatedAmount : undefined,
    };
  } catch (err) {
    console.warn('[member.service] Error ensuring membership payable:', err);
  }
  return { payableCreated: false };
}

export const addMember = async (payload: AddMemberPayload, addedBy: string): Promise<string> => {
  try {
    let resolvedDeptId = (payload.departmentId || '').trim();
    let resolvedDeptName = (payload.department || '').trim();

    // Strictly enforce organization department eligibility (non-cross-departmental clubs accept same-dept students only)
    if (payload.organizationId) {
      const orgRef = doc(db, 'organizations', payload.organizationId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        const orgData = { id: orgSnap.id, ...orgSnap.data() };
        const [studentInfo, deptsSnap, coursesSnap] = await Promise.all([
          resolveStudentForClubPayable(payload.studentId || payload.authUid || '', {
            authUid: payload.authUid,
            studentSchoolId: payload.studentId,
            course: payload.course,
            year: payload.year,
            section: payload.section,
            department: payload.department,
          }),
          getDocs(collection(db, 'departments')).catch(() => null),
          getDocs(collection(db, 'courses')).catch(() => null),
        ]);

        const departmentsList = deptsSnap
          ? deptsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
          : [];
        const coursesList = coursesSnap
          ? coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
          : [];

        const studentCandidate = {
          studentId: studentInfo.studentSchoolId || payload.studentId,
          authUid: studentInfo.authUid || payload.authUid,
          departmentId: studentInfo.departmentId || payload.departmentId || '',
          departmentName: studentInfo.departmentName || payload.department || '',
          department: studentInfo.departmentName || payload.department || '',
          courseCode: studentInfo.courseCode || payload.course || '',
          courseName: studentInfo.courseName || '',
        };

        const eligibility = checkStudentDepartmentEligibility(
          orgData,
          studentCandidate,
          departmentsList,
          coursesList
        );

        if (!eligibility.eligible) {
          throw new Error(
            eligibility.reason ||
              `Cannot add member: This organization is restricted to ${eligibility.orgDeptLabel} students.`
          );
        }

        const canonicalStudentDept = resolveCanonicalDepartment(
          studentCandidate,
          departmentsList,
          coursesList
        );
        if (!resolvedDeptId && canonicalStudentDept.canonicalDeptId) {
          resolvedDeptId = canonicalStudentDept.canonicalDeptId;
        }
        if (!resolvedDeptName && canonicalStudentDept.canonicalName) {
          resolvedDeptName = canonicalStudentDept.canonicalName;
        }

        // Enforce per-organization-type maximum membership limit
        await verifyStudentOrgTypeMembershipQuota(orgData, {
          studentId: studentInfo.studentSchoolId || payload.studentId,
          authUid: studentInfo.authUid || payload.authUid,
        });
      }
    }

    const addPromise = addDoc(collection(db, COLLECTION), {
      ...payload,
      ...(resolvedDeptId ? { departmentId: resolvedDeptId } : {}),
      department: resolvedDeptName || payload.department || '',
      isOfficer: false,
      addedBy,
      dateJoined: payload.status === 'active' ? serverTimestamp() : null,
      applicationDate: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore database write timed out.")), 15000);
    });
    
    const docRef = await Promise.race([addPromise, timeoutPromise]);

    // Increment memberCount on the organization document if active
    if (payload.organizationId && payload.status === 'active') {
      try {
        const orgRef = doc(db, 'organizations', payload.organizationId);
        await updateDoc(orgRef, {
          memberCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      } catch (orgErr) {
        console.warn('Could not update organization memberCount:', orgErr);
      }
    }

    return docRef.id;
  } catch (error: any) {
    console.error("Member creation failed:", error);
    throw new Error(`Member creation failed: ${error.message}`);
  }
};

export const updateMemberStatus = async (
  docId: string,
  status: OrganizationMemberStatus,
  actionByUid?: string
): Promise<void> => {
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);
  const prevData = snap.exists() ? (snap.data() as Partial<OrganizationMemberDocument>) : null;
  const prevStatus = prevData?.status;
  const orgId = prevData?.organizationId;
  const studentId = prevData?.studentId || docId;
  const studentName = prevData?.studentName || 'Student';

  const statusUpdates: Record<string, any> = {
    status,
    dateJoined:
      status === 'active' && !prevData?.dateJoined
        ? serverTimestamp()
        : prevData?.dateJoined || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Clear scheduled/completed removal metadata when restored/reactivated
  if (status === 'active') {
    statusUpdates.removedAt = null;
    statusUpdates.removedBy = null;
    statusUpdates.removalReason = null;
    statusUpdates.removalRequestedAt = null;
    statusUpdates.removalRequestedBy = null;
    statusUpdates.scheduledRemovalActivityIds = [];
    statusUpdates.scheduledRemovalActivityTitles = [];
  }

  await updateDoc(docRef, statusUpdates);

  if (orgId && prevStatus !== status) {
    const wasInClub = prevStatus ? isMemberCurrentlyInClub({ status: prevStatus }) : false;
    const isNowInClub = isMemberCurrentlyInClub({ status });

    if (wasInClub && !isNowInClub) {
      try {
        await updateDoc(doc(db, 'organizations', orgId), {
          memberCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Could not decrement organization memberCount:', err);
      }
    } else if (!wasInClub && isNowInClub) {
      try {
        await updateDoc(doc(db, 'organizations', orgId), {
          memberCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Could not increment organization memberCount:', err);
      }
    }
  }
};

/**
 * Approves a pending membership application.
 * 1. Sets status: 'active', dateJoined: now.
 * 2. Increments organization memberCount.
 * 3. Checks if the club already created a membership_due (or has configured membershipFee).
 *    If yes, automatically creates a 'membership_due' payable for this student in /payables!
 */
export const approveMemberApplication = async (
  memberDocId: string,
  approvedByUid?: string
): Promise<{ payableCreated: boolean; feeAmount?: number }> => {
  const memberRef = doc(db, COLLECTION, memberDocId);
  const memberSnap = await getDoc(memberRef);

  if (!memberSnap.exists()) {
    throw new Error('Membership record not found.');
  }

  const memberData = memberSnap.data();
  const orgId = memberData.organizationId;
  const studentId = memberData.studentId || memberDocId;
  const studentName = memberData.studentName || 'Student';

  if (orgId) {
    const orgSnap = await getDoc(doc(db, 'organizations', orgId)).catch(() => null);
    if (orgSnap && orgSnap.exists()) {
      const orgData = { id: orgSnap.id, ...orgSnap.data() };
      if (!isOrganizationCrossDepartmental(orgData)) {
        const [studentInfo, deptsSnap, coursesSnap] = await Promise.all([
          resolveStudentForClubPayable(studentId, {
            authUid: memberData.authUid,
            studentSchoolId: memberData.studentSchoolId || memberData.studentId,
            course: memberData.course,
            year: memberData.year,
            section: memberData.section,
            department: memberData.department,
          }),
          getDocs(collection(db, 'departments')).catch(() => null),
          getDocs(collection(db, 'courses')).catch(() => null),
        ]);
        const departmentsList = deptsSnap
          ? deptsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
          : [];
        const coursesList = coursesSnap
          ? coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
          : [];

        const eligibility = checkStudentDepartmentEligibility(
          orgData,
          {
            studentId: studentInfo.studentSchoolId || studentId,
            departmentId: studentInfo.departmentId || memberData.departmentId || '',
            departmentName: studentInfo.departmentName || memberData.department || '',
            department: studentInfo.departmentName || memberData.department || '',
            courseCode: studentInfo.courseCode || memberData.course || '',
            courseName: studentInfo.courseName || '',
          },
          departmentsList,
          coursesList
        );
        if (!eligibility.eligible) {
          throw new Error(
            eligibility.reason ||
              `Cannot approve applicant: This organization only accepts ${eligibility.orgDeptLabel} students.`
          );
        }
      }

      // Enforce per-organization-type maximum membership limit before activating membership
      await verifyStudentOrgTypeMembershipQuota(orgData, {
        studentId: memberData.studentSchoolId || memberData.studentId || studentId,
        authUid: memberData.authUid || '',
      });
    }
  }

  // 1. Update member status
  await updateDoc(memberRef, {
    status: 'active',
    dateJoined: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Increment organization member count
  if (orgId) {
    try {
      const orgRef = doc(db, 'organizations', orgId);
      await updateDoc(orgRef, {
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (orgErr) {
      console.warn('Error updating org member count:', orgErr);
    }
  }

  return { created: 0, skipped: 0 };
};

/**
 * Rejects a pending membership application.
 */
export const rejectMemberApplication = async (
  memberDocId: string,
  reason?: string
): Promise<void> => {
  const memberRef = doc(db, COLLECTION, memberDocId);
  await updateDoc(memberRef, {
    status: 'rejected',
    rejectionReason: reason || 'Application not accepted by organization officers.',
    updatedAt: serverTimestamp(),
  });
};

export const updatePaymentStatus = async (
  docId: string,
  paymentStatus: 'paid' | 'outstanding'
): Promise<void> => {
  const docRef = doc(db, COLLECTION, docId);
  await updateDoc(docRef, {
    paymentStatus,
    updatedAt: serverTimestamp(),
  });
};

export interface UpcomingMemberActivityRef {
  id: string;
  title: string;
  date: string;
}

export interface RemoveMemberResult {
  outcome: 'removed' | 'scheduled';
  activities: UpcomingMemberActivityRef[];
}

async function fetchClubActivitiesPool(organizationId: string): Promise<Array<Record<string, any>>> {
  if (!organizationId) return [];
  const mergedMap = new Map<string, Record<string, any>>();

  const fetchCollection = async (colName: string) => {
    try {
      const [byHost, byOrg] = await Promise.all([
        getDocs(query(collection(db, colName), where('hostingOrgId', '==', organizationId))).catch(() => null),
        getDocs(query(collection(db, colName), where('organizationId', '==', organizationId))).catch(() => null),
      ]);
      for (const snap of [byHost, byOrg]) {
        if (!snap) continue;
        snap.docs.forEach((d) => {
          const existing = mergedMap.get(d.id) || {};
          mergedMap.set(d.id, { ...existing, ...d.data(), id: d.id });
        });
      }
    } catch {}
  };

  await Promise.all([fetchCollection('activities'), fetchCollection('events')]);
  return Array.from(mergedMap.values()).filter((act) => isClubActivity(act, organizationId));
}

async function fetchClubSignupEvidence(
  organizationId: string,
  activityIds: string[]
): Promise<{
  payables: Array<Record<string, any>>;
  registrations: Array<Record<string, any>>;
  attendanceRecords: Array<Record<string, any>>;
}> {
  const payables: Array<Record<string, any>> = [];
  const registrations: Array<Record<string, any>> = [];
  const attendanceRecords: Array<Record<string, any>> = [];

  if (activityIds.length === 0) {
    return { payables, registrations, attendanceRecords };
  }

  // Batch queries by up to 10 eventIds (Firestore 'in' limit)
  const chunks: string[][] = [];
  for (let i = 0; i < activityIds.length; i += 10) {
    chunks.push(activityIds.slice(i, i + 10));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const [paySnap, attSnap, regSnap1, regSnap2, regSnap3] = await Promise.all([
        getDocs(query(collection(db, 'payables'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'attendance'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'event_registrations'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'registrations'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'activity_registrations'), where('eventId', 'in', chunk))).catch(() => null),
      ]);

      paySnap?.docs.forEach((d) => payables.push({ id: d.id, ...d.data() }));
      attSnap?.docs.forEach((d) => attendanceRecords.push({ id: d.id, ...d.data() }));
      for (const rSnap of [regSnap1, regSnap2, regSnap3]) {
        rSnap?.docs.forEach((d) => registrations.push({ id: d.id, ...d.data() }));
      }
    })
  );

  // Also check org-level payables if eventId wasn't indexed yet
  try {
    const orgPaySnap = await getDocs(
      query(collection(db, 'payables'), where('organizationId', '==', organizationId))
    );
    const seenIds = new Set(payables.map((p) => p.id));
    orgPaySnap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        payables.push({ id: d.id, ...d.data() });
      }
    });
  } catch {}

  return { payables, registrations, attendanceRecords };
}

async function resolveStudentDocForMember(
  member: Partial<OrganizationMemberDocument> & Record<string, any>
): Promise<Record<string, any> | null> {
  try {
    if (member.studentId) {
      const snap = await getDocs(
        query(collection(db, 'students'), where('studentId', '==', member.studentId))
      );
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }
    if (member.email) {
      const snap = await getDocs(
        query(collection(db, 'students'), where('email', '==', member.email))
      );
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }
  } catch {}
  return null;
}

/**
 * Finds all non-ended, non-cancelled club activities that a member is already signed up for.
 */
export async function getMemberUpcomingActivitySignups(
  organizationId: string,
  member: Partial<OrganizationMemberDocument> & Record<string, any>
): Promise<UpcomingMemberActivityRef[]> {
  if (!organizationId || !member) return [];

  const [clubActivities, studentDoc] = await Promise.all([
    fetchClubActivitiesPool(organizationId),
    resolveStudentDocForMember(member),
  ]);

  const upcomingActivities = clubActivities.filter((act) => !isActivityEndedOrCancelled(act));
  if (upcomingActivities.length === 0) return [];

  const { idSet } = normalizeMemberIdentifiers(member, studentDoc);
  const evidence = await fetchClubSignupEvidence(
    organizationId,
    upcomingActivities.map((a) => a.id)
  );

  return upcomingActivities
    .filter((act) => isStudentSignedUpForActivity(act, idSet, evidence))
    .map((act) => ({
      id: act.id,
      title: String(act.title || act.name || 'Club Activity'),
      date: String(act.date || act.startDate || act.sessions?.[0]?.date || ''),
    }));
}

async function finalizeSingleMemberRemoval(
  docId: string,
  organizationId: string,
  prevData: Partial<OrganizationMemberDocument> | null,
  removedBy?: string,
  reason?: string
): Promise<void> {
  const docRef = doc(db, COLLECTION, docId);
  await updateDoc(docRef, {
    status: 'removed',
    isOfficer: false,
    removedAt: serverTimestamp(),
    removedBy: removedBy || prevData?.removalRequestedBy || 'Officer',
    removalReason: reason || prevData?.removalReason || 'Removed from club',
    scheduledRemovalActivityIds: [],
    scheduledRemovalActivityTitles: [],
    updatedAt: serverTimestamp(),
  });

  if (organizationId && prevData && isMemberCurrentlyInClub(prevData)) {
    try {
      await updateDoc(doc(db, 'organizations', organizationId), {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[finalizeSingleMemberRemoval] Could not decrement organization memberCount:', err);
    }
  }

  // Deactivate any active officer role in this organization while preserving record history
  const studentId = prevData?.studentId;
  if (organizationId && studentId) {
    try {
      const officerSnap = await getDocs(
        query(
          collection(db, 'organization_officers'),
          where('organizationId', '==', organizationId),
          where('studentId', '==', studentId),
          where('isActive', '==', true)
        )
      );
      if (!officerSnap.empty) {
        const batch = writeBatch(db);
        officerSnap.docs.forEach((oDoc) => {
          batch.update(oDoc.ref, {
            isActive: false,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    } catch (offErr) {
      console.warn('[finalizeSingleMemberRemoval] Could not deactivate officer assignment:', offErr);
    }
  }
}

/**
 * Removes a member from the club while preserving their member record and keeping
 * all existing dues and fines intact.
 * - If the member is already signed up to an upcoming activity of the club, keeps them
 *   in the club until that activity ends (`status: 'pending_removal'`), blocking them
 *   from newly created activities in the meantime.
 * - Otherwise completes removal immediately (`status: 'removed'`).
 */
export const removeMemberFromClub = async (
  docId: string,
  organizationId: string,
  removedBy?: string,
  reason?: string
): Promise<RemoveMemberResult> => {
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Member record not found.');
  }

  const memberData = { id: snap.id, ...snap.data() } as OrganizationMemberDocument;
  const resolvedOrgId = organizationId || memberData.organizationId;

  if (memberData.status === 'removed') {
    return { outcome: 'removed', activities: [] };
  }

  const upcomingActivities = await getMemberUpcomingActivitySignups(resolvedOrgId, memberData);

  if (upcomingActivities.length > 0) {
    await updateDoc(docRef, {
      status: 'pending_removal',
      removalRequestedAt: serverTimestamp(),
      removalRequestedBy: removedBy || 'Officer',
      removalReason:
        reason ||
        `Scheduled removal after upcoming activity: ${upcomingActivities.map((a) => a.title).join(', ')}`,
      scheduledRemovalActivityIds: upcomingActivities.map((a) => a.id),
      scheduledRemovalActivityTitles: upcomingActivities.map((a) => a.title),
      updatedAt: serverTimestamp(),
    });

    return {
      outcome: 'scheduled',
      activities: upcomingActivities,
    };
  }

  await finalizeSingleMemberRemoval(docId, resolvedOrgId, memberData, removedBy, reason);
  return {
    outcome: 'removed',
    activities: [],
  };
};

/**
 * Cancels a scheduled removal before it takes effect, restoring full 'active' membership.
 */
export const cancelScheduledMemberRemoval = async (docId: string): Promise<void> => {
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Member record not found.');
  }
  const data = snap.data() as Partial<OrganizationMemberDocument>;
  if (data.status !== 'pending_removal') {
    await updateMemberStatus(docId, 'active');
    return;
  }

  await updateDoc(docRef, {
    status: 'active',
    removalRequestedAt: null,
    removalRequestedBy: null,
    removalReason: null,
    scheduledRemovalActivityIds: [],
    scheduledRemovalActivityTitles: [],
    updatedAt: serverTimestamp(),
  });
};

/**
 * Reconciles any 'pending_removal' members for an organization:
 * Once all scheduled/signed-up upcoming activities have ended (completed, cancelled, or past end time),
 * automatically completes their removal ('status: "removed"').
 */
export async function reconcilePendingMemberRemovalsForOrg(
  organizationId: string
): Promise<number> {
  if (!organizationId) return 0;

  try {
    const qPending = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('status', '==', 'pending_removal')
    );
    const pendingSnap = await getDocs(qPending);
    if (pendingSnap.empty) return 0;

    const clubActivities = await fetchClubActivitiesPool(organizationId);
    const activityMap = new Map<string, Record<string, any>>();
    clubActivities.forEach((act) => activityMap.set(act.id, act));

    const nonEndedActivities = clubActivities.filter((act) => !isActivityEndedOrCancelled(act));
    const evidence = await fetchClubSignupEvidence(
      organizationId,
      nonEndedActivities.map((a) => a.id)
    );

    let finalizedCount = 0;

    for (const mDoc of pendingSnap.docs) {
      const mData = { id: mDoc.id, ...mDoc.data() } as OrganizationMemberDocument;
      const scheduledIds: string[] = Array.isArray(mData.scheduledRemovalActivityIds)
        ? mData.scheduledRemovalActivityIds
        : [];

      let stillWaitingActivities: UpcomingMemberActivityRef[] = [];

      if (scheduledIds.length > 0) {
        stillWaitingActivities = scheduledIds
          .map((actId) => activityMap.get(actId))
          .filter((act): act is Record<string, any> => Boolean(act && !isActivityEndedOrCancelled(act)))
          .map((act) => ({
            id: act.id,
            title: String(act.title || act.name || 'Club Activity'),
            date: String(act.date || act.startDate || act.sessions?.[0]?.date || ''),
          }));
      } else {
        const studentDoc = await resolveStudentDocForMember(mData);
        const { idSet } = normalizeMemberIdentifiers(mData, studentDoc);
        stillWaitingActivities = nonEndedActivities
          .filter((act) => isStudentSignedUpForActivity(act, idSet, evidence))
          .map((act) => ({
            id: act.id,
            title: String(act.title || act.name || 'Club Activity'),
            date: String(act.date || act.startDate || act.sessions?.[0]?.date || ''),
          }));
      }

      if (stillWaitingActivities.length === 0) {
        await finalizeSingleMemberRemoval(mDoc.id, organizationId, mData);
        finalizedCount += 1;
      } else if (
        scheduledIds.length > 0 &&
        stillWaitingActivities.length !== scheduledIds.length
      ) {
        await updateDoc(mDoc.ref, {
          scheduledRemovalActivityIds: stillWaitingActivities.map((a) => a.id),
          scheduledRemovalActivityTitles: stillWaitingActivities.map((a) => a.title),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return finalizedCount;
  } catch (err) {
    console.warn('[reconcilePendingMemberRemovalsForOrg] Non-fatal reconciliation notice:', err);
    return 0;
  }
}

/**
 * Returns student identifiers for all club members who are removed or scheduled for removal,
 * used so newly created club activities permanently exclude them.
 */
export async function getExcludedMemberIdentifiersForOrg(
  organizationId: string
): Promise<string[]> {
  if (!organizationId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTION),
        where('organizationId', '==', organizationId),
        where('status', 'in', ['pending_removal', 'removed'])
      )
    );
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Partial<OrganizationMemberDocument>));
    return extractExcludedMemberIdentifiers(docs);
  } catch (err) {
    console.warn('[getExcludedMemberIdentifiersForOrg] Non-fatal lookup warning:', err);
    return [];
  }
}

export const removeMember = async (docId: string): Promise<void> => {
  const snap = await getDoc(doc(db, COLLECTION, docId));
  const orgId = snap.exists() ? String(snap.data()?.organizationId || '') : '';
  await removeMemberFromClub(docId, orgId);
};

export const deleteMember = async (docId: string, organizationId: string): Promise<void> => {
  await removeMemberFromClub(docId, organizationId);
};

export const appointAsOfficer = async (
  organizationId: string,
  memberDocId: string,
  roleId: string,
  studentId: string,
  studentName: string,
  email: string,
  tempPassword?: string,
  roleName?: string,
  studentDetails?: {
    course?: string;
    year?: string;
    department?: string;
    contactNumber?: string;
    hasWebPortalAccess?: boolean;
  },
  actor?: {
    isAdviser?: boolean;
    uid?: string;
    name?: string;
    email?: string;
    organizationName?: string;
  }
): Promise<void> => {
  if (actor && actor.isAdviser === false) {
    throw new Error('Only appointed Club Advisers are authorized to appoint officers or grant Web Portal access.');
  }
  const wantWebAccess = Boolean(studentDetails?.hasWebPortalAccess);

  // Enforce officer appointment & once-per-student Web Portal access validation:
  // 1) A student cannot hold duplicate active/pending appointments in the SAME organization.
  // 2) A student MAY serve as an officer in multiple organizations,
  //    but Web Portal access can only be granted ONCE across all organizations.
  const existingActiveOfficersSnap = await getDocs(
    query(
      collection(db, 'organization_officers'),
      where('studentId', '==', studentId),
      where('isActive', '==', true)
    )
  );
  const activeOrPendingRecords = existingActiveOfficersSnap.docs
    .map((d) => d.data())
    .filter((o) => o.appointmentStatus !== 'declined');

  const existingOtherOrgOfficers = activeOrPendingRecords.filter(
    (o) => o.organizationId !== organizationId
  );

  if (activeOrPendingRecords.some((o) => o.organizationId === organizationId)) {
    throw new Error('This student already has an active or pending officer appointment in this organization.');
  }
  if (wantWebAccess && existingOtherOrgOfficers.some((o) => o.hasWebPortalAccess !== false)) {
    const conflictingOrg = existingOtherOrgOfficers.find((o) => o.hasWebPortalAccess !== false);
    const conflictingOrgLabel = conflictingOrg?.organizationName
      ? ` (${conflictingOrg.organizationName})`
      : '';
    throw new Error(
      `This student already has Web Portal access as an officer in another organization${conflictingOrgLabel}. A student can hold officer roles in multiple organizations, but Web Portal access can only be granted once.`
    );
  }

  const batch = writeBatch(db);
  
  // 1. Enforce that the student is already a registered active member of this organization
  let targetMemberRef = null;
  if (memberDocId && memberDocId.trim()) {
    const memberRef = doc(db, COLLECTION, memberDocId);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists() || (memberSnap.data()?.status && memberSnap.data()?.status !== 'active')) {
      throw new Error('Student must be an active member of this organization before being appointed as an officer.');
    }
    targetMemberRef = memberRef;
  } else {
    // Check if member already exists by studentId
    const qExisting = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('studentId', '==', studentId)
    );
    const existingSnap = await getDocs(qExisting);
    if (existingSnap.empty) {
      throw new Error('Student must be an active member of this organization before being appointed as an officer.');
    }
    const memberData = existingSnap.docs[0].data();
    if (memberData?.status && memberData.status !== 'active') {
      throw new Error('Only active members can be appointed as officers.');
    }
    targetMemberRef = existingSnap.docs[0].ref;
  }

  // Note: organization_members.isOfficer and organizations.presidentName are updated
  // once the student accepts the appointment on the Mobile app.

  const orgSnap = await getDoc(doc(db, 'organizations', organizationId)).catch(() => null);
  const orgName =
    actor?.organizationName?.trim() ||
    (orgSnap?.exists() ? (orgSnap.data()?.name || 'Student Organization') : 'Student Organization');

  // 2. Create the officer doc in organization_officers with pending_acceptance status
  const officersCollectionRef = collection(db, 'organization_officers');
  const officerDocRef = doc(officersCollectionRef);
  const studentProfiles = await getDocs(query(collection(db, 'students'), where('studentId', '==', studentId)));
  if (studentProfiles.size > 1) throw new Error('Several student profiles have this ID. Resolve the duplicate before appointing an officer.');
  const student = studentProfiles.docs[0]?.data();
  const cleanEmail = (email || student?.email || '').trim().toLowerCase();
  const cleanStudentName = formatPersonName(student, studentName);
  const resolvedRoleName = roleName || 'Officer';
  
  batch.set(officerDocRef, {
    id: officerDocRef.id,
    organizationId,
    organizationName: orgName,
    memberDocId: targetMemberRef.id,
    roleId,
    roleName: resolvedRoleName,
    studentId,
    studentName: cleanStudentName,
    email: cleanEmail,
    authUid: student?.authUid || null,
    tempPass: student?.tempPass || null,
    requiresPasswordChange: Boolean(student?.tempPass || student?.requiresPasswordChange || student?.requiresChangePassword),
    resetInProgress: student?.resetInProgress === true,
    temporaryPassword: student?.tempPass || null,
    useStudentCredentials: true,
    hasWebPortalAccess: wantWebAccess,
    isActive: true,
    appointmentStatus: 'pending_acceptance',
    appointedByUid: actor?.uid || null,
    appointedByName: actor?.name || 'Club Adviser',
    appointedByEmail: actor?.email ? actor.email.trim().toLowerCase() : null,
    appointedAt: serverTimestamp(),
    acceptedAt: null,
    declinedAt: null,
    declineReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  const commitPromise = batch.commit();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Firestore batch write timed out.")), 15000);
  });
  
  try {
    await Promise.race([commitPromise, timeoutPromise]);

    // Always notify the appointed student on Mobile so they can review & confirm
    const recipientTokens = [studentId, student?.authUid, cleanEmail]
      .filter(Boolean)
      .map((t) => String(t).trim().toLowerCase());

    void createNotification({
      recipientRole: 'student',
      recipientId: [studentId, student?.authUid, cleanEmail].filter(Boolean).join('|'),
      recipientTokens,
      targetOrgId: organizationId,
      targetOrgName: orgName,
      type: 'officer_appointment',
      category: 'system',
      title: 'Officer Appointment Offer',
      message: `You have been appointed as ${resolvedRoleName} of ${orgName}${wantWebAccess ? ' (with Web Portal access)' : ''}. Open to confirm or decline your appointment.`,
      resourceId: officerDocRef.id,
      resourceType: 'officer_appointment',
      actionRoute: '/dashboard',
      isUrgent: true,
      metadata: {
        officerDocId: officerDocRef.id,
        organizationId,
        organizationName: orgName,
        roleId,
        roleName: resolvedRoleName,
        hasWebPortalAccess: wantWebAccess,
        appointedByUid: actor?.uid || null,
        appointedByName: actor?.name || 'Club Adviser',
        appointedByEmail: actor?.email ? actor.email.trim().toLowerCase() : null,
      },
      senderId: actor?.uid || undefined,
      senderName: actor?.name || 'Club Adviser',
      senderRoleTitle: 'Club Adviser',
    }).catch((err) => console.warn('Failed to dispatch mobile officer appointment notification:', err));
  } catch (error: any) {
    console.error("Appoint officer failed:", error);
    throw new Error(`Appoint officer failed: ${error.message}`);
  }
};

export const revokeOfficer = async (
  organizationId: string,
  officerDocId: string,
  studentId: string,
  actor?: {
    isAdviser?: boolean;
  }
): Promise<void> => {
  if (actor && actor.isAdviser === false) {
    throw new Error('Only appointed Club Advisers are authorized to revoke officer access or appointments.');
  }
  const batch = writeBatch(db);
  const officerRef = doc(db, 'organization_officers', officerDocId);
  batch.update(officerRef, {
    isActive: false,
    hasWebPortalAccess: false,
    updatedAt: serverTimestamp(),
  });

  // Update member doc if found to unset isOfficer
  if (studentId) {
    const qMember = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('studentId', '==', studentId)
    );
    const memberSnap = await getDocs(qMember);
    if (!memberSnap.empty) {
      batch.update(memberSnap.docs[0].ref, {
        isOfficer: false,
        updatedAt: serverTimestamp(),
      });
    }
  }

  const commitPromise = batch.commit();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Firestore batch write timed out.")), 15000);
  });

  try {
    await Promise.race([commitPromise, timeoutPromise]);
  } catch (error: any) {
    console.error("Revoke officer failed:", error);
    throw new Error(`Revoke officer failed: ${error.message}`);
  }
};

/**
 * Grants or revokes Organization Web Portal login access for an active officer.
 * Restricted strictly to the appointed Club Adviser.
 */
export const updateOfficerWebPortalAccess = async (
  organizationId: string,
  officerDocId: string,
  grantAccess: boolean,
  actor?: {
    isAdviser?: boolean;
  }
): Promise<void> => {
  if (!actor || actor.isAdviser !== true) {
    throw new Error('Only appointed Club Advisers are authorized to add or revoke Web Portal access.');
  }

  const officerRef = doc(db, 'organization_officers', officerDocId);
  const officerSnap = await getDoc(officerRef);
  if (!officerSnap.exists()) {
    throw new Error('Officer record not found.');
  }
  const officerData = officerSnap.data();
  if (officerData.organizationId !== organizationId) {
    throw new Error('Officer does not belong to this organization.');
  }
  if (officerData.isActive === false) {
    throw new Error('Cannot modify Web Portal access for a revoked officer.');
  }
  if (officerData.appointmentStatus === 'pending_acceptance') {
    throw new Error(
      'This officer has not accepted their appointment yet. Wait for them to confirm in the STI Sync mobile app before modifying Web Portal access.'
    );
  }
  if (officerData.appointmentStatus === 'declined') {
    throw new Error('Cannot modify Web Portal access for a declined appointment.');
  }

  if (grantAccess && officerData.studentId) {
    const existingActiveOfficersSnap = await getDocs(
      query(
        collection(db, 'organization_officers'),
        where('studentId', '==', officerData.studentId),
        where('isActive', '==', true)
      )
    );
    const conflictingWebAccessDoc = existingActiveOfficersSnap.docs.find((d) => {
      if (d.id === officerDocId) return false;
      const other = d.data();
      return (
        other.organizationId !== organizationId &&
        other.appointmentStatus !== 'declined' &&
        other.hasWebPortalAccess !== false
      );
    });
    if (conflictingWebAccessDoc) {
      const otherOrgName = conflictingWebAccessDoc.data()?.organizationName;
      throw new Error(
        `This student already has Web Portal access in another organization${otherOrgName ? ` (${otherOrgName})` : ''}. One student can be an officer in multiple organizations, but Web Portal access can only be granted once.`
      );
    }
  }

  await updateDoc(officerRef, {
    hasWebPortalAccess: grantAccess,
    updatedAt: serverTimestamp(),
  });

  if (grantAccess) {
    const orgSnap = await getDoc(doc(db, 'organizations', organizationId)).catch(() => null);
    const orgName = orgSnap?.exists() ? (orgSnap.data()?.name || 'your organization') : 'your organization';
    const roleTitle = officerData.roleName || 'Officer';
    const cleanEmail = String(officerData.email || '').trim().toLowerCase();
    void createNotification({
      recipientRole: 'officer',
      recipientId: [officerData.studentId, officerData.authUid, cleanEmail].filter(Boolean).join('|'),
      targetOrgId: organizationId,
      targetOrgName: orgName,
      type: 'role_assigned',
      category: 'system',
      title: 'Web Portal Access Granted',
      message: `You have been granted Organization Web Portal access as ${roleTitle} of ${orgName}. Welcome!`,
      resourceId: organizationId,
      resourceType: 'system',
      actionRoute: '/officer/dashboard',
      senderRoleTitle: 'Club Adviser',
    }).catch((err) => console.warn('Failed to dispatch officer web-access notification:', err));
  }
};
