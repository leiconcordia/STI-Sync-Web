import assert from 'assert';
import { sanitizeCleanDocumentSnapshot } from '../src/app/modules/workflow/utils/snapshot-cleaner.utils.ts';

console.log('--- Testing Document Snapshot Cleaner for 1MB Firestore Limit ---');

// Test 1: Strips recursive snapshots
const bloatedDoc = {
  id: 'evt_123',
  title: 'Annual General Assembly',
  returnedSnapshot: { old: 'snapshot' },
  previousSnapshot: { old: 'previous' },
  dataSnapshot: { old: 'data' },
  snapshot: { old: 'snap' },
  versionHistory: [{ version: 1, dataSnapshot: { huge: 'array' } }],
  revisionHistory: [{ version: 1 }],
  proposalHistory: [{ action: 'returned' }],
  bannerImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  submittedBySignatureUrl: 'data:image/png;base64,AAA...',
  preparedBy: {
    name: 'John Doe',
    signatureUrl: 'data:image/png;base64,BBB...',
  },
  approvalChain: [
    { id: 'step_1', signatureUrl: 'data:image/png;base64,CCC...' },
  ],
  financialProjections: {
    totalExpenses: 5000,
    expenses: [
      { id: 'exp_1', receiptUrl: 'data:image/jpeg;base64,DDD...' },
    ],
  },
};

const cleaned = sanitizeCleanDocumentSnapshot(bloatedDoc);

assert.strictEqual(cleaned.returnedSnapshot, undefined, 'returnedSnapshot must be stripped');
assert.strictEqual(cleaned.previousSnapshot, undefined, 'previousSnapshot must be stripped');
assert.strictEqual(cleaned.dataSnapshot, undefined, 'dataSnapshot must be stripped');
assert.strictEqual(cleaned.versionHistory, undefined, 'versionHistory must be stripped');
assert.strictEqual(cleaned.revisionHistory, undefined, 'revisionHistory must be stripped');
assert.strictEqual(cleaned.proposalHistory, undefined, 'proposalHistory must be stripped');

assert.strictEqual(cleaned.bannerImageUrl, '[base64-omitted-from-snapshot]', 'Base64 banner must be omitted');
assert.strictEqual(cleaned.submittedBySignatureUrl, '[base64-omitted-from-snapshot]', 'Base64 submitted signature must be omitted');
assert.strictEqual(cleaned.preparedBy.signatureUrl, '[base64-omitted-from-snapshot]', 'Base64 preparedBy signature must be omitted');
assert.strictEqual(cleaned.approvalChain[0].signatureUrl, '[base64-omitted-from-snapshot]', 'Base64 step signature must be omitted');
assert.strictEqual(cleaned.financialProjections.expenses[0].receiptUrl, '[receipt-base64-omitted]', 'Base64 receipt must be omitted');

assert.strictEqual(cleaned.title, 'Annual General Assembly', 'Normal fields must be preserved');
assert.strictEqual(cleaned.financialProjections.totalExpenses, 5000, 'Normal projection numbers must be preserved');

console.log('✓ PASS: All recursive snapshots and base64 bloat stripped successfully');
console.log('--- All Revision and Snapshot Limit Tests Passed ---');

