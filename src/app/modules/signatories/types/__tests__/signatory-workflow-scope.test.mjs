import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSignatoryApplicableTo,
  getSignatoryAuthorizedWorkflows,
} from '../../utils/signatory-scope.utils.ts';
import { filterTemplateStepsBySignatoryScope } from '../../../workflow/utils/stage-normalization.utils.ts';
import { canSignatoryApproveDocument } from '../../utils/signatory-label.utils.ts';

describe('Signatory Workflow Scope Eligibility & Default Pipeline Filtering', () => {
  const person1ApOnly = {
    id: 'sig_person1',
    name: 'Person 1',
    email: 'person1@ormoc.sti.edu.ph',
    role: 'program_head',
    roleTitle: 'Program Head',
    applicableScope: 'proposal_only',
    applicableWorkflows: ['proposal'],
    isActive: true,
  };

  const acadHeadFlPar = {
    id: 'sig_acad',
    name: 'Academic Head',
    email: 'acad@ormoc.sti.edu.ph',
    role: 'academic_head',
    roleTitle: 'Academic Head',
    applicableScope: 'all',
    applicableWorkflows: ['proposal', 'liquidation', 'par'],
    isActive: true,
  };

  const presidentApprover = {
    id: 'sig_pres',
    name: 'School President',
    email: 'pres@ormoc.sti.edu.ph',
    role: 'school_president',
    roleTitle: 'School President',
    applicableScope: 'all',
    applicableWorkflows: ['proposal', 'liquidation', 'par'],
    canApproveProposal: true,
    canApproveLiquidation: true,
    canApprovePar: true,
    isActive: true,
  };

  const cannotSignAll = {
    id: 'sig_none',
    name: 'Restricted Staff',
    email: 'restricted@ormoc.sti.edu.ph',
    role: 'program_head',
    roleTitle: 'Program Head',
    applicableScope: 'all',
    applicableWorkflows: [],
    isActive: true,
  };

  const allSignatories = [person1ApOnly, acadHeadFlPar, presidentApprover, cannotSignAll];

  test('enforces workflow scope strictly across AP, FL, and PAR', () => {
    assert.equal(isSignatoryApplicableTo(person1ApOnly, 'proposal'), true);
    assert.equal(isSignatoryApplicableTo(person1ApOnly, 'liquidation'), false);
    assert.equal(isSignatoryApplicableTo(person1ApOnly, 'par'), false);

    assert.deepEqual(getSignatoryAuthorizedWorkflows(cannotSignAll), []);
    assert.equal(isSignatoryApplicableTo(cannotSignAll, 'proposal'), false);
    assert.equal(isSignatoryApplicableTo(cannotSignAll, 'liquidation'), false);
    assert.equal(isSignatoryApplicableTo(cannotSignAll, 'par'), false);
  });

  test('legacy applicableScope "both" authorizes AP and FL only (not PAR)', () => {
    const legacyBoth = {
      id: 'sig_legacy',
      name: 'Legacy Signer',
      email: 'legacy@ormoc.sti.edu.ph',
      role: 'academic_head',
      roleTitle: 'Academic Head',
      applicableScope: 'both',
      isActive: true,
    };
    assert.equal(isSignatoryApplicableTo(legacyBoth, 'proposal'), true);
    assert.equal(isSignatoryApplicableTo(legacyBoth, 'liquidation'), true);
    assert.equal(isSignatoryApplicableTo(legacyBoth, 'par'), false);
  });

  test('filterTemplateStepsBySignatoryScope strips AP-only Person 1 from default FL and PAR templates', () => {
    const savedFlTemplate = [
      {
        id: 'step_1',
        step: 1,
        stageIndex: 1,
        signatoryUid: 'sig_person1',
        signatoryName: 'Person 1',
        signatoryEmail: 'person1@ormoc.sti.edu.ph',
        role: 'program_head',
        roleTitle: 'Program Head',
        actionType: 'endorse',
      },
      {
        id: 'step_2',
        step: 2,
        stageIndex: 2,
        signatoryUid: 'sig_acad',
        signatoryName: 'Academic Head',
        signatoryEmail: 'acad@ormoc.sti.edu.ph',
        role: 'academic_head',
        roleTitle: 'Academic Head',
        actionType: 'endorse',
      },
      {
        id: 'step_3',
        step: 3,
        stageIndex: 3,
        signatoryUid: 'sig_pres',
        signatoryName: 'School President',
        signatoryEmail: 'pres@ormoc.sti.edu.ph',
        role: 'school_president',
        roleTitle: 'School President',
        actionType: 'approve',
      },
    ];

    const flFiltered = filterTemplateStepsBySignatoryScope(savedFlTemplate, allSignatories, 'liquidation', {
      normalize: true,
    });
    assert.equal(flFiltered.length, 2);
    assert.equal(flFiltered.some((s) => s.signatoryUid === 'sig_person1'), false);
    assert.equal(flFiltered[0].stageIndex, 1);
    assert.equal(flFiltered[1].stageIndex, 2);

    const parFiltered = filterTemplateStepsBySignatoryScope(savedFlTemplate, allSignatories, 'par', {
      normalize: true,
    });
    assert.equal(parFiltered.length, 2);
    assert.equal(parFiltered.some((s) => s.signatoryUid === 'sig_person1'), false);

    const apFiltered = filterTemplateStepsBySignatoryScope(savedFlTemplate, allSignatories, 'proposal', {
      normalize: true,
    });
    assert.equal(apFiltered.length, 3);
    assert.equal(apFiltered.some((s) => s.signatoryUid === 'sig_person1'), true);
  });

  test('dual-role signatory assigned as endorser-only in a pipeline cannot approve prematurely', () => {
    const dualRoleSigner = {
      id: 'sig_shs_ap',
      name: 'Cybele Nudalo',
      role: 'shs_asst_principal',
      actionType: 'approver',
      canApproveProposal: true,
      canApproveLiquidation: true,
      canApprovePar: true,
    };

    // Assigned as Endorser only on Stage 1 (with Stage 2 Final Approver remaining)
    assert.equal(
      canSignatoryApproveDocument(dualRoleSigner, 'proposal', { actionType: 'endorse' }),
      false
    );
    assert.equal(
      canSignatoryApproveDocument(dualRoleSigner, 'liquidation', { actionType: 'check' }),
      false
    );
    assert.equal(
      canSignatoryApproveDocument(dualRoleSigner, 'par', { actionType: 'endorse' }),
      false
    );

    // Assigned as Final Approver in a pipeline
    assert.equal(
      canSignatoryApproveDocument(dualRoleSigner, 'proposal', { actionType: 'approve' }),
      true
    );
  });
});
