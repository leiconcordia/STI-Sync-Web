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

  // ── Read-Only Student Reach Estimator State (Section 9 helper only; never alters Target Market or Publishing) ──
  type ReachEstimatorMode = 'all' | 'shs' | 'college' | 'custom';
  const [estMode, setEstMode] = useState<ReachEstimatorMode>('all');
  const [estYears, setEstYears] = useState<string[]>([]);
  const [estCourseCodes, setEstCourseCodes] = useState<string[]>([]);
  const [estSections, setEstSections] = useState<string[]>([]);
  const [showReachCalculator, setShowReachCalculator] = useState<boolean>(true);

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

  const currentAvailableYearLevels = useMemo(() => {
    if (estMode === 'shs') return shsYearLevels;
    if (estMode === 'college') return collegeYearLevels;
    return allYearLevels;
  }, [estMode, shsYearLevels, collegeYearLevels, allYearLevels]);

  const visibleCourses = useMemo(() => {
    let list = allPrograms;
    if (estMode === 'shs') list = shsPrograms;
    else if (estMode === 'college') list = collegePrograms;

    if (estYears.length > 0) {
      const matchingSectionCourseIds = new Set<string>();
      const matchingSectionCourseCodes = new Set<string>();

      activeSections.forEach((sec) => {
        const secName = sec.name.toUpperCase();
        const yNum = Number(sec.yearLevel);
        const matchesAnyYear = estYears.some((yearStr) => {
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
  }, [shsPrograms, collegePrograms, allPrograms, estMode, estYears, activeSections]);

  // Real-time read-only calculation of matching enrolled students for Est. attendance reference
  const calculatedReach = useMemo(() => {
    if (!activeStudents || activeStudents.length === 0) return 0;
    if (estMode === 'all') return activeStudents.length;

    return activeStudents.filter((s) => {
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
            shsCourseCodes.some((code) => c.includes(code.toUpperCase()))));

      if (estMode === 'shs' && !isShs) return false;
      if (estMode === 'college' && isShs) return false;

      if (estYears.length > 0) {
        const sYear = String(s.yearLevel || '').trim().toLowerCase();
        const sYearDigits = sYear.replace(/\D/g, '');
        const matchesYear = estYears.some((tYear) => {
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

      if (estCourseCodes.length > 0) {
        const sCourseId = String(s.courseId || '').trim().toLowerCase();
        const sCourseCode = String(s.courseCode || '').trim().toLowerCase();
        const sCourseName = String(s.courseName || '').trim().toLowerCase();
        const matchesCourse = estCourseCodes.some((code) => {
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

      if (estSections.length > 0) {
        const sSec = String(s.section || '').trim().toLowerCase();
        const sSecClean = sSec.replace(/[^a-z0-9]/g, '');
        const matchesSection = estSections.some((tSec) => {
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
  }, [activeStudents, estMode, estYears, estCourseCodes, estSections, shsCourseCodes]);

  // Dynamic filter for visible sections in the Reach Calculator
  const visibleSections = useMemo(() => {
    let list = activeSections;
    if (estMode === 'shs') {
      list = activeSections.filter(isShsSection);
    } else if (estMode === 'college') {
      list = activeSections.filter((s) => !isShsSection(s));
    }

    if (estCourseCodes.length > 0) {
      const selectedIds = new Set(
        activeCourses.filter((c) => estCourseCodes.includes(c.code)).map((c) => c.id)
      );
      list = list.filter(
        (sec) =>
          (sec.courseId && selectedIds.has(sec.courseId)) ||
          estCourseCodes.some((code) => sec.name.toUpperCase().includes(code.toUpperCase()))
      );
    }

    if (estYears.length > 0) {
      list = list.filter((sec) => {
        const secName = sec.name.toUpperCase();
        const yNum = Number(sec.yearLevel);
        return estYears.some((yearStr) => {
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
  }, [activeSections, activeCourses, estMode, estCourseCodes, estYears, sectionSearch]);

  const handleSelectEstMode = (newMode: ReachEstimatorMode) => {
    setEstMode(newMode);
    setEstYears([]);
    setEstCourseCodes([]);
    setEstSections([]);
  };

  const toggleEstYear = (year: string) => {
    setEstYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  };

  const toggleEstCourse = (code: string) => {
    setEstCourseCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleEstSection = (secName: string) => {
    setEstSections((prev) => (prev.includes(secName) ? prev.filter((s) => s !== secName) : [...prev, secName]));
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

  // Auto-initialize default estimated attendance on a brand new proposal without mutating audience filters
  useEffect(() => {
    const hasExistingCount =
      Boolean((formData as any).id) ||
      Boolean((formData as any).referenceNo) ||
      Boolean((formData as any).isReturnedProposal) ||
      Boolean(formData.estAttendanceCount && formData.estAttendanceCount > 0) ||
      Boolean(formData.estimatedAttendance) ||
      Boolean((formData as any).expectedParticipantCount && (formData as any).expectedParticipantCount > 0);

    if (!hasExistingCount && totalCampusPopulation > 0) {
      const effectiveTotal = demographicStats.totalStudents + (includeFaculty ? facultyCount : 0);
      const calculatedAttendees = Math.max(1, Math.round(effectiveTotal * (expectedReachPercent / 100)));
      setAttendanceCount(calculatedAttendees);
      const qual = includeFaculty ? 'students & faculty' : 'students';
      updateAttendance(calculatedAttendees, qual);
    }
  }, [totalCampusPopulation]);

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

  // Free-text Target Market for Form AP-01 Section 8 (never overwritten automatically)
  const [targetMarketText, setTargetMarketText] = useState(
    formData.targetMarket || formData.targetAudience?.targetMarketSummary || ''
  );

  useEffect(() => {
    const incoming = formData.targetMarket || formData.targetAudience?.targetMarketSummary || '';
    if (incoming && incoming !== targetMarketText && !targetMarketText) {
      setTargetMarketText(incoming);
    }
  }, [formData.targetMarket, formData.targetAudience?.targetMarketSummary]);

  const selectAllEstYears = () => {
    setEstYears(currentAvailableYearLevels);
  };

  const clearEstYears = () => {
    setEstYears([]);
  };

  const selectAllEstCourses = () => {
    setEstCourseCodes(visibleCourses.map((c) => c.code));
  };

  const clearEstCourses = () => {
    setEstCourseCodes([]);
  };

  const selectAllEstSections = () => {
    const visibleNames = visibleSections.map((s) => s.name);
    setEstSections((prev) => Array.from(new Set([...prev, ...visibleNames])));
  };

  const clearEstSections = () => {
    const visibleNames = new Set(visibleSections.map((s) => s.name));
    setEstSections((prev) => prev.filter((s) => !visibleNames.has(s)));
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

      {/* ── Section 8: Target market (Free-text description for Form AP-01) ── */}
      <div className="space-y-3 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#001A4D] flex items-center justify-center font-bold text-xs">
              8
            </div>
            <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Target market <span className="text-red-500">*</span>
            </label>
          </div>
          <span className="text-[11px] text-gray-400">Section 8</span>
        </div>

        <p className="text-xs text-gray-500">
          Enter the intended participants or audience description for the proposal document (e.g., All STI Students, BSIT 3rd Year Students, Faculty &amp; Invited Guests).
        </p>

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
          placeholder="e.g. All STI College Ormoc Students, BSIT &amp; BSHM Programs, Faculty &amp; Guests..."
          className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] ${
            errors.targetMarket ? 'border-red-400 bg-red-50/20' : 'border-gray-300'
          }`}
        />
        {errors.targetMarket && (
          <p className="text-[11px] text-red-600 font-medium">{errors.targetMarket}</p>
        )}
      </div>

      {/* ── Section 9: Est. attendance (WITH READ-ONLY LIVE REACH CALCULATOR) ── */}
      <div className="space-y-4 pt-4 border-t border-gray-200">
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

        {/* Read-Only Student Reach Calculator (Reference Only for Estimating Attendance) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white border border-blue-200/80 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold shadow-xs flex-shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#001A4D]">
                    Student Registry Reach Estimator
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#001A4D] border border-blue-200">
                    Read-Only Reference
                  </span>
                </div>
                <div className="text-base sm:text-xl font-black text-[#001A4D]">
                  {calculatedReach.toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-gray-500">
                    matching active students in registry
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowReachCalculator((prev) => !prev)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-blue-200 text-[#001A4D] rounded-xl text-xs font-semibold transition-colors cursor-pointer self-start sm:self-auto"
            >
              {showReachCalculator ? 'Hide Calculator Filters' : 'Filter by Level / Course'}
            </button>
          </div>

          {showReachCalculator && (
            <div className="space-y-3 pt-2 border-t border-blue-200/60">
              <div className="bg-slate-50 p-1.5 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All Students', Icon: Users },
                    { id: 'shs', label: 'SHS Only', Icon: School },
                    { id: 'college', label: 'College Only', Icon: GraduationCap },
                    { id: 'custom', label: 'Custom Selection', Icon: Filter },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectEstMode(id)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      estMode === id
                        ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {estMode === 'all' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                    <div className="text-[11px] font-semibold text-gray-500">Total Campus Students</div>
                    <div className="text-base font-black text-[#001A4D]">{demographicStats.totalStudents.toLocaleString()}</div>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                    <div className="text-[11px] font-semibold text-gray-500">Senior High School</div>
                    <div className="text-base font-black text-slate-800">{demographicStats.shsTotal.toLocaleString()}</div>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                    <div className="text-[11px] font-semibold text-gray-500">Tertiary / College</div>
                    <div className="text-base font-black text-slate-800">{demographicStats.collegeTotal.toLocaleString()}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Year Levels */}
                  <div className="p-3 border border-gray-200 rounded-xl bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                        Year Levels ({estYears.length === 0 ? 'All in scope' : `${estYears.length} selected`})
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={selectAllEstYears} className="text-[11px] text-[#0E4EBD] hover:underline font-semibold cursor-pointer">
                          Select All ({currentAvailableYearLevels.length})
                        </button>
                        <span className="text-gray-300">|</span>
                        <button type="button" onClick={clearEstYears} className="text-[11px] text-gray-500 hover:text-gray-700 cursor-pointer">
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentAvailableYearLevels.map((year) => {
                        const isSelected = estYears.includes(year);
                        return (
                          <button
                            type="button"
                            key={year}
                            onClick={() => toggleEstYear(year)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                              isSelected
                                ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D]'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#001A4D]'
                            }`}
                          >
                            <span>{year}</span>
                            {isSelected && <Check className="w-3 h-3 text-[#FFD41C]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Programs / Strands */}
                  <div className="p-3 border border-gray-200 rounded-xl bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                        Programs / Strands ({estCourseCodes.length === 0 ? 'All in scope' : `${estCourseCodes.length} selected`})
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={selectAllEstCourses} className="text-[11px] text-[#001A4D] hover:underline font-semibold cursor-pointer">
                          Select All ({visibleCourses.length})
                        </button>
                        <span className="text-gray-300">|</span>
                        <button type="button" onClick={clearEstCourses} className="text-[11px] text-gray-500 hover:text-gray-700 cursor-pointer">
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleCourses.map((c) => {
                        const isSelected = estCourseCodes.includes(c.code);
                        return (
                          <button
                            type="button"
                            key={c.id || c.code}
                            onClick={() => toggleEstCourse(c.code)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                              isSelected
                                ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D]'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#001A4D]'
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

                  {/* Sections */}
                  <div className="p-3 border border-gray-200 rounded-xl bg-white space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                        Sections ({estSections.length === 0 ? 'All sections' : `${estSections.length} selected`})
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={selectAllEstSections} className="text-[11px] text-[#001A4D] hover:underline font-semibold cursor-pointer">
                          Select All Visible ({visibleSections.length})
                        </button>
                        <span className="text-gray-300">|</span>
                        <button type="button" onClick={clearEstSections} className="text-[11px] text-gray-500 hover:text-gray-700 cursor-pointer">
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={sectionSearch}
                        onChange={(e) => setSectionSearch(e.target.value)}
                        placeholder="Search sections..."
                        className="w-full pl-8 pr-3.5 py-1.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#001A4D]"
                      />
                    </div>
                    {visibleSections.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-1 text-center">
                        No matching sections found for current filter.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                        {visibleSections.map((sec) => {
                          const isSelected = estSections.includes(sec.name);
                          return (
                            <button
                              type="button"
                              key={sec.id}
                              onClick={() => toggleEstSection(sec.name)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] font-bold'
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
            </div>
          )}

          {/* Quick Turnout Presets */}
          {calculatedReach > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-blue-200/60">
              <span className="text-[11px] font-medium text-gray-500 mr-1">Quick Presets:</span>
              {[
                { label: '25%', ratio: 0.25 },
                { label: '50%', ratio: 0.5 },
                { label: '75%', ratio: 0.75 },
                { label: '90%', ratio: 0.9 },
                { label: '100%', ratio: 1.0 },
              ].map((preset) => {
                const estCount = Math.max(1, Math.round(calculatedReach * preset.ratio));
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setAttendanceCount(estCount);
                      updateAttendance(estCount, attendanceQualifier);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-[#001A4D] border border-blue-200 hover:bg-[#001A4D] hover:text-[#FFD41C] hover:border-[#001A4D] transition-all shadow-2xs cursor-pointer"
                    title={`Set estimated attendance to ${estCount} (${preset.label} of matching student reach)`}
                  >
                    {preset.label} (~{estCount})
                  </button>
                );
              })}
            </div>
          )}

          {Number(attendanceCount) > 0 && calculatedReach > 0 && (
            <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs text-gray-600">
              <span>
                Entered estimate: <strong className="text-[#001A4D]">{attendanceCount}</strong> vs.{' '}
                <strong className="text-[#001A4D]">{calculatedReach.toLocaleString()}</strong> matching students
              </span>
              {Number(attendanceCount) <= calculatedReach ? (
                <span className="font-bold text-emerald-700">
                  {Math.round((Number(attendanceCount) / calculatedReach) * 100)}% of selected student pool
                </span>
              ) : (
                <span className="font-semibold text-blue-700">
                  Includes +{(Number(attendanceCount) - calculatedReach).toLocaleString()} additional guests / non-registry pax
                </span>
              )}
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
                  errors.estimatedAttendance
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
