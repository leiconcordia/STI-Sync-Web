/**
 * src/app/modules/post-activity-reports/components/PARFlowBuilder.tsx
 *
 * Interactive visual builder for creating dynamic approval workflows for Post-Activity Reports (Form PAR-01).
 * Features:
 * - Dynamic pipeline matching Financial Liquidations and Activity Proposals
 * - Zero hardcoding: completely configurable
 * - Recommends 1 stage only with simultaneous parallel signing
 * - Allows cycling action types ('endorse' <-> 'approve' <-> 'check')
 * - Allows adding, removing, and reordering signatories and stages freely
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCheck2,
  ShieldCheck,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Users,
  Building,
  UserCheck,
  ArrowDown,
  Layers,
  RotateCcw,
  Check,
  FileSignature,
  Zap,
} from 'lucide-react';
import type { PARApprovalStep } from '../types/par.types';
import {
  type InstitutionalSignatory,
  isSignatoryApplicableTo,
} from '../../signatories/types/signatory.types';
import { generateDefaultPARSignatoryChain } from '../services/par.service';

interface PARFlowBuilderProps {
  approvalChain: PARApprovalStep[];
  onChange: (newChain: PARApprovalStep[]) => void;
  activeSignatories: InstitutionalSignatory[];
  orgId?: string;
  orgName?: string;
  isSasCreator?: boolean;
}

export default function PARFlowBuilder({
  approvalChain,
  onChange,
  activeSignatories,
  orgId,
  orgName,
  isSasCreator = false,
}: PARFlowBuilderProps) {
  const [selectedSignatoryIdPerStage, setSelectedSignatoryIdPerStage] = useState<Record<number, string>>({});
  const [stageConfigs, setStageConfigs] = useState<{ stageIndex: number; stageName: string }[]>(() => {
    if (approvalChain && approvalChain.length > 0) {
      const map = new Map<number, string>();
      approvalChain.forEach((step) => {
        const idx = step.stageIndex ?? 1;
        if (!map.has(idx)) {
          map.set(idx, step.stageName || `Stage ${idx}`);
        }
      });
      return Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([stageIndex, stageName]) => ({ stageIndex, stageName }));
    }
    return [{ stageIndex: 1, stageName: 'Stage 1: Post-Activity Review & Final Clearance' }];
  });

  // Synchronize stage configs dynamically from approvalChain
  useEffect(() => {
    if (!approvalChain || approvalChain.length === 0) {
      return;
    }
    setStageConfigs((prev) => {
      const map = new Map<number, string>();
      prev.forEach((p) => map.set(p.stageIndex, p.stageName));
      approvalChain.forEach((step) => {
        const idx = step.stageIndex ?? 1;
        if (!map.has(idx) || (step.stageName && !prev.some((p) => p.stageIndex === idx))) {
          map.set(idx, step.stageName || `Stage ${idx}`);
        }
      });
      const chainIndices = new Set(approvalChain.map((s) => s.stageIndex ?? 1));
      const allIndices = new Set([...Array.from(chainIndices), ...prev.map((p) => p.stageIndex)]);
      const sorted = Array.from(allIndices)
        .sort((a, b) => a - b)
        .map((stageIndex) => ({
          stageIndex,
          stageName: map.get(stageIndex) || `Stage ${stageIndex}`,
        }));
      return sorted;
    });
  }, [approvalChain]);

  // Group steps by stageIndex
  const stages = useMemo(() => {
    const stageMap = new Map<number, PARApprovalStep[]>();

    (stageConfigs || []).forEach((sc) => {
      stageMap.set(sc.stageIndex, []);
    });

    (approvalChain || []).forEach((step) => {
      const idx = step.stageIndex ?? 1;
      if (!stageMap.has(idx)) {
        stageMap.set(idx, []);
      }
      stageMap.get(idx)!.push(step);
    });

    return Array.from(stageMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([stageIndex, steps]) => {
        const found = stageConfigs.find((sc) => sc.stageIndex === stageIndex);
        const stageName = found?.stageName || steps[0]?.stageName || `Stage ${stageIndex}`;
        return {
          stageIndex,
          stageName,
          steps,
        };
      });
  }, [approvalChain, stageConfigs]);

  // Validation metrics
  const validation = useMemo(() => {
    const hasApprover = approvalChain.some((s) => s.actionType === 'approve' || s.role === 'school_president');
    const totalSignatories = approvalChain.length;
    const isSingleStage = stages.length <= 1;
    return {
      hasApprover,
      totalSignatories,
      isSingleStage,
    };
  }, [approvalChain, stages]);

  // Renames a stage
  const handleStageNameChange = (stageIndex: number, newName: string) => {
    setStageConfigs((prev) =>
      prev.map((sc) => (sc.stageIndex === stageIndex ? { ...sc, stageName: newName } : sc))
    );
    const updatedChain = approvalChain.map((step) => {
      if ((step.stageIndex ?? 1) === stageIndex) {
        return { ...step, stageName: newName };
      }
      return step;
    });
    onChange(updatedChain);
  };

  // Move stage up
  const handleMoveStageUp = (stageIndex: number) => {
    if (stageIndex <= 1) return;
    const targetIndex = stageIndex - 1;

    setStageConfigs((prev) =>
      prev.map((sc) => {
        if (sc.stageIndex === stageIndex) return { ...sc, stageIndex: targetIndex };
        if (sc.stageIndex === targetIndex) return { ...sc, stageIndex };
        return sc;
      }).sort((a, b) => a.stageIndex - b.stageIndex)
    );

    const updatedChain = approvalChain.map((step) => {
      const cur = step.stageIndex ?? 1;
      if (cur === stageIndex) return { ...step, stageIndex: targetIndex, status: targetIndex === 1 ? 'current' : step.status };
      if (cur === targetIndex) return { ...step, stageIndex, status: stageIndex === 1 ? 'current' : step.status };
      return step;
    });
    reindexAndPropagate(updatedChain);
  };

  // Move stage down
  const handleMoveStageDown = (stageIndex: number) => {
    if (stageIndex >= stages.length) return;
    const targetIndex = stageIndex + 1;

    setStageConfigs((prev) =>
      prev.map((sc) => {
        if (sc.stageIndex === stageIndex) return { ...sc, stageIndex: targetIndex };
        if (sc.stageIndex === targetIndex) return { ...sc, stageIndex };
        return sc;
      }).sort((a, b) => a.stageIndex - b.stageIndex)
    );

    const updatedChain = approvalChain.map((step) => {
      const cur = step.stageIndex ?? 1;
      if (cur === stageIndex) return { ...step, stageIndex: targetIndex, status: targetIndex === 1 ? 'current' : step.status };
      if (cur === targetIndex) return { ...step, stageIndex, status: stageIndex === 1 ? 'current' : step.status };
      return step;
    });
    reindexAndPropagate(updatedChain);
  };

  // Delete a stage
  const handleDeleteStage = (stageIndex: number) => {
    const remainingSteps = approvalChain.filter((s) => (s.stageIndex ?? 1) !== stageIndex);
    const remainingConfigs = stageConfigs.filter((sc) => sc.stageIndex !== stageIndex);

    // Re-index remaining stages
    const reindexedConfigs = remainingConfigs.map((sc, i) => ({
      ...sc,
      stageIndex: i + 1,
    }));
    setStageConfigs(reindexedConfigs);

    const stageMap = new Map<number, number>();
    remainingConfigs.forEach((sc, i) => {
      stageMap.set(sc.stageIndex, i + 1);
    });

    const reindexedSteps = remainingSteps.map((step) => {
      const oldStage = step.stageIndex ?? 1;
      const newStage = stageMap.get(oldStage) ?? 1;
      return {
        ...step,
        stageIndex: newStage,
        status: newStage === 1 ? 'current' : step.status,
      };
    });

    reindexAndPropagate(reindexedSteps);
  };

  // Add new stage
  const handleAddStage = () => {
    const nextIdx = stages.length + 1;
    const newStageName = `Stage ${nextIdx}: Clearance & Review`;
    setStageConfigs((prev) => [...prev, { stageIndex: nextIdx, stageName: newStageName }]);
  };

  // Helper: cleanly reindexes steps 1..N and ensures Stage 1 steps are 'current'
  const reindexAndPropagate = (steps: PARApprovalStep[]) => {
    const reindexed = steps.map((s, idx) => ({
      ...s,
      step: idx + 1,
      status: (s.stageIndex ?? 1) === 1 ? 'current' : s.status || 'waiting',
    }));
    onChange(reindexed);
  };

  // Cycle actionType between 'endorse' -> 'approve' -> 'check'
  const handleCycleActionType = (stepIdOrIndex: string | number) => {
    const updated = approvalChain.map((s) => {
      const match = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
      if (!match) return s;

      let nextAction: 'check' | 'endorse' | 'approve' = 'endorse';
      if (s.actionType === 'endorse') nextAction = 'approve';
      else if (s.actionType === 'approve') nextAction = 'check';
      else nextAction = 'endorse';

      return {
        ...s,
        actionType: nextAction,
      };
    });
    onChange(updated);
  };

  // Remove signatory
  const handleRemoveSignatory = (stepIdOrIndex: string | number) => {
    const filtered = approvalChain.filter((s) => {
      if (s.id && typeof stepIdOrIndex === 'string') {
        return s.id !== stepIdOrIndex;
      }
      return s.step !== stepIdOrIndex;
    });
    reindexAndPropagate(filtered);
  };

  // Move signatory up or down within their stage
  const handleMoveSignatory = (stepIdOrIndex: string | number, direction: 'up' | 'down') => {
    const idx = approvalChain.findIndex((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    if (idx === -1) return;

    const currentStep = approvalChain[idx];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= approvalChain.length) return;

    const targetStep = approvalChain[targetIdx];
    // Keep within same stage
    if ((currentStep.stageIndex ?? 1) !== (targetStep.stageIndex ?? 1)) return;

    const newChain = [...approvalChain];
    newChain[idx] = targetStep;
    newChain[targetIdx] = currentStep;
    reindexAndPropagate(newChain);
  };

  // Add signatory into stage from dropdown
  const handleAddSignatoryToStage = (stageIndex: number) => {
    const sigId = selectedSignatoryIdPerStage[stageIndex];
    if (!sigId) return;

    const signatory = activeSignatories.find((s) => s.id === sigId);
    if (!signatory) return;

    const stageConfig = stageConfigs.find((sc) => sc.stageIndex === stageIndex);
    const stageName = stageConfig?.stageName || `Stage ${stageIndex}: Post-Activity Review`;

    const isApprover =
      signatory.role === 'school_president' ||
      signatory.role === 'school_administrator' ||
      signatory.role === 'sas_head' ||
      signatory.actionType === 'approver';

    const newStep: PARApprovalStep = {
      id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      step: approvalChain.length + 1,
      stageIndex,
      stageName,
      role: signatory.role || 'signatory',
      roleTitle: signatory.roleTitle || signatory.title || 'Institutional Signatory',
      actionType: isApprover ? 'approve' : 'endorse',
      signatoryUid: signatory.uid || signatory.id,
      signatoryName: signatory.name,
      signatoryEmail: signatory.email,
      department: signatory.department || '',
      status: stageIndex === 1 ? 'current' : 'waiting',
      isMandatory: signatory.isMandatory !== false,
      isPermanent: signatory.isPermanentSigner ?? true,
    };

    const newChain = [...approvalChain, newStep];
    reindexAndPropagate(newChain);

    // Reset dropdown selection for this stage
    setSelectedSignatoryIdPerStage((prev) => ({ ...prev, [stageIndex]: '' }));
  };

  // Recommend 1 Stage Only (Simultaneous Parallel Signing)
  const handleRecommendSingleStage = async () => {
    const chain = await generateDefaultPARSignatoryChain(orgId, activeSignatories, isSasCreator);
    // Ensure all steps are explicitly 1 stage with status: 'current'
    const singleStageChain = chain.map((step, idx) => ({
      ...step,
      step: idx + 1,
      stageIndex: 1,
      stageName: 'Stage 1: Post-Activity Review & Final Clearance',
      status: 'current' as const,
    }));

    setStageConfigs([{ stageIndex: 1, stageName: 'Stage 1: Post-Activity Review & Final Clearance' }]);
    onChange(singleStageChain);
  };

  // Clear all assigned signatories
  const handleClearSignatories = () => {
    setStageConfigs([{ stageIndex: 1, stageName: 'Stage 1: Post-Activity Review & Final Clearance' }]);
    onChange([]);
  };

  return (
    <div className="space-y-4">
      {/* ── BUILDER TOP CONTROL BAR ── */}
      <div className="bg-[#001A4D] rounded-2xl p-4 sm:p-5 text-white shadow-md border border-[#001A4D]/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#FFD41C] shadow-xs flex-shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-white text-sm sm:text-base tracking-tight">
                  Configurable Post-Activity Signatory Pipeline
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFD41C] text-[#001A4D]">
                  Dynamic Route
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Customize signatories, cycle action types, or use our recommended 1-stage simultaneous signing route.
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleClearSignatories}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Clear all assigned signatories"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Clear Names</span>
            </button>

            <button
              type="button"
              onClick={handleRecommendSingleStage}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600/40 hover:bg-blue-600/60 text-blue-100 border border-blue-400/40 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Populates the recommended 1-stage route where all signatories sign simultaneously"
            >
              <Zap className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>Recommend 1 Stage (Simultaneous)</span>
            </button>

            <button
              type="button"
              onClick={handleAddStage}
              className="px-3.5 py-1.5 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/30 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stage</span>
            </button>
          </div>
        </div>

        {/* Validation & Rule Banner */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-slate-300 text-[11px] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <strong>{validation.totalSignatories}</strong> Total Signatories Configured
            </span>
            <span className="text-slate-500">•</span>
            {validation.hasApprover ? (
              <span className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Final Approver Configured
              </span>
            ) : (
              <span className="text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Note: Consider designating at least 1 Final Approver
              </span>
            )}
            <span className="text-slate-500">•</span>
            <span className="text-indigo-200 text-[11px] font-semibold flex items-center gap-1 bg-indigo-500/20 px-2 py-0.5 rounded-md border border-indigo-400/30">
              <Zap className="w-3 h-3 text-[#FFD41C]" />
              {validation.isSingleStage
                ? 'Recommended 1 Stage: All signers sign simultaneously in parallel'
                : 'Multi-stage mode: Parallel signing within stage • Sequential across stages'}
            </span>
          </div>
        </div>
      </div>

      {/* ── STAGES LIST ── */}
      <div className="space-y-4">
        {stages.length === 0 ? (
          <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">No Clearance Stages Configured</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Click <strong>Recommend 1 Stage (Simultaneous)</strong> to populate active institutional signatories for parallel signing, or click <strong>Add Stage</strong> to configure a custom route.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleRecommendSingleStage}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Zap className="w-4 h-4 text-[#FFD41C]" />
                <span>Recommend 1 Stage (Simultaneous)</span>
              </button>
              <button
                type="button"
                onClick={handleAddStage}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Stage</span>
              </button>
            </div>
          </div>
        ) : (
          stages.map((stage, stageIdx) => {
            const isFirstStage = stageIdx === 0;
            const isLastStage = stageIdx === stages.length - 1;
            const selectedSigId = selectedSignatoryIdPerStage[stage.stageIndex] || '';

            return (
              <div key={stage.stageIndex} className="relative">
                {/* Connector Down Arrow (if multi-stage) */}
                {stageIdx > 0 && (
                  <div className="flex items-center justify-center -my-2.5 z-10 relative">
                    <div className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <ArrowDown className="w-3 h-3 text-indigo-600" />
                      <span>Once Stage {stageIdx} completes, proceeds to:</span>
                    </div>
                  </div>
                )}

                <div className="bg-white border-2 border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs transition-all hover:border-indigo-300">
                  {/* Stage Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#001A4D] text-[#FFD41C] font-black text-xs flex items-center justify-center shadow-xs">
                        {stage.stageIndex}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={stage.stageName}
                            onChange={(e) => handleStageNameChange(stage.stageIndex, e.target.value)}
                            placeholder={`Stage ${stage.stageIndex} Title...`}
                            className="font-bold text-slate-800 text-sm bg-transparent hover:bg-slate-50 focus:bg-white px-2 py-0.5 rounded border border-transparent hover:border-slate-200 focus:border-blue-400 outline-none transition-all max-w-[340px]"
                          />
                          <span className="text-[11px] font-semibold text-slate-400">
                            ({stage.steps.length} {stage.steps.length === 1 ? 'Signer' : 'Signers'})
                          </span>
                          {stages.length === 1 && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                              <Zap className="w-3 h-3 text-emerald-600" />
                              <span>Simultaneous Signing</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 px-2 mt-0.5">
                          {isFirstStage
                            ? 'Active immediately upon report submission — all signatories in this stage can sign simultaneously in parallel.'
                            : `Stage ${stage.stageIndex}: Unlocks after Stage ${stage.stageIndex - 1} completes.`}
                        </div>
                      </div>
                    </div>

                    {/* Stage Order & Delete Controls */}
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      {stages.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={isFirstStage}
                            onClick={() => handleMoveStageUp(stage.stageIndex)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            title="Move stage up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isLastStage}
                            onClick={() => handleMoveStageDown(stage.stageIndex)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            title="Move stage down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStage(stage.stageIndex)}
                            className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 ml-1 cursor-pointer"
                            title="Delete stage"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Signatories in this Stage */}
                  <div className="pt-3 space-y-2.5">
                    {stage.steps.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 text-center">
                        <p className="text-xs font-semibold text-amber-800">
                          No signatories assigned to Stage {stage.stageIndex} yet.
                        </p>
                        <p className="text-[11px] text-amber-600 mt-0.5">
                          Select an institutional officer or head from the dropdown below to assign to this stage.
                        </p>
                      </div>
                    ) : (
                      stage.steps.map((step, stepIdx) => {
                        const isApprover = step.actionType === 'approve' || step.role === 'school_president';
                        const isChecker = step.actionType === 'check';

                        return (
                          <div
                            key={step.id || `${stage.stageIndex}_${stepIdx}`}
                            className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#001A4D] text-[#FFD41C] font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-xs">
                                {step.signatoryName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-slate-800 text-xs">
                                    {step.signatoryName}
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-normal">
                                    ({step.signatoryEmail})
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                                    <span>Institutional Signer</span>
                                  </span>
                                </div>
                                <div className="text-[11px] text-blue-900 font-semibold flex items-center gap-1.5 mt-0.5">
                                  <span>{step.roleTitle}</span>
                                  {step.department && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="text-slate-600">{step.department}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {/* Action Type Cycle Button */}
                              <button
                                type="button"
                                onClick={() => handleCycleActionType(step.id || step.step)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                                  isApprover
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                                    : isChecker
                                    ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                                    : 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100'
                                }`}
                                title="Click to cycle role: Endorse -> Approve -> Check"
                              >
                                {isApprover ? (
                                  <>
                                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                    <span>Approve</span>
                                  </>
                                ) : isChecker ? (
                                  <>
                                    <UserCheck className="w-3 h-3 text-slate-600" />
                                    <span>Check</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                    <span>Endorse</span>
                                  </>
                                )}
                              </button>

                              {/* Reorder within stage */}
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  disabled={stepIdx === 0}
                                  onClick={() => handleMoveSignatory(step.id || step.step, 'up')}
                                  className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-20 cursor-pointer"
                                  title="Move up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={stepIdx === stage.steps.length - 1}
                                  onClick={() => handleMoveSignatory(step.id || step.step, 'down')}
                                  className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-20 cursor-pointer"
                                  title="Move down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Remove Signatory Button */}
                              <button
                                type="button"
                                onClick={() => handleRemoveSignatory(step.id || step.step)}
                                className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer"
                                title="Remove signatory from stage"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Signatory Dropdown for this Stage */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <select
                      value={selectedSigId}
                      onChange={(e) =>
                        setSelectedSignatoryIdPerStage((prev) => ({
                          ...prev,
                          [stage.stageIndex]: e.target.value,
                        }))
                      }
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium outline-none focus:border-blue-500 focus:bg-white transition-all"
                    >
                      <option value="">-- Add an institutional officer to this stage --</option>
                      {activeSignatories
                        .filter((sig) => !stage.steps.some((s) => s.signatoryUid === (sig.uid || sig.id)))
                        .map((sig) => (
                          <option key={sig.id} value={sig.id}>
                            {sig.name} — {sig.roleTitle} {sig.department ? `(${sig.department})` : ''}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      disabled={!selectedSigId}
                      onClick={() => handleAddSignatoryToStage(stage.stageIndex)}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Signer</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
