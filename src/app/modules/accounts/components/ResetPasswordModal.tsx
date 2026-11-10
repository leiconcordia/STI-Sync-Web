import { useRef, useState, type FormEvent } from 'react';
import { Copy, RefreshCw, KeyRound, Loader2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { resetAccountPassword, type ResetResult } from '../services/account-reset.service';
import { generateTemporaryPassword } from '../services/temporary-password.mjs';
import type { AccountKind } from '../services/account-directory.service';

export interface ResetTarget { id: string; name: string; email: string; }
interface Props {
  account: ResetTarget;
  kind: AccountKind;
  onClose: () => void;
  onCompleted: (result: ResetResult) => void;
  submitReset?: typeof resetAccountPassword;
}

export function ResetPasswordModal({ account, kind, onClose, onCompleted, submitReset = resetAccountPassword }: Props) {
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [result, setResult] = useState<ResetResult | null>(null);

  async function copyPassword() {
    try { await navigator.clipboard.writeText(password); setCopyMessage('Password copied.'); }
    catch { setCopyMessage('Could not copy automatically. Select the password and copy it manually.'); }
  }

  async function confirmReset(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || result) return;
    if (reason.trim().length < 5 || reason.length > 300) { setError('Enter a reset reason with 5–300 characters.'); return; }
    inFlight.current = true; setBusy(true); setError(''); setCopyMessage('');
    try {
      const outcome = await submitReset(kind, account.id, reason.trim(), password);
      // Only the confirmed server result establishes which credential is active.
      setPassword(outcome.temporaryPassword);
      setResult(outcome);
      onCompleted(outcome);
    } catch (err: any) {
      setError(err?.message || 'Reset could not be confirmed. The preview password is not confirmed active.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
    <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => event.preventDefault()}>
      <div className="space-y-2">
        <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-[#001A4D]"><KeyRound className="h-5 w-5" />{result ? 'Password reset completed' : 'Reset account password'}</Dialog.Title>
        <Dialog.Description className="text-sm text-gray-500">{result ? 'Save the active temporary password before closing this window.' : 'Review the generated password, then confirm the reset.'}</Dialog.Description>
      </div>
      <form onSubmit={confirmReset} className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm"><p className="font-semibold text-[#001A4D]">{account.name}</p><p className="break-all text-gray-600">{result?.recipientEmail || account.email}</p></div>
        <div>
          <label htmlFor="reset-password-preview" className="mb-1 block text-sm font-semibold text-gray-700">{result ? 'Active temporary password' : 'Generated temporary password'}</label>
          <input id="reset-password-preview" type="text" readOnly value={password} autoComplete="off" spellCheck={false} className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-sm text-[#001A4D]" />
          <div className="mt-2 flex gap-3 text-sm">
            <button type="button" onClick={copyPassword} disabled={busy} className="inline-flex items-center gap-1 text-[#0E4EBD] disabled:opacity-40"><Copy className="h-4 w-4" />Copy password</button>
            {!result && <button type="button" onClick={() => { setPassword(generateTemporaryPassword()); setCopyMessage(''); setError(''); }} disabled={busy} className="inline-flex items-center gap-1 text-gray-600 disabled:opacity-40"><RefreshCw className="h-4 w-4" />Generate another</button>}
          </div>
          {copyMessage && <p role="status" className="mt-2 text-xs text-gray-600">{copyMessage}</p>}
        </div>
        {!result && <>
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This is a preview. The password is not confirmed active until the reset succeeds. Confirming replaces the current password and requires a password change after login.</p>
          <label className="block text-sm font-semibold text-gray-700">Reason for reset<textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} maxLength={300} rows={2} required className="mt-1 w-full rounded-lg border border-gray-300 p-2 font-normal" placeholder="For example: The user forgot their password" /></label>
        </>}
        {result && <p role="status" className={`rounded-lg p-3 text-sm ${result.delivery === 'accepted' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{result.delivery === 'accepted' ? 'The account was reset. The email provider accepted the message; inbox delivery is not yet confirmed.' : result.deliveryError || 'The account was reset, but email failed. Copy the active temporary password above.'}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40">{result ? 'Done' : 'Cancel'}</button>
          {!result && <button type="submit" disabled={busy || reason.trim().length < 5} className="inline-flex items-center gap-2 rounded-lg bg-[#001A4D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Resetting…' : 'Confirm reset and email'}</button>}
        </div>
      </form>
    </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
