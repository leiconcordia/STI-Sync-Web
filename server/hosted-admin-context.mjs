import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readServiceAccount } from './firebase-service-account.mjs';

/** Explicit imports let Vercel trace every server SDK dependency. */
export function createHostedAdminContext() {
  const key = readServiceAccount(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT, 'sti-sync');
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    throw Object.assign(new Error('Remove Firebase emulator variables from the hosted Vercel environment and redeploy.'), { code: 'unavailable' });
  }
  const app = getApps().find((existing) => existing.name === 'sti-vercel-accounts') || initializeApp({ projectId: 'sti-sync', credential: cert(key) }, 'sti-vercel-accounts');
  return { auth: getAuth(app), db: getFirestore(app) };
}
