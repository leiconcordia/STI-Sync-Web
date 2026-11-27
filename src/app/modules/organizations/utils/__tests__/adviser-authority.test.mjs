import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isPrimaryAdviserUnavailable,
  resolveEffectiveAdviserAuthority,
  validateAdviserPortalInactivation,
  validateRemoveCoAdviser,
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

test('1. While Primary Adviser is Active, ONLY Primary can approve and Substitute/Co-Adviser is strictly blocked', () => {
  const org = {
    adviser: primaryAdv,
    coAdviser: coAdv,
    adviserAvailability: { primaryStatus: 'available' },
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
  assert.equal(coAuth.canReviewOfficerSubmissions, false);
  assert.equal(coAuth.canPerformFullAdviserActions, false);
  assert.match(coAuth.approvalBlockedReason || '', /cannot approve/i);
});

test('2. Once Primary Adviser sets Portal Inactive, approval authority transfers to Substitute/Co-Adviser and Primary is paused', () => {
  const org = {
    adviser: primaryAdv,
    coAdviser: coAdv,
    adviserAvailability: {
      primaryStatus: 'unavailable',
      unavailableReason: 'Medical Leave',
    },
  };

  const primaryAuth = resolveEffectiveAdviserAuthority({
    organization: org,
    viewerUid: 'uid-primary',
    viewerEmail: primaryAdv.email,
  });
  assert.equal(primaryAuth.isPrimaryAdviser, true);
  assert.equal(primaryAuth.isPrimaryUnavailable, true);
  assert.equal(primaryAuth.canReviewOfficerSubmissions, false);
  assert.equal(primaryAuth.canPerformFullAdviserActions, false);

  const coAuth = resolveEffectiveAdviserAuthority({
    organization: org,
    viewerUid: 'uid-coadv',
    viewerEmail: coAdv.email,
  });
  assert.equal(coAuth.isCoAdviser, true);
  assert.equal(coAuth.isAuthorityTransferredToCoAdviser, true);
  assert.equal(coAuth.canReviewOfficerSubmissions, true);
  assert.equal(coAuth.canPerformFullAdviserActions, true);
  assert.equal(coAuth.actingOnBehalfOfName, primaryAdv.name);
});

test('3. validateAdviserPortalInactivation blocks going inactive when pending documents exist without a Substitute', () => {
  const blocked = validateAdviserPortalInactivation({
    hasCoAdviser: false,
    pendingDocuments: [
      { id: 'ap-1', documentType: 'proposal', title: 'Tech Summit' },
      { id: 'sbr-1', documentType: 'sbr', title: 'Tech Summit SBR' },
    ],
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.pendingCount, 2);
  assert.match(blocked.reason || '', /cannot set your Adviser Portal to Inactive/i);

  const allowedWithSub = validateAdviserPortalInactivation({
    hasCoAdviser: true,
    pendingDocuments: [{ id: 'ap-1', documentType: 'proposal', title: 'Tech Summit' }],
  });
  assert.equal(allowedWithSub.allowed, true);

  const allowedWithoutPendings = validateAdviserPortalInactivation({
    hasCoAdviser: false,
    pendingDocuments: [],
  });
  assert.equal(allowedWithoutPendings.allowed, true);
});

test('4. validateRemoveCoAdviser blocks removing Substitute while Primary is Inactive with pending documents', () => {
  const blocked = validateRemoveCoAdviser({
    primaryUnavailable: true,
    pendingDocuments: [{ id: 'fl-1', documentType: 'liquidation' }],
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason || '', /Cannot remove the Substitute/i);

  const allowedWhenActive = validateRemoveCoAdviser({
    primaryUnavailable: false,
    pendingDocuments: [{ id: 'fl-1', documentType: 'liquidation' }],
  });
  assert.equal(allowedWhenActive.allowed, true);
});

test('5. Legacy scheduled leave date range still evaluates cleanly', () => {
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

test('6. Uniqueness validation enforces 1-org rule across Primary Adviser & Co-Adviser and prevents same-org self-collision', () => {
  const orgs = [
    {
      id: 'org-1',
      name: 'STI Tech Society',
      adviser: { email: primaryAdv.email, employeeId: primaryAdv.employeeId },
      coAdviser: { email: coAdv.email, employeeId: coAdv.employeeId },
    },
  ];

  const crossConflict = findAdviserConflictInOrganizations({
    email: coAdv.email,
    employeeId: coAdv.employeeId,
    organizations: orgs,
    excludeOrgId: 'org-2',
  });
  assert.ok(crossConflict);
  assert.equal(crossConflict.field, 'email');

  const sameOrgSlotConflict = findAdviserConflictInOrganizations({
    email: primaryAdv.email,
    employeeId: primaryAdv.employeeId,
    organizations: orgs,
    excludeOrgId: 'org-1',
    excludeRole: 'co_adviser',
  });
  assert.ok(sameOrgSlotConflict);
  assert.equal(sameOrgSlotConflict.field, 'email');

  const cleanAssign = findAdviserConflictInOrganizations({
    email: 'fresh@ormoc.sti.edu.ph',
    employeeId: 'EMP-9999',
    organizations: orgs,
    excludeOrgId: 'org-1',
    excludeRole: 'co_adviser',
  });
  assert.equal(cleanAssign, null);

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
