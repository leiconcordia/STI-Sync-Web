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

const OFFICER_DEFAULT_STAGE_CONFIGS = [
  { stageIndex: 1, stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement' },
  { stageIndex: 2, stageName: 'Stage 2: Department & Program Endorsements' },
  { stageIndex: 3, stageName: 'Stage 3: Academic Affairs Review' },
  { stageIndex: 4, stageName: 'Stage 4: Executive Administration & Approval' },
];

const SAS_DEFAULT_STAGE_CONFIGS = [
  { stageIndex: 1, stageName: 'Stage 1: Department & Program Endorsements' },
  { stageIndex: 2, stageName: 'Stage 2: Academic Affairs Review' },
  { stageIndex: 3, stageName: 'Stage 3: Executive Administration & Approval' },
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

  const defaultConfigs = useMemo(
    () => (isOfficerProposal ? OFFICER_DEFAULT_STAGE_CONFIGS : SAS_DEFAULT_STAGE_CONFIGS),
    [isOfficerProposal]
  );

  const [selectedSignatoryIdPerStage, setSelectedSignatoryIdPerStage] = useState<Record<number, string>>({});
  const [stageConfigs, setStageConfigs] = useState<{ stageIndex: number; stageName: string }[]>(defaultConfigs);
  const [sasConfig, setSasConfig] = useState<SasSignatoryConfig>(DEFAULT_SAS_SIGNATORY_CONFIG);

  // Real-time listener for official SAS Signatory Maintenance settings
  useEffect(() => {
    const unsubscribe = subscribeToSasSignatoryConfig((cfg) => {
      setSasConfig(cfg);
    });
    return () => unsubscribe();
  }, []);

  // Synchronize stageConfigs when isOfficerProposal changes
  React.useEffect(() => {
    setStageConfigs((prev) => {
      if (prev.length === 0) return defaultConfigs;
      return prev;
    });
  }, [defaultConfigs]);

  // Lookup SAS signatory in directory
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

  // Default Stage 1 SAS step - automatically derived from SAS Signatory Maintenance
  const defaultSasStep = useMemo<ProposalApprovalStep>(() => ({
    id: 'step_sas_mandatory',
    step: 1,
    stageIndex: 1,
    stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
    role: 'sas_coordinator',
    roleTitle: sasConfig.roleTitle || sasSignatory?.roleTitle || DEFAULT_SAS_SIGNATORY_CONFIG.roleTitle,
    actionType: 'endorse',
    signatoryUid: sasSignatory?.id || 'sas_coordinator',
    signatoryName: sasConfig.name || sasSignatory?.name || DEFAULT_SAS_SIGNATORY_CONFIG.name,
    signatoryEmail: sasConfig.email || sasSignatory?.email || DEFAULT_SAS_SIGNATORY_CONFIG.email,
    department: sasConfig.department || sasSignatory?.department || DEFAULT_SAS_SIGNATORY_CONFIG.department,
    status: 'current',
  }), [sasConfig, sasSignatory]);

  // Determine if a step is the mandatory SAS step in Stage 1
  const isMandatorySasStep = (step: ProposalApprovalStep): boolean => {
    if (!isOfficerProposal) return false;
    return (
      (step.stageIndex ?? 1) === 1 &&
      (step.id === 'step_sas_mandatory' ||
        step.role === 'sas_coordinator' ||
        step.department?.toLowerCase().includes('student affairs') ||
        step.department?.toLowerCase().includes('sas') ||
        step.signatoryEmail?.toLowerCase().includes('sao@') ||
        step.signatoryName?.toLowerCase().includes('student affairs') ||
        step.signatoryName?.toLowerCase().includes('sas'))
    );
  };

  // Guarantee Stage 1 has the mandatory SAS step and auto-sync official name & position title for officers
  React.useEffect(() => {
    if (!isOfficerProposal) return;
    const sasStepIdx = approvalChain.findIndex(isMandatorySasStep);

    if (sasStepIdx === -1) {
      let gStep = 1;
      const otherSteps = approvalChain.filter((s) => !isMandatorySasStep(s));
      const newChain: ProposalApprovalStep[] = [
        { ...defaultSasStep, step: gStep++ },
        ...otherSteps.map((s) => ({
          ...s,
          step: gStep++,
          stageIndex: s.stageIndex === 1 ? 2 : (s.stageIndex ?? 2),
        })),
      ];
      onChange(newChain);
    } else {
      // Auto-update official SAS name & position title if they differ from SAS Signatory Maintenance
      const existingStep = approvalChain[sasStepIdx];
      const expectedName = sasConfig.name || defaultSasStep.signatoryName;
      const expectedTitle = sasConfig.roleTitle || defaultSasStep.roleTitle;
      const expectedEmail = sasConfig.email || defaultSasStep.signatoryEmail;
      const expectedDept = sasConfig.department || defaultSasStep.department;

      if (
        existingStep.signatoryName !== expectedName ||
        existingStep.roleTitle !== expectedTitle ||
        existingStep.signatoryEmail !== expectedEmail ||
        existingStep.department !== expectedDept
      ) {
        const updatedChain = [...approvalChain];
        updatedChain[sasStepIdx] = {
          ...existingStep,
          signatoryName: expectedName,
          roleTitle: expectedTitle,
          signatoryEmail: expectedEmail,
          department: expectedDept,
        };
        onChange(updatedChain);
      }
    }
  }, [isOfficerProposal, approvalChain, sasConfig, defaultSasStep]);

  // If SAS/Admin is creating the proposal and approvalChain is empty, auto-populate multi-stage routing
  React.useEffect(() => {
    if (!isOfficerProposal && approvalChain.length === 0) {
      const defaultAudience: ProposalTargetAudience = targetAudience || {
        academicLevels: ['College'],
        departments: ['BSIT'],
        yearLevels: [1, 2, 3, 4],
      };
      const suggested = buildDynamicApprovalChain(
        defaultAudience,
        activeSignatories,
        sasSignatory?.name || 'Student Affairs & Services',
        sasSignatory?.email || 'sao@ormoc.sti.edu.ph',
        true // isSasCreator
      );
      if (suggested && suggested.length > 0) {
        onChange(suggested);
      }
    }
  }, [isOfficerProposal, approvalChain.length, targetAudience, activeSignatories, sasSignatory]);

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

    const configs = stageConfigs.length > 0 ? stageConfigs : defaultConfigs;

    return configs.map((c) => ({
      stageIndex: c.stageIndex,
      stageName: c.stageName,
      steps: stageMap[c.stageIndex] || [],
    }));
  }, [approvalChain, stageConfigs, defaultConfigs]);

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

    // For officer proposals, ensure Stage 1 always exists and contains the mandatory SAS step
    if (isOfficerProposal) {
      if (processedStages.length === 0) {
        processedStages = [
          {
            stageIndex: 1,
            stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
            steps: [defaultSasStep],
          },
        ];
      } else {
        const stage1Steps = processedStages[0].steps;
        if (!stage1Steps.some(isMandatorySasStep)) {
          processedStages[0] = {
            ...processedStages[0],
            stageName: processedStages[0].stageName || 'Stage 1: Student Affairs & Services (SAS) Endorsement',
            steps: [defaultSasStep, ...stage1Steps],
          };
        }
      }
    }

    processedStages.forEach((stg, stgIdx) => {
      const newStageNumber = stgIdx + 1;
      const defaultStageTitle =
        newStageNumber === 1
          ? isOfficerProposal
            ? 'Stage 1: Student Affairs & Services (SAS) Endorsement'
            : 'Stage 1: Department & Program Endorsements'
          : newStageNumber === 2
          ? isOfficerProposal
            ? 'Stage 2: Department & Program Endorsements'
            : 'Stage 2: Academic Affairs Review'
          : newStageNumber === 3
          ? isOfficerProposal
            ? 'Stage 3: Academic Affairs Review'
            : 'Stage 3: Executive Administration & Approval'
          : newStageNumber === 4 && isOfficerProposal
          ? 'Stage 4: Executive Administration & Approval'
          : `Stage ${newStageNumber}`;

      const stageName = stg.stageName || defaultStageTitle;

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

  // 1. Auto-Suggest from Target Audience
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
      sasSignatory?.name || 'Student Affairs & Services',
      sasSignatory?.email || 'sao@ormoc.sti.edu.ph',
      isSasCreator
    );
    onChange(suggested);
  };

  // 2. Add New Empty Stage
  const handleAddStage = () => {
    const newStageNumber = stages.length + 1;
    const defaultName =
      newStageNumber === 2
        ? isOfficerProposal
          ? 'Stage 2: Department & Program Endorsements'
          : 'Stage 2: Academic Affairs Review'
        : newStageNumber === 3
        ? isOfficerProposal
          ? 'Stage 3: Academic Affairs Review'
          : 'Stage 3: Executive Administration & Approval'
        : newStageNumber === 4 && isOfficerProposal
        ? 'Stage 4: Executive Administration & Approval'
        : `Stage ${newStageNumber}`;

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
      // Stage 1 (SAS First Gate) cannot be deleted for officers
      return;
    }
    const filtered = stages.filter((s) => s.stageIndex !== stageIdx);
    reindexChain(filtered);
  };

  // 4. Move Stage Up
  const handleMoveStageUp = (stageIndex: number) => {
    const pos = stages.findIndex((s) => s.stageIndex === stageIndex);
    if (pos <= 0) return;
    // For officers, Stage 1 is fixed at position 0, so Stage 2 cannot be moved above Stage 1
    if (isOfficerProposal && pos === 1) {
      return;
    }
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
    // For officers, Stage 1 cannot be moved down (must remain the first gate)
    if (isOfficerProposal && pos === 0) {
      return;
    }
    const reordered = [...stages];
    const temp = reordered[pos + 1];
    reordered[pos + 1] = reordered[pos];
    reordered[pos] = temp;
    reindexChain(reordered);
  };

  // 6. Update Stage Title
  const handleStageNameChange = (stageIndex: number, newName: string) => {
    if (isOfficerProposal && stageIndex === 1) {
      return; // Locked Stage 1 title for officers
    }
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
      // 'both' capability: default to approve if last stage, otherwise endorse
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

    // Clear dropdown selection for this stage
    setSelectedSignatoryIdPerStage((prev) => ({ ...prev, [stageIndex]: '' }));
  };

  // 8. Remove Signatory from Stage (keeps stage container intact)
  const handleRemoveSignatory = (stepIdOrIndex: string | number) => {
    const targetStep = approvalChain.find((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    if (targetStep && isMandatorySasStep(targetStep)) {
      // Prevent deleting the mandatory SAS step
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

  // 9. Reset Stages to Clean Pipeline
  const handleResetToEmpty = () => {
    if (isOfficerProposal) {
      setStageConfigs(OFFICER_DEFAULT_STAGE_CONFIGS);
      onChange([
        {
          ...defaultSasStep,
          step: 1,
          stageIndex: 1,
          stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
          status: 'current',
        },
      ]);
    } else {
      setStageConfigs(SAS_DEFAULT_STAGE_CONFIGS);
      onChange([]);
    }
  };

  // 10. Toggle Action Type for a specific Step (Allowed only if signatory has 'both' capability)
  const handleToggleActionType = (stepIdOrIndex: string | number) => {
    const updated = approvalChain.map((s) => {
      const match = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
      if (match) {
        // Prevent changing mandatory SAS step action
        if (isMandatorySasStep(s)) {
          return s;
        }
        // Verify capability allows switching
        const matchingSig = activeSignatories.find(
          (sig) => sig.id === s.signatoryUid || (sig.email && sig.email.toLowerCase() === s.signatoryEmail?.toLowerCase())
        );
        const rawCap = matchingSig?.actionType || (s.role === 'school_president' ? 'approver' : 'endorser');
        if (rawCap !== 'both') {
          return s; // Locked, cannot switch
        }
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
                {isOfficerProposal && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFD41C]/20 text-[#FFD41C] border border-[#FFD41C]/30">
                    <Lock className="w-2.5 h-2.5" />
                    SAS First Gate Locked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {isOfficerProposal
                  ? 'Stage 1 is the mandatory SAS review gate. Next steps (department heads, deans, academic & executive) can be freely added, modified, or reordered.'
                  : 'Construct the sequential endorsement stages. Signatories within the same stage can sign in parallel.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleResetToEmpty}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
              title={isOfficerProposal ? 'Reset to mandatory Stage 1 SAS gate' : 'Clear all assigned signatories and reset to empty stages'}
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>{isOfficerProposal ? 'Reset to SAS Gate' : 'Clear Names'}</span>
            </button>

            <button
              type="button"
              onClick={handleAutoSuggest}
              className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-400/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
              title="Pre-fills standard signers from your Signatory Directory as a starting draft"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FFD41C]" />
              <span>Pre-fill Registered Signatories</span>
            </button>

            <button
              type="button"
              onClick={handleAddStage}
              className="px-3.5 py-1.5 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] border border-[#FFD41C]/30 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
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
          const isLockedStage1 = isOfficerProposal && stage.stageIndex === 1;
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

              <div className={`bg-white border-2 rounded-2xl p-4 sm:p-5 shadow-xs transition-all ${
                isLockedStage1 ? 'border-blue-300/90 bg-blue-50/10' : 'border-slate-200/90 hover:border-blue-300'
              }`}>
                {/* Stage Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg text-white font-black text-xs flex items-center justify-center shadow-xs ${
                      isLockedStage1 ? 'bg-blue-700' : 'bg-blue-600'
                    }`}>
                      {stage.stageIndex}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          value={stage.stageName}
                          disabled={isLockedStage1}
                          onChange={(e) => handleStageNameChange(stage.stageIndex, e.target.value)}
                          placeholder={`Stage ${stage.stageIndex} Title...`}
                          className={`font-bold text-slate-800 text-sm bg-transparent px-2 py-0.5 rounded border border-transparent outline-none transition-all max-w-[340px] ${
                            isLockedStage1
                              ? 'cursor-not-allowed text-blue-950 font-black'
                              : 'hover:bg-slate-50 focus:bg-white hover:border-slate-200 focus:border-blue-400'
                          }`}
                        />
                        {isLockedStage1 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1 shadow-2xs">
                            <Lock className="w-3 h-3 text-blue-600" />
                            Mandatory First Gate
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-slate-400">
                          ({stage.steps.length} {stage.steps.length === 1 ? 'Signer' : 'Signers'})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 px-2 mt-0.5">
                        {isLockedStage1
                          ? 'Mandatory Gate: Official Student Affairs & Services (SAS) endorsement required before routing to departments.'
                          : isFirstStage
                          ? 'Initial Stage: Active immediately upon proposal submission.'
                          : `Stage ${stage.stageIndex}: Unlocks after all Stage ${stage.stageIndex - 1} signatories have signed.`}
                      </div>
                    </div>
                  </div>

                  {/* Stage Order & Delete Controls */}
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={isFirstStage || (isOfficerProposal && stageIdx === 1)}
                      onClick={() => handleMoveStageUp(stage.stageIndex)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none"
                      title={isOfficerProposal && stageIdx === 1 ? 'Stage 1 (SAS) is fixed as the first gate' : 'Move stage up'}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isLastStage || (isOfficerProposal && stageIdx === 0)}
                      onClick={() => handleMoveStageDown(stage.stageIndex)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none"
                      title={isOfficerProposal && stageIdx === 0 ? 'Stage 1 (SAS) must remain the first endorsement gate' : 'Move stage down'}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {stages.length > 1 && (!isOfficerProposal || stage.stageIndex !== 1) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteStage(stage.stageIndex)}
                        className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 ml-1"
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
                        Please select an institutional officer from the dropdown below to assign to this stage.
                      </p>
                    </div>
                  ) : (
                    stage.steps.map((step, stepIdx) => {
                      const isMandatorySas = isMandatorySasStep(step);
                      const matchingSig = activeSignatories.find(
                        (sig) => sig.id === step.signatoryUid || (sig.email && sig.email.toLowerCase() === step.signatoryEmail?.toLowerCase())
                      );
                      const rawCap = matchingSig?.actionType || (step.role === 'school_president' ? 'approver' : 'endorser');
                      const isStrictApprover = !isMandatorySas && (rawCap === 'approver' || rawCap === 'approve');
                      const isStrictEndorser = isMandatorySas || rawCap === 'endorser' || rawCap === 'endorse';
                      const isApprover = !isMandatorySas && (step.actionType === 'approve' || step.role === 'school_president');

                      return (
                        <div
                          key={step.id || `${stage.stageIndex}_${stepIdx}`}
                          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                            isMandatorySas
                              ? 'bg-blue-50/50 border-blue-200 hover:bg-blue-50/70'
                              : 'bg-slate-50/80 border-slate-200/90 hover:bg-slate-50'
                          }`}
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
                                {isMandatorySas && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold border border-blue-200 flex items-center gap-1 shadow-2xs select-none">
                                    <Lock className="w-2.5 h-2.5 text-blue-600" />
                                    Auto & Locked
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-blue-900 font-semibold flex items-center gap-1.5 mt-0.5">
                                <span className={isMandatorySas ? 'font-extrabold text-[#001A4D]' : ''}>{step.roleTitle}</span>
                                {step.department && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-slate-600">{step.department}</span>
                                  </>
                                )}
                              </div>
                              {isMandatorySas && (
                                <p className="text-[10px] text-blue-700/80 mt-0.5">
                                  Official first-gate authority linked from SAS Signatory Maintenance
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {/* Role Capability Badge or Switch Button */}
                            {isMandatorySas ? (
                              <div
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-blue-50 text-blue-800 border-blue-300 flex items-center gap-1.5 shadow-xs cursor-default select-none"
                                title="Designated First Endorser: Student Affairs & Services (SAS) endorsement required"
                              >
                                <FileSignature className="w-3.5 h-3.5 text-blue-600" />
                                <span>Endorser (Gate 1)</span>
                              </div>
                            ) : isStrictApprover ? (
                              <div
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-300 flex items-center gap-1.5 shadow-xs cursor-default select-none"
                                title="Role locked: This signatory is designated as Approver only"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Approver Only</span>
                              </div>
                            ) : isStrictEndorser ? (
                              <div
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-sky-50 text-sky-800 border-sky-300 flex items-center gap-1.5 shadow-xs cursor-default select-none"
                                title="Role locked: This signatory is designated as Endorser only"
                              >
                                <FileSignature className="w-3.5 h-3.5 text-sky-600" />
                                <span>Endorser Only</span>
                              </div>
                            ) : (
                              /* isBoth: Can switch between Approver and Endorser */
                              <button
                                type="button"
                                onClick={() => handleToggleActionType(step.id || step.step)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all shadow-xs ${
                                  isApprover
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
                                }`}
                                title="Click to switch between Endorser and Approver (Signatory has flexible authority)"
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
                            )}

                            {/* Remove Signatory or Locked Badge */}
                            {isMandatorySas ? (
                              <div
                                className="px-2 py-1 rounded-lg text-[10px] font-bold border bg-blue-100/70 text-blue-800 border-blue-300 flex items-center gap-1 shadow-2xs select-none"
                                title="Mandatory step: Student Affairs & Services (SAS) is the required first endorsement gate and cannot be removed."
                              >
                                <Lock className="w-3 h-3 text-blue-600" />
                                <span>Mandatory (SAS)</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRemoveSignatory(step.id || step.step)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
                        className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
                      >
                        <option value="">+ Choose an Institutional Signatory to Add to Stage {stage.stageIndex}...</option>
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

                    <button
                      type="button"
                      disabled={!selectedSigId}
                      onClick={() => handleAddSignatoryToStage(stage.stageIndex)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
