import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Eye, Download, Plus, FolderOpen, Loader2, RefreshCw, Tag } from 'lucide-react';
import { useEdmsDocuments } from '../hooks/useDocumentStream';
import { useDocumentCategories } from '../hooks/useDocumentCategories';
import { documentKind, storageKey, storageTabs, reportStorageTabs, WORKFLOW_KINDS } from '../utils/document-storage';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { AddDocumentCategoryModal } from './AddDocumentCategoryModal';
import { TablePagination } from '../../../components/common/TablePagination';
import { edmsRequest, downloadDocument } from '../services/edms-api.service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { DOCUMENT_ACCEPTED_TYPES, DOCUMENT_MAX_BYTES } from '../types/document.types';
import type { DocumentDocument } from '../types/document.types';

function StoreInternalDocumentModal({ onClose, categories }: { onClose: () => void; categories: any[] }) {
  const [title, setTitle] = useState(''); const [categoryId, setCategoryId] = useState(''); const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Store Document</DialogTitle><DialogDescription>This document will be stored in the selected custom category and will be visible to SAS only.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!file || saving) return; setSaving(true); setError(''); try {
      const upload = await uploadToCloudinary(file, { folder: 'documents/internal', acceptedTypes: DOCUMENT_ACCEPTED_TYPES, maxBytes: DOCUMENT_MAX_BYTES });
      await edmsRequest('create', {
        document: {
          type: 'submission',
          storeInternal: true,
          title: title.trim(),
          categoryId: categoryId || '',
          fileUrl: upload.secureUrl,
          fileName: file.name,
          submittedByOrgId: 'sas',
          submittedByOrgName: 'Student Affairs Services',
          submittedByOrgAcronym: 'SAS',
          status: 'Approved',
        },
      });
      onClose();
    } catch (error: any) { setError(error.message); } finally { setSaving(false); } }}>
      <label className="block text-sm">Title<input autoFocus required maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
      <label className="block text-sm">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Uncategorized</option>{categories.filter((item) => item.active && !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="block text-sm">File<input type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full" /></label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2">Cancel</button><button disabled={saving || !title.trim() || !file} className="rounded-lg bg-[#001A4D] px-4 py-2 text-white disabled:opacity-50">{saving ? 'Storing…' : 'Store Document'}</button></div>
    </form></DialogContent></Dialog>;
}

export function EdmsStorage({ orgId }: { orgId?: string }) { return <StoredDocumentBrowser orgId={orgId} />; }

export function StoredDocumentBrowser({ orgId, location = 'documents', reportKind }: { orgId?: string; location?: 'documents' | 'report_archives'; reportKind?: string }) {
  const reports = location === 'report_archives';
  const tabParam = reports ? 'reportStorage' : 'storage';
  const recordParam = reports ? 'reportId' : 'documentId';
  const isAdmin = orgId === undefined;
  const { data, loading, error } = useEdmsDocuments(orgId, location);
  const { data: categories } = useDocumentCategories();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get(recordParam);
  const [search, setSearch] = useState(''); const [period, setPeriod] = useState(''); const [organization, setOrganization] = useState(''); const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false); const [storing, setStoring] = useState(false); const [busy, setBusy] = useState(''); const [actionError, setActionError] = useState('');
  const [assigning, setAssigning] = useState<DocumentDocument | null>(null); const [assignment, setAssignment] = useState('');
  const tabs = useMemo(() => reports ? reportStorageTabs(data) : storageTabs(categories, data), [reports, categories, data]);
  const tab = reportKind || params.get(tabParam) || tabs[0]?.key || 'uncategorized';
  const selected = data.find((item) => item.id === selectedId);
  const periods = [...new Set(data.map((item) => [item.academicYear, item.trimester || item.semester].filter(Boolean).join(' · ')).filter(Boolean))].sort().reverse();
  const orgs = [...new Map(data.map((item) => [item.submittedByOrgId, item.submittedByOrgName])).entries()];
  const documents = useMemo(() => data.filter((item) => item.status === 'Approved' && storageKey(item) === tab && (!period || [item.academicYear, item.trimester || item.semester].filter(Boolean).join(' · ') === period) && (!organization || item.submittedByOrgId === organization) && (!search.trim() || `${item.title} ${item.referenceNumber} ${item.submittedByOrgName}`.toLowerCase().includes(search.trim().toLowerCase()))), [data, tab, period, organization, search]);
  useEffect(() => { setPage(1); setActionError(''); }, [tab, period, organization, search, orgId]);
  const pageCount = Math.max(1, Math.ceil(documents.length / 8));
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  const changeTab = (key: string) => setParams((previous) => { previous.set(tabParam, key); previous.delete(recordParam); return previous; });
  const closePreview = () => setParams((previous) => { previous.delete(recordParam); return previous; });
  const run = async (id: string, work: () => Promise<void>) => { setBusy(id); setActionError(''); try { await work(); } catch (error: any) { setActionError(error.message); } finally { setBusy(''); } };

  return <section className="space-y-4" aria-label={reports ? 'Approved report storage' : 'EDMS stored documents'}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#001A4D]">{reports ? 'Approved Report Storage' : 'Stored Documents'}</h2><p className="text-sm text-gray-500">{reports ? 'Preserved approved AP, PAR, and FL files in Reports & Analytics.' : isAdmin ? 'Custom document storage and approved organizational submissions.' : 'Only documents belonging to your selected organization are stored here.'}</p></div>{isAdmin && !reports && <div className="flex gap-2"><button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Plus size={16} />Add Category</button><button onClick={() => setStoring(true)} className="rounded-lg bg-[#001A4D] px-3 py-2 text-sm text-white">Store Document</button></div>}</div>
    {!reportKind && <div className="flex flex-wrap gap-2" role="tablist" aria-label={reports ? "Report storage tabs" : "Document storage tabs"}>{tabs.map((item: any) => <button role="tab" aria-selected={tab === item.key} key={item.key} onClick={() => changeTab(item.key)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tab === item.key ? 'bg-[#001A4D] text-white' : 'bg-white text-gray-700'}`}>{WORKFLOW_KINDS.includes(item.key) ? <FolderOpen size={16} /> : <Tag size={15} />}{item.label}<span className="rounded bg-black/10 px-1.5 text-xs">{item.count}</span></button>)}</div>}
    {!tabs.some((item: any) => item.key === tab) && <p className="text-sm text-amber-700">This category is unavailable. Select another storage tab.</p>}
    <div className="flex flex-wrap gap-3"><input aria-label="Search stored documents" placeholder="Search title, reference or organization…" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-48 flex-1 rounded-lg border px-3 py-2 text-sm" /><select aria-label="Academic period" value={period} onChange={(event) => setPeriod(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All Academic Periods</option>{periods.map((value) => <option key={value}>{value}</option>)}</select>{isAdmin && <select aria-label="Organization" value={organization} onChange={(event) => setOrganization(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All Organizations</option>{orgs.map(([id, name]) => <option key={id} value={id}>{name || id}</option>)}</select>}</div>
    {((error && error.message !== 'internal') || actionError) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError || (error?.message !== 'internal' ? error?.message : '')}</p>}
    {loading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin" aria-label="Loading documents" /></div> : !documents.length ? <div className="rounded-xl border border-dashed p-12 text-center text-gray-500">No approved documents in this storage tab.</div> : <div className="overflow-hidden rounded-xl border bg-white"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{['Reference', 'Document', 'Organization', 'Academic Period', 'Storage', 'Actions'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{documents.slice((page - 1) * 8, page * 8).map((item) => <tr key={item.id} className="border-t hover:bg-blue-50/30"><td className="px-4 py-3 text-xs">{item.referenceNumber}</td><td className="px-4 py-3"><button className="text-left font-semibold text-[#001A4D] hover:underline" onClick={() => setParams((previous) => { previous.set(recordParam, item.id); if (reports) previous.set(tabParam, documentKind(item)); return previous; })}>{item.title}</button><p className="text-xs text-gray-500">{item.fileName || (item.archiveStatus === 'processing' ? 'Preparing approved document…' : 'No attachment')}{documentKind(item) === 'general' ? ` · ${categories.find((category) => category.id === item.categoryId)?.name || item.category || 'Uncategorized'}` : ''}</p></td><td className="px-4 py-3">{item.submittedByOrgName}</td><td className="px-4 py-3 text-xs">{[item.academicYear, item.trimester || item.semester].filter(Boolean).join(' · ') || 'Not specified'}</td><td className="px-4 py-3"><span className={item.archiveStatus === 'failed' ? 'text-red-600' : item.archiveStatus === 'processing' ? 'text-amber-700' : 'text-green-700'}>{item.archiveStatus === 'failed' ? 'Storage failed' : item.archiveStatus === 'processing' ? 'Storing…' : 'Stored'}</span></td><td className="px-4 py-3"><div className="flex items-center gap-2"><button title="View document" aria-label={`View ${item.title}`} onClick={() => setParams((previous) => { previous.set(recordParam, item.id); if (reports) previous.set(tabParam, documentKind(item)); return previous; })} className="rounded p-2 hover:bg-blue-100"><Eye size={17} /></button>{(item.fileUrl || item.fileStoragePath) && item.archiveStatus !== 'failed' && item.archiveStatus !== 'processing' && <button title="Download document" aria-label={`Download ${item.title}`} disabled={busy === item.id} onClick={() => run(item.id, () => downloadDocument(item))} className="rounded p-2 hover:bg-blue-100 disabled:opacity-50"><Download size={17} /></button>}{isAdmin && item.archiveStatus === 'failed' && <button aria-label={`Retry storage for ${item.title}`} title="Retry storage" disabled={!!busy} onClick={() => run(item.id, async () => { await edmsRequest('retry', { id: item.id, location }); })} className="rounded p-2 hover:bg-blue-100"><RefreshCw size={17} /></button>}{isAdmin && documentKind(item) === 'general' && <button title="Change category" aria-label={`Change category for ${item.title}`} onClick={() => { setAssigning(item); setAssignment(item.categoryId || ''); setActionError(''); }} className="rounded p-2 hover:bg-blue-100"><Tag size={17} /></button>}</div></td></tr>)}</tbody></table></div><TablePagination currentPage={page} totalPages={pageCount} totalItems={documents.length} itemsPerPage={8} onPageChange={setPage} itemName="stored documents" /></div>}
    {selected && <DocumentPreviewModal key={selected.id} doc={selected} isAdmin={isAdmin} currentOrgId={orgId} onClose={closePreview} />}
    {selectedId && !selected && !loading && <p role="alert" className="text-sm text-amber-700">This document is unavailable or does not belong to this organization. <button onClick={closePreview} className="underline">Dismiss</button></p>}
    {adding && <AddDocumentCategoryModal onClose={() => setAdding(false)} onCreated={(id) => changeTab(`category:${id}`)} />}
    {storing && <StoreInternalDocumentModal onClose={() => setStoring(false)} categories={categories} />}
    {assigning && <Dialog open onOpenChange={(open) => { if (!open && !busy) setAssigning(null); }}><DialogContent><DialogHeader><DialogTitle>Change Document Category</DialogTitle><DialogDescription>{assigning.title}. This changes only its custom storage tab.</DialogDescription></DialogHeader><select aria-label="Document category" value={assignment} onChange={(event) => setAssignment(event.target.value)} className="rounded-lg border p-2"><option value="">Uncategorized</option>{categories.filter((item) => item.active && !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{actionError && <p role="alert" className="text-red-600">{actionError}</p>}<button disabled={!!busy} onClick={() => run(assigning.id, async () => { await edmsRequest('reclassify', { id: assigning.id, categoryId: assignment, location }); setAssigning(null); })} className="rounded-lg bg-[#001A4D] p-2 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save Category'}</button></DialogContent></Dialog>}
  </section>;
}
