/**
 * src/app/modules/activity-proposals/components/wizard/Step1GeneralInfo.tsx
 *
 * Section 1, 2, 3: Activity Title, Description/Rationale, Organizers, and 15-Day Policy Notice.
 */

import React, { useState } from 'react';
import {
  FileText,
  Building,
  Users,
  AlertTriangle,
  Plus,
  X,
  Calendar,
  UserCheck,
} from 'lucide-react';
import type { ProposalFormData } from '../../types/proposal.types';

interface Step1Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

const COMMON_ORGANIZERS = [
  'Student Affairs & Services (SAS)',
  'IT Department & IT Guild Club',
  'Hospitality Management Society',
  'Business Administration Club',
  'Senior High School Student Council',
  'Supreme Student Council (SSC)',
];

export default function Step1GeneralInfo({ formData, onChange, errors = {} }: Step1Props) {
  const [organizerInput, setOrganizerInput] = useState('');
  const [proponentInput, setProponentInput] = useState('');

  const organizers = formData.organizers || ['Student Affairs & Services (SAS)'];
  const proponents = formData.proponents && formData.proponents.length > 0
    ? formData.proponents
    : [formData.createdByName || 'Student Affairs & Services'];

  const addOrganizer = (org: string) => {
    const trimmed = org.trim();
    if (!trimmed || organizers.includes(trimmed)) return;
    onChange({ organizers: [...organizers, trimmed] });
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
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
          1. Activity title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.title || ''}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="e.g. IT Expert Talk #1: Cybersecurity Awareness and Ethical Hacking"
          className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
            errors.title
              ? 'border-red-300 focus:ring-red-200 focus:border-red-500'
              : 'border-gray-300 focus:ring-[#001A4D]/20 focus:border-[#001A4D]'
          }`}
        />
        {errors.title && <p className="text-xs text-red-600 mt-1 font-medium">{errors.title}</p>}
      </div>

      {/* Section 2: Description */}
      <div>
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
          2. Description <span className="text-red-500">*</span>
        </label>
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
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
          3. Organizer/s <span className="text-red-500">*</span>
        </label>
        
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

        {/* Input & Quick Presets */}
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
            placeholder="Type custom organizer or committee name..."
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

        {/* Preset chips */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
          <span className="font-semibold text-gray-400">Suggestions:</span>
          {COMMON_ORGANIZERS.map((sug, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => addOrganizer(sug)}
              className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md transition-colors"
            >
              + {sug}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
