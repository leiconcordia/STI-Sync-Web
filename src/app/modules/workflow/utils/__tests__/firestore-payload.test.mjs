import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeFirestorePayload,
  normalizeFlatStringArray,
} from '../firestore-payload.utils.ts';

describe('Firestore Payload Sanitizer & Nested Array Guard', () => {
  test('flattens direct nested arrays so Firestore never rejects with invalid nested entity', () => {
    const input = {
      proposalOrganizers: [['IT Guild', 'CSS'], undefined, ['Red Cross Youth']],
      proposedMechanics: [[['Step 1', 'Step 2']]],
      approvalChain: [
        {
          id: 'step-1',
          signatoryName: 'Sheena Joy Muyuela',
          tags: [['a', 'b'], 'c'],
          optionalNote: undefined,
        },
      ],
    };

    const sanitized = sanitizeFirestorePayload(input);
    assert.deepEqual(sanitized.proposalOrganizers, ['IT Guild', 'CSS', 'Red Cross Youth']);
    assert.deepEqual(sanitized.proposedMechanics, ['Step 1', 'Step 2']);
    assert.deepEqual(sanitized.approvalChain[0].tags, ['a', 'b', 'c']);
    assert.equal('optionalNote' in sanitized.approvalChain[0], false);
  });

  test('preserves top-level FieldValues while neutralizing FieldValues inside arrays', () => {
    const serverTs = { _methodName: 'serverTimestamp' };
    const delField = { _methodName: 'deleteField' };
    const unionVal = { _methodName: 'arrayUnion' };

    const input = {
      updatedAt: serverTs,
      previousSnapshot: delField,
      remarksHistory: unionVal,
      approvalChain: [
        {
          step: 1,
          signedAt: serverTs,
          removedProp: delField,
        },
        serverTs,
        delField,
      ],
    };

    const sanitized = sanitizeFirestorePayload(input);
    assert.equal(sanitized.updatedAt, serverTs);
    assert.equal(sanitized.previousSnapshot, delField);
    assert.equal(sanitized.remarksHistory, unionVal);

    assert.equal(typeof sanitized.approvalChain[0].signedAt, 'string');
    assert.equal('removedProp' in sanitized.approvalChain[0], false);
    assert.equal(typeof sanitized.approvalChain[1], 'string');
    assert.equal(sanitized.approvalChain.length, 2);
  });

  test('handles sparse arrays, NaN/Infinity, and normalizeFlatStringArray cleanly', () => {
    const sparse = ['alpha'];
    sparse[2] = 'gamma';

    const sanitized = sanitizeFirestorePayload({
      items: sparse,
      stats: [Number.NaN, Number.POSITIVE_INFINITY, 42],
    });

    assert.deepEqual(sanitized.items, ['alpha', 'gamma']);
    assert.deepEqual(sanitized.stats, [0, 0, 42]);

    assert.deepEqual(
      normalizeFlatStringArray([['Obj 1'], { text: 'Obj 2' }, { name: 'Obj 3' }, null, undefined]),
      ['Obj 1', 'Obj 2', 'Obj 3']
    );
  });
});
