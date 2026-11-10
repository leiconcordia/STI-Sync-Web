import assert from 'node:assert/strict';
import { createAdviserAccountHandler } from '../server/adviser-account-handler.mjs';
import { createHostedAccountsHandler } from '../server/hosted-accounts-handler.mjs';

// Local fixtures only. Any attempt to mutate an account or a database fails.
const people = new Map([
  ['faculty@example.test', { uid: 'faculty', email: 'faculty@example.test', displayName: 'John S. Doe', passwordHash: 'must-not-be-returned' }],
  ['disabled@example.test', { uid: 'disabled', email: 'disabled@example.test', disabled: true }],
  ['student@example.test', { uid: 'student', email: 'student@example.test' }],
]);
const records = {
  sas_admins: [{ id: 'admin', isActive: true }, { id: 'inactive', isActive: false }],
  students: [{ id: 'student', email: 'student@example.test', authUid: 'student' }],
};
let failAuth = false;
const noWrite = () => assert.fail('Account validation must not write or change passwords');
const context = {
  db: { collection: (name) => ({
    doc: (id) => ({ get: async () => { const data = records[name]?.find((record) => record.id === id); return { exists: Boolean(data), data: () => data }; }, set: noWrite, update: noWrite, delete: noWrite }),
    where: (field, _op, value) => ({ get: async () => ({ empty: !records[name]?.some((record) => record[field] === value) }) }),
    add: noWrite,
  }) },
  auth: {
    verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (!['admin', 'inactive', 'other'].includes(token)) throw new Error('Invalid token'); return { uid: token }; },
    getUserByEmail: async (email) => { if (failAuth) throw new Error('Fixture Auth unavailable'); if (!people.has(email)) throw Object.assign(new Error('Unknown user'), { code: 'auth/user-not-found' }); return people.get(email); },
    createUser: noWrite, updateUser: noWrite, deleteUser: noWrite,
  },
};
const check = createAdviserAccountHandler(context);
let passed = 0;
const test = async (name, body) => { await body(); passed++; console.log(`PASS: ${name}`); };
await test('Missing or inactive SAS membership cannot enumerate accounts', async () => {
  for (const uid of ['other', 'inactive']) await assert.rejects(() => check({ auth: { uid }, data: { email: 'faculty@example.test' } }), { code: 'permission-denied' });
  await assert.rejects(() => check({ data: { email: 'faculty@example.test' } }), { code: 'unauthenticated' });
});
await test('An active admin can find a normalized email without password or reset fields', async () => {
  assert.deepEqual(await check({ auth: { uid: 'admin' }, data: { email: ' FACULTY@example.test ' } }), { exists: true, eligible: true, uid: 'faculty', email: 'faculty@example.test', displayName: 'John S. Doe' });
});
await test('An unknown account returns a clear nonexistence result', async () => {
  assert.deepEqual(await check({ auth: { uid: 'admin' }, data: { email: 'new@example.test' } }), { exists: false });
});
await test('Invalid emails and Firebase failures are not treated as available accounts', async () => {
  await assert.rejects(() => check({ auth: { uid: 'admin' }, data: { email: 'invalid' } }), { code: 'invalid-argument' });
  failAuth = true;
  try { await assert.rejects(() => check({ auth: { uid: 'admin' }, data: { email: 'faculty@example.test' } }), /Fixture Auth unavailable/); } finally { failAuth = false; }
});
await test('Student and disabled accounts cannot be reused as faculty advisers', async () => {
  for (const email of ['student@example.test', 'disabled@example.test']) {
    const result = await check({ auth: { uid: 'admin' }, data: { email } });
    assert.equal(result.exists, true); assert.equal(result.eligible, false); assert.match(result.reason, /student|disabled/);
  }
});
const handler = createHostedAccountsHandler(async () => context, createAdviserAccountHandler, { path: '/api/accounts/check-adviser' });
const request = async (overrides = {}) => {
  let status; let headers; let body;
  await handler({ url: '/api/accounts/check-adviser', method: 'POST', headers: { host: 'app.test', origin: 'https://app.test', authorization: 'Bearer admin', 'content-type': 'application/json' }, body: { email: 'faculty@example.test' }, ...overrides }, {
    writeHead: (value, options) => { status = value; headers = options; }, end: (value) => { body = JSON.parse(value); },
  });
  return { status, headers, body };
};
await test('Hosted account lookup serves the registered route and prevents response caching', async () => {
  const result = await request(); assert.equal(result.status, 200); assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(result.body.result.uid, 'faculty');
  assert.equal((await request({ url: '/wrong' })).status, 404);
});
await test('Account endpoint rejects unsupported methods, cross-origin requests and invalid sessions', async () => {
  assert.equal((await request({ method: 'GET' })).status, 405);
  assert.equal((await request({ headers: { host: 'app.test', origin: 'https://other.test' } })).status, 403);
  for (const token of ['', 'bad', 'inactive', 'other']) {
    const result = await request({ headers: { host: 'app.test', authorization: token ? `Bearer ${token}` : '', 'content-type': 'application/json' } });
    assert.equal(result.status, ['inactive', 'other'].includes(token) ? 403 : 401);
  }
});
await test('Invalid JSON, content type and oversized requests cannot reach account lookup', async () => {
  assert.equal((await request({ body: 'not json' })).status, 400);
  assert.equal((await request({ body: 'x'.repeat(9000) })).status, 413);
  assert.equal((await request({ headers: { host: 'app.test', authorization: 'Bearer admin', 'content-type': 'text/plain' } })).status, 415);
});
await test('The existing reset endpoint keeps its default route when no options are supplied', async () => {
  let called = false; let status;
  const reset = createHostedAccountsHandler(async () => context, () => async () => { called = true; return { success: true }; });
  await reset({ url: '/api/accounts/reset-password', method: 'POST', headers: { host: 'app.test', authorization: 'Bearer admin', 'content-type': 'application/json' }, body: {} }, { writeHead: (code) => { status = code; }, end() {} });
  assert.equal(status, 200); assert.equal(called, true);
});
console.log(`\n${passed} read-only adviser account API checks passed. No live services or emails used.`);
