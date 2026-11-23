import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkStudentOrgTypeQuota,
  normalizeMaxMembershipsPerStudent,
} from '../org-type-quota.utils.ts';

describe('Per-Organization-Type Membership Quota Enforcement', () => {
  const academicType = {
    id: 'type_academic',
    name: 'Academic',
    maxMembershipsPerStudent: 2,
  };

  const civicType = {
    id: 'type_civic',
    name: 'Civic',
    maxMembershipsPerStudent: null,
  };

  const allOrganizations = [
    { id: 'org_jpcs', name: 'JPCS', acronym: 'JPCS', typeId: 'type_academic', status: 'active' },
    { id: 'org_acm', name: 'ACM', acronym: 'ACM', typeId: 'type_academic', status: 'active' },
    { id: 'org_ieee', name: 'IEEE', acronym: 'IEEE', typeId: 'type_academic', status: 'active' },
    { id: 'org_redcross', name: 'Red Cross Youth', acronym: 'RCY', typeId: 'type_civic', status: 'active' },
  ];

  test('normalizes blank, null, 0, and negative values to unlimited (null)', () => {
    assert.equal(normalizeMaxMembershipsPerStudent(null), null);
    assert.equal(normalizeMaxMembershipsPerStudent(undefined), null);
    assert.equal(normalizeMaxMembershipsPerStudent(''), null);
    assert.equal(normalizeMaxMembershipsPerStudent(0), null);
    assert.equal(normalizeMaxMembershipsPerStudent(-3), null);
    assert.equal(normalizeMaxMembershipsPerStudent(2), 2);
  });

  test('allows joining up to maxMembershipsPerStudent and blocks exceeding the cap for the same type', () => {
    const oneAcademicMembership = [
      { organizationId: 'org_jpcs', status: 'active' },
    ];
    const secondJoin = checkStudentOrgTypeQuota({
      targetOrg: allOrganizations[1], // ACM (Academic)
      orgType: academicType,
      allOrganizations,
      studentMemberships: oneAcademicMembership,
    });
    assert.equal(secondJoin.allowed, true);
    assert.equal(secondJoin.currentCount, 1);

    const twoAcademicMemberships = [
      { organizationId: 'org_jpcs', status: 'active' },
      { organizationId: 'org_acm', status: 'active' },
    ];
    const thirdJoin = checkStudentOrgTypeQuota({
      targetOrg: allOrganizations[2], // IEEE (Academic)
      orgType: academicType,
      allOrganizations,
      studentMemberships: twoAcademicMemberships,
    });
    assert.equal(thirdJoin.allowed, false);
    assert.equal(thirdJoin.currentCount, 2);
    assert.equal(thirdJoin.maxAllowed, 2);
    assert.match(thirdJoin.reason || '', /maximum of 2 "Academic" organizations/i);
    assert.match(thirdJoin.reason || '', /JPCS, ACM/);
  });

  test('does not block joining a different org type when Academic quota is full', () => {
    const twoAcademicMemberships = [
      { organizationId: 'org_jpcs', status: 'active' },
      { organizationId: 'org_acm', status: 'active' },
    ];
    const civicJoin = checkStudentOrgTypeQuota({
      targetOrg: allOrganizations[3], // RCY (Civic)
      orgType: civicType,
      allOrganizations,
      studentMemberships: twoAcademicMemberships,
    });
    assert.equal(civicJoin.allowed, true);
  });

  test('does not count removed, rejected, or inactive memberships toward the cap', () => {
    const mixedMemberships = [
      { organizationId: 'org_jpcs', status: 'active' },
      { organizationId: 'org_acm', status: 'removed' },
      { organizationId: 'org_ieee', status: 'rejected' },
    ];
    const joinRes = checkStudentOrgTypeQuota({
      targetOrg: allOrganizations[2], // IEEE (Academic)
      orgType: academicType,
      allOrganizations,
      studentMemberships: mixedMemberships,
    });
    assert.equal(joinRes.allowed, true);
    assert.equal(joinRes.currentCount, 1);
  });
});
