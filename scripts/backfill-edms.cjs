const backendRequire = require('node:module').createRequire(require.resolve('../functions/edms'));
// Defaults to a read-only inventory. Use --apply only after reviewing its output.
const { initializeApp } = backendRequire('firebase-admin/app');
const { getFirestore, FieldValue } = backendRequire('firebase-admin/firestore');
const { getStorage } = backendRequire('firebase-admin/storage');
const { queueArchive, processArchive, readAsset } = require('../functions/edms');

async function main() {
  const args = process.argv.slice(2);
  const projectId = args[args.indexOf('--project') + 1];
  if (!args.includes('--project') || !projectId || projectId.startsWith('--')) throw new Error('Provide --project explicitly. Defaults to dry-run; add --apply to migrate.');
  const apply = args.includes('--apply');
  if (projectId.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('A demo project must use the Firestore emulator.');
  initializeApp({ projectId, storageBucket: process.env.EDMS_STORAGE_BUCKET || (projectId.startsWith('demo-') ? `${projectId}.appspot.com` : 'sti-sync.firebasestorage.app') });
  const db = getFirestore(), bucket = getStorage().bucket();
  const { documentKind, sourceIsApproved, normalizeCategoryName } = await import('../functions/edms-domain.mjs');
  const categories = await db.collection('document_categories').get();
  const names = new Map();
  for (const category of categories.docs) {
    try {
      const normalized = normalizeCategoryName(category.data().name);
      if (names.has(normalized.normalizedName)) console.log(JSON.stringify({ action: 'review_duplicate_category', ids: [names.get(normalized.normalizedName), category.id], name: normalized.name }));
      else names.set(normalized.normalizedName, category.id);
    } catch { console.log(JSON.stringify({ action: 'review_invalid_category', id: category.id })); }
  }
  const documents = await db.collection('documents').get();
  const seen = new Map();
  for (const record of documents.docs) {
    const data = record.data(), kind = documentKind(data);
    if (kind !== 'general') {
      const key = `${kind}/${data.sourceRecordId}/${data.sourceVersion || 1}`;
      if (seen.has(key)) console.log(JSON.stringify({ action: 'review_duplicate_archive', ids: [seen.get(key), record.id], key }));
      else seen.set(key, record.id);
      continue;
    }
    if (data.type !== 'broadcast' && !data.submittedByOrgId) { console.log(JSON.stringify({ action: 'review_missing_owner', id: record.id })); continue; }
    console.log(JSON.stringify({ action: apply ? 'migrate_general_document' : 'would_migrate_general_document', id: record.id }));
    if (!apply) continue;
    const internal = data.isSasInternal === true || data.visibility === 'sas_only' || data.submittedByOrgId === 'sas';
    const updates = { documentKind: 'general', isSystemGenerated: false, visibility: data.type === 'broadcast' ? 'public' : internal ? 'sas_only' : 'owner_and_sas', isSasInternal: internal, updatedAt: FieldValue.serverTimestamp() };
    if (data.fileUrl && !data.fileStoragePath) {
      const asset = await readAsset(data.fileUrl);
      const name = String(data.fileName || 'attachment').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140);
      const path = `edms/${record.id}/${name}`;
      await bucket.file(path).save(asset.bytes, { resumable: false, metadata: { contentType: asset.contentType, cacheControl: 'private, max-age=0' } });
      Object.assign(updates, { fileStoragePath: path, fileUrl: '', fileSize: asset.bytes.length });
    }
    await record.ref.update(updates);
  }
  const processed = new Set();
  for (const [collection, kind] of Object.entries({ activities: 'activity_proposal', events: 'activity_proposal', activity_proposals: 'activity_proposal', liquidations: 'financial_liquidation', post_activity_reports: 'post_activity_report' })) {
    const records = await db.collection(collection).get();
    for (const source of records.docs) {
      if (!sourceIsApproved(kind, source.data()) || processed.has(`${kind}/${source.id}`)) continue;
      processed.add(`${kind}/${source.id}`);
      console.log(JSON.stringify({ action: apply ? 'archive_approved_source' : 'would_archive_approved_source', collection, id: source.id, kind }));
      if (apply) {
        try { const id = await queueArchive(db, kind, source.id, 'EDMS migration', collection); await processArchive(db, bucket, id); }
        catch (error) { console.error(JSON.stringify({ action: 'review_source_error', collection, id: source.id, error: error.message })); process.exitCode = 1; }
      }
    }
  }
  console.log(apply ? 'Migration finished. Review failures and duplicate inventory before release.' : 'Dry-run finished. No records or files were modified.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
