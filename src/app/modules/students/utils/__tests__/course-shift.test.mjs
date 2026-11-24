import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCourseShiftImpact } from '../course-shift.utils.ts';

const departments = [
  { id: 'dept-cite', code: 'CITE', name: 'College of Information Technology Education' },
  { id: 'dept-thm', code: 'THM', name: 'Tourism & Hospitality Management' },
  { id: 'dept-ba', code: 'BA', name: 'Business Administration' },
];

const courses = [
  { id: 'c-bsit', code: 'BSIT', name: 'BS Information Technology', departmentId: 'dept-cite' },
  { id: 'c-bscs', code: 'BSCS', name: 'BS Computer Science', departmentId: 'dept-cite' },
  { id: 'c-bshm', code: 'BSHM', name: 'BS Hospitality Management', departmentId: 'dept-thm' },
  { id: 'c-bsba', code: 'BSBA', name: 'BS Business Administration', departmentId: 'dept-ba' },
];

const organizations = [
  {
    id: 'org-itg',
    name: 'IT Guild',
    acronym: 'ITG',
    status: 'active',
    isCrossDepartmental: false,
    allowedDepartmentIds: ['dept-cite'],
    allowedDepartmentNames: ['College of Information Technology Education'],
  },
  {
    id: 'org-dance',
    name: 'STI Dance Troupe',
    acronym: 'SDT',
    status: 'active',
    isCrossDepartmental: true,
    scope: 'cross-departmental',
  },
  {
    id: 'org-multi',
    name: 'Innovation & Service Society',
    acronym: 'ISS',
    status: 'active',
    isCrossDepartmental: false,
    allowedDepartmentIds: ['dept-cite', 'dept-thm'],
    allowedDepartmentNames: ['College of Information Technology Education', 'Tourism & Hospitality Management'],
  },
  {
    id: 'org-ba',
    name: 'Junior Executives',
    acronym: 'JEX',
    status: 'active',
    isCrossDepartmental: false,
    allowedDepartmentIds: ['dept-ba'],
  },
];

const bsitStudent = {
  id: 'stu-1',
  studentId: '02000123456',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  courseId: 'c-bsit',
  courseCode: 'BSIT',
  courseName: 'BS Information Technology',
  departmentId: 'dept-cite',
  departmentName: 'College of Information Technology Education',
  yearLevel: '2nd Year',
};

test('Same-department course shift (BSIT -> BSCS) keeps CITE departmental orgs and officer roles eligible', () => {
  const result = evaluateCourseShiftImpact({
    student: bsitStudent,
    target: {
      courseId: 'c-bscs',
      courseCode: 'BSCS',
      courseName: 'BS Computer Science',
      departmentId: 'dept-cite',
      departmentName: 'College of Information Technology Education',
    },
    memberships: [
      { id: 'mem-1', organizationId: 'org-itg', status: 'active' },
      { id: 'mem-2', organizationId: 'org-dance', status: 'active' },
    ],
    officerRoles: [
      { id: 'off-1', organizationId: 'org-itg', roleName: 'Treasurer', isActive: true },
    ],
    organizations,
    departments,
    courses,
  });

  assert.equal(result.isProgramChanging, true);
  assert.equal(result.canShiftImmediately, true);
  assert.equal(result.blockingActiveMemberships.length, 0);
  assert.equal(result.retainedMemberships.length, 2);
  assert.equal(result.ineligibleOfficerRoles.length, 0);
  assert.equal(result.retainedOfficerRoles.length, 1);
});

test('Cross-department shift (BSIT -> BSHM) hard-blocks on CITE-only active membership, retains Cross-Dept & Multi-Dept [CITE, THM], flags officer for auto-revoke, and withdraws ineligible pending apps', () => {
  const result = evaluateCourseShiftImpact({
    student: bsitStudent,
    target: {
      courseId: 'c-bshm',
      courseCode: 'BSHM',
      courseName: 'BS Hospitality Management',
      departmentId: 'dept-thm',
      departmentName: 'Tourism & Hospitality Management',
    },
    memberships: [
      { id: 'mem-itg', organizationId: 'org-itg', status: 'active' },
      { id: 'mem-dance', organizationId: 'org-dance', status: 'active' },
      { id: 'mem-multi', organizationId: 'org-multi', status: 'active' },
      { id: 'mem-pending-ba', organizationId: 'org-ba', status: 'pending' },
      // Already removed membership should be ignored
      { id: 'mem-removed', organizationId: 'org-itg', status: 'removed' },
    ],
    officerRoles: [
      { id: 'off-itg', organizationId: 'org-itg', roleName: 'Vice President', isActive: true },
      { id: 'off-dance', organizationId: 'org-dance', roleName: 'Secretary', isActive: true },
    ],
    organizations,
    departments,
    courses,
  });

  assert.equal(result.isProgramChanging, true);
  assert.equal(result.canShiftImmediately, false);
  assert.deepEqual(
    result.blockingActiveMemberships.map((m) => m.organizationId),
    ['org-itg']
  );
  assert.deepEqual(
    result.retainedMemberships.map((m) => m.organizationId),
    ['org-dance', 'org-multi']
  );
  assert.deepEqual(
    result.ineligiblePendingApplications.map((m) => m.organizationId),
    ['org-ba']
  );
  assert.deepEqual(
    result.ineligibleOfficerRoles.map((o) => o.organizationId),
    ['org-itg']
  );
  assert.deepEqual(
    result.retainedOfficerRoles.map((o) => o.organizationId),
    ['org-dance']
  );
});

test('Course shift unblocks immediately once blocking departmental membership is removed, while still identifying any remaining ineligible officer role for auto-revocation', () => {
  const result = evaluateCourseShiftImpact({
    student: bsitStudent,
    target: {
      courseId: 'c-bshm',
      courseCode: 'BSHM',
      courseName: 'BS Hospitality Management',
      departmentId: 'dept-thm',
      departmentName: 'Tourism & Hospitality Management',
    },
    memberships: [
      { id: 'mem-itg', organizationId: 'org-itg', status: 'removed' },
      { id: 'mem-dance', organizationId: 'org-dance', status: 'active' },
    ],
    officerRoles: [
      { id: 'off-itg', organizationId: 'org-itg', roleName: 'Treasurer', isActive: true },
    ],
    organizations,
    departments,
    courses,
  });

  assert.equal(result.canShiftImmediately, true);
  assert.equal(result.blockingActiveMemberships.length, 0);
  assert.equal(result.ineligibleOfficerRoles.length, 1);
  assert.equal(result.ineligibleOfficerRoles[0].roleName, 'Treasurer');
});
