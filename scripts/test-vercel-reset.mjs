import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { readServiceAccount, createAdminContext } from '../server/admin-context.mjs';
import { createHostedAccountsHandler } from '../server/hosted-accounts-handler.mjs';
import productionHandler from '../api/accounts/reset-password.js';
import resetModule from '../functions/reset-handler.js';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run under Firebase emulators.');

function request(handler, { method = 'POST', url = '/api/accounts/reset-password', body = {}, token, origin = 'https://capstone.example', type = 'application/json' } = {}) {
  let status;
  let headers;
  let output;
  return Promise.resolve(handler({
    method, url, body, headers: { host: 'capstone.example', origin, 'content-type': type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  }, {
    writeHead(code, values) { status = code; headers = values; },
    end(value) { output = JSON.parse(value); },
  })).then(() => ({ status, headers, ...output }));
}

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const fallback = new RegExp(`^${config.rewrites[0].source}$`);
assert.equal(fallback.test('/home/account-management'), true);
assert.equal(fallback.test('/admin/login'), true);
assert.equal(fallback.test('/api/accounts/reset-password'), false);
assert.throws(() => readServiceAccount('{bad JSON', 'sti-sync'), { code: 'unavailable' });
assert.throws(() => readServiceAccount(JSON.stringify({ type: 'service_account', project_id: 'other-project' }), 'sti-sync'), { code: 'unavailable' });
assert.throws(() => createAdminContext({ env: { VERCEL: '1' } }), { code: 'unavailable' });
assert.equal((await request(productionHandler)).status, 401);
assert.equal((await request(productionHandler, { method: 'GET' })).status, 405);
// A hosted function without its secret must report setup failure, never try
// the laptop's CLI login or leak a credential through its error response.
const savedCredential = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
const missing = await request(productionHandler, { token: 'dummy' });
assert.equal(missing.status, 503);
assert.match(missing.error.message, /FIREBASE_ADMIN_SERVICE_ACCOUNT/);
if (savedCredential !== undefined) process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT = savedCredential;
console.log('PASS: Vercel routing, secret validation, and production configuration errors');

const app = initializeApp({ projectId: 'demo-sti-sync' }, 'hosted-api-test');
const auth = getAuth(app);
const db = getFirestore(app);
const handler = createHostedAccountsHandler(async () => ({ auth, db }), resetModule.createResetHandler);
try {
  const admin = await auth.createUser({ email: 'hosted-admin@test.example', password: 'AdminPassword123!' });
  await db.doc(`sas_admins/${admin.uid}`).set({ isActive: true, email: admin.email });
  const login = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'AdminPassword123!', returnSecureToken: true }),
  });
  const { idToken } = await login.json();
  assert.ok(idToken);
  assert.equal((await request(handler, { token: idToken, origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await request(handler, { token: idToken, body: 'invalid JSON' })).status, 400);
  assert.equal((await request(handler, { token: idToken, body: { reason: 'x'.repeat(9000) } })).status, 413);
  for (const [kind, collection] of [['students', 'students'], ['advisers', 'organization_advisers'], ['signatories', 'institutional_signatories']]) {
    const email = `hosted-${kind}@test.example`;
    const target = await auth.createUser({ email, password: 'OldPassword123!' });
    await db.doc(`${collection}/${target.uid}`).set({ authUid: target.uid, email, status: 'ACTIVE' });
    const password = `Hosted-${kind}-Temporary123!`;
    const result = await request(handler, { token: idToken, body: { kind, id: target.uid, reason: 'Forgot account password', temporaryPassword: password } });
    assert.equal(result.status, 200, result.error?.message);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.equal(result.result.delivery, 'pending');
    assert.equal(result.result.temporaryPassword, password);
    assert.equal(result.result.recipientEmail, email);
    const state = (await db.doc(`${collection}/${target.uid}`).get()).data();
    assert.equal(state.tempPass, password);
    assert.equal(state.requiresPasswordChange, true);
    async function signIn(candidate) {
      return fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: candidate, returnSecureToken: true }),
      });
    }
    assert.equal((await signIn('OldPassword123!')).ok, false);
    assert.equal((await signIn(password)).ok, true);
  }
  console.log('PASS: Vercel parsed-body adapter resets all roles through real Firebase emulators and rejects old passwords');
} finally { await db.terminate(); await deleteApp(app); }
