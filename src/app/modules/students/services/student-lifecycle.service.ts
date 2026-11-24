/**
 * src/app/modules/students/services/student-lifecycle.service.ts
 *
 * Orchestrates:
 *  1. Course Shift Handling (Impact Preview, Pending-Shift Officer Flagging,
 *     Hard-Blocked Manual Shifts, Registrar Shift Sync, Officer Auto-Revocation).
 *  2. Enrollment-Based Activation (Manual Unenrolled Deactivation with Org/Officer Sync,
 *     Grouped Adviser Alerts, and Term-Aware Reactivation).
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { createNotification } from '../../notifications';
import { syncStudentPayablesForActiveEvents } from '../../finance/services/payable.service';
import type {
  AcademicLevel,
  CourseShiftRecord,
  StudentDocument,
  StudentSemester,
  StudentYearLevel,
} from '../types/student.types';
import {
  evaluateCourseShiftImpact,
  type CourseShiftImpactResult,
  type CourseShiftTargetProgram,
} from '../utils/course-shift.utils';
import {
  evaluateReactivationMembershipEligibility,
  groupUnenrolledByOrganization,
  type OrganizationUnenrolledGroup,
} from '../utils/enrollment-activation.utils';

const STUDENTS_COL = 'students';
const MEMBERS_COL = 'organization_members';
const OFFICERS_COL = 'organization_officers';
const ORGS_COL = 'organizations';
const DEPTS_COL = 'departments';
const COURSES_COL = 'courses';
const AUDIT_COL = 'audit_logs';

function buildStudentLookupQueries(colName: string, student: Partial<StudentDocument>) {
  const ref = collection(db, colName);
  const queries = [];
  if (student.id) queries.push(getDocs(query(ref, where('studentId', '==', student.id))));
  if (student.studentId && student.studentId !== student.id) {
    queries.push(getDocs(query(ref, where('studentId', '==', student.studentId))));
    queries.push(getDocs(query(ref, where('studentSchoolId', '==', student.studentId))));
  }
  if (student.authUid) {
    queries.push(getDocs(query(ref, where('authUid', '==', student.authUid))));
    if (student.authUid !== student.id && student.authUid !== student.studentId) {
      queries.push(getDocs(query(ref, where('studentId', '==', student.authUid))));
    }
  }
  if (student.email) {
    const lowerEmail = student.email.trim().toLowerCase();
    queries.push(getDocs(query(ref, where('email', '==', lowerEmail))));
  }
  return queries;
}

function dedupeSnapshots(snaps: Array<{ docs: Array<{ id: string; data: () => any }> }>): Array<Record<string, any>> {
  const map = new Map<string, Record<string, any>>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!map.has(d.id)) {
        map.set(d.id, { id: d.id, ...d.data() });
      }
    }
  }
  return Array.from(map.values());
}

function getOrgAdviserRecipientToken(org: Record<string, any> | undefined): string | undefined {
  if (!org) return undefined;
  const tokens = [
    org.adviser?.authUid,
    org.adviser?.email,
    org.coAdviser?.authUid,
    org.coAdviser?.email,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return tokens.length > 0 ? Array.from(new Set(tokens)).join('|') : undefined;
}

export async function fetchStudentLifecycleContext(student: Partial<StudentDocument>) {
  const memberQueries = buildStudentLookupQueries(MEMBERS_COL, student);
  const officerQueries = buildStudentLookupQueries(OFFICERS_COL, student);

  const [memberSnaps, officerSnaps, orgsSnap, deptsSnap, coursesSnap] = await Promise.all([
    Promise.all(memberQueries),
    Promise.all(officerQueries),
    getDocs(collection(db, ORGS_COL)),
    getDocs(collection(db, DEPTS_COL)),
    getDocs(collection(db, COURSES_COL)),
  ]);

  return {
    memberships: dedupeSnapshots(memberSnaps),
    officerRoles: dedupeSnapshots(officerSnaps),
    organizations: orgsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    departments: deptsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    courses: coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Computes a live preview of how shifting a student's academic program impacts their
 * organization memberships, pending club applications, and active officer roles.
 */
export async function previewStudentCourseShift(
  student: StudentDocument,
  target: CourseShiftTargetProgram
): Promise<CourseShiftImpactResult> {
  const ctx = await fetchStudentLifecycleContext(student);
  return evaluateCourseShiftImpact({
    student,
    target,
    memberships: ctx.memberships,
    officerRoles: ctx.officerRoles,
    organizations: ctx.organizations,
    departments: ctx.departments,
    courses: ctx.courses,
  });
}

/**
 * Flags blocking departmental organization memberships as ineligible due to a pending course shift
 * and notifies each affected organization's Officers & Advisers so the "Ineligible — Remove"
 * banner appears immediately inside MemberDirectory.tsx.
 */
export async function flagIneligibleMembershipsForCourseShift(
  student: StudentDocument,
  target: CourseShiftTargetProgram,
  impact: CourseShiftImpactResult,
  adminUid: string = 'admin',
  source: 'MANUAL_PENDING' | 'REGISTRAR_IMPORT' | 'RE_ENROLLMENT' = 'MANUAL_PENDING'
): Promise<{ flaggedCount: number; notifiedOrgCount: number }> {
  if (impact.blockingActiveMemberships.length === 0) {
    return { flaggedCount: 0, notifiedOrgCount: 0 };
  }

  const nowIso = new Date().toISOString();
  const studentDisplayName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.studentId;
  const batch = writeBatch(db);

  for (const m of impact.blockingActiveMemberships) {
    if (!m.membershipId) continue;
    const ref = doc(db, MEMBERS_COL, m.membershipId);
    batch.update(ref, {
      courseShiftIneligibility: {
        flagged: true,
        reason:
          source === 'MANUAL_PENDING'
            ? `${studentDisplayName} is shifting from ${impact.fromCourseCode || 'current program'} to ${impact.toCourseCode} (${impact.toDepartmentLabel}) and is no longer eligible for ${m.organizationAcronym}. Remove to unblock course shift.`
            : `${studentDisplayName} shifted from ${impact.fromCourseCode || 'previous program'} to ${impact.toCourseCode} (${impact.toDepartmentLabel}) and is no longer eligible for ${m.organizationAcronym}. Please remove from roster.`,
        fromCourseCode: impact.fromCourseCode,
        toCourseCode: impact.toCourseCode,
        toDepartmentName: impact.toDepartmentLabel,
        flaggedAt: nowIso,
        flaggedBy: adminUid,
        source,
      },
      updatedAt: Timestamp.now(),
    });
  }

  await batch.commit();

  // Notify each affected organization (Officers & Advisers)
  const notifiedOrgIds = new Set<string>();
  for (const m of impact.blockingActiveMemberships) {
    if (!m.organizationId || notifiedOrgIds.has(m.organizationId)) continue;
    notifiedOrgIds.add(m.organizationId);
    try {
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: m.organizationId,
        targetOrgName: m.organizationName,
        type: 'compliance_notice',
        category: 'system',
        title: `Action Required: Ineligible Member (${studentDisplayName})`,
        message:
          source === 'MANUAL_PENDING'
            ? `${studentDisplayName} (${student.studentId}) is shifting from ${impact.fromCourseCode || 'current program'} to ${impact.toCourseCode} (${impact.toDepartmentLabel}) and is no longer eligible for ${m.organizationAcronym}. Please remove them in Member Directory so SAS Admin can finalize the course shift.`
            : `${studentDisplayName} (${student.studentId}) shifted to ${impact.toCourseCode} (${impact.toDepartmentLabel}) via Registrar update and is no longer eligible for ${m.organizationAcronym}. Please remove them in Member Directory.`,
        resourceId: m.membershipId || student.id,
        resourceType: 'system',
        actionRoute: '/officer/members?tab=members',
        isUrgent: true,
        senderId: adminUid,
        senderName: 'SAS Administrator',
        senderRoleTitle: 'Student Affairs & Services',
      });
    } catch (err) {
      console.warn('[student-lifecycle] Failed to notify org of course-shift ineligibility:', err);
    }
  }

  return {
    flaggedCount: impact.blockingActiveMemberships.length,
    notifiedOrgCount: notifiedOrgIds.size,
  };
}

export interface ExecuteCourseShiftOptions {
  source?: 'MANUAL' | 'REGISTRAR_IMPORT' | 'RE_ENROLLMENT';
  reason?: string;
  /**
   * When false (default for MANUAL shifts), strictly hard-blocks if any active
   * ineligible departmental membership still exists.
   * When true (used by Registrar Bulk Import), updates the Registrar program and flags
   * ineligible memberships so officers see the "Ineligible — Remove" banner immediately.
   */
  allowFlagInsteadOfBlock?: boolean;
  /** Skip writing the /students doc when the caller already committed it in a bulk batch. */
  skipStudentDocUpdate?: boolean;
  schoolYear?: string;
  semester?: StudentSemester;
}

export interface ExecuteCourseShiftResult {
  impact: CourseShiftImpactResult;
  revokedOfficerCount: number;
  withdrawnPendingCount: number;
  flaggedIneligibleCount: number;
}

/**
 * Executes a validated Course Shift:
 *  - Enforces hard-block on manual shifts when ineligible active departmental memberships remain.
 *  - Syncs updated program/department metadata on retained Cross-Departmental / eligible clubs.
 *  - Auto-withdraws ineligible pending club applications.
 *  - Auto-revokes ineligible Officer roles (isActive: false) & notifies Club Adviser / Co-Adviser.
 *  - Records `courseShiftHistory[]` and `audit_logs`.
 */
export async function executeStudentCourseShift(
  student: StudentDocument,
  target: CourseShiftTargetProgram,
  adminUid: string = 'admin',
  options: ExecuteCourseShiftOptions = {}
): Promise<ExecuteCourseShiftResult> {
  const {
    source = 'MANUAL',
    reason = '',
    allowFlagInsteadOfBlock = false,
    skipStudentDocUpdate = false,
    schoolYear,
    semester,
  } = options;

  const ctx = await fetchStudentLifecycleContext(student);
  const impact = evaluateCourseShiftImpact({
    student,
    target,
    memberships: ctx.memberships,
    officerRoles: ctx.officerRoles,
    organizations: ctx.organizations,
    departments: ctx.departments,
    courses: ctx.courses,
  });

  if (!allowFlagInsteadOfBlock && !impact.canShiftImmediately) {
    throw new Error(impact.summaryMessage);
  }

  const orgById = new Map<string, Record<string, any>>();
  ctx.organizations.forEach((o) => {
    if (o.id) orgById.set(String(o.id), o);
  });

  const nowIso = new Date().toISOString();
  const studentDisplayName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.studentId;
  const batch = writeBatch(db);

  // Resolve canonical target department
  let targetDeptId = target.departmentId || '';
  let targetDeptName = target.departmentName || impact.toDepartmentLabel || '';
  if (!targetDeptId && (target.courseId || target.courseCode)) {
    const matchedCourse = ctx.courses.find(
      (c) =>
        (target.courseId && c.id === target.courseId) ||
        (target.courseCode && String(c.code || '').toLowerCase() === target.courseCode.trim().toLowerCase())
    );
    if (matchedCourse?.departmentId) targetDeptId = matchedCourse.departmentId;
  }
  if (targetDeptId && !targetDeptName) {
    const matchedDept = ctx.departments.find((d) => d.id === targetDeptId);
    if (matchedDept?.name) targetDeptName = matchedDept.name;
  }

  // 1. Update student document + courseShiftHistory (unless handled by bulk batch caller)
  if (!skipStudentDocUpdate) {
    const studentRef = doc(db, STUDENTS_COL, student.id);
    const priorShiftHistory = Array.isArray(student.courseShiftHistory) ? student.courseShiftHistory : [];
    const shiftEntry: CourseShiftRecord = {
      fromCourseId: student.courseId || '',
      fromCourseCode: student.courseCode || '',
      fromCourseName: student.courseName || '',
      fromDepartmentId: student.departmentId || '',
      fromDepartmentName: student.departmentName || impact.fromDepartmentLabel || '',
      toCourseId: target.courseId || '',
      toCourseCode: target.courseCode,
      toCourseName: target.courseName || target.courseCode,
      toDepartmentId: targetDeptId,
      toDepartmentName: targetDeptName,
      schoolYear: schoolYear || student.schoolYear || '',
      semester: semester || student.semester || '',
      shiftedAt: nowIso,
      shiftedBy: adminUid,
      source,
      reason: reason.trim() || undefined,
      revokedOfficerOrgIds: impact.ineligibleOfficerRoles.map((o) => o.organizationId),
      flaggedOrgIds: allowFlagInsteadOfBlock
        ? impact.blockingActiveMemberships.map((m) => m.organizationId)
        : [],
    };

    const studentUpdates: Record<string, any> = {
      courseId: target.courseId || '',
      courseCode: target.courseCode,
      courseName: target.courseName || target.courseCode,
      departmentId: targetDeptId,
      departmentName: targetDeptName,
      courseShiftHistory: [...priorShiftHistory, shiftEntry],
      updatedAt: Timestamp.now(),
    };
    if (target.academicLevel) studentUpdates.academicLevel = target.academicLevel;
    if (target.yearLevel) studentUpdates.yearLevel = target.yearLevel;
    if (target.section) studentUpdates.section = target.section.trim();
    if (schoolYear) studentUpdates.schoolYear = schoolYear;
    if (semester) {
      studentUpdates.semester = semester;
      studentUpdates.term = semester;
    }

    batch.update(studentRef, studentUpdates);
  }

  // 2. Sync course/department metadata on retained eligible memberships (and clear any stale shift flag)
  for (const m of impact.retainedMemberships) {
    if (!m.membershipId) continue;
    const mRef = doc(db, MEMBERS_COL, m.membershipId);
    const updates: Record<string, any> = {
      course: target.courseCode,
      departmentId: targetDeptId,
      department: targetDeptName,
      courseShiftIneligibility: null,
      updatedAt: Timestamp.now(),
    };
    if (target.yearLevel) updates.year = target.yearLevel;
    if (target.section) updates.section = target.section.trim();
    batch.update(mRef, updates);
  }

  // 3. Auto-withdraw/reject ineligible pending applications
  for (const p of impact.ineligiblePendingApplications) {
    if (!p.membershipId) continue;
    const pRef = doc(db, MEMBERS_COL, p.membershipId);
    batch.update(pRef, {
      status: 'rejected',
      rejectionReason: `Automatically withdrawn due to course shift (${impact.fromCourseCode} → ${impact.toCourseCode}, ${targetDeptName}).`,
      updatedAt: Timestamp.now(),
    });
  }

  // 4. Auto-revoke ineligible Officer roles (Option A)
  const revokedOfficerOrgIds = new Set<string>();
  for (const off of impact.ineligibleOfficerRoles) {
    if (!off.officerDocId) continue;
    revokedOfficerOrgIds.add(off.organizationId);
    const offRef = doc(db, OFFICERS_COL, off.officerDocId);
    batch.update(offRef, {
      isActive: false,
      revokedAt: Timestamp.now(),
      revokedBy: adminUid,
      revocationReason: `Automatically revoked due to course shift (${impact.fromCourseCode} → ${impact.toCourseCode}).`,
      updatedAt: Timestamp.now(),
    });
  }

  // Clear `isOfficer: false` on any matching membership for revoked officer orgs
  for (const m of ctx.memberships) {
    if (m.id && m.organizationId && revokedOfficerOrgIds.has(String(m.organizationId)) && m.isOfficer) {
      batch.update(doc(db, MEMBERS_COL, String(m.id)), {
        isOfficer: false,
        updatedAt: Timestamp.now(),
      });
    }
  }

  await batch.commit();

  // 5. If allowFlagInsteadOfBlock (e.g., Registrar Bulk Import) and ineligible active memberships exist,
  //    flag them immediately so officers see the "Ineligible — Remove" banner + notification!
  let flaggedIneligibleCount = 0;
  if (allowFlagInsteadOfBlock && impact.blockingActiveMemberships.length > 0) {
    const flagRes = await flagIneligibleMembershipsForCourseShift(
      student,
      target,
      impact,
      adminUid,
      source === 'REGISTRAR_IMPORT' ? 'REGISTRAR_IMPORT' : 'RE_ENROLLMENT'
    );
    flaggedIneligibleCount = flagRes.flaggedCount;
  }

  // 6. Notify Club Adviser & Co-Adviser for every auto-revoked Officer role
  for (const off of impact.ineligibleOfficerRoles) {
    const org = orgById.get(off.organizationId);
    const adviserToken = getOrgAdviserRecipientToken(org);
    try {
      await createNotification({
        recipientRole: 'officer',
        recipientId: adviserToken,
        targetOrgId: off.organizationId,
        targetOrgName: off.organizationName,
        type: 'compliance_notice',
        category: 'system',
        title: `Officer Role Revoked (Course Shift): ${studentDisplayName}`,
        message: `${studentDisplayName}'s ${off.roleName} position in ${off.organizationAcronym} was automatically revoked after shifting from ${impact.fromCourseCode} to ${impact.toCourseCode} (${targetDeptName}). Please appoint a replacement officer.`,
        resourceId: off.officerDocId,
        resourceType: 'system',
        actionRoute: '/officer/members?tab=officers',
        isUrgent: true,
        senderId: adminUid,
        senderName: 'SAS Administrator',
        senderRoleTitle: 'Student Affairs & Services',
      });
    } catch (err) {
      console.warn('[student-lifecycle] Failed to notify adviser of revoked officer:', err);
    }
  }

  // 7. Audit log
  try {
    await addDoc(collection(db, AUDIT_COL), {
      action: 'STUDENT_COURSE_SHIFT',
      entityType: 'student',
      entityId: student.id,
      studentId: student.studentId,
      studentName: studentDisplayName,
      fromCourseCode: impact.fromCourseCode,
      toCourseCode: impact.toCourseCode,
      fromDepartment: impact.fromDepartmentLabel,
      toDepartment: targetDeptName,
      source,
      reason: reason.trim() || null,
      revokedOfficerCount: impact.ineligibleOfficerRoles.length,
      flaggedIneligibleCount,
      performedBy: adminUid,
      createdAt: serverTimestamp(),
    });
  } catch (auditErr) {
    console.warn('[student-lifecycle] Audit log write warning:', auditErr);
  }

  return {
    impact,
    revokedOfficerCount: impact.ineligibleOfficerRoles.length,
    withdrawnPendingCount: impact.ineligiblePendingApplications.length,
    flaggedIneligibleCount,
  };
}

/**
 * Sends one clean grouped notification per affected Club Adviser / Co-Adviser listing
 * club members and officers who are not yet enrolled for the active academic period.
 */
export async function notifyAdvisersOfUnenrolledStudents(
  unenrolledStudents: StudentDocument[],
  activeTermLabel: string,
  adminUid: string = 'admin',
  mode: 'REMINDER' | 'DEACTIVATED' = 'REMINDER'
): Promise<{
  notifiedOrgCount: number;
  totalAffectedMembers: number;
  groups: OrganizationUnenrolledGroup[];
}> {
  if (!unenrolledStudents || unenrolledStudents.length === 0) {
    return { notifiedOrgCount: 0, totalAffectedMembers: 0, groups: [] };
  }

  const [membersSnap, officersSnap, orgsSnap] = await Promise.all([
    getDocs(collection(db, MEMBERS_COL)),
    getDocs(collection(db, OFFICERS_COL)),
    getDocs(collection(db, ORGS_COL)),
  ]);

  const memberships = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const officerRoles = officersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const organizations = orgsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const groups = groupUnenrolledByOrganization({
    unenrolledStudents,
    memberships,
    officerRoles,
    organizations,
  });

  let notifiedOrgCount = 0;
  let totalAffectedMembers = 0;

  for (const group of groups) {
    totalAffectedMembers += group.students.length;
    const officerList = group.students.filter((s) => s.isOfficer);
    const previewNames = group.students
      .slice(0, 4)
      .map((s) => (s.isOfficer ? `${s.studentName} (${s.officerRoleName})` : s.studentName))
      .join(', ');
    const overflow = group.students.length > 4 ? ` +${group.students.length - 4} more` : '';
    const officerNote =
      officerList.length > 0
        ? ` Includes ${officerList.length} officer(s)${mode === 'DEACTIVATED' ? ' whose portal access was revoked' : ''}.`
        : '';

    const title =
      mode === 'DEACTIVATED'
        ? `${group.students.length} Unenrolled Member(s) Deactivated (${group.organizationAcronym})`
        : `${group.students.length} Member(s) Not Yet Enrolled (${group.organizationAcronym})`;

    const message =
      mode === 'DEACTIVATED'
        ? `${group.students.length} member(s) in ${group.organizationName} were deactivated because they are not enrolled for ${activeTermLabel}: ${previewNames}${overflow}.${officerNote}`
        : `${group.students.length} active member(s) in ${group.organizationName} are not yet enrolled for ${activeTermLabel}: ${previewNames}${overflow}.${officerNote} Please remind them to complete re-enrollment.`;

    try {
      await createNotification({
        recipientRole: 'officer',
        recipientId: group.adviserRecipientIds.length > 0 ? group.adviserRecipientIds.join('|') : undefined,
        targetOrgId: group.organizationId,
        targetOrgName: group.organizationName,
        type: 'compliance_notice',
        category: 'system',
        title,
        message,
        resourceId: group.organizationId,
        resourceType: 'system',
        actionRoute: mode === 'DEACTIVATED' ? '/officer/members?tab=inactive' : '/officer/members?tab=members',
        isUrgent: officerList.length > 0 || mode === 'DEACTIVATED',
        senderId: adminUid,
        senderName: 'SAS Administrator',
        senderRoleTitle: 'Student Affairs & Services',
      });
      notifiedOrgCount++;
    } catch (err) {
      console.warn(`[student-lifecycle] Failed to notify adviser for org ${group.organizationId}:`, err);
    }
  }

  return { notifiedOrgCount, totalAffectedMembers, groups };
}

/**
 * Manually deactivates selected unenrolled students:
 *  1. Marks `/students/{id}` as `INACTIVE` with reason & timestamp.
 *  2. Marks their active `/organization_members` as `'inactive'` (`deactivatedByEnrollment: true`).
 *  3. Revokes their active `/organization_officers` (`isActive: false`).
 *  4. Sends grouped Adviser/Co-Adviser notifications per affected organization.
 */
export async function deactivateUnenrolledStudents(
  studentsToDeactivate: StudentDocument[],
  reason: string,
  adminUid: string = 'admin',
  activeTermLabel: string = 'the current academic period',
  options: { skipStudentDocUpdate?: boolean } = {}
): Promise<{
  deactivatedStudentCount: number;
  deactivatedMembershipCount: number;
  revokedOfficerCount: number;
  notifiedOrgCount: number;
}> {
  if (!studentsToDeactivate || studentsToDeactivate.length === 0) {
    return {
      deactivatedStudentCount: 0,
      deactivatedMembershipCount: 0,
      revokedOfficerCount: 0,
      notifiedOrgCount: 0,
    };
  }

  // 1. Send grouped Adviser notifications BEFORE mutating statuses so active org/officer groupings are accurate
  const notifResult = await notifyAdvisersOfUnenrolledStudents(
    studentsToDeactivate,
    activeTermLabel,
    adminUid,
    'DEACTIVATED'
  );

  // 2. Load memberships & officers once and build token index
  const [membersSnap, officersSnap] = await Promise.all([
    getDocs(collection(db, MEMBERS_COL)),
    getDocs(collection(db, OFFICERS_COL)),
  ]);

  const studentTokens = new Set<string>();
  for (const s of studentsToDeactivate) {
    if (s.id) studentTokens.add(s.id.trim().toLowerCase());
    if (s.studentId) studentTokens.add(s.studentId.trim().toLowerCase());
    if (s.authUid) studentTokens.add(s.authUid.trim().toLowerCase());
    if (s.email) studentTokens.add(s.email.trim().toLowerCase());
  }

  const matchesTargetStudent = (data: Record<string, any>): boolean => {
    const keys = [data.studentId, data.studentSchoolId, data.authUid, data.email]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    return keys.some((k) => studentTokens.has(k));
  };

  type BatchOp = { ref: ReturnType<typeof doc>; payload: Record<string, any> };
  const ops: BatchOp[] = [];
  const nowTs = Timestamp.now();

  if (!options.skipStudentDocUpdate) {
    for (const stu of studentsToDeactivate) {
      ops.push({
        ref: doc(db, STUDENTS_COL, stu.id),
        payload: {
          status: 'INACTIVE',
          deactivatedAt: nowTs,
          deactivationReason: reason,
          rejectionReason: reason,
          updatedAt: nowTs,
        },
      });
    }
  }

  let deactivatedMembershipCount = 0;
  for (const mDoc of membersSnap.docs) {
    const data = mDoc.data();
    const st = String(data.status || '').toLowerCase();
    if ((st === 'active' || st === 'pending_removal') && matchesTargetStudent(data)) {
      ops.push({
        ref: mDoc.ref,
        payload: {
          status: 'inactive',
          deactivatedByEnrollment: true,
          deactivationReason: reason,
          updatedAt: nowTs,
        },
      });
      deactivatedMembershipCount++;
    }
  }

  let revokedOfficerCount = 0;
  for (const oDoc of officersSnap.docs) {
    const data = oDoc.data();
    if (data.isActive !== false && matchesTargetStudent(data)) {
      ops.push({
        ref: oDoc.ref,
        payload: {
          isActive: false,
          revokedAt: nowTs,
          revokedBy: adminUid,
          revocationReason: reason,
          updatedAt: nowTs,
        },
      });
      revokedOfficerCount++;
    }
  }

  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((op) => batch.update(op.ref, op.payload));
    await batch.commit();
  }

  return {
    deactivatedStudentCount: studentsToDeactivate.length,
    deactivatedMembershipCount,
    revokedOfficerCount,
    notifiedOrgCount: notifResult.notifiedOrgCount,
  };
}

/**
 * Reactivates / re-enrolls an inactive student for the active academic period:
 *  - Stamps the active `schoolYear` and `semester` (plus any course/year/section updates).
 *  - Restores ONLY department-eligible inactive club memberships (never restoring removed clubs).
 *  - Flags any ineligible memberships (if course shifted) & auto-revokes ineligible officer roles.
 *  - Syncs active event payables.
 */
export async function reactivateStudentForTerm(
  studentDocId: string,
  params: {
    schoolYear: string;
    semester: StudentSemester;
    academicLevel?: AcademicLevel;
    yearLevel?: StudentYearLevel;
    section?: string;
    courseId?: string;
    courseCode?: string;
    courseName?: string;
    departmentId?: string;
    departmentName?: string;
    adminUid?: string;
    skipStudentDocUpdate?: boolean;
  }
): Promise<{
  restoredMembershipCount: number;
  flaggedIneligibleCount: number;
  revokedOfficerCount: number;
}> {
  const ref = doc(db, STUDENTS_COL, studentDocId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Student document not found.');
  }

  const existing = { id: snap.id, ...snap.data() } as StudentDocument;
  const adminUid = params.adminUid || 'admin';
  const nextCourseCode = params.courseCode || existing.courseCode;
  const nextCourseId = params.courseId !== undefined ? params.courseId : existing.courseId;
  const nextCourseName = params.courseName || existing.courseName;
  const nextDeptId = params.departmentId !== undefined ? params.departmentId : existing.departmentId;
  const nextDeptName = params.departmentName !== undefined ? params.departmentName : existing.departmentName;
  const nextYearLevel = params.yearLevel || existing.yearLevel;
  const nextSection = (params.section !== undefined ? params.section : existing.section) || 'UNASSIGNED';
  const nextLevel = params.academicLevel || existing.academicLevel || 'COLLEGE';

  const isCourseChanging =
    String(existing.courseCode || '').trim().toLowerCase() !== String(nextCourseCode || '').trim().toLowerCase() ||
    (Boolean(nextDeptId) &&
      String(existing.departmentId || '').trim().toLowerCase() !== String(nextDeptId || '').trim().toLowerCase());

  if (!params.skipStudentDocUpdate) {
    const priorHistory = Array.isArray(existing.enrollmentHistory) ? existing.enrollmentHistory : [];
    const historyItem = {
      schoolYear: existing.schoolYear || 'PRIOR',
      semester: existing.semester || 'PRIOR',
      yearLevel: existing.yearLevel || '',
      courseCode: existing.courseCode || '',
      courseName: existing.courseName || '',
      section: existing.section || '',
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(ref, {
      status: 'ACTIVE',
      schoolYear: params.schoolYear,
      semester: params.semester,
      term: params.semester,
      academicLevel: nextLevel,
      yearLevel: nextYearLevel,
      section: nextSection.trim(),
      courseId: nextCourseId || '',
      courseCode: nextCourseCode,
      courseName: nextCourseName,
      departmentId: nextDeptId || '',
      departmentName: nextDeptName || '',
      rejectionReason: '',
      deactivationReason: '',
      reactivatedAt: Timestamp.now(),
      enrollmentHistory: [...priorHistory, historyItem],
      updatedAt: Timestamp.now(),
    });
  }

  const updatedStudent: StudentDocument = {
    ...existing,
    status: 'ACTIVE',
    schoolYear: params.schoolYear,
    semester: params.semester,
    term: params.semester,
    academicLevel: nextLevel,
    yearLevel: nextYearLevel,
    section: nextSection.trim(),
    courseId: nextCourseId || '',
    courseCode: nextCourseCode,
    courseName: nextCourseName,
    departmentId: nextDeptId || '',
    departmentName: nextDeptName || '',
  };

  // Restore eligible inactive memberships & flag ineligible ones
  const ctx = await fetchStudentLifecycleContext(updatedStudent);
  const plan = evaluateReactivationMembershipEligibility({
    student: updatedStudent,
    memberships: ctx.memberships,
    organizations: ctx.organizations,
    departments: ctx.departments,
    courses: ctx.courses,
  });

  const nowTs = Timestamp.now();
  const nowIso = new Date().toISOString();
  if (plan.eligibleToRestore.length > 0 || plan.ineligibleFlagged.length > 0) {
    const batch = writeBatch(db);
    for (const item of plan.eligibleToRestore) {
      batch.update(doc(db, MEMBERS_COL, item.membershipId), {
        status: 'active',
        deactivatedByEnrollment: false,
        deactivationReason: '',
        course: nextCourseCode,
        departmentId: nextDeptId || '',
        department: nextDeptName || '',
        year: nextYearLevel,
        section: nextSection.trim(),
        courseShiftIneligibility: null,
        updatedAt: nowTs,
      });
    }
    for (const item of plan.ineligibleFlagged) {
      batch.update(doc(db, MEMBERS_COL, item.membershipId), {
        courseShiftIneligibility: {
          flagged: true,
          reason: item.reason,
          fromCourseCode: existing.courseCode,
          toCourseCode: nextCourseCode,
          toDepartmentName: nextDeptName || '',
          flaggedAt: nowIso,
          flaggedBy: adminUid,
          source: 'RE_ENROLLMENT',
        },
        updatedAt: nowTs,
      });
    }
    await batch.commit();
  }

  let revokedOfficerCount = 0;
  let flaggedFromShift = 0;
  if (isCourseChanging) {
    const shiftRes = await executeStudentCourseShift(
      existing,
      {
        academicLevel: nextLevel,
        courseId: nextCourseId,
        courseCode: nextCourseCode,
        courseName: nextCourseName,
        departmentId: nextDeptId,
        departmentName: nextDeptName,
        yearLevel: nextYearLevel,
        section: nextSection,
      },
      adminUid,
      {
        source: 'RE_ENROLLMENT',
        allowFlagInsteadOfBlock: true,
        skipStudentDocUpdate: true,
        schoolYear: params.schoolYear,
        semester: params.semester,
      }
    );
    revokedOfficerCount = shiftRes.revokedOfficerCount;
    flaggedFromShift = shiftRes.flaggedIneligibleCount;

    // Append courseShiftHistory record onto student doc
    const priorShifts = Array.isArray(existing.courseShiftHistory) ? existing.courseShiftHistory : [];
    const shiftRecord: CourseShiftRecord = {
      fromCourseId: existing.courseId || '',
      fromCourseCode: existing.courseCode || '',
      fromCourseName: existing.courseName || '',
      fromDepartmentId: existing.departmentId || '',
      fromDepartmentName: existing.departmentName || '',
      toCourseId: nextCourseId || '',
      toCourseCode: nextCourseCode,
      toCourseName: nextCourseName,
      toDepartmentId: nextDeptId || '',
      toDepartmentName: nextDeptName || '',
      schoolYear: params.schoolYear,
      semester: params.semester,
      shiftedAt: nowIso,
      shiftedBy: adminUid,
      source: 'RE_ENROLLMENT',
      revokedOfficerOrgIds: shiftRes.impact.ineligibleOfficerRoles.map((o) => o.organizationId),
      flaggedOrgIds: shiftRes.impact.blockingActiveMemberships.map((m) => m.organizationId),
    };
    await updateDoc(ref, {
      courseShiftHistory: [...priorShifts, shiftRecord],
      updatedAt: Timestamp.now(),
    });
  }

  // Sync active event payables for newly reactivated student
  try {
    await syncStudentPayablesForActiveEvents(updatedStudent, 'admin_approval');
  } catch (syncErr) {
    console.warn('[student-lifecycle] Could not sync payables upon reactivating student:', syncErr);
  }

  return {
    restoredMembershipCount: plan.eligibleToRestore.length,
    flaggedIneligibleCount: plan.ineligibleFlagged.length + flaggedFromShift,
    revokedOfficerCount,
  };
}
