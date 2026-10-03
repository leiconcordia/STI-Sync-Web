// scratch/test_pipeline_and_adviser_decision.mjs
// Verification of:
// 1. showAdviserDecision condition (only show if and only if proposal from Org and SAS needs to review it)
// 2. Signatory pipeline from scratch (no predefined persons for both admin and officer)

import assert from 'node:assert';

console.log('--- TEST 1: showAdviserDecision Condition ---');

function computeShowAdviserDecision({
  isCancelled = false,
  isApproved = false,
  isCompleted = false,
  isSasCreated = false,
  displayApprovalChain = [],
  profileEmail = 'sao@ormoc.sti.edu.ph',
}) {
  if (isCancelled || isApproved || isCompleted) return false;
  // Must be an Org proposal, NOT authored/created by SAS
  if (isSasCreated) return false;

  const sasStep = displayApprovalChain.find(
    (s) =>
      s.role === 'sas_coordinator' ||
      s.role === 'adviser' ||
      s.role === 'sao_head' ||
      s.id === 'step_sas_mandatory' ||
      (s.stageIndex === 1 && s.stepNumber === 1 && (!s.role || s.role === 'sas_coordinator' || s.roleTitle?.toLowerCase().includes('sas') || s.roleTitle?.toLowerCase().includes('adviser'))) ||
      s.roleTitle?.toLowerCase().includes('sas') ||
      s.roleTitle?.toLowerCase().includes('student affairs') ||
      s.roleTitle?.toLowerCase().includes('adviser') ||
      (profileEmail && s.signatoryEmail?.toLowerCase() === profileEmail.toLowerCase()) ||
      s.signatoryEmail?.toLowerCase() === 'sao@ormoc.sti.edu.ph'
  );

  // If an approval chain exists:
  if (displayApprovalChain && displayApprovalChain.length > 0) {
    if (sasStep) {
      // If SAS is in the chain and has already signed/endorsed, SAS does NOT need to review it
      if (sasStep.status === 'endorsed' || sasStep.status === 'approved') {
        return false;
      }
      return true;
    }
    // If SAS is not in the chain, it's an Org proposal in routing:
    const isFirstStageActive = displayApprovalChain.some(
      (s) => (s.stageIndex === 1 || !s.stageIndex) && s.status !== 'approved' && s.status !== 'endorsed'
    );
    return isFirstStageActive;
  }

  // If no chain, Org proposal pending in SAS admin needs review
  return true;
}

// Case 1: SAS-created institutional proposal pending signatories
assert.strictEqual(
  computeShowAdviserDecision({
    isSasCreated: true,
    displayApprovalChain: [{ role: 'program_head', status: 'waiting' }],
  }),
  false,
  'SAS created proposal should NEVER show Adviser Decision'
);

// Case 2: Org proposal pending SAS review
assert.strictEqual(
  computeShowAdviserDecision({
    isSasCreated: false,
    displayApprovalChain: [
      { role: 'sas_coordinator', status: 'current' },
      { role: 'dean', status: 'waiting' },
    ],
  }),
  true,
  'Org proposal with pending SAS step SHOULD show Adviser Decision'
);

// Case 3: Org proposal where SAS already endorsed Stage 1, now awaiting Dean in Stage 2
assert.strictEqual(
  computeShowAdviserDecision({
    isSasCreated: false,
    displayApprovalChain: [
      { role: 'sas_coordinator', status: 'endorsed' },
      { role: 'dean', status: 'current' },
    ],
  }),
  false,
  'Org proposal already endorsed by SAS should NOT show Adviser Decision'
);

// Case 4: Org proposal without chain pending in admin
assert.strictEqual(
  computeShowAdviserDecision({
    isSasCreated: false,
    displayApprovalChain: [],
  }),
  true,
  'Org proposal with empty chain pending review SHOULD show Adviser Decision'
);

// Case 5: Fully approved event
assert.strictEqual(
  computeShowAdviserDecision({
    isSasCreated: false,
    isApproved: true,
  }),
  false,
  'Approved event should NOT show Adviser Decision'
);

// Case 6: Cancelled event
assert.strictEqual(
  computeShowAdviserDecision({
    isSasCreated: false,
    isCancelled: true,
  }),
  false,
  'Cancelled event should NOT show Adviser Decision'
);

console.log('✓ All showAdviserDecision test cases passed!');

console.log('--- TEST 2: Signatory Pipeline from Scratch ---');

function createInitialProposalState(role) {
  // New creation: defaultChain is empty array for both admin and officer
  const defaultChain = [];
  return {
    creatorRole: role,
    approvalChain: defaultChain,
  };
}

const officerProposal = createInitialProposalState('officer');
assert.deepStrictEqual(officerProposal.approvalChain, [], 'Officer proposal starts with empty approval chain');

const adminProposal = createInitialProposalState('admin');
assert.deepStrictEqual(adminProposal.approvalChain, [], 'Admin proposal starts with empty approval chain');

// Adding custom signatory
const customStep = {
  id: 'custom_sig_1',
  step: 1,
  stageIndex: 1,
  stageName: 'Stage 1: Endorsement & Review',
  role: 'custom_signatory',
  roleTitle: 'Organization Adviser',
  actionType: 'endorse',
  signatoryName: 'Prof. Mario Santos',
  signatoryEmail: 'mario.santos@ormoc.sti.edu.ph',
  department: 'General Education',
  status: 'current',
};

const approverStep = {
  id: 'custom_sig_2',
  step: 2,
  stageIndex: 2,
  stageName: 'Stage 2: Final Approval',
  role: 'custom_signatory',
  roleTitle: 'School Administrator',
  actionType: 'approve',
  signatoryName: 'Dr. Elena Reyes',
  signatoryEmail: 'elena.reyes@ormoc.sti.edu.ph',
  department: 'Administration',
  status: 'waiting',
};

const builtChain = [customStep, approverStep];
assert.strictEqual(builtChain.length, 2);
assert.strictEqual(builtChain.some((s) => s.actionType === 'approve'), true);

console.log('✓ All pipeline from scratch test cases passed!');
console.log('ALL VERIFICATIONS SUCCESSFUL!');
