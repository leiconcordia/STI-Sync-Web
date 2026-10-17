/**
 * src/app/modules/workflow/components/RevisionFeedbackBanner.tsx
 *
 * Universal revision alert banner rendered across Proposal, Liquidation,
 * and Post-Activity Report modals and wizards.
 * Displays the current return feedback, flagged sections, and an expandable
 * history of all past submission cycles and their corresponding revision remarks.
 */

import { useState } from 'react';
import {
  RotateCcw,
  AlertCircle,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  History,
  Edit3,
  CheckCircle2,
  FileText,
  GitCompare,
} from 'lucide-react';
import type { RevisionHistoryEntry } from '../types/approval.types';
import { formatAppDateTime } from '../../../utils/date';
import RevisionDiffViewerModal from './RevisionDiffViewerModal';

function formatRevisionFlagLabel(flagKey: string, currentDocument?: Record<string, any>): string {
  if (!flagKey) return '';
  if (flagKey === 'sec_signatories') return 'Signatory & Audit Route';
  if (flagKey === 'sec_event_budget') return 'Event Linkage & Budget Ceiling';
  if (flagKey === 'sec_line_items') return 'Expense Line Items & Calculations';
  if (flagKey === 'sec_receipts') return 'Proof of Expenses & Receipts';

  // Proposal steps:
  if (flagKey.startsWith('step_')) {
    const num = flagKey.replace('step_', '');
    const names: Record<string, string> = {
      '1': 'Step 1: General Information',
      '2': 'Step 2: Objectives & Expected Outcomes',
      '3': 'Step 3: Participant Profile & Attendance',
      '4': 'Step 4: Activity Schedule & Itinerary',
      '5': 'Step 5: Resource & Logistical Needs',
      '6': 'Step 6: Financial Projections & Budget',
      '7': 'Step 7: Signatory Flow & Audit Route',
      '8': 'Step 8: Final Review & Submission',
    };
    return names[num] || `Step ${num}`;
  }

  // PAR sections:
  if (flagKey === 'sec_exec_summary') return 'Section 1: Executive Summary';
  if (flagKey === 'sec_financial_reconciliation') return 'Section 2: Financial Reconciliation';
  if (flagKey === 'sec_narrative_outcomes') return 'Section 3: Narrative & Outcomes';
  if (flagKey === 'sec_signatory_clearance') return 'Section 4: Signatory Pipeline';

  // Liquidation Line Items: item_<id> or item_<index>
  if (flagKey.startsWith('item_')) {
    const rawId = flagKey.replace('item_', '');
    const lineItems: any[] = currentDocument?.lineItems || [];
    const idxNum = parseInt(rawId, 10);
    let matchedItem: any = null;
    let matchedIndex = -1;

    // Search by item id
    const foundIdx = lineItems.findIndex((it) => it && it.id === rawId);
    if (foundIdx !== -1) {
      matchedItem = lineItems[foundIdx];
      matchedIndex = foundIdx;
    } else if (!isNaN(idxNum) && lineItems[idxNum]) {
      matchedItem = lineItems[idxNum];
      matchedIndex = idxNum;
    }

    if (matchedItem) {
      const desc = matchedItem.description?.trim() || 'Expense Line Item';
      return `Item #${matchedIndex + 1}: ${desc}`;
    }
    return `Line Item (${rawId})`;
  }

  return flagKey;
}

interface RevisionFeedbackBannerProps {
  returnedBy?: {
    name?: string;
    roleTitle?: string;
    email?: string;
  };
  returnedAt?: any;
  returnRemarks?: string | null;
  returnFlags?: string[];
  stepRevisionRemarks?: Record<string, string> | null;
  revisionHistory?: RevisionHistoryEntry[];
  versionHistory?: any[];
  canEdit?: boolean;
  onEditClick?: () => void;
  documentTitle?: string;
  versionLabel?: string;
  currentDocument?: Record<string, any>;
  documentType?: 'AP' | 'FL' | 'PAR';
  previousSnapshot?: any;
}

export default function RevisionFeedbackBanner({
  returnedBy,
  returnedAt,
  returnRemarks,
  returnFlags,
  stepRevisionRemarks,
  revisionHistory = [],
  versionHistory = [],
  canEdit = false,
  onEditClick,
  documentTitle,
  versionLabel,
  currentDocument,
  documentType = 'AP',
  previousSnapshot,
}: RevisionFeedbackBannerProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);

  // Normalize all past revision cycles
  const pastCycles: RevisionHistoryEntry[] = [];
  const rawVersions = Array.isArray(versionHistory) ? versionHistory : [];
  const rawRevisions = Array.isArray(revisionHistory) ? revisionHistory : [];

  if (rawVersions.length > 0) {
    rawVersions.forEach((v: any, idx: number) => {
      pastCycles.push({
        version: v.version || idx + 1,
        versionLabel: v.versionLabel || `v${v.version || idx + 1}.0`,
        submittedAt: v.archivedAt || v.submittedAt || v.savedAt,
        submittedBy: v.resubmittedBy || v.submittedBy || v.savedByName || 'Submitter',
        returnedAt: v.returnedAt || v.archivedAt,
        returnedBy: v.returnedByName || v.returnedBy || 'Reviewer',
        returnedByRoleTitle: v.returnedByRoleTitle || 'Institutional Signatory',
        returnRemarks: v.returnRemarks || v.adviserRemarks || (currentDocument as any)?.adviserRemarks || 'Revision requested.',
        returnFlags: v.returnFlags || [],
        stepRevisionRemarks: v.stepRevisionRemarks || {},
        resubmittedAt: v.resubmittedAt,
        resubmissionNote: v.resubmissionNote,
        dataSnapshot:
          v.dataSnapshot ||
          v.previousSnapshot ||
          (v as any).snapshot ||
          (v as any).returnedSnapshot ||
          previousSnapshot ||
          (currentDocument as any)?.returnedSnapshot ||
          (currentDocument as any)?.previousSnapshot ||
          (currentDocument as any)?.initialSnapshot ||
          null,
      });
    });
  }

  if (rawRevisions.length > 0) {
    rawRevisions.forEach((r: any, idx: number) => {
      const snap =
        r.dataSnapshot ||
        r.previousSnapshot ||
        (r as any).snapshot ||
        (r as any).returnedSnapshot ||
        previousSnapshot ||
        (currentDocument as any)?.returnedSnapshot ||
        (currentDocument as any)?.previousSnapshot ||
        (currentDocument as any)?.initialSnapshot ||
        null;

      const match = pastCycles.find((p) => p.version === r.version);
      if (match) {
        if (!match.dataSnapshot && snap) {
          match.dataSnapshot = snap;
        }
        if (r.returnRemarks && !match.returnRemarks) {
          match.returnRemarks = r.returnRemarks;
        }
      } else {
        pastCycles.push({
          ...r,
          returnRemarks: r.returnRemarks || (currentDocument as any)?.adviserRemarks || 'Revision requested.',
          dataSnapshot: snap,
        });
      }
    });
  }

  const hasHistory = pastCycles.length > 0;
  const reviewerName = returnedBy?.name || 'Institutional Signatory';
  const reviewerTitle = returnedBy?.roleTitle || 'Reviewer';
  const formattedDate = returnedAt
    ? typeof returnedAt.toDate === 'function'
      ? formatAppDateTime(returnedAt.toDate())
      : typeof returnedAt === 'string'
      ? formatAppDateTime(new Date(returnedAt))
      : formatAppDateTime(new Date())
    : 'Recently';

  return (
    <div className="bg-gradient-to-r from-amber-50 via-amber-50/80 to-orange-50 border-2 border-amber-300 rounded-2xl p-5 text-amber-900 shadow-xs space-y-4">
      {/* Header & Reviewer Attribution */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center flex-shrink-0 text-amber-700">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm uppercase tracking-wider text-amber-800">
                Returned for Revision
              </span>
              {versionLabel && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200/70 text-amber-900 border border-amber-300">
                  {versionLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-amber-900">{reviewerName}</span>
              <span className="text-amber-500">•</span>
              <span>{reviewerTitle}</span>
              <span className="text-amber-500">•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                {formattedDate}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setShowDiffModal(true)}
            className="px-3.5 py-2 bg-white hover:bg-amber-100/80 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="Compare what was changed between revisions"
          >
            <GitCompare className="w-3.5 h-3.5 text-amber-700" />
            <span>Compare Changes</span>
          </button>

          {canEdit && onEditClick && (
            <button
              type="button"
              onClick={onEditClick}
              className="px-4 py-2 bg-gradient-to-r from-[#001A4D] to-[#002B7F] hover:from-[#002B7F] hover:to-[#001A4D] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit & Resubmit</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Feedback Remarks Card */}
      {returnRemarks && (
        <div className="bg-white/85 rounded-xl p-3.5 border border-amber-200 shadow-xs space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Signatory Feedback & Required Revisions:
          </p>
          <div className="text-xs text-slate-800 font-medium pl-3 border-l-2 border-amber-500 whitespace-pre-line leading-relaxed">
            "{returnRemarks}"
          </div>
        </div>
      )}

      {/* Flagged Section Tags */}
      {Array.isArray(returnFlags) && returnFlags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Flagged Items & Sections Requiring Correction:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {returnFlags.map((flag, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-amber-300 text-amber-900 shadow-2xs flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {formatRevisionFlagLabel(flag, currentDocument)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Step-Specific Remarks (if any) */}
      {stepRevisionRemarks && Object.keys(stepRevisionRemarks).length > 0 && (
        <div className="bg-white/70 rounded-xl p-3 border border-amber-200/70 space-y-1.5">
          <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
            Detailed Step & Item Feedback:
          </p>
          <div className="space-y-1.5">
            {Object.entries(stepRevisionRemarks).map(([stepKey, comment]) => (
              <div key={stepKey} className="text-xs text-slate-700 pl-2.5 border-l-2 border-amber-500 py-0.5">
                <span className="font-bold text-amber-950 block">
                  {formatRevisionFlagLabel(stepKey, currentDocument)}:
                </span>
                <span className="text-slate-700 whitespace-pre-line leading-relaxed">{comment}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revision History Expander */}
      {hasHistory && (
        <div className="pt-2 border-t border-amber-200/70">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-xs font-bold text-amber-800 hover:text-amber-950 transition-colors cursor-pointer py-1"
          >
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-amber-600" />
              Past Revision Remarks & Submission History ({pastCycles.length} {pastCycles.length === 1 ? 'cycle' : 'cycles'})
            </span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2.5 pt-2">
              {pastCycles.map((cycle, idx) => (
                <div
                  key={idx}
                  className="bg-white/90 rounded-xl p-3 border border-amber-200 text-xs space-y-1.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 border border-amber-200">
                        {cycle.versionLabel || `Round ${idx + 1}`}
                      </span>
                      <span>Returned by {cycle.returnedBy || 'Reviewer'} ({cycle.returnedByRoleTitle || 'Signatory'})</span>
                    </span>
                    <span className="text-gray-500 font-normal">
                      {cycle.returnedAt ? formatAppDateTime(new Date(cycle.returnedAt)) : 'Earlier'}
                    </span>
                  </div>
                  <div className="text-slate-700 italic pl-2.5 border-l-2 border-amber-400 bg-amber-50/50 p-2 rounded-r-lg">
                    "{cycle.returnRemarks}"
                  </div>
                  {cycle.resubmissionNote && (
                    <div className="text-[11px] text-emerald-800 pl-2.5 border-l-2 border-emerald-400 mt-1">
                      <span className="font-bold">Author Resolution Note: </span>
                      {cycle.resubmissionNote}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Interactive Visual Diff Comparison Studio */}
      <RevisionDiffViewerModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        documentTitle={documentTitle}
        documentType={documentType}
        currentDocument={currentDocument || null}
        previousSnapshot={
          previousSnapshot ||
          (currentDocument as any)?.returnedSnapshot ||
          (currentDocument as any)?.previousSnapshot ||
          (currentDocument as any)?.initialSnapshot
        }
        revisionHistory={pastCycles}
        versionHistory={versionHistory}
      />
    </div>
  );
}
