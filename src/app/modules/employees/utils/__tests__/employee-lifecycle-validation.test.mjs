import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEmployeeAssignments,
  evaluateArchiveEligibility,
  evaluateDeleteEligibility,
  evaluateAssignmentUnassignBlockers,
  evaluateEmployeeDeleteBlockers,
} from '../employee-lifecycle-validation.utils.ts';

const baseEmployee = {
  id: 'emp-1',
  employeeId: 'FAC-2026-001',
  firstName: 'Maria',
  middleName: 'Reyes',
  lastName: 'Santos',
  fullName: 'Maria Reyes Santos',
  status: 'ACTIVE',
  archived: false,
};

const emptyDatasets = {
  activities: [],
  liquidations: [],
  postActivityReports: [],
  supplementalBudgets: [],
};

test('resolveEmployeeAssignments matches Primary Adviser, Co-Adviser, and Active Signatory while ignoring archived/inactive records', () => {
  const orgs = [
    {
      id: 'org-1',
      name: 'IT Guild',
      acronym: 'ITG',
      status: 'active',
      adviser: { employeeId: 'FAC-2026-001', name: 'Maria Reyes Santos' },
    },
    {
      id: 'org-2',
      name: 'Robotics Club',
      acronym: 'ROBO',
      status: 'active',
      coAdviser: { name: 'Maria R. Santos' }, // fallback name variant match
    },
    {
      id: 'org-archived',
      name: 'Old Club',
      acronym: 'OLD',
      status: 'archived',
      adviser: { employeeId: 'FAC-2026-001', name: 'Maria Reyes Santos' },
    },
  ];

  const signatories = [
    {
      id: 'sig-1',
      employeeId: 'FAC-2026-001',
      name: 'Maria Reyes Santos',
      roleTitle: 'Program Head',
      email: 'maria@sti.edu',
      authUid: 'uid-maria',
      isActive: true,
    },
    {
      id: 'sig-inactive',
      employeeId: 'FAC-2026-001',
      name: 'Maria Reyes Santos',
      roleTitle: 'Former Dean',
      isActive: false,
    },
  ];

  const assignments = resolveEmployeeAssignments(baseEmployee, orgs, signatories);
  assert.equal(assignments.length, 3);
  assert.deepEqual(
    assignments.map((a) => a.kind),
    ['primary_adviser', 'co_adviser', 'institutional_signatory']
  );
  assert.equal(assignments[0].label, 'Adviser · ITG');
  assert.equal(assignments[1].label, 'Co-Adviser · ROBO');
  assert.equal(assignments[2].label, 'Signatory · Program Head');
});

test('evaluateArchiveEligibility blocks archiving assigned employees and allows unassigned active employees', () => {
  const activeAssignment = [
    {
      id: 'org:org-1:primary',
      kind: 'primary_adviser',
      label: 'Adviser · ITG',
      badgeTone: 'adviser',
      organizationId: 'org-1',
      organizationName: 'IT Guild',
      adviserRole: 'primary',
    },
  ];

  const blocked = evaluateArchiveEligibility(baseEmployee, activeAssignment);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason || '', /unassign/i);
  assert.match(blocked.reason || '', /Adviser · ITG/);

  const allowed = evaluateArchiveEligibility(baseEmployee, []);
  assert.equal(allowed.allowed, true);

  const alreadyArchived = evaluateArchiveEligibility(
    { ...baseEmployee, archived: true, status: 'ARCHIVED' },
    []
  );
  assert.equal(alreadyArchived.allowed, false);
});

test('evaluateDeleteEligibility enforces archived + unassigned + zero pending blockers', () => {
  const activeNotArchived = evaluateDeleteEligibility(baseEmployee, [], []);
  assert.equal(activeNotArchived.allowed, false);
  assert.match(activeNotArchived.reason || '', /archive/i);

  const archivedEmp = { ...baseEmployee, archived: true, status: 'ARCHIVED' };

  const stillAssigned = evaluateDeleteEligibility(
    archivedEmp,
    [
      {
        id: 'sig:sig-1',
        kind: 'institutional_signatory',
        label: 'Signatory · Academic Head',
        badgeTone: 'signatory',
        signatoryId: 'sig-1',
      },
    ],
    []
  );
  assert.equal(stillAssigned.allowed, false);
  assert.match(stillAssigned.reason || '', /unassign/i);

  const hasPendingBlocker = evaluateDeleteEligibility(archivedEmp, [], [
    {
      category: 'pending_signature',
      documentType: 'Activity Proposal',
      documentId: 'ap-1',
      title: 'Tech Summit',
      status: 'under_review',
      reason: 'Awaiting signature (Current Stage)',
    },
  ]);
  assert.equal(hasPendingBlocker.allowed, false);
  assert.match(hasPendingBlocker.reason || '', /pending workflow item/i);

  const clean = evaluateDeleteEligibility(archivedEmp, [], []);
  assert.equal(clean.allowed, true);
});

test('Institutional Signatory unassign is blocked by unsigned steps in AP, FL, PAR, or SBR', () => {
  const sigAssignment = {
    id: 'sig:sig-1',
    kind: 'institutional_signatory',
    label: 'Signatory · Program Head',
    badgeTone: 'signatory',
    signatoryId: 'sig-1',
    signatoryAuthUid: 'uid-maria',
    signatoryEmail: 'maria@sti.edu',
    signatoryName: 'Maria Reyes Santos',
  };

  const datasets = {
    activities: [
      {
        id: 'ap-1',
        referenceNo: 'AP-2026-001',
        title: 'Hackathon 2026',
        status: 'under_review',
        approvalChain: [
          { signatoryUid: 'uid-maria', signatoryEmail: 'maria@sti.edu', status: 'current' },
        ],
      },
    ],
    liquidations: [
      {
        id: 'fl-1',
        referenceNo: 'FL-2026-001',
        eventTitle: 'Hackathon 2026',
        status: 'pending',
        approvalChain: [
          { signatoryEmail: 'maria@sti.edu', status: 'waiting' },
        ],
      },
    ],
    postActivityReports: [
      {
        id: 'par-1',
        referenceNo: 'PAR-2026-001',
        eventTitle: 'Hackathon 2026',
        status: 'under_review',
        approvalChain: [
          { signatoryName: 'Maria Reyes Santos', status: 'current' },
        ],
      },
    ],
    supplementalBudgets: [
      {
        id: 'sbr-1',
        referenceNo: 'SBR-2026-001',
        eventTitle: 'Hackathon 2026',
        status: 'pending_signatories',
        approvalChain: [
          { signatoryUid: 'uid-maria', status: 'waiting' },
        ],
      },
    ],
  };

  const report = evaluateAssignmentUnassignBlockers(baseEmployee, sigAssignment, datasets);
  assert.equal(report.canProceed, false);
  assert.equal(report.blockers.length, 4);
  assert.deepEqual(
    report.blockers.map((b) => b.documentType),
    [
      'Activity Proposal',
      'Financial Liquidation',
      'Post-Activity Report',
      'Supplemental Budget Request',
    ]
  );
});

test('Institutional Signatory unassign succeeds when steps are already signed/waived or documents are approved/draft/archived', () => {
  const sigAssignment = {
    id: 'sig:sig-1',
    kind: 'institutional_signatory',
    label: 'Signatory · Program Head',
    badgeTone: 'signatory',
    signatoryId: 'sig-1',
    signatoryAuthUid: 'uid-maria',
    signatoryEmail: 'maria@sti.edu',
    signatoryName: 'Maria Reyes Santos',
  };

  const datasets = {
    activities: [
      // Already signed step on under_review doc -> NOT a blocker
      {
        id: 'ap-signed',
        title: 'Signed Event',
        status: 'under_review',
        approvalChain: [{ signatoryUid: 'uid-maria', status: 'endorsed' }],
      },
      // Already approved doc (e.g., runtime single-approval lock resolved doc) -> NOT a blocker
      {
        id: 'ap-approved',
        title: 'Already Approved Event',
        status: 'approved_president',
        approvalChain: [{ signatoryUid: 'uid-maria', status: 'current' }],
      },
      // Draft -> NOT a blocker
      {
        id: 'ap-draft',
        title: 'Draft Event',
        status: 'draft',
        approvalChain: [{ signatoryUid: 'uid-maria', status: 'waiting' }],
      },
      // Soft-deleted -> NOT a blocker
      {
        id: 'ap-deleted',
        title: 'Deleted Event',
        status: 'under_review',
        isDeleted: true,
        approvalChain: [{ signatoryUid: 'uid-maria', status: 'current' }],
      },
    ],
    liquidations: [
      {
        id: 'fl-approved',
        eventTitle: 'Closed FL',
        status: 'approved',
        approvalChain: [{ signatoryEmail: 'maria@sti.edu', status: 'approved' }],
      },
    ],
    postActivityReports: [
      {
        id: 'par-archived',
        eventTitle: 'Old PAR',
        status: 'under_review',
        isArchived: true,
        approvalChain: [{ signatoryEmail: 'maria@sti.edu', status: 'current' }],
      },
    ],
    supplementalBudgets: [
      {
        id: 'sbr-withdrawn',
        eventTitle: 'Withdrawn SBR',
        status: 'withdrawn',
        approvalChain: [{ signatoryUid: 'uid-maria', status: 'waiting' }],
      },
    ],
  };

  const report = evaluateAssignmentUnassignBlockers(baseEmployee, sigAssignment, datasets);
  assert.equal(report.canProceed, true);
  assert.equal(report.blockers.length, 0);
});

test('Club Adviser and Co-Adviser unassign is blocked by adviser reviews, in-flight submissions, and unconcluded approved activities (Option A)', () => {
  const coAdviserAssignment = {
    id: 'org:org-1:co_adviser',
    kind: 'co_adviser',
    label: 'Co-Adviser · ITG',
    badgeTone: 'adviser',
    organizationId: 'org-1',
    organizationName: 'IT Guild',
    adviserRole: 'co_adviser',
  };

  const datasets = {
    activities: [
      {
        id: 'ap-rev',
        organizationId: 'org-1',
        title: 'Orientation',
        status: 'for_adviser_review',
      },
      {
        id: 'ap-active',
        hostingOrgId: 'org-1',
        title: 'Ongoing Tech Week',
        status: 'activated',
        proposalStatus: 'approved',
      },
      // Different org -> ignored
      {
        id: 'ap-other-org',
        organizationId: 'org-999',
        title: 'Other Club Event',
        status: 'for_adviser_review',
      },
      // Concluded activity -> ignored
      {
        id: 'ap-done',
        organizationId: 'org-1',
        title: 'Concluded Seminar',
        status: 'activated',
        completedAt: '2026-10-01T12:00:00Z',
      },
    ],
    liquidations: [
      {
        id: 'fl-pending',
        organizationId: 'org-1',
        eventTitle: 'Sem 1 Fund',
        status: 'for_adviser_review',
      },
    ],
    postActivityReports: [
      {
        id: 'par-pending',
        organizationId: 'org-1',
        eventTitle: 'Sem 1 PAR',
        status: 'returned',
      },
    ],
    supplementalBudgets: [
      {
        id: 'sbr-pending',
        organizationId: 'org-1',
        eventTitle: 'Extra Venue Funds',
        status: 'for_sas_review',
      },
    ],
  };

  const report = evaluateAssignmentUnassignBlockers(baseEmployee, coAdviserAssignment, datasets);
  assert.equal(report.canProceed, false);
  assert.equal(report.blockers.length, 5);
  assert.deepEqual(
    report.blockers.map((b) => b.documentId),
    ['ap-rev', 'ap-active', 'fl-pending', 'par-pending', 'sbr-pending']
  );
});

test('Club Adviser unassign succeeds when all org activities are concluded and reports are approved/closed', () => {
  const adviserAssignment = {
    id: 'org:org-1:primary',
    kind: 'primary_adviser',
    label: 'Adviser · ITG',
    badgeTone: 'adviser',
    organizationId: 'org-1',
    organizationName: 'IT Guild',
    adviserRole: 'primary',
  };

  const datasets = {
    activities: [
      { id: 'ap-1', organizationId: 'org-1', title: 'Done Event', status: 'activated', completedAt: '2026-11-01' },
      { id: 'ap-2', organizationId: 'org-1', title: 'Draft Event', status: 'draft' },
      { id: 'ap-3', organizationId: 'org-1', title: 'Rejected Event', status: 'rejected' },
    ],
    liquidations: [
      { id: 'fl-1', organizationId: 'org-1', eventTitle: 'Done Event', status: 'approved' },
    ],
    postActivityReports: [
      { id: 'par-1', organizationId: 'org-1', eventTitle: 'Done Event', status: 'approved' },
    ],
    supplementalBudgets: [
      { id: 'sbr-1', organizationId: 'org-1', eventTitle: 'Done Event', status: 'approved' },
    ],
  };

  const report = evaluateAssignmentUnassignBlockers(baseEmployee, adviserAssignment, datasets);
  assert.equal(report.canProceed, true);
  assert.equal(report.blockers.length, 0);
});

test('evaluateEmployeeDeleteBlockers still catches lingering unsigned signatory steps for deactivated signatory records', () => {
  const historicalSignatories = [
    {
      id: 'sig-old',
      employeeId: 'FAC-2026-001',
      name: 'Maria Reyes Santos',
      email: 'maria@sti.edu',
      authUid: 'uid-maria',
      isActive: false,
    },
  ];

  const datasets = {
    ...emptyDatasets,
    activities: [
      {
        id: 'ap-lingering',
        title: 'Lingering Proposal',
        status: 'under_review',
        approvalChain: [{ signatoryEmail: 'maria@sti.edu', status: 'current' }],
      },
    ],
  };

  const report = evaluateEmployeeDeleteBlockers(baseEmployee, [], datasets, historicalSignatories);
  assert.equal(report.canProceed, false);
  assert.equal(report.blockers.length, 1);
  assert.equal(report.blockers[0].documentId, 'ap-lingering');
});
