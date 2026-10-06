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
  School,
  GraduationCap,
  Users,
  Search,
  Check,
  Building,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { useTargetAudienceStructure, type DynamicProgram } from '../../../academic';
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

export default function Step3LogisticsMarketing({ formData, onChange, errors = {} }: Step3Props) {
  // Fetch real programs / strands, sections, and departments dynamically from Firestore database
  const audienceStructure = useTargetAudienceStructure();
  const {
    courses: activeCourses,
    sections: activeSections,
    departments: activeDepartments,
    shsPrograms,
    collegePrograms,
    allPrograms,
    shsCourseCodes,
    collegeCourseCodes,
    allCourseCodes,
    shsYearLevels,
    collegeYearLevels,
    allYearLevels,
    isShsCourse: checkIsShsCourse,
  } = audienceStructure;

  const isShsCourse = (course: any): boolean => {
    return checkIsShsCourse(course?.code || course?.id || '');
  };

  const isShsSection = (section: any): boolean => {
    if (!section) return false;
    const name = String(section.name || '').toUpperCase();
    const y = Number(section.yearLevel);
    if (section.academicLevel === 'SHS') return true;
    if (section.academicLevel === 'COLLEGE') return false;
    if (y === 11 || y === 12) return true;
    if (y >= 1 && y <= 6) return false;
    return (
      name.includes('G11') ||
      name.includes('G12') ||
      name.includes('11-') ||
      name.includes('12-') ||
      name.includes('GRADE 11') ||
      name.includes('GRADE 12') ||
      shsCourseCodes.some((code) => name.includes(code))
    );
  };

  const materials = formData.materials || [];
  const [materialInput, setMaterialInput] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');

  const targetAudience: ProposalTargetAudience = formData.targetAudience || {
    academicLevels: ['College', 'SHS'],
    departments: ['All Academic Departments'],
    yearLevels: allYearLevels,
    courses: allPrograms.map((p) => p.id),
    courseCodes: allCourseCodes,
    sections: activeSections.map((s) => s.name),
    allStudents: true,
  };

  const selectedCourses: string[] = targetAudience.courses || [];
  const selectedCourseCodes: string[] = targetAudience.courseCodes || [];
  const selectedSections: string[] = targetAudience.sections || [];
  const selectedYears: string[] = (targetAudience.yearLevels || []).map(String);

  type AudienceMode = 'all' | 'shs' | 'college' | 'custom';

  const currentMode: AudienceMode = useMemo(() => {
    if (targetAudience.allStudents || targetAudience.allStudents === undefined) {
      return 'all';
    }
    const levels = targetAudience.academicLevels || [];
    if (levels.length === 1 && levels[0] === 'SHS') return 'shs';
    if (levels.length === 1 && levels[0] === 'College') return 'college';
    return 'custom';
  }, [targetAudience]);

  // Dynamic list of available year levels based on active mode
  const currentAvailableYearLevels = useMemo(() => {
    if (currentMode === 'shs') return shsYearLevels;
    if (currentMode === 'college') return collegeYearLevels;
    return allYearLevels;
  }, [currentMode, shsYearLevels, collegeYearLevels, allYearLevels]);

  // Dynamic filter for visible courses based on active mode
  const visibleCourses = useMemo(() => {
    if (currentMode === 'shs') return shsPrograms;
    if (currentMode === 'college') return collegePrograms;
    return allPrograms;
  }, [shsPrograms, collegePrograms, allPrograms, currentMode]);

  // Dynamic filter for visible sections based on active mode, selected courses, selected years, and search
  const visibleSections = useMemo(() => {
    let list = activeSections;
    if (currentMode === 'shs') {
      list = activeSections.filter(isShsSection);
    } else if (currentMode === 'college') {
      list = activeSections.filter((s) => !isShsSection(s));
    }

    // Further filter by selected courses if any are chosen
    if (selectedCourseCodes.length > 0) {
      list = list.filter((sec) => {
        return (
          selectedCourses.includes(sec.courseId) ||
          selectedCourseCodes.some((code) =>
            sec.name.toUpperCase().includes(code.toUpperCase())
          )
        );
      });
    }

    // Further filter by selected year levels if specific years are chosen
    if (selectedYears.length > 0) {
      list = list.filter((sec) => {
        const secName = sec.name.toUpperCase();
        const yNum = Number(sec.yearLevel);
        return selectedYears.some((yearStr) => {
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
  }, [activeSections, currentMode, selectedCourses, selectedCourseCodes, selectedYears, sectionSearch, isShsSection]);

  // Helper to re-derive department linkages
  const syncDepartmentLinkages = (
    nextCourseCodes: string[],
    nextCourseIds: string[],
    nextSections: string[],
    academicLevels: ('SHS' | 'College')[]
  ) => {
    const deptIds = new Set<string>();
    const deptNames = new Set<string>();

    // From selected courses
    nextCourseIds.forEach((cId) => {
      const c = activeCourses.find((course) => course.id === cId);
      if (c?.departmentId) {
        deptIds.add(c.departmentId);
        const d = activeDepartments.find((dept) => dept.id === c.departmentId);
        if (d) deptNames.add(d.name || d.code);
      }
    });

    // From selected sections
    nextSections.forEach((secName) => {
      const sec = activeSections.find((s) => s.name === secName);
      if (sec) {
        if (sec.departmentId) {
          deptIds.add(sec.departmentId);
          const d = activeDepartments.find((dept) => dept.id === sec.departmentId);
          if (d) deptNames.add(d.name || d.code);
        } else if (sec.courseId) {
          const c = activeCourses.find((course) => course.id === sec.courseId);
          if (c?.departmentId) {
            deptIds.add(c.departmentId);
            const d = activeDepartments.find((dept) => dept.id === c.departmentId);
            if (d) deptNames.add(d.name || d.code);
          }
        }
      }
    });

    // If SHS level is involved, ensure SHS department is captured
    if (academicLevels.includes('SHS')) {
      const shsDept = activeDepartments.find(
        (d) =>
          d.code?.toUpperCase() === 'SHS' ||
          d.name?.toLowerCase().includes('senior high') ||
          (d as any).academicLevel === 'SHS'
      );
      if (shsDept) {
        deptIds.add(shsDept.id);
        deptNames.add(shsDept.name || shsDept.code);
      }
    }

    return {
      departmentIds: Array.from(deptIds),
      departments: Array.from(deptNames),
    };
  };

  const handleSelectMode = (newMode: AudienceMode) => {
    if (newMode === 'all') {
      onChange({
        targetAudience: {
          scope: 'all',
          allStudents: true,
          academicLevels: ['College', 'SHS'],
          departmentIds: activeDepartments.map((d) => d.id),
          departments: activeDepartments.map((d) => d.name || d.code),
          courses: allPrograms.map((p) => p.id),
          courseCodes: allCourseCodes,
          sections: activeSections.map((s) => s.name),
          yearLevels: allYearLevels,
        },
      });
      return;
    }

    if (newMode === 'shs') {
      const shsSections = activeSections.filter(isShsSection);
      const shsDeptIds = new Set<string>();
      const shsDeptNames = new Set<string>();

      activeDepartments.forEach((d) => {
        if (
          d.code?.toUpperCase() === 'SHS' ||
          d.name?.toLowerCase().includes('senior high') ||
          (d as any).academicLevel === 'SHS'
        ) {
          shsDeptIds.add(d.id);
          shsDeptNames.add(d.name || d.code);
        }
      });
      shsPrograms.forEach((c) => {
        if (c.departmentId) {
          shsDeptIds.add(c.departmentId);
          const dept = activeDepartments.find((d) => d.id === c.departmentId);
          if (dept) shsDeptNames.add(dept.name || dept.code);
        }
      });

      onChange({
        targetAudience: {
          scope: 'specific',
          allStudents: false,
          academicLevels: ['SHS'],
          departmentIds: Array.from(shsDeptIds),
          departments: Array.from(shsDeptNames).length > 0 ? Array.from(shsDeptNames) : ['Senior High School'],
          courses: shsPrograms.map((c) => c.id),
          courseCodes: shsCourseCodes,
          sections: shsSections.map((s) => s.name),
          yearLevels: shsYearLevels,
        },
      });
      return;
    }

    if (newMode === 'college') {
      const collegeSections = activeSections.filter((s) => !isShsSection(s));
      const collegeDeptIds = new Set<string>();
      const collegeDeptNames = new Set<string>();

      collegePrograms.forEach((c) => {
        if (c.departmentId) {
          collegeDeptIds.add(c.departmentId);
          const dept = activeDepartments.find((d) => d.id === c.departmentId);
          if (dept) collegeDeptNames.add(dept.name || dept.code);
        }
      });

      onChange({
        targetAudience: {
          scope: 'specific',
          allStudents: false,
          academicLevels: ['College'],
          departmentIds: Array.from(collegeDeptIds),
          departments: Array.from(collegeDeptNames),
          courses: collegePrograms.map((c) => c.id),
          courseCodes: collegeCourseCodes,
          sections: collegeSections.map((s) => s.name),
          yearLevels: collegeYearLevels,
        },
      });
      return;
    }

    // Custom
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        scope: 'specific',
      },
    });
  };

  const toggleCourseSelection = (course: any) => {
    const isSelected = (targetAudience.courseCodes || []).includes(course.code);
    const nextCodes = isSelected
      ? (targetAudience.courseCodes || []).filter((c) => c !== course.code)
      : [...(targetAudience.courseCodes || []), course.code];
    const nextCourseIds = isSelected
      ? (targetAudience.courses || []).filter((id) => id !== course.id)
      : [...(targetAudience.courses || []), course.id];

    const currentSectionsList = targetAudience.sections || [];
    const { departmentIds, departments: dNames } = syncDepartmentLinkages(
      nextCodes,
      nextCourseIds,
      currentSectionsList,
      targetAudience.academicLevels || ['College']
    );

    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        courseCodes: nextCodes,
        courses: nextCourseIds,
        departmentIds,
        departments: dNames,
      },
    });
  };

  const toggleSectionSelection = (sectionName: string) => {
    const isSelected = (targetAudience.sections || []).includes(sectionName);
    const nextSections = isSelected
      ? (targetAudience.sections || []).filter((s) => s !== sectionName)
      : [...(targetAudience.sections || []), sectionName];

    const { departmentIds, departments: dNames } = syncDepartmentLinkages(
      targetAudience.courseCodes || [],
      targetAudience.courses || [],
      nextSections,
      targetAudience.academicLevels || ['College']
    );

    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        sections: nextSections,
        departmentIds,
        departments: dNames,
      },
    });
  };

  const selectAllVisibleSections = () => {
    const visibleNames = visibleSections.map((s) => s.name);
    const combined = Array.from(new Set([...(targetAudience.sections || []), ...visibleNames]));
    const { departmentIds, departments: dNames } = syncDepartmentLinkages(
      targetAudience.courseCodes || [],
      targetAudience.courses || [],
      combined,
      targetAudience.academicLevels || ['College']
    );
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        sections: combined,
        departmentIds,
        departments: dNames,
      },
    });
  };

  const clearVisibleSections = () => {
    const visibleNames = new Set(visibleSections.map((s) => s.name));
    const remaining = (targetAudience.sections || []).filter((s) => !visibleNames.has(s));
    const { departmentIds, departments: dNames } = syncDepartmentLinkages(
      targetAudience.courseCodes || [],
      targetAudience.courses || [],
      remaining,
      targetAudience.academicLevels || ['College']
    );
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        sections: remaining,
        departmentIds,
        departments: dNames,
      },
    });
  };

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
    if (targetAudience.allStudents) {
      return ['All Students (Campus-Wide)'];
    }
    const list: string[] = [];
    if (targetAudience.courseCodes && targetAudience.courseCodes.length > 0) {
      list.push(...targetAudience.courseCodes);
    }
    if (targetAudience.sections && targetAudience.sections.length > 0) {
      list.push(...targetAudience.sections);
    }
    if (targetAudience.departments && targetAudience.departments.length > 0) {
      targetAudience.departments.forEach((d) => {
        if (!list.includes(d)) list.push(d);
      });
    }
    return list;
  }, [targetAudience]);

  const handleAddTargetMarket = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || targetMarkets.includes(trimmed)) return;
    const updated = [...targetMarkets, trimmed];
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        departments: updated,
        courseCodes: updated,
        courses: updated,
        academicLevels: targetAudience.academicLevels && targetAudience.academicLevels.length > 0 ? targetAudience.academicLevels : ['College'],
      },
    });
    setTargetMarketInput('');
  };

  const handleRemoveTargetMarket = (marketToRemove: string) => {
    const nextCodes = (targetAudience.courseCodes || []).filter((c) => c !== marketToRemove);
    const nextSections = (targetAudience.sections || []).filter((s) => s !== marketToRemove);
    const nextDepts = (targetAudience.departments || []).filter((d) => d !== marketToRemove);

    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        courseCodes: nextCodes,
        sections: nextSections,
        departments: nextDepts,
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
        allStudents: false,
        yearLevels: updatedYears,
      },
    });
  };

  const selectAllYears = () => {
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        yearLevels: currentAvailableYearLevels,
      },
    });
  };

  const clearAllYears = () => {
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        yearLevels: [],
      },
    });
  };

  const selectAllPrograms = () => {
    const codes = visibleCourses.map((c) => c.code);
    const ids = visibleCourses.map((c) => c.id);
    const { departmentIds, departments: dNames } = syncDepartmentLinkages(
      codes,
      ids,
      targetAudience.sections || [],
      targetAudience.academicLevels || ['College']
    );
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        courseCodes: codes,
        courses: ids,
        departmentIds,
        departments: dNames,
      },
    });
  };

  const clearAllPrograms = () => {
    const { departmentIds, departments: dNames } = syncDepartmentLinkages(
      [],
      [],
      targetAudience.sections || [],
      targetAudience.academicLevels || ['College']
    );
    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: false,
        courseCodes: [],
        courses: [],
        departmentIds,
        departments: dNames,
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

      {/* ── Section 8: Target market (DYNAMIC SCOPE & DATABASE-DRIVEN SELECTION) ── */}
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
            {targetAudience.allStudents
              ? 'Campus-Wide (All Students)'
              : `${targetMarkets.length} Target Item(s) Selected`}
          </span>
        </div>

        {/* 1. Dynamic Audience Scope Selector (Pills) */}
        <div className="bg-slate-50 p-1.5 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectMode('all')}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              currentMode === 'all'
                ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>All Students (Default)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('shs')}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              currentMode === 'shs'
                ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>SHS Only</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('college')}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              currentMode === 'college'
                ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>College Only</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('custom')}
            className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              currentMode === 'custom'
                ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Custom Selection</span>
          </button>
        </div>

        {/* Mode Info Banner */}
        {currentMode === 'all' ? (
          <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-900 space-y-1">
            <div className="flex items-center gap-2 font-bold text-sm text-[#001A4D]">
              <Users className="w-4 h-4 text-[#001A4D]" />
              <span>Campus-Wide Coverage: All Students (College & Senior High)</span>
            </div>
            <p className="text-blue-700 leading-relaxed text-xs">
              Every academic department is involved. By policy, <strong>all institutional signatories with assigned academic departments</strong> will be dynamically included in Stage 2 to review and endorse this proposal.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. Target Year Levels (Dynamically derived from Database) */}
            <div className="p-4 border border-gray-200 rounded-2xl bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#0E4EBD]" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Target Year Levels (
                    {selectedYears.length === 0
                      ? 'All Levels'
                      : `${selectedYears.length} of ${currentAvailableYearLevels.length} Selected`}
                    )
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllYears}
                    className="text-xs text-[#0E4EBD] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Select All ({currentAvailableYearLevels.length})
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
                {currentAvailableYearLevels.map((year) => {
                  const isSelected = selectedYears.includes(year);
                  return (
                    <button
                      type="button"
                      key={year}
                      onClick={() => toggleYearLevel(year)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#001A4D] hover:bg-gray-100'
                      }`}
                    >
                      <span>{year}</span>
                      {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Filter by Academic Programs / Strands (Dynamically derived from Database) */}
            <div className="p-4 border border-gray-200 rounded-2xl bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#001A4D]" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    {currentMode === 'shs'
                      ? 'Senior High School Tracks & Strands'
                      : currentMode === 'college'
                      ? 'College Academic Programs'
                      : 'All Academic Programs & Strands'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 mr-1">
                    {selectedCourseCodes.length} of {visibleCourses.length} Selected
                  </span>
                  <button
                    type="button"
                    onClick={selectAllPrograms}
                    className="text-xs text-[#001A4D] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Select All ({visibleCourses.length})
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={clearAllPrograms}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {visibleCourses.map((c) => {
                  const isSelected = selectedCourseCodes.includes(c.code);
                  return (
                    <button
                      type="button"
                      key={c.id || c.code}
                      onClick={() => toggleCourseSelection(c)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#001A4D] hover:bg-gray-100'
                      }`}
                    >
                      <span>{c.code}</span>
                      <span className="text-[10px] opacity-75">({c.name})</span>
                      {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Filter by Sections (Dynamically filtered by selected years & programs) */}
            <div className="p-4 border border-gray-200 rounded-2xl bg-white space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#001A4D]" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    {currentMode === 'shs'
                      ? 'Senior High School Sections'
                      : currentMode === 'college'
                      ? 'College Sections'
                      : 'Academic Sections'}
                  </span>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    {selectedSections.length} Selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllVisibleSections}
                    className="text-xs text-[#001A4D] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Select All Visible ({visibleSections.length})
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={clearVisibleSections}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Search box for section */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={sectionSearch}
                  onChange={(e) => setSectionSearch(e.target.value)}
                  placeholder={`Search ${currentMode === 'shs' ? 'SHS' : currentMode === 'college' ? 'College' : ''} sections (e.g. ${currentMode === 'shs' ? 'STEM 11-A' : 'BSIT 3101'})...`}
                  className="w-full pl-8 pr-3.5 py-1.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#001A4D]"
                />
              </div>

              {/* Sections Chips */}
              {visibleSections.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-2 text-center">
                  No matching sections found for the current selection filter.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                  {visibleSections.map((sec) => {
                    const isSelected = selectedSections.includes(sec.name);
                    return (
                      <button
                        type="button"
                        key={sec.id}
                        onClick={() => toggleSectionSelection(sec.name)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] font-bold shadow-2xs'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
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

            {/* 4. Custom Audience Tag Input (Optional supplementary tags) */}
            <div className="p-4 border border-gray-200 rounded-2xl bg-white space-y-2">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                Additional Custom Audience Tags (Optional)
              </span>
              <div className="flex gap-2">
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
                  placeholder="Type specialized audience (e.g. Student Council Officers, Graduating Batch)..."
                  className="flex-1 px-3.5 py-2 bg-gray-50/60 border border-gray-300 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
                />
                <button
                  type="button"
                  onClick={() => handleAddTargetMarket(targetMarketInput)}
                  className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Tag
                </button>
              </div>

              {/* Active Target Badges Summary */}
              {targetMarkets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {targetMarkets.map((m, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-medium"
                    >
                      <span>{m}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTargetMarket(m)}
                        className="text-slate-400 hover:text-red-500 transition-colors ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
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
