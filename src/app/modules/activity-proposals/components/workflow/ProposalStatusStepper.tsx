/**
 * src/app/modules/activity-proposals/components/workflow/ProposalStatusStepper.tsx
 *
 * Visual 7-Stage Proposal / Document Status Tracker
 * Displays: Draft -> For Adviser Review -> Approved by Adviser -> For SAS Review -> Approved
 * Plus active banners/chips when in For Revision or Rejected.
 */

import React from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
  FileEdit,
  ShieldCheck,
} from 'lucide-react';
import {
  buildSevenStageTrackerSteps,
  type TrackedDocumentKind,
} from '../../utils/proposal-status-tracker.utils';

interface ProposalStatusStepperProps {
  record: any;
  docKind?: TrackedDocumentKind;
  compact?: boolean;
  className?: string;
}

export default function ProposalStatusStepper({
  record,
  docKind = 'AP',
  compact = false,
  className = '',
}: ProposalStatusStepperProps) {
  const { tracking, steps } = buildSevenStageTrackerSteps(record, docKind);

  const docTitle =
    docKind === 'PAR'
      ? 'Post-Activity Report Status'
      : docKind === 'FL'
      ? 'Financial Liquidation Status'
      : docKind === 'SBR'
      ? 'Supplemental Budget Status'
      : 'Proposal Status Tracking';

  return (
    <div
      className={`bg-white border border-slate-200/90 rounded-2xl shadow-2xs ${
        compact ? 'p-3.5' : 'p-4 sm:p-5'
      } ${className}`}
    >
      {/* Header row with current status pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#001A4D]" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-[#001A4D]">
            {docTitle}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {tracking.isForRevision && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <RotateCcw className="w-3 h-3 text-amber-700" />
              <span>For Revision</span>
              {tracking.returnedByLabel && (
                <span className="text-amber-700/80 font-medium">• {tracking.returnedByLabel}</span>
              )}
            </span>
          )}
          {tracking.isRejected && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
              <XCircle className="w-3 h-3 text-rose-600" />
              <span>Rejected</span>
              {tracking.rejectedByLabel && (
                <span className="text-rose-700/80 font-medium">• {tracking.rejectedByLabel}</span>
              )}
            </span>
          )}
          {!tracking.isForRevision && !tracking.isRejected && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tracking.badgeClass}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${tracking.dotClass} ${
                  tracking.isPulsing ? 'animate-pulse' : ''
                }`}
              />
              <span>{tracking.label}</span>
            </span>
          )}
        </div>
      </div>

      {/* Horizontal 5-milestone spine (+ Revision/Rejected state coloring) */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-start justify-between min-w-[560px] gap-1">
          {steps.map((step, idx) => {
            const isCompleted = step.state === 'completed';
            const isActive = step.state === 'active';
            const isReturned = step.state === 'returned';
            const isRejected = step.state === 'rejected';

            const circleClass = isCompleted
              ? 'bg-emerald-600 text-white border-emerald-600'
              : isActive
              ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] ring-4 ring-blue-500/15'
              : isReturned
              ? 'bg-amber-500 text-white border-amber-500 ring-4 ring-amber-400/20'
              : isRejected
              ? 'bg-rose-600 text-white border-rose-600 ring-4 ring-rose-400/20'
              : 'bg-slate-100 text-slate-400 border-slate-200';

            const connectorClass = isCompleted
              ? 'bg-emerald-500'
              : isReturned
              ? 'bg-amber-300'
              : isRejected
              ? 'bg-rose-300'
              : 'bg-slate-200';

            return (
              <React.Fragment key={step.key}>
                <div className="flex flex-col items-center text-center flex-1 min-w-[96px]">
                  <div
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${circleClass}`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isReturned ? (
                      <RotateCcw className="w-3.5 h-3.5" />
                    ) : isRejected ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : isActive ? (
                      step.key === 'draft' ? (
                        <FileEdit className="w-3.5 h-3.5" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                      )
                    ) : (
                      <span className="text-[11px] font-bold">{idx + 1}</span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-bold mt-1.5 leading-tight ${
                      isCompleted
                        ? 'text-emerald-800'
                        : isActive
                        ? 'text-[#001A4D]'
                        : isReturned
                        ? 'text-amber-800'
                        : isRejected
                        ? 'text-rose-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {compact ? step.shortLabel : step.label}
                  </span>
                  {step.detail && (
                    <span
                      className={`text-[10px] mt-0.5 leading-tight truncate max-w-[130px] ${
                        isReturned
                          ? 'text-amber-700 font-semibold'
                          : isRejected
                          ? 'text-rose-600 font-semibold'
                          : isActive
                          ? 'text-[#0E4EBD] font-semibold'
                          : 'text-slate-400'
                      }`}
                      title={step.detail}
                    >
                      {step.detail}
                    </span>
                  )}
                </div>

                {idx < steps.length - 1 && (
                  <div className="flex-1 pt-3.5 px-1 min-w-[18px]">
                    <div className={`h-0.5 w-full rounded-full transition-colors ${connectorClass}`} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
