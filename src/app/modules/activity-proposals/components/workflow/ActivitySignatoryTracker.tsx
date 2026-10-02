/**
 * src/app/modules/activity-proposals/components/workflow/ActivitySignatoryTracker.tsx
 *
 * Real-time Visual Multi-Stage Endorsement Tracker.
 * Displays each stage, signatory status, verified black-ink e-signatures,
 * timestamps, and official reviewer remarks.
 */

import React from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  FileSignature,
  Calendar,
} from 'lucide-react';
import type { ProposalApprovalStep } from '../../types/proposal.types';
import { formatAppDateTime } from '../../../../utils/date';

interface ActivitySignatoryTrackerProps {
  approvalChain?: ProposalApprovalStep[];
  currentStageIndex?: number;
  proposalStatus?: string;
  className?: string;
}

export default function ActivitySignatoryTracker({
  approvalChain = [],
  currentStageIndex = 1,
  proposalStatus,
  className = '',
}: ActivitySignatoryTrackerProps) {

  if (!approvalChain || approvalChain.length === 0) {
    return (
      <div className={`p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-500 text-xs ${className}`}>
        <FileSignature className="w-5 h-5 mx-auto mb-1 text-slate-400" />
        <p className="font-semibold">Standard Institutional Approval Flow</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Status: <span className="font-bold uppercase tracking-wider text-slate-700">{proposalStatus || 'Pending'}</span>
        </p>
      </div>
    );
  }

  // Group steps by stageIndex (defaults to 1 if unset)
  const stageMap = new Map<number, ProposalApprovalStep[]>();
  approvalChain.forEach((step) => {
    const sIdx = step.stageIndex ?? 1;
    const existing = stageMap.get(sIdx) || [];
    existing.push(step);
    stageMap.set(sIdx, existing);
  });

  const stages = Array.from(stageMap.entries()).sort(([a], [b]) => a - b);

  // Calculate statistics
  const totalSteps = approvalChain.length;
  const completedSteps = approvalChain.filter(
    (s) => s.status === 'endorsed' || s.status === 'approved'
  ).length;
  const percentComplete = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const isFullyApproved = proposalStatus === 'approved' || completedSteps === totalSteps;
  const isReturned = proposalStatus === 'returned' || approvalChain.some((s) => s.status === 'returned');
  const isRejected = proposalStatus === 'rejected';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── Summary Progress Header ── */}
      <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Institutional Approval Pipeline
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isFullyApproved
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : isReturned
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : isRejected
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}
              >
                {isFullyApproved
                  ? 'Fully Authorized'
                  : isReturned
                  ? 'Returned for Revision'
                  : isRejected
                  ? 'Declined'
                  : `Stage ${currentStageIndex} in Progress`}
              </span>
            </div>
            <h4 className="text-sm font-bold text-white mt-1">
              {completedSteps} of {totalSteps} Digital Signatures Recorded ({percentComplete}%)
            </h4>
          </div>

          <div className="w-full sm:w-48 bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isFullyApproved
                  ? 'bg-emerald-500'
                  : isReturned
                  ? 'bg-amber-500'
                  : isRejected
                  ? 'bg-rose-500'
                  : 'bg-[#FFD41C]'
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Stages & Signatories List ── */}
      <div className="space-y-3">
        {stages.map(([stageNumber, steps]) => {
          const isCurrentStage = stageNumber === currentStageIndex && !isFullyApproved;
          const isPassedStage = stageNumber < currentStageIndex || isFullyApproved;
          const isStageFinished = steps.every((s) => s.status === 'endorsed' || s.status === 'approved');

          return (
            <div
              key={stageNumber}
              className={`border rounded-2xl p-4 transition-all ${
                isCurrentStage
                  ? 'bg-blue-50/50 border-blue-300 shadow-xs ring-1 ring-blue-400/20'
                  : isStageFinished
                  ? 'bg-emerald-50/30 border-emerald-200'
                  : 'bg-slate-50/60 border-slate-200 opacity-80'
              }`}
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isStageFinished
                        ? 'bg-emerald-600 text-white'
                        : isCurrentStage
                        ? 'bg-[#001A4D] text-[#FFD41C]'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isStageFinished ? <CheckCircle2 className="w-3.5 h-3.5" /> : stageNumber}
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">
                      Stage {stageNumber}: {steps[0]?.stageName || (stageNumber === 1 ? 'Academic & Department Endorsements' : 'Executive Presidential Authorization')}
                    </h5>
                  </div>
                </div>

                <span className="text-[11px] font-semibold text-slate-500">
                  {steps.filter((s) => s.status === 'endorsed' || s.status === 'approved').length} / {steps.length} Signed
                </span>
              </div>

              {/* Signatories in this stage */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {steps.map((step, idx) => {
                  const isDone = step.status === 'endorsed' || step.status === 'approved';
                  const isCurrent = step.status === 'current';
                  const isReturnedStep = step.status === 'returned';

                  return (
                    <div
                      key={step.id || `${stageNumber}-${idx}`}
                      className={`p-3 rounded-xl border flex flex-col justify-between transition-colors ${
                        isDone
                          ? 'bg-white border-emerald-200 shadow-xs'
                          : isCurrent
                          ? 'bg-white border-blue-300 ring-2 ring-blue-500/20 shadow-xs'
                          : isReturnedStep
                          ? 'bg-amber-50/80 border-amber-300'
                          : 'bg-white/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {step.signatoryName || 'Designated Signatory'}
                            </span>
                            {step.actionType === 'approve' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#001A4D] text-[#FFD41C] uppercase tracking-wider">
                                Final Approver
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-medium text-slate-600 truncate mt-0.5">
                            {step.roleTitle || 'Institutional Officer'}
                          </p>
                          {step.department && (
                            <p className="text-[10px] text-slate-400 truncate">
                              {step.department}
                            </p>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="flex-shrink-0">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{step.actionType === 'approve' ? 'Approved' : 'Endorsed'}</span>
                            </span>
                          ) : isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
                              <Clock className="w-3 h-3 text-blue-600" />
                              <span>Awaiting Sign</span>
                            </span>
                          ) : isReturnedStep ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>Returned</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                              <span>Waiting</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* E-Signature Stamp & Timestamp (when signed) */}
                      {isDone && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1.5">
                          {step.signatureUrl && (
                            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-1.5 flex items-center justify-center h-11 overflow-hidden">
                              <img
                                src={step.signatureUrl}
                                alt="Official E-Signature"
                                className="h-full object-contain filter contrast-125"
                              />
                            </div>
                          )}
                          <div className="flex items-center justify-between text-[10px] gap-2">
                            <div className="flex items-center gap-1.5 text-emerald-700 font-semibold flex-shrink-0">
                              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 text-emerald-600" />
                              <span>Signed & Verified</span>
                            </div>

                            <div className="flex items-center gap-1 text-slate-600 font-mono text-[10px] bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/80 truncate">
                              <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="truncate">
                                {step.signedAt ? formatAppDateTime(step.signedAt) : 'Date recorded'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Remarks Note (if any) */}
                      {step.remarks && (
                        <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200/80 text-[11px] text-slate-700">
                          <span className="font-bold text-slate-900">Remarks: </span>
                          <span>"{step.remarks}"</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
