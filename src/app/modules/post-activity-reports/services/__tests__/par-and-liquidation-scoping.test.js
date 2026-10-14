import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure mock models replicating:
 * 1. event-lifecycle.utils.ts (isOfficerProposal, isSasInstitutionalActivity)
 * 2. par.service.ts (generateDefaultPARSignatoryChain, 1-stage simultaneous signing)
 * 3. OfficerLiquidationModal & PostActivityReportWizardModal dropdown scoping
 * 4. approval-permissions.utils.ts (read-only for org documents in admin)
 */

const SAS_ORGS = [
  'sas',
  'sas_admin',
  'sao',
  'sao_admin',
  'admin',
  'sti',
  'sti_college',
  'institutional',
  'student affairs office',
  'student affairs services',
];

function isOfficerProposalMock(event) {
  if (!event) return false;

  if (
    event.isInstitutional === true ||
    event.isSasInternal === true ||
    event.isSasDirect === true ||
    event.isDirectPublished === true
  ) {
    return false;
  }

  const orgId = (
    event.organizationId ||
    event.hostingOrgId ||
    event.createdByOrgId ||
    event.orgId ||
    event.org ||
    ''
  ).toString().toLowerCase().trim();

  if (orgId && !SAS_ORGS.includes(orgId)) {
    return true;
  }
  if (orgId && SAS_ORGS.includes(orgId)) {
    return false;
  }

  const orgName = (
    event.hostingOrgName ||
    event.organizationName ||
    event.orgName ||
    ''
  ).toString().toLowerCase().trim();

  if (
    orgName.includes('student affairs') ||
    orgName === 'sas' ||
    orgName === 'sao' ||
    orgName.includes('institutional')
  ) {
    return false;
  }
  if (orgName && !orgName.includes('student affairs') && orgName !== 'sas' && orgName !== 'sao') {
    return true;
  }

  const ref = (event.referenceId || event.referenceNo || '').toString().toUpperCase().trim();
  if (ref.includes('-SAS-') || ref.startsWith('EVT-ADM-')) return false;
  if (ref.includes('-ORG-') || (ref.startsWith('AP-') && !ref.includes('-SAS-'))) return true;

  if (event.isOfficerProposal === true) return true;
  if (event.isOfficerProposal === false) return false;

  const role = (event.creatorRole || event.createdByRole || '').toString().toLowerCase().trim();
  if (role === 'officer' || role === 'student_officer') return true;
  if (['admin', 'sas_admin', 'sao_admin', 'sas'].includes(role)) return false;

  return false;
}

const isSasInstitutionalActivityMock = (event) => !isOfficerProposalMock(event);

/**
 * Filter simulation for FL and PAR creation dropdowns
 */
function isEventEligibleForAuthoring({
  event,
  userRole,
  userOrgId,
  userOrgName,
  existingDocEventIds = new Set(),
}) {
  if (!event || event.isDeleted === true || event.isCancelled === true) return false;

  // 1:1 Invariant: Concluded event cannot be selected if already documented
  if (existingDocEventIds.has(event.id)) return false;

  // Completion check
  const isCompleted =
    event.status === 'completed' ||
    event.proposalStatus === 'completed' ||
    event.lifecycleStatus === 'completed';
  if (!isCompleted) return false;

  const isSas = isSasInstitutionalActivityMock(event);

  if (userRole === 'admin' || userOrgId === 'sao_admin' || userOrgId === 'sas') {
    // SAS Admin: ONLY show SAS / Institutional events! (Student org activities NEVER show in dropdown)
    return isSas;
  } else {
    // Officer: ONLY show student org events belonging to their own organization!
    if (isSas) return false;

    const cleanOrgId = (userOrgId || '').trim().toLowerCase();
    const cleanOrgName = (userOrgName || '').trim().toLowerCase();

    const eventOrgIds = [
      event.hostingOrgId,
      event.organizationId,
      event.createdByOrgId,
      event.orgId,
    ]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());

    const eventOrgNames = [
      event.hostingOrgName,
      event.orgName,
      event.organizationName,
    ]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());

    const matchesOrg =
      (cleanOrgId && eventOrgIds.some((id) => id === cleanOrgId || id.includes(cleanOrgId) || cleanOrgId.includes(id))) ||
      (cleanOrgName && eventOrgNames.some((name) => name === cleanOrgName || name.includes(cleanOrgName) || cleanOrgName.includes(name))) ||
      (!cleanOrgId && !cleanOrgName);

    return matchesOrg;
  }
}

/**
 * Simulation of generateDefaultPARSignatoryChain:
 * 1 Stage only, all signatories in stage 1 have status 'current'
 */
function generateDefaultPARSignatoryChainMock(orgId, activeSignatories = [], isSasEvent = false) {
  const stageSigners = [];
  const accountedIds = new Set();

  if (!isSasEvent) {
    const sasAdviser = activeSignatories.find(
      (s) =>
        s.role === 'sas_head' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('student affairs'))
    );
    if (sasAdviser) {
      stageSigners.push({ signer: sasAdviser, action: 'endorse' });
      accountedIds.add(sasAdviser.id);
    }
  }

  const financeSigners = activeSignatories.filter(
    (s) =>
      !accountedIds.has(s.id) &&
      (s.role === 'accountant' || (s.roleTitle && s.roleTitle.toLowerCase().includes('accountant')))
  );
  financeSigners.forEach((sig) => {
    stageSigners.push({ signer: sig, action: 'endorse' });
    accountedIds.add(sig.id);
  });

  const academicSigners = activeSignatories.filter(
    (s) =>
      !accountedIds.has(s.id) &&
      (s.role === 'academic_head' || (s.roleTitle && s.roleTitle.toLowerCase().includes('academic head')))
  );
  academicSigners.forEach((sig) => {
    stageSigners.push({ signer: sig, action: 'endorse' });
    accountedIds.add(sig.id);
  });

  const executiveSigners = activeSignatories.filter(
    (s) =>
      !accountedIds.has(s.id) &&
      (s.role === 'school_president' || (s.roleTitle && s.roleTitle.toLowerCase().includes('president')))
  );
  executiveSigners.forEach((sig) => {
    stageSigners.push({ signer: sig, action: 'approve' });
    accountedIds.add(sig.id);
  });

  // Recommends 1 consolidated stage with status: 'current' for all signers
  const stageName = 'Stage 1: Post-Activity Review & Final Clearance';
  return stageSigners.map((item, idx) => ({
    id: `step-${idx + 1}`,
    step: idx + 1,
    stageIndex: 1,
    stageName,
    role: item.signer.role,
    roleTitle: item.signer.roleTitle,
    actionType: item.action,
    signatoryUid: item.signer.uid || item.signer.id,
    signatoryName: item.signer.name,
    signatoryEmail: item.signer.email,
    status: 'current', // ALL ACTIVE SIMULTANEOUSLY!
  }));
}

/**
 * Permissions simulation for Admin vs Officer on documents
 */
function resolveApprovalPermissionsMock(doc, user) {
  const isSasDoc =
    doc.isSasInternal === true ||
    doc.creatorRole === 'admin' ||
    doc.creatorRole === 'sas_admin' ||
    doc.organizationId === 'sao_admin' ||
    doc.organizationId === 'sas';

  const userIsAdmin = user.role === 'admin' || user.role === 'sas_admin';
  const isOwner = isSasDoc ? userIsAdmin : (!userIsAdmin && user.organizationId === doc.organizationId);

  const isPending = doc.status === 'pending' || doc.status === 'under_review';
  const isDraft = doc.status === 'draft';
  const isReturned = doc.status === 'returned';

  return {
    isOwner,
    canEdit: isOwner && (isDraft || isReturned),
    canWithdraw: isOwner && isPending,
    canDelete: isOwner && (isDraft || isReturned),
    canApprove: !isOwner && isPending && userIsAdmin,
    canReturn: !isOwner && isPending && userIsAdmin,
  };
}

describe('Dynamic PAR Signatory Pipeline & Simultaneous Parallel Signing', () => {
  const mockSignatories = [
    { id: 'sig-sas', uid: 'uid-sas', name: 'Dr. Santos', role: 'sas_head', roleTitle: 'Student Affairs Head' },
    { id: 'sig-fin', uid: 'uid-fin', name: 'Ms. Cruz', role: 'accountant', roleTitle: 'Campus Accountant' },
    { id: 'sig-acad', uid: 'uid-acad', name: 'Dean Reyes', role: 'academic_head', roleTitle: 'Academic Head' },
    { id: 'sig-pres', uid: 'uid-pres', name: 'Pres. Tan', role: 'school_president', roleTitle: 'School President' },
  ];

  test('PAR chain defaults to 1 STAGE ONLY with all signers active simultaneously', () => {
    const chain = generateDefaultPARSignatoryChainMock('jpcs', mockSignatories, false);

    assert.equal(chain.length, 4);
    assert.ok(chain.every((step) => step.stageIndex === 1), 'All steps must belong to Stage 1');
    assert.ok(
      chain.every((step) => step.status === 'current'),
      'All Stage 1 steps must have status "current" for simultaneous signing'
    );
    assert.equal(chain[0].stageName, 'Stage 1: Post-Activity Review & Final Clearance');
  });

  test('SAS-authored PAR omits redundant Stage 1 SAS endorsement step', () => {
    const chain = generateDefaultPARSignatoryChainMock('sao_admin', mockSignatories, true);

    assert.equal(chain.length, 3, 'SAS-authored PAR should not endorse its own report');
    assert.ok(!chain.some((s) => s.role === 'sas_head'));
    assert.ok(chain.every((s) => s.stageIndex === 1 && s.status === 'current'));
  });

  test('Simultaneous parallel signing allows any signer to sign without sequential lock', () => {
    const chain = generateDefaultPARSignatoryChainMock('jpcs', mockSignatories, false);

    // Accountant signs first
    const updatedChain = chain.map((step) =>
      step.signatoryUid === 'uid-fin'
        ? { ...step, status: 'endorsed', signedAt: new Date().toISOString() }
        : step
    );

    // Dean and President must still remain 'current' and accessible to sign
    const deanStep = updatedChain.find((s) => s.signatoryUid === 'uid-acad');
    const presStep = updatedChain.find((s) => s.signatoryUid === 'uid-pres');

    assert.equal(deanStep.status, 'current', 'Dean must still be active to sign');
    assert.equal(presStep.status, 'current', 'President must still be active to sign');
  });
});

describe('Authoring Dropdown & Event Scoping Rules (FL & PAR)', () => {
  const orgEvent = {
    id: 'evt-org-01',
    title: 'JPCS Hackathon 2026',
    hostingOrgId: 'jpcs',
    hostingOrgName: 'Junior Philippine Computer Society',
    status: 'completed',
    proposalStatus: 'completed',
    lifecycleStatus: 'completed',
  };

  const sasEvent = {
    id: 'evt-sas-01',
    title: 'University Convocation 2026',
    hostingOrgId: 'sas',
    hostingOrgName: 'Student Affairs Services',
    isInstitutional: true,
    status: 'completed',
    proposalStatus: 'completed',
    lifecycleStatus: 'completed',
  };

  const otherOrgEvent = {
    id: 'evt-org-02',
    title: 'SSC Leadership Camp',
    hostingOrgId: 'ssc',
    hostingOrgName: 'Supreme Student Council',
    status: 'completed',
    proposalStatus: 'completed',
    lifecycleStatus: 'completed',
  };

  test('SAS/Admin creation dropdown ONLY lists SAS/institutional activities', () => {
    const isEligibleOrg = isEventEligibleForAuthoring({
      event: orgEvent,
      userRole: 'admin',
      userOrgId: 'sao_admin',
    });
    const isEligibleSas = isEventEligibleForAuthoring({
      event: sasEvent,
      userRole: 'admin',
      userOrgId: 'sao_admin',
    });

    assert.equal(isEligibleOrg, false, "Student org event MUST NOT appear in SAS Admin's authoring dropdown");
    assert.equal(isEligibleSas, true, "SAS event MUST appear in SAS Admin's authoring dropdown");
  });

  test('Student Org Officer creation dropdown ONLY lists their own organization activities', () => {
    const isEligibleOwn = isEventEligibleForAuthoring({
      event: orgEvent,
      userRole: 'officer',
      userOrgId: 'jpcs',
      userOrgName: 'Junior Philippine Computer Society',
    });
    const isEligibleSas = isEventEligibleForAuthoring({
      event: sasEvent,
      userRole: 'officer',
      userOrgId: 'jpcs',
      userOrgName: 'Junior Philippine Computer Society',
    });
    const isEligibleOther = isEventEligibleForAuthoring({
      event: otherOrgEvent,
      userRole: 'officer',
      userOrgId: 'jpcs',
      userOrgName: 'Junior Philippine Computer Society',
    });

    assert.equal(isEligibleOwn, true, "Officer's own org event must appear in dropdown");
    assert.equal(isEligibleSas, false, "SAS event must NEVER appear in Officer's dropdown");
    assert.equal(isEligibleOther, false, "Other org's event must NEVER appear in Officer's dropdown");
  });

  test('1:1:1 Invariant: Concluded event with existing report is excluded from dropdown', () => {
    const takenIds = new Set(['evt-org-01']);
    const isEligible = isEventEligibleForAuthoring({
      event: orgEvent,
      userRole: 'officer',
      userOrgId: 'jpcs',
      existingDocEventIds: takenIds,
    });

    assert.equal(isEligible, false, 'Event already liquidated/reported must not be selectable again');
  });
});

describe('Admin Oversight & Read-Only Protections for Student Org Documents', () => {
  const studentOrgReport = {
    id: 'fl-org-01',
    eventTitle: 'JPCS Hackathon 2026',
    organizationId: 'jpcs',
    organizationName: 'Junior Philippine Computer Society',
    creatorRole: 'officer',
    status: 'under_review',
  };

  const sasDraftReport = {
    id: 'fl-sas-01',
    eventTitle: 'University Convocation 2026',
    organizationId: 'sao_admin',
    isSasInternal: true,
    creatorRole: 'admin',
    status: 'draft',
  };

  const adminUser = {
    uid: 'sao_admin_user',
    role: 'admin',
    organizationId: 'sao_admin',
  };

  test('Admin cannot delete or edit student organization documents (strictly read-only / reviewer)', () => {
    const perms = resolveApprovalPermissionsMock(studentOrgReport, adminUser);

    assert.equal(perms.isOwner, false, 'Admin is NOT the owner of a student org document');
    assert.equal(perms.canDelete, false, 'Admin must NOT have delete authority on student org documents');
    assert.equal(perms.canEdit, false, 'Admin must NOT have edit authority on student org documents');
    assert.equal(perms.canWithdraw, false, 'Admin must NOT withdraw student org documents');
    assert.equal(perms.canApprove, true, 'Admin can approve when reviewing pending submission');
    assert.equal(perms.canReturn, true, 'Admin can return for revisions when reviewing');
  });

  test('Admin CAN edit and delete their own SAS draft reports', () => {
    const perms = resolveApprovalPermissionsMock(sasDraftReport, adminUser);

    assert.equal(perms.isOwner, true, 'Admin IS the owner of SAS-authored documents');
    assert.equal(perms.canEdit, true, 'Admin can edit their own draft');
    assert.equal(perms.canDelete, true, 'Admin can delete / discard their own draft');
    assert.equal(perms.canApprove, false, 'Admin cannot self-approve their own document');
  });
});
