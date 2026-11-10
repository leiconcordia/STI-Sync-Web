export function isAdministratorSignatory(id, data, adminUids, adminEmails) {
  const email = String(data.email || '').trim().toLowerCase();
  return adminUids.has(id) || adminUids.has(data.uid) || adminUids.has(data.authUid) || Boolean(email && adminEmails.has(email));
}
