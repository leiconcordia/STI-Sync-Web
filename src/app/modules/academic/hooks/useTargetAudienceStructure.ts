import { useMemo } from 'react';
import { useCourses, useDepartments, useSections } from './useAcademicStream';
import type { CourseDocument, DepartmentDocument, SectionDocument } from '../types/academic.types';

export interface DynamicProgram {
  id: string;
  code: string;
  name: string;
  academicLevel: 'SHS' | 'COLLEGE';
  departmentId?: string;
  departmentName?: string;
  yearLevels: string[];
}

export interface TargetAudienceStructure {
  loading: boolean;
  courses: CourseDocument[];
  departments: DepartmentDocument[];
  sections: SectionDocument[];
  // Dynamic programs list
  shsPrograms: DynamicProgram[];
  collegePrograms: DynamicProgram[];
  allPrograms: DynamicProgram[];
  // Program codes
  shsCourseCodes: string[];
  collegeCourseCodes: string[];
  allCourseCodes: string[];
  // Dynamic year levels list
  shsYearLevels: string[];
  collegeYearLevels: string[];
  allYearLevels: string[];
  // Helper functions
  isShsCourse: (courseCodeOrId: string) => boolean;
  isCollegeCourse: (courseCodeOrId: string) => boolean;
  getProgramByCode: (code: string) => DynamicProgram | undefined;
  getYearLevelsForAcademicLevel: (level: 'BOTH' | 'SHS' | 'COLLEGE') => string[];
  getProgramsForAcademicLevel: (level: 'BOTH' | 'SHS' | 'COLLEGE') => DynamicProgram[];
  getCourseCodesForAcademicLevel: (level: 'BOTH' | 'SHS' | 'COLLEGE') => string[];
}

const COLLEGE_ORDINALS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', '6th Year'];

export function useTargetAudienceStructure(): TargetAudienceStructure {
  const { data: rawCourses = [], loading: coursesLoading } = useCourses();
  const { data: rawDepartments = [], loading: departmentsLoading } = useDepartments();
  const { data: rawSections = [], loading: sectionsLoading } = useSections();

  const loading = coursesLoading || departmentsLoading || sectionsLoading;

  return useMemo(() => {
    const activeCourses = rawCourses.filter((c) => !c.archived);
    const activeDepartments = rawDepartments.filter(
      (d) => !d.archived && (d as any).status !== 'archived'
    );
    const activeSections = rawSections.filter((s) => !s.archived);

    const deptMap = new Map<string, DepartmentDocument>();
    activeDepartments.forEach((d) => {
      deptMap.set(d.id, d);
      if (d.code) deptMap.set(d.code.toUpperCase(), d);
    });

    const isShsCourseDoc = (c: CourseDocument): boolean => {
      if (c.academicLevel === 'SHS') return true;
      if (c.academicLevel === 'COLLEGE') return false;

      const dept = c.departmentId ? deptMap.get(c.departmentId) : undefined;
      if (dept?.academicLevel === 'SHS') return true;
      if (dept?.academicLevel === 'COLLEGE') return false;

      const code = (c.code || '').toUpperCase();
      const name = (c.name || '').toLowerCase();
      const deptName = (dept?.name || '').toLowerCase();

      return (
        deptName.includes('senior high') ||
        deptName.includes('shs') ||
        code.includes('SHS') ||
        code.includes('STEM') ||
        code.includes('ABM') ||
        code.includes('HUMSS') ||
        code.includes('TVL') ||
        code.includes('GAS') ||
        code.includes('ASSH') ||
        code.includes('ACAD-BE') ||
        name.includes('senior high')
      );
    };

    // Map courses to DynamicProgram
    const programMap = new Map<string, DynamicProgram>();

    activeCourses.forEach((c) => {
      const code = (c.code || '').trim().toUpperCase();
      if (!code) return;

      const isShs = isShsCourseDoc(c);
      const level: 'SHS' | 'COLLEGE' = isShs ? 'SHS' : 'COLLEGE';
      const dept = c.departmentId ? deptMap.get(c.departmentId) : undefined;

      let yearLevels: string[];
      if (isShs) {
        const yCount = c.yearLevels || 2;
        yearLevels = yCount <= 1 ? ['Grade 11'] : ['Grade 11', 'Grade 12'];
      } else {
        const yCount = Math.max(1, Math.min(6, c.yearLevels || 4));
        yearLevels = Array.from({ length: yCount }, (_, i) => COLLEGE_ORDINALS[i] || `${i + 1}th Year`);
      }

      programMap.set(code, {
        id: c.id,
        code,
        name: c.name || code,
        academicLevel: level,
        departmentId: c.departmentId || dept?.id,
        departmentName: dept?.name || dept?.code,
        yearLevels,
      });
    });

    // Also check sections to capture any active programs or sections that might not have a full course doc
    activeSections.forEach((s) => {
      const secName = (s.name || '').trim().toUpperCase();
      const tokens = secName.split(/[\s-]+/);
      const assumedCode = tokens[0];
      if (assumedCode && !programMap.has(assumedCode) && assumedCode.length >= 2 && !/^\d+$/.test(assumedCode)) {
        const isShs =
          s.yearLevel === 11 ||
          s.yearLevel === 12 ||
          secName.includes('G11') ||
          secName.includes('G12') ||
          ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'ASSH', 'ACAD-BE'].includes(assumedCode);
        const level: 'SHS' | 'COLLEGE' = isShs ? 'SHS' : 'COLLEGE';
        const dept = s.departmentId ? deptMap.get(s.departmentId) : undefined;
        programMap.set(assumedCode, {
          id: s.courseId || assumedCode,
          code: assumedCode,
          name: assumedCode,
          academicLevel: level,
          departmentId: s.departmentId || dept?.id,
          departmentName: dept?.name || dept?.code,
          yearLevels: isShs ? ['Grade 11', 'Grade 12'] : ['1st Year', '2nd Year', '3rd Year', '4th Year'],
        });
      }
    });

    const shsPrograms: DynamicProgram[] = [];
    const collegePrograms: DynamicProgram[] = [];

    programMap.forEach((prog) => {
      if (prog.academicLevel === 'SHS') {
        shsPrograms.push(prog);
      } else {
        collegePrograms.push(prog);
      }
    });

    shsPrograms.sort((a, b) => a.code.localeCompare(b.code));
    collegePrograms.sort((a, b) => a.code.localeCompare(b.code));
    const allPrograms = [...shsPrograms, ...collegePrograms];

    const shsCourseCodes = shsPrograms.map((p) => p.code);
    const collegeCourseCodes = collegePrograms.map((p) => p.code);
    const allCourseCodes = allPrograms.map((p) => p.code);

    // Dynamic year levels derived from programs
    const shsYearSet = new Set<string>();
    shsPrograms.forEach((p) => p.yearLevels.forEach((y) => shsYearSet.add(y)));
    const shsYearLevels = shsYearSet.size > 0 ? Array.from(shsYearSet) : ['Grade 11', 'Grade 12'];

    const collegeYearSet = new Set<string>();
    collegePrograms.forEach((p) => p.yearLevels.forEach((y) => collegeYearSet.add(y)));
    const collegeYearLevels =
      collegeYearSet.size > 0
        ? Array.from(collegeYearSet)
        : ['1st Year', '2nd Year', '3rd Year', '4th Year'];

    const allYearLevels = [...shsYearLevels, ...collegeYearLevels];

    const isShsCourse = (courseCodeOrId: string): boolean => {
      const codeUpper = courseCodeOrId.trim().toUpperCase();
      if (shsCourseCodes.includes(codeUpper)) return true;
      const prog = Array.from(programMap.values()).find(
        (p) => p.id === courseCodeOrId || p.code === codeUpper
      );
      return prog?.academicLevel === 'SHS';
    };

    const isCollegeCourse = (courseCodeOrId: string): boolean => {
      const codeUpper = courseCodeOrId.trim().toUpperCase();
      if (collegeCourseCodes.includes(codeUpper)) return true;
      const prog = Array.from(programMap.values()).find(
        (p) => p.id === courseCodeOrId || p.code === codeUpper
      );
      return prog?.academicLevel === 'COLLEGE';
    };

    const getProgramByCode = (code: string) => {
      return programMap.get(code.trim().toUpperCase());
    };

    const getYearLevelsForAcademicLevel = (level: 'BOTH' | 'SHS' | 'COLLEGE'): string[] => {
      if (level === 'SHS') return shsYearLevels;
      if (level === 'COLLEGE') return collegeYearLevels;
      return allYearLevels;
    };

    const getProgramsForAcademicLevel = (level: 'BOTH' | 'SHS' | 'COLLEGE'): DynamicProgram[] => {
      if (level === 'SHS') return shsPrograms;
      if (level === 'COLLEGE') return collegePrograms;
      return allPrograms;
    };

    const getCourseCodesForAcademicLevel = (level: 'BOTH' | 'SHS' | 'COLLEGE'): string[] => {
      if (level === 'SHS') return shsCourseCodes;
      if (level === 'COLLEGE') return collegeCourseCodes;
      return allCourseCodes;
    };

    return {
      loading,
      courses: activeCourses,
      departments: activeDepartments,
      sections: activeSections,
      shsPrograms,
      collegePrograms,
      allPrograms,
      shsCourseCodes,
      collegeCourseCodes,
      allCourseCodes,
      shsYearLevels,
      collegeYearLevels,
      allYearLevels,
      isShsCourse,
      isCollegeCourse,
      getProgramByCode,
      getYearLevelsForAcademicLevel,
      getProgramsForAcademicLevel,
      getCourseCodesForAcademicLevel,
    };
  }, [rawCourses, rawDepartments, rawSections, loading]);
}
