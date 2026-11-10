import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import type { DocumentDocument } from '../types/document.types';

export function DocumentReviewActionModal({ doc, action, onClose, onConfirm }: { doc: DocumentDocument; action: 'Approve' | 'Return' | 'Reject'; onClose: () => void; onConfirm: (remarks: string) => Promise<void> | void }) {
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const required = action !== 'Approve';
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>{action === 'Return' ? 'Return for Revision' : `${action} Document`}</DialogTitle><DialogDescription>{doc.title} · {doc.referenceNumber} · {doc.submittedByOrgName}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); if (saving || (required && !remarks.trim())) return;
      setSaving(true); setError('');
      try { await onConfirm(remarks.trim()); onClose(); } catch (error: any) { setError(error.message); } finally { setSaving(false); }
    }}>
      <label className="block text-sm font-medium">Remarks {required ? '(Required)' : '(Optional)'}<textarea autoFocus rows={4} value={remarks} onChange={(event) => setRemarks(event.target.value)} required={required} disabled={saving} className="mt-2 w-full rounded-lg border p-3" /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <DialogFooter><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2">Cancel</button><button disabled={saving || (required && !remarks.trim())} className="rounded-lg bg-[#001A4D] px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving…' : action === 'Return' ? 'Return for Revision' : action}</button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
