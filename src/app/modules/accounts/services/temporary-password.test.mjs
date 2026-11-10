import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTemporaryPassword } from './temporary-password.mjs';

test('preview passwords are unique and satisfy the server password requirements', () => {
  const passwords = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
  assert.equal(passwords.size, 100);
  for (const password of passwords) {
    assert.ok(password.length >= 16 && password.length <= 128);
    for (const requirement of [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/]) assert.match(password, requirement);
  }
});
