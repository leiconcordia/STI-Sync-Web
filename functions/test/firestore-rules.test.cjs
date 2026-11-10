const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');

const app = initializeApp({ projectId: 'demo-sti-sync', apiKey: 'demo-key' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const admin = initAdmin({ projectId: 'demo-sti-sync' }, 'rules-test');
after(async () => { await deleteApp(app); await deleteAdmin(admin); });

test('clients cannot forge SAS administrators or change protected membership fields', async () => {
  const { user } = await signInAnonymously(auth);
  const profile = doc(db, 'sas_admins', user.uid);
  await assert.rejects(setDoc(profile, { isActive: true, role: 'admin' }), /permission/i);
  await adminFirestore(admin).doc(`sas_admins/${user.uid}`).set({ isActive: true, role: 'admin', displayName: 'Test' });
  await assert.rejects(updateDoc(profile, { isActive: false }), /permission/i);
  await assert.rejects(updateDoc(profile, { role: 'other' }), /permission/i);
  await updateDoc(profile, { displayName: 'Updated' });
  assert.equal((await getDoc(profile)).data().displayName, 'Updated');
});

test('clients cannot read or overwrite reset locks', async () => {
  const lock = doc(db, '_account_reset_locks', 'test-user');
  await assert.rejects(getDoc(lock), /permission/i);
  await assert.rejects(setDoc(lock, { operationId: 'forged' }), /permission/i);
});
