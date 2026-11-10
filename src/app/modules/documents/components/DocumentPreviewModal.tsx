import { lazy, Suspense, useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import type { DocumentDocument } from '../types/document.types';
import { documentKind, ownsDocument, WORKFLOW_LABELS } from '../utils/document-storage';
import { documentFileUrl, downloadDocument } from '../services/edms-api.service';
import { DocumentReviewActionModal } from './DocumentReviewActionModal';
const PdfDocumentPreview = lazy(() => import('./PdfDocumentPreview'));

interface DocumentPreviewModalProps {
  doc: DocumentDocument;
  onClose: () => void;
  onApprove?: (remarks: string) => Promise<void> | void;
  onReturn?: (remarks: string) => Promise<void> | void;
  onReject?: (remarks: string) => Promise<void> | void;
  isAdmin?: boolean;
  currentOrgId?: string | null;
}

export function DocumentPreviewModal({ doc, onClose, onApprove, onReturn, onReject, isAdmin = false, currentOrgId }: DocumentPreviewModalProps) {
  const allowed = isAdmin || (doc.type === 'broadcast'
    ? Boolean(currentOrgId && (doc.distribution === 'all' || doc.targetOrgIds?.includes(currentOrgId)))
    : ownsDocument(doc, currentOrgId));
  const kind = documentKind(doc);
  const hasFile = Boolean(doc.fileUrl || doc.fileStoragePath);
  const ready = doc.archiveStatus !== 'processing' && doc.archiveStatus !== 'failed';
  const canReview = isAdmin && kind === 'general' && doc.type === 'submission' && ['Pending', 'Resubmitted'].includes(doc.status);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'Approve' | 'Return' | 'Reject' | null>(null);
  useEffect(() => {
    let active = true; let objectUrl = ''; const controller = new AbortController();
    setUrl(''); setError('');
    if (!allowed || !hasFile || !ready) return;
    setLoading(true);
    documentFileUrl(doc).then(async (remoteUrl) => {
      if (doc.fileType === 'PDF' && !remoteUrl.startsWith('blob:')) {
        const response = await fetch(remoteUrl, { signal: controller.signal });
        if (!response.ok) throw new Error('The stored file could not be loaded. Try downloading it.');
        objectUrl = URL.createObjectURL(new Blob([await response.blob()], { type: 'application/pdf' }));
      } else if (remoteUrl.startsWith('blob:')) objectUrl = remoteUrl;
      if (active) setUrl(objectUrl || remoteUrl);
      else if (objectUrl) URL.revokeObjectURL(objectUrl);
    }).catch((error) => { if (active && error.name !== 'AbortError') setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc.id, doc.fileUrl, doc.fileStoragePath, doc.archiveStatus, allowed, hasFile, ready]);
  const sourceRoute = isAdmin ? kind === 'financial_liquidation' ? '/home/liquidations' : kind === 'post_activity_report' ? '/home/post-activity-reports' : '/home/event-approvals'
    : kind === 'financial_liquidation' ? '/officer/liquidation' : kind === 'post_activity_report' ? '/officer/post-activity-reports' : '/officer/events';
  const download = async (attachmentIndex?: number) => {
    setBusy(true); setError('');
    try { await downloadDocument(doc, attachmentIndex); } catch (error: any) { setError(error.message); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy && !action) onClose(); }}><DialogContent className="flex max-h-[92vh] w-[95vw] max-w-5xl sm:max-w-5xl flex-col overflow-hidden">
    <DialogHeader><DialogTitle>{allowed ? doc.title : 'Access Restricted'}</DialogTitle><DialogDescription>{allowed ? `${doc.referenceNumber || 'Document'} · ${kind === 'general' ? doc.category || 'Uncategorized' : WORKFLOW_LABELS[kind]} · ${doc.status}` : 'This document is unavailable to the selected organization.'}</DialogDescription></DialogHeader>
    {allowed && <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-sm"><div><p>{doc.type === 'broadcast' ? `Sent by ${doc.broadcastBy || 'SAS'}` : doc.submittedByOrgName}</p><p className="text-xs text-gray-500">{[doc.academicYear, doc.trimester || doc.semester].filter(Boolean).join(' · ')}{hasFile ? ` · ${doc.fileName} · ${(doc.fileSize / 1024).toFixed(1)} KB` : ''}</p></div><div className="flex flex-wrap gap-2">{kind !== 'general' && doc.sourceRecordId && <a href={`${sourceRoute}?id=${encodeURIComponent(doc.sourceRecordId)}`} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2" target="_blank" rel="noreferrer"><ExternalLink size={16} />Open Source</a>}{hasFile && ready && <button disabled={busy} onClick={() => download()} className="inline-flex items-center gap-2 rounded-lg bg-[#001A4D] px-3 py-2 text-white disabled:opacity-50"><Download size={16} />{busy ? 'Downloading…' : 'Download'}</button>}</div></div>
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {doc.description && <p className="whitespace-pre-wrap rounded-lg bg-blue-50 p-4 text-sm text-gray-700">{doc.description}</p>}
        {doc.archiveStatus === 'processing' ? <p className="p-12 text-center text-amber-700">Approved; storing the report in Reports & Analytics…</p> : doc.archiveStatus === 'failed' ? <p className="p-12 text-center text-red-600">Approved; report storage failed. SAS can retry from Reports & Analytics.</p> : !hasFile ? <div className="rounded-lg border border-dashed p-10 text-center text-gray-500"><FileText className="mx-auto mb-2" />No attachment</div> : loading ? <div className="flex justify-center p-16"><Loader2 className="animate-spin" aria-label="Loading file" /></div> : doc.fileType === 'PDF' && url ? <Suspense fallback={<p className="p-8 text-center text-sm">Loading PDF preview…</p>}><PdfDocumentPreview url={url} title={doc.title} /></Suspense> : ['JPG', 'PNG'].includes(doc.fileType) && url ? <img src={url} alt={doc.fileName} className="mx-auto max-h-[55vh] max-w-full object-contain" /> : <p className="rounded-lg bg-gray-50 p-10 text-center text-sm text-gray-500">Download the {doc.fileType} file to view its contents.</p>}
        {doc.remarks && <div className="rounded-lg border p-3 text-sm"><strong>Review remarks</strong><p className="whitespace-pre-wrap">{doc.remarks}</p></div>}
        {(doc as any).approvalHistory?.length > 0 && <div className="rounded-lg border p-3 text-sm"><h3 className="mb-2 font-semibold">Approval History</h3>{(doc as any).approvalHistory.map((step: any, index: number) => <p key={step.id || index}>{step.signatoryName || step.name || step.roleTitle || `Step ${index + 1}`} · {step.status}{step.remarks ? ` · ${step.remarks}` : ''}</p>)}</div>}
        {doc.reviewedBy && <p className="text-xs text-gray-500">Reviewed by {doc.reviewedBy}</p>}
        {!!doc.attachments?.length && <div className="rounded-lg border p-3 text-sm"><h3 className="mb-2 font-semibold">Supporting Attachments</h3>{doc.attachments.map((item, index) => <button key={item.storagePath} disabled={busy} onClick={() => download(index)} className="mb-2 flex items-center gap-2 text-left text-blue-700 hover:underline"><Download size={15} />{item.name}</button>)}</div>}
      </div>
      {canReview && <div className="flex justify-end gap-3 border-t pt-3">{onApprove && <button onClick={() => setAction('Approve')} className="rounded-lg bg-green-700 px-4 py-2 text-white">Approve</button>}{onReturn && <button onClick={() => setAction('Return')} className="rounded-lg bg-amber-600 px-4 py-2 text-white">Return for Revision</button>}{onReject && <button onClick={() => setAction('Reject')} className="rounded-lg bg-red-700 px-4 py-2 text-white">Reject</button>}</div>}
    </>}
    {allowed && action && <DocumentReviewActionModal doc={doc} action={action} onClose={() => setAction(null)} onConfirm={async (remarks) => { const handler = action === 'Approve' ? onApprove : action === 'Return' ? onReturn : onReject; if (handler) await handler(remarks); }} />}
  </DialogContent></Dialog>;
}
