import React, { useMemo, useState } from 'react';
import {
  Users,
  Check,
  CheckSquare,
  Search,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { useTargetAudienceStructure } from '../../academic';
import { useStudents } from '../../students/hooks/useStudentStream';

export type OperationalAudienceScope = 'all' | 'members' | 'specific';
export type OperationalAcademicLevel = 'COLLEGE' | 'SHS' | 'BOTH';

interface OperationalAudienceSelectorProps {
  audienceScope: OperationalAudienceScope;
  academicLevel: OperationalAcademicLevel;
  targetCourses: string[];
  targetYearLevels: string[];
  targetSections: string[];
  onChangeScope: (scope: OperationalAudienceScope) => void;
  onChangeAcademicLevel: (lvl: OperationalAcademicLevel) => void;
  onChangeCourses: (courses: string[]) => void;
  onChangeYearLevels: (years: string[]) => void;
  onChangeSections: (sections: string[]) => void;
  readOnly?: boolean;
  hasHostingOrg?: boolean;
  title?: string;
  subtitle?: string;
  reachLabel?: string;
}

export function isSpecificFilterValid(
  scope: OperationalAudienceScope,
  academicLevel: OperationalAcademicLevel,
  targetCourses: string[],
  targetYearLevels: string[],
  targetSections: string[]
): boolean {
  if (scope !== 'specific') return true;
  return (
    academicLevel !== 'BOTH' ||
    targetCourses.length > 0 ||
    targetYearLevels.length > 0 ||
    targetSections.length > 0
  );
}

export function buildOperationalAudiencePayload(params: {
  audienceScope: OperationalAudienceScope;
  academicLevel: OperationalAcademicLevel;
  targetCourses: string[];
  targetYearLevels: string[];
  targetSections: string[];
}) {
  const {
    audienceScope,
    academicLevel,
    targetCourses,
    targetYearLevels,
    targetSections,
  } = params;

  const effectiveScope: OperationalAudienceScope = audienceScope;
  const isAllStudents = effectiveScope === 'all';

  const normalizedLevel: OperationalAcademicLevel =
    effectiveScope === 'specific' ? academicLevel : 'BOTH';
  const normalizedCourses = effectiveScope === 'specific' ? targetCourses : [];
  const normalizedYears = effectiveScope === 'specific' ? targetYearLevels : [];
  const normalizedSections = effectiveScope === 'specific' ? targetSections : [];

  const targetAudienceObj = {
    allStudents: isAllStudents,
    scope: effectiveScope,
    academicLevels:
      normalizedLevel === 'BOTH'
        ? ['College', 'SHS']
        : normalizedLevel === 'SHS'
        ? ['SHS']
        : ['College'],
    departmentIds: [],
    courseCodes: normalizedCourses,
    courses: normalizedCourses,
    yearLevels: normalizedYears,
    sections: normalizedSections,
  };

  return {
    allStudents: isAllStudents,
    targetAudienceScope: effectiveScope,
    targetAcademicLevel: normalizedLevel,
    targetDepartments: [] as string[],
    targetDepartmentIds: [] as string[],
    targetCourses: normalizedCourses,
    targetYearLevels: normalizedYears,
    targetSections: normalizedSections,
    targetAudience: targetAudienceObj,
  };
}

export default function OperationalAudienceSelector({
  audienceScope,
  academicLevel,
  targetCourses,
  targetYearLevels,
  targetSections,
  onChangeScope,
  onChangeAcademicLevel,
  onChangeCourses,
  onChangeYearLevels,
  onChangeSections,
  readOnly = false,
  hasHostingOrg = true,
  title = 'Target Participant Scope & Academic Filters',
  subtitle = 'Required for mobile app visibility and scanner eligibility. Defaults to All Campus Students.',
  reachLabel = 'matching active students in registry',
}: OperationalAudienceSelectorProps) {
  const audienceStructure = useTargetAudienceStructure();
  const { data: allStudentsData = [] } = useStudents();
  const [sectionSearch, setSectionSearch] = useState('');

  const availablePrograms = audienceStructure.getProgramsForAcademicLevel(academicLevel);
  const availableYearLevels = audienceStructure.getYearLevelsForAcademicLevel(academicLevel);

  const visibleSections = useMemo(() => {
    let list = audienceStructure.sections || [];
    if (academicLevel === 'SHS') {
      list = list.filter((s) => audienceStructure.isShsSection(s));
    } else if (academicLevel === 'COLLEGE') {
      list = list.filter((s) => !audienceStructure.isShsSection(s));
    }

    if (targetCourses.length > 0) {
      const selectedCourseIds = new Set(
        audienceStructure.courses
          .filter((c) => targetCourses.includes(c.code))
          .map((c) => c.id)
      );
      list = list.filter(
        (sec) =>
          (sec.courseId && selectedCourseIds.has(sec.courseId)) ||
          targetCourses.some((code) => sec.name.toUpperCase().includes(code.toUpperCase()))
      );
    }

    if (targetYearLevels.length > 0) {
      list = list.filter((sec) => {
        const secName = sec.name.toUpperCase();
        const yNum = Number(sec.yearLevel);
        return targetYearLevels.some((yearStr) => {
          const yrDigits = yearStr.replace(/\D/g, '');
          if (yrDigits && (yNum === Number(yrDigits) || secName.includes(yrDigits))) return true;
          if (yearStr.toLowerCase().includes('grade 11') && (yNum === 11 || secName.includes('11'))) return true;
          if (yearStr.toLowerCase().includes('grade 12') && (yNum === 12 || secName.includes('12'))) return true;
          if (yearStr.toLowerCase().includes('1st') && (yNum === 1 || secName.includes('1101'))) return true;
          if (yearStr.toLowerCase().includes('2nd') && (yNum === 2 || secName.includes('1102'))) return true;
          if (yearStr.toLowerCase().includes('3rd') && (yNum === 3 || secName.includes('1103'))) return true;
          if (yearStr.toLowerCase().includes('4th') && (yNum === 4 || secName.includes('1104') || secName.includes('4101'))) return true;
          return false;
        });
      });
    }

    if (sectionSearch.trim()) {
      const q = sectionSearch.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    return list;
  }, [audienceStructure, academicLevel, targetCourses, targetYearLevels, sectionSearch]);

  const calculatedReach = useMemo(() => {
    if (!allStudentsData || allStudentsData.length === 0) return 0;
    return allStudentsData.filter((s) => {
      const sStatus = (s.status || 'ACTIVE').toUpperCase();
      if (
        (s as any).archived ||
        sStatus === 'INACTIVE' ||
        sStatus === 'ARCHIVED' ||
        sStatus === 'RETURNED' ||
        sStatus === 'DROPPED'
      ) {
        return false;
      }

      if (audienceScope === 'all' || audienceScope === 'members') {
        return true;
      }

      if (
        academicLevel === 'BOTH' &&
        targetCourses.length === 0 &&
        targetYearLevels.length === 0 &&
        targetSections.length === 0
      ) {
        return true;
      }

      const y = String(s.yearLevel || '').toUpperCase();
      const c = String(s.courseCode || '').toUpperCase();
      const lvl = String(s.academicLevel || '').toUpperCase();
      const isShs =
        lvl === 'SHS' ||
        (lvl !== 'COLLEGE' &&
          (y.includes('11') ||
            y.includes('12') ||
            y.includes('GRADE 11') ||
            y.includes('GRADE 12') ||
            y.includes('G11') ||
            y.includes('G12') ||
            c.includes('SHS') ||
            c.includes('STEM') ||
            c.includes('ABM') ||
            c.includes('HUMSS') ||
            c.includes('GAS') ||
            c.includes('TVL')));

      if (academicLevel === 'SHS' && !isShs) return false;
      if (academicLevel === 'COLLEGE' && isShs) return false;

      if (targetYearLevels.length > 0) {
        const sYear = String(s.yearLevel || '').trim().toLowerCase();
        const sYearDigits = sYear.replace(/\D/g, '');
        const matchesYear = targetYearLevels.some((tYear) => {
          const t = tYear.trim().toLowerCase();
          if (t === sYear) return true;
          const tDigits = t.replace(/\D/g, '');
          if (sYearDigits && tDigits && sYearDigits === tDigits) return true;
          if ((t.includes('11') || t.includes('g11')) && (sYear.includes('11') || sYear.includes('g11'))) return true;
          if ((t.includes('12') || t.includes('g12')) && (sYear.includes('12') || sYear.includes('g12'))) return true;
          if (t.includes('1st') && (sYear.includes('1st') || sYear === '1')) return true;
          if (t.includes('2nd') && (sYear.includes('2nd') || sYear === '2')) return true;
          if (t.includes('3rd') && (sYear.includes('3rd') || sYear === '3')) return true;
          if (t.includes('4th') && (sYear.includes('4th') || sYear === '4')) return true;
          return false;
        });
        if (!matchesYear) return false;
      }

      if (targetCourses.length > 0) {
        const sCourseId = String(s.courseId || '').trim().toLowerCase();
        const sCourseCode = String(s.courseCode || '').trim().toLowerCase();
        const sCourseName = String(s.courseName || '').trim().toLowerCase();
        const matchesCourse = targetCourses.some((code) => {
          const tc = code.trim().toLowerCase();
          return (
            tc === sCourseCode ||
            tc === sCourseId ||
            tc === sCourseName ||
            (sCourseCode && tc.includes(sCourseCode)) ||
            (sCourseName && (tc.includes(sCourseName) || sCourseName.includes(tc)))
          );
        });
        if (!matchesCourse) return false;
      }

      if (targetSections.length > 0) {
        const sSec = String(s.section || '').trim().toLowerCase();
        const sSecClean = sSec.replace(/[^a-z0-9]/g, '');
        const matchesSection = targetSections.some((tSec) => {
          const ts = tSec.trim().toLowerCase();
          if (ts === sSec) return true;
          const tsClean = ts.replace(/[^a-z0-9]/g, '');
          if (sSecClean && tsClean && sSecClean === tsClean) return true;
          return sSec.includes(ts) || ts.includes(sSec);
        });
        if (!matchesSection) return false;
      }

      return true;
    }).length;
  }, [allStudentsData, audienceScope, academicLevel, targetCourses, targetYearLevels, targetSections]);

  const missingSpecificCriteria = !isSpecificFilterValid(
    audienceScope,
    academicLevel,
    targetCourses,
    targetYearLevels,
    targetSections
  );

  const toggleCourse = (code: string) => {
    onChangeCourses(
      targetCourses.includes(code)
        ? targetCourses.filter((c) => c !== code)
        : [...targetCourses, code]
    );
  };

  const toggleYear = (year: string) => {
    onChangeYearLevels(
      targetYearLevels.includes(year)
        ? targetYearLevels.filter((y) => y !== year)
        : [...targetYearLevels, year]
    );
  };

  const toggleSection = (secName: string) => {
    onChangeSections(
      targetSections.includes(secName)
        ? targetSections.filter((s) => s !== secName)
        : [...targetSections, secName]
    );
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {title} <span className="text-red-500">*</span>
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-[#001A4D] border border-blue-200">
              Required
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Live Reach Card */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900">
                Eligible Student Pool
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-200/60 text-[#001A4D]">
                Live DB
              </span>
            </div>
            <div className="text-sm font-black text-[#001A4D]">
              {audienceScope === 'members'
                ? 'Active Organization Members Only'
                : `${calculatedReach.toLocaleString()} `}
              {audienceScope !== 'members' && (
                <span className="text-xs font-semibold text-gray-500">{reachLabel}</span>
              )}
            </div>
          </div>
        </div>
        <span className="text-[11px] font-bold text-blue-900 bg-white/90 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
          {audienceScope === 'members'
            ? 'Org Members Only'
            : audienceScope === 'all'
            ? 'All Students (Default)'
            : `${academicLevel} Cohort`}
        </span>
      </div>

      {/* Scope Selector (Always visible & required) */}
      <div>
        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1.5">
          Participant Scope <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {(
            [
              { id: 'all', label: 'All Campus Students (Default)' },
              ...(hasHostingOrg ? [{ id: 'members', label: 'Organization Members Only' } as const] : []),
              { id: 'specific', label: 'Specific Academic Filter' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={readOnly}
              onClick={() => onChangeScope(opt.id)}
              className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 ${
                readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
              } ${
                audienceScope === opt.id
                  ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.id === 'members' && <Lock className="w-3 h-3" />}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Specific Academic Filters */}
      {audienceScope === 'specific' && (
        <div className="pt-3 border-t border-slate-200/70 space-y-4">
          {missingSpecificCriteria && !readOnly && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-[11px] text-amber-900 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                Select at least one Division (College/SHS), Year Level, Program/Strand, or Section, or switch back to &quot;All Campus Students&quot;.
              </span>
            </div>
          )}

          {/* Academic Division */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
              Academic Division
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(['COLLEGE', 'SHS', 'BOTH'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    onChangeAcademicLevel(lvl);
                    onChangeCourses([]);
                    onChangeYearLevels([]);
                    onChangeSections([]);
                  }}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all text-center ${
                    readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                  } ${
                    academicLevel === lvl
                      ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {lvl === 'BOTH' ? 'SHS & College' : lvl === 'SHS' ? 'Senior High (SHS)' : 'College Only'}
                </button>
              ))}
            </div>
          </div>

          {/* Year Levels */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Target Year Levels ({targetYearLevels.length === 0 ? 'All in division' : `${targetYearLevels.length} selected`})
              </label>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeYearLevels(availableYearLevels)}
                    className="text-xs text-[#001A4D] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Select All ({availableYearLevels.length})
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => onChangeYearLevels([])}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableYearLevels.map((year) => {
                const isSelected = targetYearLevels.includes(year);
                return (
                  <button
                    key={year}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleYear(year)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#001A4D]'
                    }`}
                  >
                    <span>{year}</span>
                    {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Academic Programs / Strands */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Academic Programs / Strands ({targetCourses.length === 0 ? 'All in division' : `${targetCourses.length} selected`})
              </label>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeCourses(availablePrograms.map((p) => p.code))}
                    className="text-xs text-[#001A4D] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Select All ({availablePrograms.length})
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => onChangeCourses([])}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availablePrograms.map((p) => {
                const isSelected = targetCourses.includes(p.code);
                return (
                  <button
                    key={p.id || p.code}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleCourse(p.code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                      readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#001A4D]'
                    }`}
                  >
                    <span>{p.code}</span>
                    <span className="text-[10px] opacity-75 font-normal">({p.name})</span>
                    {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sections */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase">
                Sections ({targetSections.length === 0 ? 'All sections' : `${targetSections.length} selected`})
              </label>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const visibleNames = visibleSections.map((s) => s.name);
                      onChangeSections(Array.from(new Set([...targetSections, ...visibleNames])));
                    }}
                    className="text-xs text-[#001A4D] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Select All Visible ({visibleSections.length})
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const visibleSet = new Set(visibleSections.map((s) => s.name));
                      onChangeSections(targetSections.filter((s) => !visibleSet.has(s)));
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {!readOnly && (
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={sectionSearch}
                  onChange={(e) => setSectionSearch(e.target.value)}
                  placeholder="Search sections (e.g. BSIT 3101, STEM 11-A)..."
                  className="w-full pl-8 pr-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#001A4D]"
                />
              </div>
            )}

            {visibleSections.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">
                No matching sections found for current filter.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                {visibleSections.map((sec) => {
                  const isSelected = targetSections.includes(sec.name);
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggleSection(sec.name)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                        readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] font-bold shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span>{sec.name}</span>
                      {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

