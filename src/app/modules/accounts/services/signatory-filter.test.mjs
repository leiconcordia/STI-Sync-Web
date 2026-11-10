import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdministratorSignatory } from './signatory-filter.mjs';

test('signatories matching SAS administrators by UID or email are excluded', () => {
  const ids = new Set(['admin-uid']);
  const emails = new Set(['admin@example.com']);
  assert.equal(isAdministratorSignatory('admin-uid', {}, ids, emails), true);
  assert.equal(isAdministratorSignatory('other', { authUid: 'admin-uid' }, ids, emails), true);
  assert.equal(isAdministratorSignatory('other', { email: ' Admin@Example.com ' }, ids, emails), true);
  assert.equal(isAdministratorSignatory('other', { email: 'signatory@example.com' }, ids, emails), false);
});
