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
} from 'lucide-react';
import type { ProposalFormData } from '../../types/proposal.types';

interface Step2Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

export default function Step2ObjectivesMechanics({ formData, onChange, errors = {} }: Step2Props) {
  const objectives = formData.objectives || [''];
  const successIndicators = formData.successIndicators || [''];
  const mechanics = formData.mechanics || [''];

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
          <button
            type="button"
            onClick={addObjective}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-[#001A4D] rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[#0E4EBD]" />
            Add Objective
          </button>
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
          <button
            type="button"
            onClick={addIndicator}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            Add Indicator
          </button>
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
          <button
            type="button"
            onClick={addMechanic}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-700" />
            Add Procedure
          </button>
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
    </div>
  );
}
