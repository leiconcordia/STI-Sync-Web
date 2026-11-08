/**
 * src/app/modules/activity-proposals/components/wizard/Step2ObjectivesMechanics.tsx
 *
 * Section 4: Objective/s, Section 5: Success indicator/s, and Section 6: Mechanics.
 * Supports dynamic additions, inline edits, and deletions.
 */

import React, { useState } from 'react';
import {
  Target,
  CheckCircle2,
  ListOrdered,
  Plus,
  Trash2,
  AlertCircle,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProposalFormData } from '../../types/proposal.types';
import {
  AIAssistButton,
  AISuggestionModal,
  enhanceObjectives,
  enhanceSuccessIndicators,
  enhanceMechanics,
  generateObjectivesFromPrompt,
  generateSuccessIndicatorsFromPrompt,
  generateMechanicsFromPrompt,
  validateMeaningfulInput,
} from '../../../ai';

interface Step2Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

export default function Step2ObjectivesMechanics({ formData, onChange, errors = {} }: Step2Props) {
  const objectives = formData.objectives || [''];
  const successIndicators = formData.successIndicators || [''];
  const mechanics = formData.mechanics || [''];

  const hasObjectivesInput = (formData.objectives || []).some((o) => o.trim().length > 0);
  const hasIndicatorsInput = (formData.successIndicators || []).some((s) => s.trim().length > 0);
  const hasMechanicsInput = (formData.mechanics || []).some((m) => m.trim().length > 0);

  // AI Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiModalDesc, setAiModalDesc] = useState('');
  const [aiSuggestionList, setAiSuggestionList] = useState<string[]>([]);
  const [activeGeneratingField, setActiveGeneratingField] = useState<'objectives' | 'indicators' | 'mechanics' | null>(null);
  const [aiTargetField, setAiTargetField] = useState<'objectives' | 'indicators' | 'mechanics'>('objectives');
  const [activeAIAction, setActiveAIAction] = useState<(() => Promise<void>) | null>(null);

  // ── Objectives handlers ──
  const addObjective = () => {
    onChange({ objectives: [...objectives, ''] });
  };

  const updateObjective = (index: number, val: string) => {
    const updated = [...objectives];
    updated[index] = val;
    onChange({ objectives: updated });
  };

  const removeObjective = (index: number) => {
    if (objectives.length <= 1) return;
    onChange({ objectives: objectives.filter((_, idx) => idx !== index) });
  };

  // ── Success Indicators handlers ──
  const addIndicator = () => {
    onChange({ successIndicators: [...successIndicators, ''] });
  };

  const updateIndicator = (index: number, val: string) => {
    const updated = [...successIndicators];
    updated[index] = val;
    onChange({ successIndicators: updated });
  };

  const removeIndicator = (index: number) => {
    if (successIndicators.length <= 1) return;
    onChange({ successIndicators: successIndicators.filter((_, idx) => idx !== index) });
  };

  // ── Mechanics handlers ──
  const addMechanic = () => {
    onChange({ mechanics: [...mechanics, ''] });
  };

  const updateMechanic = (index: number, val: string) => {
    const updated = [...mechanics];
    updated[index] = val;
    onChange({ mechanics: updated });
  };

  const removeMechanic = (index: number) => {
    if (mechanics.length <= 1) return;
    onChange({ mechanics: mechanics.filter((_, idx) => idx !== index) });
  };

  // ── AI Action Handlers ──
  const handleEnhanceObjectivesAction = async () => {
    if (activeGeneratingField) return;
    const rawList = (formData.objectives || []).filter((o) => o.trim().length > 0);
    if (rawList.length === 0) {
      handleCreateObjectivesPrompt();
      return;
    }
    const action = async () => {
      setActiveGeneratingField('objectives');
      try {
        const list = await enhanceObjectives(rawList, formData.title);
        if (list && list.length > 0) {
          setAiTargetField('objectives');
          setAiModalTitle('Enhance Existing Objectives');
          setAiModalDesc('Elevated to formal SMART academic objectives preserving your exact topics:');
          setAiSuggestionList(list);
          setAiModalOpen(true);
        } else {
          toast.info('Could not enhance objectives. Please verify your draft inputs.');
        }
      } catch (err) {
        console.error('Error enhancing objectives:', err);
        toast.error('Failed to enhance objectives. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateObjectivesPrompt = () => {
    if (activeGeneratingField) return;
    setAiTargetField('objectives');
    setAiModalTitle('Generate SMART Objectives with AI');
    setAiModalDesc('Prompt what you want (e.g. "generate 5 objectives: 1 this, 2 this"):');
    setAiSuggestionList([]);
    setAiModalOpen(true);
  };

  const handleEnhanceIndicatorsAction = async () => {
    if (activeGeneratingField) return;
    const rawList = (formData.successIndicators || []).filter((s) => s.trim().length > 0);
    if (rawList.length === 0) {
      handleCreateIndicatorsPrompt();
      return;
    }
    const action = async () => {
      setActiveGeneratingField('indicators');
      try {
        const list = await enhanceSuccessIndicators(rawList, formData.title);
        if (list && list.length > 0) {
          setAiTargetField('indicators');
          setAiModalTitle('Enhance Existing Success Indicators');
          setAiModalDesc('Elevated to formal measurable KPIs preserving your targets:');
          setAiSuggestionList(list);
          setAiModalOpen(true);
        } else {
          toast.info('Could not enhance indicators. Please verify your draft inputs.');
        }
      } catch (err) {
        console.error('Error enhancing indicators:', err);
        toast.error('Failed to enhance indicators. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateIndicatorsPrompt = () => {
    if (activeGeneratingField) return;
    setAiTargetField('indicators');
    setAiModalTitle('Generate Success Indicators with AI');
    setAiModalDesc('Prompt target attendance, evaluation benchmarks, or completion goals:');
    setAiSuggestionList([]);
    setAiModalOpen(true);
  };

  const handleEnhanceMechanicsAction = async () => {
    if (activeGeneratingField) return;
    const rawList = (formData.mechanics || []).filter((m) => m.trim().length > 0);
    if (rawList.length === 0) {
      handleCreateMechanicsPrompt();
      return;
    }
    const action = async () => {
      setActiveGeneratingField('mechanics');
      try {
        const list = await enhanceMechanics(rawList, formData.title);
        if (list && list.length > 0) {
          setAiTargetField('mechanics');
          setAiModalTitle('Enhance Existing Mechanics');
          setAiModalDesc('Structured into clear sequential execution guidelines:');
          setAiSuggestionList(list);
          setAiModalOpen(true);
        } else {
          toast.info('Could not enhance mechanics. Please verify your draft inputs.');
        }
      } catch (err) {
        console.error('Error enhancing mechanics:', err);
        toast.error('Failed to enhance mechanics. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateMechanicsPrompt = () => {
    if (activeGeneratingField) return;
    setAiTargetField('mechanics');
    setAiModalTitle('Generate Event Mechanics with AI');
    setAiModalDesc('Prompt execution rules, bracket structure, or workshop sequence:');
    setAiSuggestionList([]);
    setAiModalOpen(true);
  };

  const handleGenerateFromPrompt = async (prompt: string) => {
    if (activeGeneratingField) return;
    const validation = validateMeaningfulInput(prompt);
    if (!validation.isValid) {
      toast.warning(validation.error || 'Please enter meaningful words.');
      return;
    }

    const title = formData.title?.trim() || 'STI Campus Activity';
    setActiveGeneratingField(aiTargetField);

    try {
      if (aiTargetField === 'objectives') {
        const list = await generateObjectivesFromPrompt(title, prompt, formData.description);
        if (list && list.length > 0) setAiSuggestionList(list);
        else toast.info('No objectives could be generated from that prompt.');
      } else if (aiTargetField === 'indicators') {
        const list = await generateSuccessIndicatorsFromPrompt(title, objectives, prompt);
        if (list && list.length > 0) setAiSuggestionList(list);
        else toast.info('No indicators could be generated from that prompt.');
      } else if (aiTargetField === 'mechanics') {
        const list = await generateMechanicsFromPrompt(title, prompt, formData.description);
        if (list && list.length > 0) setAiSuggestionList(list);
        else toast.info('No mechanics could be generated from that prompt.');
      }
    } catch (e) {
      console.error('Error generating from prompt:', e);
      toast.error('Failed to generate suggestions. Please try again.');
    } finally {
      setActiveGeneratingField(null);
    }
  };

  const handleApplyAIList = (selectedItems: string[]) => {
    if (selectedItems.length === 0) return;

    if (aiTargetField === 'objectives') {
      onChange({ objectives: selectedItems });
      toast.success(`${hasObjectivesInput ? 'Updated' : 'Added'} ${selectedItems.length} objective(s)!`);
    } else if (aiTargetField === 'indicators') {
      onChange({ successIndicators: selectedItems });
      toast.success(`${hasIndicatorsInput ? 'Updated' : 'Added'} ${selectedItems.length} indicator(s)!`);
    } else if (aiTargetField === 'mechanics') {
      onChange({ mechanics: selectedItems });
      toast.success(`${hasMechanicsInput ? 'Updated' : 'Added'} ${selectedItems.length} procedure step(s)!`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section 4: Objectives */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
              4
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Objective/s <span className="text-red-500">*</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <AIAssistButton
              label={hasObjectivesInput ? 'Enhance Objectives' : 'Generate with AI'}
              isLoading={activeGeneratingField === 'objectives'}
              disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'objectives')}
              options={
                hasObjectivesInput
                  ? [
                      {
                        id: 'enhance-obj',
                        label: 'Enhance Existing Objectives',
                        description: 'Elevate what was written into formal SMART academic objectives',
                        icon: <Wand2 className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleEnhanceObjectivesAction,
                      },
                    ]
                  : [
                      {
                        id: 'generate-obj',
                        label: 'Generate Objectives from Prompt',
                        description: 'Type your prompt (e.g. "generate 5 objectives 1 this 2 this")',
                        icon: <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleCreateObjectivesPrompt,
                      },
                    ]
              }
            />
            <button
              type="button"
              onClick={addObjective}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-[#001A4D] rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[#0E4EBD]" />
              Add Objective
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {objectives.map((obj, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 text-center text-xs font-bold text-gray-400 font-mono">
                {idx + 1}.
              </span>
              <input
                type="text"
                value={obj}
                onChange={(e) => updateObjective(idx, e.target.value)}
                placeholder={`e.g. Enhance student awareness on emerging cybersecurity protocols (${idx + 1})`}
                className="flex-1 px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] transition-all"
              />
              <button
                type="button"
                onClick={() => removeObjective(idx)}
                disabled={objectives.length <= 1}
                className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                title="Remove objective"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {errors.objectives && (
          <p className="text-xs text-red-600 font-medium">{errors.objectives}</p>
        )}
      </div>

      {/* Section 5: Success Indicators */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              5
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Success Indicator/s <span className="text-red-500">*</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <AIAssistButton
              label={hasIndicatorsInput ? 'Enhance Indicators' : 'Generate with AI'}
              isLoading={activeGeneratingField === 'indicators'}
              disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'indicators')}
              options={
                hasIndicatorsInput
                  ? [
                      {
                        id: 'enhance-kpi',
                        label: 'Enhance Existing Indicators',
                        description: 'Elevate what was written into formal quantifiable KPIs',
                        icon: <Wand2 className="w-3.5 h-3.5 text-emerald-600" />,
                        onClick: handleEnhanceIndicatorsAction,
                      },
                    ]
                  : [
                      {
                        id: 'generate-kpi',
                        label: 'Generate Indicators from Prompt',
                        description: 'Type target benchmarks or attendance goals',
                        icon: <Sparkles className="w-3.5 h-3.5 text-emerald-600" />,
                        onClick: handleCreateIndicatorsPrompt,
                      },
                    ]
              }
            />
            <button
              type="button"
              onClick={addIndicator}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              Add Indicator
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {successIndicators.map((ind, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 text-center text-xs font-bold text-gray-400 font-mono">
                {idx + 1}.
              </span>
              <input
                type="text"
                value={ind}
                onChange={(e) => updateIndicator(idx, e.target.value)}
                placeholder={`e.g. At least 85% of registered attendees complete the practical workshop session`}
                className="flex-1 px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
              />
              <button
                type="button"
                onClick={() => removeIndicator(idx)}
                disabled={successIndicators.length <= 1}
                className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                title="Remove indicator"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {errors.successIndicators && (
          <p className="text-xs text-red-600 font-medium">{errors.successIndicators}</p>
        )}
      </div>

      {/* Section 6: Mechanics */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-900 flex items-center justify-center font-bold text-xs">
              6
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Mechanics & Procedures <span className="text-red-500">*</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <AIAssistButton
              label={hasMechanicsInput ? 'Enhance Mechanics' : 'Generate with AI'}
              isLoading={activeGeneratingField === 'mechanics'}
              disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'mechanics')}
              options={
                hasMechanicsInput
                  ? [
                      {
                        id: 'enhance-flow',
                        label: 'Enhance Existing Mechanics',
                        description: 'Structure and polish what was written into clear procedure steps',
                        icon: <Wand2 className="w-3.5 h-3.5 text-indigo-700" />,
                        onClick: handleEnhanceMechanicsAction,
                      },
                    ]
                  : [
                      {
                        id: 'generate-flow',
                        label: 'Generate Mechanics from Prompt',
                        description: 'Type procedure flow or tournament rules',
                        icon: <Sparkles className="w-3.5 h-3.5 text-indigo-700" />,
                        onClick: handleCreateMechanicsPrompt,
                      },
                    ]
              }
            />
            <button
              type="button"
              onClick={addMechanic}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-700" />
              Add Procedure
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {mechanics.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="w-14 pt-2.5 text-right text-xs font-bold text-indigo-900 font-mono">
                Step {idx + 1}:
              </span>
              <textarea
                rows={2}
                value={step}
                onChange={(e) => updateMechanic(idx, e.target.value)}
                placeholder={`Describe procedure or workflow (e.g. Participants will register upon arrival, followed by keynote lecture and 1-hour lab exercise)`}
                className="flex-1 px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 leading-relaxed transition-all"
              />
              <button
                type="button"
                onClick={() => removeMechanic(idx)}
                disabled={mechanics.length <= 1}
                className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors mt-1"
                title="Remove procedure"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {errors.mechanics && (
          <p className="text-xs text-red-600 font-medium">{errors.mechanics}</p>
        )}
      </div>

      {/* AI Suggestion List Modal */}
      <AISuggestionModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title={aiModalTitle}
        description={aiModalDesc}
        suggestionList={aiSuggestionList}
        mode="list"
        isLoading={Boolean(activeGeneratingField)}
        onApplyList={handleApplyAIList}
        onGenerateFromPrompt={handleGenerateFromPrompt}
        promptPlaceholder={
          aiTargetField === 'objectives'
            ? 'Prompt what you want (e.g. "generate 5 objectives: 1 this, 2 this")...'
            : aiTargetField === 'indicators'
            ? 'Prompt your target metrics (e.g. "85% attendance, 4.2 evaluation score")...'
            : 'Prompt procedure flow (e.g. "single-elimination bracket, 15 min halves")...'
        }
        onRegenerate={() => {
          if (activeAIAction) activeAIAction();
        }}
      />
    </div>
  );
}
