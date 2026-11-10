import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readServiceAccount } from './firebase-service-account.mjs';
export { readServiceAccount } from './firebase-service-account.mjs';

const require = createRequire(new URL('../functions/package.json', import.meta.url));

/** Server-only Firebase credentials. Never import this module from src/. */
export function createAdminContext({ projectId = 'sti-sync', projectDir = process.cwd(), env = process.env } = {}) {
  const { initializeApp, cert, refreshToken, applicationDefault } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const { getFirestore } = require('firebase-admin/firestore');
  const emulator = Boolean(env.FIREBASE_AUTH_EMULATOR_HOST && env.FIRESTORE_EMULATOR_HOST);
  if (Boolean(env.FIREBASE_AUTH_EMULATOR_HOST) !== Boolean(env.FIRESTORE_EMULATOR_HOST)) throw new Error('Configure both Auth and Firestore emulators together.');
  if (emulator && !projectId.startsWith('demo-')) throw new Error('Local emulator tests must use a demo- project.');
  let credential;
  let dbOptions;
  let mode;
  const keyFile = env.FIREBASE_ADMIN_CREDENTIALS || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (emulator) {
    mode = 'emulator';
  } else if (env.FIREBASE_ADMIN_SERVICE_ACCOUNT) {
    credential = cert(readServiceAccount(env.FIREBASE_ADMIN_SERVICE_ACCOUNT, projectId));
    mode = 'service-account-env';
  } else if (env.VERCEL === '1') {
    throw Object.assign(new Error('Set the server-only FIREBASE_ADMIN_SERVICE_ACCOUNT variable in Vercel and redeploy.'), { code: 'unavailable' });
  } else if (keyFile) {
    const key = JSON.parse(readFileSync(path.resolve(projectDir, keyFile), 'utf8'));
    if (key.project_id && key.project_id !== projectId) throw new Error('The administrator credential belongs to another Firebase project.');
    credential = key.type === 'authorized_user' ? refreshToken(key) : cert(key);
    if (key.type === 'authorized_user') dbOptions = { projectId, credentials: key, preferRest: true };
    mode = 'credential-file';
  } else {
    const candidates = [
      env.FIREBASE_CLI_PACKAGE,
      env.APPDATA && path.join(env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'package.json'),
      '/usr/local/lib/node_modules/firebase-tools/package.json',
      '/usr/lib/node_modules/firebase-tools/package.json',
    ].filter(Boolean);
    try { candidates.unshift(require.resolve('firebase-tools/package.json')); } catch { /* Global CLI is also supported. */ }
    const cliPackage = candidates.find((candidate) => existsSync(candidate));
    if (cliPackage) {
      const cli = createRequire(path.resolve(cliPackage));
      const cliAuth = cli('./lib/auth.js');
      const account = cliAuth.getProjectDefaultAccount(projectDir);
      if (account?.tokens?.refresh_token) {
        const api = cli('./lib/api.js');
        // Use the existing local CLI login in memory. Nothing is copied into
        // .env, browser code, HTTP responses, or a credential file.
        const userCredential = { type: 'authorized_user', client_id: api.clientId(), client_secret: api.clientSecret(), refresh_token: account.tokens.refresh_token };
        credential = refreshToken(userCredential);
        dbOptions = { projectId, credentials: userCredential, preferRest: true };
        mode = 'firebase-cli';
      }
    }
    if (!credential) { credential = applicationDefault(); mode = 'application-default'; }
  }
  const app = initializeApp({ projectId, ...(credential ? { credential } : {}) }, `local-accounts-${Date.now()}-${Math.random()}`);
  const db = dbOptions ? new (require('@google-cloud/firestore').Firestore)(dbOptions) : getFirestore(app);
  const auth = getAuth(app);
  return { app, db, auth, mode, projectId, async close() { await db.terminate(); await require('firebase-admin/app').deleteApp(app); } };
}
