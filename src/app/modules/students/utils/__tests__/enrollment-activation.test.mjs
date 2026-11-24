import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findUnenrolledActiveStudents,
  groupUnenrolledByOrganization,
  evaluateReactivationMembershipEligibility,
} from '../enrollment-activation.utils.ts';

const activeCollegePeriod = { academicYear: '2026-2027', semester: '2nd Semester' };
const activeShsPeriod = { academicYear: '2026-2027', semester: '2nd Trimester' };

test('findUnenrolledActiveStudents detects active students still on prior terms per track (COLLEGE vs SHS)', () => {
  const students = [
    {
      id: 's1',
      studentId: '02000111111',
      firstName: 'Ana',
      lastName: 'Cruz',
      status: 'ACTIVE',
      academicLevel: 'COLLEGE',
      schoolYear: '2026-2027',
      semester: '2nd Semester',
    },
    {
      id: 's2',
      studentId: '02000222222',
      firstName: 'Ben',
      lastName: 'Reyes',
      status: 'ACTIVE',
      academicLevel: 'COLLEGE',
      schoolYear: '2026-2027',
      semester: '1st Semester', // prior term -> unenrolled!
    },
    {
      id: 's3',
      studentId: '02000333333',
      firstName: 'Cara',
      lastName: 'Lim',
      status: 'ACTIVE',
      academicLevel: 'SHS',
      yearLevel: 'Grade 11',
      schoolYear: '2026-2027',
      semester: '1st Trimester', // prior SHS term -> unenrolled!
    },
    {
      id: 's4',
      studentId: '02000444444',
      firstName: 'Dan',
      lastName: 'Sy',
      status: 'INACTIVE', // already inactive -> ignored
      academicLevel: 'COLLEGE',
      schoolYear: '2025-2026',
      semester: '2nd Semester',
    },
  ];

  const found = findUnenrolledActiveStudents(students, activeCollegePeriod, activeShsPeriod);
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map((f) => f.student.id),
    ['s2', 's3']
  );
  assert.equal(found[0].academicLevel, 'COLLEGE');
  assert.equal(found[1].academicLevel, 'SHS');
});

test('groupUnenrolledByOrganization produces 1 grouped alert per org with Primary Adviser & Co-Adviser tokens and flags officers', () => {
  const unenrolledStudents = [
    { id: 's2', studentId: '02000222222', firstName: 'Ben', lastName: 'Reyes', courseCode: 'BSIT', yearLevel: '2nd Year' },
    { id: 's3', studentId: '02000333333', firstName: 'Cara', lastName: 'Lim', courseCode: 'BSCS', yearLevel: '3rd Year' },
  ];

  const memberships = [
    { id: 'm1', organizationId: 'org-itg', studentId: '02000222222', status: 'active' },
    { id: 'm2', organizationId: 'org-itg', studentId: '02000333333', status: 'active' },
    { id: 'm3', organizationId: 'org-itg', studentId: '02000999999', status: 'active' }, // enrolled student
  ];

  const officerRoles = [
    { id: 'o1', organizationId: 'org-itg', studentId: '02000222222', roleName: 'Secretary', isActive: true },
  ];

  const organizations = [
    {
      id: 'org-itg',
      name: 'IT Guild',
      acronym: 'ITG',
      status: 'active',
      adviser: { authUid: 'adv-1', email: 'adv1@sti.edu' },
      coAdviser: { authUid: 'coadv-1', email: 'coadv1@sti.edu' },
    },
  ];

  const groups = groupUnenrolledByOrganization({
    unenrolledStudents,
    memberships,
    officerRoles,
    organizations,
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].organizationId, 'org-itg');
  assert.equal(groups[0].students.length, 2);
  assert.deepEqual(groups[0].adviserRecipientIds, ['adv-1', 'adv1@sti.edu', 'coadv-1', 'coadv1@sti.edu']);
  const ben = groups[0].students.find((s) => s.studentDocId === 's2');
  assert.equal(ben?.isOfficer, true);
  assert.equal(ben?.officerRoleName, 'Secretary');
});

test('evaluateReactivationMembershipEligibility restores only department-eligible inactive memberships and skips removed / flags ineligible ones', () => {
  const departments = [
    { id: 'dept-cite', code: 'CITE', name: 'CITE' },
    { id: 'dept-thm', code: 'THM', name: 'THM' },
  ];
  const courses = [
    { id: 'c-bshm', code: 'BSHM', name: 'BSHM', departmentId: 'dept-thm' },
  ];
  const organizations = [
    { id: 'org-itg', name: 'IT Guild', status: 'active', isCrossDepartmental: false, allowedDepartmentIds: ['dept-cite'] },
    { id: 'org-dance', name: 'Dance Troupe', status: 'active', isCrossDepartmental: true },
  ];

  // Returning student shifted to BSHM (THM) while inactive
  const returningStudent = {
    id: 's2',
    courseId: 'c-bshm',
    courseCode: 'BSHM',
    departmentId: 'dept-thm',
    departmentName: 'THM',
  };

  const memberships = [
    { id: 'm-dance', organizationId: 'org-dance', status: 'inactive', deactivatedByEnrollment: true },
    { id: 'm-itg', organizationId: 'org-itg', status: 'inactive', deactivatedByEnrollment: true },
    { id: 'm-removed', organizationId: 'org-dance', status: 'inactive', removedAt: '2026-01-01', removalReason: 'Disciplinary' },
  ];

  const plan = evaluateReactivationMembershipEligibility({
    student: returningStudent,
    memberships,
    organizations,
    departments,
    courses,
  });

  assert.deepEqual(
    plan.eligibleToRestore.map((x) => x.membershipId),
    ['m-dance']
  );
  assert.deepEqual(
    plan.ineligibleFlagged.map((x) => x.membershipId),
    ['m-itg']
  );
  assert.deepEqual(
    plan.skippedNonEnrollmentInactive.map((x) => x.membershipId),
    ['m-removed']
  );
});
