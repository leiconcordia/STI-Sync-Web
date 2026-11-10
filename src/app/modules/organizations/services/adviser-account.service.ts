import { auth } from '../../../../services/firebase';

export interface AdviserAccountLookup {
  exists: boolean;
  eligible?: boolean;
  uid?: string;
  email?: string;
  displayName?: string;
  reason?: string;
}
export async function checkAdviserAccount(email: string): Promise<AdviserAccountLookup> {
  if (!auth.currentUser) throw new Error('Sign in as an SAS administrator before checking adviser accounts.');
  const token = await auth.currentUser.getIdToken();
  let response: Response;
  try {
    response = await fetch('/api/accounts/check-adviser', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  } catch { throw new Error('The account check could not be reached. Try again before continuing.'); }
  let data: any;
  try { data = await response.json(); }
  catch { throw new Error('The adviser account check is unavailable. Restart the local app or deploy the updated account endpoint before continuing.'); }
  if (!response.ok) throw new Error(data.error?.message || 'Unable to check this account.');
  if (typeof data.result?.exists !== 'boolean') throw new Error('The account check returned an invalid response. Please try again.');
  return data.result;
}
