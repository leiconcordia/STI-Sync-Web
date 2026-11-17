import type { DynamicProgram } from '../../academic';

export type ReachEstimatorMode = 'all' | 'shs' | 'college' | 'custom';

export interface ReachStudentLike {
  status?: string;
  archived?: boolean;
  academicLevel?: string;
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  yearLevel?: string | number;
  section?: string;
}

export interface ReachCourseLike {
  id: string;
  code: string;
  name?: string;
  academicLevel?: string;
}

export interface ReachSectionLike {
  id: string;
  name: string;
  courseId?: string;
  courseCode?: string;
  academicLevel?: string;
  yearLevel?: string | number;
  archived?: boolean;
}

export interface StudentDemographicBreakdown {
  total: number;
  shs: number;
  college: number;
  shsByProgram: Array<{ code: string; name: string; count: number }>;
  collegeByProgram: Array<{ code: string; name: string; count: number }>;
}

export interface ReachFilterCriteria {
  mode: ReachEstimatorMode;
  years: string[];
  courseCodes: string[];
  sections: string[];
  shsCourseCodes: string[];
  activeCourses?: ReachCourseLike[];
}

const EXCLUDED_STUDENT_STATUSES = new Set([
  'INACTIVE',
  'SUSPENDED',
  'ARCHIVED',
]);

const SHS_FALLBACK_KEYWORDS = [
  'SHS',
  'STEM',
  'ABM',
  'HUMSS',
  'TVL',
  'GAS',
  'ASSH',
  'ACAD-BE',
  'ICT',
  'MAWD',
  'ITMAWD',
  'TO',
];

function normalizeUpper(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeYearNumber(yearVal: string | number | undefined): string {
  const raw = String(yearVal ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('GRADE 11') || raw.includes('G11') || raw === '11') return '11';
  if (raw.includes('GRADE 12') || raw.includes('G12') || raw === '12') return '12';
  if (raw.includes('1ST') || raw === '1' || raw === '1101') return '1';
  if (raw.includes('2ND') || raw === '2' || raw === '1102') return '2';
  if (raw.includes('3RD') || raw === '3' || raw === '1103') return '3';
  if (raw.includes('4TH') || raw === '4' || raw === '1104' || raw === '4101') return '4';
  if (raw.includes('5TH') || raw === '5') return '5';
  if (raw.includes('6TH') || raw === '6') return '6';
  const digitMatch = raw.match(/\d+/);
  return digitMatch ? digitMatch[0] : raw;
}

function matchesShsFallback(text: string): boolean {
  const upper = text.toUpperCase();
  if (!upper) return false;
  return (
    upper.includes('SENIOR HIGH') ||
    SHS_FALLBACK_KEYWORDS.some((kw) => upper.includes(kw))
  );
}

/**
 * Filter student records to active students matching StudentRegistry.tsx categorization.
 */
export function filterActiveStudents<T extends ReachStudentLike>(students: T[]): T[] {
  return students.filter((student) => {
    const status = normalizeUpper(student.status || 'ACTIVE');
    return !EXCLUDED_STUDENT_STATUSES.has(status);
  });
}

/**
 * Determine whether a student belongs to Senior High School (SHS).
 */
export function isShsStudent(
  student: ReachStudentLike,
  shsCourseCodes: string[],
  activeCourses: ReachCourseLike[] = []
): boolean {
  const explicitLevel = normalizeUpper(student.academicLevel);
  if (explicitLevel === 'SHS') return true;
  if (explicitLevel === 'COLLEGE') return false;

  const yearNorm = normalizeYearNumber(student.yearLevel);
  if (yearNorm === '11' || yearNorm === '12') return true;

  const courseCodeUpper = normalizeUpper(student.courseCode);
  const courseIdUpper = normalizeUpper(student.courseId);
  const courseNameUpper = normalizeUpper(student.courseName);
  const sectionUpper = normalizeUpper(student.section);

  const courseLookup = activeCourses.find(
    (c) =>
      normalizeUpper(c.id) === courseIdUpper ||
      (courseCodeUpper && normalizeUpper(c.code) === courseCodeUpper)
  );
  if (courseLookup) {
    const lookupLevel = normalizeUpper(courseLookup.academicLevel);
    if (lookupLevel === 'SHS') return true;
    if (lookupLevel === 'COLLEGE') return false;
  }

  const shsSet = new Set(shsCourseCodes.map(normalizeUpper).filter(Boolean));
  if (courseCodeUpper && shsSet.has(courseCodeUpper)) return true;
  if (courseLookup && shsSet.has(normalizeUpper(courseLookup.code))) return true;

  return (
    matchesShsFallback(courseCodeUpper) ||
    matchesShsFallback(courseNameUpper) ||
    matchesShsFallback(sectionUpper)
  );
}

/**
 * Determine whether a section belongs to Senior High School (SHS).
 */
export function isShsSection(
  section: ReachSectionLike,
  activeCourses: ReachCourseLike[],
  shsCourseCodes: string[]
): boolean {
  const explicitLevel = normalizeUpper(section.academicLevel);
  if (explicitLevel === 'SHS') return true;
  if (explicitLevel === 'COLLEGE') return false;

  const yearNorm = normalizeYearNumber(section.yearLevel);
  if (yearNorm === '11' || yearNorm === '12') return true;

  const course = activeCourses.find(
    (c) =>
      c.id === section.courseId ||
      (section.courseCode && normalizeUpper(c.code) === normalizeUpper(section.courseCode))
  );
  const resolvedCode = normalizeUpper(course?.code || section.courseCode);

  if (course) {
    const courseLevel = normalizeUpper(course.academicLevel);
    if (courseLevel === 'SHS') return true;
    if (courseLevel === 'COLLEGE') return false;
  }

  const shsSet = new Set(shsCourseCodes.map(normalizeUpper).filter(Boolean));
  if (resolvedCode && shsSet.has(resolvedCode)) return true;

  return (
    matchesShsFallback(resolvedCode) ||
    matchesShsFallback(normalizeUpper(section.name))
  );
}

/**
 * Resolve canonical program code for a student using configured active courses when possible.
 */
function resolveStudentProgramCode(
  student: ReachStudentLike,
  activeCourses: ReachCourseLike[] = []
): string {
  const courseCodeUpper = normalizeUpper(student.courseCode);
  if (courseCodeUpper) return courseCodeUpper;

  if (student.courseId) {
    const matched = activeCourses.find((c) => c.id === student.courseId);
    if (matched?.code) return normalizeUpper(matched.code);
  }
  return courseCodeUpper;
}

/**
 * Compute live active student demographic totals grouped by SHS vs College and program/strand.
 */
export function computeStudentDemographics(
  activeStudents: ReachStudentLike[],
  shsPrograms: DynamicProgram[],
  collegePrograms: DynamicProgram[],
  shsCourseCodes: string[],
  activeCourses: ReachCourseLike[] = []
): StudentDemographicBreakdown {
  const shsCounts = new Map<string, number>();
  const collegeCounts = new Map<string, number>();
  const shsLabelMap = new Map<string, string>();
  const collegeLabelMap = new Map<string, string>();

  shsPrograms.forEach((p) => {
    const code = normalizeUpper(p.code);
    if (code) {
      shsCounts.set(code, 0);
      shsLabelMap.set(code, p.name || p.code);
    }
  });

  collegePrograms.forEach((p) => {
    const code = normalizeUpper(p.code);
    if (code) {
      collegeCounts.set(code, 0);
      collegeLabelMap.set(code, p.name || p.code);
    }
  });

  let shs = 0;
  let college = 0;

  activeStudents.forEach((student) => {
    const isShs = isShsStudent(student, shsCourseCodes, activeCourses);
    const code = resolveStudentProgramCode(student, activeCourses) || 'UNASSIGNED';

    if (isShs) {
      shs += 1;
      shsCounts.set(code, (shsCounts.get(code) || 0) + 1);
      if (!shsLabelMap.has(code)) {
        shsLabelMap.set(code, student.courseName || code);
      }
    } else {
      college += 1;
      collegeCounts.set(code, (collegeCounts.get(code) || 0) + 1);
      if (!collegeLabelMap.has(code)) {
        collegeLabelMap.set(code, student.courseName || code);
      }
    }
  });

  const shsByProgram = Array.from(shsCounts.entries())
    .map(([code, count]) => ({
      code,
      name: shsLabelMap.get(code) || code,
      count,
    }))
    .filter((item) => item.count > 0 || shsPrograms.some((p) => normalizeUpper(p.code) === item.code))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  const collegeByProgram = Array.from(collegeCounts.entries())
    .map(([code, count]) => ({
      code,
      name: collegeLabelMap.get(code) || code,
      count,
    }))
    .filter((item) => item.count > 0 || collegePrograms.some((p) => normalizeUpper(p.code) === item.code))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    total: activeStudents.length,
    shs,
    college,
    shsByProgram,
    collegeByProgram,
  };
}

/**
 * Check whether a student's year level matches any of the selected year filter labels.
 */
export function studentMatchesYears(
  studentYear: string | number | undefined,
  selectedYears: string[]
): boolean {
  if (selectedYears.length === 0) return true;
  const studentNorm = normalizeYearNumber(studentYear);
  const rawUpper = normalizeUpper(studentYear);

  return selectedYears.some((selected) => {
    const selUpper = normalizeUpper(selected);
    const selNorm = normalizeYearNumber(selected);
    return (
      (studentNorm !== '' && selNorm !== '' && studentNorm === selNorm) ||
      (rawUpper !== '' && rawUpper === selUpper)
    );
  });
}

/**
 * Filter active students matching mode, year levels, programs/strands, and sections.
 */
export function filterMatchingStudents<T extends ReachStudentLike>(
  activeStudents: T[],
  criteria: ReachFilterCriteria
): T[] {
  const {
    mode,
    years,
    courseCodes,
    sections,
    shsCourseCodes,
    activeCourses = [],
  } = criteria;

  if (mode === 'all') {
    return activeStudents;
  }

  const courseSet = new Set(courseCodes.map(normalizeUpper).filter(Boolean));
  const sectionSet = new Set(sections.map(normalizeUpper).filter(Boolean));

  // Build ID -> code lookup so students with courseCode missing still match courseCodes filter
  const courseIdToCode = new Map<string, string>();
  activeCourses.forEach((c) => {
    if (c.id && c.code) {
      courseIdToCode.set(c.id, normalizeUpper(c.code));
    }
  });

  return activeStudents.filter((student) => {
    const isShs = isShsStudent(student, shsCourseCodes, activeCourses);

    if (mode === 'shs' && !isShs) return false;
    if (mode === 'college' && isShs) return false;

    if (years.length > 0 && !studentMatchesYears(student.yearLevel, years)) {
      return false;
    }

    if (courseSet.size > 0) {
      const studentCode =
        normalizeUpper(student.courseCode) ||
        (student.courseId ? courseIdToCode.get(student.courseId) || '' : '');
      if (!studentCode || !courseSet.has(studentCode)) {
        return false;
      }
    }

    if (sectionSet.size > 0) {
      const studentSection = normalizeUpper(student.section);
      if (!studentSection || !sectionSet.has(studentSection)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filter programs/strands visible for the selected estimator mode and selected years.
 */
export function filterVisibleCourses(
  allPrograms: DynamicProgram[],
  shsPrograms: DynamicProgram[],
  collegePrograms: DynamicProgram[],
  activeSections: ReachSectionLike[],
  mode: ReachEstimatorMode,
  selectedYears: string[]
): DynamicProgram[] {
  let base: DynamicProgram[];
  if (mode === 'shs') {
    base = shsPrograms;
  } else if (mode === 'college') {
    base = collegePrograms;
  } else {
    base = allPrograms;
  }

  if (selectedYears.length === 0) return base;

  const selectedYearNorms = new Set(selectedYears.map(normalizeYearNumber).filter(Boolean));

  return base.filter((program) => {
    // Prefer configured yearLevels on the program if present
    if (program.yearLevels && program.yearLevels.length > 0) {
      const programHasSelectedYear = program.yearLevels.some((yl) =>
        selectedYearNorms.has(normalizeYearNumber(yl))
      );
      if (programHasSelectedYear) return true;
    }

    // Fallback: inspect active sections linked to this program
    return activeSections.some(
      (sec) =>
        (sec.courseId === program.id ||
          normalizeUpper(sec.courseCode) === normalizeUpper(program.code)) &&
        selectedYearNorms.has(normalizeYearNumber(sec.yearLevel))
    );
  });
}

/**
 * Filter active sections visible in the Section selector based on mode, selected programs, selected years, and search string.
 */
export function filterVisibleSections<T extends ReachSectionLike>(
  activeSections: T[],
  activeCourses: ReachCourseLike[],
  shsCourseCodes: string[],
  options: {
    mode: ReachEstimatorMode;
    courseCodes: string[];
    years: string[];
    search: string;
  }
): T[] {
  const { mode, courseCodes, years, search } = options;
  const courseSet = new Set(courseCodes.map(normalizeUpper).filter(Boolean));
  const yearSet = new Set(years.map(normalizeYearNumber).filter(Boolean));
  const query = search.trim().toUpperCase();

  return activeSections
    .filter((sec) => {
      if (sec.archived) return false;

      const secIsShs = isShsSection(sec, activeCourses, shsCourseCodes);
      if (mode === 'shs' && !secIsShs) return false;
      if (mode === 'college' && secIsShs) return false;

      if (courseSet.size > 0) {
        const course = activeCourses.find(
          (c) =>
            c.id === sec.courseId ||
            (sec.courseCode && normalizeUpper(c.code) === normalizeUpper(sec.courseCode))
        );
        const resolvedCode = normalizeUpper(course?.code || sec.courseCode);
        if (!resolvedCode || !courseSet.has(resolvedCode)) {
          return false;
        }
      }

      if (yearSet.size > 0) {
        const secYear = normalizeYearNumber(sec.yearLevel);
        if (!secYear || !yearSet.has(secYear)) {
          return false;
        }
      }

      if (query) {
        const secName = normalizeUpper(sec.name);
        if (!secName.includes(query)) return false;
      }

      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
