'use strict';
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { randomBytes, randomUUID } = require('node:crypto');
const collections = { advisers: 'organization_advisers', students: 'students', signatories: 'institutional_signatories' };
const normalize = (v) => String(v || '').trim().toLowerCase();

function createResetHandler({ db, auth, sendMail }) {
  return async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in as an SAS administrator.');
    const actor = await db.collection('sas_admins').doc(request.auth.uid).get();
    if (!actor.exists || actor.data().isActive !== true) throw new HttpsError('permission-denied', 'An active SAS administrator is required.');
    const { kind, id, reason, temporaryPassword } = request.data || {};
    if (!Object.hasOwn(collections, kind) || typeof id !== 'string' || !id || id.includes('/') || typeof reason !== 'string' || reason.trim().length < 5 || reason.length > 300) throw new HttpsError('invalid-argument', 'Select an account and provide a reason of 5–300 characters.');
    if (temporaryPassword !== undefined && (typeof temporaryPassword !== 'string' || temporaryPassword.length < 16 || temporaryPassword.length > 128 || !/[A-Z]/.test(temporaryPassword) || !/[a-z]/.test(temporaryPassword) || !/[0-9]/.test(temporaryPassword) || !/[^A-Za-z0-9]/.test(temporaryPassword))) {
      throw new HttpsError('invalid-argument', 'Generate a valid temporary password before confirming the reset.');
    }
    const target = await db.collection(collections[kind]).doc(id).get();
    if (!target.exists) throw new HttpsError('not-found', 'Account not found.');
    const data = target.data();
    if (data.isActive === false || (data.status && String(data.status).toUpperCase() !== 'ACTIVE')) throw new HttpsError('failed-precondition', 'Only active accounts can be reset.');
    const email = normalize(data.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@student.sti.edu')) throw new HttpsError('failed-precondition', 'A saved personal email is required.');
    let account;
    try { account = await auth.getUserByEmail(email); }
    catch { throw new HttpsError('failed-precondition', 'No Firebase account matches this email. Complete initial setup or contact SAS.'); }
    if (account.disabled) throw new HttpsError('failed-precondition', 'This Firebase account is disabled.');
    if (data.authUid && data.authUid !== account.uid) throw new HttpsError('failed-precondition', 'The profile and Firebase account UID do not match. Contact SAS.');
    const admins = await db.collection('sas_admins').get();
    if (admins.docs.some((doc) => doc.id === account.uid || doc.data().uid === account.uid || normalize(doc.data().email) === email)) throw new HttpsError('permission-denied', 'SAS administrator accounts cannot be reset here.');
    const operationId = randomUUID();
    const lock = db.collection('_account_reset_locks').doc(account.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lock);
      if (snap.data()?.expiresAt?.toMillis() > Date.now()) throw new HttpsError('resource-exhausted', 'A reset is already in progress. Please wait.');
      tx.set(lock, { operationId, expiresAt: Timestamp.fromMillis(Date.now() + 120000) });
    });
    let changed = false;
    let synchronized = false;
    try {
      const refs = new Map([[target.ref.path, target.ref]]);
      for (const name of [...Object.values(collections), 'organization_officers']) {
        for (const field of ['email', 'authUid']) {
          const matching = await db.collection(name).where(field, '==', field === 'email' ? email : account.uid).get();
          matching.docs.forEach((doc) => refs.set(doc.ref.path, doc.ref));
        }
      }
      if (kind === 'students' && data.studentId) {
        const officers = await db.collection('organization_officers').where('studentId', '==', data.studentId).get();
        officers.docs.forEach((doc) => refs.set(doc.ref.path, doc.ref));
      }
      const orgs = await db.collection('organizations').where('adviser.email', '==', email).get();
      if (refs.size + orgs.size > 450) throw new HttpsError('failed-precondition', 'Too many duplicate profiles. Contact SAS to repair the account.');
      const pending = db.batch();
      refs.forEach((ref) => pending.update(ref, { requiresPasswordChange: true, resetInProgress: true }));
      await pending.commit();
      const password = temporaryPassword || `Sti-7${randomBytes(18).toString('base64url')}!`;
      await auth.updateUser(account.uid, { password });
      changed = true;
      const batch = db.batch();
      const cleanup = { temporaryPassword: FieldValue.delete(), customPassword: FieldValue.delete(), passwordHash: FieldValue.delete(), defaultPassword: FieldValue.delete(), requiresChangePassword: FieldValue.delete() };
      refs.forEach((ref) => batch.update(ref, { ...cleanup, ...(ref.parent.id === 'organization_officers' ? { authUid: account.uid, email } : {}), tempPass: password, requiresPasswordChange: true, resetInProgress: false, updatedAt: FieldValue.serverTimestamp() }));
      orgs.docs.forEach((doc) => batch.update(doc.ref, { 'adviser.tempPass': password, 'adviser.requiresPasswordChange': true, 'adviser.temporaryPassword': FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }));
      await batch.commit();
      synchronized = true;
      await auth.revokeRefreshTokens(account.uid);
      let messageId;
      let delivery = sendMail ? 'accepted' : 'pending';
      try { if (sendMail) messageId = await sendMail({ email, password, operationId }); }
      catch { delivery = 'failed'; }
      try {
        await db.collection('audit_logs').doc(operationId).set({ id: operationId, action: 'Password reset', actionType: 'Account Actions', details: reason.trim(), performedBy: request.auth.uid, targetId: account.uid, metadata: { kind, delivery, messageId: messageId || null }, timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
      } catch { console.error('Reset audit write failed', { operationId }); }
      return { operationId, delivery, recipientEmail: email, temporaryPassword: password, ...(delivery === 'failed' ? { deliveryError: 'The account password was reset, but email was not accepted. Copy the active temporary password shown here. Ask the system administrator to check the email sender configuration before trying email again.' } : {}) };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', changed ? (synchronized ? 'Password reset succeeded, but completion failed. Run a new reset to resend credentials.' : 'The Firebase password changed but profile synchronization failed. Run another reset to repair this account.') : 'The password was not changed. Please try the reset again.');
    } finally {
      try {
        await db.runTransaction(async (tx) => { const snap = await tx.get(lock); if (snap.data()?.operationId === operationId) tx.delete(lock); });
      } catch { console.error('Reset lock cleanup failed', { operationId }); }
    }
  };
}
module.exports = { createResetHandler };
