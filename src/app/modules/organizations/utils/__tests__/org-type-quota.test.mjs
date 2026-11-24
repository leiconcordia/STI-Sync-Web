import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkStudentOrgTypeQuota,
  checkStudentGlobalOrgQuota,
  checkStudentMembershipLimits,
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

  test('enforces Global Maximum Organizations per Student across different org types', () => {
    const membershipsAcrossTypes = [
      { organizationId: 'org_jpcs', status: 'active' },
      { organizationId: 'org_redcross', status: 'active' },
    ];

    // Global cap of 2 blocks joining a 3rd org even though civicType is unlimited and academicType allows 2
    const blocked = checkStudentMembershipLimits({
      targetOrg: allOrganizations[1], // ACM (Academic, 2nd Academic org, 3rd total)
      orgType: academicType,
      maxTotalOrganizationsPerStudent: 2,
      allOrganizations,
      studentMemberships: membershipsAcrossTypes,
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.failedRule, 'global');
    assert.equal(blocked.globalQuota.currentCount, 2);
    assert.match(blocked.reason || '', /global maximum of 2 active organizations/i);

    // Increasing global cap to 3 allows the join (2 < 3 total and 1 < 2 Academic)
    const allowed = checkStudentMembershipLimits({
      targetOrg: allOrganizations[1],
      orgType: academicType,
      maxTotalOrganizationsPerStudent: 3,
      allOrganizations,
      studentMemberships: membershipsAcrossTypes,
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.globalQuota.currentCount, 2);
    assert.equal(allowed.typeQuota.currentCount, 1);
  });

  test('global cap unlimited (null/0) defers to per-type cap and ignores archived orgs / self-org', () => {
    const withArchivedAndSelf = [
      { organizationId: 'org_jpcs', status: 'active' },
      { organizationId: 'org_archived', status: 'active' },
    ];
    const orgsWithArchived = [
      ...allOrganizations,
      { id: 'org_archived', name: 'Old Club', acronym: 'OLD', typeId: 'type_civic', status: 'archived', archived: true },
    ];

    const globalCheck = checkStudentGlobalOrgQuota({
      targetOrg: allOrganizations[0], // already member of JPCS
      maxTotalOrganizationsPerStudent: 1,
      allOrganizations: orgsWithArchived,
      studentMemberships: withArchivedAndSelf,
    });
    assert.equal(globalCheck.allowed, true);
    assert.equal(globalCheck.currentCount, 0);

    const combined = checkStudentMembershipLimits({
      targetOrg: allOrganizations[2], // IEEE (3rd Academic)
      orgType: academicType,
      maxTotalOrganizationsPerStudent: null,
      allOrganizations,
      studentMemberships: [
        { organizationId: 'org_jpcs', status: 'active' },
        { organizationId: 'org_acm', status: 'active' },
      ],
    });
    assert.equal(combined.allowed, false);
    assert.equal(combined.failedRule, 'org_type');
  });
});
