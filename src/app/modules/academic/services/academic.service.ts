import { doc, collection, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { DepartmentDocument, CourseDocument, SectionDocument, SemesterDocument, SemesterTerm } from '../types/academic.types';

export const DEPARTMENTS_COLLECTION = 'departments';
export const COURSES_COLLECTION     = 'courses';
export const SECTIONS_COLLECTION    = 'sections';
export const SEMESTERS_COLLECTION   = 'semesters';

// ─── DEPARTMENTS ─────────────────────────────────────────────────────────────

export async function createDepartment(data: Pick<DepartmentDocument, 'name' | 'code'>): Promise<void> {
  const newRef = doc(collection(db, DEPARTMENTS_COLLECTION));
  await setDoc(newRef, {
    id: newRef.id,
    ...data,
    archived: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function updateDepartment(id: string, data: Partial<Pick<DepartmentDocument, 'name' | 'code' | 'archived'>>): Promise<void> {
  const ref = doc(db, DEPARTMENTS_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteDepartment(id: string): Promise<void> {
  const ref = doc(db, DEPARTMENTS_COLLECTION, id);
  await deleteDoc(ref);
}

// ─── COURSES ─────────────────────────────────────────────────────────────────

export async function createCourse(data: Pick<CourseDocument, 'name' | 'code' | 'departmentId' | 'yearLevels'>): Promise<void> {
  const newRef = doc(collection(db, COURSES_COLLECTION));
  await setDoc(newRef, {
    id: newRef.id,
    ...data,
    archived: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function updateCourse(id: string, data: Partial<Pick<CourseDocument, 'name' | 'code' | 'departmentId' | 'yearLevels' | 'archived'>>): Promise<void> {
  const ref = doc(db, COURSES_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteCourse(id: string): Promise<void> {
  const ref = doc(db, COURSES_COLLECTION, id);
  await deleteDoc(ref);
}

// ─── SECTIONS ────────────────────────────────────────────────────────────────

export async function createSection(data: Pick<SectionDocument, 'name' | 'courseId' | 'departmentId' | 'yearLevel'>): Promise<void> {
  const newRef = doc(collection(db, SECTIONS_COLLECTION));
  await setDoc(newRef, {
    id: newRef.id,
    ...data,
    archived: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function updateSection(id: string, data: Partial<Pick<SectionDocument, 'name' | 'courseId' | 'departmentId' | 'yearLevel' | 'archived'>>): Promise<void> {
  const ref = doc(db, SECTIONS_COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteSection(id: string): Promise<void> {
  const ref = doc(db, SECTIONS_COLLECTION, id);
  await deleteDoc(ref);
}

// ─── SEMESTERS ────────────────────────────────────────────────────────────────

/**
 * Derives the standardised semester label from the form inputs.
 * Format: A.Y.{startYear}-{endYear}-{1S|2S}
 * Example: A.Y.2026-2027-1S
 */
export function generateSemesterLabel(academicYear: string, semester: SemesterTerm): string {
  const clean = academicYear.replace(/\s/g, '').replace(/[–—]/g, '-');
  const suffix = semester === '1st Semester' ? '1S' : '2S';
  return `A.Y.${clean}-${suffix}`;
}

export async function createSemester(
  data: Pick<SemesterDocument, 'academicYear' | 'semester' | 'startDate' | 'endDate' | 'reenrollDeadline' | 'status'>
): Promise<void> {
  const newRef = doc(collection(db, SEMESTERS_COLLECTION));
  const label  = generateSemesterLabel(data.academicYear, data.semester);
  await setDoc(newRef, {
    id: newRef.id,
    ...data,
    label,
    events:   0,
    students: 0,
    archived: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  } satisfies SemesterDocument);
}

export async function updateSemester(
  id: string,
  data: Partial<Pick<SemesterDocument, 'academicYear' | 'semester' | 'startDate' | 'endDate' | 'reenrollDeadline' | 'status' | 'archived'>>
): Promise<void> {
  const ref = doc(db, SEMESTERS_COLLECTION, id);
  const extra: Record<string, unknown> = { updatedAt: Timestamp.now() };
  // Re-derive label if semester or academicYear changed
  if (data.academicYear || data.semester) {
    // We need both fields — caller must supply both when either changes
    if (data.academicYear && data.semester) {
      extra['label'] = generateSemesterLabel(data.academicYear, data.semester);
    }
  }
  await updateDoc(ref, { ...data, ...extra });
}

export async function archiveSemester(id: string): Promise<void> {
  const ref = doc(db, SEMESTERS_COLLECTION, id);
  await updateDoc(ref, { archived: true, status: 'COMPLETED', updatedAt: Timestamp.now() });
}

export async function deleteSemester(id: string): Promise<void> {
  const ref = doc(db, SEMESTERS_COLLECTION, id);
  await deleteDoc(ref);
}
