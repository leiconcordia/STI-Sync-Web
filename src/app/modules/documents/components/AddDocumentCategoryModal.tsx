import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../../components/ui/dialog';
import { createDocumentCategory } from '../services/document_category.service';
import { CATEGORY_COLORS } from '../utils/document-storage';

export function AddDocumentCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [colorIndex, setColorIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || !name.trim()) return;
    setSaving(true); setError('');
    try {
      const id = await createDocumentCategory({ name, ...CATEGORY_COLORS[colorIndex], active: true, archived: false, sortOrder: Date.now(), officerCanSubmit: true, requiresRemarks: true });
      onCreated(id, name.trim()); onClose();
    } catch (error: any) { setError(error.message); } finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>Add Document Category</DialogTitle><DialogDescription>Create a custom storage tab for general documents and organizational submissions.</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      <label className="block text-sm font-medium">Category Name<input autoFocus maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border p-2" placeholder="e.g. Waivers or Memoranda" disabled={saving} /></label>
      <fieldset><legend className="mb-2 text-sm font-medium">Color</legend><div className="flex gap-3">{CATEGORY_COLORS.map((color: any, index: number) => <button key={color.color} type="button" aria-label={`Color ${index + 1}`} aria-pressed={colorIndex === index} onClick={() => setColorIndex(index)} className={`h-7 w-7 rounded-full ${color.colorDot} ${index === colorIndex ? 'ring-2 ring-offset-2 ring-blue-700' : ''}`} />)}</div></fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <DialogFooter><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2">Cancel</button><button disabled={saving || !name.trim()} className="rounded-lg bg-[#001A4D] px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Category'}</button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
