import { auth } from '../../../../services/firebase';
import type { AccountKind } from './account-directory.service';
import { sendAccountPasswordResetCredentialsEmail } from '../../../../services/email.service';
import { deliverResetEmail } from './reset-email.mjs';

export interface ResetResult {
  operationId: string;
  delivery: 'accepted' | 'failed';
  temporaryPassword: string;
  recipientEmail?: string;
  deliveryError?: string;
}

export async function resetAccountPassword(kind: AccountKind, id: string, reason: string, temporaryPassword?: string): Promise<ResetResult> {
  if (!auth.currentUser) throw new Error('Sign in as an SAS administrator before resetting a password.');
  try {
    const token = await auth.currentUser.getIdToken();
    let response: Response;
    try {
      response = await fetch('/api/accounts/reset-password', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, reason, ...(temporaryPassword ? { temporaryPassword } : {}) }),
      });
    } catch { throw new Error('The reset service could not be reached. Check your connection and try again.'); }
    let payload: any;
    try { payload = await response.json(); }
    catch { throw new Error('The reset API is missing at this address. Deploy the Vercel account function, or run the app through npm run dev locally.'); }
    if (!response.ok) throw new Error(payload?.error?.message || 'The reset request failed. No temporary password has been confirmed.');
    const result = payload.result;
    if (!result?.temporaryPassword || !['accepted', 'failed', 'pending'].includes(result.delivery)) {
      throw new Error('The reset service returned an incompatible response. The account may have changed, but its temporary password was not confirmed.');
    }
    return await deliverResetEmail(result, kind, sendAccountPasswordResetCredentialsEmail);
  }
  catch (error: any) {
    throw error;
  }
}
