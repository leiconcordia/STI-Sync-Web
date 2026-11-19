import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasAnySignatorySigned,
  resolveApprovalPermissions,
} from '../approval-permissions.utils.ts';

describe('Financial Liquidation & Approvable Document Withdrawal Lock', () => {
  const adminOwner = {
    uid: 'sas_admin_1',
    name: 'Riselle Mae B. Lucanas',
    role: 'admin',
  };

  test('allows withdrawal while pending/under_review when zero signatories have signed', () => {
    const unsignedLiq = {
      id: 'liq_unsigned',
      status: 'under_review',
      createdByUid: 'sas_admin_1',
      isSasDirect: true,
      currentStageIndex: 1,
      approvalChain: [
        { step: 1, stageIndex: 1, role: 'accountant', status: 'current', signedAt: null },
        { step: 2, stageIndex: 1, role: 'school_president', status: 'waiting', signedAt: null },
      ],
    };

    assert.equal(hasAnySignatorySigned(unsignedLiq), false);
    const perms = resolveApprovalPermissions(unsignedLiq, adminOwner);
    assert.equal(perms.canWithdraw, true);
  });

  test('blocks withdrawal when at least 1 signatory has signed/endorsed in the approval chain', () => {
    const partiallySignedLiq = {
      id: 'liq_signed_1',
      status: 'under_review',
      createdByUid: 'sas_admin_1',
      isSasDirect: true,
      currentStageIndex: 1,
      approvalChain: [
        {
          step: 1,
          stageIndex: 1,
          role: 'accountant',
          signatoryName: 'Emily R. Rojas',
          status: 'endorsed',
          signedAt: '2026-11-19T11:05:00Z',
        },
        {
          step: 2,
          stageIndex: 1,
          role: 'school_president',
          signatoryName: 'Sheena Joy Muyuela',
          status: 'current',
        },
      ],
    };

    assert.equal(hasAnySignatorySigned(partiallySignedLiq), true);
    const perms = resolveApprovalPermissions(partiallySignedLiq, adminOwner);
    assert.equal(perms.canWithdraw, false);
  });

  test('detects signature via signedAt or signatureUrl even before final approval', () => {
    assert.equal(
      hasAnySignatorySigned({
        approvalChain: [{ status: 'waiting', signatureUrl: 'https://example.com/sig.png' }],
      }),
      true
    );
    assert.equal(
      hasAnySignatorySigned({
        approvalChain: [{ status: 'waiting', signedAt: '2026-11-19T10:00:00Z' }],
      }),
      true
    );
  });
});
