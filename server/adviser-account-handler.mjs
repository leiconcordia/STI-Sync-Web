const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const normalize = (value) => String(value || '').trim().toLowerCase();

/** Read-only account lookup. Never exposes passwords or changes an existing account. */
export function createAdviserAccountHandler({ db, auth }) {
  return async (request) => {
    if (!request.auth) fail('unauthenticated', 'Sign in as an SAS administrator.');
    const actor = await db.collection('sas_admins').doc(request.auth.uid).get();
    if (!actor.exists || actor.data().isActive !== true) fail('permission-denied', 'An active SAS administrator is required.');
    const email = normalize(request.data?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail('invalid-argument', 'Enter a valid adviser email.');
    let user;
    try { user = await auth.getUserByEmail(email); }
    catch (error) { if (error.code === 'auth/user-not-found') return { exists: false }; throw error; }
    const [byEmail, byUid] = await Promise.all([
      db.collection('students').where('email', '==', email).get(),
      db.collection('students').where('authUid', '==', user.uid).get(),
    ]);
    if (!byEmail.empty || !byUid.empty) return { exists: true, eligible: false, uid: user.uid, email, reason: 'This account belongs to a student. Select a faculty account for the club adviser.' };
    if (user.disabled) return { exists: true, eligible: false, uid: user.uid, email, reason: 'This account is disabled. SAS must reactivate it before assigning an adviser role.' };
    return { exists: true, eligible: true, uid: user.uid, email, displayName: user.displayName || '' };
  };
}
