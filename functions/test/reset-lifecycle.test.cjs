const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { createResetHandler } = require('../reset-handler');

const app = initializeApp({ projectId: 'demo-sti-sync' }, 'reset-lifecycle');
const db = getFirestore(app);
const auth = getAuth(app);
after(() => deleteApp(app));
const request = (kind, id) => ({ auth: { uid: 'reset-admin' }, data: { kind, id, reason: 'Forgot password' } });
async function login(email, password) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return { ok: response.ok, body: await response.json() };
}

test('reset lifecycle uses real Firebase credentials for each role; old and earlier temporary passwords fail', async () => {
  await db.doc('sas_admins/reset-admin').set({ isActive: true, email: 'admin@reset.test' });
  for (const [kind, collection] of [['students', 'students'], ['advisers', 'organization_advisers'], ['signatories', 'institutional_signatories']]) {
    const email = `${kind}@reset.test`;
    const user = await auth.createUser({ email, password: 'OriginalPassword123!' });
    const ref = db.doc(`${collection}/${user.uid}`);
    await ref.set({ email, authUid: user.uid, isProfileComplete: true, status: 'ACTIVE', tempPass: null });
    let sent;
    const handler = createResetHandler({ db, auth, sendMail: async (payload) => { sent = payload; return 'test-provider-id'; } });
    const preview = 'PreviewTemporaryPassword123!';
    const first = await handler({ ...request(kind, user.uid), data: { ...request(kind, user.uid).data, temporaryPassword: preview } });
    assert.equal(first.temporaryPassword, preview);
    assert.equal(sent.password, preview);
    assert.equal((await ref.get()).data().tempPass, sent.password);
    assert.equal((await ref.get()).data().requiresPasswordChange, true);
    assert.equal((await login(email, 'OriginalPassword123!')).ok, false);
    assert.equal((await login(email, sent.password)).ok, true);
    const earlier = sent.password;
    await handler(request(kind, user.uid));
    assert.notEqual(earlier, sent.password);
    assert.equal((await login(email, earlier)).ok, false);
    assert.equal((await login(email, sent.password)).ok, true);
    const failedMail = await createResetHandler({ db, auth, sendMail: async () => { throw new Error('provider unavailable'); } })(request(kind, user.uid));
    assert.equal(failedMail.delivery, 'failed');
    assert.match(failedMail.deliveryError, /email was not accepted/i);
    const latest = (await ref.get()).data().tempPass;
    assert.equal(failedMail.temporaryPassword, latest);
    assert.equal((await login(email, latest)).ok, true);
    assert.equal((await ref.get()).data().requiresPasswordChange, true);
    await db.doc(`_account_reset_locks/${user.uid}`).set({ operationId: 'another-operation', expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
    await assert.rejects(handler(request(kind, user.uid)), /already in progress/i);
  }
});

test('reset rejects non-admins, admin targets, inactive accounts, missing email, and UID mismatches', async () => {
  const handler = createResetHandler({ db, auth, sendMail: async () => { throw new Error('must not send'); } });
  await assert.rejects(handler({ auth: null }), /sign in/i);
  await assert.rejects(handler({ auth: { uid: 'not-admin' } }), /active SAS/i);
  const user = await auth.createUser({ email: 'admin-target@reset.test', password: 'OriginalPassword123!' });
  await db.doc(`sas_admins/${user.uid}`).set({ isActive: true, email: user.email });
  await db.doc(`institutional_signatories/${user.uid}`).set({ email: user.email });
  await assert.rejects(handler(request('signatories', user.uid)), /administrator accounts cannot/i);
  await db.doc('students/no-email').set({ status: 'ACTIVE', email: '' });
  await assert.rejects(handler(request('students', 'no-email')), /personal email/i);
  await db.doc('students/inactive').set({ status: 'INACTIVE', email: 'students@reset.test' });
  await assert.rejects(handler(request('students', 'inactive')), /active accounts/i);
  await db.doc('students/mismatch').set({ email: 'students@reset.test', authUid: 'wrong-uid' });
  await assert.rejects(handler(request('students', 'mismatch')), /UID do not match/i);
  await assert.rejects(handler({ ...request('students', 'mismatch'), data: { ...request('students', 'mismatch').data, temporaryPassword: 'weak' } }), /valid temporary password/i);
});

test('Auth update failure does not send mail or erase a previously usable temporary password', async () => {
  const user = await auth.createUser({ email: 'failure@reset.test', password: 'OriginalPassword123!' });
  const ref = db.doc(`students/${user.uid}`);
  await ref.set({ email: user.email, authUid: user.uid, tempPass: 'OriginalPassword123!', status: 'ACTIVE' });
  let sent = false;
  const brokenAuth = { getUserByEmail: auth.getUserByEmail.bind(auth), updateUser: async () => { throw new Error('simulated-auth-outage'); } };
  const handler = createResetHandler({ db, auth: brokenAuth, sendMail: async () => { sent = true; } });
  await assert.rejects(handler(request('students', user.uid)), /password was not changed/i);
  assert.equal(sent, false);
  assert.equal((await ref.get()).data().tempPass, 'OriginalPassword123!');
  assert.equal((await login(user.email, 'OriginalPassword123!')).ok, true);
  assert.equal((await db.doc(`_account_reset_locks/${user.uid}`).get()).exists, false);
});

test('the production handler returns confirmed credentials for the existing app EmailJS sender', async () => {
  const user = await auth.createUser({ email: 'emailjs@reset.test', password: 'OriginalPassword123!' });
  const ref = db.doc(`students/${user.uid}`);
  await ref.set({ email: user.email, authUid: user.uid, status: 'ACTIVE' });
  const result = await createResetHandler({ db, auth })(request('students', user.uid));
  assert.equal(result.delivery, 'pending');
  assert.equal(result.recipientEmail, user.email);
  assert.equal(result.temporaryPassword, (await ref.get()).data().tempPass);
  assert.equal((await login(user.email, result.temporaryPassword)).ok, true);
  assert.equal((await login(user.email, 'OriginalPassword123!')).ok, false);
});
