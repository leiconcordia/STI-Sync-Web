import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateSignatoryPortalDeactivation,
  validateRemoveSignatorySubstitute,
  isSubstituteDelegationActive,
  buildActingSignatoryRoleTitle,
  matchesSignatoryOrSubstituteStep,
  resolveSignerAttribution,
} from '../signatory-substitute.utils.ts';

import {
  matchesSbrSignatoryStep,
  isSignatoryTurnForSbr,
} from '../../../supplemental-budget/utils/sbr-validation.utils.ts';

test('validateSignatoryPortalDeactivation blocks deactivation when pending documents exist and no substitute is assigned', () => {
  const result = validateSignatoryPortalDeactivation({
    hasSubstitute: false,
    pendingDocuments: [
      { id: 'ap-1', documentType: 'proposal', title: 'Tech Summit', isCurrentTurn: true },
      { id: 'sbr-1', documentType: 'sbr', title: 'Tech Summit SBR', isCurrentTurn: false },
    ],
  });

  assert.equal(result.allowed, false);
  assert.equal(result.pendingCount, 2);
  assert.equal(result.currentTurnCount, 1);
  assert.equal(result.hasSubstitute, false);
  assert.match(result.reason || '', /cannot deactivate/i);
  assert.match(result.reason || '', /Substitute Signatory/i);
});

test('validateSignatoryPortalDeactivation allows deactivation when a substitute is assigned even with pending documents', () => {
  const result = validateSignatoryPortalDeactivation({
    hasSubstitute: true,
    pendingDocuments: [
      { id: 'ap-1', documentType: 'proposal', title: 'Tech Summit', isCurrentTurn: true },
      { id: 'fl-1', documentType: 'liquidation', title: 'Tech Summit FL', isCurrentTurn: true },
    ],
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
  assert.equal(result.pendingCount, 2);
  assert.equal(result.hasSubstitute, true);
});

test('validateSignatoryPortalDeactivation allows deactivation when there are zero pending documents and no substitute', () => {
  const result = validateSignatoryPortalDeactivation({
    hasSubstitute: false,
    pendingDocuments: [],
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
  assert.equal(result.pendingCount, 0);
});

test('validateRemoveSignatorySubstitute blocks removal while portal is deactivated with pending documents', () => {
  const blocked = validateRemoveSignatorySubstitute({
    portalDeactivated: true,
    pendingDocuments: [{ id: 'par-1', documentType: 'par' }],
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason || '', /Cannot remove the Substitute Signatory/i);

  const allowedWhenActive = validateRemoveSignatorySubstitute({
    portalDeactivated: false,
    pendingDocuments: [{ id: 'par-1', documentType: 'par' }],
  });
  assert.equal(allowedWhenActive.allowed, true);

  const allowedWhenNoPendings = validateRemoveSignatorySubstitute({
    portalDeactivated: true,
    pendingDocuments: [],
  });
  assert.equal(allowedWhenNoPendings.allowed, true);
});

test('isSubstituteDelegationActive unlocks only when primary is active, portalDeactivated is true, and substitute exists', () => {
  const basePrimary = {
    id: 'sig-primary',
    isActive: true,
    portalDeactivated: false,
    substitute: { uid: 'sub-1', email: 'sub@ormoc.sti.edu.ph', name: 'Jane Sub' },
  };

  assert.equal(isSubstituteDelegationActive(basePrimary), false);
  assert.equal(isSubstituteDelegationActive({ ...basePrimary, portalDeactivated: true }), true);
  assert.equal(
    isSubstituteDelegationActive({ ...basePrimary, portalDeactivated: true, isActive: false }),
    false
  );
  assert.equal(
    isSubstituteDelegationActive({ ...basePrimary, portalDeactivated: true, substitute: null }),
    false
  );
});

test('matchesSignatoryOrSubstituteStep matches primary approval step for acting substitute without leaking unrelated steps', () => {
  const subSession = {
    id: 'sig-primary-1',
    uid: 'sub-auth-uid',
    substituteUid: 'sub-auth-uid',
    email: 'sub@ormoc.sti.edu.ph',
    name: 'Engr. Maria Substitute',
    role: 'academic_head',
    roleTitle: 'Acting Academic Head',
    actingAsSubstitute: true,
    delegatedForSignatoryId: 'sig-primary-1',
    delegatedForSignatoryName: 'Dr. Juan Primary',
    delegatedForSignatoryEmail: 'primary@ormoc.sti.edu.ph',
    delegatedForRoleTitle: 'Academic Head',
  };

  const primaryStepByEmail = {
    signatoryUid: 'sig-primary-legacy',
    signatoryEmail: 'primary@ormoc.sti.edu.ph',
    roleTitle: 'Academic Head',
    status: 'current',
  };
  const unrelatedStep = {
    signatoryUid: 'sig-other-99',
    signatoryEmail: 'other@ormoc.sti.edu.ph',
    roleTitle: 'School President',
    status: 'current',
  };

  assert.equal(matchesSignatoryOrSubstituteStep(primaryStepByEmail, subSession), true);
  assert.equal(matchesSignatoryOrSubstituteStep(unrelatedStep, subSession), false);
});

test('resolveSignerAttribution stamps substitute identity and Acting role while preserving original signatory audit fields', () => {
  const attr = resolveSignerAttribution({
    id: 'sig-primary-1',
    uid: 'sub-auth-uid',
    substituteUid: 'sub-auth-uid',
    name: 'Engr. Maria Substitute',
    email: 'sub@ormoc.sti.edu.ph',
    roleTitle: 'Acting Academic Head',
    actingAsSubstitute: true,
    delegatedForSignatoryId: 'sig-primary-1',
    delegatedForSignatoryName: 'Dr. Juan Primary',
    delegatedForSignatoryEmail: 'primary@ormoc.sti.edu.ph',
    delegatedForRoleTitle: 'Academic Head',
  });

  assert.equal(attr.actedAsSubstitute, true);
  assert.equal(attr.signerUid, 'sub-auth-uid');
  assert.equal(attr.signerName, 'Engr. Maria Substitute');
  assert.equal(attr.signerEmail, 'sub@ormoc.sti.edu.ph');
  assert.equal(attr.signerRoleTitle, 'Acting Academic Head (for Dr. Juan Primary)');
  assert.equal(attr.originalSignatoryUid, 'sig-primary-1');
  assert.equal(attr.originalSignatoryName, 'Dr. Juan Primary');
  assert.equal(attr.originalSignatoryEmail, 'primary@ormoc.sti.edu.ph');
  assert.equal(
    buildActingSignatoryRoleTitle('Acting School Administrator', 'Dr. Santos'),
    'Acting School Administrator (for Dr. Santos)'
  );
});

test('SBR turn matching recognizes an active substitute acting on behalf of a primary signatory', () => {
  const sbr = {
    status: 'pending_signatories',
    currentStageIndex: 1,
    currentStepIndex: 0,
    approvalChain: [
      {
        stageIndex: 1,
        signatoryUid: 'sig-primary-1',
        signatoryEmail: 'primary@ormoc.sti.edu.ph',
        roleTitle: 'School Administrator',
        status: 'current',
      },
    ],
  };

  const subActor = {
    uid: 'sub-auth-uid',
    id: 'sig-primary-1',
    email: 'sub@ormoc.sti.edu.ph',
    role: 'school_administrator',
    roleTitle: 'Acting School Administrator',
    actingAsSubstitute: true,
    delegatedForSignatoryId: 'sig-primary-1',
    delegatedForSignatoryEmail: 'primary@ormoc.sti.edu.ph',
    delegatedForRoleTitle: 'School Administrator',
  };

  assert.equal(matchesSbrSignatoryStep(sbr.approvalChain[0], subActor), true);
  assert.equal(isSignatoryTurnForSbr(sbr, subActor), true);
});
