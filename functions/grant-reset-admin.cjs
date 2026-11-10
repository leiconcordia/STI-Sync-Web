// Run only with authorized Firebase Admin credentials after confirming the UID.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

async function main() {
  const uid = process.argv[2];
  if (!uid || uid.includes('/')) throw new Error('Pass the Firebase UID of an existing active SAS administrator.');
  initializeApp({ credential: applicationDefault() });
  const admin = await getFirestore().collection('sas_admins').doc(uid).get();
  if (!admin.exists || admin.data().isActive !== true) throw new Error('No active SAS administrator profile exists for this UID.');
  const user = await getAuth().getUser(uid);
  await getAuth().setCustomUserClaims(uid, { ...(user.customClaims || {}), sasAdmin: true });
  console.log('SAS reset permission granted. The user must sign in again to refresh their token.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
