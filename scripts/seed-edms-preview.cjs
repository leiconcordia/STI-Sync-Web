const backendRequire = require('node:module').createRequire(require.resolve('../functions/edms'));
// Local-only fixtures for manually checking the two portals. Never uses production.
const { initializeApp } = backendRequire('firebase-admin/app');
const { getAuth } = backendRequire('firebase-admin/auth');
const { getFirestore, FieldValue } = backendRequire('firebase-admin/firestore');
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Start the demo emulators and set their host variables first.');
  initializeApp({ projectId: 'demo-sti-sync' });
  const auth = getAuth(), db = getFirestore();
  for (const [name, email] of [['sas', 'sas@edms.example.test'], ['alpha', 'alpha@edms.example.test'], ['beta', 'beta@edms.example.test']]) {
    let user; try { user = await auth.getUserByEmail(email); } catch { user = await auth.createUser({ email, password: 'EdmsPreview123!' }); }
    if (name === 'sas') await db.doc(`sas_admins/${user.uid}`).set({ uid: user.uid, email, displayName: 'SAS Preview', firstName: 'SAS', lastName: 'Preview', isActive: true, role: 'admin', createdAt: FieldValue.serverTimestamp() });
    else {
      await db.doc(`organizations/${name}`).set({ name: `${name === 'alpha' ? 'Alpha' : 'Beta'} Club`, acronym: name.toUpperCase(), status: 'active', typeId: 'college', academicLevel: 'COLLEGE' });
      await db.doc(`organization_officers/${name}`).set({ studentId: name === 'alpha' ? '20260001' : '20260002', email, authUid: user.uid, organizationId: name, roleId: 'president', isActive: true, studentName: `${name} Officer` });
      await db.doc(`students/${user.uid}`).set({ studentId: name === 'alpha' ? '20260001' : '20260002', email, firstName: name, lastName: 'Officer', isActive: true });
    }
  }
  await db.doc('officer_roles/president').set({ name: 'President', label: 'President' });
  for (const [index, name] of ['Waivers', 'Letters'].entries()) await db.doc(`document_categories/${name.toLowerCase()}`).set({ name, normalizedName: name.toLowerCase(), active: true, archived: false, sortOrder: index, color: 'bg-blue-100 text-blue-700', colorDot: 'bg-blue-600' });
  for (const orgId of ['alpha', 'beta']) {
    for (const [collection, kind] of [['activities', 'AP'], ['post_activity_reports', 'PAR'], ['liquidations', 'FL']]) {
      await db.doc(`${collection}/${orgId}-${kind}`).set({ title: `${orgId.toUpperCase()} Club ${kind}`, eventTitle: `${orgId.toUpperCase()} Club ${kind}`, organizationId: orgId, hostingOrgId: orgId, isOfficerProposal: true, status: 'approved', proposalStatus: collection === 'activities' ? 'approved' : '', schoolYear: '2026-2027', semester: '1st Semester', approvedBy: 'SAS Preview', approvedAt: FieldValue.serverTimestamp(), lineItems: [], approvalChain: [], financialSummary: {}, attendanceSummary: {}, photos: [] });
    }
    for (const categoryId of ['waivers', 'letters']) await db.doc(`documents/${orgId}-${categoryId}`).set({ title: `${orgId.toUpperCase()} ${categoryId}`, description: 'Local fixture for organization-scoped custom storage.', type: 'submission', status: 'Approved', documentKind: 'general', categoryId, category: categoryId === 'waivers' ? 'Waivers' : 'Letters', submittedByOrgId: orgId, submittedByOrgName: `${orgId.toUpperCase()} Club`, visibility: 'owner_and_sas', isSasInternal: false, fileUrl: '', fileName: '', fileType: 'OTHER', fileSize: 0, referenceNumber: `DEMO-${orgId}-${categoryId}`, academicYear: '2026-2027', semester: '1st Semester', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
  await db.doc('documents/alpha-pending').set({ title: 'ALPHA pending letter', description: 'Local fixture for modal review.', type: 'submission', status: 'Pending', documentKind: 'general', categoryId: 'letters', category: 'Letters', submittedByOrgId: 'alpha', submittedByOrgName: 'Alpha Club', submittedBy: 'Alpha Officer', visibility: 'owner_and_sas', isSasInternal: false, fileUrl: '', fileName: '', fileType: 'OTHER', fileSize: 0, referenceNumber: 'DEMO-PENDING', academicYear: '2026-2027', semester: '1st Semester', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  console.log('Local EDMS preview fixtures created. Accounts: sas/alpha/beta@edms.example.test; password: EdmsPreview123!');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
