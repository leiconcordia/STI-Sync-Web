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
import { SIGNATORY_LABEL_OPTIONS, resolveSignatoryLabel, resolveActionTypeFromLabel } from '../../../signatories/utils/signatory-label.utils';
import { useSignatoryLabelsStream } from '../../../signatories/hooks/useSignatoryLabelsStream';
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
import type { ProposalApprovalStep, ProposalTargetAudience, ActivityFundingSource } from '../../types/proposal.types';
import {
  type InstitutionalSignatory,
  type SignatoryActionType,
  isSignatoryApplicableTo,
} from '../../../signatories/types/signatory.types';
import { buildDynamicApprovalChain } from '../../utils/proposal-routing';
import { formatStageTitle, normalizeApprovalStages } from '../../../workflow/utils/stage-normalization.utils';
import {
  subscribeToSasSignatoryConfig,
  DEFAULT_SAS_SIGNATORY_CONFIG,
  type SasSignatoryConfig,
} from '../../../signatories/services/sas-signatory.service';
import {
  getDefaultWorkflowSettings,
  getCachedWorkflowSettings,
  subscribeToDefaultWorkflowSettings,
  isStepConfiguredPermanent,
  type DefaultWorkflowSettings,
} from '../../../workflow/services/approval-workflow.service';

interface ProposalFlowBuilderProps {
  approvalChain: ProposalApprovalStep[];
  onChange: (newChain: ProposalApprovalStep[]) => void;
  activeSignatories: InstitutionalSignatory[];
  targetAudience?: ProposalTargetAudience;
  creatorName?: string;
  creatorEmail?: string;
  creatorRole?: string;
  fundingSource?: ActivityFundingSource;
}

const INITIAL_STAGE_CONFIGS = [
  { stageIndex: 1 },
];

export default function ProposalFlowBuilder({
  approvalChain,
  onChange,
  activeSignatories,
  targetAudience,
  creatorName,
  creatorEmail,
  creatorRole,
  fundingSource,
}: ProposalFlowBuilderProps) {
  const isOfficerProposal = useMemo(() => {
    if (creatorRole === 'officer') return true;
    if (creatorRole === 'sas_admin' || creatorRole === 'admin') return false;
    const nameLower = (creatorName || '').toLowerCase();
    if (nameLower.includes('student affairs') || nameLower.includes('sas')) return false;
    return true;
  }, [creatorRole, creatorName]);

  const [selectedSignatoryIdPerStage, setSelectedSignatoryIdPerStage] = useState<Record<number, string>>({});
  const [stageConfigs, setStageConfigs] = useState<{ stageIndex: number }[]>(() => {
    if (approvalChain && approvalChain.length > 0) {
      const maxIdx = Math.max(1, ...approvalChain.map((s) => s.stageIndex ?? 1));
      return Array.from({ length: maxIdx }, (_, i) => ({ stageIndex: i + 1 }));
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
  const [workflowSettings, setWorkflowSettings] = useState<DefaultWorkflowSettings | null>(() => getCachedWorkflowSettings());
  const { activeLabels } = useSignatoryLabelsStream();

  const availableLabelOptions = useMemo(() => {
    const proposalLabels = activeLabels.filter(
      (l) => !l.applicableDocuments || l.applicableDocuments.includes('proposal')
    );
    if (proposalLabels.length > 0) {
      return proposalLabels.map((l) => ({
        value: l.label,
        label: l.label,
        description: l.description || '',
      }));
    }
    return SIGNATORY_LABEL_OPTIONS;
  }, [activeLabels]);

  useEffect(() => {
    const unsub = subscribeToDefaultWorkflowSettings((settings) => {
      setWorkflowSettings(settings);
    });
    return () => unsub();
  }, []);

  const pipelineKey = isOfficerProposal ? 'adviser_ap' : 'admin_ap';

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

  // Adapt existing approvalChain in real-time to signatory edits and scope changes in database
  useEffect(() => {
    if (!approvalChain || approvalChain.length === 0 || activeSignatories.length === 0) return;

    let modified = false;
    // 1. Purge signatories that are liquidation-only or accountants
    const filteredSteps = approvalChain.filter((step) => {
      // Never filter out fixed Stage 1 SAS for officer proposals
      if (
        isOfficerProposal &&
        (step.stageIndex === 1 || step.role === 'sas_head' || step.role === 'sas_coordinator')
      ) {
        return true;
      }
      const matched = activeSignatories.find(
        (s) =>
          s.id === step.signatoryUid ||
          (s.email && s.email.toLowerCase() === (step.signatoryEmail || '').toLowerCase())
      );
      if (matched && !isSignatoryApplicableTo(matched, 'proposal')) {
        modified = true;
        return false;
      }
      return true;
    });

    // 2. Synchronize edited names, titles, and departments from database
    const updatedSteps = filteredSteps.map((step) => {
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

    if (modified) {
      onChange(updatedSteps);
    }
  }, [activeSignatories, isOfficerProposal]);

  // Synchronize stage counts from approvalChain into stageConfigs
  React.useEffect(() => {
    if (!approvalChain || approvalChain.length === 0) {
      setStageConfigs([{ stageIndex: 1 }]);
      return;
    }
    const normalized = normalizeApprovalStages(approvalChain);
    const isDifferent = normalized.some((ns, idx) => {
      const cur = approvalChain[idx];
      return !cur || cur.stageIndex !== ns.stageIndex || cur.step !== ns.step;
    });
    if (isDifferent) {
      onChange(normalized);
      return;
    }
    const maxIdx = Math.max(1, ...approvalChain.map((s) => s.stageIndex ?? 1));
    setStageConfigs((prev) => {
      const prevMax = prev.length > 0 ? Math.max(...prev.map((p) => p.stageIndex)) : 1;
      const targetCount = Math.max(maxIdx, Math.min(prevMax, maxIdx + 1));
      return Array.from({ length: targetCount }, (_, i) => ({ stageIndex: i + 1 }));
    });
  }, [approvalChain, onChange]);

  // Group steps by stageIndex using contiguous sequential indexing
  const stages = useMemo(() => {
    const maxIndex = Math.max(
      1,
      ...stageConfigs.map((c) => c.stageIndex),
      ...(approvalChain || []).map((s) => s.stageIndex ?? 1)
    );

    const stageMap: Record<number, ProposalApprovalStep[]> = {};
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

  // Renumber and rebuild steps helper while preserving contiguous stage definitions
  const reindexChain = (
    updatedStages: { stageIndex: number; stageName?: string; steps: ProposalApprovalStep[] }[]
  ) => {
    let globalStep = 1;
    const flattened: ProposalApprovalStep[] = [];
    const newConfigs: { stageIndex: number }[] = [];

    let processedStages = [...updatedStages];
    // Strip leading empty stages if subsequent stages have signers
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

  // 1. Audience-Driven Signatory Recommendations (e.g. Senior High School Principal, Department Heads)
  const suggestedSignatories = useMemo(() => {
    if (!targetAudience || activeSignatories.length === 0) return [];

    const isAllStudents =
      targetAudience.allStudents === true ||
      targetAudience.scope === 'all' ||
      (targetAudience.departments || []).some(
        (d) =>
          d.toLowerCase().includes('all students') ||
          d.toLowerCase().includes('campus-wide') ||
          d.toLowerCase().includes('all campus')
      );

    const hasShsAudience =
      (targetAudience.academicLevels || []).includes('SHS') ||
      (targetAudience.departments || []).some(
        (d) =>
          d.toLowerCase().includes('shs') ||
          d.toLowerCase().includes('senior high') ||
          ['stem', 'abm', 'humss', 'tvl', 'gas'].includes(d.toLowerCase().trim())
      ) ||
      (targetAudience.courseCodes || []).some((c) =>
        ['stem', 'abm', 'humss', 'tvl', 'gas'].includes(c.toLowerCase().trim())
      );

    const targetDeptNames = (targetAudience.departments || []).map((d) => d.toLowerCase().trim());
    const targetCourseCodes = (targetAudience.courseCodes || []).map((c) => c.toLowerCase().trim());
    const targetDeptIds = new Set((targetAudience.departmentIds || []).filter(Boolean));

    // Signatories from directory who are applicable to Activity Proposals
    const candidates = activeSignatories.filter((s) => {
      if (s.isActive === false) return false;
      if (!isSignatoryApplicableTo(s, 'proposal')) return false;
      // Do not suggest executive final approvers or SAS head here
      if (['school_president', 'school_administrator', 'sas_head'].includes(s.role)) return false;
      return true;
    });

    const matchedList: InstitutionalSignatory[] = [];

    // Check for SHS Signatory recommendation (e.g. Cybele Nudalo)
    if (hasShsAudience || isAllStudents) {
      const shsSig = candidates.find(
        (s) =>
          s.role === 'shs_principal' ||
          s.department?.toLowerCase().includes('senior high') ||
          s.department?.toLowerCase().includes('shs') ||
          s.roleTitle?.toLowerCase().includes('principal') ||
          s.roleTitle?.toLowerCase().includes('senior high') ||
          s.name?.toLowerCase().includes('cybele')
      );
      if (shsSig && !matchedList.some((m) => m.id === shsSig.id)) {
        matchedList.push(shsSig);
      }
    }

    // Check for Department Head recommendations (e.g. BSIT Program Head)
    candidates.forEach((s) => {
      if (matchedList.some((m) => m.id === s.id)) return;
      const deptName = (s.department || '').toLowerCase().trim();
      const roleTitle = (s.roleTitle || '').toLowerCase().trim();

      if (isAllStudents) {
        if (s.department && !['institutional', 'campus-wide', 'academic affairs', 'finance'].includes(deptName)) {
          matchedList.push(s);
        }
        return;
      }

      if (s.departmentId && targetDeptIds.has(s.departmentId)) {
        matchedList.push(s);
        return;
      }

      if (targetDeptNames.some((td) => deptName.includes(td) || td.includes(deptName))) {
        matchedList.push(s);
        return;
      }

      if (targetCourseCodes.some((cc) => deptName.includes(cc) || roleTitle.includes(cc))) {
        matchedList.push(s);
        return;
      }
    });

    // Invariant: "just a suggestion and after I add that person in any step I inserted the suggestion will be removed."
    // Exclude any signatory that is already present anywhere in the approvalChain!
    return matchedList.filter((candidate) => {
      const isAlreadyInChain = approvalChain.some(
        (step) =>
          (step.signatoryUid && step.signatoryUid === candidate.id) ||
          (step.signatoryEmail && candidate.email && step.signatoryEmail.toLowerCase() === candidate.email.toLowerCase()) ||
          (step.signatoryName && candidate.name && step.signatoryName.trim().toLowerCase() === candidate.name.trim().toLowerCase())
      );
      return !isAlreadyInChain;
    });
  }, [activeSignatories, targetAudience, approvalChain]);

  // Handler to manually insert suggested signatory into selected stage
  const handleAddSuggestedSignatory = (signatory: InstitutionalSignatory, targetStageIndex?: number) => {
    const stageIdx = targetStageIndex || (isOfficerProposal ? 2 : 1);

    const existsInChain = approvalChain.some(
      (s) =>
        s.signatoryUid === signatory.id ||
        (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (signatory.email || '').toLowerCase()) ||
        (s.signatoryName && s.signatoryName.trim().toLowerCase() === (signatory.name || '').trim().toLowerCase())
    );

    if (existsInChain) {
      alert(`"${signatory.name}" is already assigned to this proposal's approval pipeline.`);
      return;
    }

    const rawCap = signatory.actionType || (signatory.role === 'school_president' ? 'approver' : 'endorser');
    let actionType: SignatoryActionType = 'endorse';
    if (rawCap === 'approver' || rawCap === 'approve') {
      actionType = 'approve';
    } else if (rawCap === 'endorser' || rawCap === 'endorse') {
      actionType = 'endorse';
    } else {
      actionType = stageIdx === stages.length ? 'approve' : 'endorse';
    }

    const targetStage = stages.find((s) => s.stageIndex === stageIdx);

    const newStep: ProposalApprovalStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      step: approvalChain.length + 1,
      stageIndex: stageIdx,
      stageName: targetStage?.stageName || `Stage ${stageIdx}`,
      role: signatory.role || '',
      roleTitle: signatory.roleTitle || 'Institutional Signatory',
      actionType,
      signatoryUid: signatory.id || (signatory as any).uid || '',
      signatoryName: signatory.name || '',
      signatoryEmail: signatory.email || '',
      department: signatory.department || '',
      status: stageIdx === 1 ? 'current' : 'waiting',
    };

    let updatedStages = [...stages];
    const stageExists = updatedStages.some((stg) => stg.stageIndex === stageIdx);
    if (!stageExists) {
      updatedStages.push({
        stageIndex: stageIdx,
        stageName: formatStageTitle(stageIdx, 1),
        steps: [newStep],
      });
      updatedStages.sort((a, b) => a.stageIndex - b.stageIndex);
    } else {
      updatedStages = updatedStages.map((stg) => {
        if (stg.stageIndex === stageIdx) {
          return { ...stg, steps: [...stg.steps, newStep] };
        }
        return stg;
      });
    }

    reindexChain(updatedStages);
  };

  // 1. Auto-Suggest from Target Audience & Institutional Pipeline Settings
  const handleAutoSuggest = async () => {
    const defaultAudience: ProposalTargetAudience = targetAudience || {
      academicLevels: ['College'],
      departments: ['BSIT'],
      yearLevels: [1, 2, 3, 4],
    };
    const isSasCreator = !isOfficerProposal;

    let workflowSettings: any;
    try {
      workflowSettings = await getDefaultWorkflowSettings();
    } catch {
      workflowSettings = getCachedWorkflowSettings();
    }

    const pipelineKey = isSasCreator ? 'admin_ap' : 'adviser_ap';
    let configuredTemplate = workflowSettings ? workflowSettings[pipelineKey] : undefined;

    const hasAssignedSigners = (steps?: any[]) =>
      Array.isArray(steps) && steps.some((s) => Boolean(s.signatoryUid || s.signatoryName));

    if (!hasAssignedSigners(configuredTemplate)) {
      const alternateKey = isSasCreator ? 'adviser_ap' : 'admin_ap';
      if (hasAssignedSigners(workflowSettings?.[alternateKey])) {
        configuredTemplate = workflowSettings?.[alternateKey];
      }
    }

    if (configuredTemplate && configuredTemplate.length > 0) {
      const chain: ProposalApprovalStep[] = [];
      const usedIds = new Set<string>();

      configuredTemplate.forEach((tpl: any, idx: number) => {
        let matched = activeSignatories.find(
          (s) =>
            (tpl.signatoryUid && s.id === tpl.signatoryUid) ||
            (tpl.signatoryEmail && s.email && s.email.toLowerCase() === tpl.signatoryEmail.toLowerCase())
        );

        if (!matched && tpl.role) {
          matched = activeSignatories.find(
            (s) => !usedIds.has(s.id) && (s.role === tpl.role || s.roleTitle?.toLowerCase() === tpl.roleTitle?.toLowerCase())
          );
        }

        if (tpl.role === 'sas_head' && !matched) {
          matched = {
            id: sasConfig.employeeId || 'sas_admin',
            name: sasConfig.name || 'Student Affairs & Services Head',
            email: sasConfig.email || 'sao@ormoc.sti.edu.ph',
            role: 'sas_head' as any,
            roleTitle: sasConfig.roleTitle || 'Student Affairs & Services Head',
            department: sasConfig.department || 'Student Affairs & Services',
            isActive: true,
            isPermanentSigner: true,
            applicableScope: 'all',
            actionType: 'approver',
          };
        }

        if (matched) usedIds.add(matched.id);

        const resolvedUid = matched?.id || tpl.signatoryUid || `prop_step_${Date.now()}_${idx + 1}`;
        const resolvedName = matched?.name || tpl.signatoryName || tpl.roleTitle || 'Institutional Signatory';
        const resolvedEmail = matched?.email || tpl.signatoryEmail || '';
        const resolvedRole = matched?.role || tpl.role || 'signatory';
        const resolvedRoleTitle = matched?.roleTitle || tpl.roleTitle || 'Institutional Signatory';
        const resolvedDept = matched?.department || tpl.department || '';
        const isPermanent = Boolean(tpl.isPermanent);
        const isMandatory = Boolean(tpl.isMandatory || isPermanent);

        chain.push({
          id: tpl.id || `prop_step_${idx + 1}`,
          step: idx + 1,
          stageIndex: tpl.stageIndex || 1,
          stageName: tpl.stageName || `Stage ${tpl.stageIndex || 1}`,
          role: resolvedRole,
          roleTitle: resolvedRoleTitle,
          actionType: tpl.actionType || 'endorse',
          signatoryUid: resolvedUid,
          signatoryName: resolvedName,
          signatoryEmail: resolvedEmail,
          department: resolvedDept,
          status: (tpl.stageIndex || 1) === 1 ? 'current' : 'waiting',
          isMandatory,
          isPermanent,
        });
      });

      if (chain.length > 0) {
        onChange(normalizeApprovalStages(chain));
        return;
      }
    }

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
    const newStages = [
      ...stages,
      {
        stageIndex: newStageNumber,
        steps: [],
      },
    ];
    reindexChain(newStages);
  };

  // 3. Delete Stage
  const handleDeleteStage = (stageIdx: number) => {
    if (stages.length <= 1) return;
    const targetStage = stages.find((s) => s.stageIndex === stageIdx);
    const hasPermanentSigner = targetStage?.steps.some((step) => {
      const isUserAddedStep = Boolean(
        step.isUserAdded ||
        step.id?.startsWith('prop_step_') ||
        step.id?.startsWith('custom_sig_') ||
        step.id?.startsWith('custom_')
      );
      return !isUserAddedStep && (isStepConfiguredPermanent(step, pipelineKey, workflowSettings, isOfficerProposal) || step.role === 'sas_head');
    });
    if (hasPermanentSigner) {
      alert('This stage contains permanent signatories that cannot be removed. You can rearrange this stage up or down, but cannot delete it.');
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

  // 5b. Move Signatory Up or Down within or across stages
  const handleMoveSignatory = (stepIdOrIndex: string | number, direction: 'up' | 'down') => {
    const idx = approvalChain.findIndex((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    if (idx === -1) return;

    const currentStep = approvalChain[idx];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= approvalChain.length) return;

    const targetStep = approvalChain[targetIdx];
    const updatedCurrent = {
      ...currentStep,
      stageIndex: targetStep.stageIndex,
    };

    const newChain = [...approvalChain];
    newChain[idx] = targetStep;
    newChain[targetIdx] = updatedCurrent;
    onChange(normalizeApprovalStages(newChain));
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

    if (!isSignatoryApplicableTo(signatory, 'proposal')) {
      alert(`"${signatory.name}" (${signatory.roleTitle}) is designated for Financial Liquidations only and cannot be added to Activity Proposals.`);
      return;
    }

    // Prevent duplicate anywhere in the workflow chain
    const existsInChain = approvalChain.some(
      (s) =>
        s.signatoryUid === signatory.id ||
        (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (signatory.email || '').toLowerCase())
    );

    if (existsInChain) {
      alert(`"${signatory.name}" is already assigned to this proposal's approval pipeline.`);
      return;
    }

    const canApprove = Boolean(
      signatory.canApproveProposal ||
      signatory.role === 'school_president' ||
      signatory.role === 'school_administrator' ||
      signatory.actionType === 'approver'
    );
    const actionType: SignatoryActionType = canApprove ? 'approve' : 'endorse';

    const newStep: ProposalApprovalStep = {
      id: `prop_step_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
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
      isMandatory: false,
      isPermanent: false,
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
      isMandatory: false,
      isPermanent: false,
      isUserAdded: true,
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
    const isUserAddedStep = Boolean(
      stepToRemove?.isUserAdded ||
      stepToRemove?.id?.startsWith('prop_step_') ||
      stepToRemove?.id?.startsWith('custom_sig_') ||
      stepToRemove?.id?.startsWith('custom_')
    );
    if (
      !isUserAddedStep &&
      isOfficerProposal &&
      (stepToRemove?.role === 'sas_head' || stepToRemove?.role === 'sas_coordinator')
    ) {
      alert('SAS Gatekeeper endorsement is mandatory for Student Organization proposals and cannot be removed.');
      return;
    }
    if (!isUserAddedStep && stepToRemove && isStepConfiguredPermanent(stepToRemove, pipelineKey, workflowSettings, isOfficerProposal)) {
      alert(`"${stepToRemove?.signatoryName || stepToRemove?.roleTitle}" is designated as a Permanent Signatory in institutional settings and cannot be removed.`);
      return;
    }
    const filtered = approvalChain.filter((s) => (s.id ? s.id !== stepIdOrIndex : s.step !== stepIdOrIndex));
    let globalStep = 1;
    const flattened: ProposalApprovalStep[] = filtered.map((step) => ({
      ...step,
      step: globalStep++,
    }));
    const normalized = normalizeApprovalStages(flattened);
    const maxStage = Math.max(1, ...normalized.map((s) => s.stageIndex ?? 1));
    setStageConfigs(Array.from({ length: maxStage }, (_, i) => ({ stageIndex: i + 1 })));
    onChange(normalized);
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

  // Update Signatory Formal Label
  const handleUpdateStepLabel = (stepIdOrIndex: string | number, newLabel: string) => {
    const labelDoc = activeLabels.find((l) => l.label === newLabel);
    const resolvedAction = labelDoc
      ? labelDoc.actionType
      : (resolveActionTypeFromLabel(newLabel) as SignatoryActionType);

    const updated = approvalChain.map((s) => {
      const match = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
      if (match) {
        return {
          ...s,
          signatoryLabel: newLabel,
          actionType: resolvedAction,
        };
      }
      return s;
    });
    onChange(updated);
  };

  // 11. Set Action Type for a specific Step
  const handleSetActionType = (stepIdOrIndex: string | number, newAction: SignatoryActionType) => {
    const stepTarget = approvalChain.find((s) => (s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex));
    if (
      isOfficerProposal &&
      newAction === 'approve' &&
      (stepTarget?.stageIndex === 1 || stepTarget?.role === 'sas_head' || stepTarget?.role === 'sas_coordinator')
    ) {
      alert('Stage 1 SAS review is strictly an Endorsement action. Final executive approval occurs in Stage 4.');
      return;
    }
    const updated = approvalChain.map((s) => {
      const match = s.id ? s.id === stepIdOrIndex : s.step === stepIdOrIndex;
      if (match) {
        return { ...s, actionType: newAction };
      }
      return s;
    });
    onChange(updated);
  };

  // 12. Toggle Action Type for a specific Step
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

      {/* ── AUDIENCE-DRIVEN SUGGESTED SIGNATORIES BANNER ── */}
      {suggestedSignatories.length > 0 && (
        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 sm:p-4.5 shadow-xs flex flex-col gap-2.5 transition-all">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-950 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Suggested Signatory</span>
            </div>
            <span className="text-[11px] text-amber-900 font-semibold bg-amber-200/60 border border-amber-300 px-2.5 py-0.5 rounded-full">
              Audience-Driven Recommendation
            </span>
          </div>

          <p className="text-xs text-amber-950 font-medium">
            Based on the selected target audience, the following signatory is recommended to sign this proposal:
          </p>

          <div className="flex flex-wrap gap-2.5 pt-0.5">
            {suggestedSignatories.map((sig) => (
              <div
                key={sig.id}
                className="inline-flex items-center gap-2.5 px-3 py-1.5 bg-white border border-amber-300 rounded-xl shadow-2xs text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-bold text-slate-900">{sig.name}</span>
                  <span className="text-slate-500 font-medium text-[11px]">
                    ({sig.department || 'SHS'} — {sig.roleTitle})
                  </span>
                </div>

                <div className="flex items-center gap-1 pl-2 border-l border-amber-200">
                  {stages.map((stg) => (
                    <button
                      key={stg.stageIndex}
                      type="button"
                      onClick={() => handleAddSuggestedSignatory(sig, stg.stageIndex)}
                      className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer shadow-2xs"
                      title={`Insert ${sig.name} into ${stg.stageName}`}
                    >
                      + Stage {stg.stageIndex}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-amber-800/80 italic">
            You can click "+ Stage X" above to quickly insert them into any stage, or manually select them from any stage's dropdown below. Once added to any step in the flow, this recommendation will be automatically removed.
          </p>
        </div>
      )}

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
                        <h4 className="font-bold text-slate-800 text-sm">
                          {formatStageTitle(stage.stageIndex, stage.steps.length)}
                        </h4>
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
                    <button
                      type="button"
                      disabled={isFirstStage}
                      onClick={() => handleMoveStageUp(stage.stageIndex)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                      title="Move stage up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isLastStage}
                      onClick={() => handleMoveStageDown(stage.stageIndex)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:pointer-events-none cursor-pointer transition-colors"
                      title="Move stage down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {stages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteStage(stage.stageIndex)}
                        className="p-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-600 ml-1 cursor-pointer transition-colors"
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
                        Assign an institutional officer from the directory or add a custom signatory below.
                      </p>
                    </div>
                  ) : (
                    stage.steps.map((step, stepIdx) => {
                      const isApprover = step.actionType === 'approve' || step.role === 'school_president';
                      const matchedSig = activeSignatories.find(
                        (s) => s.id === step.signatoryUid || (s.email && s.email.toLowerCase() === (step.signatoryEmail || '').toLowerCase())
                      );
                      const isApplicableToProposal = matchedSig ? isSignatoryApplicableTo(matchedSig, 'proposal') : true;
                      const isUserAddedStep = Boolean(
                        step.isUserAdded ||
                        step.id?.startsWith('prop_step_') ||
                        step.id?.startsWith('custom_sig_') ||
                        step.id?.startsWith('custom_')
                      );
                      const isPermanentSigner = !isUserAddedStep && isStepConfiguredPermanent(step, pipelineKey, workflowSettings, isOfficerProposal);
                      const isBuiltinFixedSasSigner = Boolean(
                        !isUserAddedStep &&
                        isOfficerProposal &&
                        (step.role === 'sas_head' || step.role === 'sas_coordinator')
                      );
                      const isLockedSigner = isBuiltinFixedSasSigner || isPermanentSigner;

                      const canSignerApprove = Boolean(
                        matchedSig?.canApproveProposal ||
                        matchedSig?.role === 'school_president' ||
                        matchedSig?.role === 'school_administrator' ||
                        step.role === 'school_president' ||
                        step.role === 'school_administrator' ||
                        isUserAddedStep
                      );

                      return (
                        <div
                          key={step.id || `${stage.stageIndex}_${stepIdx}`}
                          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                            isLockedSigner
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
                                {isBuiltinFixedSasSigner ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                    <Lock className="w-2.5 h-2.5 text-amber-700" />
                                    Fixed Built-in SAS Gatekeeper
                                  </span>
                                ) : isPermanentSigner ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                    <Lock className="w-2.5 h-2.5 text-amber-700" />
                                    Permanent Required Signer
                                  </span>
                                ) : null}
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

                          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                            {/* Action Type Toggle (Endorse vs Approve) */}
                            <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-300 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleSetActionType(step.id || step.step, 'endorse')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                  step.actionType === 'endorse'
                                    ? 'bg-sky-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                              >
                                Endorse
                              </button>
                              <button
                                type="button"
                                disabled={!canSignerApprove}
                                onClick={() => handleSetActionType(step.id || step.step, 'approve')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  !canSignerApprove ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                  step.actionType === 'approve'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                                title={!canSignerApprove ? 'This signatory does not have approval authority for Activity Proposals' : 'Designate as executive Approver'}
                              >
                                Approve
                              </button>
                            </div>

                            {/* Dynamic Formal Document Label Selector */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <select
                                value={step.signatoryLabel || resolveSignatoryLabel(step, 'proposal', stepIdx === stage.steps.length - 1)}
                                onChange={(e) => handleUpdateStepLabel(step.id || step.step, e.target.value)}
                                className="min-w-[170px] sm:min-w-[190px] text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 shadow-2xs hover:border-slate-400 focus:ring-2 focus:ring-[#0E4EBD] focus:border-[#0E4EBD] focus:outline-none cursor-pointer flex-shrink-0 transition-colors"
                                title="Formal Signatory Document Label"
                              >
                                {(() => {
                                  const currentVal = step.signatoryLabel || resolveSignatoryLabel(step, 'proposal', stepIdx === stage.steps.length - 1);
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
                                    </>
                                  );
                                })()}
                              </select>
                            </div>

                            {/* Signatory Order Controls */}
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                disabled={approvalChain.findIndex((s) => (s.id ? s.id === step.id : s.step === step.step)) === 0}
                                onClick={() => handleMoveSignatory(step.id || step.step, 'up')}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:pointer-events-none rounded hover:bg-slate-200/60 transition-colors"
                                title="Move signatory up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={approvalChain.findIndex((s) => (s.id ? s.id === step.id : s.step === step.step)) === approvalChain.length - 1}
                                onClick={() => handleMoveSignatory(step.id || step.step, 'down')}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:pointer-events-none rounded hover:bg-slate-200/60 transition-colors"
                                title="Move signatory down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {isLockedSigner ? (
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
                                className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
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

                  {/* Add Signatory Controls */}
                  {addingCustomToStage === stage.stageIndex ? (
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
                            .filter((sig) => {
                              if (sig.isActive === false) return false;
                              if (!isSignatoryApplicableTo(sig, 'proposal')) return false;
                              // Exclude if already assigned to any stage in this approval workflow
                              const isAlreadyAssigned = approvalChain.some(
                                (s) => s.signatoryUid === sig.id || (s.signatoryEmail && s.signatoryEmail.toLowerCase() === (sig.email || '').toLowerCase())
                              );
                              return !isAlreadyAssigned;
                            })
                            .map((sig) => {
                              const canApprove = Boolean(
                                sig.canApproveProposal ||
                                sig.role === 'school_president' ||
                                sig.role === 'school_administrator'
                              );
                              const capLabel = canApprove ? 'Approver' : 'Endorser Only';

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
