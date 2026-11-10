export function readServiceAccount(value, projectId) {
  if (!value) throw Object.assign(new Error('Set the server-only FIREBASE_ADMIN_SERVICE_ACCOUNT variable in Vercel and redeploy.'), { code: 'unavailable' });
  let key;
  try { key = JSON.parse(value); }
  catch { throw Object.assign(new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT must contain the complete Firebase service-account JSON.'), { code: 'unavailable' }); }
  if (key?.type !== 'service_account' || key.project_id !== projectId || !key.client_email || !key.private_key) {
    throw Object.assign(new Error('Configure a valid Firebase service account for this project in FIREBASE_ADMIN_SERVICE_ACCOUNT.'), { code: 'unavailable' });
  }
  return key;
}
