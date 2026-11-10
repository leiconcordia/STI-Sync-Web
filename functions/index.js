'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getStorage } = require('firebase-admin/storage');
const { handleEdms, queueArchive, processArchive } = require('./edms');
const { createResetHandler } = require('./reset-handler');
initializeApp();
exports.resetAccountPassword = onCall({ timeoutSeconds: 60 }, async (request) => {
  // Credential changes stay on the server. The app's existing EmailJS service
  // sends the confirmed credential after this operation returns successfully.
  return createResetHandler({ db: getFirestore(), auth: getAuth() })(request);
});

const bucket = () => getStorage().bucket(process.env.EDMS_STORAGE_BUCKET || 'sti-sync.firebasestorage.app');
exports.edms = onCall({ timeoutSeconds: 180, memory: '512MiB' }, (request) => handleEdms({ db: getFirestore(), bucket: bucket() }, request));
for (const [collection, kind] of Object.entries({ activities: 'activity_proposal', events: 'activity_proposal', activity_proposals: 'activity_proposal', liquidations: 'financial_liquidation', post_activity_reports: 'post_activity_report' })) {
  exports[`reports_${collection}`] = onDocumentWritten({ document: `${collection}/{id}`, retry: true, timeoutSeconds: 180, memory: '512MiB' }, async (event) => {
    const { sourceIsApproved, sourceVersion } = await import('./edms-domain.mjs');
    const after = event.data?.after.data(), before = event.data?.before.data();
    if (!sourceIsApproved(kind, after) || (sourceIsApproved(kind, before) && sourceVersion(before) === sourceVersion(after))) return;
    await queueArchive(getFirestore(), kind, event.params.id, 'System', collection);
  });
}
exports.reports_archiveJob = onDocumentCreated({ document: '_report_archive_jobs/{id}', retry: true, timeoutSeconds: 180, memory: '512MiB' }, (event) => processArchive(getFirestore(), bucket(), event.params.id));
exports.reports_recoverArchives = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 300, memory: '512MiB' }, async () => {
  const jobs = await getFirestore().collection('_report_archive_jobs').where('status', 'in', ['queued', 'failed', 'processing']).where('attempts', '<', 5).limit(10).get();
  for (let index = 0; index < jobs.docs.length; index += 3) await Promise.all(jobs.docs.slice(index, index + 3).map((job) => processArchive(getFirestore(), bucket(), job.id)));
});
