'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall } = require('firebase-functions/v2/https');
const { createResetHandler } = require('./reset-handler');
initializeApp();
exports.resetAccountPassword = onCall({ timeoutSeconds: 60 }, async (request) => {
  // Credential changes stay on the server. The app's existing EmailJS service
  // sends the confirmed credential after this operation returns successfully.
  return createResetHandler({ db: getFirestore(), auth: getAuth() })(request);
});
