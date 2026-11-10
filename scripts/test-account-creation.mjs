import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { signInWithEmailAndPassword } from 'firebase/auth';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Use Firebase emulators for user-creation tests.');
const app = initializeApp({ projectId: 'demo-sti-sync' }, 'creation-test');
const db = getFirestore(app);
const adminAuth = getAuth(app);
const originalFetch = globalThis.fetch;
const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: 'custom', define: {
  'import.meta.env.VITE_FIREBASE_EMULATORS': JSON.stringify('true'),
  'import.meta.env.VITE_EMAILJS_SERVICE_ID': JSON.stringify('test_service'),
  'import.meta.env.VITE_EMAILJS_TEMPLATE_ID': JSON.stringify('test_template'),
  'import.meta.env.VITE_EMAILJS_PUBLIC_KEY': JSON.stringify('test_public_key'),
} });
try {
  const { auth } = await server.ssrLoadModule('/src/services/firebase.ts');
  const studentService = await server.ssrLoadModule('/src/app/modules/students/services/student.service.ts');
  const orgService = await server.ssrLoadModule('/src/app/modules/organizations/services/organization.service.ts');
  const signatoryService = await server.ssrLoadModule('/src/app/modules/signatories/services/signatory.service.ts');
  const officerService = await server.ssrLoadModule('/src/app/modules/organizations/services/officer.service.ts');
  const admin = await adminAuth.createUser({ email: 'creation-admin@test.example', password: 'AdminPassword123!' });
  await db.doc(`sas_admins/${admin.uid}`).set({ isActive: true, email: admin.email });
  await signInWithEmailAndPassword(auth, admin.email, 'AdminPassword123!');
  globalThis.window = { location: { origin: 'http://localhost:5173', hostname: 'localhost', pathname: '/' } };
  globalThis.location = window.location;
  globalThis.fetch = async (url, options) => String(url).startsWith('https://api.emailjs.com/') ? new Response('OK', { status: 200 }) : originalFetch(url, options);
  const payload = { firstName: 'Test', lastName: 'Student', middleName: '', studentId: '02000123456', dateOfBirth: '2000-01-01', sex: 'Female', contactNumber: '9171234567', academicLevel: 'COLLEGE', courseId: 'course-test', courseCode: 'BSIT', courseName: 'Test Course', departmentId: 'dept-test', departmentName: 'Test Department', yearLevel: '1st Year', section: 'A', schoolYear: '2026-2027', semester: '1st Semester', email: 'created-student@test.example', password: 'TemporaryStudent123!', profilePhotoUrl: '', schoolIdPhotoUrl: '', sendWelcomeEmail: false };
  const studentId = await studentService.createStudentManually(payload, admin.uid);
  const student = (await db.doc(`students/${studentId}`).get()).data();
  assert.equal(student.tempPass, payload.password);
  assert.equal(student.requiresPasswordChange, true);
  assert.equal(student.resetInProgress, false);
  assert.equal(student.isProfileComplete, false);
  assert.equal(auth.currentUser.uid, admin.uid, 'Creating a student must preserve the SAS session');
  const lateId = await studentService.createLateEnrolleeStudent({ ...payload, studentId: '02000123457', email: undefined }, admin.uid);
  const late = (await db.doc(`students/${lateId}`).get()).data();
  assert.equal(late.tempPass, null);
  assert.equal(late.requiresPasswordChange, true);
  assert.equal(late.resetInProgress, false);
  assert.equal(late.isProfileComplete, false);
  assert.ok(late.defaultPassword, 'Unclaimed students keep their registrar onboarding credential');
  const orgId = await orgService.createOrganization({ name: 'Creation Test Organization', acronym: 'CTO', departmentId: 'dept-test', adviser: { name: 'Test Adviser', email: 'created-adviser@test.example', temporaryPassword: 'TemporaryAdviser123!', departmentId: 'dept-test' } }, admin.uid);
  const adviser = (await db.collection('organization_advisers').where('organizationId', '==', orgId).get()).docs[0].data();
  assert.equal(adviser.tempPass, 'TemporaryAdviser123!');
  assert.equal(adviser.requiresPasswordChange, true);
  assert.equal(adviser.resetInProgress, false);
  assert.ok(adviser.authUid);
  assert.equal((await db.doc(`organizations/${orgId}`).get()).data().adviser.tempPass, adviser.tempPass);
  await assert.rejects(orgService.assignOrRevokeOrganizationAdviser(orgId, 'Creation Test Organization', {
    action: 'assign', currentAdviser: adviser, newAdviser: { name: 'Duplicate Adviser', email: adviser.email }, sendEmailNotice: false,
  }));
  assert.equal((await db.collection('organization_advisers').where('organizationId', '==', orgId).get()).docs[0].data().isActive, true, 'A failed replacement must preserve the current adviser');
  const replacement = await orgService.assignOrRevokeOrganizationAdviser(orgId, 'Creation Test Organization', {
    action: 'assign', currentAdviser: adviser, newAdviser: { name: 'Replacement Adviser', email: 'replacement-adviser@test.example' }, sendEmailNotice: false,
  });
  assert.ok(replacement.authUid);
  assert.ok(replacement.tempPass);
  assert.equal(replacement.requiresPasswordChange, true);
  assert.equal(replacement.resetInProgress, false);
  assert.equal((await db.doc(`organizations/${orgId}`).get()).data().adviser.authUid, replacement.authUid);
  const signer = await signatoryService.createInstitutionalSignatory({ name: 'Test Signatory', email: 'created-signatory@test.example', role: 'program_head', roleTitle: 'Program Head', department: 'Test Department', temporaryPassword: 'TemporarySignatory123!' }, admin.uid);
  assert.equal(signer.success, true, signer.error);
  const signatory = (await db.doc(`institutional_signatories/${signer.id}`).get()).data();
  assert.equal(signatory.tempPass, 'TemporarySignatory123!');
  assert.equal(signatory.requiresPasswordChange, true);
  assert.equal(signatory.resetInProgress, false);
  assert.ok(signatory.authUid);
  await officerService.batchCreateOfficers(orgId, [{ roleId: 'president', studentId: payload.studentId, studentName: 'Test Student', email: payload.email }]);
  const officer = (await db.collection('organization_officers').where('organizationId', '==', orgId).get()).docs[0].data();
  assert.equal(officer.tempPass, student.tempPass);
  assert.equal(officer.authUid, student.authUid);
  assert.equal(officer.requiresPasswordChange, true);
  assert.equal(officer.resetInProgress, false);
  assert.equal(auth.currentUser.uid, admin.uid, 'Creating advisers/signatories/officers must preserve the SAS session');
  // A Firebase-only identity conflict must not create another invalid profile.
  await adminAuth.createUser({ email: 'already-exists@test.example', password: 'ExistingPassword123!' });
  const duplicate = await signatoryService.createInstitutionalSignatory({ name: 'Duplicate', email: 'already-exists@test.example', role: 'program_head', roleTitle: 'Head', department: 'Test' }, admin.uid);
  assert.equal(duplicate.success, false);
  assert.equal((await db.collection('institutional_signatories').where('email', '==', 'already-exists@test.example').get()).size, 0);
  console.log('PASS: actual student, late-enrollee, adviser, signatory, and officer creation saves password-state fields and preserves SAS login');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.window; delete globalThis.location;
  await server.close(); await db.terminate(); await deleteApp(app);
}
process.exit(0);
