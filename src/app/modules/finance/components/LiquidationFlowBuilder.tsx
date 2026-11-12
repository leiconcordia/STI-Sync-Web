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
import { SIGNATORY_LABEL_OPTIONS, resolveSignatoryLabel, resolveActionTypeFromLabel } from '../../signatories/utils/signatory-label.utils';
import { useSignatoryLabelsStream } from '../../signatories/hooks/useSignatoryLabelsStream';
import {
  subscribeToDefaultWorkflowSettings,
  getCachedWorkflowSettings,
  isStepConfiguredPermanent,
  type DefaultWorkflowSettings,
} from '../../workflow/services/approval-workflow.service';
import { formatStageTitle, normalizeApprovalStages } from '../../workflow/utils/stage-normalization.utils';
import { AddCustomLabelModal } from '../../signatories';

interface LiquidationFlowBuilderProps {
  approvalChain: LiquidationApprovalStep[];
  onChange: (newChain: LiquidationApprovalStep[]) => void;
  activeSignatories: InstitutionalSignatory[];
  orgId?: string;
  orgName?: string;
  allocatedBudget?: number;
  isSasCreator?: boolean;
}

export default function LiquidationFlowBuilder({
  approvalChain,
  onChange,
  activeSignatories,
  orgId,
  orgName,
  allocatedBudget,
  isSasCreator = false,
}: LiquidationFlowBuilderProps) {
  const [selectedSignatoryIdPerStage, setSelectedSignatoryIdPerStage] = useState<Record<number, string>>({});
  const [workflowSettings, setWorkflowSettings] = useState<DefaultWorkflowSettings | null>(() => getCachedWorkflowSettings());

  useEffect(() => {
    const unsub = subscribeToDefaultWorkflowSettings((settings) => {
      setWorkflowSettings(settings);
    });
    return () => unsub();
  }, []);

  const pipelineKey = isSasCreator ? 'admin_fl' : 'adviser_fl';
  const { activeLabels } = useSignatoryLabelsStream();
  const [isCustomLabelModalOpen, setIsCustomLabelModalOpen] = useState(false);
  const [pendingCustomLabelStepId, setPendingCustomLabelStepId] = useState<string | number | null>(null);

  const availableLabelOptions = useMemo(() => {
    const flLabels = activeLabels.filter(
      (l) => !l.applicableDocuments || l.applicableDocuments.includes('liquidation')
    );
    if (flLabels.length > 0) {
      return flLabels.map((l) => ({
        value: l.label,
        label: l.label,
        description: l.description || '',
      }));
    }
    return SIGNATORY_LABEL_OPTIONS;
  }, [activeLabels]);
  const [stageConfigs, setStageConfigs] = useState<{ stageIndex: number }[]>(() => {
    if (approvalChain && approvalChain.length > 0) {
      const maxIdx = Math.max(1, ...approvalChain.map((s) => s.stageIndex ?? 1));
      return Array.from({ length: maxIdx }, (_, i) => ({ stageIndex: i + 1 }));
    }
    return [];
  });

  // Synchronize stage configs dynamically from approvalChain
  useEffect(() => {
    if (!approvalChain || approvalChain.length === 0) {
      return;
    }
    const maxIdx = Math.max(1, ...approvalChain.map((s) => s.stageIndex ?? 1));
    setStageConfigs((prev) => {
      const currentMax = Math.max(maxIdx, ...prev.map((p) => p.stageIndex));
      return Array.from({ length: currentMax }, (_, i) => ({ stageIndex: i + 1 }));
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

      // 3. Synchronize edited names, titles, and departments from database
      filteredSteps = filteredSteps.map((step) => {
        const matched = activeSignatories.find(
          (s) =>
            s.id === step.signatoryUid ||
            (s.email && s.email.toLowerCase() === (step.signatoryEmail || '').toLowerCase())
        );
        if (matched) {
          if (
            (matched.name && matched.name !== step.signatoryName) ||
            (matched.roleTitle && matched.roleTitle !== step.roleTitle) ||
            (matched.department && matched.department !== step.department)
          ) {
            modified = true;
            return {
              ...step,
              signatoryName: matched.name || step.signatoryName,
              roleTitle: matched.roleTitle || step.roleTitle,
              department: matched.department || step.department,
            };
          }
        }
        return step;
      });

      // 4. Strictly synchronize isPermanent against institutional default workflow settings
      filteredSteps = filteredSteps.map((step) => {
        const isUserAddedStep = Boolean(step.isUserAdded || step.id?.startsWith('liq_step_'));
        if (isUserAddedStep) {
          if (step.isPermanent) {
            modified = true;
            return {
              ...step,
              isPermanent: false,
              isUserAdded: true,
            };
          }
          return step;
        }
        const expectedPermanent = isStepConfiguredPermanent(step, pipelineKey, workflowSettings, false);
        if (Boolean(step.isPermanent) !== expectedPermanent) {
          modified = true;
          return {
            ...step,
            isPermanent: expectedPermanent,
            isMandatory: expectedPermanent || Boolean(step.isMandatory),
          };
        }
        return step;
      });
    }

    if (modified) {
      onChange(filteredSteps);
    }
  }, [activeSignatories, approvalChain, pipelineKey, workflowSettings]);

  // Group steps by stageIndex using contiguous sequential indexing
  const stages = useMemo(() => {
    const maxIndex = Math.max(
      0,
      ...stageConfigs.map((c) => c.stageIndex),
      ...(approvalChain || []).map((s) => s.stageIndex ?? 1)
    );

    if (maxIndex === 0) return [];

    const stageMap: Record<number, LiquidationApprovalStep[]> = {};
    for (let i = 1; i <= maxIndex; i++) {
      stageMap[i] = [];
    }

    (approvalChain || []).forEach((step) => {
      const sIdx = Math.max(1, step.stageIndex ?? 1);
      if (!stageMap[sIdx]) stageMap[sIdx] = [];
      stageMap[sIdx].push(step);
    });

    const result = [];
    for (let i = 1; i <= maxIndex; i++) {
      const steps = stageMap[i] || [];
      result.push({
        stageIndex: i,
        stageName: formatStageTitle(i, steps.length),
        steps,
      });
    }

    return result;
  }, [approvalChain, stageConfigs]);

  // Validation Checks
  const validation = useMemo(() => {
    const hasApprover = approvalChain.some(
      (s) => s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator'
    );
    const emptyStages = stages.filter((stg) => stg.steps.length === 0);
    const totalSignatories = approvalChain.length;

    return {
      hasApprover,
      emptyStages,
      totalSignatories,
      isValid: hasApprover && totalSignatories > 0,
    };
  }, [approvalChain, stages]);

  // Renumber and rebuild steps helper while preserving contiguous stage definitions
  const reindexChain = (
    updatedStages: { stageIndex: number; stageName?: string; steps: LiquidationApprovalStep[] }[]
  ) => {
    let globalStep = 1;
    const flattened: LiquidationApprovalStep[] = [];
    const newConfigs: { stageIndex: number }[] = [];

    let processedStages = [...updatedStages];
    while (processedStages.length > 1 && processedStages[0].steps.length === 0) {
      processedStages.shift();
    }
    if (processedStages.length === 0) {
      processedStages = [{ stageIndex: 1, stageName: formatStageTitle(1, 0), steps: [] }];
    }

    processedStages.forEach((stg, stgIdx) => {
      const newStageNumber = stgIdx + 1;
      const count = stg.steps.length;
      const stageName = formatStageTitle(newStageNumber, count);

      newConfigs.push({
        stageIndex: newStageNumber,
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

  // 1. Pre-fill Standard Liquidation Pipeline from Maintenance / Institutional Settings
  const handleAutoSuggest = async () => {
    const suggested = await generateDefaultLiquidationChain(
      orgId,
      orgName,
      allocatedBudget,
      activeSignatories,
      isSasCreator
    );
    onChange(normalizeApprovalStages(suggested));
  };

  // 2. Add New Empty Stage
  const handleAddStage = () => {
    const newStageNumber = stages.length + 1;
    const newStages = [
      ...stages,
      {
        stageIndex: newStageNumber,
        steps: [],
      },
    ];
    reindexChain(newStages);
  };

  // 3. Delete Stage (allows removing any stage)
  const handleDeleteStage = (stageIdx: number) => {
    const targetStage = stages.find((s) => s.stageIndex === stageIdx);
    const hasPermanent = targetStage?.steps.some((step) => {
      const isUserAddedStep = Boolean(step.isUserAdded || step.id?.startsWith('liq_step_'));
      return !isUserAddedStep && isStepConfiguredPermanent(step, pipelineKey, workflowSettings, false);
    });
    if (hasPermanent) {
      alert(`Cannot delete Stage ${stageIdx} because it contains a permanent institutional signatory configured in settings.`);
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

    // Prevent duplicate anywhere in the liquidation pipeline
    const existsInWorkflow = approvalChain.some(
      (s) =>
        s.signatoryUid === signatory.id ||
        (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (signatory.email || '').toLowerCase())
    );

    if (existsInWorkflow) {
      alert(`"${signatory.name}" is already assigned to this liquidation's approval pipeline.`);
      return;
    }

    // Determine action type based on signatory authority for liquidation
    const canApprove = Boolean(
      signatory.canApproveLiquidation ||
      signatory.role === 'school_president' ||
      signatory.role === 'school_administrator' ||
      signatory.actionType === 'approver'
    );
    const actionType: 'endorse' | 'approve' = canApprove ? 'approve' : 'endorse';

    const resolvedLabel = signatory.defaultSignatoryLabel || resolveSignatoryLabel(signatory as any, 'liquidation', false);
    const newStep: LiquidationApprovalStep = {
      id: `liq_step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      step: approvalChain.length + 1,
      stageIndex,
      stageName: stages.find((s) => s.stageIndex === stageIndex)?.stageName || formatStageTitle(stageIndex, 1),
      role: signatory.role || '',
      roleTitle: signatory.roleTitle || 'Institutional Signatory',
      actionType,
      signatoryLabel: resolvedLabel,
      signatoryUid: signatory.id || (signatory as any).uid || '',
      signatoryName: signatory.name || '',
      signatoryEmail: signatory.email || '',
      department: signatory.department || '',
      status: stageIndex === 1 ? 'current' : 'waiting',
      isPermanent: false,
      isMandatory: false,
      isUserAdded: true,
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

  // 8. Remove Signatory from Stage (permanent signatories cannot be removed)
  const handleRemoveSignatory = (stepIdOrIndex: string | number) => {
    const stepToRemove = approvalChain.find((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    const isUserAddedStep = Boolean(stepToRemove?.isUserAdded || stepToRemove?.id?.startsWith('liq_step_'));
    if (!isUserAddedStep && stepToRemove && isStepConfiguredPermanent(stepToRemove, pipelineKey, workflowSettings, false)) {
      alert(`"${stepToRemove?.signatoryName || 'This signatory'}" is designated as a Permanent Signatory in institutional settings and cannot be removed.`);
      return;
    }
    const filtered = approvalChain.filter((s) => (s.id ? s.id !== stepIdOrIndex : s.step !== stepIdOrIndex));
    let globalStep = 1;
    const flattened: LiquidationApprovalStep[] = filtered.map((step) => ({
      ...step,
      step: globalStep++,
    }));
    const normalized = normalizeApprovalStages(flattened);
    const maxStage = Math.max(1, ...normalized.map((s) => s.stageIndex ?? 1));
    setStageConfigs(Array.from({ length: maxStage }, (_, i) => ({ stageIndex: i + 1 })));
    onChange(normalized);
  };

  // Update Signatory Formal Label
  const handleUpdateStepLabel = (stepIdOrIndex: string | number, newLabel: string) => {
    const updated = approvalChain.map((s) => {
      const match = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
      if (match) {
        return {
          ...s,
          signatoryLabel: newLabel,
          // Preserving actionType: Endorsers always remain 'endorse' so the Endorse button never unselects
          actionType: s.actionType === 'approve' ? 'approve' : 'endorse',
        };
      }
      return s;
    });
    onChange(updated);
  };

  // 9. Reset Stages cleanly
  const handleResetToEmpty = () => {
    setStageConfigs([]);
    onChange([]);
  };

  // Set Action Type (endorse vs approve) for a specific step (Enforcing Single Approver Mutex)
  const handleSetActionType = (stepIdOrIndex: string | number, newAction: 'endorse' | 'approve') => {
    const updatedStages = stages.map((stg) => ({
      ...stg,
      steps: stg.steps.map((s) => {
        const matches = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
        if (matches) {
          return { ...s, actionType: newAction };
        }
        // If setting this step to approve, demote any other existing approver in the pipeline
        if (newAction === 'approve' && s.actionType === 'approve') {
          return { ...s, actionType: 'endorse' as const };
        }
        return s;
      }),
    }));
    reindexChain(updatedStages);
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
            {approvalChain.some((s) => s.actionType === 'endorse' || s.actionType === 'check') && (
              <>
                <span className="text-blue-300 text-[11px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  Endorsement Steps Active
                </span>
                <span className="text-slate-500">•</span>
              </>
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
            const isMandatoryStage = stage.steps.some((s) => {
              const isUserAddedStep = Boolean(s.isUserAdded || s.id?.startsWith('liq_step_'));
              return !isUserAddedStep && isStepConfiguredPermanent(s, pipelineKey, workflowSettings, false);
            });

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
                          <h4 className="font-bold text-slate-800 text-sm">
                            {formatStageTitle(stage.stageIndex, stage.steps.length)}
                          </h4>
                          <span className="text-[11px] font-semibold text-slate-400">
                            ({stage.steps.length} {stage.steps.length === 1 ? 'Signer' : 'Signers'})
                          </span>
                          {isMandatoryStage && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                              <ShieldCheck className="w-3 h-3 text-blue-600" />
                              <span>Institutional Route</span>
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
                      {stages.length > 1 && (
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
                        const matchedSig = activeSignatories.find(
                          (sig) => sig.id === step.signatoryUid || (sig.email && sig.email.toLowerCase() === (step.signatoryEmail || '').toLowerCase())
                        );
                        const isUserAddedStep = Boolean(step.isUserAdded || step.id?.startsWith('liq_step_'));
                        const isStepPermanent = !isUserAddedStep && isStepConfiguredPermanent(step, pipelineKey, workflowSettings, false);
                        const hasApprovalAuth = Boolean(
                          matchedSig?.canApproveLiquidation ||
                          matchedSig?.role === 'school_president' ||
                          matchedSig?.role === 'school_administrator' ||
                          step.role === 'school_president' ||
                          step.role === 'school_administrator' ||
                          (matchedSig?.actionType === 'approver' && matchedSig?.canApproveLiquidation !== false)
                        );
                        const existingApprover = approvalChain.find((s) => s.actionType === 'approve');
                        const pipelineHasOtherApprover = Boolean(
                          existingApprover && (step.id ? existingApprover.id !== step.id : existingApprover.step !== step.step)
                        );
                        const canSignerApprove = hasApprovalAuth && !pipelineHasOtherApprover;

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
                                  {isStepPermanent && (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                                      <Lock className="w-3 h-3 text-amber-600" />
                                      <span>Permanent</span>
                                    </span>
                                  )}
                                  {step.isMandatory && !isStepPermanent && (
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

                            <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0 flex-wrap">
                              {/* Action Type Toggle: Endorse vs Approve */}
                              <div className="flex items-center rounded-lg p-0.5 bg-slate-100 border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => handleSetActionType(step.id || step.step, 'endorse')}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                                    step.actionType !== 'approve'
                                      ? 'bg-[#001A4D] text-[#FFD41C] shadow-2xs'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Endorse
                                </button>
                                <button
                                  type="button"
                                  disabled={!canSignerApprove}
                                  onClick={() => handleSetActionType(step.id || step.step, 'approve')}
                                  title={
                                    !hasApprovalAuth
                                      ? 'This signatory is an Endorser Only for Financial Liquidations and cannot be set as Approver.'
                                      : pipelineHasOtherApprover
                                      ? `Only 1 approver is allowed per pipeline. ${existingApprover?.signatoryName || 'Another signer'} is already the designated Approver.`
                                      : 'Set as Approver'
                                  }
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                                    step.actionType === 'approve'
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : canSignerApprove
                                      ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
                                      : 'text-slate-300 opacity-40 cursor-not-allowed'
                                  }`}
                                >
                                  Approve
                                </button>
                              </div>

                              {/* Dynamic Formal Document Label Selector - Strictly for Endorsers only */}
                              {step.actionType !== 'approve' && (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <select
                                    value={step.signatoryLabel || resolveSignatoryLabel(step, 'liquidation', stepIdx === stage.steps.length - 1)}
                                    onChange={(e) => {
                                      if (e.target.value === '__add_custom_label__') {
                                        setPendingCustomLabelStepId(step.id || step.step);
                                        setIsCustomLabelModalOpen(true);
                                      } else {
                                        handleUpdateStepLabel(step.id || step.step, e.target.value);
                                      }
                                    }}
                                    className="min-w-[170px] sm:min-w-[190px] text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 shadow-2xs hover:border-slate-400 focus:ring-2 focus:ring-[#0E4EBD] focus:border-[#0E4EBD] focus:outline-none cursor-pointer flex-shrink-0 transition-colors"
                                    title="Formal Signatory Document Label"
                                  >
                                    {(() => {
                                      const currentVal = step.signatoryLabel || resolveSignatoryLabel(step, 'liquidation', stepIdx === stage.steps.length - 1);
                                      const hasCurrent = availableLabelOptions.some((opt) => opt.value === currentVal);
                                      return (
                                        <>
                                          {!hasCurrent && currentVal && (
                                            <option key={currentVal} value={currentVal} className="text-xs font-medium py-1">
                                              {currentVal}
                                            </option>
                                          )}
                                          {availableLabelOptions.map((opt) => {
                                            const val = typeof opt === 'string' ? opt : opt.value;
                                            const lbl = typeof opt === 'string' ? opt : opt.label;
                                            return (
                                              <option key={val} value={val} className="text-xs font-medium py-1">
                                                {lbl}
                                              </option>
                                            );
                                          })}
                                          <option value="__add_custom_label__" className="font-bold text-blue-600 bg-blue-50 py-1.5">
                                            + Add Custom Label...
                                          </option>
                                        </>
                                      );
                                    })()}
                                  </select>
                                </div>
                              )}

                              {/* Remove Signatory Button or Lock Indicator */}
                              {isStepPermanent ? (
                                <span
                                  className="p-1.5 rounded-lg text-amber-600 bg-amber-50 border border-amber-200"
                                  title="Permanent Signatory (locked in institutional settings)"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSignatory(step.id || step.step)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Remove signatory from this stage"
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
                            .filter((sig) => {
                              if (sig.isActive === false) return false;
                              if (!isSignatoryApplicableTo(sig, 'liquidation')) return false;
                              const isAlreadyAssigned = approvalChain.some(
                                (s) => s.signatoryUid === sig.id || (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (sig.email || '').toLowerCase())
                              );
                              return !isAlreadyAssigned;
                            })
                            .map((sig) => {
                              const isApprover = Boolean(sig.canApproveLiquidation || sig.role === 'school_president' || sig.role === 'school_administrator');
                              return (
                                <option key={sig.id} value={sig.id}>
                                  {sig.name} — {sig.roleTitle} {sig.department ? `(${sig.department})` : ''} [{isApprover ? 'Approver' : 'Endorser Only'}]
                                </option>
                              );
                            })}
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

      {/* Add Custom Signatory Label Modal */}
      <AddCustomLabelModal
        isOpen={isCustomLabelModalOpen}
        onClose={() => {
          setIsCustomLabelModalOpen(false);
          setPendingCustomLabelStepId(null);
        }}
        onLabelCreated={(newLabel) => {
          if (pendingCustomLabelStepId !== null) {
            handleUpdateStepLabel(pendingCustomLabelStepId, newLabel);
          }
        }}
        existingLabels={availableLabelOptions.map((opt) => (typeof opt === 'string' ? opt : opt.value))}
      />
    </div>
  );
}
