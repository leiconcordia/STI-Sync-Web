import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run this test under Firebase auth/firestore emulators.');
process.env.VITE_FIREBASE_EMULATORS = 'true';
const app = initializeApp({ projectId: 'demo-sti-sync' }, 'local-api-test');
const db = getFirestore(app);
const adminAuth = getAuth(app);
const server = await createServer({
  server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom',
  define: {
    'import.meta.env.VITE_FIREBASE_EMULATORS': JSON.stringify('true'),
    'import.meta.env.VITE_EMAILJS_SERVICE_ID': JSON.stringify('test_service'),
    'import.meta.env.VITE_EMAILJS_TEMPLATE_ID': JSON.stringify('test_template'),
    'import.meta.env.VITE_EMAILJS_PUBLIC_KEY': JSON.stringify('test_public_key'),
  },
});
const originalFetch = globalThis.fetch;
let restoreWindow = false;
try {
  await server.listen();
  const address = `http://127.0.0.1:${server.httpServer.address().port}`;
  const endpoint = `${address}/api/accounts/reset-password`;
  const { auth } = await server.ssrLoadModule('/src/services/firebase.ts');
  const { resetAccountPassword } = await server.ssrLoadModule('/src/app/modules/accounts/services/account-reset.service.ts');
  const { changeAccountPassword } = await server.ssrLoadModule('/src/app/auth/services/password.service.ts');
  // Load Firebase first in Node mode, then provide only the browser location
  // needed by the existing EmailJS sender. No real email requests are allowed.
  globalThis.window = { location: { origin: address, hostname: '127.0.0.1', pathname: '/' } };
  globalThis.location = window.location;
  restoreWindow = true;
  const emails = [];
  let rejectEmail = false;
  globalThis.fetch = async (url, options) => {
    if (url === '/api/accounts/reset-password') return originalFetch(endpoint, options);
    if (String(url).startsWith('https://api.emailjs.com/')) {
      emails.push(JSON.parse(options.body));
      return new Response(rejectEmail ? 'Test email rejection' : 'OK', { status: rejectEmail ? 403 : 200 });
    }
    return originalFetch(url, options);
  };
  const noToken = await originalFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noToken.status, 401);
  const admin = await adminAuth.createUser({ email: 'local-admin@test.example', password: 'AdminPassword123!' });
  await db.doc(`sas_admins/${admin.uid}`).set({ isActive: true, email: admin.email });
  await signInWithEmailAndPassword(auth, admin.email, 'AdminPassword123!');
  const token = await auth.currentUser.getIdToken();
  const wrongOrigin = await originalFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://other.example' }, body: '{}' });
  assert.equal(wrongOrigin.status, 403);
  const badJson = await originalFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: 'not JSON' });
  assert.equal(badJson.status, 400);
  console.log('PASS: local API rejects missing tokens, cross-origin calls, and malformed requests');
  for (const [kind, collection] of [['students', 'students'], ['advisers', 'organization_advisers'], ['signatories', 'institutional_signatories']]) {
    const email = `local-${kind}@test.example`;
    const target = await adminAuth.createUser({ email, password: 'OldPassword123!' });
    const ref = db.doc(`${collection}/${target.uid}`);
    await ref.set({ email, authUid: target.uid, status: 'ACTIVE', tempPass: null, requiresPasswordChange: false, ...(kind === 'students' ? { studentId: '02000987654' } : {}) });
    const officerRef = db.doc('organization_officers/stale-student-officer');
    if (kind === 'students') await officerRef.set({ studentId: '02000987654', email: 'old-provisional@student.sti.edu', requiresPasswordChange: false });
    const candidate = `Preview-${kind}-Temporary123!`;
    const result = await resetAccountPassword(kind, target.uid, 'User forgot password', candidate);
    assert.equal(result.delivery, 'accepted');
    assert.equal(result.temporaryPassword, candidate);
    assert.equal((await ref.get()).data().tempPass, candidate);
    if (kind === 'students') {
      const officer = (await officerRef.get()).data();
      assert.equal(officer.tempPass, candidate);
      assert.equal(officer.authUid, target.uid);
      assert.equal(officer.email, email);
    }
    assert.equal(emails.at(-1).template_params.to_email, email);
    assert.equal(emails.at(-1).template_params.temp_password, candidate);
    await signOut(auth);
    await assert.rejects(signInWithEmailAndPassword(auth, email, 'OldPassword123!'));
    await signInWithEmailAndPassword(auth, email, candidate);
    assert.equal((await ref.get()).data().requiresPasswordChange, true);
    await changeAccountPassword(candidate, 'NewPrivatePassword123!', email);
    assert.equal((await ref.get()).data().tempPass, null);
    assert.equal((await ref.get()).data().requiresPasswordChange, false);
    if (kind === 'students') assert.equal((await officerRef.get()).data().tempPass, null);
    await signOut(auth);
    await assert.rejects(signInWithEmailAndPassword(auth, email, candidate));
    await signInWithEmailAndPassword(auth, admin.email, 'AdminPassword123!');
    if (kind === 'students') {
      rejectEmail = true;
      const failed = await resetAccountPassword(kind, target.uid, 'Retry reset for email failure', 'Email-Failure-Temporary123!');
      assert.equal(failed.delivery, 'failed');
      assert.equal(failed.temporaryPassword, (await ref.get()).data().tempPass);
      rejectEmail = false;
    }
    console.log(`PASS: ${kind} uses local HTTP backend + Firebase Auth/tempPass + EmailJS + permanent password cleanup`);
  }
} finally {
  globalThis.fetch = originalFetch;
  if (restoreWindow) { delete globalThis.window; delete globalThis.location; }
  await server.close();
  await db.terminate();
  await deleteApp(app);
}
process.exit(0);
