import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOrganizationCrossDepartmental,
  resolveOrgDepartmentDisplay,
  checkStudentDepartmentEligibility,
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
});
