/**
 * src/app/modules/workflow/components/RevisionDiffViewerModal.tsx
 *
 * Interactive visual diff modal allowing SAS Administrators, Institutional Signatories,
 * and Club Officers to compare revised documents (AP, FL, and PAR) side-by-side.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  GitCompare,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  Filter,
  Eye,
  ChevronDown,
  Layers,
  History,
  RotateCcw,
} from 'lucide-react';
import type { RevisionHistoryEntry, FieldDiffEntry } from '../types/approval.types';
import { diffAnyDocument } from '../utils/document-diff-engine';

interface RevisionDiffViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle?: string;
  documentType?: 'AP' | 'FL' | 'PAR';
  currentDocument: Record<string, any> | null;
  previousSnapshot?: any;
  customDiffs?: FieldDiffEntry[];
  revisionNumber?: number;
  revisionHistory?: RevisionHistoryEntry[];
  versionHistory?: any[];
}

export default function RevisionDiffViewerModal({
  isOpen,
  onClose,
  documentTitle = 'Document',
  documentType = 'AP',
  currentDocument,
  previousSnapshot,
  customDiffs,
  revisionNumber,
  revisionHistory = [],
  versionHistory = [],
}: RevisionDiffViewerModalProps) {
  const [selectedSnapshotIdx, setSelectedSnapshotIdx] = useState<number>(0);
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>('all');
  const [showOnlyChanges, setShowOnlyChanges] = useState<boolean>(true);

  // Normalize historical snapshot list
  const historyEntries: RevisionHistoryEntry[] = useMemo(() => {
    const list: RevisionHistoryEntry[] = [];
    const rawVersions = Array.isArray(versionHistory) ? versionHistory : [];
    const rawRevisions = Array.isArray(revisionHistory) ? revisionHistory : [];

    rawVersions.forEach((v: any, idx: number) => {
      const snap =
        v.dataSnapshot ||
        v.previousSnapshot ||
        (v as any).snapshot ||
        (v as any).returnedSnapshot ||
        previousSnapshot ||
        (currentDocument as any)?.returnedSnapshot ||
        (currentDocument as any)?.previousSnapshot ||
        (currentDocument as any)?.initialSnapshot ||
        null;

      list.push({
        version: v.version || idx + 1,
        versionLabel: v.versionLabel || `v${v.version || idx + 1}.0`,
        submittedAt: v.archivedAt || v.submittedAt || v.savedAt,
        submittedBy: v.resubmittedBy || v.submittedBy || v.savedByName || 'Submitter',
        returnedAt: v.returnedAt,
        returnedBy: v.returnedByName || v.returnedBy || 'Reviewer',
        returnRemarks: v.returnRemarks || v.adviserRemarks || (currentDocument as any)?.adviserRemarks || 'Revision requested.',
        dataSnapshot: snap,
      });
    });

    rawRevisions.forEach((r: any, idx: number) => {
      let snap =
        r.dataSnapshot ||
        r.previousSnapshot ||
        (r as any).snapshot ||
        (r as any).returnedSnapshot ||
        null;

      if (
        (!snap || (!snap.attendanceSummary && !snap.results && !snap.lineItems && !snap.sessions)) &&
        (previousSnapshot || (currentDocument as any)?.previousSnapshot || (currentDocument as any)?.returnedSnapshot)
      ) {
        snap = previousSnapshot || (currentDocument as any)?.previousSnapshot || (currentDocument as any)?.returnedSnapshot;
      }

      if (!snap) {
        snap =
          previousSnapshot ||
          (currentDocument as any)?.returnedSnapshot ||
          (currentDocument as any)?.previousSnapshot ||
          (currentDocument as any)?.initialSnapshot ||
          null;
      }

      const match = list.find((item) => item.version === r.version);
      if (match) {
        if (!match.dataSnapshot && snap) {
          match.dataSnapshot = snap;
        }
        if (r.returnRemarks && !match.returnRemarks) {
          match.returnRemarks = r.returnRemarks;
        }
      } else {
        list.push({
          version: r.version || idx + 1,
          versionLabel: r.versionLabel || `v${r.version || idx + 1}.0`,
          submittedAt: r.submittedAt,
          submittedBy: r.submittedBy || 'Submitter',
          returnedAt: r.returnedAt,
          returnedBy: r.returnedBy || 'Reviewer',
          returnRemarks: r.returnRemarks || (currentDocument as any)?.adviserRemarks || 'Revision requested.',
          dataSnapshot: snap,
        });
      }
    });

    // Fallback if no version list found but a snapshot or baseline is available
    if (list.length === 0) {
      const snap =
        previousSnapshot ||
        (currentDocument as any)?.returnedSnapshot ||
        (currentDocument as any)?.previousSnapshot ||
        (currentDocument as any)?.initialSnapshot ||
        null;

      list.push({
        version: 1,
        versionLabel: 'v1.0 (Initial)',
        submittedAt: (currentDocument as any)?.submissionDate || (currentDocument as any)?.createdAt || new Date().toISOString(),
        submittedBy: (currentDocument as any)?.createdByName || 'Submitter',
        returnRemarks: (currentDocument as any)?.adviserRemarks || 'Initial submission state',
        dataSnapshot: snap,
      });
    }

    return list.sort((a, b) => (b.version || 0) - (a.version || 0));
  }, [revisionHistory, versionHistory, previousSnapshot, currentDocument]);

  const activeEntry = historyEntries[selectedSnapshotIdx] || historyEntries[0];
  const oldSnapshot =
    activeEntry?.dataSnapshot ||
    (activeEntry as any)?.snapshot ||
    (activeEntry as any)?.returnedSnapshot ||
    (activeEntry as any)?.previousSnapshot ||
    previousSnapshot ||
    (currentDocument as any)?.returnedSnapshot ||
    (currentDocument as any)?.previousSnapshot ||
    (currentDocument as any)?.initialSnapshot ||
    (versionHistory && (versionHistory[selectedSnapshotIdx]?.dataSnapshot || versionHistory[selectedSnapshotIdx]?.snapshot || versionHistory[selectedSnapshotIdx]?.returnedSnapshot || versionHistory[selectedSnapshotIdx]?.previousSnapshot)) ||
    (versionHistory && (versionHistory[0]?.dataSnapshot || versionHistory[0]?.snapshot || versionHistory[0]?.returnedSnapshot || versionHistory[0]?.previousSnapshot)) ||
    null;

  // Run diff detection
  const detectedDiffs: FieldDiffEntry[] = useMemo(() => {
    let diffs: FieldDiffEntry[] = [];
    if (currentDocument && oldSnapshot) {
      diffs = diffAnyDocument(oldSnapshot, currentDocument, documentType);
    }
    if (diffs.length === 0 && customDiffs && customDiffs.length > 0) {
      return customDiffs;
    }
    if (diffs.length === 0 && activeEntry?.detectedDiffs && activeEntry.detectedDiffs.length > 0) {
      return activeEntry.detectedDiffs;
    }
    return diffs;
  }, [oldSnapshot, currentDocument, documentType, activeEntry, customDiffs]);

  // Unique sections
  const sections = useMemo(() => {
    const set = new Set<string>();
    detectedDiffs.forEach((d) => set.add(d.section));
    return ['all', ...Array.from(set)];
  }, [detectedDiffs]);

  // Filtered diffs
  const filteredDiffs = useMemo(() => {
    if (activeSectionFilter === 'all') return detectedDiffs;
    return detectedDiffs.filter((d) => d.section === activeSectionFilter);
  }, [detectedDiffs, activeSectionFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-[#001A4D] to-[#0A2E6D] text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#FFD41C]">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-white tracking-tight">
                  Revision Change Comparison
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FFD41C] text-[#001A4D]">
                  {documentType === 'AP' ? 'Activity Proposal' : documentType === 'FL' ? 'Liquidation' : 'Post-Activity Report'}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5 line-clamp-1 max-w-[500px]">
                {documentTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar & Version Selector */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <span>Comparing</span>
            <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
              Current Revised (v{currentDocument?.version || currentDocument?.revisionCount || 2}.0)
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            {historyEntries.length > 0 ? (
              <select
                value={selectedSnapshotIdx}
                onChange={(e) => setSelectedSnapshotIdx(Number(e.target.value))}
                className="text-xs font-bold bg-white border border-gray-300 rounded-md px-2.5 py-1 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]"
              >
                {historyEntries.map((entry, idx) => (
                  <option key={idx} value={idx}>
                    {entry.versionLabel || `v${entry.version || 1}.0`} (Returned by {entry.returnedBy || 'Reviewer'})
                  </option>
                ))}
              </select>
            ) : (
              <span className="px-2 py-1 rounded-md bg-gray-200 text-gray-700 font-bold">
                Initial Version (v1.0)
              </span>
            )}
          </div>

          {/* Section Filter Pills */}
          {sections.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {sections.map((sec) => {
                const count = sec === 'all' ? detectedDiffs.length : detectedDiffs.filter((d) => d.section === sec).length;
                return (
                  <button
                    key={sec}
                    onClick={() => setActiveSectionFilter(sec)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      activeSectionFilter === sec
                        ? 'bg-[#001A4D] text-white shadow-xs'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <span>{sec === 'all' ? 'All Sections' : sec}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        activeSectionFilter === sec ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Reviewer Note Banner */}
          {activeEntry?.returnRemarks && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-amber-900 flex items-start gap-3">
              <RotateCcw className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <span className="font-bold">Requested Changes by {activeEntry.returnedBy || 'Reviewer'}: </span>
                <span className="italic">"{activeEntry.returnRemarks}"</span>
              </div>
            </div>
          )}

          {/* Diff Items Breakdown */}
          {filteredDiffs.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 font-semibold px-1">
                <div className="flex items-center gap-2">
                  <span>DETECTED CHANGES ({filteredDiffs.length})</span>
                  {/* Category Counter Badges */}
                  <div className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase">
                    {filteredDiffs.filter((d) => d.changeType === 'added').length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        +{filteredDiffs.filter((d) => d.changeType === 'added').length} Added
                      </span>
                    )}
                    {filteredDiffs.filter((d) => d.changeType === 'modified').length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        ~{filteredDiffs.filter((d) => d.changeType === 'modified').length} Modified
                      </span>
                    )}
                    {filteredDiffs.filter((d) => d.changeType === 'removed').length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                        -{filteredDiffs.filter((d) => d.changeType === 'removed').length} Removed
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-gray-400">Green = Added/Revised · Red = Struck/Removed</span>
              </div>

              {filteredDiffs.map((diff, index) => {
                const isAdded = diff.changeType === 'added';
                const isRemoved = diff.changeType === 'removed';

                return (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-xl p-4 bg-white hover:border-[#0E4EBD]/40 transition-colors shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                          {diff.section}
                        </span>
                        <h4 className="font-bold text-sm text-gray-900">{diff.label}</h4>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          isAdded
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : isRemoved
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {isAdded ? 'Added' : isRemoved ? 'Removed' : 'Modified'}
                      </span>
                    </div>

                    {/* Change Summary */}
                    {diff.diffSummary && (
                      <p className="text-xs text-gray-600 font-medium">{diff.diffSummary}</p>
                    )}

                    {/* Side-by-Side Values Comparison */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                      {/* Old Value */}
                      <div
                        className={`p-2.5 rounded-lg border text-xs ${
                          isAdded
                            ? 'bg-gray-50 border-gray-200 text-gray-400 italic'
                            : 'bg-rose-50/60 border-rose-200/80 text-rose-900'
                        }`}
                      >
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-700 mb-1">
                          Previous State
                        </span>
                        <span className={`${isAdded ? '' : 'line-through'} font-medium break-words`}>
                          {diff.oldValue !== null && diff.oldValue !== undefined
                            ? String(diff.oldValue)
                            : '(None / Newly Added)'}
                        </span>
                      </div>

                      {/* New Value */}
                      <div
                        className={`p-2.5 rounded-lg border text-xs font-semibold ${
                          isRemoved
                            ? 'bg-gray-50 border-gray-200 text-gray-400 italic'
                            : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                        }`}
                      >
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">
                          Revised State
                        </span>
                        <span className="break-words">
                          {diff.newValue !== null && diff.newValue !== undefined
                            ? String(diff.newValue)
                            : '(Removed / Struck out)'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-gray-800 text-sm">
                No Structural Field Differences Found
              </h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                {oldSnapshot
                  ? 'All core budget line items, session logistics, and titles match the previous version snapshot.'
                  : 'No archived data snapshot was preserved for this version. Future resubmissions will automatically capture full field snapshots.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing {filteredDiffs.length} change(s) across {documentType} document.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white font-bold rounded-xl transition-colors shadow-xs"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
