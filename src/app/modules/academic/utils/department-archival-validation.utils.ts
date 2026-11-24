export interface DepartmentArchivalBlockerRef {
  id: string;
  label: string;
  sublabel?: string;
}

export interface DepartmentArchivalValidationResult {
  canArchive: boolean;
  counts: {
    programs: number;
    sections: number;
    students: number;
  };
  activePrograms: DepartmentArchivalBlockerRef[];
  activeSections: DepartmentArchivalBlockerRef[];
  activeStudents: DepartmentArchivalBlockerRef[];
  blockers: string[];
  summaryMessage: string;
}

const normalize = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

function isEntityArchived(entity: Record<string, any> | null | undefined): boolean {
  if (!entity) return true;
  if (entity.archived === true || entity.isArchived === true || entity.isDeleted === true) {
    return true;
  }
  const st = normalize(entity.status);
  return st === 'archived' || st === 'deleted';
}

/**
 * Pure validator that checks whether a Department can be safely archived.
 * Prevents archival if the department still contains ANY active:
 *  - Programs (courses)
 *  - Sections
 *  - Students (`status === 'ACTIVE'`)
 */
export function evaluateDepartmentArchivalEligibility(params: {
  department: Record<string, any>;
  courses?: Array<Record<string, any>>;
  sections?: Array<Record<string, any>>;
  students?: Array<Record<string, any>>;
}): DepartmentArchivalValidationResult {
  const { department, courses = [], sections = [], students = [] } = params;

  const deptId = String(department?.id || '').trim();
  const normDeptId = normalize(deptId);
  const normDeptCode = normalize(department?.code);
  const normDeptName = normalize(department?.name);

  const matchesDepartmentDirect = (record: Record<string, any>): boolean => {
    const recDeptId = normalize(record?.departmentId);
    const recDeptCode = normalize(record?.departmentCode);
    const recDeptName = normalize(record?.departmentName || record?.department);

    if (normDeptId && recDeptId && recDeptId === normDeptId) return true;
    if (normDeptCode && (recDeptId === normDeptCode || recDeptCode === normDeptCode)) return true;
    if (normDeptName && (recDeptName === normDeptName || recDeptId === normDeptName)) return true;
    return false;
  };

  // Collect ALL courses belonging to this department (active & archived) so sections/students
  // referencing a department's courseId/courseCode are never missed even if departmentId is blank.
  const allDeptCourseIds = new Set<string>();
  const allDeptCourseCodes = new Set<string>();
  const activePrograms: DepartmentArchivalBlockerRef[] = [];

  for (const course of courses || []) {
    if (!course) continue;
    if (!matchesDepartmentDirect(course)) continue;

    if (course.id) allDeptCourseIds.add(normalize(course.id));
    if (course.code) allDeptCourseCodes.add(normalize(course.code));

    if (!isEntityArchived(course)) {
      activePrograms.push({
        id: String(course.id || ''),
        label: String(course.code || course.name || 'Program'),
        sublabel: course.name && course.code ? String(course.name) : undefined,
      });
    }
  }

  // 2. Active Sections belonging directly to this department OR to any of its programs
  const activeSections: DepartmentArchivalBlockerRef[] = [];
  for (const section of sections || []) {
    if (!section || isEntityArchived(section)) continue;
    const secCourseId = normalize(section.courseId);
    const belongsToDept =
      matchesDepartmentDirect(section) || (Boolean(secCourseId) && allDeptCourseIds.has(secCourseId));

    if (belongsToDept) {
      activeSections.push({
        id: String(section.id || ''),
        label: String(section.name || 'Section'),
        sublabel: section.yearLevel ? `Year ${section.yearLevel}` : undefined,
      });
    }
  }

  // 3. Active Students (`status === 'ACTIVE'`) belonging directly to this department OR enrolled in any of its programs
  const activeStudents: DepartmentArchivalBlockerRef[] = [];
  for (const student of students || []) {
    if (!student) continue;
    if (normalize(student.status) !== 'active') continue;
    if (student.isDeleted === true || student.archived === true) continue;

    const stuCourseId = normalize(student.courseId);
    const stuCourseCode = normalize(student.courseCode || student.course);
    const belongsToDept =
      matchesDepartmentDirect(student) ||
      (Boolean(stuCourseId) && allDeptCourseIds.has(stuCourseId)) ||
      (Boolean(stuCourseCode) && allDeptCourseCodes.has(stuCourseCode));

    if (belongsToDept) {
      const fullName =
        `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
        String(student.studentId || 'Student');
      activeStudents.push({
        id: String(student.id || ''),
        label: fullName,
        sublabel: [student.studentId, student.courseCode].filter(Boolean).join(' · ') || undefined,
      });
    }
  }

  const blockers: string[] = [];
  if (activePrograms.length > 0) {
    blockers.push(
      `${activePrograms.length} active program${activePrograms.length === 1 ? '' : 's'}`
    );
  }
  if (activeSections.length > 0) {
    blockers.push(
      `${activeSections.length} active section${activeSections.length === 1 ? '' : 's'}`
    );
  }
  if (activeStudents.length > 0) {
    blockers.push(
      `${activeStudents.length} active student${activeStudents.length === 1 ? '' : 's'}`
    );
  }

  const canArchive = blockers.length === 0;
  const deptLabel = String(department?.name || department?.code || 'this department').trim();
  const summaryMessage = canArchive
    ? `${deptLabel} has no active programs, sections, or students and can be archived.`
    : `Cannot archive ${deptLabel}: it still contains ${blockers.join(', ')}. Archive or reassign them first.`;

  return {
    canArchive,
    counts: {
      programs: activePrograms.length,
      sections: activeSections.length,
      students: activeStudents.length,
    },
    activePrograms,
    activeSections,
    activeStudents,
    blockers,
    summaryMessage,
  };
}
