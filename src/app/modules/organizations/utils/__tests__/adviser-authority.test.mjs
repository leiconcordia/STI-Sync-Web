import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isPrimaryAdviserUnavailable,
  resolveEffectiveAdviserAuthority,
} from '../adviser-authority.utils.ts';
import {
  findAdviserConflictInOrganizations,
  validateAdviserRecordsConflict,
} from '../adviser-validation.utils.ts';

const primaryAdv = {
  authUid: 'uid-primary',
  adviserRole: 'primary',
  name: 'Prof. Juan Dela Cruz',
  email: 'juan@ormoc.sti.edu.ph',
  employeeId: 'EMP-1001',
  departmentId: 'dept-it',
  title: 'Club Adviser',
};

const coAdv = {
  authUid: 'uid-coadv',
  adviserRole: 'co_adviser',
  name: 'Prof. Maria Santos',
  email: 'maria@ormoc.sti.edu.ph',
  employeeId: 'EMP-1002',
  departmentId: 'dept-it',
  title: 'Club Co-Adviser',
};

test('1. Both Primary Adviser and Co-Adviser always hold equal full Club Adviser authority', () => {
  const org = {
    adviser: primaryAdv,
    coAdviser: coAdv,
  };

  const primaryAuth = resolveEffectiveAdviserAuthority({
    organization: org,
    viewerUid: 'uid-primary',
    viewerEmail: primaryAdv.email,
  });
  assert.equal(primaryAuth.isPrimaryAdviser, true);
  assert.equal(primaryAuth.canReviewOfficerSubmissions, true);
  assert.equal(primaryAuth.canPerformFullAdviserActions, true);

  const coAuth = resolveEffectiveAdviserAuthority({
    organization: org,
    viewerUid: 'uid-coadv',
    viewerEmail: coAdv.email,
  });
  assert.equal(coAuth.isCoAdviser, true);
  assert.equal(coAuth.canReviewOfficerSubmissions, true);
  assert.equal(coAuth.canPerformFullAdviserActions, true);
  assert.match(coAuth.statusBannerText || '', /full Club Adviser authority/i);
});

test('2. Co-Adviser retains acting-on-behalf attribution if availability metadata exists', () => {
  const org = {
    adviser: primaryAdv,
    coAdviser: coAdv,
    adviserAvailability: {
      primaryStatus: 'unavailable',
      unavailableReason: 'Medical Leave',
    },
  };

  const coAuth = resolveEffectiveAdviserAuthority({
    organization: org,
    viewerUid: 'uid-coadv',
    viewerEmail: coAdv.email,
  });

  assert.equal(coAuth.isCoAdviser, true);
  assert.equal(coAuth.canReviewOfficerSubmissions, true);
  assert.equal(coAuth.canPerformFullAdviserActions, true);
  assert.equal(coAuth.actingOnBehalfOfName, primaryAdv.name);
});

test('3. Scheduled leave date range auto-transfers during window and auto-restores after end date', () => {
  const availability = {
    primaryStatus: 'unavailable',
    unavailableFrom: '2026-11-20',
    unavailableUntil: '2026-11-25',
    unavailableReason: 'Official Seminar',
  };

  assert.equal(isPrimaryAdviserUnavailable(availability, new Date('2026-11-19T12:00:00')), false);
  assert.equal(isPrimaryAdviserUnavailable(availability, new Date('2026-11-20T09:00:00')), true);
  assert.equal(isPrimaryAdviserUnavailable(availability, new Date('2026-11-25T18:00:00')), true);
  assert.equal(isPrimaryAdviserUnavailable(availability, new Date('2026-11-26T08:00:00')), false);
});

test('4. Uniqueness validation enforces 1-org rule across Primary Adviser & Co-Adviser and prevents same-org self-collision', () => {
  const orgs = [
    {
      id: 'org-1',
      name: 'STI Tech Society',
      adviser: { email: primaryAdv.email, employeeId: primaryAdv.employeeId },
      coAdviser: { email: coAdv.email, employeeId: coAdv.employeeId },
    },
  ];

  // Cross-org conflict with existing Co-Adviser
  const crossConflict = findAdviserConflictInOrganizations({
    email: coAdv.email,
    employeeId: coAdv.employeeId,
    organizations: orgs,
    excludeOrgId: 'org-2',
  });
  assert.ok(crossConflict);
  assert.equal(crossConflict.field, 'email');

  // Same-org conflict: cannot assign org-1's Primary Adviser as org-1's Co-Adviser
  const sameOrgSlotConflict = findAdviserConflictInOrganizations({
    email: primaryAdv.email,
    employeeId: primaryAdv.employeeId,
    organizations: orgs,
    excludeOrgId: 'org-1',
    excludeRole: 'co_adviser',
  });
  assert.ok(sameOrgSlotConflict);
  assert.equal(sameOrgSlotConflict.field, 'email');

  // Updating org-1's Co-Adviser slot with a fresh employee succeeds
  const cleanAssign = findAdviserConflictInOrganizations({
    email: 'fresh@ormoc.sti.edu.ph',
    employeeId: 'EMP-9999',
    organizations: orgs,
    excludeOrgId: 'org-1',
    excludeRole: 'co_adviser',
  });
  assert.equal(cleanAssign, null);

  // Firestore record-level check also respects excludeRole
  const recordConflict = validateAdviserRecordsConflict({
    email: primaryAdv.email,
    employeeId: primaryAdv.employeeId,
    adviserRecords: [
      { email: primaryAdv.email, employeeId: primaryAdv.employeeId, organizationId: 'org-1', organizationName: 'STI Tech Society', adviserRole: 'primary', isActive: true },
    ],
    excludeOrgId: 'org-1',
    excludeRole: 'co_adviser',
  });
  assert.ok(recordConflict);
});
