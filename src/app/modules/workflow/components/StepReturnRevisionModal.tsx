/**
 * src/app/modules/workflow/components/StepReturnRevisionModal.tsx
 *
 * Universal, institutional-grade modal for returning documents (AP, FL, PAR)
 * with specific step/section selection and targeted reviewer remarks.
 * Used by SAS Admin and Institutional Signatories alike for a uniform workflow.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCcw,
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Send,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

export interface ReturnStepItem {
  key?: string;
  id?: string;
  stepNumber?: number;
  label: string;
  description?: string;
}

export function getStepKey(s: ReturnStepItem, fallbackIndex: number): string {
  return s.key || s.id || `step_${s.stepNumber ?? fallbackIndex + 1}`;
}

interface StepReturnRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  referenceNo?: string;
  documentType: 'AP' | 'FL' | 'PAR';
  steps: ReturnStepItem[];
  onSubmit: (payload: {
    overallRemarks: string;
    flaggedSteps: string[];
    stepRevisionRemarks: Record<string, string>;
    returnDeadline: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
  initialOverallRemarks?: string;
  initialFlags?: string[];
  initialStepRemarks?: Record<string, string>;
}

export default function StepReturnRevisionModal({
  isOpen,
  onClose,
  documentTitle,
  referenceNo,
  documentType,
  steps,
  onSubmit,
  isSubmitting = false,
  initialOverallRemarks = '',
  initialFlags = [],
  initialStepRemarks = {},
}: StepReturnRevisionModalProps) {
  const [overallRemarks, setOverallRemarks] = useState(initialOverallRemarks);
  const [selectedSteps, setSelectedSteps] = useState<string[]>(initialFlags);
  const [stepRemarks, setStepRemarks] = useState<Record<string, string>>(initialStepRemarks);
  const [returnDeadline, setReturnDeadline] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const prevIsOpenRef = useRef(false);

  // Synchronize state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSelectedSteps(initialFlags || []);
      setStepRemarks(initialStepRemarks || {});
      if (initialOverallRemarks) {
        setOverallRemarks(initialOverallRemarks);
      }
      setExpandedStep(null);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialFlags, initialStepRemarks, initialOverallRemarks]);

  if (!isOpen) return null;

  const toggleStep = (stepKey: string) => {
    const isCurrentlySelected = selectedSteps.includes(stepKey);
    if (isCurrentlySelected) {
      setSelectedSteps((prev) => prev.filter((k) => k !== stepKey));
      setStepRemarks((prev) => {
        const next = { ...prev };
        delete next[stepKey];
        return next;
      });
      if (expandedStep === stepKey) setExpandedStep(null);
    } else {
      setSelectedSteps((prev) => [...prev, stepKey]);
      setExpandedStep(stepKey);
    }
  };

  const handleStepRemarkChange = (stepKey: string, val: string) => {
    setStepRemarks((prev) => ({
      ...prev,
      [stepKey]: val,
    }));
  };

  const handleSelectAll = () => {
    const allKeys = steps.map((s, idx) => getStepKey(s, idx));
    if (selectedSteps.length === steps.length) {
      setSelectedSteps([]);
      setStepRemarks({});
      setExpandedStep(null);
    } else {
      setSelectedSteps(allKeys);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!overallRemarks.trim()) {
      toast.error('Overall return remarks are required — please explain why this document needs revision.');
      return;
    }

    if (selectedSteps.length === 0) {
      toast.error('Please select at least one step or section that requires revision.');
      return;
    }

    try {
      await onSubmit({
        overallRemarks: overallRemarks.trim(),
        flaggedSteps: selectedSteps,
        stepRevisionRemarks: stepRemarks,
        returnDeadline,
      });
    } catch (err: any) {
      console.error('Failed to return document:', err);
      toast.error(err?.message || 'Failed to return document for revision.');
    }
  };

  const docTypeName =
    documentType === 'AP'
      ? 'Activity Proposal (Form AP-01)'
      : documentType === 'FL'
      ? 'Financial Liquidation (Form LF-01)'
      : 'Post-Activity Report (Form PAR)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] via-[#0E4EBD] to-[#1E70E8] p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 backdrop-blur-md flex items-center justify-center border border-amber-400/40">
              <RotateCcw className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest uppercase bg-amber-400/20 text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/30">
                  Return for Revision
                </span>
                {referenceNo && (
                  <span className="text-xs text-blue-200 font-mono font-bold">
                    {referenceNo}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-white mt-0.5 truncate max-w-md">
                {documentTitle}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Informational Guidance */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-blue-900">
            <Info className="w-4 h-4 text-[#0E4EBD] flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[#001A4D]">Return & Revision Protocol</span>
              <p className="text-blue-800 mt-0.5 leading-relaxed">
                Returning this {docTypeName} sends it back to the proponent with status{' '}
                <span className="font-semibold text-amber-800 bg-amber-100 px-1 py-0.2 rounded">Returned for Revision</span>.
                Flag the specific sections requiring correction so the owner knows exactly what to revise.
              </p>
            </div>
          </div>

          {/* Section 1: Overall Remarks */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              1. Overall Revision Summary & Instructions <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={overallRemarks}
              onChange={(e) => setOverallRemarks(e.target.value)}
              placeholder="e.g. Please revise the budget projection to adhere to the allocated fund cap and move the activity date..."
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] placeholder:text-gray-400"
              required
            />
          </div>

          {/* Section 2: Flag Specific Steps / Sections */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                2. Flag Steps / Sections Needing Revision <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] font-bold text-[#0E4EBD] hover:underline cursor-pointer"
              >
                {selectedSteps.length === steps.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              Selected steps will be highlighted with an alert badge in the owner's view. You can provide targeted notes per step.
            </p>

            <div className="space-y-2">
              {steps.map((s, idx) => {
                const stepKey = getStepKey(s, idx);
                const isChecked = selectedSteps.includes(stepKey);
                const isExpanded = expandedStep === stepKey;
                const currentRemark = stepRemarks[stepKey] || '';

                return (
                  <div
                    key={stepKey}
                    className={`border rounded-xl transition-all ${
                      isChecked
                        ? 'border-amber-300 bg-amber-50/40 shadow-2xs'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div
                      className="p-3 flex items-center justify-between cursor-pointer select-none"
                      onClick={() => toggleStep(stepKey)}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="w-4 h-4 rounded text-[#0E4EBD] focus:ring-[#0E4EBD] border-gray-300 pointer-events-none cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-bold ${
                                isChecked ? 'text-amber-900 font-semibold' : 'text-gray-800'
                              }`}
                            >
                              {s.label}
                            </span>
                            {isChecked && currentRemark.trim() && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-amber-200 text-amber-900 rounded">
                                Has note
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                              {s.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {isChecked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedStep(isExpanded ? null : stepKey);
                          }}
                          className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Step specific remark expansion */}
                    {isChecked && (isExpanded || isChecked) && (
                      <div className="px-3 pb-3 pt-0">
                        <div className="bg-white border border-amber-200 rounded-lg p-2.5">
                          <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                            Specific revision instructions for {s.label}:
                          </label>
                          <textarea
                            rows={2}
                            value={currentRemark}
                            onChange={(e) => handleStepRemarkChange(stepKey, e.target.value)}
                            placeholder={`Explain what needs to be changed in ${s.label}...`}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-[#0E4EBD] focus:border-[#0E4EBD] placeholder:text-gray-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Revision Deadline */}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
            <div>
              <label className="block text-xs font-bold text-gray-700">
                Revision Deadline
              </label>
              <p className="text-[11px] text-gray-500">
                Suggested target date for proponent to submit revisions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={returnDeadline}
                onChange={(e) => setReturnDeadline(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:ring-2 focus:ring-[#0E4EBD]/30"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-gray-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || selectedSteps.length === 0 || !overallRemarks.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-amber-600 hover:to-amber-700 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Returning...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Return Document for Revision ({selectedSteps.length} Flagged)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
