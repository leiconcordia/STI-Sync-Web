import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { DEPARTMENTS_COLLECTION, COURSES_COLLECTION, SECTIONS_COLLECTION, SEMESTERS_COLLECTION } from '../services/academic.service';
import type { DepartmentDocument, CourseDocument, SectionDocument, SemesterDocument } from '../types/academic.types';

export function useDepartments() {
  const [data, setData] = useState<DepartmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, DEPARTMENTS_COLLECTION), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map(doc => doc.data() as DepartmentDocument));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

export function useCourses() {
  const [data, setData] = useState<CourseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, COURSES_COLLECTION), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map(doc => doc.data() as CourseDocument));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

export function useSections() {
  const [data, setData] = useState<SectionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, SECTIONS_COLLECTION), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map(doc => doc.data() as SectionDocument));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

export function useSemesters() {
  const [data, setData] = useState<SemesterDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, SEMESTERS_COLLECTION), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setData(snap.docs.map(doc => doc.data() as SemesterDocument));
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}
