/**
 * src/app/modules/finance/components/LiquidationFlowBuilder.tsx
 *
 * Interactive visual builder for creating dynamic, multi-stage approval workflows for Financial Liquidations.
 * Allows officers & admins to:
 * - Define and customize sequential stages (Stage 1, Stage 2, Stage 3, Stage 4...)
 * - Add multiple institutional checkers, auditors, endorsers, and approvers per stage
 * - Switch action type between 'check' (Auditor), 'endorse' (Endorser), and 'approve' (Approver)
 * - Add or remove stages, rename stages, and reorder stages
 * - Pre-fill standard institutional signatories or clear/reset
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
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
  DollarSign,
  Lock,
} from 'lucide-react';
import type { LiquidationApprovalStep } from '../types/liquidation.types';
import {
  type InstitutionalSignatory,
  isSignatoryApplicableTo,
} from '../../signatories/types/signatory.types';
import { generateDefaultLiquidationChain } from '../services/liquidation.service';

interface LiquidationFlowBuilderProps {
  approvalChain: LiquidationApprovalStep[];
  onChange: (newChain: LiquidationApprovalStep[]) => void;
  activeSignatories: InstitutionalSignatory[];
  orgId?: string;
  orgName?: string;
  allocatedBudget?: number;
}

export default function LiquidationFlowBuilder({
  approvalChain,
  onChange,
  activeSignatories,
  orgId,
  orgName,
  allocatedBudget,
}: LiquidationFlowBuilderProps) {
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
    return [];
  });

  // Synchronize stage configs dynamically from approvalChain
  useEffect(() => {
    if (!approvalChain || approvalChain.length === 0) {
      // If approvalChain is empty and no stages exist, keep clean
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

  // Adapt existing liquidation approvalChain in real-time to signatory edits and scope changes in database
  useEffect(() => {
    if (!approvalChain || approvalChain.length === 0) return;

    let modified = false;

    // 1. Purge any dummy/unassigned placeholder steps with no signatoryUid
    let filteredSteps = approvalChain.filter((step) => Boolean(step.signatoryUid && step.signatoryUid.trim() !== ''));
    if (filteredSteps.length !== approvalChain.length) {
      modified = true;
    }

    if (activeSignatories.length > 0) {
      // 2. Purge signatories that are proposal-only
      filteredSteps = filteredSteps.filter((step) => {
        const matched = activeSignatories.find(
          (s) =>
            s.id === step.signatoryUid ||
            (s.email && s.email.toLowerCase() === (step.signatoryEmail || '').toLowerCase())
        );
        if (matched && !isSignatoryApplicableTo(matched, 'liquidation')) {
          modified = true;
          return false;
        }
        return true;
      });

      // 3. Synchronize edited names, titles, departments, and permanent flags from database
      filteredSteps = filteredSteps.map((step) => {
        const matched = activeSignatories.find(
          (s) =>
            s.id === step.signatoryUid ||
            (s.email && s.email.toLowerCase() === (step.signatoryEmail || '').toLowerCase())
        );
        if (matched) {
          const shouldBePermanent = Boolean(matched.isPermanentSigner);
          if (
            (matched.name && matched.name !== step.signatoryName) ||
            (matched.roleTitle && matched.roleTitle !== step.roleTitle) ||
            (matched.department && matched.department !== step.department) ||
            step.isPermanent !== shouldBePermanent
          ) {
            modified = true;
            return {
              ...step,
              signatoryName: matched.name || step.signatoryName,
              roleTitle: matched.roleTitle || step.roleTitle,
              department: matched.department || step.department,
              isPermanent: shouldBePermanent,
              isMandatory: shouldBePermanent || step.isMandatory,
            };
          }
        }
        return step;
      });
    }

    if (modified) {
      onChange(filteredSteps);
    }
  }, [activeSignatories, approvalChain]);

  // Group steps by stageIndex using stageConfigs or approvalChain
  const stages = useMemo(() => {
    const stageMap: Record<number, LiquidationApprovalStep[]> = {};
    approvalChain.forEach((step) => {
      const sIdx = step.stageIndex ?? 1;
      if (!stageMap[sIdx]) stageMap[sIdx] = [];
      stageMap[sIdx].push(step);
    });

    if (stageConfigs.length > 0) {
      return stageConfigs.map((c) => ({
        stageIndex: c.stageIndex,
        stageName: c.stageName,
        steps: stageMap[c.stageIndex] || [],
      }));
    }

    const uniqueStageIndices = Array.from(new Set(approvalChain.map((s) => s.stageIndex ?? 1))).sort((a, b) => a - b);
    if (uniqueStageIndices.length > 0) {
      return uniqueStageIndices.map((idx) => {
        const firstStep = approvalChain.find((s) => (s.stageIndex ?? 1) === idx);
        return {
          stageIndex: idx,
          stageName: firstStep?.stageName || `Stage ${idx}`,
          steps: stageMap[idx] || [],
        };
      });
    }

    return [];
  }, [approvalChain, stageConfigs]);

  // Validation Checks
  const validation = useMemo(() => {
    const hasApprover = approvalChain.some(
      (s) => s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator'
    );
    const hasChecker = approvalChain.some((s) => s.actionType === 'check' || s.role === 'accountant');
    const emptyStages = stages.filter((stg) => stg.steps.length === 0);
    const totalSignatories = approvalChain.length;

    return {
      hasApprover,
      hasChecker,
      emptyStages,
      totalSignatories,
      isValid: hasApprover && totalSignatories > 0,
    };
  }, [approvalChain, stages]);

  // Renumber and rebuild steps helper while preserving stage definitions
  const reindexChain = (
    updatedStages: { stageIndex: number; stageName: string; steps: LiquidationApprovalStep[] }[]
  ) => {
    let globalStep = 1;
    const flattened: LiquidationApprovalStep[] = [];
    const newConfigs: { stageIndex: number; stageName: string }[] = [];

    updatedStages.forEach((stg, stgIdx) => {
      const newStageNumber = stgIdx + 1;
      const stageName = stg.stageName || `Stage ${newStageNumber}: Review & Endorsement`;

      newConfigs.push({
        stageIndex: newStageNumber,
        stageName,
      });

      stg.steps.forEach((step) => {
        flattened.push({
          ...step,
          step: globalStep++,
          stageIndex: newStageNumber,
          stageName,
          status: newStageNumber === 1 ? 'current' : 'waiting',
        });
      });
    });

    setStageConfigs(newConfigs);
    onChange(flattened);
  };

  // 1. Pre-fill Standard Liquidation Pipeline from Maintenance
  const handleAutoSuggest = async () => {
    const suggested = await generateDefaultLiquidationChain(
      orgId,
      orgName,
      allocatedBudget,
      activeSignatories
    );
    onChange(suggested);
  };

  // 2. Add New Empty Stage
  const handleAddStage = () => {
    const newStageNumber = stages.length + 1;
    const defaultName = `Stage ${newStageNumber}: Review & Endorsement`;

    const newStages = [
      ...stages,
      {
        stageIndex: newStageNumber,
        stageName: defaultName,
        steps: [],
      },
    ];
    reindexChain(newStages);
  };

  // 3. Delete Stage (only allowed if stage contains no permanent signers)
  const handleDeleteStage = (stageIdx: number) => {
    const targetStage = stages.find((s) => s.stageIndex === stageIdx);
    if (targetStage && targetStage.steps.some((s) => s.isPermanent)) {
      alert('This stage contains a permanent required signatory and cannot be deleted.');
      return;
    }
    const filtered = stages.filter((s) => s.stageIndex !== stageIdx);
    reindexChain(filtered);
  };

  // 4. Move Stage Up
  const handleMoveStageUp = (stageIndex: number) => {
    const pos = stages.findIndex((s) => s.stageIndex === stageIndex);
    if (pos <= 0) return;
    const reordered = [...stages];
    const temp = reordered[pos - 1];
    reordered[pos - 1] = reordered[pos];
    reordered[pos] = temp;
    reindexChain(reordered);
  };

  // 5. Move Stage Down
  const handleMoveStageDown = (stageIndex: number) => {
    const pos = stages.findIndex((s) => s.stageIndex === stageIndex);
    if (pos < 0 || pos >= stages.length - 1) return;
    const reordered = [...stages];
    const temp = reordered[pos + 1];
    reordered[pos + 1] = reordered[pos];
    reordered[pos] = temp;
    reindexChain(reordered);
  };

  // 6. Update Stage Title
  const handleStageNameChange = (stageIndex: number, newName: string) => {
    setStageConfigs((prev) =>
      prev.map((c) => (c.stageIndex === stageIndex ? { ...c, stageName: newName } : c))
    );
    const updated = approvalChain.map((s) => {
      if ((s.stageIndex ?? 1) === stageIndex) {
        return { ...s, stageName: newName };
      }
      return s;
    });
    onChange(updated);
  };

  // 7. Add Signatory to Stage
  const handleAddSignatoryToStage = (stageIndex: number) => {
    const selectedSigId = selectedSignatoryIdPerStage[stageIndex];
    if (!selectedSigId) return;

    const signatory = activeSignatories.find((s) => s.id === selectedSigId);
    if (!signatory) return;

    if (!isSignatoryApplicableTo(signatory, 'liquidation')) {
      alert(`"${signatory.name}" is designated for Activity Proposals only and cannot be added to Financial Liquidations.`);
      return;
    }

    // Prevent duplicate within the same stage
    const existsInStage = stages
      .find((s) => s.stageIndex === stageIndex)
      ?.steps.some((s) => s.signatoryUid === signatory.id || (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (signatory.email || '').toLowerCase()));

    if (existsInStage) {
      alert(`"${signatory.name}" is already assigned to this stage.`);
      return;
    }

    // Determine default action type for liquidation
    let actionType: 'check' | 'endorse' | 'approve' | 'note' = 'endorse';
    if (
      signatory.role === 'accountant' ||
      signatory.roleTitle?.toLowerCase().includes('accountant') ||
      signatory.roleTitle?.toLowerCase().includes('auditor')
    ) {
      actionType = 'check';
    } else if (signatory.role === 'school_president' || signatory.actionType === 'approver') {
      actionType = 'approve';
    } else {
      actionType = 'endorse';
    }

    const isPermanent = Boolean(signatory.isPermanentSigner);

    const newStep: LiquidationApprovalStep = {
      id: `liq_step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      step: approvalChain.length + 1,
      stageIndex,
      stageName: stages.find((s) => s.stageIndex === stageIndex)?.stageName || `Stage ${stageIndex}`,
      role: signatory.role || '',
      roleTitle: signatory.roleTitle || 'Institutional Signatory',
      actionType,
      signatoryUid: signatory.id || (signatory as any).uid || '',
      signatoryName: signatory.name || '',
      signatoryEmail: signatory.email || '',
      department: signatory.department || '',
      status: stageIndex === 1 ? 'current' : 'waiting',
      isPermanent,
      isMandatory: isPermanent,
    };

    const updatedStages = stages.map((stg) => {
      if (stg.stageIndex === stageIndex) {
        return { ...stg, steps: [...stg.steps, newStep] };
      }
      return stg;
    });

    reindexChain(updatedStages);
    setSelectedSignatoryIdPerStage((prev) => ({ ...prev, [stageIndex]: '' }));
  };

  // 8. Remove Signatory from Stage
  const handleRemoveSignatory = (stepIdOrIndex: string | number) => {
    const targetStep = approvalChain.find((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    if (targetStep?.isPermanent) {
      alert('Permanent signatories are required by institutional policy and cannot be removed.');
      return;
    }
    const filtered = approvalChain.filter((s) => (s.id ? s.id !== stepIdOrIndex : s.step !== stepIdOrIndex));
    let globalStep = 1;
    const flattened: LiquidationApprovalStep[] = filtered.map((step) => ({
      ...step,
      step: globalStep++,
    }));
    onChange(flattened);
  };

  // 9. Reset Stages (retains permanent signers from maintenance if any exist)
  const handleResetToEmpty = () => {
    const permanentOnly = approvalChain.filter((s) => s.isPermanent);
    if (permanentOnly.length > 0) {
      const stageMap = new Map<number, LiquidationApprovalStep[]>();
      permanentOnly.forEach((s) => {
        const idx = s.stageIndex ?? 1;
        if (!stageMap.has(idx)) stageMap.set(idx, []);
        stageMap.get(idx)!.push(s);
      });
      const sortedKeys = Array.from(stageMap.keys()).sort((a, b) => a - b);
      const rebuiltStages = sortedKeys.map((key, newIdx) => ({
        stageIndex: newIdx + 1,
        stageName: stageMap.get(key)![0]?.stageName || `Stage ${newIdx + 1}`,
        steps: stageMap.get(key)!,
      }));
      reindexChain(rebuiltStages);
    } else {
      setStageConfigs([]);
      onChange([]);
    }
  };

  // 10. Cycle Action Type for a specific Step ('check' -> 'endorse' -> 'approve' -> 'check')
  const handleCycleActionType = (stepIdOrIndex: string | number) => {
    const updated = approvalChain.map((s) => {
      const match = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
      if (match) {
        if (s.isPermanent) return s; // Permanent signers have fixed actions defined by maintenance
        let nextAction: 'check' | 'endorse' | 'approve' = 'endorse';
        if (s.actionType === 'check') nextAction = 'endorse';
        else if (s.actionType === 'endorse') nextAction = 'approve';
        else if (s.actionType === 'approve') nextAction = 'check';
        return { ...s, actionType: nextAction };
      }
      return s;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* ── TOP HEADER & CONTROLS ── */}
      <div className="bg-gradient-to-r from-slate-900 via-[#001A4D] to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300 flex-shrink-0">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Dynamic Liquidation Approval & Audit Pipeline
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {stages.length} {stages.length === 1 ? 'Stage' : 'Stages'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Dynamic pipeline sourced from institutional maintenance. Add or reorder stages as needed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleResetToEmpty}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Clear all assigned signatories and reset"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Clear Names</span>
            </button>

            <button
              type="button"
              onClick={handleAutoSuggest}
              className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-400/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Pre-fills signatories configured in institutional maintenance"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>Auto-Fill Signatories</span>
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

        {/* Validation Badges */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-slate-300 text-[11px] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <strong>{validation.totalSignatories}</strong> Total Signatories Assigned
            </span>
            <span className="text-slate-500">•</span>
            {validation.hasChecker ? (
              <span className="text-blue-300 text-[11px] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                Auditor / Accountant Designated
              </span>
            ) : (
              <span className="text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Note: No Auditor/Accountant in chain
              </span>
            )}
            <span className="text-slate-500">•</span>
            {validation.hasApprover ? (
              <span className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Final Approver Configured
              </span>
            ) : (
              <span className="text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Warning: No final Approver designated
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-400">
            Rules: Parallel signing within stage • Sequential across stages
          </div>
        </div>
      </div>

      {/* ── STAGES LIST ── */}
      <div className="space-y-4">
        {stages.length === 0 ? (
          <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">No Approval Stages Configured</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                The liquidation pipeline is dynamic and generated from your institutional maintenance.
                Click <strong>Auto-Fill Signatories</strong> to populate active signers, or click <strong>Add Stage</strong> to create a stage.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleAutoSuggest}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#FFD41C]" />
                <span>Auto-Fill Signatories</span>
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
            const isMandatoryStage = stage.steps.some((s) => s.isPermanent);

            return (
              <div key={stage.stageIndex} className="relative">
                {/* Connector Down Arrow */}
                {stageIdx > 0 && (
                  <div className="flex items-center justify-center -my-2.5 z-10 relative">
                    <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                      <ArrowDown className="w-3 h-3 text-blue-600" />
                      <span>Once Stage {stageIdx} completes, proceeds to:</span>
                    </div>
                  </div>
                )}

                <div className="bg-white border-2 border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs transition-all hover:border-blue-300">
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
                          {isMandatoryStage && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                              <ShieldCheck className="w-3 h-3 text-amber-600" />
                              <span>Permanent Signer Stage</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 px-2 mt-0.5">
                          {isFirstStage
                            ? 'Stage 1: Active immediately upon liquidation submission.'
                            : `Stage ${stage.stageIndex}: Unlocks after Stage ${stage.stageIndex - 1} completes.`}
                        </div>
                      </div>
                    </div>

                    {/* Stage Order & Delete Controls */}
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      <button
                        type="button"
                        disabled={isFirstStage || isMandatoryStage}
                        onClick={() => handleMoveStageUp(stage.stageIndex)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        title={isMandatoryStage ? 'Stage contains required permanent signers' : 'Move stage up'}
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isLastStage || isMandatoryStage}
                        onClick={() => handleMoveStageDown(stage.stageIndex)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        title={isMandatoryStage ? 'Stage contains required permanent signers' : 'Move stage down'}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      {!isMandatoryStage && stages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteStage(stage.stageIndex)}
                          className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 ml-1 cursor-pointer"
                          title="Delete stage"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                          Select an institutional officer or accountant from the dropdown below to assign to this stage.
                        </p>
                      </div>
                    ) : (
                      stage.steps.map((step, stepIdx) => {
                        const isApprover = step.actionType === 'approve' || step.role === 'school_president';
                        const isChecker = step.actionType === 'check' || step.role === 'accountant';

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
                                  {step.isPermanent && (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                                      <ShieldCheck className="w-3 h-3 text-amber-600" />
                                      <span>Permanent Signer</span>
                                    </span>
                                  )}
                                  {step.isMandatory && !step.isPermanent && (
                                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                                      <Check className="w-3 h-3 text-blue-600" />
                                      <span>Required Role</span>
                                    </span>
                                  )}
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
                              {/* Action Type Cycle Button or Locked Action Badge */}
                              {step.isPermanent ? (
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 shadow-2xs cursor-not-allowed ${
                                    isApprover
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : isChecker
                                      ? 'bg-blue-50 text-blue-800 border-blue-300'
                                      : 'bg-sky-50 text-sky-800 border-sky-300'
                                  }`}
                                  title="Permanent Signer: Action role cannot be edited per institutional maintenance"
                                >
                                  {isApprover ? (
                                    <>
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Approver</span>
                                    </>
                                  ) : isChecker ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Auditor Check</span>
                                    </>
                                  ) : (
                                    <>
                                      <FileSignature className="w-3.5 h-3.5 text-sky-600" />
                                      <span>Endorser</span>
                                    </>
                                  )}
                                  <Lock className="w-3 h-3 text-slate-400 ml-0.5" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCycleActionType(step.id || step.step)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                                    isApprover
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : isChecker
                                      ? 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-300'
                                      : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
                                  }`}
                                  title="Click to cycle role (Auditor Check ➔ Department Endorse ➔ Executive Approve)"
                                >
                                  {isApprover ? (
                                    <>
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Approver</span>
                                    </>
                                  ) : isChecker ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Auditor Check</span>
                                    </>
                                  ) : (
                                    <>
                                      <FileSignature className="w-3.5 h-3.5 text-sky-600" />
                                      <span>Endorser</span>
                                    </>
                                  )}
                                  <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold bg-white/70 px-1 py-0.5 rounded ml-0.5">
                                    Switch
                                  </span>
                                </button>
                              )}

                              {/* Remove Signatory or Locked Badge */}
                              {step.isPermanent ? (
                                <span
                                  className="text-[10px] font-semibold text-amber-700 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1 shadow-2xs cursor-not-allowed"
                                  title="Permanent Signer: Required by institutional policy and cannot be removed"
                                >
                                  <Lock className="w-3 h-3 text-amber-600" />
                                  <span>Locked</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSignatory(step.id || step.step)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Remove optional signatory from this stage"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Add Signatory Dropdown for this Stage */}
                    <div className="pt-2 flex items-center gap-2">
                      <div className="relative flex-1">
                        <select
                          value={selectedSigId}
                          onChange={(e) =>
                            setSelectedSignatoryIdPerStage((prev) => ({
                              ...prev,
                              [stage.stageIndex]: e.target.value,
                            }))
                          }
                          className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none cursor-pointer"
                        >
                          <option value="">+ Choose an Institutional Signatory to Add to Stage {stage.stageIndex}...</option>
                          {activeSignatories
                            .filter((sig) => sig.isActive !== false && isSignatoryApplicableTo(sig, 'liquidation'))
                            .map((sig) => (
                              <option key={sig.id} value={sig.id}>
                                {sig.name} — {sig.roleTitle} {sig.department ? `(${sig.department})` : ''}
                              </option>
                            ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={!selectedSigId}
                        onClick={() => handleAddSignatoryToStage(stage.stageIndex)}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
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
