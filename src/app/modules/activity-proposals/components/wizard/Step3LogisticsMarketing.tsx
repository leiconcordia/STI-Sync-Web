/**
 * src/app/modules/activity-proposals/components/wizard/Step3LogisticsMarketing.tsx
 *
 * Section 7: Materials, Section 8: Target market, Section 9: Est. attendance,
 * Section 10: Marketing plan, Section 11: Documentation.
 * Follows exact naming conventions from the official paper and pulls courses/year levels from DB.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Users2,
  Megaphone,
  FileCheck,
  Plus,
  X,
  Trash2,
  CheckSquare,
  BookOpen,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useCourses } from '../../../academic';
import type { ProposalFormData, ProposalTargetAudience } from '../../types/proposal.types';

interface Step3Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

const COMMON_MATERIALS_PRESETS = [
  'LCD Projector & Projection Screen',
  'Sound System & 2 Wireless Microphones',
  'Speaker Token & Plaque of Appreciation',
  'Printed Certificates of Participation',
  'Stage Backdrop / Tarpaulin (8x4 ft)',
  'Extension Cords & HDMI Cables',
  'Registration Logbook & Ballpens',
  'QR Scanner Stands & Mobile Lanyards',
];

const ALL_YEAR_LEVELS = ['G11', 'G12', '1st Year', '2nd Year', '3rd Year', '4th Year'];

export default function Step3LogisticsMarketing({ formData, onChange, errors = {} }: Step3Props) {
  // Fetch real programs / strands from Firestore database
  const { data: courses = [], loading: coursesLoading } = useCourses();
  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses]);

  const materials = formData.materials || [];
  const [materialInput, setMaterialInput] = useState('');

  const targetAudience: ProposalTargetAudience = formData.targetAudience || {
    academicLevels: ['College'],
    departments: ['BSIT'],
    yearLevels: ['3rd Year', '4th Year'],
    courses: [],
    courseCodes: [],
  };

  const selectedCourses: string[] = targetAudience.courses || [];
  const selectedYears: string[] = (targetAudience.yearLevels || []).map(String);

  // ── Estimated Attendance State (Strictly Number on Left + Text on Right) ──
  const [attendanceCount, setAttendanceCount] = useState<number | string>(
    formData.estAttendanceCount ??
    (formData.estimatedAttendance ? parseInt(formData.estimatedAttendance, 10) || '' : '')
  );

  const [attendanceQualifier, setAttendanceQualifier] = useState<string>(
    formData.estAttendanceQualifier ??
    (formData.estimatedAttendance
      ? formData.estimatedAttendance.replace(/^\d+\s*/, '') || 'participants'
      : 'participants')
  );

  const updateAttendance = (countVal: number | string, qualVal: string) => {
    const num = typeof countVal === 'string' ? (countVal ? parseInt(countVal, 10) : 0) : countVal;
    const cleanQual = qualVal.trim() || 'participants';
    const combined = num ? `${num} ${cleanQual}` : '';

    onChange({
      estAttendanceCount: num,
      estAttendanceQualifier: cleanQual,
      estimatedAttendance: combined,
    });
  };

  const marketingPlan = formData.marketingPlan || [
    'STI College Ormoc Official FB Page Announcement',
    'Campus Bulletin Board Poster Display & Classroom Visits',
    'Endorsements through Program Heads & Faculty Advisors',
  ];
  const [marketingInput, setMarketingInput] = useState('');

  const documentationPlan = formData.documentationPlan || [
    'Digital QR Attendance Logs & Timestamp Records',
    'High-Resolution Event Photography & Video Coverage',
    'Post-Activity Evaluation Survey Form',
    'Financial Completion & Liquidation Report',
  ];
  const [docInput, setDocInput] = useState('');

  // ── Materials handlers ──
  const addMaterial = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed || materials.includes(trimmed)) return;
    onChange({ materials: [...materials, trimmed] });
    setMaterialInput('');
  };

  const removeMaterial = (index: number) => {
    onChange({ materials: materials.filter((_, idx) => idx !== index) });
  };

  const [targetMarketInput, setTargetMarketInput] = useState('');

  const targetMarkets: string[] = useMemo(() => {
    if (targetAudience.courseCodes && targetAudience.courseCodes.length > 0) {
      return targetAudience.courseCodes;
    }
    if (targetAudience.departments && targetAudience.departments.length > 0) {
      return targetAudience.departments;
    }
    if (targetAudience.courses && targetAudience.courses.length > 0) {
      return targetAudience.courses;
    }
    return [];
  }, [targetAudience]);

  const handleAddTargetMarket = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || targetMarkets.includes(trimmed)) return;
    const updated = [...targetMarkets, trimmed];
    onChange({
      targetAudience: {
        ...targetAudience,
        departments: updated,
        courseCodes: updated,
        courses: updated,
        academicLevels: targetAudience.academicLevels && targetAudience.academicLevels.length > 0 ? targetAudience.academicLevels : ['College'],
      },
    });
    setTargetMarketInput('');
  };

  const handleRemoveTargetMarket = (idxToRemove: number) => {
    const updated = targetMarkets.filter((_, i) => i !== idxToRemove);
    onChange({
      targetAudience: {
        ...targetAudience,
        departments: updated,
        courseCodes: updated,
        courses: updated,
      },
    });
  };

  const toggleYearLevel = (year: string) => {
    const updatedYears = selectedYears.includes(year)
      ? selectedYears.filter((y) => y !== year)
      : [...selectedYears, year];

    onChange({
      targetAudience: {
        ...targetAudience,
        yearLevels: updatedYears,
      },
    });
  };

  const selectAllYears = () => {
    onChange({
      targetAudience: {
        ...targetAudience,
        yearLevels: ALL_YEAR_LEVELS,
      },
    });
  };

  const clearAllYears = () => {
    onChange({
      targetAudience: {
        ...targetAudience,
        yearLevels: [],
      },
    });
  };

  // ── Marketing handlers ──
  const addMarketing = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed || marketingPlan.includes(trimmed)) return;
    onChange({ marketingPlan: [...marketingPlan, trimmed] });
    setMarketingInput('');
  };

  const removeMarketing = (index: number) => {
    onChange({ marketingPlan: marketingPlan.filter((_, idx) => idx !== index) });
  };

  // ── Documentation handlers ──
  const addDocItem = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed || documentationPlan.includes(trimmed)) return;
    onChange({ documentationPlan: [...documentationPlan, trimmed] });
    setDocInput('');
  };

  const removeDocItem = (index: number) => {
    onChange({ documentationPlan: documentationPlan.filter((_, idx) => idx !== index) });
  };

  return (
    <div className="space-y-8">
      {/* ── Section 7: Materials ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
              7
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Materials
            </label>
          </div>
          <span className="text-[11px] text-gray-400">
            {materials.length} item{materials.length === 1 ? '' : 's'} recorded
          </span>
        </div>

        {/* Selected materials chips */}
        <div className="flex flex-wrap gap-2">
          {materials.map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-300 text-gray-800 rounded-lg text-xs font-semibold shadow-2xs group hover:border-gray-400"
            >
              <Package className="w-3.5 h-3.5 text-[#0E4EBD]" />
              {item}
              <button
                type="button"
                onClick={() => removeMaterial(index)}
                className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        {/* Add custom material input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={materialInput}
            onChange={(e) => setMaterialInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addMaterial(materialInput);
              }
            }}
            placeholder="Type needed logistics or equipment item and press Enter..."
            className="flex-1 px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
          />
          <button
            type="button"
            onClick={() => addMaterial(materialInput)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
          >
            Add
          </button>
        </div>

        {/* Preset suggestions */}
        <div>
          <span className="text-[11px] font-semibold text-gray-400 block mb-1.5">
            Quick Presets from Campus Inventory:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_MATERIALS_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => addMaterial(preset)}
                className="text-[11px] px-2.5 py-1 bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-[#001A4D] rounded-lg border border-gray-200 transition-all cursor-pointer"
              >
                + {preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 8: Target market (MANUALLY INPUTTED TEXT FIELD) ── */}
      <div className="space-y-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
              8
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Target market <span className="text-red-500">*</span>
            </label>
          </div>
          <span className="text-[11px] text-gray-500">
            {targetMarkets.length === 0 ? 'No target market added yet' : `${targetMarkets.length} Target(s) Added`}
          </span>
        </div>

        <div className="p-4 border border-gray-200 rounded-2xl bg-white space-y-3">
          {/* Active Target Market Badges */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Target Programs / Audiences
            </span>
            {targetMarkets.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    targetAudience: {
                      ...targetAudience,
                      departments: [],
                      courseCodes: [],
                      courses: [],
                    },
                  })
                }
                className="text-xs text-gray-500 hover:text-red-600 font-medium cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>

          {targetMarkets.length === 0 ? (
            <div className="p-3 bg-amber-50/70 border border-dashed border-amber-300 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Please add at least one target market (e.g. type BSIT and click Add, then type BSHM and click Add).</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {targetMarkets.map((market, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#001A4D] text-[#FFD41C] border border-[#001A4D] rounded-xl text-xs font-bold shadow-xs"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{market}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTargetMarket(idx)}
                    className="hover:text-red-400 transition-colors ml-1 cursor-pointer"
                    title="Remove target market"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Text Input & Add Button */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={targetMarketInput}
              onChange={(e) => setTargetMarketInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTargetMarket(targetMarketInput);
                }
              }}
              placeholder="Type target market (e.g. BSIT, BSHM, Grade 11 STEM)..."
              className="flex-1 px-3.5 py-2.5 bg-gray-50/60 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
            />
            <button
              type="button"
              onClick={() => handleAddTargetMarket(targetMarketInput)}
              className="px-4 py-2.5 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {/* Quick-add suggestions from campus programs */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1.5">
              <span className="font-semibold text-gray-600">Quick suggestions:</span>
              <span className="text-[10px] text-gray-400">(click to add quickly)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['BSIT', 'BSHM', 'BSBA', 'BSCS', 'BSTM', 'Grade 11 STEM', 'Grade 12 ABM', 'Grade 11 HUMSS', 'Grade 12 TVL', 'All College Students', 'All SHS Students', 'All Campus Students'].map((sug) => {
                const isAdded = targetMarkets.includes(sug);
                return (
                  <button
                    key={sug}
                    type="button"
                    disabled={isAdded}
                    onClick={() => handleAddTargetMarket(sug)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer font-medium ${
                      isAdded
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-[#0E4EBD] hover:border-blue-300'
                    }`}
                  >
                    {isAdded ? `✓ ${sug}` : `+ ${sug}`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. Year Levels (Optional Campus Standard) */}
        <div className="p-4 border border-gray-200 rounded-2xl bg-white space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0E4EBD]" />
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Year Levels ({selectedYears.length === 0 ? 'All Levels' : `${selectedYears.length} Selected`})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllYears}
                className="text-xs text-[#0E4EBD] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" /> Select All ({ALL_YEAR_LEVELS.length})
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={clearAllYears}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ALL_YEAR_LEVELS.map((year) => {
              const isSelected = selectedYears.includes(year);
              return (
                <button
                  type="button"
                  key={year}
                  onClick={() => toggleYearLevel(year)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#001A4D] text-white border-[#001A4D] shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#001A4D] hover:bg-gray-100'
                  }`}
                >
                  {year}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 9: Est. attendance (NUMERIC ONLY + QUALIFIER BESIDE IT) ── */}
      <div className="space-y-3 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
              9
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Est. attendance <span className="text-red-500">*</span>
            </label>
          </div>
          <span className="text-[11px] text-gray-400">
            Preview: <strong className="text-gray-700">{formData.estimatedAttendance || '—'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Numbers Only Input */}
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Estimated Number (Numbers Only) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                value={attendanceCount}
                onChange={(e) => {
                  const val = e.target.value;
                  setAttendanceCount(val);
                  updateAttendance(val, attendanceQualifier);
                }}
                placeholder="e.g. 150"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
              />
            </div>
          </div>

          {/* Qualifier Input (participants, Students, BSIT 3rd year) */}
          <div className="sm:col-span-7">
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Cohort Qualifier / Description
            </label>
            <div className="relative">
              <input
                type="text"
                value={attendanceQualifier}
                onChange={(e) => {
                  const val = e.target.value;
                  setAttendanceQualifier(val);
                  updateAttendance(attendanceCount, val);
                }}
                placeholder="e.g. participants, Students, BSIT 3rd year"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
              />
            </div>
          </div>
        </div>

        {/* Quick Qualifier Suggestions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400 font-medium">Suggestions:</span>
          {['participants', 'Students', 'BSIT 3rd year', 'Club Officers', 'Student Leaders', 'Attendees'].map(
            (qual) => (
              <button
                key={qual}
                type="button"
                onClick={() => {
                  setAttendanceQualifier(qual);
                  updateAttendance(attendanceCount, qual);
                }}
                className={`text-[11px] px-2 py-0.5 rounded-md border transition-all cursor-pointer ${attendanceQualifier === qual
                    ? 'bg-blue-50 text-[#001A4D] border-blue-300 font-semibold'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
              >
                {qual}
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Section 10: Marketing plan ── */}
      <div className="space-y-3 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
              10
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Marketing plan
            </label>
          </div>
          <span className="text-[11px] text-gray-400">
            {marketingPlan.length} channels
          </span>
        </div>

        <div className="space-y-2">
          {marketingPlan.map((plan, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-2xs"
            >
              <div className="flex items-center gap-2 text-xs text-gray-800">
                <Megaphone className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>{plan}</span>
              </div>
              <button
                type="button"
                onClick={() => removeMarketing(index)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={marketingInput}
            onChange={(e) => setMarketingInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addMarketing(marketingInput);
              }
            }}
            placeholder="e.g. Social media announcement, bulletin board posters, homeroom visits..."
            className="flex-1 px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
          />
          <button
            type="button"
            onClick={() => addMarketing(marketingInput)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* ── Section 11: Documentation ── */}
      <div className="space-y-3 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
              11
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Documentation
            </label>
          </div>
          <span className="text-[11px] text-gray-400">
            {documentationPlan.length} deliverables
          </span>
        </div>

        <div className="space-y-2">
          {documentationPlan.map((doc, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-2xs"
            >
              <div className="flex items-center gap-2 text-xs text-gray-800">
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{doc}</span>
              </div>
              <button
                type="button"
                onClick={() => removeDocItem(index)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={docInput}
            onChange={(e) => setDocInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDocItem(docInput);
              }
            }}
            placeholder="e.g. Photo & video album, signed attendance sheets, narrative evaluation report..."
            className="flex-1 px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
          />
          <button
            type="button"
            onClick={() => addDocItem(docInput)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
