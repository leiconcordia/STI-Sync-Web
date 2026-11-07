import React, { useState, useMemo } from 'react';
import {
  History,
  Sparkles,
  Lock,
  Unlock,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import {
  filterHistoricalMatches,
  type HistoricalActivityMatch,
} from '../../services/historical-budget.service';
import type { ProposalHistoricalReference } from '../../types/proposal.types';
import { useAllEvents } from '../../../events/hooks/useEventStream';

interface HistoricalBudgetPickerProps {
  currentTitle?: string;
  excludeEventId?: string;
  historicalReference?: ProposalHistoricalReference | null;
  onSelectHistorical: (match: HistoricalActivityMatch) => void;
  onToggleLock: (isLocked: boolean) => void;
  onClearReference: () => void;
  isManuallyEdited?: boolean;
}

export default function HistoricalBudgetPicker({
  currentTitle = '',
  excludeEventId,
  historicalReference,
  onSelectHistorical,
  onToggleLock,
  onClearReference,
  isManuallyEdited = false,
}: HistoricalBudgetPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const { events: allEvents = [], loading: eventsLoading } = useAllEvents();

  // Instant in-memory search across all events in database
  const activeQuery = searchTerm.trim() || currentTitle.trim();

  const matches: HistoricalActivityMatch[] = useMemo(() => {
    if (!activeQuery || activeQuery.length < 2) return [];
    return filterHistoricalMatches(allEvents, activeQuery, excludeEventId, 6);
  }, [allEvents, activeQuery, excludeEventId]);

  const formatPHP = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  // ── ACTIVE HISTORICAL REFERENCE CARD ──
  if (historicalReference) {
    const isLocked = historicalReference.isLocked !== false;
    const hasModifications = isManuallyEdited || historicalReference.isManuallyEdited;

    return (
      <div
        className={`p-4 rounded-2xl border-2 transition-all ${
          hasModifications
            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
            : 'bg-blue-50/90 border-blue-300 text-[#001A4D]'
        } shadow-xs`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                hasModifications
                  ? 'bg-amber-200 text-amber-800'
                  : 'bg-blue-200 text-blue-900'
              }`}
            >
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80 border border-current shadow-2xs">
                  Historical Reference Applied
                </span>
                {isLocked ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                    <Lock className="w-3 h-3 text-emerald-700" />
                    <span>Locked (Audit Baseline)</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs animate-pulse">
                    <Unlock className="w-3 h-3 text-amber-800" />
                    <span>Unlocked for Editing</span>
                  </span>
                )}
                {hasModifications && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-700" />
                    <span>Modified by Proposer</span>
                  </span>
                )}
              </div>

              <h4 className="text-sm font-bold mt-1 text-gray-900">
                {historicalReference.eventTitle}
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">
                Past Approved Budget: <strong className="font-mono text-gray-900">{formatPHP(historicalReference.originalTotalAmount)}</strong>
                {historicalReference.schoolYear && ` • SY ${historicalReference.schoolYear}`}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap self-end sm:self-center">
            {isLocked ? (
              <button
                type="button"
                onClick={() => onToggleLock(false)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Unlock to make custom modifications to Last Year's Actual numbers"
              >
                <Unlock className="w-3.5 h-3.5 text-amber-700" />
                <span>Unlock to Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleLock(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Relock figures to prevent further edits"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Relock Baseline</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClearReference}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-gray-300 text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
              title="Remove historical reference"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Audit Transparency Notice */}
        {hasModifications ? (
          <div className="mt-3 pt-2.5 border-t border-amber-200/80 text-[11px] text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>
              <strong>Reviewer Notice:</strong> You have modified "Last Year's Actual" numbers. Reviewers will see that the numbers were manually adjusted from the original recorded baseline of {formatPHP(historicalReference.originalTotalAmount)}.
            </span>
          </div>
        ) : (
          <div className="mt-3 pt-2.5 border-t border-blue-200/80 text-[11px] text-blue-900 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <span>
              <strong>Audit-Verified:</strong> "Last Year's Actual" figures are locked to the official past record. Reviewers will see that this proposal adheres to verified historical data.
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── HISTORICAL ACTIVITY SUGGESTIONS DRAWER / BANNER ──
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>Historical Budget Reference</span>
              <Sparkles className="w-3.5 h-3.5 text-[#FFD41C]" />
            </h4>
            <p className="text-[11px] text-gray-500">
              Reference a previous year's event to auto-populate "Last Year's Actual (PHP)" figures.
            </p>
          </div>
        </div>

        {/* Manual search bar */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search previous activities..."
              className="w-48 sm:w-64 pl-7 pr-7 py-1.5 bg-white border border-gray-300 rounded-lg text-xs placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#001A4D]"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Suggested Matching Activities List */}
      {matches.length > 0 ? (
        <div className="pt-2 border-t border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#001A4D] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>
                Found {matches.length} matching past {matches.length === 1 ? 'activity' : 'activities'} for "{activeQuery}":
              </span>
            </span>
            <span className="text-[10px] text-gray-400">Click to auto-populate Last Year's Budget</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {matches.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-xs transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-800 border border-blue-200 uppercase tracking-wider truncate max-w-[150px]">
                      {item.organizationName || 'Campus Event'}
                    </span>
                    {item.schoolYear && (
                      <span className="text-[10px] font-semibold text-gray-400 shrink-0">
                        SY {item.schoolYear}
                      </span>
                    )}
                  </div>
                  <h5 className="text-xs font-bold text-gray-900 group-hover:text-[#001A4D] transition-colors line-clamp-1">
                    {item.title}
                  </h5>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
                    <span>
                      Past Budget: <strong className="font-mono text-gray-800">{formatPHP(item.totalApprovedBudget)}</strong>
                    </span>
                    {item.date && (
                      <span className="text-[10px]">• {item.date}</span>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onSelectHistorical(item)}
                    className="px-3 py-1 bg-blue-50 hover:bg-[#001A4D] text-[#001A4D] hover:text-[#FFD41C] border border-blue-200 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>Apply Last Year's Budget</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeQuery.length >= 2 ? (
        <div className="pt-2 text-center text-xs text-gray-500 italic">
          No previous activities found matching "{activeQuery}". You can enter Last Year's Actual numbers manually in the table below, or try searching another keyword above.
        </div>
      ) : null}
    </div>
  );
}
