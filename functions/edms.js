'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const policy = import('./edms-domain.mjs');
const stamp = () => FieldValue.serverTimestamp();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const cleanName = (value) => String(value || 'document').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140);
function json(value) {
  if (value && typeof value.toDate === 'function') return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(json);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, json(item)]));
  return value;
}

async function accessFor(db, auth, persist = true) {
  if (!auth?.uid || !auth.token?.email) throw new HttpsError('unauthenticated', 'Sign in to access EDMS.');
  const email = auth.token.email.trim().toLowerCase();
  const admin = await db.doc(`sas_admins/${auth.uid}`).get();
  const isAdmin = admin.exists && admin.data().isActive !== false && admin.data().status !== 'inactive';
  const orgMemberships = {};
  let signatory = null;
  for (const collection of ['organization_officers', 'organization_advisers', 'institutional_signatories']) {
    const records = await db.collection(collection).where('email', '==', email).get();
    for (const record of records.docs) {
      const value = record.data();
      if (value.isActive === false || ['inactive', 'archived', 'suspended'].includes(value.status)) continue;
      if (collection === 'institutional_signatories') { signatory = { collection, id: record.id }; continue; }
      if (!value.organizationId || value.organizationId === 'sas') continue;
      const org = await db.doc(`organizations/${value.organizationId}`).get();
      if (org.exists && !['inactive', 'archived', 'suspended'].includes(org.data().status)) orgMemberships[value.organizationId] = { collection, id: record.id };
    }
  }
  const result = { isAdmin, orgMemberships, signatory, email, uid: auth.uid };
  if (persist) await db.doc(`_edms_access/${auth.uid}`).set({ ...result, updatedAt: stamp() });
  return result;
}

function requireAdmin(access) {
  if (!access.isAdmin) throw new HttpsError('permission-denied', 'Only SAS administrators can perform this action.');
}

function requireOrg(access, orgId) {
  if (!orgId || orgId === 'sas' || !access.orgMemberships[orgId]) throw new HttpsError('permission-denied', 'You do not have an active role in this organization.');
}

async function canRead(access, record) {
  if (access.isAdmin) return true;
  const { ownsDocument } = await policy;
  if (record.type === 'broadcast') return record.distribution === 'all' || (record.targetOrgIds || []).some((id) => access.orgMemberships[id]);
  return Object.keys(access.orgMemberships).some((id) => ownsDocument(record, id));
}

function referenceSpec(prefix, settings = {}) {
  prefix = String(prefix || 'DOC').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'DOC';
  const year = new Date().getUTCFullYear();
  const separator = ['-', '/', '.'].includes(settings.refSeparator) ? settings.refSeparator : '-';
  const includeYear = settings.refIncludeYear !== false;
  const head = `${prefix}${separator}${includeYear ? `${year}${separator}` : ''}`;
  return { head, counterId: hash(head), padding: Math.min(8, Math.max(1, settings.refPadding || 4)) };
}

// Read legacy references before entering a write transaction. Querying the
// archive collection while locking its counter can create a lock cycle when
// two approvals initialize that counter at once.
async function referenceBaseline(db, prefix, settings = {}, location = 'documents') {
  const spec = referenceSpec(prefix, settings);
  const current = await db.doc(`_edms_counters/${spec.counterId}`).get();
  if (current.exists) return current.data().value || 0;
  const legacy = await db.collection(location).where('referenceNumber', '>=', spec.head).where('referenceNumber', '<=', `${spec.head}\uf8ff`).orderBy('referenceNumber', 'desc').limit(1).get();
  return Number(legacy.docs[0]?.data().referenceNumber?.slice(spec.head.length)) || 0;
}

async function nextReference(db, prefix, transaction, settings = {}, baseline = 0) {
  const { head, counterId, padding } = referenceSpec(prefix, settings);
  const counter = db.doc(`_edms_counters/${counterId}`);
  const current = await transaction.get(counter);
  const value = current.exists ? current.data().value || 0 : baseline;
  transaction.set(counter, { value: value + 1, updatedAt: stamp() });
  return `${head}${String(value + 1).padStart(padding, '0')}`;
}

async function categoryFor(db, id) {
  if (!id) return { categoryId: '', category: '' };
  const record = await db.doc(`document_categories/${id}`).get();
  if (!record.exists || record.data().active === false || record.data().archived) throw new HttpsError('failed-precondition', 'Select an active document category.');
  return { categoryId: id, category: record.data().name };
}

async function changeCategory(db, access, input) {
  requireAdmin(access);
  const { normalizeCategoryName, CATEGORY_COLORS } = await policy;
  const ref = input.id ? db.doc(`document_categories/${input.id}`) : db.collection('document_categories').doc();
  return db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (input.id && !old.exists) throw new HttpsError('not-found', 'Category not found.');
    const previous = old.data() || {};
    let name;
    try { name = normalizeCategoryName(input.name ?? previous.name); } catch (error) { throw new HttpsError('invalid-argument', error.message); }
    const reservation = db.doc(`_document_category_names/${hash(name.normalizedName)}`);
    const reserved = await tx.get(reservation);
    const existing = await tx.get(db.collection('document_categories'));
    const duplicate = existing.docs.some((item) => { try { return item.id !== ref.id && normalizeCategoryName(item.data().name).normalizedName === name.normalizedName; } catch { return false; } });
    if ((reserved.exists && reserved.data().categoryId !== ref.id) || duplicate) throw new HttpsError('already-exists', 'This category already exists. Reactivate or rename the existing category.');
    const color = CATEGORY_COLORS.find((item) => item.color === input.color) || CATEGORY_COLORS.find((item) => item.color === previous.color) || CATEGORY_COLORS[0];
    if (previous.normalizedName && previous.normalizedName !== name.normalizedName) tx.delete(db.doc(`_document_category_names/${hash(previous.normalizedName)}`));
    tx.set(reservation, { categoryId: ref.id });
    tx.set(ref, { ...previous, ...name, ...color, active: input.active ?? previous.active ?? true, archived: input.archived ?? previous.archived ?? false, sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : previous.sortOrder ?? existing.size, officerCanSubmit: true, requiresRemarks: true, createdAt: previous.createdAt || stamp(), updatedAt: stamp() });
    return { id: ref.id, name: name.name };
  });
}

async function readAsset(url) {
  let target;
  try { target = new URL(url); } catch { throw new Error('Invalid attachment URL.'); }
  if (target.protocol !== 'https:' || !['res.cloudinary.com', 'firebasestorage.googleapis.com', 'storage.googleapis.com'].includes(target.hostname) || target.username || target.password) throw new Error('Unsupported attachment host.');
  const response = await fetch(target, { signal: AbortSignal.timeout(25000), redirect: 'error' });
  if (!response.ok) throw new Error(`Attachment retrieval failed (${response.status}).`);
  if (Number(response.headers.get('content-length')) > 25 * 1024 * 1024) throw new Error('Attachment exceeds 25 MB.');
  const chunks = []; let total = 0;
  for await (const chunk of response.body) { total += chunk.length; if (total > 25 * 1024 * 1024) throw new Error('Attachment exceeds 25 MB.'); chunks.push(chunk); }
  return { bytes: Buffer.concat(chunks), contentType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' };
}

async function saveFile(bucket, path, bytes, contentType) {
  await bucket.file(path).save(bytes, { resumable: false, metadata: { contentType, cacheControl: 'private, max-age=0', metadata: { edms: 'true' } } });
}

async function audit(db, id, action, actor, target, details = {}) {
  await db.doc(`audit_logs/${id}`).set({ action, actionType: 'Document Actions', performedBy: actor, targetId: target, metadata: details, timestamp: stamp(), createdAt: stamp() }, { merge: true });
}

async function createDocument(db, bucket, access, input) {
  const { inferFileType } = { inferFileType: (name) => ({ pdf: 'PDF', doc: 'DOCX', docx: 'DOCX', xls: 'XLSX', xlsx: 'XLSX', jpg: 'JPG', jpeg: 'JPG', png: 'PNG' })[String(name).split('.').pop().toLowerCase()] || 'OTHER' };
  if (!String(input.title || '').trim()) throw new HttpsError('invalid-argument', 'Document title is required.');
  const type = input.type === 'broadcast' ? 'broadcast' : 'submission';
  const internal = type === 'submission' && input.storeInternal === true;
  if (type === 'broadcast' || internal) requireAdmin(access); else requireOrg(access, input.submittedByOrgId);
  let previous = null;
  if (type === 'submission' && input.resubmissionOf) {
    previous = await db.doc(`documents/${input.resubmissionOf}`).get();
    if (!previous.exists || previous.data().submittedByOrgId !== input.submittedByOrgId || previous.data().status !== 'Returned' || previous.data().resubmittedAs) throw new HttpsError('failed-precondition', 'Only a returned document from this organization can be resubmitted once.');
  }
  const category = previous && previous.data().categoryId === input.categoryId ? { categoryId: input.categoryId, category: previous.data().category } : await categoryFor(db, input.categoryId);
  if (type === 'submission' && (!input.fileUrl || (!internal && !category.categoryId))) throw new HttpsError('invalid-argument', 'A document attachment and category are required.');
  const ref = db.collection('documents').doc();
  const allowed = ['title', 'description', 'semesterId', 'academicYear', 'semester', 'trimester', 'trimesterId', 'submittedBy', 'submittedByOrgId', 'submittedByOrgName', 'submittedByOrgAcronym', 'submittedByOrgTypeId', 'broadcastBy', 'distribution', 'targetOrgTypeId', 'resubmissionOf', 'resubmissionNote'];
  const fields = Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  const payload = { ...fields, ...category, type, title: input.title.trim(), documentKind: 'general', sourceModule: 'general', isSystemGenerated: false, sourceRecordId: null, sourceCollection: null, fileUrl: '', fileName: '', fileType: 'OTHER', fileSize: 0, fileStoragePath: '', status: type === 'broadcast' ? 'Approved' : input.status === 'Draft' ? 'Draft' : 'Pending', reviewedBy: null, reviewedAt: null, remarks: null, submittedByEmail: type === 'submission' ? access.email : '', broadcastByUid: type === 'broadcast' ? access.uid : '', isSasInternal: false, visibility: type === 'broadcast' ? 'public' : 'owner_and_sas', readBy: {}, createdAt: stamp(), updatedAt: stamp() };
  if (internal) Object.assign(payload, { submittedByOrgId: 'sas', submittedByOrgName: 'Student Affairs Services (SAS)', submittedByOrgAcronym: 'SAS', submittedBy: access.email, isSasInternal: true, visibility: 'sas_only', status: 'Approved', reviewedBy: access.email, reviewedAt: stamp() });
  if (type === 'submission' && !internal) {
    const org = (await db.doc(`organizations/${input.submittedByOrgId}`).get()).data();
    Object.assign(payload, { submittedByOrgName: org.name || '', submittedByOrgAcronym: org.acronym || '', submittedByOrgTypeId: org.typeId || '' });
    if (input.resubmissionOf) {
      payload.status = 'Resubmitted';
    }
  }
  if (type === 'broadcast') {
    const orgs = await db.collection('organizations').get();
    const allowed = orgs.docs.filter((item) => (item.data().status || 'active') === 'active').map((item) => item.id);
    payload.targetOrgIds = input.distribution === 'all' ? allowed : [...new Set(input.targetOrgIds || [])].filter((id) => allowed.includes(id));
    if (!payload.targetOrgIds.length) throw new HttpsError('invalid-argument', 'Select at least one active organization.');
    payload.submittedByOrgId = '';
  }
  if (input.fileUrl) {
    const file = await readAsset(input.fileUrl);
    const name = cleanName(input.fileName);
    const fileType = inferFileType(name);
    if (fileType === 'OTHER') throw new HttpsError('invalid-argument', 'Unsupported document file type.');
    const path = `edms/${ref.id}/${name}`;
    await saveFile(bucket, path, file.bytes, file.contentType);
    Object.assign(payload, { fileName: name, fileType, fileSize: file.bytes.length, fileStoragePath: path });
  }
  const settings = (await db.doc('system_settings/document_settings').get()).data() || {};
  const referencePrefix = type === 'broadcast' ? 'SAS' : settings.refPrefix || 'DOC';
  const referenceSeed = input.referenceNumber ? 0 : await referenceBaseline(db, referencePrefix, settings);
  await db.runTransaction(async (tx) => {
    if (previous) {
      const current = await tx.get(previous.ref);
      if (current.data().status !== 'Returned' || current.data().resubmittedAs) throw new HttpsError('failed-precondition', 'This returned document was already resubmitted.');
    }
    let referenceNumber;
    if (input.referenceNumber) {
      const reservation = db.doc(`_edms_reference_reservations/${hash(input.referenceNumber)}`);
      const record = await tx.get(reservation);
      if (!record.exists || record.data().uid !== access.uid || record.data().used) throw new HttpsError('failed-precondition', 'This document reference is no longer available. Please submit again.');
      referenceNumber = input.referenceNumber; tx.update(reservation, { used: true });
    } else referenceNumber = await nextReference(db, referencePrefix, tx, settings, referenceSeed);
    tx.set(ref, { ...payload, referenceNumber });
    if (previous) tx.update(previous.ref, { resubmittedAs: ref.id, updatedAt: stamp() });
  });
  await audit(db, `edms-create-${ref.id}`, type === 'broadcast' ? 'Document Broadcasted' : 'Document Submitted', access.email, ref.id).catch((error) => console.error('[EDMS audit]', error.message));
  return { id: ref.id };
}

async function resolveSource(db, kind, id, collection) {
  const collections = kind === 'activity_proposal' ? ['activities', 'events', 'activity_proposals'] : [kind === 'financial_liquidation' ? 'liquidations' : 'post_activity_reports'];
  if (collection && !collections.includes(collection)) throw new HttpsError('invalid-argument', 'Invalid document source.');
  for (const name of collections) { const snap = await db.doc(`${name}/${id}`).get(); if (snap.exists && (await policy).sourceIsApproved(kind, snap.data())) return snap; }
  throw new HttpsError('failed-precondition', 'This document has not received final approval.');
}

async function queueArchive(db, kind, sourceId, actor, collection) {
  const { WORKFLOW_KINDS, sourceOwner, sourceVersion, documentKind } = await policy;
  if (!WORKFLOW_KINDS.includes(kind)) throw new HttpsError('invalid-argument', 'Unknown workflow document kind.');
  const source = await resolveSource(db, kind, sourceId, collection);
  const data = source.data();
  const owner = sourceOwner(kind, data);
  const version = sourceVersion(data);
  let id = `${kind}_${hash(sourceId).slice(0, 24)}_v${version}`;
  // Reuse an existing historical archive rather than duplicating it at cutover.
  const old = await db.collection('documents').where('sourceRecordId', '==', sourceId).get();
  const match = old.docs.find((item) => documentKind(item.data()) === kind && (item.data().sourceVersion || 1) === version);
  if (match) id = match.id;
  const archive = db.doc(`report_archives/${id}`), job = db.doc(`_report_archive_jobs/${id}`);
  const snapshot = { source: json({ ...data, id: sourceId }), proposal: null, liquidation: null };
  if (kind !== 'activity_proposal' && data.eventId) {
    for (const name of ['activities', 'events', 'activity_proposals']) { const record = await db.doc(`${name}/${data.eventId}`).get(); if (record.exists) { snapshot.proposal = json(record.data()); break; } }
  }
  const liqId = data.liquidationId || snapshot.proposal?.liquidationReportId || snapshot.proposal?.liquidationId;
  if (kind === 'post_activity_report' && liqId) { const record = await db.doc(`liquidations/${liqId}`).get(); if (record.exists) snapshot.liquidation = json(record.data()); }
  const content = JSON.stringify(snapshot); const chunks = content.match(/[\s\S]{1,300000}/g) || [];
  const org = owner.internal ? null : (await db.doc(`organizations/${owner.orgId}`).get()).data();
  const settings = (await db.doc('system_settings/document_settings').get()).data() || {};
  const referenceSeed = await referenceBaseline(db, 'RPT', settings, 'report_archives');
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(archive);
    const existingJob = await tx.get(job);
    if (existingJob.exists || (existing.exists && existing.data().archiveStatus === 'ready' && existing.data().fileStoragePath)) {
      tx.set(source.ref, { archivedRecordCollection: 'report_archives', archivedDocumentId: id, archivedRefNumber: existing.data().referenceNumber || '' }, { merge: true }); return;
    }
    const referenceNumber = existing.data()?.referenceNumber || match?.data().referenceNumber || await nextReference(db, 'RPT', tx, settings, referenceSeed);
    const title = data.title || data.eventTitle || 'Approved document';
    tx.set(archive, { type: 'submission', archiveCollection: 'report_archives', documentKind: kind, title, referenceNumber, approvalHistory: json(data.approvalChain || []), description: `Approved ${kind.replaceAll('_', ' ')}.`, categoryId: '', category: '', fileUrl: '', fileName: '', fileSize: 0, fileType: 'OTHER', status: 'Approved', archiveStatus: 'processing', sourceModule: kind === 'financial_liquidation' ? 'finance' : 'events', sourceCollection: source.ref.parent.id, sourceRecordId: sourceId, sourceVersion: version, isSystemGenerated: true, submittedByOrgId: owner.orgId, submittedByOrgName: owner.internal ? 'Student Affairs Services (SAS)' : org?.name || data.organizationName || data.hostingOrgName || '', submittedByOrgAcronym: owner.internal ? 'SAS' : org?.acronym || data.organizationAcronym || data.hostingOrgAcronym || '', submittedByOrgTypeId: org?.typeId || '', submittedBy: data.submittedByName || data.createdByName || '', submittedByEmail: data.createdByEmail || '', semesterId: data.semesterId || '', academicYear: data.academicYear || data.schoolYear || '', semester: data.semester || '', trimester: data.trimester || '', trimesterId: data.trimesterId || '', reviewedBy: data.approvedBy || actor || 'System', reviewedAt: data.approvedAt || stamp(), approvedAt: data.approvedAt || stamp(), visibility: owner.internal ? 'sas_only' : 'owner_and_sas', isSasInternal: owner.internal, createdAt: existing.data()?.createdAt || stamp(), updatedAt: stamp(), remarks: null }, { merge: true });
    tx.set(job, { documentId: id, kind, status: 'queued', sourcePath: source.ref.path, chunkCount: chunks.length, attempts: 0, leaseUntil: 0, createdAt: stamp(), updatedAt: stamp() });
    chunks.forEach((payload, index) => tx.set(job.collection('chunks').doc(String(index)), { payload }));
    tx.set(source.ref, { archivedRecordCollection: 'report_archives', archivedDocumentId: id, archivedRefNumber: referenceNumber }, { merge: true });
  });
  return id;
}

async function processArchive(db, bucket, id) {
  const jobRef = db.doc(`_report_archive_jobs/${id}`), archive = db.doc(`report_archives/${id}`);
  const token = randomUUID();
  const job = await db.runTransaction(async (tx) => {
    const record = await tx.get(jobRef); if (!record.exists) return null;
    const data = record.data();
    if (data.status === 'ready' || data.leaseUntil > Date.now() || data.attempts >= 5) return null;
    tx.update(jobRef, { status: 'processing', leaseUntil: Date.now() + 240000, leaseToken: token, attempts: data.attempts + 1, updatedAt: stamp() });
    tx.update(archive, { archiveStatus: 'processing', archiveErrorCode: null, updatedAt: stamp() });
    return data;
  });
  if (!job) return;
  try {
    const chunks = await Promise.all(Array.from({ length: job.chunkCount }, (_, index) => jobRef.collection('chunks').doc(String(index)).get()));
    const snapshot = JSON.parse(chunks.map((item) => item.data().payload).join(''));
    const cache = new Map();
    const imageLoader = async (url) => {
      if (!url) return null;
      if (url.startsWith('data:image/')) return url;
      if (!cache.has(url)) cache.set(url, readAsset(url));
      const file = await cache.get(url);
      return `data:${file.contentType};base64,${file.bytes.toString('base64')}`;
    };
    const { renderArchivedDocument } = require('./generated/report-renderers.cjs');
    const file = await renderArchivedDocument(job.kind, snapshot, imageLoader);
    const name = `${job.kind}-${cleanName(snapshot.source.referenceNo || snapshot.source.referenceNumber || snapshot.source.id)}.${file.extension}`;
    const path = `reports/${id}/${name}`, snapshotPath = `reports/${id}/approved-snapshot.json`;
    await saveFile(bucket, snapshotPath, Buffer.from(JSON.stringify(snapshot)), 'application/json');
    await saveFile(bucket, path, file.bytes, file.contentType);
    const urls = new Map();
    const collect = (value, key = '') => {
      if (typeof value === 'string' && /^(url|fileUrl|receiptUrl|evaluationSummaryUrl|signatureUrl)$/.test(key) && value.startsWith('https://')) urls.set(value, key);
      else if (Array.isArray(value)) value.forEach((item) => collect(item));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([name, item]) => collect(item, name));
    };
    collect(snapshot.source);
    const attachments = [];
    for (const [url, label] of urls) {
      const asset = cache.has(url) ? await cache.get(url) : await readAsset(url);
      const assetName = `${attachments.length + 1}-${label}-${cleanName(new URL(url).pathname.split('/').pop())}`;
      const storagePath = `reports/${id}/attachments/${assetName}`;
      await saveFile(bucket, storagePath, asset.bytes, asset.contentType);
      attachments.push({ name: assetName, storagePath, contentType: asset.contentType, size: asset.bytes.length });
    }
    await db.runTransaction(async (tx) => {
      const current = await tx.get(jobRef); if (current.data().leaseToken !== token) return;
      tx.update(archive, { fileStoragePath: path, fileName: name, fileSize: file.bytes.length, fileType: file.fileType, snapshotStoragePath: snapshotPath, attachments, archiveStatus: 'ready', archiveErrorCode: null, archivedAt: stamp(), updatedAt: stamp() });
      tx.update(jobRef, { status: 'ready', leaseUntil: 0, updatedAt: stamp() });
    });
    await audit(db, `edms-archive-${id}`, 'Approved Report Stored', 'System', id, { documentKind: job.kind }).catch((error) => console.error('[Report archive audit]', error.message));
  } catch (error) {
    console.error('[EDMS archive]', id, error.message);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(jobRef); if (current.data().leaseToken !== token) return;
      tx.update(jobRef, { status: 'failed', leaseUntil: 0, error: String(error.message).slice(0, 500), updatedAt: stamp() });
      tx.update(archive, { archiveStatus: 'failed', archiveErrorCode: 'report_storage_failed', updatedAt: stamp() });
    });
  }
}

async function handleEdms({ db, bucket }, request) {
  const input = request.data || {};
  const access = await accessFor(db, request.auth, input.action === 'access');
  if (input.action === 'access') return { isAdmin: access.isAdmin, orgIds: Object.keys(access.orgMemberships) };
  if (input.action === 'category') return changeCategory(db, access, input);
  if (input.action === 'create') return createDocument(db, bucket, access, input.document || {});
  if (input.action === 'legacyDocuments') {
    if (!access.isAdmin || input.orgId) requireOrg(access, input.orgId);
    const { ownsDocument, documentKind } = await policy;
    const records = input.orgId ? await db.collection('documents').where('submittedByOrgId', '==', input.orgId).get() : await db.collection('documents').where('type', '==', 'submission').get();
    const reports = input.location === 'report_archives';
    return { documents: records.docs.map((item) => ({ ...json(item.data()), id: item.id, archiveCollection: 'documents' })).filter((item) => (access.isAdmin || ownsDocument(item, input.orgId)) && (reports ? documentKind(item) !== 'general' : documentKind(item) === 'general')) };
  }
  if (input.action === 'reference') {
    if (!access.isAdmin && !Object.keys(access.orgMemberships).length) throw new HttpsError('permission-denied', 'An active organization role is required.');
    const settings = (await db.doc('system_settings/document_settings').get()).data() || {};
    const prefix = input.prefix === 'SAS' && access.isAdmin ? 'SAS' : settings.refPrefix || 'DOC';
    const baseline = await referenceBaseline(db, prefix, settings);
    return { referenceNumber: await db.runTransaction(async (tx) => {
      const value = await nextReference(db, prefix, tx, settings, baseline);
      tx.set(db.doc(`_edms_reference_reservations/${hash(value)}`), { uid: access.uid, used: false, createdAt: stamp() }); return value;
    }) };
  }
  if (input.action === 'archive') {
    if (!access.isAdmin && !access.signatory) throw new HttpsError('permission-denied', 'An authorized reviewer is required.');
    const id = await queueArchive(db, input.kind, input.sourceId, access.uid, input.sourceCollection);
    await processArchive(db, bucket, id); return { id };
  }
  const location = input.location === 'report_archives' ? 'report_archives' : 'documents';
  const ref = db.doc(`${location}/${String(input.id || '_missing').replaceAll('/', '')}`);
  const record = await ref.get();
  if (!record.exists) throw new HttpsError('not-found', 'Document not found.');
  const data = record.data();
  if (!(await canRead(access, data))) throw new HttpsError('permission-denied', 'This document does not belong to your organization.');
  if (input.action === 'download') {
    const path = input.attachmentIndex === undefined ? data.fileStoragePath : data.attachments?.[input.attachmentIndex]?.storagePath;
    if (!path || !path.startsWith(`${location === 'report_archives' ? 'reports' : 'edms'}/${ref.id}/`)) throw new HttpsError('failed-precondition', 'This document has no stored attachment.');
    if (process.env.STORAGE_EMULATOR_HOST) {
      const token = randomUUID();
      await bucket.file(path).setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
      const endpoint = process.env.STORAGE_EMULATOR_HOST.replace(/\/$/, '');
      return { url: `${endpoint.startsWith('http') ? endpoint : `http://${endpoint}`}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}` };
    }
    const [url] = await bucket.file(path).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60000 }); return { url };
  }
  if (input.action === 'retry') {
    requireAdmin(access);
    if (location !== 'report_archives') throw new HttpsError('failed-precondition', 'Only Reports & Analytics archives use report storage retries.');
    const job = db.doc(`_report_archive_jobs/${ref.id}`);
    await db.runTransaction(async (tx) => { const current = await tx.get(job); if (!current.exists) throw new HttpsError('failed-precondition', 'Migrate this legacy archive before retrying.'); if (current.data().leaseUntil > Date.now()) throw new HttpsError('failed-precondition', 'Storage is already running.'); tx.update(job, { attempts: 0 }); });
    await processArchive(db, bucket, ref.id); return { id: ref.id };
  }
  if (input.action === 'read') {
    requireOrg(access, input.orgId);
    if (data.type !== 'broadcast' || !(data.distribution === 'all' || data.targetOrgIds?.includes(input.orgId))) throw new HttpsError('permission-denied', 'Broadcast not addressed to this organization.');
    await ref.update({ [`readBy.${input.orgId}`]: stamp(), updatedAt: stamp() }); return {};
  }
  if (input.action === 'reclassify') {
    if (location !== 'documents') throw new HttpsError('failed-precondition', 'Report archives do not use custom document categories.');
    requireAdmin(access);
    if ((await policy).documentKind(data) !== 'general') throw new HttpsError('failed-precondition', 'AP, PAR, and FL belong in Reports & Analytics.');
    const category = await categoryFor(db, input.categoryId);
    await ref.update({ ...category, updatedAt: stamp() });
    await audit(db, `edms-category-${randomUUID()}`, 'Document Category Changed', access.email, ref.id, { previousCategoryId: data.categoryId || '', categoryId: category.categoryId }); return {};
  }
  if (input.action === 'update') {
    if ((await policy).documentKind(data) !== 'general' || !['Draft', 'Returned'].includes(data.status)) throw new HttpsError('failed-precondition', 'Only draft or returned general documents can be edited.');
    const changes = input.document || {};
    const fields = {};
    if (changes.title !== undefined) { if (!String(changes.title).trim()) throw new HttpsError('invalid-argument', 'Title is required.'); fields.title = String(changes.title).trim(); }
    if (changes.description !== undefined) fields.description = String(changes.description);
    if (changes.categoryId !== undefined && changes.categoryId !== data.categoryId) Object.assign(fields, await categoryFor(db, changes.categoryId));
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data();
      if (!['Draft', 'Returned'].includes(current.status)) throw new HttpsError('failed-precondition', 'This document is no longer editable.');
      tx.update(ref, { ...fields, updatedAt: stamp() });
    });
    return {};
  }
  if (input.action === 'review') {
    requireAdmin(access);
    if (!['Approved', 'Returned', 'Rejected'].includes(input.status)) throw new HttpsError('invalid-argument', 'Invalid review action.');
    if (input.status !== 'Approved' && !String(input.remarks || '').trim()) throw new HttpsError('invalid-argument', 'Remarks are required.');
    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (latest.type !== 'submission' || !['Pending', 'Resubmitted'].includes(latest.status) || (await policy).documentKind(latest) !== 'general') throw new HttpsError('failed-precondition', 'This document has already been reviewed. Refresh the list.');
      tx.update(ref, { status: input.status, reviewedBy: access.email, reviewedAt: stamp(), remarks: String(input.remarks || '').trim() || null, updatedAt: stamp() });
    });
    await audit(db, `edms-review-${ref.id}-${input.status}`, `Document ${input.status}`, access.email, ref.id); return {};
  }
  throw new HttpsError('invalid-argument', 'Unknown EDMS action.');
}

module.exports = { handleEdms, accessFor, queueArchive, processArchive, canRead, readAsset };
