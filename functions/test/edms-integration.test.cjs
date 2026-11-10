const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getFirestore: adminDb, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, getDoc, doc, setDoc, updateDoc, collection, query, where, getDocs } = require('firebase/firestore');
const { handleEdms, queueArchive, processArchive } = require('../edms');
const apps = [];
let db, bucket, admin, a, b, sas, signer;
const projectId = 'demo-sti-sync';
const call = (user, action, input = {}) => handleEdms({ db, bucket }, { auth: { uid: user.uid, token: { email: user.email } }, data: { ...input, action } });
async function account(name) {
  const app = initializeApp({ projectId, apiKey: 'demo-key', storageBucket: `${projectId}.appspot.com` }, `edms-${name}-${Date.now()}`); apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app); const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); connectFirestoreEmulator(firestore, host, Number(port));
  const { user } = await createUserWithEmailAndPassword(auth, `edms-${name}-${Date.now()}@example.test`, 'TestPassword123!');
  return { uid: user.uid, email: user.email, db: firestore };
}
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.STORAGE_EMULATOR_HOST, 'Run using test:edms:integration; never run against production.');
  admin = adminApp({ projectId, storageBucket: `${projectId}.appspot.com` }, `edms-admin-${Date.now()}`); db = adminDb(admin); bucket = getStorage(admin).bucket();
  [a, b, sas, signer] = await Promise.all(['a', 'b', 'sas', 'signer'].map(account));
  await Promise.all([
    db.doc(`sas_admins/${sas.uid}`).set({ isActive: true }),
    db.doc('organizations/edms-org-a').set({ status: 'active', name: 'Organization A' }),
    db.doc('organizations/edms-org-b').set({ status: 'active', name: 'Organization B' }),
    db.doc('organization_officers/edms-a').set({ email: a.email, organizationId: 'edms-org-a', isActive: true }),
    db.doc('organization_officers/edms-b').set({ email: b.email, organizationId: 'edms-org-b', isActive: true }),
    db.doc('institutional_signatories/edms-signer').set({ email: signer.email, isActive: true }),
  ]);
  await Promise.all([a, b, sas, signer].map((user) => call(user, 'access')));
});
after(async () => { await Promise.all(apps.map(deleteApp)); if (admin) await deleteAdmin(admin); });

test('only verified SAS can create categories, including duplicate-name race protection', async () => {
  await assert.rejects(call(a, 'category', { name: 'Not Allowed' }), /SAS administrators/);
  const results = await Promise.allSettled([call(sas, 'category', { name: '  EDMS Waivers  ' }), call(sas, 'category', { name: 'edms waivers' })]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  const winner = results.find((item) => item.status === 'fulfilled').value;
  await call(sas, 'category', { id: winner.id, archived: true, active: false });
  await assert.rejects(call(sas, 'category', { name: 'edms waivers' }), /already exists/);
  await call(sas, 'category', { id: winner.id, archived: false, active: true, name: 'EDMS Waivers Renamed' });
  assert.equal((await db.doc(`document_categories/${winner.id}`).get()).data().name, 'EDMS Waivers Renamed');
});

test('officers cannot forge membership, final approval, or EDMS records', async () => {
  await updateDoc(doc(a.db, 'organization_officers', 'edms-a'), { tempPass: null, requiresPasswordChange: false, resetInProgress: false, authUid: a.uid, email: a.email });
  await assert.rejects(updateDoc(doc(a.db, 'organization_officers', 'edms-a'), { organizationId: 'edms-org-b' }), /permission/i);
  await assert.rejects(setDoc(doc(a.db, 'organization_officers', 'forged'), { email: a.email, organizationId: 'edms-org-b', isActive: true }), /permission/i);
  await assert.rejects(setDoc(doc(a.db, 'documents', 'forged'), { submittedByOrgId: 'edms-org-b' }), /permission/i);
  await assert.rejects(setDoc(doc(a.db, 'liquidations', 'forged-approved'), { organizationId: 'edms-org-a', status: 'approved' }), /permission/i);
  await assert.rejects(call(a, 'archive', { kind: 'activity_proposal', sourceId: 'unapproved' }), /authorized reviewer/);
});

test('own-org document reads and legacy loading exclude other organizations and SAS-only records', async () => {
  const base = { type: 'submission', documentKind: 'general', status: 'Approved', visibility: 'owner_and_sas', isSasInternal: false, title: 'Own record', categoryId: 'unrelated' };
  await Promise.all([
    db.doc('documents/edms-own').set({ ...base, submittedByOrgId: 'edms-org-a' }),
    db.doc('documents/edms-other').set({ ...base, submittedByOrgId: 'edms-org-b' }),
    db.doc('documents/edms-internal').set({ ...base, submittedByOrgId: 'edms-org-a', visibility: 'sas_only', isSasInternal: true }),
    db.doc('documents/edms-legacy').set({ type: 'submission', status: 'Approved', submittedByOrgId: 'edms-org-a', title: 'Legacy record' }),
  ]);
  assert.equal((await getDoc(doc(a.db, 'documents', 'edms-own'))).exists(), true);
  await assert.rejects(getDoc(doc(a.db, 'documents', 'edms-other')), /permission/i);
  await assert.rejects(getDoc(doc(a.db, 'documents', 'edms-internal')), /permission/i);
  await assert.rejects(getDocs(collection(a.db, 'documents')), /permission/i);
  const scoped = await getDocs(query(collection(a.db, 'documents'), where('type', '==', 'submission'), where('submittedByOrgId', '==', 'edms-org-a'), where('visibility', '==', 'owner_and_sas'), where('isSasInternal', '==', false)));
  assert.ok(scoped.docs.some((item) => item.id === 'edms-own'));
  const legacy = await call(a, 'legacyDocuments', { orgId: 'edms-org-a' });
  assert.ok(legacy.documents.some((item) => item.id === 'edms-legacy'));
  assert.ok(legacy.documents.every((item) => !['edms-other', 'edms-internal'].includes(item.id)));
  await assert.rejects(call(a, 'legacyDocuments', { orgId: 'edms-org-b' }), /active role/);
});

test('text-only broadcasts preserve recipients, allow read tracking and have no fabricated file', async () => {
  const result = await call(sas, 'create', { document: { type: 'broadcast', title: 'No file broadcast', description: 'Message only', distribution: 'specific', targetOrgIds: ['edms-org-a'] } });
  const record = (await db.doc(`documents/${result.id}`).get()).data();
  assert.equal(record.fileSize, 0); assert.equal(record.fileUrl, ''); assert.equal(record.fileStoragePath, '');
  assert.equal((await getDoc(doc(a.db, 'documents', result.id))).exists(), true);
  await assert.rejects(getDoc(doc(b.db, 'documents', result.id)), /permission/i);
  await call(a, 'read', { id: result.id, orgId: 'edms-org-a' });
  assert.ok((await db.doc(`documents/${result.id}`).get()).data().readBy['edms-org-a']);
  await assert.rejects(call(a, 'download', { id: result.id }), /no stored attachment/);
});

test('general review uses required remarks and rejects stale/concurrent decisions', async () => {
  await db.doc('documents/edms-review').set({ type: 'submission', status: 'Pending', documentKind: 'general', submittedByOrgId: 'edms-org-a', visibility: 'owner_and_sas', isSasInternal: false });
  await assert.rejects(call(sas, 'review', { id: 'edms-review', status: 'Returned', remarks: ' ' }), /Remarks are required/);
  await assert.rejects(call(a, 'review', { id: 'edms-review', status: 'Approved' }), /SAS administrators/);
  const results = await Promise.allSettled([call(sas, 'review', { id: 'edms-review', status: 'Approved' }), call(sas, 'review', { id: 'edms-review', status: 'Rejected', remarks: 'Reason' })]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
});

test('AP, PAR and FL store actual files exactly once, remain separate from categories and keep source ownership', async () => {
  const cases = [['activity_proposal', 'activities', 'edms-ap'], ['post_activity_report', 'post_activity_reports', 'edms-par'], ['financial_liquidation', 'liquidations', 'edms-fl']];
  for (const [kind, collectionName, sourceId] of cases) {
    await db.doc(`${collectionName}/${sourceId}`).set({ title: 'Approved activity', eventTitle: 'Approved activity', organizationId: 'edms-org-a', hostingOrgId: 'edms-org-a', isOfficerProposal: true, status: 'approved', proposalStatus: kind === 'activity_proposal' ? 'approved' : '', approvedBy: sas.uid, approvedAt: new Date(), lineItems: [], approvalChain: [], financialSummary: {}, attendanceSummary: {}, photos: [], categoryId: 'a-random-event-category' });
    const ids = await Promise.all([queueArchive(db, kind, sourceId, sas.uid), queueArchive(db, kind, sourceId, signer.uid)]);
    assert.equal(ids[0], ids[1]);
    await Promise.all([processArchive(db, bucket, ids[0]), processArchive(db, bucket, ids[0])]);
    const record = (await db.doc(`report_archives/${ids[0]}`).get()).data();
    assert.equal(record.archiveStatus, 'ready', `Storage failed for ${kind}: ${JSON.stringify((await db.doc(`_report_archive_jobs/${ids[0]}`).get()).data())}`);
    assert.equal((await db.doc(`documents/${ids[0]}`).get()).exists, false);
    assert.equal((await getDoc(doc(a.db, 'report_archives', ids[0]))).exists(), true);
    await assert.rejects(getDoc(doc(b.db, 'report_archives', ids[0])), /permission/i);
    assert.equal(record.documentKind, kind); assert.equal(record.categoryId, ''); assert.equal(record.submittedByOrgId, 'edms-org-a');
    const [bytes] = await bucket.file(record.fileStoragePath).download();
    assert.equal(bytes.length, record.fileSize); assert.equal(bytes.subarray(0, kind === 'financial_liquidation' ? 2 : 4).toString(), kind === 'financial_liquidation' ? 'PK' : '%PDF');
    assert.equal((await db.doc(`${collectionName}/${sourceId}`).get()).data().archivedDocumentId, ids[0]);
    const download = await call(a, 'download', { id: ids[0], location: 'report_archives' });
    assert.equal((await fetch(download.url)).status, 200);
    await assert.rejects(call(b, 'download', { id: ids[0], location: 'report_archives' }), /does not belong/);
    await assert.rejects(call(sas, 'reclassify', { id: ids[0], location: 'report_archives', categoryId: '' }), /do not use custom document categories/);
    const reference = record.referenceNumber;
    await processArchive(db, bucket, ids[0]);
    assert.equal((await db.doc(`report_archives/${ids[0]}`).get()).data().referenceNumber, reference);
    if (kind === 'activity_proposal') {
      await db.doc(`events/${sourceId}`).set((await db.doc(`activities/${sourceId}`).get()).data());
      assert.equal(await queueArchive(db, kind, sourceId, sas.uid, 'events'), ids[0]);
    }
  }
});

test('custom uploads remain general, review into their own category, and reject forged organization IDs', async () => {
  const category = await call(sas, 'category', { name: 'EDMS Custom Uploads' });
  const originalFetch = global.fetch;
  global.fetch = (url, options) => String(url) === 'https://res.cloudinary.com/edms-test.pdf' ? Promise.resolve(new Response(Buffer.from('%PDF-1.7 test attachment'), { headers: { 'content-type': 'application/pdf' } })) : originalFetch(url, options);
  try {
    const input = { type: 'submission', title: 'Organization A custom document', submittedByOrgId: 'edms-org-a', categoryId: category.id, fileUrl: 'https://res.cloudinary.com/edms-test.pdf', fileName: 'waiver.pdf', documentKind: 'activity_proposal', status: 'Approved', isSasInternal: true };
    await assert.rejects(call(a, 'create', { document: { ...input, submittedByOrgId: 'edms-org-b' } }), /active role/);
    const { id } = await call(a, 'create', { document: input });
    let record = (await db.doc(`documents/${id}`).get()).data();
    assert.equal(record.documentKind, 'general'); assert.equal(record.status, 'Pending'); assert.equal(record.isSasInternal, false);
    assert.equal(record.categoryId, category.id); assert.equal(record.fileUrl, ''); assert.ok(record.fileStoragePath);
    await call(sas, 'review', { id, status: 'Approved' });
    await call(sas, 'category', { id: category.id, name: 'Renamed Uploads', active: false });
    record = (await db.doc(`documents/${id}`).get()).data();
    assert.equal(record.categoryId, category.id); assert.equal(record.status, 'Approved');
    await assert.rejects(call(a, 'create', { document: input }), /active document category/);
    await call(sas, 'reclassify', { id, categoryId: '' });
    assert.equal((await db.doc(`documents/${id}`).get()).data().categoryId, '');
    await assert.rejects(call(b, 'download', { id }), /does not belong/);
  } finally { global.fetch = originalFetch; }
});

test('failed storage retries preserve the original approved snapshot and reference', async () => {
  const sourceId = 'edms-retry';
  await db.doc(`post_activity_reports/${sourceId}`).set({ status: 'approved', eventTitle: 'Original approved title', organizationId: 'edms-org-a', financialSummary: {}, attendanceSummary: {}, photos: [], approvalChain: [] });
  const id = await queueArchive(db, 'post_activity_report', sourceId, sas.uid);
  const reference = (await db.doc(`report_archives/${id}`).get()).data().referenceNumber;
  const brokenBucket = { file: (path) => { const file = bucket.file(path); return path.endsWith('.pdf') ? { save: async () => { throw new Error('Injected upload failure'); } } : file; } };
  await processArchive(db, brokenBucket, id);
  assert.equal((await db.doc(`report_archives/${id}`).get()).data().archiveStatus, 'failed');
  await db.doc(`post_activity_reports/${sourceId}`).update({ eventTitle: 'Later edited title' });
  await call(sas, 'retry', { id, location: 'report_archives' });
  const record = (await db.doc(`report_archives/${id}`).get()).data();
  assert.equal(record.archiveStatus, 'ready'); assert.equal(record.referenceNumber, reference);
  const [snapshot] = await bucket.file(record.snapshotStoragePath).download();
  assert.equal(JSON.parse(snapshot).source.eventTitle, 'Original approved title');
  await db.doc(`post_activity_reports/${sourceId}`).update({ revisionCount: 2 });
  assert.notEqual(await queueArchive(db, 'post_activity_report', sourceId, sas.uid), id);
});

test('legacy workflow records migrate into Reports & Analytics while keeping their historical reference', async () => {
  await db.doc('activities/edms-legacy-ap').set({ title: 'Legacy approved AP', hostingOrgId: 'edms-org-a', isOfficerProposal: true, proposalStatus: 'approved', approvalChain: [] });
  await db.doc('documents/edms-legacy-archive').set({ type: 'submission', status: 'Approved', title: '[Approved Proposal] Legacy approved AP', sourceModule: 'events', sourceRecordId: 'edms-legacy-ap', isSystemGenerated: true, submittedByOrgId: 'edms-org-a', referenceNumber: 'DOC-2025-0099', visibility: 'owner_and_sas', isSasInternal: false });
  const id = await queueArchive(db, 'activity_proposal', 'edms-legacy-ap', sas.uid);
  assert.equal(id, 'edms-legacy-archive');
  await processArchive(db, bucket, id);
  const record = (await db.doc(`report_archives/${id}`).get()).data();
  assert.equal(record.referenceNumber, 'DOC-2025-0099'); assert.equal(record.archiveStatus, 'ready');
  assert.ok(record.fileStoragePath.startsWith('reports/'));
  assert.equal((await db.doc('activities/edms-legacy-ap').get()).data().archivedRecordCollection, 'report_archives');
  const edms = await call(a, 'legacyDocuments', { orgId: 'edms-org-a' });
  assert.equal(edms.documents.some((item) => item.id === id), false);
});

test('returned documents retain their category and cannot be resubmitted twice', async () => {
  const category = await call(sas, 'category', { name: 'EDMS Returned Category' });
  await db.doc('documents/edms-returned').set({ type: 'submission', documentKind: 'general', status: 'Returned', submittedByOrgId: 'edms-org-a', categoryId: category.id, category: category.name, visibility: 'owner_and_sas', isSasInternal: false });
  await call(sas, 'category', { id: category.id, active: false });
  const originalFetch = global.fetch;
  global.fetch = (url, options) => String(url) === 'https://res.cloudinary.com/edms-revision.pdf' ? Promise.resolve(new Response(Buffer.from('%PDF-1.7 revised attachment'), { headers: { 'content-type': 'application/pdf' } })) : originalFetch(url, options);
  try {
    const document = { type: 'submission', title: 'Revised document', categoryId: category.id, submittedByOrgId: 'edms-org-a', resubmissionOf: 'edms-returned', resubmissionNote: 'Updated signature', fileName: 'revision.pdf', fileUrl: 'https://res.cloudinary.com/edms-revision.pdf' };
    const outcomes = await Promise.allSettled([call(a, 'create', { document }), call(a, 'create', { document })]);
    assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
    const id = outcomes.find((item) => item.status === 'fulfilled').value.id;
    assert.equal((await db.doc(`documents/${id}`).get()).data().status, 'Resubmitted');
    assert.equal((await db.doc('documents/edms-returned').get()).data().resubmittedAs, id);
  } finally { global.fetch = originalFetch; }
});

test('pending and ownerless sources cannot enter approved storage; membership revocation removes access', async () => {
  await db.doc('post_activity_reports/edms-pending').set({ status: 'under_review', organizationId: 'edms-org-a' });
  await assert.rejects(queueArchive(db, 'post_activity_report', 'edms-pending', sas.uid), /final approval/);
  await db.doc('post_activity_reports/edms-ownerless').set({ status: 'approved' });
  await assert.rejects(queueArchive(db, 'post_activity_report', 'edms-ownerless', sas.uid), /no owning organization/);
  await db.doc('organization_officers/edms-a').update({ isActive: false });
  await assert.rejects(getDoc(doc(a.db, 'documents', 'edms-own')), /permission/i);
  await assert.rejects(call(a, 'legacyDocuments', { orgId: 'edms-org-a' }), /active role/);
});
