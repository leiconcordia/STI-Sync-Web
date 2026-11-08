/**
 * src/app/modules/activity-proposals/components/wizard/Step1GeneralInfo.tsx
 *
 * Section 1, 2, 3: Activity Title, Description/Rationale, Organizers, and 15-Day Policy Notice.
 */

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Building,
  Users,
  AlertTriangle,
  Plus,
  X,
  Calendar,
  UserCheck,
  Sparkles,
  Wand2,
  PenTool,
  History,
  Check,
  Lock,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOrganizationStream } from '../../../../modules/organizations/hooks/useOrganizationStream';
import { stripSasPhrases } from '../../../events/utils/organization-display.utils';
import { useAllEvents } from '../../../events/hooks/useEventStream';
import {
  filterHistoricalMatches,
  mapHistoricalLineItems,
  type HistoricalActivityMatch,
} from '../../services/historical-budget.service';
import { getProposalById } from '../../services/proposal.service';
import type { ProposalFormData } from '../../types/proposal.types';
import {
  AIAssistButton,
  AISuggestionModal,
  rewriteTitle,
  expandDescription,
  polishGrammar,
  generateTitleFromConcept,
  createDescriptionFromPrompt,
  validateMeaningfulInput,
} from '../../../ai';

interface Step1Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

export default function Step1GeneralInfo({ formData, onChange, errors = {} }: Step1Props) {
  const { data: organizations = [] } = useOrganizationStream();
  const [organizerInput, setOrganizerInput] = useState('');
  const [proponentInput, setProponentInput] = useState('');

  // AI Assistant Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiModalDesc, setAiModalDesc] = useState('');
  const [aiOriginalText, setAiOriginalText] = useState('');
  const [aiSuggestionText, setAiSuggestionText] = useState('');
  const [aiSuggestionList, setAiSuggestionList] = useState<string[]>([]);
  const [aiModalMode, setAiModalMode] = useState<'text' | 'choice' | 'list'>('text');
  const [activeGeneratingField, setActiveGeneratingField] = useState<'title' | 'description' | null>(null);
  const [aiTargetField, setAiTargetField] = useState<'title' | 'description'>('title');
  const [activeAIAction, setActiveAIAction] = useState<(() => Promise<void>) | null>(null);

  const hasTitleInput = Boolean(formData.title && formData.title.trim().length > 0);
  const hasDescInput = Boolean(formData.description && formData.description.trim().length > 0);

  const { events: allEvents = [] } = useAllEvents();
  const [dismissedSuggestions, setDismissedSuggestions] = useState(false);

  const titleMatches: HistoricalActivityMatch[] = useMemo(() => {
    const raw = formData.title?.trim() || '';
    if (raw.length < 2) return [];
    return filterHistoricalMatches(allEvents, raw, formData.id, 5);
  }, [allEvents, formData.title, formData.id]);

  const handleTitleChange = (newTitle: string) => {
    if (dismissedSuggestions) setDismissedSuggestions(false);
    onChange({ title: newTitle });
  };

  const orgSuggestions = useMemo(() => {
    const list: string[] = ['Student Affairs & Services (SAS)'];
    organizations.forEach((org: any) => {
      if (!org || org.archived) return;
      const orgLabel = org.acronym ? `${org.name} (${org.acronym})` : org.name;
      if (orgLabel && !list.includes(orgLabel)) {
        list.push(orgLabel);
      }
    });
    return list;
  }, [organizations]);

  const organizers = formData.organizers || ['Student Affairs & Services (SAS)'];
  const proponents = formData.proponents && formData.proponents.length > 0
    ? formData.proponents
    : [formData.createdByName || 'Student Affairs & Services'];

  const handleSelectHostOrg = (selectedVal: string) => {
    if (!selectedVal || selectedVal === 'sas') {
      onChange({
        organizationId: 'sas',
        hostingOrgId: 'sas',
        organizationName: 'Student Affairs & Services (SAS)',
        organizers: ['Student Affairs & Services (SAS)'],
        isOfficerProposal: false,
      });
      return;
    }
    const match = organizations.find((o: any) => o.id === selectedVal || o.name === selectedVal);
    if (match) {
      onChange({
        organizationId: match.id,
        hostingOrgId: match.id,
        organizationName: match.name,
        organizers: [match.name],
        isOfficerProposal: true,
      });
    }
  };

  const addOrganizer = (org: string) => {
    const trimmed = org.trim();
    if (!trimmed || organizers.includes(trimmed)) return;

    // If list currently only has the default SAS placeholder and we are adding a student club, replace it
    const isAddingStudentOrg = stripSasPhrases(trimmed).length > 0;
    const hasOnlySas = organizers.length === 1 && stripSasPhrases(organizers[0]).length === 0;
    const nextList = hasOnlySas && isAddingStudentOrg ? [trimmed] : [...organizers, trimmed];

    const match = organizations.find(
      (o: any) =>
        o.name.toLowerCase() === trimmed.toLowerCase() ||
        (o.acronym && o.acronym.toLowerCase() === trimmed.toLowerCase())
    );

    const updates: Partial<ProposalFormData> = {
      organizers: nextList,
      ...(isAddingStudentOrg ? { isOfficerProposal: true } : {}),
    };
    if (match) {
      updates.organizationId = match.id;
      updates.hostingOrgId = match.id;
      updates.organizationName = match.name;
      updates.isOfficerProposal = true;
    }
    onChange(updates);
    setOrganizerInput('');
  };

  const removeOrganizer = (indexToRemove: number) => {
    onChange({
      organizers: organizers.filter((_, idx) => idx !== indexToRemove),
    });
  };

  const addProponent = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || proponents.includes(trimmed)) return;
    onChange({ proponents: [...proponents, trimmed] });
    setProponentInput('');
  };

  const removeProponent = (indexToRemove: number) => {
    if (proponents.length <= 1) return;
    onChange({
      proponents: proponents.filter((_, idx) => idx !== indexToRemove),
    });
  };

  // ── "Use as Template" Handler ──
  const handleUseAsTemplate = async (match: HistoricalActivityMatch) => {
    try {
      // 1. Retrieve full proposal doc from match or fetch fresh from Firestore
      let templateDoc: any = match.rawProposal;
      if (!templateDoc || !templateDoc.objectives) {
        const fetched = await getProposalById(match.id);
        if (fetched) {
          templateDoc = { ...(templateDoc || {}), ...fetched };
        }
      }

      if (!templateDoc) {
        templateDoc = match;
      }

      // 2. Map financial projections for Step 6 with Last Year's Actual populated
      const currentProjections = formData.financialProjections || {
        revenues: [],
        expenses: [],
        totalRevenue: 0,
        totalExpenses: 0,
        balance: 0,
      };

      const { recalculatedProjections, originalHistoricalTotal } = mapHistoricalLineItems(
        match,
        currentProjections
      );

      // 3. Assemble populated proposal data, strictly preserving date-sensitive & approval fields
      const updates: Partial<ProposalFormData> = {
        // Step 1: General Info
        description: templateDoc.description || formData.description,
        organizers: (templateDoc.organizers && templateDoc.organizers.length > 0)
          ? templateDoc.organizers
          : (templateDoc.organizationName ? [templateDoc.organizationName] : formData.organizers),
        theme: templateDoc.theme || templateDoc.subtitle || formData.theme,
        category: templateDoc.category || templateDoc.activityType || formData.category,

        // Step 2: Objectives & Mechanics
        objectives: (templateDoc.objectives && templateDoc.objectives.length > 0)
          ? templateDoc.objectives
          : formData.objectives,
        successIndicators: (templateDoc.successIndicators && templateDoc.successIndicators.length > 0)
          ? templateDoc.successIndicators
          : formData.successIndicators,
        mechanics: (templateDoc.mechanics && templateDoc.mechanics.length > 0)
          ? templateDoc.mechanics
          : formData.mechanics,

        // Step 3: Logistics & Marketing
        materials: (templateDoc.materials && templateDoc.materials.length > 0)
          ? templateDoc.materials
          : formData.materials,
        targetAudience: templateDoc.targetAudience || formData.targetAudience,
        estimatedAttendance: templateDoc.estimatedAttendance || formData.estimatedAttendance,
        estAttendanceCount: templateDoc.estAttendanceCount ?? formData.estAttendanceCount,
        estAttendanceQualifier: templateDoc.estAttendanceQualifier || formData.estAttendanceQualifier,
        marketingPlan: (templateDoc.marketingPlan && templateDoc.marketingPlan.length > 0)
          ? templateDoc.marketingPlan
          : formData.marketingPlan,
        documentationPlan: (templateDoc.documentationPlan && templateDoc.documentationPlan.length > 0)
          ? templateDoc.documentationPlan
          : formData.documentationPlan,

        // Step 6: Financials
        financialProjections: recalculatedProjections,
        historicalReference: {
          eventId: match.id,
          eventTitle: match.title,
          schoolYear: match.schoolYear,
          originalTotalAmount: originalHistoricalTotal,
          isManuallyEdited: false,
          isLocked: true,
          linkedAt: new Date().toISOString(),
        },
      };

      onChange(updates);
      toast.success(`Applied "${match.title}" as template!`, {
        description: 'Description, organizers, objectives, mechanics, materials, marketing, and last year\'s budget populated.',
      });
    } catch (err) {
      console.error('Failed to apply template:', err);
      toast.error('Failed to load full template details. Please try again.');
    }
  };

  // ── AI Writing Handlers ──
  const handleRewriteTitleAction = async () => {
    if (activeGeneratingField) return;
    const raw = formData.title?.trim();
    if (!raw) {
      handleCreateTitleWithAI();
      return;
    }

    const validation = validateMeaningfulInput(raw);
    if (!validation.isValid) {
      toast.warning(validation.error || 'Please enter meaningful words in the title.');
      return;
    }

    const action = async () => {
      setActiveGeneratingField('title');
      try {
        const suggestions = await rewriteTitle(raw);
        if (suggestions && suggestions.length > 0) {
          setAiTargetField('title');
          setAiModalTitle('Enhance Activity Title');
          setAiModalDesc('Choose a formal, institutional title for STI College official records:');
          setAiOriginalText(raw);
          setAiSuggestionList(suggestions);
          setAiModalMode('choice');
          setAiModalOpen(true);
        } else {
          toast.info('No title suggestions generated. Please try refining your draft title.');
        }
      } catch (err) {
        console.error('Error enhancing title:', err);
        toast.error('Failed to enhance title. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateTitleWithAI = () => {
    if (activeGeneratingField) return;
    setAiTargetField('title');
    setAiModalTitle('Generate Activity Title from Prompt');
    setAiModalDesc('Type what this event is about or desired theme, and AI will generate 3 formal titles:');
    setAiOriginalText('');
    setAiSuggestionList([]);
    setAiModalMode('choice');
    setAiModalOpen(true);
  };

  const handlePolishDescriptionAction = async () => {
    if (activeGeneratingField) return;
    const raw = formData.description?.trim();
    if (!raw) {
      handleCreateDescriptionWithAI();
      return;
    }

    const validation = validateMeaningfulInput(raw);
    if (!validation.isValid) {
      toast.warning(validation.error || 'Please enter meaningful words in the description.');
      return;
    }

    const action = async () => {
      setActiveGeneratingField('description');
      try {
        const polished = await polishGrammar(raw, 'Activity Proposal Description');
        if (polished) {
          setAiTargetField('description');
          setAiModalTitle('Enhance & Polish Description');
          setAiModalDesc('Elevated to formal STI institutional standards while preserving your exact meaning:');
          setAiOriginalText(raw);
          setAiSuggestionText(polished);
          setAiModalMode('text');
          setAiModalOpen(true);
        } else {
          toast.info('No changes suggested.');
        }
      } catch (err) {
        console.error('Error polishing description:', err);
        toast.error('Failed to polish description. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleExpandDescriptionAction = async () => {
    if (activeGeneratingField) return;
    const raw = formData.description?.trim() || '';
    const title = formData.title?.trim() || '';
    if (!raw && !title) {
      handleCreateDescriptionWithAI();
      return;
    }

    if (raw) {
      const validation = validateMeaningfulInput(raw);
      if (!validation.isValid) {
        toast.warning(validation.error || 'Please enter meaningful notes.');
        return;
      }
    }

    const action = async () => {
      setActiveGeneratingField('description');
      try {
        const expanded = await expandDescription(title, raw, formData.organizers);
        if (expanded) {
          setAiTargetField('description');
          setAiModalTitle('Expand Notes into Concise Rationale');
          setAiModalDesc('Structured into 1 compact paragraph (60–90 words) aligned with STI student development:');
          setAiOriginalText(raw);
          setAiSuggestionText(expanded);
          setAiModalMode('text');
          setAiModalOpen(true);
        } else {
          toast.info('Could not expand description. Please add more details.');
        }
      } catch (err) {
        console.error('Error expanding description:', err);
        toast.error('Failed to expand description. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateDescriptionWithAI = () => {
    if (activeGeneratingField) return;
    setAiTargetField('description');
    setAiModalTitle('Generate Description from Prompt');
    setAiModalDesc('Prompt what this activity is about, and AI will generate 1 concise rationale (60–90 words):');
    setAiOriginalText(formData.description || '');
    setAiSuggestionText('');
    setAiModalMode('text');
    setAiModalOpen(true);
  };

  const handleGenerateFromPrompt = async (prompt: string) => {
    if (activeGeneratingField) return;
    const validation = validateMeaningfulInput(prompt);
    if (!validation.isValid) {
      toast.warning(validation.error || 'Please enter meaningful words.');
      return;
    }

    setActiveGeneratingField(aiTargetField);
    try {
      if (aiTargetField === 'title') {
        const titles = await generateTitleFromConcept(prompt, formData.category);
        if (titles && titles.length > 0) {
          setAiSuggestionList(titles);
          setAiModalMode('choice');
        } else {
          toast.info('No titles could be generated from that prompt. Please try different keywords.');
        }
      } else if (aiTargetField === 'description') {
        const desc = await createDescriptionFromPrompt(
          formData.title || '',
          prompt,
          formData.organizers,
          formData.targetAudience?.academicLevels?.join(', ')
        );
        if (desc) {
          setAiSuggestionText(desc);
          setAiModalMode('text');
        } else {
          toast.info('Could not generate description from that prompt.');
        }
      }
    } catch (err) {
      console.error('Error generating from prompt:', err);
      toast.error('Generation failed. Please try again.');
    } finally {
      setActiveGeneratingField(null);
    }
  };

  const handleApplyAIText = (appliedText: string, applyMode: 'replace' | 'append') => {
    if (aiTargetField === 'title') {
      onChange({ title: appliedText });
      toast.success('Title updated!');
    } else if (aiTargetField === 'description') {
      if (applyMode === 'append' && formData.description?.trim()) {
        onChange({ description: `${formData.description.trim()}\n\n${appliedText}` });
        toast.success('Appended to description!');
      } else {
        onChange({ description: appliedText });
        toast.success('Description updated!');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 15-Day Policy Rule Reminder Banner */}
      <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
            Notice: 15-Day Policy Requirement
          </h4>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed font-medium italic">
            "Note: This proposal must be submitted to the Administrator at least 15 calendar days before the start of the initial task."
          </p>
        </div>
      </div>

      {/* Meta Grid: Reference & Submission Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
            Proposal Reference No.
          </label>
          <input
            type="text"
            value={formData.referenceNo || 'Auto-generated upon save (e.g. AP-2026-SAS-001)'}
            disabled
            readOnly
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500 font-mono cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>Date</span>
            <span className="text-[10px] text-gray-400 font-normal lowercase">(read-only • date submitted / today)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={
                formData.submissionDate ||
                new Intl.DateTimeFormat('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                }).format(new Date())
              }
              disabled
              readOnly
              className="w-full pl-3.5 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-not-allowed select-none"
            />
            <Calendar className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Proposed / Submitted By (Proponent/s) */}
      <div>
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Proposed / Submitted By (Proponent/s) <span className="text-red-500">*</span></span>
          <span className="text-[10px] text-gray-400 font-normal">(maker defaults automatically • can add co-proponents)</span>
        </label>
        
        {/* Active Proponents Badges */}
        <div className="flex flex-wrap gap-2 mb-2.5">
          {proponents.map((prop, index) => (
            <span
              key={index}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold shadow-2xs ${
                index === 0
                  ? 'bg-blue-50 border border-blue-200 text-[#001A4D]'
                  : 'bg-slate-100 border border-slate-200 text-slate-800'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-[#0E4EBD]" />
              <span>{prop}</span>
              {index === 0 ? (
                <span className="text-[9px] uppercase tracking-wider font-bold bg-[#FFD41C] text-[#001A4D] px-1.5 py-0.5 rounded ml-0.5">
                  Maker
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeProponent(index)}
                  className="hover:text-red-600 transition-colors ml-0.5"
                  title="Remove co-proponent"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Proponent Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={proponentInput}
            onChange={(e) => setProponentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addProponent(proponentInput);
              }
            }}
            placeholder="Add fellow co-proponent or student officer name..."
            className="flex-1 px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
          />
          <button
            type="button"
            onClick={() => addProponent(proponentInput)}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Section 1: Activity title */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            1. Activity title <span className="text-red-500">*</span>
          </label>
          <AIAssistButton
            label={hasTitleInput ? 'Enhance Title' : 'Generate with AI'}
            isLoading={activeGeneratingField === 'title'}
            disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'title')}
            options={
              hasTitleInput
                ? [
                    {
                      id: 'enhance-title',
                      label: 'Enhance Title',
                      description: 'Transforms informal draft into 3 official STI titles',
                      icon: <Wand2 className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                      onClick: handleRewriteTitleAction,
                    },
                  ]
                : [
                    {
                      id: 'generate-title',
                      label: 'Generate Title from Prompt',
                      description: 'Enter your event theme or concept first',
                      icon: <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                      onClick: handleCreateTitleWithAI,
                    },
                  ]
            }
          />
        </div>
        <div className="relative">
          <input
            type="text"
            value={formData.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. IT Expert Talk #1: Cybersecurity Awareness and Ethical Hacking"
            className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
              errors.title
                ? 'border-red-300 focus:ring-red-200 focus:border-red-500'
                : 'border-gray-300 focus:ring-[#001A4D]/20 focus:border-[#001A4D]'
            }`}
          />
        </div>
        {errors.title && <p className="text-xs text-red-600 mt-1 font-medium">{errors.title}</p>}

        {/* Real-time Past Activity Suggestions */}
        {titleMatches.length > 0 && !dismissedSuggestions && (
          <div className="mt-2.5 p-3 bg-blue-50/80 border border-blue-200/90 rounded-xl space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#001A4D]">
                <History className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>Found {titleMatches.length} Similar Past {titleMatches.length === 1 ? 'Activity' : 'Activities'}:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 hidden sm:inline">
                  Click to adopt title or link budget baseline
                </span>
                <button
                  type="button"
                  onClick={() => setDismissedSuggestions(true)}
                  className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors cursor-pointer"
                  title="Dismiss suggestions"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {titleMatches.map((m) => {
                const isLinked = formData.historicalReference?.eventId === m.id;
                const formattedBudget = new Intl.NumberFormat('en-PH', {
                  style: 'currency',
                  currency: 'PHP',
                  minimumFractionDigits: 2,
                }).format(m.totalApprovedBudget || 0);

                return (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors ${
                      isLinked
                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                        : 'bg-white border-blue-100 hover:border-blue-300 text-gray-900 shadow-2xs'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 truncate">
                          {m.title}
                        </span>
                        {m.schoolYear && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            SY {m.schoolYear}
                          </span>
                        )}
                        <span className="text-[11px] font-mono font-semibold text-emerald-700">
                          Past Budget: {formattedBudget}
                        </span>
                      </div>
                      {m.organizationName && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Organized by {m.organizationName}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleUseAsTemplate(m)}
                        className="px-2.5 py-1 text-[11px] font-bold bg-[#FFD41C] hover:bg-[#e6be17] text-[#001A4D] rounded-md transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                        title="Use as template: copies description, organizers, objectives, mechanics, materials, marketing, and populates Last Year's Actual budget"
                      >
                        <Copy className="w-3 h-3 text-[#001A4D]" />
                        <span>Use as Template</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onChange({ title: m.title });
                          toast.success(`Title adopted: "${m.title}"`);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold text-[#001A4D] bg-blue-100/70 hover:bg-blue-200/80 rounded-md transition-colors cursor-pointer"
                        title="Use this exact past title"
                      >
                        Use Title
                      </button>

                      {isLinked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-[11px] font-bold rounded-md shadow-2xs">
                          <Check className="w-3 h-3" />
                          <span>Budget Linked</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const currentProjections = formData.financialProjections || {
                              revenues: [],
                              expenses: [],
                              totalRevenue: 0,
                              totalExpenses: 0,
                              balance: 0,
                            };
                            const { recalculatedProjections, originalHistoricalTotal } = mapHistoricalLineItems(
                              m,
                              currentProjections
                            );
                            onChange({
                              financialProjections: recalculatedProjections,
                              historicalReference: {
                                eventId: m.id,
                                eventTitle: m.title,
                                schoolYear: m.schoolYear,
                                originalTotalAmount: originalHistoricalTotal,
                                isManuallyEdited: false,
                                isLocked: true,
                                linkedAt: new Date().toISOString(),
                              },
                            });
                            toast.success(`Linked "${m.title}" budget to Step 6 Financials!`, {
                              description: 'Historical figures will be auto-filled in the Last Year\'s Actual column.',
                            });
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-md transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                          title="Auto-fill Last Year's Actual column in Step 6"
                        >
                          <History className="w-3 h-3" />
                          <span>Link Budget</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Badge if historical reference is already linked */}
        {formData.historicalReference && (
          <div className="mt-2.5 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>
                Linked Historical Budget: <strong>{formData.historicalReference.eventTitle}</strong>
                {formData.historicalReference.schoolYear && ` (SY ${formData.historicalReference.schoolYear})`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onChange({ historicalReference: null });
                toast.info('Historical reference unlinked.');
              }}
              className="text-[11px] font-bold text-emerald-800 hover:text-rose-600 transition-colors ml-2 cursor-pointer"
            >
              Unlink
            </button>
          </div>
        )}
      </div>

      {/* Section 2: Description */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            2. Description <span className="text-red-500">*</span>
          </label>
          <AIAssistButton
            label={hasDescInput ? 'Enhance Description' : 'Generate with AI'}
            isLoading={activeGeneratingField === 'description'}
            disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'description')}
            options={
              hasDescInput
                ? [
                    {
                      id: 'polish-desc',
                      label: 'Enhance & Polish Grammar',
                      description: 'Proofread and elevate vocabulary to STI standard without changing meaning',
                      icon: <Wand2 className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                      onClick: handlePolishDescriptionAction,
                    },
                    {
                      id: 'expand-desc',
                      label: 'Expand Notes (1 Compact Paragraph)',
                      description: 'Flesh out rough notes into a concise 60-90 word rationale',
                      icon: <PenTool className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                      onClick: handleExpandDescriptionAction,
                    },
                  ]
                : [
                    {
                      id: 'generate-desc',
                      label: 'Generate Description from Prompt',
                      description: 'Prompt what the event is about first to generate a concise rationale',
                      icon: <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                      onClick: handleCreateDescriptionWithAI,
                    },
                  ]
            }
          />
        </div>
        <textarea
          rows={5}
          value={formData.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Provide a comprehensive description of the event, including background rationale, targeted core competencies, seminar tracks, and expected impact on participating STI students."
          className={`w-full px-4 py-3 bg-white border rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 leading-relaxed transition-all ${
            errors.description
              ? 'border-red-300 focus:ring-red-200 focus:border-red-500'
              : 'border-gray-300 focus:ring-[#001A4D]/20 focus:border-[#001A4D]'
          }`}
        />
        {errors.description && (
          <p className="text-xs text-red-600 mt-1 font-medium">{errors.description}</p>
        )}
      </div>

      {/* Section 3: Organizer/s */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
            3. Organizer/s <span className="text-red-500">*</span>
          </label>
          <span className="text-[11px] text-gray-400">
            Select primary host or add co-organizers
          </span>
        </div>

        {/* Quick Organization Selector */}
        <div className="mb-2.5">
          <select
            value={formData.hostingOrgId || formData.organizationId || (stripSasPhrases(organizers[0] || '').length > 0 ? '' : 'sas')}
            onChange={(e) => handleSelectHostOrg(e.target.value)}
            className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] shadow-2xs"
          >
            {formData.isOfficerProposal !== true && (
              <option value="sas">🏛️ Student Affairs & Services (SAS) — Institutional Activity</option>
            )}
            <optgroup label="Recognized Student Organizations">
              {organizations.filter((o: any) => !o.archived).map((o: any) => (
                <option key={o.id} value={o.id}>
                  👥 {o.name} {o.acronym ? `(${o.acronym})` : ''}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        
        {/* Active Organizers Badges */}
        <div className="flex flex-wrap gap-2 mb-2.5">
          {organizers.map((org, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-[#001A4D] rounded-lg text-xs font-semibold shadow-2xs"
            >
              <Users className="w-3.5 h-3.5 text-[#0E4EBD]" />
              {org}
              <button
                type="button"
                onClick={() => removeOrganizer(index)}
                className="hover:text-red-600 transition-colors ml-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={organizerInput}
            onChange={(e) => setOrganizerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOrganizer(organizerInput);
              }
            }}
            placeholder="Type organizer or committee name and press Enter..."
            className="flex-1 px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
          />
          <button
            type="button"
            onClick={() => addOrganizer(organizerInput)}
            className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* AI Suggestion Preview Modal */}
      <AISuggestionModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title={aiModalTitle}
        description={aiModalDesc}
        originalText={aiOriginalText}
        suggestionText={aiSuggestionText}
        suggestionList={aiSuggestionList}
        mode={aiModalMode}
        isLoading={Boolean(activeGeneratingField)}
        onApplyText={handleApplyAIText}
        onGenerateFromPrompt={handleGenerateFromPrompt}
        promptPlaceholder={
          aiTargetField === 'title'
            ? 'Describe your event theme or concept (e.g. "Cybersecurity hackathon for BSIT students")...'
            : 'Prompt what you want (e.g. "Hands-on robotics workshop teaching Arduino basics")...'
        }
        onRegenerate={() => {
          if (activeAIAction) activeAIAction();
        }}
      />
    </div>
  );
}
