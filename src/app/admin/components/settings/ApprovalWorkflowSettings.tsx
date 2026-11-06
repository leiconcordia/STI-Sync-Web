/**
 * src/app/admin/components/settings/ApprovalWorkflowSettings.tsx
 *
 * Dedicated administrative configuration studio for institutional approval pipelines.
 * Configures default workflow templates for:
 * - Adviser / Club Pipelines: AP, FL, and PAR
 * - Admin / SAS Pipelines: AP, FL, and PAR
 *
 * Features:
 * - Multi-stage pipeline builder (Stages & sequential/parallel steps)
 * - Signatory selection strictly filtered by document scope (AP vs FL vs PAR)
 * - Signatory Authority Capability enforcement (Endorser vs Approver vs Both)
 * - Dynamic Department Signatory placeholder flag for Activity Proposals (SHS / Program Heads)
 * - Firestore persistence with Dirty State tracking & Reset to Default
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  GitBranch,
  ShieldCheck,
  FileSignature,
  FileSpreadsheet,
  FileCheck2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Building,
  User,
  SlidersHorizontal,
  Info,
  Users,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type DefaultWorkflowSettings,
  type WorkflowPipelineKey,
  type WorkflowStepTemplate,
  WORKFLOW_PIPELINES_META,
} from '../../../modules/workflow/types/approval-workflow.types';
import {
  getDefaultWorkflowSettings,
  saveDefaultWorkflowSettings,
  resetWorkflowPipeline,
  getBuiltinDefaultWorkflow,
} from '../../../modules/workflow/services/approval-workflow.service';
import {
  subscribeToSignatories,
} from '../../../modules/signatories/services/signatory.service';
import {
  type InstitutionalSignatory,
  type WorkflowDocumentType,
  isSignatoryApplicableTo,
  getSignatoryAuthorizedWorkflows,
} from '../../../modules/signatories/types/signatory.types';
import { useAdviserProfile } from '../../../modules/auth';

export default function ApprovalWorkflowSettings() {
  const { profile } = useAdviserProfile();

  const [activeGroup, setActiveGroup] = useState<'adviser' | 'admin'>('adviser');
  const [activeDoc, setActiveDoc] = useState<'proposal' | 'liquidation' | 'par'>('proposal');

  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);
  const [loadingSignatories, setLoadingSignatories] = useState(true);

  const [settings, setSettings] = useState<DefaultWorkflowSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Active pipeline key derived from tab selections
  const activePipelineKey: WorkflowPipelineKey = useMemo(() => {
    const docShort = activeDoc === 'proposal' ? 'ap' : activeDoc === 'liquidation' ? 'fl' : 'par';
    return `${activeGroup}_${docShort}` as WorkflowPipelineKey;
  }, [activeGroup, activeDoc]);

  // Active metadata description
  const activeMeta = useMemo(() => {
    return WORKFLOW_PIPELINES_META.find((m) => m.key === activePipelineKey)!;
  }, [activePipelineKey]);

  // Subscribe to Institutional Signatories database
  useEffect(() => {
    const unsub = subscribeToSignatories((list) => {
      setSignatories(list);
      setLoadingSignatories(false);
    });
    return () => unsub();
  }, []);

  // Fetch workflow settings on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingSettings(true);
      const data = await getDefaultWorkflowSettings();
      if (mounted) {
        setSettings(data);
        setLoadingSettings(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Filter available signatories strictly by the current document type
  const eligibleSignatories = useMemo(() => {
    return signatories.filter((s) => s.isActive !== false && isSignatoryApplicableTo(s, activeDoc));
  }, [signatories, activeDoc]);

  // Current working steps for active pipeline
  const currentSteps: WorkflowStepTemplate[] = useMemo(() => {
    if (!settings) return [];
    return settings[activePipelineKey] || [];
  }, [settings, activePipelineKey]);

  // Update working steps in local state
  const handleUpdateSteps = (newSteps: WorkflowStepTemplate[]) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [activePipelineKey]: newSteps,
    });
  };

  // Group steps by stageIndex
  const stages = useMemo(() => {
    const map = new Map<number, { stageIndex: number; stageName: string; steps: WorkflowStepTemplate[] }>();
    currentSteps.forEach((step) => {
      const idx = step.stageIndex || 1;
      if (!map.has(idx)) {
        map.set(idx, {
          stageIndex: idx,
          stageName: step.stageName || `Stage ${idx}`,
          steps: [],
        });
      }
      map.get(idx)!.steps.push(step);
    });

    return Array.from(map.values()).sort((a, b) => a.stageIndex - b.stageIndex);
  }, [currentSteps]);

  // Validation: Check if there is an executive approver
  const hasApprover = useMemo(() => {
    return currentSteps.some((s) => s.actionType === 'approve' || s.role === 'school_president');
  }, [currentSteps]);

  // ── Stage & Step Handlers ──

  const handleAddStage = () => {
    const nextStageIdx = stages.length > 0 ? Math.max(...stages.map((s) => s.stageIndex)) + 1 : 1;
    const newStep: WorkflowStepTemplate = {
      id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      step: currentSteps.length + 1,
      stageIndex: nextStageIdx,
      stageName: `Stage ${nextStageIdx}: Review & Endorsement`,
      role: 'program_head',
      roleTitle: 'Department Head',
      actionType: 'endorse',
      department: 'Academic Department',
      isMandatory: true,
    };
    handleUpdateSteps([...currentSteps, newStep]);
    toast.info(`Added Stage ${nextStageIdx}`);
  };

  const handleUpdateStageName = (stageIndex: number, newName: string) => {
    const updated = currentSteps.map((step) => {
      if (step.stageIndex === stageIndex) {
        return { ...step, stageName: newName };
      }
      return step;
    });
    handleUpdateSteps(updated);
  };

  const handleDeleteStage = (stageIndex: number) => {
    if (stages.length <= 1) {
      toast.error('Workflow must maintain at least one stage.');
      return;
    }
    const filtered = currentSteps.filter((step) => step.stageIndex !== stageIndex);
    // Renumber remaining stages consecutively
    const uniqueRemaining = Array.from(new Set(filtered.map((s) => s.stageIndex))).sort((a, b) => a - b);
    const renumbered = filtered.map((step) => {
      const newStageIndex = uniqueRemaining.indexOf(step.stageIndex) + 1;
      return {
        ...step,
        stageIndex: newStageIndex,
        stageName: step.stageName.replace(/Stage \d+:/, `Stage ${newStageIndex}:`),
      };
    });
    handleUpdateSteps(renumbered);
    toast.success(`Stage removed.`);
  };

  const handleAddStepToStage = (stageIndex: number) => {
    const targetStage = stages.find((s) => s.stageIndex === stageIndex);
    const stageName = targetStage?.stageName || `Stage ${stageIndex}`;

    // Find next eligible signatory not yet used anywhere in this workflow
    const usedIds = new Set(
      currentSteps.map((s) => s.signatoryUid).filter(Boolean)
    );
    const availableSigner = eligibleSignatories.find((s) => !usedIds.has(s.id));

    const newStep: WorkflowStepTemplate = {
      id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      step: currentSteps.length + 1,
      stageIndex,
      stageName,
      signatoryUid: availableSigner?.id,
      signatoryName: availableSigner?.name,
      signatoryEmail: availableSigner?.email,
      role: availableSigner?.role || 'program_head',
      roleTitle: availableSigner?.roleTitle || 'Program Head',
      actionType: availableSigner?.actionType === 'approver' ? 'approve' : 'endorse',
      department: availableSigner?.department || 'Academic Department',
      departmentId: availableSigner?.departmentId,
      isMandatory: true,
    };

    handleUpdateSteps([...currentSteps, newStep]);
  };

  const handleUpdateStep = (stepId: string, updates: Partial<WorkflowStepTemplate>) => {
    const updated = currentSteps.map((step) => {
      if (step.id === stepId) {
        return { ...step, ...updates };
      }
      return step;
    });
    handleUpdateSteps(updated);
  };

  const handleDeleteStep = (stepId: string) => {
    if (currentSteps.length <= 1) {
      toast.error('Workflow must maintain at least one step.');
      return;
    }
    const filtered = currentSteps.filter((s) => s.id !== stepId);
    handleUpdateSteps(filtered);
  };

  const handleSelectSignatoryForStep = (stepId: string, sigId: string) => {
    if (!sigId) {
      handleUpdateStep(stepId, {
        signatoryUid: undefined,
        signatoryName: undefined,
        signatoryEmail: undefined,
      });
      return;
    }

    // Strict no-duplicate validation: ensure signatory is not in any other step
    const alreadyUsed = currentSteps.some((s) => s.id !== stepId && s.signatoryUid === sigId);
    if (alreadyUsed) {
      toast.error('This signatory is already assigned to another stage in this pipeline. Duplicate signers are not allowed.');
      return;
    }

    const sig = signatories.find((s) => s.id === sigId);
    if (!sig) return;

    // Enforce action capability based on document authorization
    const canApprove = Boolean(
      activeDoc === 'proposal'
        ? sig.canApproveProposal
        : activeDoc === 'liquidation'
        ? sig.canApproveLiquidation
        : sig.canApprovePar
    ) || sig.role === 'school_president' || sig.role === 'school_administrator';

    const validAction: 'endorse' | 'approve' = canApprove ? 'approve' : 'endorse';

    handleUpdateStep(stepId, {
      signatoryUid: sig.id,
      signatoryName: sig.name,
      signatoryEmail: sig.email,
      role: sig.role,
      roleTitle: sig.roleTitle,
      department: sig.department || '',
      departmentId: sig.departmentId || '',
      actionType: validAction,
    });
  };

  // ── Save & Reset Handlers ──

  const handleSave = async () => {
    if (!settings) return;
    if (!hasApprover) {
      toast.error(
        `Validation Error: Cannot save ${activeMeta.label}. Every workflow MUST include at least one executive Approver ("Approve" action). Please designate an approver first.`
      );
      return;
    }

    setIsSaving(true);
    try {
      // Save strictly per active pipeline key (AP, FL, or PAR)
      await saveDefaultWorkflowSettings(
        { [activePipelineKey]: currentSteps },
        profile?.email || 'admin@ormoc.sti.edu.ph'
      );
      toast.success(`${activeMeta.label} saved successfully!`);
    } catch (err: any) {
      toast.error('Failed to save workflow settings: ' + (err?.message || 'Unexpected error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Are you sure you want to reset "${activeMeta.label}" to the system default institutional pipeline?`)) {
      return;
    }
    setIsResetting(true);
    try {
      const refreshed = await resetWorkflowPipeline(
        activePipelineKey,
        profile?.email || 'admin@ormoc.sti.edu.ph'
      );
      setSettings(refreshed);
      toast.success(`Reset ${activeMeta.label} to institutional defaults.`);
    } catch (err: any) {
      toast.error('Failed to reset workflow: ' + err?.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Studio Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#0E4EBD] uppercase tracking-wider">
            <GitBranch className="w-4 h-4 text-[#FFD41C]" />
            Workflow Governance Studio
          </div>
          <h2 className="text-xl font-bold text-[#001A4D] mt-0.5">
            Default Approval Workflows
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Configure standard sequential approval chains for student organizations and administrative proposals.
            Signatories are queried directly from Institutional Signatory Maintenance with strict workflow scoping.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isResetting || loadingSettings}
            className="px-3.5 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            title="Reset active workflow pipeline back to factory defaults"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-gray-500 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset to Default</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || loadingSettings || !hasApprover}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title={!hasApprover ? 'Cannot save: Every workflow must have at least one executive Approver' : undefined}
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-[#FFD41C]" />
                <span>Save {activeDoc === 'proposal' ? 'AP' : activeDoc === 'liquidation' ? 'FL' : 'PAR'} Workflow</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Master Tab Navigation ── */}
      <div className="space-y-3">
        {/* Level 1 Tabs: Originator / Creator Group */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveGroup('adviser')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
              activeGroup === 'adviser'
                ? 'border-[#001A4D] text-[#001A4D] bg-[#001A4D]/5'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4 text-[#0E4EBD]" />
            Student Club & Adviser Pipelines
          </button>

          <button
            onClick={() => setActiveGroup('admin')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all ${
              activeGroup === 'admin'
                ? 'border-[#001A4D] text-[#001A4D] bg-[#001A4D]/5'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Admin & SAS Institutional Pipelines
          </button>
        </div>

        {/* Level 2 Sub-Tabs: Document Type (AP, FL, PAR) */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setActiveDoc('proposal')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeDoc === 'proposal'
                ? 'bg-indigo-900 text-white shadow-xs'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
            }`}
          >
            <FileSignature className="w-3.5 h-3.5 text-[#FFD41C]" />
            Activity Proposals (AP)
          </button>

          <button
            onClick={() => setActiveDoc('liquidation')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeDoc === 'liquidation'
                ? 'bg-amber-900 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#FFD41C]" />
            Financial Liquidations (FL)
          </button>

          <button
            onClick={() => setActiveDoc('par')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeDoc === 'par'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5 text-[#FFD41C]" />
            Post-Activity Reports (PAR)
          </button>
        </div>
      </div>

      {/* ── Active Pipeline Overview Banner ── */}
      <div className="bg-[#f7f9fd] border border-[#d6e0f2] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <div className="font-bold text-[#001A4D] flex items-center gap-2">
            <span>Configuring: {activeMeta.label}</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold uppercase rounded-md">
              {stages.length} {stages.length === 1 ? 'Stage' : 'Stages'} • {currentSteps.length} Signatories
            </span>
          </div>
          <p className="text-gray-600 text-[11px] leading-relaxed">
            {activeMeta.description}
          </p>
        </div>

        {!hasApprover && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-[11px] font-bold flex-shrink-0 shadow-2xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>Missing Executive Approver (Cannot Save)</span>
          </div>
        )}
      </div>

      {/* ── Pipeline Stages Visual Builder ── */}
      {loadingSettings || loadingSignatories ? (
        <div className="p-12 text-center text-gray-500">
          <div className="w-8 h-8 border-2 border-[#001A4D] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading pipeline configuration...
        </div>
      ) : (
        <div className="space-y-6">
          {stages.map((stage, stageIdx) => (
            <div
              key={stage.stageIndex}
              className="bg-white border-2 border-gray-200 rounded-2xl shadow-xs overflow-hidden transition-all hover:border-gray-300"
            >
              {/* Stage Header */}
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <span className="w-7 h-7 rounded-xl bg-[#001A4D] text-[#FFD41C] text-xs font-bold flex items-center justify-center shadow-xs flex-shrink-0">
                    {stage.stageIndex}
                  </span>
                  <input
                    type="text"
                    value={stage.stageName}
                    onChange={(e) => handleUpdateStageName(stage.stageIndex, e.target.value)}
                    placeholder={`Stage ${stage.stageIndex} Title`}
                    className="font-bold text-sm text-[#001A4D] bg-white border border-gray-300 px-3 py-1 rounded-lg focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none w-full max-w-md shadow-2xs"
                  />
                  <span className="text-[11px] text-gray-500 font-medium">
                    ({stage.steps.length} {stage.steps.length === 1 ? 'signer' : 'signers'})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddStepToStage(stage.stageIndex)}
                    className="px-3 py-1 bg-white hover:bg-gray-100 text-[#001A4D] border border-gray-300 text-xs font-bold rounded-lg shadow-2xs flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#0E4EBD]" />
                    <span>Add Signer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteStage(stage.stageIndex)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete entire stage"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Stage Steps Table */}
              <div className="p-4 space-y-3">
                {stage.steps.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-xs italic">
                    No signatories in this stage. Click "Add Signer" to add an institutional endorser or approver.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {stage.steps.map((step, stepIdx) => {
                      const selectedSig = signatories.find(
                        (s) => s.id === step.signatoryUid || (s.email && s.email.toLowerCase() === (step.signatoryEmail || '').toLowerCase())
                      );
                      const canSignerApprove = selectedSig ? Boolean(
                        activeDoc === 'proposal'
                          ? selectedSig.canApproveProposal
                          : activeDoc === 'liquidation'
                          ? selectedSig.canApproveLiquidation
                          : selectedSig.canApprovePar
                      ) || selectedSig.role === 'school_president' || selectedSig.role === 'school_administrator' : false;

                      // Find other signatories already assigned in this pipeline so they are excluded from this step's dropdown
                      const otherAssignedIds = new Set(
                        currentSteps
                          .filter((s) => s.id !== step.id && s.signatoryUid)
                          .map((s) => s.signatoryUid!)
                      );
                      const availableSignatoriesForStep = eligibleSignatories.filter(
                        (sig) => !otherAssignedIds.has(sig.id) || sig.id === step.signatoryUid
                      );

                      return (
                        <div
                          key={step.id}
                          className="bg-white border border-gray-200 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs hover:border-[#0E4EBD]/40 transition-colors"
                        >
                          {/* Signatory Dropdown / Identity */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-[#001A4D] font-bold flex items-center justify-center text-xs flex-shrink-0">
                              {stepIdx + 1}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <select
                                  value={step.signatoryUid || ''}
                                  onChange={(e) => handleSelectSignatoryForStep(step.id, e.target.value)}
                                  className="text-xs font-semibold text-gray-900 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none max-w-sm"
                                >
                                  <option value="">— Select Institutional Signer —</option>
                                  {availableSignatoriesForStep.map((sig) => {
                                    const canSigApprove = Boolean(
                                      activeDoc === 'proposal'
                                        ? sig.canApproveProposal
                                        : activeDoc === 'liquidation'
                                        ? sig.canApproveLiquidation
                                        : sig.canApprovePar
                                    ) || sig.role === 'school_president' || sig.role === 'school_administrator';
                                    return (
                                      <option key={sig.id} value={sig.id}>
                                        {sig.name} ({sig.roleTitle} — {sig.department || 'Campus'}) [{canSigApprove ? 'Approver' : 'Endorser'}]
                                      </option>
                                    );
                                  })}
                                </select>

                                {/* Authority Capability Badge */}
                                {selectedSig && (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                                      canSignerApprove
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-sky-100 text-sky-800'
                                    }`}
                                  >
                                    <ShieldCheck className="w-3 h-3" />
                                    {canSignerApprove ? 'Approver' : 'Endorser Only'}
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
                                <span className="font-medium text-gray-700">{step.roleTitle}</span>
                                {step.department && <span>• {step.department}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Action Selector */}
                          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                            {/* Action Type Button Selector */}
                            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
                              <button
                                type="button"
                                onClick={() => handleUpdateStep(step.id, { actionType: 'endorse' })}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                                  step.actionType === 'endorse'
                                    ? 'bg-sky-700 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                              >
                                Endorse
                              </button>

                              <button
                                type="button"
                                disabled={!canSignerApprove}
                                onClick={() => handleUpdateStep(step.id, { actionType: 'approve' })}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                  !canSignerApprove ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                                } ${
                                  step.actionType === 'approve'
                                    ? 'bg-emerald-700 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                                }`}
                                title={!canSignerApprove ? 'This signatory does not have approval authority for this document type' : 'Designate as executive Approver'}
                              >
                                Approve
                              </button>
                            </div>

                            {/* Permanent / Lock Signatory Checkbox */}
                            <label
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer select-none ${
                                step.isPermanent
                                  ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
                                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                              }`}
                              title="Permanent Signatory: when checked, this person cannot be deleted or removed by document creators when creating an AP, FL, or PAR"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(step.isPermanent)}
                                onChange={(e) =>
                                  handleUpdateStep(step.id, {
                                    isPermanent: e.target.checked,
                                    isMandatory: e.target.checked ? true : step.isMandatory,
                                  })
                                }
                                className="w-3.5 h-3.5 text-amber-600 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
                              />
                              <span className="flex items-center gap-1">
                                <Lock className={`w-3 h-3 ${step.isPermanent ? 'text-amber-600' : 'text-gray-400'}`} />
                                <span>Permanent</span>
                              </span>
                            </label>

                            {/* Delete Step Button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteStep(step.id)}
                              className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Remove signatory from stage"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add Stage Button */}
          <button
            type="button"
            onClick={handleAddStage}
            className="w-full py-3.5 border-2 border-dashed border-gray-300 hover:border-[#0E4EBD] hover:bg-blue-50/50 rounded-2xl text-xs font-bold text-gray-600 hover:text-[#0E4EBD] transition-all flex items-center justify-center gap-2 shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Sequential Stage</span>
          </button>
        </div>
      )}
    </div>
  );
}

