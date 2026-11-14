import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Users,
  Search,
  Check,
  Copy,
  RotateCcw,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TargetAudienceStructure } from '../../../academic';
import type { StudentDocument } from '../../../students/types/student.types';
import {
  type ReachEstimatorMode,
  computeStudentDemographics,
  filterMatchingStudents,
  filterVisibleCourses,
  filterVisibleSections,
} from '../../utils/student-reach.utils';

interface StudentPopulationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeStudents: StudentDocument[];
  structure: TargetAudienceStructure;
}

const MODE_OPTIONS: Array<{ key: ReachEstimatorMode; label: string }> = [
  { key: 'all', label: 'All Students' },
  { key: 'shs', label: 'SHS Only' },
  { key: 'college', label: 'College Only' },
  { key: 'custom', label: 'Custom Selection' },
];

export const StudentPopulationGuideModal: React.FC<StudentPopulationGuideModalProps> = ({
  isOpen,
  onClose,
  activeStudents,
  structure,
}) => {
  const [mode, setMode] = useState<ReachEstimatorMode>('all');
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [sectionSearch, setSectionSearch] = useState<string>('');
  const [feePerStudentInput, setFeePerStudentInput] = useState<string>('');
  const [copiedEstimate, setCopiedEstimate] = useState<boolean>(false);

  const {
    courses: activeCourses,
    sections: activeSections,
    shsPrograms,
    collegePrograms,
    allPrograms,
    shsCourseCodes,
    shsYearLevels,
    collegeYearLevels,
    allYearLevels,
  } = structure;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const demographics = useMemo(
    () =>
      computeStudentDemographics(
        activeStudents,
        shsPrograms,
        collegePrograms,
        shsCourseCodes,
        activeCourses
      ),
    [activeStudents, shsPrograms, collegePrograms, shsCourseCodes, activeCourses]
  );

  const availableYears = useMemo(() => {
    if (mode === 'shs') return shsYearLevels;
    if (mode === 'college') return collegeYearLevels;
    return allYearLevels;
  }, [mode, shsYearLevels, collegeYearLevels, allYearLevels]);

  const visibleCourses = useMemo(
    () =>
      filterVisibleCourses(
        allPrograms,
        shsPrograms,
        collegePrograms,
        activeSections,
        mode,
        selectedYears
      ),
    [allPrograms, shsPrograms, collegePrograms, activeSections, mode, selectedYears]
  );

  const visibleSections = useMemo(
    () =>
      filterVisibleSections(activeSections, activeCourses, shsCourseCodes, {
        mode,
        courseCodes: selectedCourses,
        years: selectedYears,
        search: sectionSearch,
      }),
    [activeSections, activeCourses, shsCourseCodes, mode, selectedCourses, selectedYears, sectionSearch]
  );

  const matchingStudents = useMemo(
    () =>
      filterMatchingStudents(activeStudents, {
        mode,
        years: selectedYears,
        courseCodes: selectedCourses,
        sections: selectedSections,
        shsCourseCodes,
        activeCourses,
      }),
    [activeStudents, mode, selectedYears, selectedCourses, selectedSections, shsCourseCodes, activeCourses]
  );

  const handleModeChange = (nextMode: ReachEstimatorMode) => {
    setMode(nextMode);
    setSelectedYears([]);
    setSelectedCourses([]);
    setSelectedSections([]);
    setSectionSearch('');
  };

  const handleResetFilters = () => {
    handleModeChange('all');
    setFeePerStudentInput('');
  };

  const toggleItem = (
    item: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const matchingCount = matchingStudents.length;
  const parsedFee = parseFloat(feePerStudentInput);
  const estimatedCollection =
    Number.isFinite(parsedFee) && parsedFee > 0 ? matchingCount * parsedFee : 0;

  const handleCopyValue = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedEstimate(true);
      toast.success(`Copied ${label} (${val})`);
      setTimeout(() => setCopiedEstimate(false), 1500);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Student Population Guide"
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-[#003575] to-[#004A98] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">Student Population Guide</h3>
              <p className="text-[11px] text-blue-100/90 mt-0.5">
                Live enrolled count from Student Registry — reference guide for revenue projections
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/15 transition-colors"
            title="Close guide"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Read-only notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              This is a <strong>read-only reference</strong>. Changing filters here will not overwrite your Target Market or Estimated Attendance from Step 3.
            </span>
          </div>

          {/* Live Matching Count & Quick Fee Multiplier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Matching Active Students
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-emerald-700 tabular-nums">
                    {matchingCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500">
                    of {activeStudents.length.toLocaleString()} total
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleCopyValue(String(matchingCount), 'student count')}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                title="Copy matching student count"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold text-slate-700">
                  Quick Fee Check (₱ / student)
                </label>
                {estimatedCollection > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyValue(
                        String(Math.round(estimatedCollection * 100) / 100),
                        'estimated total'
                      )
                    }
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:text-blue-800"
                  >
                    {copiedEstimate ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Total</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={feePerStudentInput}
                  onChange={(e) => setFeePerStudentInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-28 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 tabular-nums"
                />
                <span className="text-xs text-slate-400">× {matchingCount.toLocaleString()} =</span>
                <span className="text-sm font-black text-slate-800 tabular-nums truncate">
                  ₱{estimatedCollection.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Mode Tabs + Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {MODE_OPTIONS.map((opt) => {
                const isActive = mode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleModeChange(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isActive
                        ? 'bg-[#003575] text-white border-[#003575] shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {mode !== 'all' && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Campus Breakdown when All Students */}
          {mode === 'all' && (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-lg bg-white border border-slate-200/80">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Campus Total</p>
                  <p className="text-lg font-black text-slate-800 mt-0.5 tabular-nums">
                    {demographics.total.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200/80">
                  <p className="text-[10px] font-bold uppercase text-amber-600">Senior High (SHS)</p>
                  <p className="text-lg font-black text-amber-700 mt-0.5 tabular-nums">
                    {demographics.shs.toLocaleString()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-white border border-slate-200/80">
                  <p className="text-[10px] font-bold uppercase text-blue-600">College</p>
                  <p className="text-lg font-black text-[#003575] mt-0.5 tabular-nums">
                    {demographics.college.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Per Program / Strand Breakdown */}
              {(demographics.shsByProgram.length > 0 || demographics.collegeByProgram.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {demographics.shsByProgram.length > 0 && (
                    <div className="p-3 rounded-lg bg-white border border-slate-200/80 space-y-1.5">
                      <p className="text-[11px] font-bold text-amber-800">SHS Strands</p>
                      <div className="flex flex-wrap gap-1.5">
                        {demographics.shsByProgram.map((item) => (
                          <span
                            key={item.code}
                            title={item.name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/70 text-[11px] font-medium text-amber-900"
                          >
                            <span>{item.code}</span>
                            <strong className="tabular-nums">{item.count.toLocaleString()}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {demographics.collegeByProgram.length > 0 && (
                    <div className="p-3 rounded-lg bg-white border border-slate-200/80 space-y-1.5">
                      <p className="text-[11px] font-bold text-blue-900">College Programs</p>
                      <div className="flex flex-wrap gap-1.5">
                        {demographics.collegeByProgram.map((item) => (
                          <span
                            key={item.code}
                            title={item.name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200/70 text-[11px] font-medium text-blue-900"
                          >
                            <span>{item.code}</span>
                            <strong className="tabular-nums">{item.count.toLocaleString()}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Detailed Filters when not All Students */}
          {mode !== 'all' && (
            <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              {/* Year Levels */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">
                    Year Levels {selectedYears.length > 0 && `(${selectedYears.length} selected)`}
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedYears(availableYears)}
                      className="text-blue-700 hover:underline font-semibold"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedYears([])}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableYears.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No year levels configured</span>
                  ) : (
                    availableYears.map((yr) => {
                      const active = selectedYears.includes(yr);
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => toggleItem(yr, setSelectedYears)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {yr}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Programs / Strands */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">
                    Programs / Strands {selectedCourses.length > 0 && `(${selectedCourses.length} selected)`}
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedCourses(visibleCourses.map((c) => c.code))}
                      className="text-blue-700 hover:underline font-semibold"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCourses([])}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {visibleCourses.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">
                      No programs match the selected year levels
                    </span>
                  ) : (
                    visibleCourses.map((course) => {
                      const active = selectedCourses.includes(course.code);
                      return (
                        <button
                          key={course.code}
                          type="button"
                          title={course.name}
                          onClick={() => toggleItem(course.code, setSelectedCourses)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {course.code}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Sections */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">
                    Sections {selectedSections.length > 0 && `(${selectedSections.length} selected)`}
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedSections((prev) =>
                          Array.from(new Set([...prev, ...visibleSections.map((s) => s.name)]))
                        )
                      }
                      className="text-blue-700 hover:underline font-semibold"
                    >
                      Select All Visible
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSections([])}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sectionSearch}
                    onChange={(e) => setSectionSearch(e.target.value)}
                    placeholder="Search section (e.g. BSIT-3A, STEM-11)..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {visibleSections.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">
                      No matching active sections found
                    </span>
                  ) : (
                    visibleSections.map((sec) => {
                      const active = selectedSections.includes(sec.name);
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => toggleItem(sec.name, setSelectedSections)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {sec.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Showing active students only (excludes archived/inactive/dropped).
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#003575] hover:bg-[#002859] text-white text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
