/**
 * src/app/modules/activity-proposals/components/workflow/ProposalFlowBuilder.tsx
 *
 * Interactive visual builder for creating dynamic, multi-stage approval workflows.
 * Allows proposal creators to:
 * - Define sequential stages (Stage 1, Stage 2, Stage 3...)
 * - Add multiple parallel endorsers / approvers into each stage
 * - Toggle actionType between 'endorse' and 'approve'
 * - Auto-suggest stages based on the proposal's target audience
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSignature,
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
  Info,
  ArrowDown,
  Layers,
  RotateCcw,
  UserPlus,
  X,
  Lock,
} from 'lucide-react';
import type { ProposalApprovalStep, ProposalTargetAudience } from '../../types/proposal.types';
import type { InstitutionalSignatory, SignatoryActionType } from '../../../signatories/types/signatory.types';
import { buildDynamicApprovalChain } from '../../utils/proposal-routing';
import {
  subscribeToSasSignatoryConfig,
  DEFAULT_SAS_SIGNATORY_CONFIG,
  type SasSignatoryConfig,
} from '../../../signatories/services/sas-signatory.service';

interface ProposalFlowBuilderProps {
  approvalChain: ProposalApprovalStep[];
  onChange: (newChain: ProposalApprovalStep[]) => void;
  activeSignatories: InstitutionalSignatory[];
  targetAudience?: ProposalTargetAudience;
  creatorName?: string;
  creatorEmail?: string;
  creatorRole?: string;
}

const INITIAL_STAGE_CONFIGS = [
  { stageIndex: 1, stageName: 'Stage 1: Endorsement & Review' },
];

export default function ProposalFlowBuilder({
  approvalChain,
  onChange,
  activeSignatories,
  targetAudience,
  creatorName,
  creatorEmail,
  creatorRole,
}: ProposalFlowBuilderProps) {
  const isOfficerProposal = useMemo(() => {
    if (creatorRole === 'officer') return true;
    if (creatorRole === 'sas_admin' || creatorRole === 'admin') return false;
    const nameLower = (creatorName || '').toLowerCase();
    if (nameLower.includes('student affairs') || nameLower.includes('sas')) return false;
    return true;
  }, [creatorRole, creatorName]);

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
    return INITIAL_STAGE_CONFIGS;
  });

  // Custom signatory inline creation state per stage
  const [addingCustomToStage, setAddingCustomToStage] = useState<number | null>(null);
  const [customSignatory, setCustomSignatory] = useState({
    name: '',
    roleTitle: '',
    email: '',
    department: '',
    actionType: 'endorse' as SignatoryActionType,
  });

  const [sasConfig, setSasConfig] = useState<SasSignatoryConfig>(DEFAULT_SAS_SIGNATORY_CONFIG);

  // Real-time listener for official SAS Signatory Maintenance settings
  useEffect(() => {
    const unsubscribe = subscribeToSasSignatoryConfig((cfg) => {
      setSasConfig(cfg);
    });
    return () => unsubscribe();
  }, []);

  // Lookup SAS signatory in directory if needed for manual suggestions
  const sasSignatory = useMemo(() => {
    return activeSignatories.find(
      (s) =>
        s.role === 'sas_coordinator' ||
        s.role === 'sas_head' ||
        s.department?.toLowerCase().includes('student affairs') ||
        s.department?.toLowerCase().includes('sas') ||
        s.roleTitle?.toLowerCase().includes('student affairs') ||
        s.roleTitle?.toLowerCase().includes('sas')
    );
  }, [activeSignatories]);

  // Auto-initialize default dynamic chain based on target audience if chain is empty or incomplete for officer
  const hasInitializedRef = React.useRef(false);
  useEffect(() => {
    if (!hasInitializedRef.current && activeSignatories.length > 0) {
      const needsInit =
        !approvalChain ||
        approvalChain.length === 0 ||
        (isOfficerProposal &&
          approvalChain.length === 1 &&
          (approvalChain[0].stageIndex === 1 || approvalChain[0].role === 'sas_head'));
      if (needsInit) {
        hasInitializedRef.current = true;
        handleAutoSuggest();
      }
    }
  }, [activeSignatories.length, approvalChain?.length, sasConfig.name, sasConfig.roleTitle]);

  // Synchronize custom stage names or indices from approvalChain into stageConfigs
  React.useEffect(() => {
    if (!approvalChain || approvalChain.length === 0) return;
    setStageConfigs((prev) => {
      const map = new Map<number, string>();
      prev.forEach((p) => map.set(p.stageIndex, p.stageName));
      approvalChain.forEach((step) => {
        const idx = step.stageIndex ?? 1;
        if (!map.has(idx) || (step.stageName && !prev.some((p) => p.stageIndex === idx))) {
          map.set(idx, step.stageName || `Stage ${idx}`);
        }
      });
      const sorted = Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([stageIndex, stageName]) => ({ stageIndex, stageName }));
      return sorted;
    });
  }, [approvalChain]);

  // Group steps by stageIndex using stageConfigs as stage skeleton
  const stages = useMemo(() => {
    const stageMap: Record<number, ProposalApprovalStep[]> = {};
    approvalChain.forEach((step) => {
      const sIdx = step.stageIndex ?? 1;
      if (!stageMap[sIdx]) stageMap[sIdx] = [];
      stageMap[sIdx].push(step);
    });

    const configs = stageConfigs.length > 0 ? stageConfigs : INITIAL_STAGE_CONFIGS;

    return configs.map((c) => ({
      stageIndex: c.stageIndex,
      stageName: c.stageName,
      steps: stageMap[c.stageIndex] || [],
    }));
  }, [approvalChain, stageConfigs]);

  // Validation Checks
  const validation = useMemo(() => {
    const hasApprover = approvalChain.some((s) => s.actionType === 'approve' || s.role === 'school_president');
    const emptyStages = stages.filter((stg) => stg.steps.length === 0);
    const totalSignatories = approvalChain.length;

    return {
      hasApprover,
      emptyStages,
      totalSignatories,
      isValid: hasApprover && totalSignatories > 0,
    };
  }, [approvalChain, stages]);

  // Renumber and rebuild steps helper while preserving stage definitions
  const reindexChain = (
    updatedStages: { stageIndex: number; stageName: string; steps: ProposalApprovalStep[] }[]
  ) => {
    let globalStep = 1;
    const flattened: ProposalApprovalStep[] = [];
    const newConfigs: { stageIndex: number; stageName: string }[] = [];

    let processedStages = [...updatedStages];
    if (processedStages.length === 0) {
      processedStages = [{ stageIndex: 1, stageName: 'Stage 1: Endorsement & Review', steps: [] }];
    }

    processedStages.forEach((stg, stgIdx) => {
      const newStageNumber = stgIdx + 1;
      const stageName = stg.stageName || `Stage ${newStageNumber}: Endorsement & Review`;

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

  // 1. Auto-Suggest from Target Audience (Optional manual helper button)
  const handleAutoSuggest = () => {
    const defaultAudience: ProposalTargetAudience = targetAudience || {
      academicLevels: ['College'],
      departments: ['BSIT'],
      yearLevels: [1, 2, 3, 4],
    };
    const isSasCreator = !isOfficerProposal;

    const suggested = buildDynamicApprovalChain(
      defaultAudience,
      activeSignatories,
      sasConfig,
      isSasCreator
    );
    onChange(suggested);
  };

  // 2. Add New Empty Stage
  const handleAddStage = () => {
    const newStageNumber = stages.length + 1;
    const defaultName = `Stage ${newStageNumber}: Endorsement & Review`;

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

  // 3. Delete Stage
  const handleDeleteStage = (stageIdx: number) => {
    if (stages.length <= 1) return;
    if (isOfficerProposal && stageIdx === 1) {
      alert('Stage 1 (SAS Endorsement) is mandatory for Student Organization proposals and cannot be deleted.');
      return;
    }
    const filtered = stages.filter((s) => s.stageIndex !== stageIdx);
    reindexChain(filtered);
  };

  // 4. Move Stage Up
  const handleMoveStageUp = (stageIndex: number) => {
    if (isOfficerProposal && (stageIndex === 1 || stageIndex === 2)) return;
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
    if (isOfficerProposal && stageIndex === 1) return;
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

  // 7. Add Signatory from Directory to Stage
  const handleAddSignatoryToStage = (stageIndex: number) => {
    const selectedSigId = selectedSignatoryIdPerStage[stageIndex];
    if (!selectedSigId) return;

    const signatory = activeSignatories.find((s) => s.id === selectedSigId);
    if (!signatory) return;

    // Prevent duplicate within the same stage
    const existsInStage = stages
      .find((s) => s.stageIndex === stageIndex)
      ?.steps.some((s) => s.signatoryUid === signatory.id || s.signatoryEmail === signatory.email);

    if (existsInStage) {
      alert(`"${signatory.name}" is already in this stage.`);
      return;
    }

    const rawCap = signatory.actionType || (signatory.role === 'school_president' ? 'approver' : 'endorser');
    let actionType: SignatoryActionType = 'endorse';
    if (rawCap === 'approver' || rawCap === 'approve') {
      actionType = 'approve';
    } else if (rawCap === 'endorser' || rawCap === 'endorse') {
      actionType = 'endorse';
    } else {
      actionType = stageIndex === stages.length ? 'approve' : 'endorse';
    }

    const newStep: ProposalApprovalStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
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

  // 8. Add Custom Signatory from Scratch to Stage
  const handleAddCustomSignatory = (stageIndex: number) => {
    if (!customSignatory.name.trim()) {
      alert("Please enter the signatory's full name.");
      return;
    }
    if (!customSignatory.roleTitle.trim()) {
      alert("Please enter the position / role title.");
      return;
    }
    if (!customSignatory.email.trim()) {
      alert("Please enter a valid email address.");
      return;
    }

    const newStep: ProposalApprovalStep = {
      id: `custom_sig_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      step: approvalChain.length + 1,
      stageIndex,
      stageName: stages.find((s) => s.stageIndex === stageIndex)?.stageName || `Stage ${stageIndex}`,
      role: 'custom_signatory',
      roleTitle: customSignatory.roleTitle.trim(),
      actionType: customSignatory.actionType,
      signatoryUid: '',
      signatoryName: customSignatory.name.trim(),
      signatoryEmail: customSignatory.email.trim(),
      department: customSignatory.department.trim(),
      status: stageIndex === 1 ? 'current' : 'waiting',
    };

    const updatedStages = stages.map((stg) => {
      if (stg.stageIndex === stageIndex) {
        return { ...stg, steps: [...stg.steps, newStep] };
      }
      return stg;
    });

    reindexChain(updatedStages);
    setAddingCustomToStage(null);
    setCustomSignatory({
      name: '',
      roleTitle: '',
      email: '',
      department: '',
      actionType: 'endorse',
    });
  };

  // 9. Remove Signatory from Stage
  const handleRemoveSignatory = (stepIdOrIndex: string | number) => {
    const stepToRemove = approvalChain.find((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    if (
      isOfficerProposal &&
      (stepToRemove?.stageIndex === 1 || stepToRemove?.role === 'sas_head' || stepToRemove?.role === 'sas_coordinator')
    ) {
      alert('Stage 1 SAS Gatekeeper endorsement is mandatory for Student Organization proposals and cannot be removed.');
      return;
    }
    const filtered = approvalChain.filter((s) => (s.id ? s.id !== stepIdOrIndex : s.step !== stepIdOrIndex));
    let globalStep = 1;
    const flattened: ProposalApprovalStep[] = filtered.map((step) => ({
      ...step,
      step: globalStep++,
    }));
    onChange(flattened);
  };

  // 10. Reset Stages to Clean Pipeline
  const handleResetToEmpty = () => {
    if (isOfficerProposal) {
      const defaultAudience: ProposalTargetAudience = targetAudience || {
        academicLevels: ['College'],
        departments: ['BSIT'],
        yearLevels: [1, 2, 3, 4],
      };
      const suggested = buildDynamicApprovalChain(
        defaultAudience,
        activeSignatories,
        sasConfig,
        false
      );
      const stage1Only = suggested.filter((s) => (s.stageIndex ?? 1) === 1);
      setStageConfigs([{ stageIndex: 1, stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement' }]);
      onChange(stage1Only);
      return;
    }
    setStageConfigs(INITIAL_STAGE_CONFIGS);
    onChange([]);
  };

  // 11. Toggle Action Type for a specific Step
  const handleToggleActionType = (stepIdOrIndex: string | number) => {
    const stepTarget = approvalChain.find((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    if (
      isOfficerProposal &&
      (stepTarget?.stageIndex === 1 || stepTarget?.role === 'sas_head' || stepTarget?.role === 'sas_coordinator')
    ) {
      alert('Stage 1 SAS review is strictly an Endorsement action. Final executive approval occurs in Stage 4.');
      return;
    }
    const updated = approvalChain.map((s) => {
      const match = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
      if (match) {
        const nextAction: SignatoryActionType = s.actionType === 'approve' ? 'endorse' : 'approve';
        return { ...s, actionType: nextAction };
      }
      return s;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-5">
      {/* ── TOP HEADER & CONTROLS ── */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Dynamic Signatory & Approval Pipeline
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {stages.length} {stages.length === 1 ? 'Stage' : 'Stages'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Construct your signatory pipeline from scratch. Add stages and assign registered campus heads or custom signatories.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleResetToEmpty}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Clear all assigned signatories and reset pipeline"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Clear Pipeline</span>
            </button>

            <button
              type="button"
              onClick={handleAutoSuggest}
              className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-400/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Automatically generates the 4-stage approval pipeline according to the proposal target audience and database signatories"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>Auto-generate Flow from Audience</span>
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

        {/* Validation / Summary Badges */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-slate-300 text-[11px] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <strong>{validation.totalSignatories}</strong> Total Signatories Assigned
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
        {stages.map((stage, stageIdx) => {
          const isFirstStage = stageIdx === 0;
          const isLastStage = stageIdx === stages.length - 1;
          const selectedSigId = selectedSignatoryIdPerStage[stage.stageIndex] || '';

          return (
            <div key={stage.stageIndex} className="relative">
              {/* Down Arrow Connector between stages */}
              {stageIdx > 0 && (
                <div className="flex items-center justify-center -my-2.5 z-10 relative">
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                    <ArrowDown className="w-3 h-3 text-blue-600" />
                    <span>Once Stage {stageIdx} completes, proceeds to:</span>
                  </div>
                </div>
              )}

              <div className="bg-white border-2 border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 sm:p-5 shadow-xs transition-all">
                {/* Stage Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg text-white font-black text-xs flex items-center justify-center shadow-xs ${
                      isOfficerProposal && stage.stageIndex === 1 ? 'bg-amber-600' : 'bg-blue-600'
                    }`}>
                      {stage.stageIndex}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          value={stage.stageName}
                          onChange={(e) => handleStageNameChange(stage.stageIndex, e.target.value)}
                          placeholder={`Stage ${stage.stageIndex} Title...`}
                          disabled={isOfficerProposal && stage.stageIndex === 1}
                          className={`font-bold text-slate-800 text-sm bg-transparent px-2 py-0.5 rounded border outline-none transition-all max-w-[340px] ${
                            isOfficerProposal && stage.stageIndex === 1
                              ? 'border-transparent cursor-default'
                              : 'border-transparent hover:bg-slate-50 focus:bg-white hover:border-slate-200 focus:border-blue-400'
                          }`}
                        />
                        <span className="text-[11px] font-semibold text-slate-400">
                          ({stage.steps.length} {stage.steps.length === 1 ? 'Signer' : 'Signers'})
                        </span>
                        {isOfficerProposal && stage.stageIndex === 1 && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                            <Lock className="w-3 h-3 text-amber-700" />
                            <span>Mandatory Institutional Gatekeeper</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 px-2 mt-0.5">
                        {isOfficerProposal && stage.stageIndex === 1
                          ? 'Mandatory Stage 1: Voluntarily routes to SAS Admin for official initial vetting and digital endorsement.'
                          : isFirstStage
                          ? 'Initial Stage: Active immediately upon proposal submission.'
                          : `Stage ${stage.stageIndex}: Unlocks after all Stage ${stage.stageIndex - 1} signatories have signed.`}
                      </div>
                    </div>
                  </div>

                  {/* Stage Order & Delete Controls */}
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    {isOfficerProposal && stage.stageIndex === 1 ? (
                      <span className="px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 rounded-lg border border-amber-200 flex items-center gap-1.5 shadow-2xs">
                        <Lock className="w-3 h-3 text-amber-600" />
                        <span>Stage 1 Locked</span>
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isFirstStage || (isOfficerProposal && stage.stageIndex === 2)}
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
                        Assign an institutional officer from the directory or add a custom signatory below.
                      </p>
                    </div>
                  ) : (
                    stage.steps.map((step, stepIdx) => {
                      const isApprover = step.actionType === 'approve' || step.role === 'school_president';
                      const isLockedSasSigner =
                        isOfficerProposal &&
                        (stage.stageIndex === 1 || step.role === 'sas_head' || step.role === 'sas_coordinator');

                      return (
                        <div
                          key={step.id || `${stage.stageIndex}_${stepIdx}`}
                          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                            isLockedSasSigner
                              ? 'bg-amber-50/50 border-amber-200 hover:bg-amber-50/80'
                              : 'bg-slate-50/80 border-slate-200/90 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#001A4D] text-[#FFD41C] font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-xs">
                              {(step.signatoryName || 'S').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-800 text-xs">
                                  {step.signatoryName || 'Unnamed Signatory'}
                                </span>
                                {step.signatoryEmail && (
                                  <span className="text-[11px] text-slate-500 font-normal">
                                    ({step.signatoryEmail})
                                  </span>
                                )}
                                {isLockedSasSigner && (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                    <Lock className="w-2.5 h-2.5 text-amber-700" />
                                    Mandatory SAS Gatekeeper
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-blue-900 font-semibold flex items-center gap-1.5 mt-0.5">
                                <span>{step.roleTitle || 'Signatory'}</span>
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
                            {isLockedSasSigner ? (
                              <div className="px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 bg-blue-50 text-blue-900 border-blue-200 shadow-2xs">
                                <FileSignature className="w-3.5 h-3.5 text-blue-700" />
                                <span>Stage 1 Endorser</span>
                              </div>
                            ) : (
                              <>
                                {/* Role Capability Switch Button */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleActionType(step.id || step.step)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                                    isApprover
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
                                  }`}
                                  title="Click to switch between Endorser and Approver"
                                >
                                  {isApprover ? (
                                    <>
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Approver</span>
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

                                {/* Remove Signatory Button */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSignatory(step.id || step.step)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Remove signatory from this stage"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Add Signatory Controls */}
                  {isOfficerProposal && stage.stageIndex === 1 ? (
                    <div className="pt-2">
                      <div className="p-3 rounded-xl border border-amber-200/90 bg-amber-50/60 flex items-center gap-2.5 text-xs text-amber-900">
                        <Lock className="w-4 h-4 text-amber-700 flex-shrink-0" />
                        <span>
                          <strong>Stage 1 Locked:</strong> Reserved exclusively for Student Affairs & Services (SAS) Gatekeeper endorsement before subsequent academic stages unlock.
                        </span>
                      </div>
                    </div>
                  ) : addingCustomToStage === stage.stageIndex ? (
                    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                          <span>Add Custom Signatory to Stage {stage.stageIndex}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => setAddingCustomToStage(null)}
                          className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Full Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={customSignatory.name}
                            onChange={(e) => setCustomSignatory((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Dr. Jane Doe"
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Position / Role Title <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={customSignatory.roleTitle}
                            onChange={(e) => setCustomSignatory((prev) => ({ ...prev, roleTitle: e.target.value }))}
                            placeholder="e.g. Organization Adviser, Dean"
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Email Address <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="email"
                            value={customSignatory.email}
                            onChange={(e) => setCustomSignatory((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="e.g. jane.doe@ormoc.sti.edu.ph"
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Department / Office (Optional)
                          </label>
                          <input
                            type="text"
                            value={customSignatory.department}
                            onChange={(e) => setCustomSignatory((prev) => ({ ...prev, department: e.target.value }))}
                            placeholder="e.g. Information Technology"
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-700">Authority:</span>
                          <button
                            type="button"
                            onClick={() => setCustomSignatory((prev) => ({ ...prev, actionType: 'endorse' }))}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              customSignatory.actionType === 'endorse'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'bg-white border border-slate-300 text-slate-600'
                            }`}
                          >
                            Endorser
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomSignatory((prev) => ({ ...prev, actionType: 'approve' }))}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              customSignatory.actionType === 'approve'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-white border border-slate-300 text-slate-600'
                            }`}
                          >
                            Approver
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAddingCustomToStage(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCustomSignatory(stage.stageIndex)}
                            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                          >
                            Add Signatory
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <select
                          value={selectedSigId}
                          onChange={(e) =>
                            setSelectedSignatoryIdPerStage((prev) => ({
                              ...prev,
                              [stage.stageIndex]: e.target.value,
                            }))
                          }
                          className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                        >
                          <option value="">+ Choose Registered Signatory from Directory...</option>
                          {activeSignatories
                            .filter((sig) => sig.isActive !== false)
                            .map((sig) => {
                              const capLabel =
                                sig.actionType === 'both'
                                  ? 'Both (Endorser/Approver)'
                                  : sig.actionType === 'approver' || sig.role === 'school_president'
                                  ? 'Approver Only'
                                  : 'Endorser Only';
                              return (
                                <option key={sig.id} value={sig.id}>
                                  {sig.name} — {sig.roleTitle} [{capLabel}]
                                </option>
                              );
                            })}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!selectedSigId}
                          onClick={() => handleAddSignatoryToStage(stage.stageIndex)}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAddingCustomToStage(stage.stageIndex);
                            setCustomSignatory({
                              name: '',
                              roleTitle: '',
                              email: '',
                              department: '',
                              actionType: 'endorse',
                            });
                          }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-300 whitespace-nowrap cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                          <span>+ Custom Person</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
