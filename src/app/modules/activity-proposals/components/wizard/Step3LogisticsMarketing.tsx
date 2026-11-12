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
  BarChart3,
  TrendingUp,
  Percent,
  Sliders,
  Briefcase,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTargetAudienceStructure, type DynamicProgram } from '../../../academic';
import { useStudents } from '../../../students/hooks/useStudentStream';
import { subscribeToSignatories } from '../../../signatories/services/signatory.service';
import type { InstitutionalSignatory } from '../../../signatories/types/signatory.types';
import type { ProposalFormData, ProposalTargetAudience } from '../../types/proposal.types';
import {
  AIAssistButton,
  AISuggestionModal,
  enhanceMaterialsList,
  enhanceMarketingPlan,
  enhanceDocumentationPlan,
  generateMaterialsFromPrompt,
  generateMarketingPlanFromPrompt,
  generateDocumentationPlanFromPrompt,
  validateMeaningfulInput,
} from '../../../ai';

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
  const { data: allStudentsData = [] } = useStudents();
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
    scope: 'all',
    academicLevels: ['College', 'SHS'],
    departments: ['All Academic Departments'],
    departmentIds: activeDepartments.map((d) => d.id),
    yearLevels: [],
    courses: [],
    courseCodes: [],
    sections: [],
    allStudents: true,
  };

  // ── Faculty & Staff Signatory Roster (For demographic breakdown if included) ──
  const [activeSignatories, setActiveSignatories] = useState<InstitutionalSignatory[]>([]);
  useEffect(() => {
    const unsub = subscribeToSignatories((list) => {
      setActiveSignatories(list.filter((s) => s.isActive !== false));
    });
    return () => unsub();
  }, []);

  const [includeFaculty, setIncludeFaculty] = useState<boolean>(
    Boolean(targetAudience.includeFaculty)
  );
  const [facultyCount, setFacultyCount] = useState<number>(
    targetAudience.facultyCount || (activeSignatories.length > 0 ? activeSignatories.length : 35)
  );
  const [expectedReachPercent, setExpectedReachPercent] = useState<number>(
    targetAudience.expectedReachPercentage || 90
  );

  useEffect(() => {
    if (activeSignatories.length > 0 && !targetAudience.facultyCount) {
      setFacultyCount(activeSignatories.length);
    }
  }, [activeSignatories.length, targetAudience.facultyCount]);

  // ── 1. Real-Time Active Students Registry Filter ──
  const activeStudents = useMemo(() => {
    if (!allStudentsData || allStudentsData.length === 0) return [];
    return allStudentsData.filter((s) => {
      const sStatus = (s.status || 'ACTIVE').toUpperCase();
      return !(
        (s as any).archived ||
        sStatus === 'INACTIVE' ||
        sStatus === 'ARCHIVED' ||
        sStatus === 'RETURNED' ||
        sStatus === 'DROPPED'
      );
    });
  }, [allStudentsData]);

  // ── 2. Dynamic Segmented Demographic Breakdown (SHS, College, per strand & program) ──
  const demographicStats = useMemo(() => {
    let shsTotal = 0;
    let collegeTotal = 0;

    // Track strand breakdowns
    const strandMap: Record<string, { code: string; name: string; count: number }> = {};
    shsPrograms.forEach((p) => {
      strandMap[p.code.toUpperCase()] = { code: p.code, name: p.name, count: 0 };
    });

    // Track college program breakdowns
    const programMap: Record<string, { code: string; name: string; count: number }> = {};
    collegePrograms.forEach((p) => {
      programMap[p.code.toUpperCase()] = { code: p.code, name: p.name, count: 0 };
    });

    activeStudents.forEach((s) => {
      const isShs = ((): boolean => {
        const lvl = String(s.academicLevel || '').toUpperCase();
        if (lvl === 'SHS') return true;
        if (lvl === 'COLLEGE') return false;
        const c = String(s.courseCode || '').toUpperCase();
        if (shsCourseCodes.some((code) => c.includes(code.toUpperCase()))) return true;
        const y = String(s.yearLevel || '').toUpperCase();
        if (y.includes('11') || y.includes('12') || y.includes('GRADE 11') || y.includes('GRADE 12')) return true;
        return false;
      })();

      const sCourse = String(s.courseCode || '').toUpperCase().trim();

      if (isShs) {
        shsTotal++;
        const matchedStrandKey = Object.keys(strandMap).find(
          (k) => k === sCourse || sCourse.includes(k) || k.includes(sCourse)
        );
        if (matchedStrandKey) {
          strandMap[matchedStrandKey].count++;
        } else if (sCourse) {
          if (!strandMap[sCourse]) {
            strandMap[sCourse] = { code: sCourse, name: s.courseName || sCourse, count: 0 };
          }
          strandMap[sCourse].count++;
        }
      } else {
        collegeTotal++;
        const matchedProgKey = Object.keys(programMap).find(
          (k) => k === sCourse || sCourse.includes(k) || k.includes(sCourse)
        );
        if (matchedProgKey) {
          programMap[matchedProgKey].count++;
        } else if (sCourse) {
          if (!programMap[sCourse]) {
            programMap[sCourse] = { code: sCourse, name: s.courseName || sCourse, count: 0 };
          }
          programMap[sCourse].count++;
        }
      }
    });

    const strandsList = Object.values(strandMap).sort((a, b) => b.count - a.count);
    const programsList = Object.values(programMap).sort((a, b) => b.count - a.count);

    return {
      shsTotal,
      collegeTotal,
      totalStudents: activeStudents.length,
      strandsList,
      programsList,
    };
  }, [activeStudents, shsPrograms, collegePrograms, shsCourseCodes]);

  const totalCampusPopulation = useMemo(() => {
    return demographicStats.totalStudents + (includeFaculty ? facultyCount : 0);
  }, [demographicStats.totalStudents, includeFaculty, facultyCount]);

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

  // Dynamic filter for visible courses based on active mode and selected years
  // If specific year levels (e.g. G11) are picked, only show strands that have sections for those years
  const visibleCourses = useMemo(() => {
    let list = allPrograms;
    if (currentMode === 'shs') list = shsPrograms;
    else if (currentMode === 'college') list = collegePrograms;

    if (selectedYears.length > 0) {
      const matchingSectionCourseIds = new Set<string>();
      const matchingSectionCourseCodes = new Set<string>();

      activeSections.forEach((sec) => {
        const secName = sec.name.toUpperCase();
        const yNum = Number(sec.yearLevel);
        const matchesAnyYear = selectedYears.some((yearStr) => {
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

        if (matchesAnyYear) {
          if (sec.courseId) matchingSectionCourseIds.add(sec.courseId);
          list.forEach((c) => {
            if (secName.includes(c.code.toUpperCase())) {
              matchingSectionCourseCodes.add(c.code.toUpperCase());
            }
          });
        }
      });

      if (matchingSectionCourseIds.size > 0 || matchingSectionCourseCodes.size > 0) {
        const filtered = list.filter(
          (c) => matchingSectionCourseIds.has(c.id) || matchingSectionCourseCodes.has(c.code.toUpperCase())
        );
        if (filtered.length > 0) return filtered;
      }
    }

    return list;
  }, [shsPrograms, collegePrograms, allPrograms, currentMode, selectedYears, activeSections]);

  // Real-time calculation of actual eligible student reach from database
  const calculatedReach = useMemo(() => {
    if (!allStudentsData || allStudentsData.length === 0) return 0;
    return allStudentsData.filter((s) => {
      // 1. Only Active students
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

      // Level 1: All Students (Campus-Wide)
      if (targetAudience.allStudents || currentMode === 'all') {
        return true;
      }

      // Level 2: Academic Division
      const isShs = ((): boolean => {
        const y = String(s.yearLevel || '').toUpperCase();
        const c = String(s.courseCode || '').toUpperCase();
        const lvl = String(s.academicLevel || '').toUpperCase();
        if (lvl === 'SHS') return true;
        if (lvl === 'COLLEGE') return false;
        if (
          y.includes('11') ||
          y.includes('12') ||
          y.includes('GRADE 11') ||
          y.includes('GRADE 12') ||
          y.includes('G11') ||
          y.includes('G12')
        )
          return true;
        if (
          c.includes('SHS') ||
          c.includes('STEM') ||
          c.includes('ABM') ||
          c.includes('HUMSS') ||
          c.includes('GAS') ||
          c.includes('TVL')
        )
          return true;
        return false;
      })();

      const levels = targetAudience.academicLevels || [];
      if (levels.length === 1) {
        if (levels[0] === 'SHS' && !isShs) return false;
        if (levels[0] === 'College' && isShs) return false;
      }

      // Level 3: Year Levels (if empty -> wildcard)
      const targetYears = (targetAudience.yearLevels || []).map(String).filter(Boolean);
      if (targetYears.length > 0) {
        const sYear = String(s.yearLevel || '').trim().toLowerCase();
        const sYearDigits = sYear.replace(/\D/g, '');
        const matchesYear = targetYears.some((tYear) => {
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

      // Level 4: Courses / Strands (if empty -> wildcard)
      const targetCourseCodesList = (targetAudience.courseCodes || []).map(String).filter(Boolean);
      const targetCourseIdsList = (targetAudience.courses || []).map(String).filter(Boolean);
      if (targetCourseCodesList.length > 0 || targetCourseIdsList.length > 0) {
        const sCourseId = String(s.courseId || '').trim().toLowerCase();
        const sCourseCode = String(s.courseCode || '').trim().toLowerCase();
        const sCourseName = String(s.courseName || '').trim().toLowerCase();

        const matchesCourse =
          targetCourseCodesList.some((c) => {
            const tc = c.trim().toLowerCase();
            return (
              tc === sCourseCode ||
              tc === sCourseId ||
              tc === sCourseName ||
              (sCourseCode && tc.includes(sCourseCode)) ||
              (sCourseName && (tc.includes(sCourseName) || sCourseName.includes(tc)))
            );
          }) || targetCourseIdsList.some((id) => id.toLowerCase() === sCourseId);

        if (!matchesCourse) return false;
      }

      // Level 5: Sections (if empty -> wildcard)
      const targetSectionsList = (targetAudience.sections || []).map(String).filter(Boolean);
      if (targetSectionsList.length > 0) {
        const sSec = String(s.section || '').trim().toLowerCase();
        const sSecClean = sSec.replace(/[^a-z0-9]/g, '');
        const matchesSection = targetSectionsList.some((tSec) => {
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
  }, [allStudentsData, targetAudience, currentMode]);

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

    // If College level is involved and no specific department captured, include all college departments
    if (academicLevels.includes('College') && deptIds.size === 0) {
      activeDepartments.forEach((d) => {
        if (d.code?.toUpperCase() !== 'SHS' && !(d as any).academicLevel?.includes('SHS')) {
          deptIds.add(d.id);
          deptNames.add(d.name || d.code);
        }
      });
    }

    return {
      departmentIds: Array.from(deptIds),
      departments: Array.from(deptNames),
    };
  };

  const handleSelectMode = (newMode: AudienceMode) => {
    if (newMode === 'all') {
      const effectiveTotal = demographicStats.totalStudents + (includeFaculty ? facultyCount : 0);
      const calculatedAttendees = Math.max(1, Math.round(effectiveTotal * (expectedReachPercent / 100)));
      setAttendanceCount(calculatedAttendees);
      const qual = includeFaculty ? 'students & faculty' : 'students';
      updateAttendance(calculatedAttendees, qual);

      const strandsBreakdownObj: Record<string, number> = {};
      demographicStats.strandsList.forEach((st) => {
        strandsBreakdownObj[st.code] = st.count;
      });

      const programsBreakdownObj: Record<string, number> = {};
      demographicStats.programsList.forEach((pr) => {
        programsBreakdownObj[pr.code] = pr.count;
      });

      onChange({
        targetAudience: {
          scope: 'all',
          allStudents: true,
          academicLevels: ['College', 'SHS'],
          departmentIds: activeDepartments.map((d) => d.id),
          departments: ['All Academic Departments'],
          courses: [],
          courseCodes: [],
          sections: [],
          yearLevels: [],
          includeFaculty,
          facultyCount: includeFaculty ? facultyCount : 0,
          expectedReachPercentage: expectedReachPercent,
          demographicBreakdown: {
            shsTotal: demographicStats.shsTotal,
            collegeTotal: demographicStats.collegeTotal,
            facultyTotal: includeFaculty ? facultyCount : 0,
            totalPopulation: effectiveTotal,
            expectedAttendees: calculatedAttendees,
            expectedReachPercentage: expectedReachPercent,
            strandsBreakdown: strandsBreakdownObj,
            programsBreakdown: programsBreakdownObj,
          },
        },
      });
      return;
    }

    if (newMode === 'shs') {
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

      const allShsCodes = shsPrograms.map((p) => p.code).filter(Boolean);
      const allShsCourses = shsPrograms.map((p) => p.name).filter(Boolean);
      const allShsYears = shsYearLevels.map(String);
      const allShsSections = activeSections.filter((s) => isShsSection(s)).map((s) => s.name).filter(Boolean);

      onChange({
        targetAudience: {
          ...targetAudience,
          scope: 'specific',
          allStudents: false,
          academicLevels: ['SHS'],
          departmentIds: Array.from(shsDeptIds),
          departments: Array.from(shsDeptNames).length > 0 ? Array.from(shsDeptNames) : ['Senior High School'],
          courses: allShsCourses,
          courseCodes: allShsCodes,
          sections: allShsSections,
          yearLevels: allShsYears,
        },
      });
      return;
    }

    if (newMode === 'college') {
      const collegeDeptIds = new Set<string>();
      const collegeDeptNames = new Set<string>();

      collegePrograms.forEach((c) => {
        if (c.departmentId) {
          collegeDeptIds.add(c.departmentId);
          const dept = activeDepartments.find((d) => d.id === c.departmentId);
          if (dept) collegeDeptNames.add(dept.name || dept.code);
        }
      });

      const allCollegeCodes = collegePrograms.map((p) => p.code).filter(Boolean);
      const allCollegeCourses = collegePrograms.map((p) => p.name).filter(Boolean);
      const allCollegeYears = collegeYearLevels.map(String);
      const allCollegeSections = activeSections.filter((s) => !isShsSection(s)).map((s) => s.name).filter(Boolean);

      onChange({
        targetAudience: {
          ...targetAudience,
          scope: 'specific',
          allStudents: false,
          academicLevels: ['College'],
          departmentIds: Array.from(collegeDeptIds),
          departments: Array.from(collegeDeptNames),
          courses: allCollegeCourses,
          courseCodes: allCollegeCodes,
          sections: allCollegeSections,
          yearLevels: allCollegeYears,
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

  const applyExpectedReach = (percent: number, facultyIncluded = includeFaculty, customFacultyNum = facultyCount) => {
    setExpectedReachPercent(percent);
    const effectiveTotal = demographicStats.totalStudents + (facultyIncluded ? customFacultyNum : 0);
    const calculatedAttendees = Math.max(1, Math.round(effectiveTotal * (percent / 100)));
    setAttendanceCount(calculatedAttendees);
    const qual = facultyIncluded ? 'students & faculty' : 'students';
    updateAttendance(calculatedAttendees, qual);

    const strandsBreakdownObj: Record<string, number> = {};
    demographicStats.strandsList.forEach((st) => {
      strandsBreakdownObj[st.code] = st.count;
    });

    const programsBreakdownObj: Record<string, number> = {};
    demographicStats.programsList.forEach((pr) => {
      programsBreakdownObj[pr.code] = pr.count;
    });

    onChange({
      targetAudience: {
        ...targetAudience,
        allStudents: true,
        scope: 'all',
        includeFaculty: facultyIncluded,
        facultyCount: facultyIncluded ? customFacultyNum : 0,
        expectedReachPercentage: percent,
        demographicBreakdown: {
          shsTotal: demographicStats.shsTotal,
          collegeTotal: demographicStats.collegeTotal,
          facultyTotal: facultyIncluded ? customFacultyNum : 0,
          totalPopulation: effectiveTotal,
          expectedAttendees: calculatedAttendees,
          expectedReachPercentage: percent,
          strandsBreakdown: strandsBreakdownObj,
          programsBreakdown: programsBreakdownObj,
        },
      },
    });
  };

  const handleToggleFaculty = (checked: boolean) => {
    setIncludeFaculty(checked);
    applyExpectedReach(expectedReachPercent, checked, facultyCount);
  };

  const handleFacultyCountChange = (countVal: number) => {
    const validCount = Math.max(1, countVal);
    setFacultyCount(validCount);
    applyExpectedReach(expectedReachPercent, includeFaculty, validCount);
  };

  // Auto-initialize 90% expected reach for "all" mode if attendance is unset on a brand new proposal
  useEffect(() => {
    const hasExistingCount =
      Boolean((formData as any).id) ||
      Boolean((formData as any).referenceNo) ||
      Boolean((formData as any).isReturnedProposal) ||
      Boolean(formData.estAttendanceCount && formData.estAttendanceCount > 0) ||
      Boolean(formData.estimatedAttendance) ||
      Boolean(formData.targetAudience?.expectedAttendees && formData.targetAudience.expectedAttendees > 0) ||
      Boolean((formData as any).expectedParticipantCount && (formData as any).expectedParticipantCount > 0);

    if (
      !hasExistingCount &&
      currentMode === 'all' &&
      totalCampusPopulation > 0
    ) {
      applyExpectedReach(expectedReachPercent, includeFaculty, facultyCount);
    }
  }, [currentMode, totalCampusPopulation]);

  // Derived effective reach percentage if user typed a custom number
  const effectiveReachPercentage = useMemo(() => {
    const countNum = Number(attendanceCount);
    if (!countNum || totalCampusPopulation <= 0) return expectedReachPercent;
    return Math.min(100, Math.round((countNum / totalCampusPopulation) * 100));
  }, [attendanceCount, totalCampusPopulation, expectedReachPercent]);

  const marketingPlan = formData.marketingPlan || [];
  const [marketingInput, setMarketingInput] = useState('');

  const documentationPlan = formData.documentationPlan || [];
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

  // Custom Target Market groups state
  const [customTargetName, setCustomTargetName] = useState('');
  const [customTargetCount, setCustomTargetCount] = useState<number | ''>('');
  const [isAddingCustomTarget, setIsAddingCustomTarget] = useState(false);

  const customTargets = useMemo(() => {
    return (formData.targetAudience?.customTargetMarkets || []) as { id: string; name: string; count: number }[];
  }, [formData.targetAudience?.customTargetMarkets]);

  const handleAddCustomTarget = () => {
    const trimmed = customTargetName.trim();
    const countNum = typeof customTargetCount === 'number' ? customTargetCount : parseInt(String(customTargetCount), 10);
    if (!trimmed || isNaN(countNum) || countNum <= 0) return;

    const newItem = {
      id: `custom-target-${Date.now()}`,
      name: trimmed,
      count: countNum,
    };
    const nextList = [...customTargets, newItem];
    onChange({
      targetAudience: {
        ...targetAudience,
        customTargetMarkets: nextList,
      },
    });
    setCustomTargetName('');
    setCustomTargetCount('');
    setIsAddingCustomTarget(false);
  };

  const handleRemoveCustomTarget = (idToRemove: string) => {
    const nextList = customTargets.filter((item) => item.id !== idToRemove);
    onChange({
      targetAudience: {
        ...targetAudience,
        customTargetMarkets: nextList,
      },
    });
  };

  const baseTargetMarketSummary = useMemo(() => {
    if (targetAudience.allStudents || currentMode === 'all') {
      return 'All STI Students';
    }
    if (currentMode === 'shs') {
      const years = selectedYears;
      const courses = selectedCourseCodes;
      const isAllShsYears = years.length === 0 || years.length >= shsYearLevels.length;
      const isAllShsStrands = courses.length === 0 || courses.length >= shsCourseCodes.length;

      if (isAllShsYears && isAllShsStrands) {
        return 'All Senior High School Students';
      }
      const yearPrefix = years.length === 1
        ? `Grade ${years[0]} SHS Students`
        : (isAllShsYears ? 'Senior High School Students' : `Grade ${years.join(' & ')} SHS Students`);
      const courseSuffix = isAllShsStrands ? '' : ` (${courses.join(', ')})`;
      return `${yearPrefix}${courseSuffix}`;
    }
    if (currentMode === 'college') {
      const years = selectedYears;
      const courses = selectedCourseCodes;
      const isAllCollegeYears = years.length === 0 || years.length >= collegeYearLevels.length;
      const isAllCollegeCourses = courses.length === 0 || courses.length >= collegeCourseCodes.length;

      if (isAllCollegeYears && isAllCollegeCourses) {
        return 'All College Students';
      }
      const yearPrefix = years.length === 1
        ? `${years[0]}${years[0] === '1' ? 'st' : years[0] === '2' ? 'nd' : years[0] === '3' ? 'rd' : 'th'} Year College Students`
        : (isAllCollegeYears ? 'College Students' : `${years.map((y) => `${y}${y === '1' ? 'st' : y === '2' ? 'nd' : y === '3' ? 'rd' : 'th'}`).join(' & ')} Year College Students`);
      const courseSuffix = isAllCollegeCourses ? '' : ` (${courses.join(', ')})`;
      return `${yearPrefix}${courseSuffix}`;
    }
    return 'Selected Student Audience';
  }, [currentMode, targetAudience.allStudents, selectedYears, selectedCourseCodes, shsYearLevels, collegeYearLevels, shsCourseCodes, collegeCourseCodes]);

  const defaultCombinedTargetMarket = useMemo(() => {
    const customNames = customTargets.map((t) => t.name.trim()).filter(Boolean);
    if (customNames.length === 0) return baseTargetMarketSummary;
    return `${baseTargetMarketSummary} and ${customNames.join(', ')}`;
  }, [baseTargetMarketSummary, customTargets]);

  const [targetMarketText, setTargetMarketText] = useState(
    formData.targetMarket || formData.targetAudience?.targetMarketSummary || defaultCombinedTargetMarket
  );

  useEffect(() => {
    setTargetMarketText(defaultCombinedTargetMarket);
    onChange({
      targetMarket: defaultCombinedTargetMarket,
      targetAudience: {
        ...targetAudience,
        targetMarketSummary: defaultCombinedTargetMarket,
      },
    });
  }, [defaultCombinedTargetMarket]);

  const studentEligibleReach = useMemo(() => {
    if (targetAudience.allStudents || currentMode === 'all') {
      return demographicStats.totalStudents;
    }
    return calculatedReach;
  }, [targetAudience.allStudents, currentMode, demographicStats.totalStudents, calculatedReach]);

  const customEligibleReach = useMemo(() => {
    return customTargets.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  }, [customTargets]);

  const totalActualEligibleReach = useMemo(() => {
    return studentEligibleReach + customEligibleReach;
  }, [studentEligibleReach, customEligibleReach]);

  useEffect(() => {
    if (formData.targetAudience?.actualEligibleReach !== totalActualEligibleReach) {
      onChange({
        targetAudience: {
          ...targetAudience,
          actualEligibleReach: totalActualEligibleReach,
        },
      });
    }
  }, [totalActualEligibleReach, formData.targetAudience?.actualEligibleReach]);

  const [targetMarketInput, setTargetMarketInput] = useState('');

  const targetMarkets: string[] = useMemo(() => {
    if (targetAudience.allStudents || currentMode === 'all') {
      return ['All Students (Campus-Wide)'];
    }
    const list: string[] = [];
    if (
      currentMode === 'shs' &&
      (!targetAudience.yearLevels || targetAudience.yearLevels.length === 0) &&
      (!targetAudience.courseCodes || targetAudience.courseCodes.length === 0) &&
      (!targetAudience.sections || targetAudience.sections.length === 0)
    ) {
      list.push('All Senior High Students');
    } else if (
      currentMode === 'college' &&
      (!targetAudience.yearLevels || targetAudience.yearLevels.length === 0) &&
      (!targetAudience.courseCodes || targetAudience.courseCodes.length === 0) &&
      (!targetAudience.sections || targetAudience.sections.length === 0)
    ) {
      list.push('All College Students');
    }

    if (targetAudience.yearLevels && targetAudience.yearLevels.length > 0) {
      targetAudience.yearLevels.forEach((y) => list.push(String(y)));
    }
    if (targetAudience.courseCodes && targetAudience.courseCodes.length > 0) {
      targetAudience.courseCodes.forEach((c) => list.push(c));
    }
    if (targetAudience.sections && targetAudience.sections.length > 0) {
      targetAudience.sections.forEach((s) => list.push(s));
    }
    return list;
  }, [targetAudience, currentMode]);

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

  // ── AI State & Handlers for Step 3 ──
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiModalDesc, setAiModalDesc] = useState('');
  const [aiSuggestionList, setAiSuggestionList] = useState<string[]>([]);
  const [activeGeneratingField, setActiveGeneratingField] = useState<'materials' | 'marketing' | 'documentation' | null>(null);
  const [aiTargetField, setAiTargetField] = useState<'materials' | 'marketing' | 'documentation'>('materials');
  const [activeAIAction, setActiveAIAction] = useState<(() => Promise<void>) | null>(null);

  const hasMaterialsInput = (formData.materials || []).some((m) => m.trim().length > 0);
  const hasMarketingInput = (formData.marketingPlan || []).some((m) => m.trim().length > 0);
  const hasDocInput = (formData.documentationPlan || []).some((d) => d.trim().length > 0);

  const handleEnhanceMaterialsAction = async () => {
    if (activeGeneratingField) return;
    const rawList = (formData.materials || []).filter((m) => m.trim().length > 0);
    if (rawList.length === 0) {
      handleCreateMaterialsPrompt();
      return;
    }
    const action = async () => {
      setActiveGeneratingField('materials');
      try {
        const list = await enhanceMaterialsList(rawList);
        if (list && list.length > 0) {
          setAiTargetField('materials');
          setAiModalTitle('Enhance Materials Checklist');
          setAiModalDesc('Standardized into formal campus equipment & specifications:');
          setAiSuggestionList(list);
          setAiModalOpen(true);
        } else {
          toast.info('Could not enhance materials. Please verify your items.');
        }
      } catch (err) {
        console.error('Error enhancing materials:', err);
        toast.error('Failed to enhance materials. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateMaterialsPrompt = () => {
    if (activeGeneratingField) return;
    setAiTargetField('materials');
    setAiModalTitle('Generate Materials Checklist with AI');
    setAiModalDesc('Prompt special equipment, technical setup, or supplies needed:');
    setAiSuggestionList([]);
    setAiModalOpen(true);
  };

  const handleEnhanceMarketingAction = async () => {
    if (activeGeneratingField) return;
    const rawList = (formData.marketingPlan || []).filter((m) => m.trim().length > 0);
    if (rawList.length === 0) {
      handleCreateMarketingPrompt();
      return;
    }
    const action = async () => {
      setActiveGeneratingField('marketing');
      try {
        const list = await enhanceMarketingPlan(rawList);
        if (list && list.length > 0) {
          setAiTargetField('marketing');
          setAiModalTitle('Enhance Marketing Strategy');
          setAiModalDesc('Elevated to formal campus campaign promotional tactics:');
          setAiSuggestionList(list);
          setAiModalOpen(true);
        } else {
          toast.info('Could not enhance marketing plan. Please verify your entries.');
        }
      } catch (err) {
        console.error('Error enhancing marketing plan:', err);
        toast.error('Failed to enhance marketing plan. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateMarketingPrompt = () => {
    if (activeGeneratingField) return;
    setAiTargetField('marketing');
    setAiModalTitle('Generate Marketing Strategy with AI');
    setAiModalDesc('Prompt how you wish to promote this event or reach students:');
    setAiSuggestionList([]);
    setAiModalOpen(true);
  };

  const handleEnhanceDocumentationAction = async () => {
    if (activeGeneratingField) return;
    const rawList = (formData.documentationPlan || []).filter((d) => d.trim().length > 0);
    if (rawList.length === 0) {
      handleCreateDocumentationPrompt();
      return;
    }
    const action = async () => {
      setActiveGeneratingField('documentation');
      try {
        const list = await enhanceDocumentationPlan(rawList);
        if (list && list.length > 0) {
          setAiTargetField('documentation');
          setAiModalTitle('Enhance Documentation Deliverables');
          setAiModalDesc('Standardized into official Post-Activity Report (PAR) deliverables:');
          setAiSuggestionList(list);
          setAiModalOpen(true);
        } else {
          toast.info('Could not enhance documentation deliverables. Please verify your items.');
        }
      } catch (err) {
        console.error('Error enhancing documentation:', err);
        toast.error('Failed to enhance documentation. Please try again.');
      } finally {
        setActiveGeneratingField(null);
      }
    };
    setActiveAIAction(() => action);
    await action();
  };

  const handleCreateDocumentationPrompt = () => {
    if (activeGeneratingField) return;
    setAiTargetField('documentation');
    setAiModalTitle('Generate Documentation Deliverables with AI');
    setAiModalDesc('Prompt custom post-event reporting, media, or documentation requirements:');
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

    const title = formData.title?.trim() || 'Campus Activity';
    setActiveGeneratingField(aiTargetField);

    try {
      if (aiTargetField === 'materials') {
        const list = await generateMaterialsFromPrompt(title, prompt, formData.category);
        if (list && list.length > 0) setAiSuggestionList(list);
        else toast.info('No materials could be generated from that prompt.');
      } else if (aiTargetField === 'marketing') {
        const list = await generateMarketingPlanFromPrompt(
          title,
          targetAudience.academicLevels?.join(', ') || 'College & SHS',
          prompt
        );
        if (list && list.length > 0) setAiSuggestionList(list);
        else toast.info('No marketing strategies could be generated from that prompt.');
      } else if (aiTargetField === 'documentation') {
        const list = await generateDocumentationPlanFromPrompt(title, prompt);
        if (list && list.length > 0) setAiSuggestionList(list);
        else toast.info('No documentation items could be generated from that prompt.');
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

    if (aiTargetField === 'materials') {
      onChange({ materials: selectedItems });
      toast.success(`${hasMaterialsInput ? 'Updated' : 'Added'} ${selectedItems.length} material item(s)!`);
    } else if (aiTargetField === 'marketing') {
      onChange({ marketingPlan: selectedItems });
      toast.success(`${hasMarketingInput ? 'Updated' : 'Added'} ${selectedItems.length} marketing channel(s)!`);
    } else if (aiTargetField === 'documentation') {
      onChange({ documentationPlan: selectedItems });
      toast.success(`${hasDocInput ? 'Updated' : 'Added'} ${selectedItems.length} documentation deliverable(s)!`);
    }
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
          <div className="flex items-center gap-2">
            <AIAssistButton
              label={hasMaterialsInput ? 'Enhance Materials' : 'Generate with AI'}
              isLoading={activeGeneratingField === 'materials'}
              disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'materials')}
              options={
                hasMaterialsInput
                  ? [
                      {
                        id: 'enhance-mat',
                        label: 'Enhance Materials Checklist',
                        description: 'Standardize into formal campus equipment & specifications',
                        icon: <Wand2 className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleEnhanceMaterialsAction,
                      },
                    ]
                  : [
                      {
                        id: 'generate-mat',
                        label: 'Generate Materials from Prompt',
                        description: 'Type needed equipment, audio-visual, or logistics supplies',
                        icon: <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleCreateMaterialsPrompt,
                      },
                    ]
              }
            />
            <span className="text-[11px] text-gray-400">
              {materials.length} item{materials.length === 1 ? '' : 's'} recorded
            </span>
          </div>
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

        {/* Mode Info & Dynamic Segmented Demographic Breakdown */}
        {currentMode === 'all' ? (
          <div className="p-4 bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white border border-blue-200/80 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold shadow-xs flex-shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-[#001A4D]">
                    Campus-Wide Student Population
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#001A4D] border border-blue-200">
                    Live Registry
                  </span>
                </div>
                <p className="text-blue-700 text-xs mt-0.5">
                  All active enrolled STI College students across all departments and grade levels.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-2xs">
                <div className="flex items-center justify-between text-gray-500 text-[11px] font-semibold">
                  <span>Total Campus Students</span>
                  <Users className="w-3.5 h-3.5 text-[#001A4D]" />
                </div>
                <div className="text-lg font-black text-[#001A4D] mt-1">
                  {demographicStats.totalStudents.toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">Enrolled Student Registry</div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-2xs">
                <div className="flex items-center justify-between text-gray-500 text-[11px] font-semibold">
                  <span>Senior High School</span>
                  <School className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-lg font-black text-slate-800 mt-1">
                  {demographicStats.shsTotal.toLocaleString()}
                </div>
                <div className="text-[10px] text-amber-700 font-medium mt-0.5">Grades 11 & 12</div>
              </div>

              <div className="p-3 bg-white rounded-xl border border-blue-100 shadow-2xs">
                <div className="flex items-center justify-between text-gray-500 text-[11px] font-semibold">
                  <span>Tertiary / College</span>
                  <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-lg font-black text-slate-800 mt-1">
                  {demographicStats.collegeTotal.toLocaleString()}
                </div>
                <div className="text-[10px] text-blue-700 font-medium mt-0.5">1st to 4th Year Programs</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. Target Year Levels (Dynamically derived from Database) */}
            <div className="p-4 border border-gray-200 rounded-2xl bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#0E4EBD]" />
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <span>Target Year Levels</span>
                    {selectedYears.length === 0 ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        All Year Levels (Default)
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        {selectedYears.length} of {currentAvailableYearLevels.length} Selected
                      </span>
                    )}
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
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <span>
                      {currentMode === 'shs'
                        ? 'Senior High School Tracks & Strands'
                        : currentMode === 'college'
                        ? 'College Academic Programs'
                        : 'All Academic Programs & Strands'}
                    </span>
                    {selectedCourseCodes.length === 0 ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        All Strands / Programs (Default)
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        {selectedCourseCodes.length} of {visibleCourses.length} Selected
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
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
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <span>
                      {currentMode === 'shs'
                        ? 'Senior High School Sections'
                        : currentMode === 'college'
                        ? 'College Sections'
                        : 'Academic Sections'}
                    </span>
                    {selectedSections.length === 0 ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        All Sections (Default)
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        {selectedSections.length} Selected
                      </span>
                    )}
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
          </div>
        )}

        {/* Dynamic Target Market Summary & Custom Target Market Builder */}
        <div className="p-4 bg-slate-50/80 border border-slate-200/90 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>Target Market</span>
                <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-gray-500">
                Official target market for Form AP-01 (automatically derived from audience filters + custom groups)
              </p>
            </div>
            {!isAddingCustomTarget && (
              <button
                type="button"
                onClick={() => setIsAddingCustomTarget(true)}
                className="px-3 py-1.5 bg-[#001A4D] hover:bg-[#0A2E6D] text-[#FFD41C] text-xs font-bold rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Custom Target Market</span>
              </button>
            )}
          </div>

          {/* Target market input field */}
          <div className="relative">
            <input
              type="text"
              value={targetMarketText}
              onChange={(e) => {
                const val = e.target.value;
                setTargetMarketText(val);
                onChange({
                  targetMarket: val,
                  targetAudience: {
                    ...targetAudience,
                    targetMarketSummary: val,
                  },
                });
              }}
              placeholder="e.g. All STI Students, 3rd Year College Students (BSIT)..."
              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
            />
          </div>

          {/* Inline Add Custom Target Market Form */}
          {isAddingCustomTarget && (
            <div className="p-3.5 bg-white border border-blue-200 rounded-xl space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#001A4D] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Add Custom Target Group</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCustomTarget(false);
                    setCustomTargetName('');
                    setCustomTargetCount('');
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xs cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Group Name / Description
                  </label>
                  <input
                    type="text"
                    value={customTargetName}
                    onChange={(e) => setCustomTargetName(e.target.value)}
                    placeholder="e.g. Faculty & Staff, Alumni, External Guests"
                    className="w-full px-3 py-1.5 bg-gray-50/70 border border-gray-300 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#001A4D]"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Headcount (Pax)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={customTargetCount}
                    onChange={(e) => setCustomTargetCount(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    placeholder="e.g. 35"
                    className="w-full px-3 py-1.5 bg-gray-50/70 border border-gray-300 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#001A4D]"
                  />
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={handleAddCustomTarget}
                    disabled={!customTargetName.trim() || !customTargetCount || Number(customTargetCount) <= 0}
                    className="w-full py-1.5 px-3 bg-[#001A4D] hover:bg-[#0A2E6D] disabled:opacity-50 text-[#FFD41C] text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Custom Target Badges */}
          {customTargets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-gray-500">Custom Target Groups:</span>
              {customTargets.map((ct) => (
                <span
                  key={ct.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold"
                >
                  <span>{ct.name}</span>
                  <span className="px-1.5 py-0.2 bg-amber-200/80 rounded text-[10px] font-extrabold text-[#001A4D]">
                    +{ct.count} pax
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomTarget(ct.id)}
                    className="text-amber-600 hover:text-red-600 transition-colors cursor-pointer ml-0.5"
                    title={`Remove ${ct.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
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

        {/* Unified Actual Eligible Reach Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white border border-blue-200/80 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold shadow-xs flex-shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#001A4D]">
                    Actual Eligible Reach
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#001A4D] border border-blue-200">
                    Live Pool
                  </span>
                </div>
                <div className="text-base sm:text-xl font-black text-[#001A4D]">
                  {totalActualEligibleReach.toLocaleString()}{' ' }
                  <span className="text-xs font-semibold text-gray-500">
                    total eligible persons ({studentEligibleReach.toLocaleString()} students{customEligibleReach > 0 ? ` + ${customEligibleReach.toLocaleString()} custom` : ''})
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Turnout Presets */}
            {totalActualEligibleReach > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-gray-500 mr-1">Quick Presets:</span>
                {[
                  { label: '25%', ratio: 0.25 },
                  { label: '50%', ratio: 0.5 },
                  { label: '75%', ratio: 0.75 },
                  { label: '90%', ratio: 0.9 },
                  { label: '100%', ratio: 1.0 },
                ].map((preset) => {
                  const estCount = Math.max(1, Math.round(totalActualEligibleReach * preset.ratio));
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setAttendanceCount(estCount);
                        updateAttendance(estCount, attendanceQualifier);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-[#001A4D] border border-blue-200 hover:bg-[#001A4D] hover:text-[#FFD41C] hover:border-[#001A4D] transition-all shadow-2xs cursor-pointer"
                      title={`Set estimated attendance to ${estCount} (${preset.label} of eligible reach)`}
                    >
                      {preset.label} (~{estCount})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Validation warning if estimated attendance exceeds actual eligible reach */}
          {Number(attendanceCount) > totalActualEligibleReach && totalActualEligibleReach > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Estimated attendance exceeds actual eligible reach!</p>
                <p className="text-[11px] text-red-700 mt-0.5">
                  Your estimated attendance ({Number(attendanceCount).toLocaleString()}) cannot exceed the total eligible pool ({totalActualEligibleReach.toLocaleString()}). Please adjust the estimated number or add custom target market headcounts.
                </p>
              </div>
            </div>
          )}

          {Number(attendanceCount) > 0 && totalActualEligibleReach > 0 && Number(attendanceCount) <= totalActualEligibleReach && (
            <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs text-gray-600">
              <span>
                Projected turnout: <strong className="text-[#001A4D]">{attendanceCount}</strong> of <strong className="text-[#001A4D]">{totalActualEligibleReach.toLocaleString()}</strong> eligible reach
              </span>
              <span className="font-bold text-emerald-700">
                {Math.round((Number(attendanceCount) / totalActualEligibleReach) * 100)}% turnout rate
              </span>
            </div>
          )}
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
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] ${
                  errors.estimatedAttendance || (Number(attendanceCount) > totalActualEligibleReach && totalActualEligibleReach > 0)
                    ? 'border-red-400 bg-red-50/20'
                    : 'border-gray-300'
                }`}
              />
            </div>
            {errors.estimatedAttendance && (
              <p className="text-[11px] text-red-600 font-medium mt-1">{errors.estimatedAttendance}</p>
            )}
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
          <div className="flex items-center gap-2">
            <AIAssistButton
              label={hasMarketingInput ? 'Enhance Marketing' : 'Generate with AI'}
              isLoading={activeGeneratingField === 'marketing'}
              disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'marketing')}
              options={
                hasMarketingInput
                  ? [
                      {
                        id: 'enhance-mkt',
                        label: 'Enhance Existing Marketing Plan',
                        description: 'Elevate into formal campus promotion strategies',
                        icon: <Wand2 className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleEnhanceMarketingAction,
                      },
                    ]
                  : [
                      {
                        id: 'generate-mkt',
                        label: 'Generate Marketing Plan from Prompt',
                        description: 'Type campaign channels or promotion ideas',
                        icon: <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleCreateMarketingPrompt,
                      },
                    ]
              }
            />
            <span className="text-[11px] text-gray-400">
              {marketingPlan.length} channels
            </span>
          </div>
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
          <div className="flex items-center gap-2">
            <AIAssistButton
              label={hasDocInput ? 'Enhance Documentation' : 'Generate with AI'}
              isLoading={activeGeneratingField === 'documentation'}
              disabled={Boolean(activeGeneratingField && activeGeneratingField !== 'documentation')}
              options={
                hasDocInput
                  ? [
                      {
                        id: 'enhance-doc',
                        label: 'Enhance Existing Documentation',
                        description: 'Elevate into official STI Post-Activity Report deliverables',
                        icon: <Wand2 className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleEnhanceDocumentationAction,
                      },
                    ]
                  : [
                      {
                        id: 'generate-doc',
                        label: 'Generate Documentation from Prompt',
                        description: 'Type required reporting or media deliverables',
                        icon: <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />,
                        onClick: handleCreateDocumentationPrompt,
                      },
                    ]
              }
            />
            <span className="text-[11px] text-gray-400">
              {documentationPlan.length} deliverables
            </span>
          </div>
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

      {/* AI Suggestion Modal */}
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
          aiTargetField === 'materials'
            ? 'Prompt equipment or items needed (e.g. "sound system, 2 wireless mics, projector")...'
            : aiTargetField === 'marketing'
            ? 'Prompt promotion tactics (e.g. "Facebook teasers, classroom visits")...'
            : 'Prompt reporting outputs (e.g. "attendance sheets, photo documentation, evaluation tally")...'
        }
        onRegenerate={() => {
          if (activeAIAction) activeAIAction();
        }}
      />
    </div>
  );
}
