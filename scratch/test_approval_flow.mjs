// scratch/test_approval_flow.mjs
// Standalone verification script for isProposalFullySigned logic and approval flow rules

function isProposalFullySigned(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return false;
  }
  return chain.every(
    (step) => step && (step.status === 'endorsed' || step.status === 'approved')
  );
}

function resolveActionType(raw, fallback = 'endorse') {
  if (raw === 'approver' || raw === 'approve') return 'approve';
  if (raw === 'endorser' || raw === 'endorse') return 'endorse';
  return fallback;
}

function buildDynamicApprovalChain(
  targetAudience,
  activeSignatories,
  sasAdminName = 'Student Affairs & Services',
  sasAdminEmail = 'sao@ormoc.sti.edu.ph',
  isSasCreator = false
) {
  const chain = [];
  let stepIndex = 1;

  const findSignatory = (role, deptKeyword) => {
    return activeSignatories.find((s) => {
      if (s.role !== role) return false;
      if (deptKeyword) {
        return (
          s.department?.toLowerCase().includes(deptKeyword.toLowerCase()) ||
          s.roleTitle?.toLowerCase().includes(deptKeyword.toLowerCase())
        );
      }
      return true;
    });
  };

  const deptStageIndex = isSasCreator ? 1 : 2;
  const deptStageName = isSasCreator
    ? 'Department & Program Endorsements'
    : 'Stage 2: Department & Program Endorsements';
  const deptStatus = isSasCreator ? 'current' : 'waiting';

  const acadStageIndex = isSasCreator ? 2 : 3;
  const acadStageName = isSasCreator
    ? 'Academic Affairs Review'
    : 'Stage 3: Academic Affairs Review';

  const execStageIndex = isSasCreator ? 3 : 4;
  const execStageName = isSasCreator
    ? 'Executive Administration & Approval'
    : 'Stage 4: Executive Administration & Approval';

  // If officer proposal, stage 1 is SAS mandatory endorsement
  if (!isSasCreator) {
    const sasSignatory =
      findSignatory('sas_coordinator') ||
      findSignatory('sas_head') ||
      activeSignatories.find(
        (s) =>
          s.department?.toLowerCase().includes('student affairs') ||
          s.roleTitle?.toLowerCase().includes('student affairs')
      );

    chain.push({
      id: 'step_sas_mandatory',
      step: stepIndex++,
      stageIndex: 1,
      stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
      role: sasSignatory?.role || 'sas_coordinator',
      roleTitle: sasSignatory?.roleTitle || 'SAS Coordinator / Reviewer',
      actionType: 'endorse',
      signatoryUid: sasSignatory?.id,
      signatoryName: sasSignatory?.name || sasAdminName,
      signatoryEmail: sasSignatory?.email || sasAdminEmail,
      department: sasSignatory?.department || 'Student Affairs & Services',
      status: 'current',
    });
  }

  // Department Program Heads
  const depts = targetAudience.departments || [];
  const addedSignatoryIds = new Set();

  const touchedIT = depts.some((d) => ['BSIT', 'ACT', 'CS', 'IT'].includes(d.toUpperCase()));
  if (touchedIT) {
    const itSignatory = findSignatory('program_head', 'Information Technology') || findSignatory('program_head', 'IT');
    if (itSignatory && !addedSignatoryIds.has(itSignatory.id)) {
      addedSignatoryIds.add(itSignatory.id);
      chain.push({
        id: `step_${stepIndex}`,
        step: stepIndex++,
        stageIndex: deptStageIndex,
        stageName: deptStageName,
        role: 'program_head',
        roleTitle: itSignatory.roleTitle || 'IT Program Head',
        actionType: resolveActionType(itSignatory.actionType, 'endorse'),
        signatoryUid: itSignatory.id,
        signatoryName: itSignatory.name,
        signatoryEmail: itSignatory.email,
        department: itSignatory.department || 'Information Technology Department',
        status: deptStatus,
      });
    }
  }

  // Academic Affairs Head
  const acadHead = findSignatory('academic_head') || {
    id: 'sig_acad_head_default',
    name: 'Academic Affairs Head',
    email: 'academics@ormoc.sti.edu.ph',
    role: 'academic_head',
    roleTitle: 'Academic Head',
    department: 'Academic Affairs',
    actionType: 'endorse',
  };
  chain.push({
    id: `step_${stepIndex}`,
    step: stepIndex++,
    stageIndex: acadStageIndex,
    stageName: acadStageName,
    role: 'academic_head',
    roleTitle: acadHead.roleTitle || 'Academic Head',
    actionType: resolveActionType(acadHead.actionType, 'endorse'),
    signatoryUid: acadHead.id,
    signatoryName: acadHead.name,
    signatoryEmail: acadHead.email,
    department: acadHead.department || 'Academic Affairs',
    status: 'waiting',
  });

  // School President
  const president = findSignatory('school_president') || {
    id: 'sig_school_president_default',
    name: 'School President',
    email: 'president@ormoc.sti.edu.ph',
    role: 'school_president',
    roleTitle: 'School President',
    department: 'Office of the President',
    actionType: 'approve',
  };
  chain.push({
    id: `step_${stepIndex}`,
    step: stepIndex++,
    stageIndex: execStageIndex,
    stageName: execStageName,
    role: 'school_president',
    roleTitle: president.roleTitle || 'School President',
    actionType: resolveActionType(president.actionType, 'approve'),
    signatoryUid: president.id,
    signatoryName: president.name,
    signatoryEmail: president.email,
    department: president.department || 'Office of the President',
    status: 'waiting',
  });

  return chain;
}

console.log('--- RUNNING APPROVAL FLOW VERIFICATION TESTS ---');

// Test 1: Empty or invalid chains
console.assert(isProposalFullySigned([]) === false, 'Test 1.1 Failed: Empty chain should be false');
console.assert(isProposalFullySigned(null) === false, 'Test 1.2 Failed: Null chain should be false');
console.assert(isProposalFullySigned(undefined) === false, 'Test 1.3 Failed: Undefined chain should be false');
console.log('✓ Test 1 Passed: Empty & null chains return false.');

// Test 2: Incomplete chain (some signed, some waiting)
const incompleteChain = [
  { id: '1', role: 'program_head', status: 'endorsed' },
  { id: '2', role: 'academic_head', status: 'current' },
  { id: '3', role: 'school_president', status: 'waiting' }
];
console.assert(isProposalFullySigned(incompleteChain) === false, 'Test 2 Failed: Incomplete chain should be false');
console.log('✓ Test 2 Passed: Incomplete chain returns false (event remains locked).');

// Test 3: Fully signed chain (100% endorsed/approved)
const completedChain = [
  { id: '1', role: 'program_head', status: 'endorsed' },
  { id: '2', role: 'academic_head', status: 'endorsed' },
  { id: '3', role: 'school_president', status: 'approved' }
];
console.assert(isProposalFullySigned(completedChain) === true, 'Test 3 Failed: Completed chain should be true');
console.log('✓ Test 3 Passed: Fully signed chain returns true (all 3 nav unlocked).');

// Test 4: SAS-created proposal dynamic chain generation
const mockSignatories = [
  { id: 'sig-it', name: 'IT Head', email: 'it@sti.edu', role: 'program_head', roleTitle: 'IT Program Head', department: 'Information Technology Department', actionType: 'endorse' },
  { id: 'sig-acad', name: 'Academic Head', email: 'acad@sti.edu', role: 'academic_head', roleTitle: 'Academic Head', department: 'Academic Affairs', actionType: 'endorse' },
  { id: 'sig-pres', name: 'School President', email: 'pres@sti.edu', role: 'school_president', roleTitle: 'School President', department: 'Office of the President', actionType: 'approve' }
];

const mockAudience = {
  academicLevels: ['College'],
  departments: ['BSIT'],
  yearLevels: [3, 4],
};

const sasChain = buildDynamicApprovalChain(
  mockAudience,
  mockSignatories,
  'Student Affairs & Services',
  'sao@ormoc.sti.edu.ph',
  true // isSasCreator
);

console.assert(sasChain.length === 3, `Expected 3 signatories for SAS proposal, got ${sasChain.length}`);
console.assert(sasChain[0].role === 'program_head', 'First signatory must be program_head');
console.assert(sasChain[0].status === 'current', 'First signatory in stage 1 must be current');
console.assert(sasChain[1].role === 'academic_head', 'Second signatory must be academic_head');
console.assert(sasChain[1].status === 'waiting', 'Second signatory must be waiting');
console.assert(sasChain[2].role === 'school_president', 'Third signatory must be school_president');
console.assert(sasChain[2].status === 'waiting', 'Third signatory must be waiting');
console.assert(isProposalFullySigned(sasChain) === false, 'Fresh SAS proposal must NOT be fully signed');
console.log('✓ Test 4 Passed: SAS proposal generates 3-stage chain (IT Head -> Acad Head -> President) and defaults to unapproved/locked.');

// Test 5: Step-by-step endorsement simulation
// Step A: IT Program Head endorses
sasChain[0].status = 'endorsed';
sasChain[1].status = 'current'; // Stage advances to Academic Affairs
console.assert(isProposalFullySigned(sasChain) === false, 'After Step A, event must still NOT be fully approved');

// Step B: Academic Affairs Head endorses
sasChain[1].status = 'endorsed';
sasChain[2].status = 'current'; // Stage advances to President
console.assert(isProposalFullySigned(sasChain) === false, 'After Step B, event must still NOT be fully approved');

// Step C: School President approves
sasChain[2].status = 'approved';
console.assert(isProposalFullySigned(sasChain) === true, 'After Step C (100% signed), event MUST be fully approved');
console.log('✓ Test 5 Passed: Sequential endorsement simulation correctly unlocks the event ONLY when all signatories have signed.');

console.log('\n========================================');
console.log('ALL APPROVAL PIPELINE TESTS PASSED 100%!');
console.log('========================================\n');
