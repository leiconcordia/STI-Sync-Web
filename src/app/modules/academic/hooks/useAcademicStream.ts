import { useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { DEPARTMENTS_COLLECTION, COURSES_COLLECTION, SECTIONS_COLLECTION, SEMESTERS_COLLECTION } from '../services/academic.service';
import type { DepartmentDocument, CourseDocument, SectionDocument, SemesterDocument } from '../types/academic.types';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const departmentsStream = createSingletonStream<DepartmentDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(collection(db, DEPARTMENTS_COLLECTION), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => emit(snap.docs.map((d) => d.data() as DepartmentDocument)),
      (err) => emitError(err)
    );
  },
});

const coursesStream = createSingletonStream<CourseDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(collection(db, COURSES_COLLECTION), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => emit(snap.docs.map((d) => d.data() as CourseDocument)),
      (err) => emitError(err)
    );
  },
});

const sectionsStream = createSingletonStream<SectionDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(collection(db, SECTIONS_COLLECTION), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snap) => emit(snap.docs.map((d) => d.data() as SectionDocument)),
      (err) => emitError(err)
    );
  },
});

const semestersStream = createSingletonStream<SemesterDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(collection(db, SEMESTERS_COLLECTION), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => emit(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as SemesterDocument)),
      (err) => emitError(err)
    );
  },
});

export function useDepartments() {
  return departmentsStream.use();
}

export function useCourses() {
  return coursesStream.use();
}

export function useSections() {
  return sectionsStream.use();
}

export function useSemesters() {
  return semestersStream.use();
}

export function useActiveAcademicPeriods() {
  const { data: periods = [], loading, error } = useSemesters();

  const activeCollegePeriod = useMemo(
    () =>
      periods.find(
        (p) =>
          !p.archived &&
          (p.academicLevel === 'COLLEGE' || (!p.academicLevel && !String(p.semester).includes('Trimester'))) &&
          p.status === 'ACTIVE'
      ),
    [periods]
  );

  const activeShsPeriod = useMemo(
    () =>
      periods.find(
        (p) =>
          !p.archived &&
          (p.academicLevel === 'SHS' || String(p.semester).includes('Trimester')) &&
          p.status === 'ACTIVE'
      ),
    [periods]
  );

  /** Helper to get active period matching a specific academic level */
  const getActivePeriodFor = (level: import('../types/academic.types').AcademicLevel | undefined) => {
    return level === 'SHS' ? activeShsPeriod : activeCollegePeriod;
  };

  /** Helper to evaluate if a student needs re-enrollment */
  const isStudentPendingReEnrollment = (student: { academicLevel?: import('../types/academic.types').AcademicLevel; yearLevel?: string; schoolYear?: string; semester?: string; term?: string }) => {
    const isShs =
      student.academicLevel === 'SHS' ||
      (student.semester && String(student.semester).includes('Trimester')) ||
      student.yearLevel === 'Grade 11' ||
      student.yearLevel === 'Grade 12' ||
      (typeof student.yearLevel === 'string' && student.yearLevel.toLowerCase().includes('grade'));
    const activePeriod = getActivePeriodFor(isShs ? 'SHS' : 'COLLEGE');
    if (!activePeriod) return false;

    const studentTerm = student.term || student.semester;
    return (
      student.schoolYear !== activePeriod.academicYear ||
      studentTerm !== activePeriod.semester
    );
  };

  return {
    periods,
    activeCollegePeriod,
    activeShsPeriod,
    getActivePeriodFor,
    isStudentPendingReEnrollment,
    loading,
    error,
  };
}
