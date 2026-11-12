import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, entries: [] },
});

let passed = 0;
const test = async (name, body) => {
  await body();
  passed++;
  console.log(`PASS: ${name}`);
};

try {
  const domain = await server.ssrLoadModule('/src/app/signatory/utils/campus-activity-report.ts');
  const {
    isDocumentCurrentlyReturned,
    hasSignatorySignedStep,
    hasSignatorySignedDocument,
    documentStatus,
  } = domain;

  await test('isDocumentCurrentlyReturned: strictly tracks current active status', () => {
    // 1. Fresh returned proposal
    assert.equal(isDocumentCurrentlyReturned({ status: 'returned_for_revision' }), true);
    assert.equal(isDocumentCurrentlyReturned({ status: 'returned' }), true);
    assert.equal(isDocumentCurrentlyReturned({ status: 'returned', proposalStatus: 'returned' }), true);

    // 2. Resubmitted proposal: maker submitted revision -> now under_review
    // Even if legacy record has isReturned: true or stepRevisionRemarks
    const resubmittedProposal = {
      status: 'under_review',
      proposalStatus: 'pending',
      lifecycleStatus: 'pending_review',
      isReturned: true, // stale flag in legacy DB record
      stepRevisionRemarks: { step_1: 'Please revise venue' },
    };
    assert.equal(isDocumentCurrentlyReturned(resubmittedProposal), false);
    assert.equal(documentStatus(resubmittedProposal), 'under_review');

    // 3. Approved proposal
    const approvedProposal = {
      status: 'approved',
      proposalStatus: 'approved',
      isReturned: false,
    };
    assert.equal(isDocumentCurrentlyReturned(approvedProposal), false);
    assert.equal(documentStatus(approvedProposal), 'approved');

    // 4. Draft proposal
    assert.equal(isDocumentCurrentlyReturned({ status: 'draft' }), false);
    assert.equal(documentStatus({ status: 'draft' }), 'draft');
  });

  await test('hasSignatorySignedStep: strictly matches per-signatory personal signature', () => {
    const signatoryAlice = {
      id: 'user_alice',
      uid: 'user_alice',
      email: 'alice@sti.edu',
      name: 'Alice Johnson',
      role: 'dean',
      roleTitle: 'Dean of IT',
    };

    const signatoryBob = {
      id: 'user_bob',
      uid: 'user_bob',
      email: 'bob@sti.edu',
      name: 'Bob Smith',
      role: 'dean',
      roleTitle: 'Dean of Business',
    };

    // Step signed by Alice
    const aliceStep = {
      role: 'dean',
      roleTitle: 'Dean of IT',
      status: 'endorsed',
      signatoryUid: 'user_alice',
      signedByUid: 'user_alice',
      signatoryEmail: 'alice@sti.edu',
      signedByName: 'Alice Johnson',
      signedAt: '2026-11-12T10:00:00.000Z',
      signatureUrl: 'https://example.com/sig_alice.png',
    };

    // Alice must match because she signed it
    assert.equal(hasSignatorySignedStep(aliceStep, signatoryAlice), true);

    // Bob MUST NOT match even though both have role: 'dean'
    assert.equal(hasSignatorySignedStep(aliceStep, signatoryBob), false);

    // Waived step: neither signed it
    const waivedStep = {
      role: 'school_administrator',
      roleTitle: 'Campus Administrator',
      status: 'waived',
      signatoryUid: 'user_admin',
      remarks: 'Waived due to executive authorization by School President',
    };
    assert.equal(hasSignatorySignedStep(waivedStep, { id: 'user_admin', email: 'admin@sti.edu' }), false);
  });

  await test('hasSignatorySignedDocument: ensures document is in signed history ONLY for actual signers', () => {
    const sessionDean = { id: 'dean_1', email: 'dean1@sti.edu', name: 'Dean One' };
    const sessionPresident = { id: 'pres_1', email: 'president@sti.edu', name: 'President STI' };
    const sessionAccountant = { id: 'acc_1', email: 'accountant@sti.edu', name: 'Accountant STI' };

    const proposal = {
      id: 'prop_001',
      status: 'approved',
      approvalChain: [
        {
          stageIndex: 1,
          status: 'endorsed',
          signedByUid: 'dean_1',
          signatoryEmail: 'dean1@sti.edu',
          signedAt: '2026-11-10T12:00:00Z',
        },
        {
          stageIndex: 2,
          status: 'approved',
          signedByUid: 'pres_1',
          signatoryEmail: 'president@sti.edu',
          signedAt: '2026-11-11T12:00:00Z',
        },
        {
          stageIndex: 2,
          status: 'waived',
          signatoryUid: 'admin_1',
        },
      ],
    };

    assert.equal(hasSignatorySignedDocument(proposal, sessionDean), true);
    assert.equal(hasSignatorySignedDocument(proposal, sessionPresident), true);

    // Accountant was not in chain and never signed
    assert.equal(hasSignatorySignedDocument(proposal, sessionAccountant), false);
  });

  console.log(`\nAll ${passed} signatory filter tests passed.`);
} finally {
  await server.close();
}
