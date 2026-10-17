import React, { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  RotateCcw,
  Search,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Calendar,
  User,
  Building2,
  FileText,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchTrashDocuments,
  restoreDocument,
  permanentlyPurgeDocument,
  type SoftDeletableCollection,
  type TrashRecordMetadata,
} from '../services/soft-delete.service';

interface TrashRepositoryViewerProps {
  collectionName: SoftDeletableCollection;
  documentTypeLabel?: string; // e.g. "Activity Proposals", "Liquidations", "Post-Activity Reports"
  organizationId?: string;
  isSasAdmin?: boolean;
  currentUser: { uid: string; name: string; role?: string };
  onRestored?: (item: TrashRecordMetadata) => void;
  onPurged?: (item: TrashRecordMetadata) => void;
}

function formatDate(val: any): string {
  if (!val) return '—';
  let d: Date | null = null;
  if (typeof val.toDate === 'function') d = val.toDate();
  else if (typeof val.seconds === 'number') d = new Date(val.seconds * 1000);
  else d = new Date(val);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const TrashRepositoryViewer: React.FC<TrashRepositoryViewerProps> = ({
  collectionName,
  documentTypeLabel = 'Documents',
  organizationId,
  isSasAdmin = false,
  currentUser,
  onRestored,
  onPurged,
}) => {
  const [items, setItems] = useState<TrashRecordMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Action Modals
  const [restoringItem, setRestoringItem] = useState<TrashRecordMetadata | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const [purgingItem, setPurgingItem] = useState<TrashRecordMetadata | null>(null);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  const loadTrash = async () => {
    try {
      setLoading(true);
      const data = await fetchTrashDocuments(collectionName, organizationId, isSasAdmin);
      setItems(data);
    } catch (err: any) {
      console.error('[TrashRepositoryViewer] Load error:', err);
      toast.error('Failed to load discarded records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, [collectionName, organizationId, isSasAdmin]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return items;
    return items.filter((item) => {
      const titleMatch = (item.title || '').toLowerCase().includes(q);
      const refMatch = (item.referenceNo || '').toLowerCase().includes(q);
      const orgMatch = (item.organizationName || '').toLowerCase().includes(q);
      const byMatch = (item.deletedByName || '').toLowerCase().includes(q);
      const reasonMatch = (item.deletedReason || '').toLowerCase().includes(q);
      return titleMatch || refMatch || orgMatch || byMatch || reasonMatch;
    });
  }, [items, searchQuery]);

  const handleExecuteRestore = async () => {
    if (!restoringItem) return;
    setIsRestoring(true);
    try {
      await restoreDocument(collectionName, restoringItem.id, currentUser);
      toast.success(`"${restoringItem.title}" has been restored back to your active drafts.`);
      setRestoringItem(null);
      await loadTrash();
      if (onRestored) onRestored(restoringItem);
    } catch (err: any) {
      console.error('[TrashRepositoryViewer] Restore error:', err);
      toast.error(err?.message || 'Failed to restore document.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleExecutePurge = async () => {
    if (!purgingItem || purgeConfirmText.trim().toUpperCase() !== 'PURGE') return;
    setIsPurging(true);
    try {
      await permanentlyPurgeDocument(collectionName, purgingItem.id, currentUser);
      toast.success(`"${purgingItem.title}" was permanently purged.`);
      setPurgingItem(null);
      setPurgeConfirmText('');
      await loadTrash();
      if (onPurged) onPurged(purgingItem);
    } catch (err: any) {
      console.error('[TrashRepositoryViewer] Purge error:', err);
      toast.error(err?.message || 'Failed to purge document.');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Policy Banner */}
      <div className="bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3.5 flex items-start gap-3">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-800 dark:text-amber-300 shrink-0">
          <Trash2 className="w-4 h-4" />
        </div>
        <div className="text-xs text-amber-900 dark:text-amber-200">
          <p className="font-bold mb-0.5">Safe Trash &amp; Draft Retention Repository</p>
          <p className="text-amber-700 dark:text-amber-300/80 leading-relaxed">
            Discarded drafts remain safely preserved here indefinitely with zero auto-expiration.
            You can restore any item at any time with 1-click back to its original draft queue with 100% data preservation.
          </p>
        </div>
      </div>

      {/* Control Bar: Search & Refresh */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search discarded ${documentTypeLabel.toLowerCase()} by title, reference #, or author...`}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadTrash}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Trash List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Table / List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#0E4EBD] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading discarded {documentTypeLabel.toLowerCase()}...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Trash is Empty</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
              {searchQuery
                ? 'No discarded items matched your search query.'
                : `There are currently no discarded drafts or ${documentTypeLabel.toLowerCase()} in the Trash repository.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Document Details</th>
                  {isSasAdmin && <th className="py-3 px-4">Organization</th>}
                  <th className="py-3 px-4">Discarded On</th>
                  <th className="py-3 px-4">Discarded By</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-900 dark:text-white line-clamp-1">
                          {item.title}
                        </span>
                        <div className="flex items-center gap-2">
                          {item.referenceNo && (
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {item.referenceNo}
                            </span>
                          )}
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase">
                            Discarded Draft
                          </span>
                        </div>
                      </div>
                    </td>

                    {isSasAdmin && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[140px]">{item.organizationName || item.organizationId || 'SAS / Admin'}</span>
                        </div>
                      </td>
                    )}

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(item.deletedAt)}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.deletedByName || 'Author'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {item.deletedByRole || 'User'}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="text-slate-600 dark:text-slate-400 italic line-clamp-1">
                        "{item.deletedReason || 'Draft discarded'}"
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Restore Button */}
                        <button
                          onClick={() => setRestoringItem(item)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors cursor-pointer"
                          title="Restore Draft to Active Workspace"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>

                        {/* SAS Admin Permanent Purge Button */}
                        {isSasAdmin && (
                          <button
                            onClick={() => {
                              setPurgingItem(item);
                              setPurgeConfirmText('');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer"
                            title="Permanently Purge Record (Admin Only)"
                          >
                            <Trash2 className="w-3 h-3" />
                            Purge
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Restore Confirmation Modal ── */}
      {restoringItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Restore Draft Document
                </h3>
                <p className="text-xs text-slate-500">
                  Return this record to your active drafts queue
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-xs flex flex-col gap-1 border border-slate-200 dark:border-slate-700">
              <div className="font-bold text-slate-900 dark:text-white line-clamp-2">
                {restoringItem.title}
              </div>
              {restoringItem.referenceNo && (
                <div className="text-[11px] font-mono text-slate-500">
                  Ref: {restoringItem.referenceNo}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Restoring this document will seamlessly place it back in your <strong>Drafts</strong> list with all line items, sessions, and data intact.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoringItem(null)}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="px-4 py-2 text-xs font-bold bg-[#0E4EBD] hover:bg-[#0A3D96] text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  'Confirm Restore'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAS Admin Permanent Purge Confirmation Modal ── */}
      {purgingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-rose-200 dark:border-rose-900 shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-700 dark:text-rose-400">
                  Permanently Purge Record
                </h3>
                <p className="text-xs text-slate-500">
                  SAS Administrator Database Maintenance
                </p>
              </div>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl p-3 text-xs text-rose-900 dark:text-rose-200">
              <p className="font-bold mb-1">WARNING: IRREVERSIBLE ACTION</p>
              <p className="leading-relaxed">
                This will completely remove <strong>"{purgingItem.title}"</strong> from Firestore permanently. It cannot be recovered once purged.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Type <span className="font-mono text-rose-600 dark:text-rose-400">PURGE</span> to confirm:
              </label>
              <input
                type="text"
                value={purgeConfirmText}
                onChange={(e) => setPurgeConfirmText(e.target.value)}
                placeholder="PURGE"
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPurgingItem(null);
                  setPurgeConfirmText('');
                }}
                disabled={isPurging}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecutePurge}
                disabled={purgeConfirmText.trim().toUpperCase() !== 'PURGE' || isPurging}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPurging ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Purging...
                  </>
                ) : (
                  'Permanently Purge'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrashRepositoryViewer;
