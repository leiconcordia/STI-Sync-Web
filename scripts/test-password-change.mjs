// Run under Firebase auth/firestore emulators. Loads the actual web service
// through Vite so credential updates and tempPass cleanup are exercised together.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { createResetHandler } = require('./reset-handler');
const app = initializeApp({ projectId: 'demo-sti-sync' }, 'web-password-test');
const db = getFirestore(app);
const adminAuth = getAuth(app);
const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', define: { 'import.meta.env.VITE_FIREBASE_EMULATORS': JSON.stringify('true') } });
try {
  const { auth } = await server.ssrLoadModule('/src/services/firebase.ts');
  const { changeAccountPassword } = await server.ssrLoadModule('/src/app/auth/services/password.service.ts');
  const { RequiredPasswordChange } = await server.ssrLoadModule('/src/app/officer/components/RequiredPasswordChange.tsx');
  const { default: SignatoryChangePasswordModal } = await server.ssrLoadModule('/src/app/signatory/components/SignatoryChangePasswordModal.tsx');
  const adviserNotice = renderToStaticMarkup(React.createElement(RequiredPasswordChange, { profile: { email: 'adviser@web.test' } }));
  assert.match(adviserNotice, /Change your password/);
  assert.match(adviserNotice, /before continuing/);
  const signatoryNotice = renderToStaticMarkup(React.createElement(SignatoryChangePasswordModal, { isOpen: true, isMandatory: true, onClose() {}, session: { email: 'signer@web.test' } }));
  assert.match(signatoryNotice, /Setup Permanent Password/);
  assert.match(signatoryNotice, /Required/);
  assert.doesNotMatch(signatoryNotice, />Cancel</);
  console.log('PASS: adviser and signatory required password-change notices render');
  await db.doc('sas_admins/web-test-admin').set({ email: 'admin@web.test', isActive: true });
  for (const [kind, collection] of [['students', 'students'], ['advisers', 'organization_advisers'], ['signatories', 'institutional_signatories']]) {
    const email = `${kind}@web.test`;
    const user = await adminAuth.createUser({ email, password: 'OriginalPassword123!' });
    const ref = db.doc(`${collection}/${user.uid}`);
    const officer = db.doc(`organization_officers/${user.uid}`);
    await ref.set({ email, authUid: user.uid, status: 'ACTIVE', isProfileComplete: true });
    await officer.set({ email, authUid: user.uid });
    let temporary;
    await createResetHandler({ db, auth: adminAuth, sendMail: async ({ password }) => { temporary = password; return 'mock-id'; } })({ auth: { uid: 'web-test-admin' }, data: { kind, id: user.uid, reason: 'Forgot password' } });
    await signInWithEmailAndPassword(auth, email, temporary);
    assert.equal((await ref.get()).data().requiresPasswordChange, true, 'Mandatory notice state must survive temp login');
    await assert.rejects(changeAccountPassword('WrongPassword!', 'PermanentPassword123!', email));
    await assert.rejects(changeAccountPassword(temporary, 'weak', email));
    await assert.rejects(changeAccountPassword(temporary, temporary, email));
    assert.equal((await ref.get()).data().tempPass, temporary, 'Failed changes must retain tempPass');
    await changeAccountPassword(temporary, ' PermanentPassword123! ', email);
    for (const target of [ref, officer]) {
      const data = (await target.get()).data();
      assert.equal(data.tempPass, null);
      assert.equal(data.requiresPasswordChange, false);
    }
    // Simulate Auth success followed by interrupted Firestore cleanup. The new
    // credential must be able to complete cleanup without the lost temp pass.
    await ref.update({ tempPass: temporary, requiresPasswordChange: true });
    await changeAccountPassword(' PermanentPassword123! ', ' PermanentPassword123! ', email);
    assert.equal((await ref.get()).data().tempPass, null);
    await signOut(auth);
    await assert.rejects(signInWithEmailAndPassword(auth, email, temporary));
    await assert.rejects(signInWithEmailAndPassword(auth, email, 'OriginalPassword123!'));
    await signInWithEmailAndPassword(auth, email, ' PermanentPassword123! ');
    await signOut(auth);
    console.log(`PASS: ${kind} reset, forced-change state, validation, Auth update, and linked tempPass cleanup`);
  }
} finally {
  await server.close();
  await deleteApp(app);
}
process.exit(0);
