/**
 * src/app/modules/students/services/registrar-import.service.ts
 *
 * Automated Ingestion, Validation, Conflict Resolution, and Auto-Promotion
 * for Registrar Enrollment Lists (Excel: SHS and Tertiary / College).
 */

import * as XLSX from 'xlsx';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { STUDENTS_COLLECTION } from './student.service';
import { COURSES_COLLECTION, SEMESTERS_COLLECTION, DEPARTMENTS_COLLECTION } from '../../academic/services/academic.service';
import type {
  StudentDocument,
  AcademicLevel,
  StudentYearLevel,
  StudentSemester,
  StudentSex,
} from '../types/student.types';
import type { CourseDocument, SemesterDocument, DepartmentDocument } from '../../academic/types/academic.types';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ParsedRegistrarStudent {
  studentNo: string;
  lastName: string;
  firstName: string;
  middleName: string;
  sex: StudentSex;
  academicLevel: AcademicLevel;
  schoolYearTerm: string;
  yearLevel: StudentYearLevel;
  rawYearLevel: string;
  courseCode: string;
  courseName: string;
}

export interface ParsedRegistrarFile {
  academicLevel: AcademicLevel;
  detectedSchoolYear: string;
  detectedSemester: StudentSemester;
  rawTermLabel: string;
  totalStudents: number;
  programsDetected: Array<{ code: string; name: string }>;
  students: ParsedRegistrarStudent[];
}

export type PromotionDecision = 'AUTO_PROMOTE' | 'SKIP';
export type ConflictDecision = 'SKIP_INCOMING' | 'OVERWRITE_EXISTING';
export type MissingStudentDecision = 'SET_INACTIVE' | 'ARCHIVE_GRADUATED' | 'KEEP_ACTIVE';

export interface MatchedPromotionItem {
  incoming: ParsedRegistrarStudent;
  existing: StudentDocument;
  decision: PromotionDecision;
  isYearLevelChanging: boolean;
  isCourseChanging: boolean;
}

export interface NameConflictItem {
  incoming: ParsedRegistrarStudent;
  existing: StudentDocument;
  decision: ConflictDecision;
}

export interface MissingStudentItem {
  student: StudentDocument;
  isGraduating: boolean; // 4th Year or Grade 12
  decision: MissingStudentDecision;
}

export interface DetectedProgramAlignment {
  code: string;
  name: string;
  academicLevel: AcademicLevel;
  departmentId: string;
  departmentName: string;
  isUnaligned: boolean;
  studentCount: number;
}

export interface ImportReconciliationAnalysis {
  fileSummary: ParsedRegistrarFile;
  newStudents: ParsedRegistrarStudent[];
  matchedPromotions: MatchedPromotionItem[];
  nameConflicts: NameConflictItem[];
  missingStudents: MissingStudentItem[];
  existingCourses: Map<string, CourseDocument>;
  missingCourses: Array<{ code: string; name: string; academicLevel: AcademicLevel }>;
  existingDepartments: Map<string, DepartmentDocument>;
  detectedPrograms: DetectedProgramAlignment[];
  isSemesterProvisionNeeded: boolean;
}

export interface ImportExecutionResult {
  totalProcessed: number;
  createdCount: number;
  promotedCount: number;
  inactivatedCount: number;
  graduatedCount: number;
  skippedCount: number;
  coursesProvisioned: number;
  auditLog: Array<{
    studentId: string;
    studentName: string;
    courseCode: string;
    yearLevel: string;
    action: string;
    defaultPassword?: string;
  }>;
}

// ─── Default Password Formula ─────────────────────────────────────────────────

/**
 * Formula specified by institutional guidelines:
 * Caps (first character of Last Name) + lowercase remaining letters + last 6 digits of Student No.
 * Example:
 * Student No: 02000496332, Last Name: ABLEN -> Ablen496332
 * Student No: 02000458280, Last Name: DE LA CRUZ -> Delacruz458280
 */
export function generateDefaultStudentPassword(lastName: string, studentId: string): string {
  const cleanLast = lastName.trim().replace(/[^a-zA-Z]/g, '');
  const prefix = cleanLast
    ? cleanLast.charAt(0).toUpperCase() + cleanLast.slice(1).toLowerCase()
    : 'Sti';
  const cleanId = studentId.trim();
  const last6 = cleanId.length >= 6 ? cleanId.slice(-6) : cleanId.padStart(6, '0');
  return `${prefix}${last6}`;
}

// ─── Normalization Helpers ────────────────────────────────────────────────────

export function normalizeYearLevel(raw: string, academicLevel: AcademicLevel): StudentYearLevel {
  const clean = raw.trim().toLowerCase();
  if (academicLevel === 'SHS') {
    if (clean.includes('12')) return 'Grade 12';
    return 'Grade 11';
  }

  // College / Tertiary
  if (clean.includes('4') || clean.includes('fourth')) return '4th Year';
  if (clean.includes('3') || clean.includes('third')) return '3rd Year';
  if (clean.includes('2') || clean.includes('second')) return '2nd Year';
  return '1st Year';
}

export function parseSchoolYearAndTerm(rawTermStr: string, academicLevel: AcademicLevel): {
  schoolYear: string;
  semester: StudentSemester;
} {
  // Typical formats: "2026-2027/1st Term", "2026-2027", "2026-2027 1ST SEM"
  const syMatch = rawTermStr.match(/\d{4}-\d{4}/);
  const schoolYear = syMatch ? syMatch[0] : '2026-2027';

  const clean = rawTermStr.toLowerCase();
  let semester: StudentSemester = '1st Semester';

  if (academicLevel === 'SHS') {
    if (clean.includes('2nd') || clean.includes('2nd term')) {
      semester = '2nd Semester';
    } else if (clean.includes('3rd')) {
      semester = '3rd Trimester';
    } else {
      semester = '1st Semester';
    }
  } else {
    // College
    if (clean.includes('2nd') || clean.includes('2nd sem') || clean.includes('2nd term')) {
      semester = '2nd Semester';
    } else if (clean.includes('summer')) {
      semester = 'Summer';
    } else {
      semester = '1st Semester';
    }
  }

  return { schoolYear, semester };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parses the official Registrar Excel enrollment file (SHS or College) client-side.
 */
export async function parseRegistrarExcelFile(file: File): Promise<ParsedRegistrarFile> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let detectedAcademicLevel: AcademicLevel = file.name.toUpperCase().includes('SHS') ? 'SHS' : 'COLLEGE';
  let rawTermLabel = '';
  let currentYearLevelRaw = '';
  let currentCourseCode = '';
  let currentCourseName = '';

  const parsedStudents: ParsedRegistrarStudent[] = [];
  const programMap = new Map<string, { code: string; name: string }>();

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const c0 = String(row[0] || '').trim();
    const c2 = String(row[2] || '').trim();

    // Check Document Titles
    if (c0.toLowerCase().includes('senior high school enrollment list')) {
      detectedAcademicLevel = 'SHS';
    } else if (c0.toLowerCase().includes('baccalaureate enrollment list')) {
      detectedAcademicLevel = 'COLLEGE';
    }

    // Check Header metadata
    if (c0.toLowerCase().includes('school year & term :')) {
      rawTermLabel = c2;
    } else if (c0.toLowerCase().includes('year level :')) {
      currentYearLevelRaw = c2;
    } else if (c0.toLowerCase().includes('course program :')) {
      const progStr = c2;
      const parts = progStr.split(' - ');
      currentCourseCode = parts[0]?.trim() || '';
      currentCourseName = parts.length > 1 ? parts.slice(1).join(' - ').trim() : progStr;
      if (currentCourseCode) {
        programMap.set(currentCourseCode, { code: currentCourseCode, name: currentCourseName });
      }
    }

    // Check Student row: Column index 3 is Student No (Col 4 in 1-indexed Excel)
    const rawStudentNo = String(row[3] || '').trim();
    const rawLastName = String(row[4] || '').trim();
    const rawFirstName = String(row[5] || '').trim();
    const rawMiddleName = String(row[7] || '').trim();
    const rawSex = String(row[9] || '').trim().toUpperCase();

    // Validate Student ID (typically 8 to 15 digits, starting with 02... or 20...)
    if (/^\d{8,15}$/.test(rawStudentNo) && rawLastName && rawFirstName) {
      const yearLevel = normalizeYearLevel(currentYearLevelRaw, detectedAcademicLevel);
      const sex: StudentSex = rawSex === 'F' ? 'Female' : 'Male';

      parsedStudents.push({
        studentNo: rawStudentNo,
        lastName: rawLastName.toUpperCase(),
        firstName: rawFirstName.toUpperCase(),
        middleName: rawMiddleName.toUpperCase(),
        sex,
        academicLevel: detectedAcademicLevel,
        schoolYearTerm: rawTermLabel,
        yearLevel,
        rawYearLevel: currentYearLevelRaw,
        courseCode: currentCourseCode,
        courseName: currentCourseName,
      });
    }
  }

  const { schoolYear, semester } = parseSchoolYearAndTerm(rawTermLabel, detectedAcademicLevel);

  return {
    academicLevel: detectedAcademicLevel,
    detectedSchoolYear: schoolYear,
    detectedSemester: semester,
    rawTermLabel,
    totalStudents: parsedStudents.length,
    programsDetected: Array.from(programMap.values()),
    students: parsedStudents,
  };
}

// ─── Reconciliation & Conflict Engine ─────────────────────────────────────────

/**
 * Analyzes parsed registrar rows against existing Firestore students.
 * Detects:
 *  1. Brand new students.
 *  2. Existing students to auto-promote (same student no + same name).
 *  3. Student ID collision conflicts (same student no + different name).
 *  4. Missing active students (unenrolled / dropped or graduating).
 */
export async function analyzeRegistrarImport(
  fileSummary: ParsedRegistrarFile,
  existingStudents: StudentDocument[]
): Promise<ImportReconciliationAnalysis> {
  const existingMap = new Map<string, StudentDocument>();
  existingStudents.forEach((s) => {
    if (s.studentId) existingMap.set(s.studentId.trim(), s);
  });

  const incomingStudentIds = new Set<string>();

  const newStudents: ParsedRegistrarStudent[] = [];
  const matchedPromotions: MatchedPromotionItem[] = [];
  const nameConflicts: NameConflictItem[] = [];

  for (const incoming of fileSummary.students) {
    incomingStudentIds.add(incoming.studentNo);
    const existing = existingMap.get(incoming.studentNo);

    if (!existing) {
      newStudents.push(incoming);
      continue;
    }

    // Existing student found -> compare names strictly
    const incLast = incoming.lastName.trim().toUpperCase();
    const incFirst = incoming.firstName.trim().toUpperCase();
    const exLast = (existing.lastName || '').trim().toUpperCase();
    const exFirst = (existing.firstName || '').trim().toUpperCase();

    const cleanIncLast = incLast.replace(/[^A-Z]/g, '');
    const cleanExLast = exLast.replace(/[^A-Z]/g, '');
    const cleanIncFirst = incFirst.replace(/[^A-Z]/g, '');
    const cleanExFirst = exFirst.replace(/[^A-Z]/g, '');

    // Last name MUST match (or contain compound surname)
    const isLastNameMatch =
      cleanIncLast === cleanExLast ||
      (cleanIncLast.length >= 4 && cleanExLast.includes(cleanIncLast)) ||
      (cleanExLast.length >= 4 && cleanIncLast.includes(cleanExLast));

    // First name must be compatible
    const isFirstNameMatch =
      cleanIncFirst === cleanExFirst ||
      incFirst.split(' ')[0] === exFirst.split(' ')[0] ||
      cleanIncFirst.includes(cleanExFirst) ||
      cleanExFirst.includes(cleanIncFirst) ||
      !cleanIncFirst ||
      !cleanExFirst;

    // Both must match to be considered the same student
    const isSameName = isLastNameMatch && isFirstNameMatch;

    if (isSameName) {
      matchedPromotions.push({
        incoming,
        existing,
        decision: 'AUTO_PROMOTE',
        isYearLevelChanging: existing.yearLevel !== incoming.yearLevel,
        isCourseChanging: existing.courseCode !== incoming.courseCode,
      });
    } else {
      // Collision / Conflict: Same ID but completely different name
      nameConflicts.push({
        incoming,
        existing,
        decision: 'SKIP_INCOMING',
      });
    }
  }

  // Detect Active Students in database who are MISSING from the new enrollment list
  const missingStudents: MissingStudentItem[] = [];
  const currentLevelStudents = existingStudents.filter(
    (s) =>
      s.status === 'ACTIVE' &&
      (s.academicLevel === fileSummary.academicLevel ||
        (fileSummary.academicLevel === 'SHS' && (s.yearLevel === 'Grade 11' || s.yearLevel === 'Grade 12')) ||
        (fileSummary.academicLevel === 'COLLEGE' && (s.yearLevel?.includes('Year') ?? false)))
  );

  for (const student of currentLevelStudents) {
    if (!student.studentId) continue;
    if (!incomingStudentIds.has(student.studentId.trim())) {
      const isGraduating = student.yearLevel === '4th Year' || student.yearLevel === 'Grade 12';
      missingStudents.push({
        student,
        isGraduating,
        decision: isGraduating ? 'ARCHIVE_GRADUATED' : 'SET_INACTIVE',
      });
    }
  }

  // Check Courses collection in Firestore
  const coursesSnap = await getDocs(
    query(collection(db, COURSES_COLLECTION), where('archived', '==', false))
  );
  const existingCourses = new Map<string, CourseDocument>();
  coursesSnap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() } as CourseDocument;
    if (data.code) existingCourses.set(data.code.trim().toUpperCase(), data);
  });

  const missingCourses: Array<{ code: string; name: string; academicLevel: AcademicLevel }> = [];
  for (const prog of fileSummary.programsDetected) {
    const cleanCode = prog.code.trim().toUpperCase();
    if (!existingCourses.has(cleanCode)) {
      missingCourses.push({
        code: cleanCode,
        name: prog.name,
        academicLevel: fileSummary.academicLevel,
      });
    }
  }

  // Check Semesters collection
  const semestersSnap = await getDocs(
    query(
      collection(db, SEMESTERS_COLLECTION),
      where('academicYear', '==', fileSummary.detectedSchoolYear),
      where('academicLevel', '==', fileSummary.academicLevel)
    )
  );
  const isSemesterProvisionNeeded = semestersSnap.empty;

  // Check Departments collection
  const deptsSnap = await getDocs(
    query(collection(db, DEPARTMENTS_COLLECTION), where('archived', '==', false))
  );
  const existingDepartments = new Map<string, DepartmentDocument>();
  deptsSnap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() } as DepartmentDocument;
    if (data.id) existingDepartments.set(data.id, data);
    if (data.code) existingDepartments.set(data.code.trim().toUpperCase(), data);
  });

  // Build program-to-department alignments for all programs detected in this file
  const deptsArray = Array.from(new Set(Array.from(existingDepartments.values())));
  const detectedPrograms: DetectedProgramAlignment[] = fileSummary.programsDetected.map((prog) => {
    const cleanCode = prog.code.trim().toUpperCase();
    const existingCourse = existingCourses.get(cleanCode);
    let resolvedDeptId = existingCourse?.departmentId || '';
    let resolvedDept = resolvedDeptId ? existingDepartments.get(resolvedDeptId) : undefined;

    // If not aligned, auto-suggest from active departments matching code or track
    if (!resolvedDept && !resolvedDeptId) {
      if (fileSummary.academicLevel === 'SHS') {
        const shsDept = deptsArray.find((d) => d.academicLevel === 'SHS' || d.code?.toUpperCase() === 'SHS' || d.name?.toLowerCase().includes('senior high'));
        if (shsDept) {
          resolvedDeptId = shsDept.id;
          resolvedDept = shsDept;
        }
      } else {
        if (cleanCode.includes('IT') || cleanCode.includes('CS') || cleanCode.includes('ACT')) {
          const itDept = deptsArray.find((d) => d.code?.toUpperCase() === 'CITE' || d.code?.toUpperCase() === 'IT' || d.name?.toLowerCase().includes('information'));
          if (itDept) {
            resolvedDeptId = itDept.id;
            resolvedDept = itDept;
          }
        } else if (cleanCode.includes('HM') || cleanCode.includes('TM')) {
          const hmDept = deptsArray.find((d) => d.code?.toUpperCase() === 'THM' || d.name?.toLowerCase().includes('hospitality') || d.name?.toLowerCase().includes('tourism'));
          if (hmDept) {
            resolvedDeptId = hmDept.id;
            resolvedDept = hmDept;
          }
        } else if (cleanCode.includes('BA') || cleanCode.includes('BM') || cleanCode.includes('ACC') || cleanCode.includes('MA')) {
          const baDept = deptsArray.find((d) => d.code?.toUpperCase() === 'BA' || d.code?.toUpperCase() === 'CBA' || d.name?.toLowerCase().includes('business'));
          if (baDept) {
            resolvedDeptId = baDept.id;
            resolvedDept = baDept;
          }
        }
      }
    }

    return {
      code: cleanCode,
      name: existingCourse?.name || prog.name,
      academicLevel: existingCourse?.academicLevel || fileSummary.academicLevel,
      departmentId: resolvedDeptId,
      departmentName: resolvedDept?.name || '',
      isUnaligned: !resolvedDeptId,
      studentCount: prog.studentCount || 0,
    };
  });

  return {
    fileSummary,
    newStudents,
    matchedPromotions,
    nameConflicts,
    missingStudents,
    existingCourses,
    missingCourses,
    existingDepartments,
    detectedPrograms,
    isSemesterProvisionNeeded,
  };
}

// ─── Execution Engine ─────────────────────────────────────────────────────────

export interface BulkImportExecutionOptions {
  analysis: ImportReconciliationAnalysis;
  matchedPromotions: MatchedPromotionItem[];
  nameConflicts: NameConflictItem[];
  missingStudents: MissingStudentItem[];
  programDepartmentMap?: Record<string, string>; // courseCode -> departmentId
  autoProvisionCourses: boolean;
  autoProvisionSemester: boolean;
  adminUid: string;
  onProgress?: (processed: number, total: number, statusText: string) => void;
}

export async function executeRegistrarBulkImport(
  options: BulkImportExecutionOptions
): Promise<ImportExecutionResult> {
  const {
    analysis,
    matchedPromotions,
    nameConflicts,
    missingStudents,
    programDepartmentMap = {},
    autoProvisionCourses,
    autoProvisionSemester,
    adminUid,
    onProgress,
  } = options;

  let createdCount = 0;
  let promotedCount = 0;
  let inactivatedCount = 0;
  let graduatedCount = 0;
  let skippedCount = 0;
  let coursesProvisioned = 0;

  const auditLog: ImportExecutionResult['auditLog'] = [];

  // Step 1: Auto-provision missing courses and align existing courses with assigned departments
  const courseIdMap = new Map<string, { id: string; name: string; code: string; departmentId: string }>();

  // Helper to resolve department for a course/program
  const resolveDepartmentForProgram = (code: string, academicLevel: AcademicLevel): { id: string; name: string } => {
    const cleanCode = code.toUpperCase();
    const mappedDeptId = programDepartmentMap[cleanCode];
    if (mappedDeptId) {
      const mappedDept = analysis.existingDepartments.get(mappedDeptId);
      if (mappedDept) return { id: mappedDept.id, name: mappedDept.name };
    }

    const allDepts = Array.from(analysis.existingDepartments.values());
    if (academicLevel === 'SHS') {
      const shsDept = allDepts.find((d) => d.academicLevel === 'SHS' || d.code?.toUpperCase() === 'SHS');
      return { id: shsDept?.id || 'dept_shs', name: shsDept?.name || 'Senior High School' };
    }
    if (cleanCode.includes('IT') || cleanCode.includes('CS') || cleanCode.includes('ACT')) {
      const citeDept = allDepts.find((d) => d.code?.toUpperCase() === 'CITE' || d.code?.toUpperCase() === 'IT' || d.name?.toLowerCase().includes('information'));
      return { id: citeDept?.id || 'dept_it', name: citeDept?.name || 'Information Technology' };
    }
    if (cleanCode.includes('HM') || cleanCode.includes('TM')) {
      const thmDept = allDepts.find((d) => d.code?.toUpperCase() === 'THM' || d.name?.toLowerCase().includes('tourism') || d.name?.toLowerCase().includes('hospitality'));
      return { id: thmDept?.id || 'dept_thm', name: thmDept?.name || 'Tourism & Hospitality' };
    }
    if (cleanCode.includes('BA') || cleanCode.includes('ACC') || cleanCode.includes('MA') || cleanCode.includes('BM')) {
      const baDept = allDepts.find((d) => d.code?.toUpperCase() === 'BA' || d.code?.toUpperCase() === 'CBA' || d.name?.toLowerCase().includes('business'));
      return { id: baDept?.id || 'dept_ba', name: baDept?.name || 'Business Administration' };
    }
    const fallbackCollege = allDepts.find((d) => d.academicLevel !== 'SHS');
    return { id: fallbackCollege?.id || '', name: fallbackCollege?.name || '' };
  };

  // Populate from existing and synchronize department alignment
  for (const c of Array.from(analysis.existingCourses.values())) {
    const cleanCode = c.code.trim().toUpperCase();
    const assignedDeptId = programDepartmentMap[cleanCode] || c.departmentId || '';

    // If an alignment was chosen by user and differs from existing Firestore course, update course
    if (programDepartmentMap[cleanCode] && programDepartmentMap[cleanCode] !== c.departmentId) {
      try {
        await updateDoc(doc(db, COURSES_COLLECTION, c.id), {
          departmentId: programDepartmentMap[cleanCode],
          updatedAt: Timestamp.now(),
        });
      } catch (updErr) {
        console.warn(`[executeRegistrarBulkImport] Could not update department for course ${c.code}:`, updErr);
      }
    }

    courseIdMap.set(cleanCode, {
      id: c.id,
      name: c.name,
      code: c.code,
      departmentId: assignedDeptId,
    });
  }

  if (autoProvisionCourses && analysis.missingCourses.length > 0) {
    onProgress?.(0, 100, `Provisioning ${analysis.missingCourses.length} new academic programs...`);
    const courseBatch = writeBatch(db);
    for (const prog of analysis.missingCourses) {
      const newRef = doc(collection(db, COURSES_COLLECTION));
      const yearLevels = prog.academicLevel === 'SHS' ? 2 : 4;
      const matchedDept = resolveDepartmentForProgram(prog.code, prog.academicLevel);
      courseBatch.set(newRef, {
        id: newRef.id,
        code: prog.code,
        name: prog.name,
        academicLevel: prog.academicLevel,
        departmentId: matchedDept.id,
        yearLevels,
        archived: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      courseIdMap.set(prog.code, {
        id: newRef.id,
        name: prog.name,
        code: prog.code,
        departmentId: matchedDept.id,
      });
      coursesProvisioned++;
    }
    await courseBatch.commit();
  }

  // Step 2: Auto-provision semester if requested
  if (autoProvisionSemester && analysis.isSemesterProvisionNeeded) {
    onProgress?.(0, 100, 'Provisioning active semester period...');
    const semRef = doc(collection(db, SEMESTERS_COLLECTION));
    await writeBatch(db)
      .set(semRef, {
        id: semRef.id,
        academicYear: analysis.fileSummary.detectedSchoolYear,
        academicLevel: analysis.fileSummary.academicLevel,
        semester: analysis.fileSummary.detectedSemester,
        term: analysis.fileSummary.detectedSemester,
        termType: analysis.fileSummary.academicLevel === 'SHS' ? 'TRIMESTER' : 'SEMESTER',
        label: `A.Y. ${analysis.fileSummary.detectedSchoolYear} ${analysis.fileSummary.detectedSemester}`,
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        reenrollDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        status: 'ACTIVE',
        events: 0,
        students: analysis.fileSummary.totalStudents,
        archived: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
      .commit();
  }

  // Build operations queue
  type Operation =
    | { type: 'CREATE'; student: ParsedRegistrarStudent }
    | { type: 'PROMOTE'; incoming: ParsedRegistrarStudent; existing: StudentDocument }
    | { type: 'OVERWRITE'; incoming: ParsedRegistrarStudent; existing: StudentDocument }
    | { type: 'INACTIVATE'; student: StudentDocument; reason: string }
    | { type: 'GRADUATE'; student: StudentDocument };

  const operations: Operation[] = [];

  // A. New Students
  for (const st of analysis.newStudents) {
    operations.push({ type: 'CREATE', student: st });
  }

  // B. Matched Promotions
  for (const m of matchedPromotions) {
    if (m.decision === 'AUTO_PROMOTE') {
      operations.push({ type: 'PROMOTE', incoming: m.incoming, existing: m.existing });
    } else {
      skippedCount++;
      auditLog.push({
        studentId: m.incoming.studentNo,
        studentName: `${m.incoming.lastName}, ${m.incoming.firstName}`,
        courseCode: m.incoming.courseCode,
        yearLevel: m.incoming.yearLevel,
        action: 'SKIPPED (Admin Choice)',
      });
    }
  }

  // C. Name Conflicts
  for (const c of nameConflicts) {
    if (c.decision === 'OVERWRITE_EXISTING') {
      operations.push({ type: 'OVERWRITE', incoming: c.incoming, existing: c.existing });
    } else {
      skippedCount++;
      auditLog.push({
        studentId: c.incoming.studentNo,
        studentName: `${c.incoming.lastName}, ${c.incoming.firstName} (vs DB: ${c.existing.lastName})`,
        courseCode: c.incoming.courseCode,
        yearLevel: c.incoming.yearLevel,
        action: 'SKIPPED (Name Collision Conflict)',
      });
    }
  }

  // D. Missing from New List (Unenrolled / Graduating)
  for (const mis of missingStudents) {
    if (mis.decision === 'SET_INACTIVE') {
      operations.push({
        type: 'INACTIVATE',
        student: mis.student,
        reason: `Not present in Registrar List for ${analysis.fileSummary.detectedSchoolYear} ${analysis.fileSummary.detectedSemester}`,
      });
    } else if (mis.decision === 'ARCHIVE_GRADUATED') {
      operations.push({ type: 'GRADUATE', student: mis.student });
    } else {
      skippedCount++;
      auditLog.push({
        studentId: mis.student.studentId,
        studentName: `${mis.student.lastName}, ${mis.student.firstName}`,
        courseCode: mis.student.courseCode,
        yearLevel: mis.student.yearLevel,
        action: 'RETAINED ACTIVE (Missing from list, skipped by admin)',
      });
    }
  }

  const totalOps = operations.length;
  const CHUNK_SIZE = 400; // Safe Firestore limit per batch is 500

  for (let i = 0; i < totalOps; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const op of chunk) {
      if (op.type === 'CREATE') {
        const defaultPassword = generateDefaultStudentPassword(op.student.lastName, op.student.studentNo);
        const newRef = doc(collection(db, STUDENTS_COLLECTION));
        const cleanProgCode = op.student.courseCode.trim().toUpperCase();
        const courseInfo = courseIdMap.get(cleanProgCode);
        const resolvedDept = resolveDepartmentForProgram(op.student.courseCode, op.student.academicLevel);
        const studentDept = courseInfo?.departmentId
          ? analysis.existingDepartments.get(courseInfo.departmentId) || analysis.existingDepartments.get(courseInfo.departmentId.toUpperCase())
          : undefined;

        const newDoc: StudentDocument = {
          id: newRef.id,
          studentId: op.student.studentNo,
          lastName: op.student.lastName,
          firstName: op.student.firstName,
          middleName: op.student.middleName || '',
          sex: op.student.sex,
          dateOfBirth: '',
          contactNumber: '',
          academicLevel: op.student.academicLevel,
          courseId: courseInfo?.id || '',
          courseCode: op.student.courseCode,
          courseName: courseInfo?.name || op.student.courseName,
          departmentId: courseInfo?.departmentId || resolvedDept.id,
          departmentName: studentDept?.name || resolvedDept.name || '',
          yearLevel: op.student.yearLevel,
          section: 'UNASSIGNED',
          schoolYear: analysis.fileSummary.detectedSchoolYear,
          semester: analysis.fileSummary.detectedSemester,
          term: analysis.fileSummary.detectedSemester,
          email: '', // Student uploads/provides their email directly on mobile app during first login
          authUid: '',
          requiresPasswordChange: true,
          isProfileComplete: false,
          defaultPassword,
          profilePhotoUrl: '',
          schoolIdPhotoUrl: '',
          status: 'ACTIVE',
          registrationSource: 'REGISTRAR_IMPORT',
          addedBy: adminUid,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        batch.set(newRef, newDoc);
        createdCount++;
        auditLog.push({
          studentId: op.student.studentNo,
          studentName: `${op.student.lastName}, ${op.student.firstName}`,
          courseCode: op.student.courseCode,
          yearLevel: op.student.yearLevel,
          action: 'CREATED (New Student)',
          defaultPassword,
        });
      } else if (op.type === 'PROMOTE') {
        const ref = doc(db, STUDENTS_COLLECTION, op.existing.id);
        const cleanProgCode = op.incoming.courseCode.trim().toUpperCase();
        const courseInfo = courseIdMap.get(cleanProgCode);
        const resolvedDept = resolveDepartmentForProgram(op.incoming.courseCode, op.incoming.academicLevel);
        const studentDept = courseInfo?.departmentId
          ? analysis.existingDepartments.get(courseInfo.departmentId) || analysis.existingDepartments.get(courseInfo.departmentId.toUpperCase())
          : undefined;

        const priorHistory = op.existing.enrollmentHistory || [];
        const newHistoryItem = {
          schoolYear: op.existing.schoolYear || 'PRIOR',
          semester: op.existing.semester || 'PRIOR',
          yearLevel: op.existing.yearLevel || '',
          courseCode: op.existing.courseCode || '',
          courseName: op.existing.courseName || '',
          section: op.existing.section || '',
          updatedAt: new Date().toISOString(),
        };

        batch.update(ref, {
          schoolYear: analysis.fileSummary.detectedSchoolYear,
          semester: analysis.fileSummary.detectedSemester,
          term: analysis.fileSummary.detectedSemester,
          yearLevel: op.incoming.yearLevel,
          courseCode: op.incoming.courseCode,
          courseName: courseInfo?.name || op.incoming.courseName,
          courseId: courseInfo?.id || op.existing.courseId || '',
          departmentId: courseInfo?.departmentId || op.existing.departmentId || resolvedDept.id,
          departmentName: studentDept?.name || op.existing.departmentName || resolvedDept.name || '',
          academicLevel: op.incoming.academicLevel,
          status: 'ACTIVE',
          rejectionReason: '',
          enrollmentHistory: [...priorHistory, newHistoryItem],
          updatedAt: Timestamp.now(),
        });

        promotedCount++;
        auditLog.push({
          studentId: op.existing.studentId,
          studentName: `${op.existing.lastName}, ${op.existing.firstName}`,
          courseCode: op.incoming.courseCode,
          yearLevel: op.incoming.yearLevel,
          action: `PROMOTED (from ${op.existing.yearLevel || 'Prior'} to ${op.incoming.yearLevel})`,
        });
      } else if (op.type === 'OVERWRITE') {
        const ref = doc(db, STUDENTS_COLLECTION, op.existing.id);
        const cleanProgCode = op.incoming.courseCode.trim().toUpperCase();
        const courseInfo = courseIdMap.get(cleanProgCode);
        const resolvedDept = resolveDepartmentForProgram(op.incoming.courseCode, op.incoming.academicLevel);
        const studentDept = courseInfo?.departmentId
          ? analysis.existingDepartments.get(courseInfo.departmentId) || analysis.existingDepartments.get(courseInfo.departmentId.toUpperCase())
          : undefined;

        batch.update(ref, {
          lastName: op.incoming.lastName,
          firstName: op.incoming.firstName,
          middleName: op.incoming.middleName || '',
          sex: op.incoming.sex,
          schoolYear: analysis.fileSummary.detectedSchoolYear,
          semester: analysis.fileSummary.detectedSemester,
          term: analysis.fileSummary.detectedSemester,
          yearLevel: op.incoming.yearLevel,
          courseCode: op.incoming.courseCode,
          courseName: courseInfo?.name || op.incoming.courseName,
          courseId: courseInfo?.id || op.existing.courseId || '',
          departmentId: courseInfo?.departmentId || op.existing.departmentId || resolvedDept.id,
          departmentName: studentDept?.name || op.existing.departmentName || resolvedDept.name || '',
          status: 'ACTIVE',
          updatedAt: Timestamp.now(),
        });

        promotedCount++;
        auditLog.push({
          studentId: op.incoming.studentNo,
          studentName: `${op.incoming.lastName}, ${op.incoming.firstName}`,
          courseCode: op.incoming.courseCode,
          yearLevel: op.incoming.yearLevel,
          action: 'OVERWRITTEN (Conflict Resolved by Admin)',
        });
      } else if (op.type === 'INACTIVATE') {
        const ref = doc(db, STUDENTS_COLLECTION, op.student.id);
        batch.update(ref, {
          status: 'INACTIVE',
          rejectionReason: op.reason,
          updatedAt: Timestamp.now(),
        });

        inactivatedCount++;
        auditLog.push({
          studentId: op.student.studentId,
          studentName: `${op.student.lastName}, ${op.student.firstName}`,
          courseCode: op.student.courseCode,
          yearLevel: op.student.yearLevel,
          action: 'MARKED INACTIVE (Not enrolled in new list)',
        });
      } else if (op.type === 'GRADUATE') {
        const ref = doc(db, STUDENTS_COLLECTION, op.student.id);
        batch.update(ref, {
          status: 'ARCHIVED',
          archiveReason: 'Graduated',
          archivedAt: Timestamp.now(),
          archivedBy: adminUid,
          updatedAt: Timestamp.now(),
        });

        graduatedCount++;
        auditLog.push({
          studentId: op.student.studentId,
          studentName: `${op.student.lastName}, ${op.student.firstName}`,
          courseCode: op.student.courseCode,
          yearLevel: op.student.yearLevel,
          action: 'ARCHIVED (Graduated)',
        });
      }
    }

    await batch.commit();
    const currentProgress = Math.min(i + CHUNK_SIZE, totalOps);
    onProgress?.(
      currentProgress,
      totalOps,
      `Committing changes: ${currentProgress} / ${totalOps} records processed...`
    );
  }

  return {
    totalProcessed: totalOps,
    createdCount,
    promotedCount,
    inactivatedCount,
    graduatedCount,
    skippedCount,
    coursesProvisioned,
    auditLog,
  };
}
