import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSignatoryDecisionCapabilities,
  applySingleApprovalDemotion,
  applySelfEndorseDemotion,
  restoreDemotedApproversOnRevision,
} from './approver-resolution.utils.ts';
import {
  normalizeApprovalStages,
  countApprovers,
  hasAtLeastOneApprover,
} from './stage-normalization.utils.ts';
import { getSignatoryProgress } from '../../events/utils/event-lifecycle.utils.ts';

const adminExec = {
  id: 'sig-admin',
  name: 'Sheena Joy Muyuela',
  email: 'admin@sti.edu',
  role: 'school_administrator',
  roleTitle: 'School Administrator',
  canApproveProposal: true,
  canApproveLiquidation: true,
  canApprovePar: true,
};

const presidentExec = {
  id: 'sig-pres',
  name: 'Dr. Maria Santos',
  email: 'president@sti.edu',
  role: 'school_president',
  roleTitle: 'School President',
  canApproveProposal: true,
  canApproveLiquidation: true,
  canApprovePar: true,
};

const programHead = {
  id: 'sig-ph',
  name: 'Prof. Juan Cruz',
  email: 'ph@sti.edu',
  role: 'program_head',
  roleTitle: 'Program Head',
  canApproveProposal: false,
  canApproveLiquidation: false,
  canApprovePar: false,
};

test('1. Single Approver pipeline shows Approve button ONLY (no Endorse option)', () => {
  const chain = [
    { id: 's1', step: 1, stageIndex: 1, role: 'program_head', actionType: 'endorse', signatoryUid: 'sig-ph', signatoryName: programHead.name, status: 'endorsed' },
    { id: 's2', step: 2, stageIndex: 2, role: 'school_president', actionType: 'approve', signatoryUid: 'sig-pres', signatoryName: presidentExec.name, status: 'current' },
  ];

  const caps = resolveSignatoryDecisionCapabilities({
    chain,
    myStepIndex: 1,
    signatory: presidentExec,
    docType: 'proposal',
  });

  assert.equal(caps.canApprove, true);
  assert.equal(caps.canEndorseInsteadOfApprove, false);
  assert.equal(caps.primaryActionMode, 'approve_only');
  assert.equal(caps.isDemotedToEndorserOnly, false);
});

test('2. 2-Approver Sequential pipeline: Approver #1 sees BOTH Approve and Endorse & Forward', () => {
  const chain = [
    { id: 's1', step: 1, stageIndex: 1, role: 'program_head', actionType: 'endorse', signatoryUid: 'sig-ph', signatoryName: programHead.name, status: 'endorsed' },
    { id: 's2', step: 2, stageIndex: 2, role: 'school_administrator', actionType: 'approve', signatoryUid: 'sig-admin', signatoryName: adminExec.name, status: 'current' },
    { id: 's3', step: 3, stageIndex: 3, role: 'school_president', actionType: 'approve', signatoryUid: 'sig-pres', signatoryName: presidentExec.name, status: 'waiting' },
  ];

  const caps = resolveSignatoryDecisionCapabilities({
    chain,
    myStepIndex: 1,
    signatory: adminExec,
    docType: 'proposal',
  });

  assert.equal(caps.canApprove, true);
  assert.equal(caps.canEndorseInsteadOfApprove, true);
  assert.equal(caps.otherUnsignedApproversCount, 1);
  assert.equal(caps.primaryActionMode, 'approve_or_endorse');
});

test('3. Approver #1 chooses Endorse & Forward -> gets Endorsed by:, and Approver #2 (last remaining) gets Approve ONLY', () => {
  const chain = [
    { id: 's1', step: 1, stageIndex: 1, role: 'program_head', actionType: 'endorse', signatoryUid: 'sig-ph', signatoryName: programHead.name, status: 'endorsed' },
    { id: 's2', step: 2, stageIndex: 2, role: 'school_administrator', actionType: 'approve', signatoryLabel: 'Approved by:', signatoryUid: 'sig-admin', signatoryName: adminExec.name, status: 'current' },
    { id: 's3', step: 3, stageIndex: 3, role: 'school_president', actionType: 'approve', signatoryLabel: 'Approved by:', signatoryUid: 'sig-pres', signatoryName: presidentExec.name, status: 'waiting' },
  ];

  // Approver #1 chooses Endorse & Forward
  chain[1] = {
    ...applySelfEndorseDemotion(chain[1], 'Endorsed by:'),
    status: 'endorsed',
  };
  chain[2] = { ...chain[2], status: 'current' };

  assert.equal(chain[1].actionType, 'endorse');
  assert.equal(chain[1].signatoryLabel, 'Endorsed by:');
  assert.equal(chain[1].demotedFromApprover, true);
  assert.equal(chain[1].demotedReason, 'self_endorsed');

  // Now Approver #2 is the LAST remaining unsigned approver -> MUST see Approve ONLY (prevents 0-approval deadlock)
  const presCaps = resolveSignatoryDecisionCapabilities({
    chain,
    myStepIndex: 2,
    signatory: presidentExec,
    docType: 'proposal',
  });

  assert.equal(presCaps.canApprove, true);
  assert.equal(presCaps.canEndorseInsteadOfApprove, false);
  assert.equal(presCaps.primaryActionMode, 'approve_only');
});

test('4. Approver #1 clicks Approve -> Approver #2 auto-demotes to Noted by: (Endorser Only) and stays active to co-sign', () => {
  const initialChain = [
    { id: 's1', step: 1, stageIndex: 1, role: 'program_head', actionType: 'endorse', signatoryUid: 'sig-ph', signatoryName: programHead.name, status: 'endorsed' },
    { id: 's2', step: 2, stageIndex: 2, role: 'school_administrator', actionType: 'approve', signatoryLabel: 'Approved by:', signatoryUid: 'sig-admin', signatoryName: adminExec.name, status: 'current' },
    { id: 's3', step: 3, stageIndex: 3, role: 'school_president', actionType: 'approve', signatoryLabel: 'Approved by:', signatoryUid: 'sig-pres', signatoryName: presidentExec.name, status: 'waiting' },
  ];

  initialChain[1] = { ...initialChain[1], status: 'approved' };
  const afterApprovalChain = applySingleApprovalDemotion(initialChain, 1, {
    demotedLabel: 'Noted by:',
    activateWaitingSteps: true,
  });

  assert.equal(afterApprovalChain[1].status, 'approved');
  assert.equal(afterApprovalChain[2].actionType, 'endorse');
  assert.equal(afterApprovalChain[2].signatoryLabel, 'Noted by:');
  assert.equal(afterApprovalChain[2].demotedFromApprover, true);
  assert.equal(afterApprovalChain[2].demotedReason, 'already_approved');
  assert.equal(afterApprovalChain[2].status, 'current'); // Open to co-sign under Option A

  // When Approver #2 opens the modal, they see Noted/Endorse Only + Already Approved banner
  const presCaps = resolveSignatoryDecisionCapabilities({
    chain: afterApprovalChain,
    myStepIndex: 2,
    signatory: presidentExec,
    docType: 'proposal',
  });

  assert.equal(presCaps.isAlreadyApproved, true);
  assert.equal(presCaps.approvedBySignatoryName, adminExec.name);
  assert.equal(presCaps.canApprove, false);
  assert.equal(presCaps.canEndorseInsteadOfApprove, false);
  assert.equal(presCaps.isDemotedToEndorserOnly, true);
  assert.equal(presCaps.primaryActionMode, 'note_only');
});

test('5. 2-Approver Parallel Stage (Same Stage): both initially see Approve OR Endorse; once 1 approves, peer demotes', () => {
  const parallelChain = [
    { id: 's1', step: 1, stageIndex: 1, role: 'school_administrator', actionType: 'approve', signatoryUid: 'sig-admin', signatoryName: adminExec.name, status: 'current' },
    { id: 's2', step: 2, stageIndex: 1, role: 'school_president', actionType: 'approve', signatoryUid: 'sig-pres', signatoryName: presidentExec.name, status: 'current' },
  ];

  const adminCaps = resolveSignatoryDecisionCapabilities({
    chain: parallelChain,
    myStepIndex: 0,
    signatory: adminExec,
    docType: 'liquidation',
  });
  const presCaps = resolveSignatoryDecisionCapabilities({
    chain: parallelChain,
    myStepIndex: 1,
    signatory: presidentExec,
    docType: 'liquidation',
  });

  assert.equal(adminCaps.primaryActionMode, 'approve_or_endorse');
  assert.equal(presCaps.primaryActionMode, 'approve_or_endorse');

  // President approves first
  parallelChain[1] = { ...parallelChain[1], status: 'approved' };
  const demoted = applySingleApprovalDemotion(parallelChain, 1, {
    demotedLabel: 'Noted by:',
    activateWaitingSteps: true,
  });

  const adminCapsAfter = resolveSignatoryDecisionCapabilities({
    chain: demoted,
    myStepIndex: 0,
    signatory: adminExec,
    docType: 'liquidation',
  });
  assert.equal(adminCapsAfter.canApprove, false);
  assert.equal(adminCapsAfter.isDemotedToEndorserOnly, true);
  assert.equal(adminCapsAfter.approvedBySignatoryName, presidentExec.name);
  assert.equal(adminCapsAfter.primaryActionMode, 'note_only');
});

test('6. Return for Revision restores demoted approvers back to approve authority', () => {
  const chain = [
    { id: 's1', step: 1, stageIndex: 1, role: 'program_head', actionType: 'endorse', signatoryLabel: 'Endorsed by:', status: 'endorsed' },
    { id: 's2', step: 2, stageIndex: 2, role: 'school_administrator', actionType: 'endorse', signatoryLabel: 'Endorsed by:', demotedFromApprover: true, demotedReason: 'self_endorsed', status: 'endorsed' },
    { id: 's3', step: 3, stageIndex: 3, role: 'school_president', actionType: 'approve', signatoryLabel: 'Approved by:', status: 'returned' },
  ];

  const restored = restoreDemotedApproversOnRevision(chain);
  assert.equal(restored[0].actionType, 'endorse');
  assert.equal(restored[1].actionType, 'approve');
  assert.equal(restored[1].signatoryLabel, 'Approved by:');
  assert.equal(restored[1].demotedFromApprover, undefined);
  assert.equal(restored[2].actionType, 'approve');
});

test('7. normalizeApprovalStages preserves 2+ configured Approvers without stripping them', () => {
  const multiApproverChain = [
    { id: 's1', stageIndex: 1, actionType: 'endorse', signatoryName: programHead.name },
    { id: 's2', stageIndex: 3, actionType: 'approve', signatoryName: adminExec.name },
    { id: 's3', stageIndex: 5, actionType: 'approve', signatoryName: presidentExec.name },
  ];

  const normalized = normalizeApprovalStages(multiApproverChain);
  assert.equal(countApprovers(normalized), 2);
  assert.equal(hasAtLeastOneApprover(normalized), true);
  assert.deepEqual(
    normalized.map((s) => ({ step: s.step, stageIndex: s.stageIndex, actionType: s.actionType })),
    [
      { step: 1, stageIndex: 1, actionType: 'endorse' },
      { step: 2, stageIndex: 2, actionType: 'approve' },
      { step: 3, stageIndex: 3, actionType: 'approve' },
    ]
  );
});

test('8. getSignatoryProgress reports true signed count (1/2) even when document is already Approved by 1 of 2 approvers', () => {
  const partialApprovedEvent = {
    status: 'approved',
    proposalStatus: 'approved',
    approvalChain: [
      { id: 's1', status: 'current', actionType: 'endorse', signatoryName: adminExec.name },
      { id: 's2', status: 'approved', actionType: 'approve', signatoryName: presidentExec.name, signedAt: '2026-11-24T13:35:00Z' },
    ],
  };

  const progress1 = getSignatoryProgress(partialApprovedEvent);
  assert.equal(progress1.signedCount, 1);
  assert.equal(progress1.totalCount, 2);
  assert.equal(progress1.ratioText, '1/2');
  assert.equal(progress1.isComplete, false);
  assert.equal(progress1.percentage, 50);

  partialApprovedEvent.approvalChain[0].status = 'endorsed';
  const progress2 = getSignatoryProgress(partialApprovedEvent);
  assert.equal(progress2.signedCount, 2);
  assert.equal(progress2.totalCount, 2);
  assert.equal(progress2.ratioText, '2/2');
  assert.equal(progress2.isComplete, true);
  assert.equal(progress2.percentage, 100);
});
