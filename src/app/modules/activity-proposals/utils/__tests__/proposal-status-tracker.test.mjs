import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDocumentTrackingState,
  buildSevenStageTrackerSteps,
  isHiddenFromSasAndSignatories,
  isDocumentForAdviserReview,
  isOfficerAuthoredRecord,
  requiresInstitutionalSignatories,
} from '../proposal-status-tracker.utils.ts';
import {
  canWithdrawProposal,
  canEditProposal,
} from '../../../events/utils/event-lifecycle.utils.ts';

test('resolves all 7 canonical statuses accurately across AP, PAR, and FL', () => {
  // 1. Draft
  const draft = resolveDocumentTrackingState({ proposalStatus: 'draft', status: 'draft' }, 'AP');
  assert.equal(draft.canonical, 'draft');
  assert.equal(draft.label, 'Draft');
  assert.equal(isHiddenFromSasAndSignatories({ proposalStatus: 'draft' }), true);

  // 2. For Adviser Review
  const adviserRev = resolveDocumentTrackingState(
    { proposalStatus: 'for_adviser_review', status: 'for_adviser_review', submittedByOfficer: true },
    'AP'
  );
  assert.equal(adviserRev.canonical, 'for_adviser_review');
  assert.equal(adviserRev.label, 'For Adviser Review');
  assert.equal(adviserRev.isForAdviserReview, true);
  assert.equal(isDocumentForAdviserReview({ status: 'for_adviser_review' }), true);
  assert.equal(isOfficerAuthoredRecord({ submittedByOfficer: true }), true);
  assert.equal(isHiddenFromSasAndSignatories({ proposalStatus: 'for_adviser_review' }), true);

  // 3. For Revision (returned by Club Adviser)
  const retAdviser = resolveDocumentTrackingState(
    { proposalStatus: 'returned', status: 'returned_for_revision', isReturned: true, returnedByRole: 'adviser' },
    'AP'
  );
  assert.equal(retAdviser.canonical, 'for_revision');
  assert.equal(retAdviser.label, 'For Revision');
  assert.equal(retAdviser.returnedByLabel, 'Returned by Club Adviser');
  assert.equal(
    isHiddenFromSasAndSignatories({ proposalStatus: 'returned', isReturned: true, returnedByRole: 'adviser' }),
    true
  );

  // 4 & 5. Approved by Adviser -> For SAS Review (Org Funds = Direct SAS)
  const forSasDirect = resolveDocumentTrackingState(
    {
      proposalStatus: 'pending',
      status: 'under_review',
      fundingSource: 'organization_funds',
      adviserReview: { status: 'approved', reviewedByName: 'Prof. Santos' },
      submittedToSasAt: '2026-11-24T00:00:00Z',
    },
    'AP'
  );
  assert.equal(forSasDirect.canonical, 'for_sas_review');
  assert.equal(forSasDirect.isApprovedByAdviser, true);
  assert.equal(forSasDirect.label, 'For SAS Review');
  assert.equal(forSasDirect.requiresSignatories, false);
  assert.equal(isHiddenFromSasAndSignatories({ proposalStatus: 'pending', status: 'under_review' }), false);

  // 5b. For SAS Review (School Budget / Misc Fee -> requires Signatories)
  const forSasMisc = resolveDocumentTrackingState(
    {
      proposalStatus: 'pending',
      status: 'under_review',
      fundingSource: 'school_budget',
      isPendingSasVetting: true,
      adviserReview: { status: 'approved', reviewedByName: 'Prof. Santos' },
    },
    'AP'
  );
  assert.equal(forSasMisc.canonical, 'for_sas_review');
  assert.equal(forSasMisc.requiresSignatories, true);
  assert.equal(requiresInstitutionalSignatories({ fundingSource: 'school_budget' }), true);

  // 6. Approved
  const approved = resolveDocumentTrackingState({ proposalStatus: 'approved', status: 'approved_president' }, 'AP');
  assert.equal(approved.canonical, 'approved');
  assert.equal(approved.label, 'Approved');
  assert.equal(approved.isApprovedByAdviser, true);

  // 7. Rejected (by Club Adviser before SAS -> hidden from SAS/Signatories)
  const rejectedAdv = resolveDocumentTrackingState(
    { proposalStatus: 'rejected', status: 'rejected', rejectedByRole: 'adviser' },
    'PAR'
  );
  assert.equal(rejectedAdv.canonical, 'rejected');
  assert.equal(rejectedAdv.rejectedByLabel, 'Rejected by Club Adviser');
  assert.equal(
    isHiddenFromSasAndSignatories({ status: 'rejected', rejectedByRole: 'adviser' }),
    true
  );
  // Rejected after reaching SAS -> remains visible to SAS
  assert.equal(
    isHiddenFromSasAndSignatories({
      status: 'rejected',
      rejectedByRole: 'sas',
      submittedToSasAt: '2026-11-24T00:00:00Z',
    }),
    false
  );
});

test('buildSevenStageTrackerSteps marks Approved by Adviser completed once forwarded to SAS', () => {
  const { steps } = buildSevenStageTrackerSteps(
    {
      proposalStatus: 'pending',
      status: 'under_review',
      fundingSource: 'school_budget',
      isPendingSasVetting: true,
      adviserReview: { status: 'approved', reviewedByName: 'Engr. Cruz' },
    },
    'AP'
  );

  const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
  assert.equal(byKey.draft.state, 'completed');
  assert.equal(byKey.for_adviser_review.state, 'completed');
  assert.equal(byKey.approved_by_adviser.state, 'completed');
  assert.equal(byKey.for_sas_review.state, 'active');
  assert.equal(byKey.approved.state, 'pending');
});

test('officer can withdraw proposal in for_adviser_review back to draft, and cannot edit while locked in adviser review', () => {
  const prop = {
    id: 'prop-1',
    proposalStatus: 'for_adviser_review',
    status: 'for_adviser_review',
    isOfficerProposal: true,
    hostingOrgId: 'org_it',
    createdByUid: 'officer-1',
    fundingSource: 'school_budget',
  };

  const withdraw = canWithdrawProposal(prop, 'officer', 'officer-1', 'org_it');
  assert.equal(withdraw.canWithdraw, true);

  const edit = canEditProposal(prop, 'officer', 'officer-1', 'org_it');
  assert.equal(edit.canEdit, false);

  const returnedEdit = canEditProposal(
    { ...prop, proposalStatus: 'returned', status: 'returned_for_revision', isReturned: true },
    'officer',
    'officer-1',
    'org_it'
  );
  assert.equal(returnedEdit.canEdit, true);
});
