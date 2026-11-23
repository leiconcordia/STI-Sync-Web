import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOrganizationCrossDepartmental,
  resolveOrgDepartmentDisplay,
  checkStudentDepartmentEligibility,
  findDepartmentScopeConflicts,
} from '../department-eligibility.utils.ts';

describe('Club Member Department Eligibility Enforcement', () => {
  const departments = [
    { id: 'dept_ict', code: 'IT', name: 'Information & Communications Technology' },
    { id: 'dept_hm', code: 'HM', name: 'Hospitality Management' },
    { id: 'dept_ba', code: 'BA', name: 'Business Administration' },
  ];

  const courses = [
    { id: 'c_bsit', code: 'BSIT', name: 'BS Information Technology', departmentId: 'dept_ict' },
    { id: 'c_bshm', code: 'BSHM', name: 'BS Hospitality Management', departmentId: 'dept_hm' },
    { id: 'c_bsba', code: 'BSBA', name: 'BS Business Administration', departmentId: 'dept_ba' },
  ];

  const departmentalItOrg = {
    id: 'jpcs',
    name: 'Junior Philippine Computer Society',
    departmentId: 'dept_ict',
    departmentCode: 'IT',
    departmentName: 'Information & Communications Technology',
    scope: 'departmental',
    isCrossDepartmental: false,
  };

  const crossDeptOrg = {
    id: 'ssc',
    name: 'Supreme Student Council',
    departmentId: 'cross-departmental',
    scope: 'cross-departmental',
    isCrossDepartmental: true,
  };

  test('identifies cross-departmental vs departmental orgs accurately (even if departmentId is missing on legacy named org)', () => {
    assert.equal(isOrganizationCrossDepartmental(crossDeptOrg), true);
    assert.equal(isOrganizationCrossDepartmental(departmentalItOrg), false);
    assert.equal(
      isOrganizationCrossDepartmental({ id: 'legacy_hm', department: 'Hospitality Management' }),
      false
    );
    assert.equal(resolveOrgDepartmentDisplay(crossDeptOrg, departments), 'Cross-Departmental');
    assert.equal(
      resolveOrgDepartmentDisplay(departmentalItOrg, departments),
      'Information & Communications Technology (IT)'
    );
  });

  test('allows student from matching department (by departmentId or course->department fallback)', () => {
    const directMatch = checkStudentDepartmentEligibility(
      departmentalItOrg,
      { studentId: 's1', departmentId: 'dept_ict', departmentName: 'ICT' },
      departments,
      courses
    );
    assert.equal(directMatch.eligible, true);

    // Course lookup fallback when student lacks departmentId
    const courseFallbackMatch = checkStudentDepartmentEligibility(
      departmentalItOrg,
      { studentId: 's2', courseCode: 'BSIT', department: '' },
      departments,
      courses
    );
    assert.equal(courseFallbackMatch.eligible, true);
  });

  test('blocks different department student even when code is substring (e.g. "Hospitality" contains "IT")', () => {
    const hmStudent = {
      studentId: 's_hm',
      departmentId: 'dept_hm',
      departmentName: 'Hospitality Management',
      courseCode: 'BSHM',
    };
    const res = checkStudentDepartmentEligibility(departmentalItOrg, hmStudent, departments, courses);
    assert.equal(res.eligible, false);
    assert.match(res.reason || '', /Hospitality Management/);
  });

  test('blocks student with empty/missing department instead of passing !sDept bypass', () => {
    const emptyStudent = {
      studentId: 's_empty',
      departmentId: '',
      department: '',
      departmentName: '',
      courseCode: '',
    };
    const res = checkStudentDepartmentEligibility(departmentalItOrg, emptyStudent, departments, courses);
    assert.equal(res.eligible, false);
    assert.match(res.reason || '', /no assigned academic department/i);
  });

  test('allows any active student when organization is cross-departmental', () => {
    const baStudent = {
      studentId: 's_ba',
      departmentId: 'dept_ba',
      departmentName: 'Business Administration',
      courseCode: 'BSBA',
    };
    const res = checkStudentDepartmentEligibility(crossDeptOrg, baStudent, departments, courses);
    assert.equal(res.eligible, true);
  });

  test('enforces multi-department checkbox selection (allows any selected dept, blocks unselected depts)', () => {
    const multiDeptOrg = {
      id: 'biz_tech',
      name: 'Business & Tech Guild',
      isCrossDepartmental: false,
      scope: 'departmental',
      departmentId: 'dept_ict',
      allowedDepartmentIds: ['dept_ict', 'dept_ba'],
      allowedDepartmentNames: ['Information & Communications Technology', 'Business Administration'],
      allowedDepartmentCodes: ['IT', 'BA'],
    };

    assert.equal(isOrganizationCrossDepartmental(multiDeptOrg), false);
    assert.equal(
      resolveOrgDepartmentDisplay(multiDeptOrg, departments),
      'Information & Communications Technology (IT), Business Administration (BA)'
    );

    const itStudent = { studentId: 's_it', departmentId: 'dept_ict', courseCode: 'BSIT' };
    const baStudent = { studentId: 's_ba', departmentId: 'dept_ba', courseCode: 'BSBA' };
    const hmStudent = { studentId: 's_hm', departmentId: 'dept_hm', courseCode: 'BSHM' };

    assert.equal(checkStudentDepartmentEligibility(multiDeptOrg, itStudent, departments, courses).eligible, true);
    assert.equal(checkStudentDepartmentEligibility(multiDeptOrg, baStudent, departments, courses).eligible, true);

    const hmRes = checkStudentDepartmentEligibility(multiDeptOrg, hmStudent, departments, courses);
    assert.equal(hmRes.eligible, false);
    assert.match(hmRes.reason || '', /Hospitality Management/);
    assert.match(hmRes.reason || '', /Business Administration/);
  });

  test('detects active members from excluded departments when narrowing org scope', () => {
    const restrictedItAndHmOrg = {
      id: 'guild',
      isCrossDepartmental: false,
      scope: 'departmental',
      departmentId: 'dept_ict',
      allowedDepartmentIds: ['dept_ict', 'dept_hm'],
      allowedDepartmentNames: ['Information & Communications Technology', 'Hospitality Management'],
      allowedDepartmentCodes: ['IT', 'HM'],
    };

    const members = [
      { id: 'm1', studentId: 's1', studentName: 'Alice IT', departmentId: 'dept_ict', course: 'BSIT', status: 'active' },
      { id: 'm2', studentId: 's2', studentName: 'Bob HM', departmentId: 'dept_hm', course: 'BSHM', status: 'active' },
      { id: 'm3', studentId: 's3', studentName: 'Cara BA', departmentId: 'dept_ba', course: 'BSBA', status: 'active' },
      { id: 'm4', studentId: 's4', studentName: 'Dan BA Removed', departmentId: 'dept_ba', course: 'BSBA', status: 'removed' },
      { id: 'm5', studentId: 's5', studentName: 'Eve BA Pending', departmentId: 'dept_ba', course: 'BSBA', status: 'pending' },
    ];

    const conflictResult = findDepartmentScopeConflicts({
      proposedOrg: restrictedItAndHmOrg,
      members,
      departments,
      courses,
    });
    assert.equal(conflictResult.hasConflicts, true);
    assert.equal(conflictResult.totalConflictingMembers, 1);
    assert.equal(conflictResult.conflictsByDepartment[0].departmentLabel, 'Business Administration');
    assert.equal(conflictResult.conflictsByDepartment[0].count, 1);
    assert.match(conflictResult.summaryMessage || '', /Business Administration/);

    // Expanding to Cross-Departmental has zero conflicts
    const crossResult = findDepartmentScopeConflicts({
      proposedOrg: crossDeptOrg,
      members,
      departments,
      courses,
    });
    assert.equal(crossResult.hasConflicts, false);

    // Restricting to IT + HM when only IT + HM are active has zero conflicts
    const compatibleMembers = members.filter((m) => m.studentId !== 's3');
    const cleanResult = findDepartmentScopeConflicts({
      proposedOrg: restrictedItAndHmOrg,
      members: compatibleMembers,
      departments,
      courses,
    });
    assert.equal(cleanResult.hasConflicts, false);
  });
});
