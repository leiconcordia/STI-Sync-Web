import { useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { createSingletonStream } from '../../../utils/createSingletonStream';
import type {
  MiscFeeConfigDocument,
  MiscFeeLedgerEntry,
  ComputedBucketBalance,
} from '../types/misc-fee.types';
import {
  MISC_FEE_CONFIGS_COLLECTION,
  MISC_FEE_LEDGER_COLLECTION,
  createDefaultMiscFeeConfig,
} from '../services/misc-fee.service';
import { parseTimestampMillis } from './useFinanceStream';
import {
  computeBucketBalance,
  inferSaoActivityEligibility,
} from '../utils/misc-fee-excel-importer';
import { useStudents } from '../../students/hooks/useStudentStream';
import { useSemesters } from '../../academic/hooks/useAcademicStream';

const miscFeeConfigsStream = createSingletonStream<MiscFeeConfigDocument[]>({
  initialData: [],
  start: (emit) => {
    return onSnapshot(
      collection(db, MISC_FEE_CONFIGS_COLLECTION),
      (snap) => {
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) } as MiscFeeConfigDocument)
        );
        docs.sort((a, b) => String(b.schoolYear || '').localeCompare(String(a.schoolYear || '')));
        emit(docs);
      },
      (err) => {
        console.warn('[useMiscFeeStream] Snapshot warning:', err?.message);
        emit([]);
      }
    );
  },
});

const normalizeSY = (sy: any): string =>
  String(sy || '')
    .replace(/^sy\s*/i, '')
    .replace(/^a\.?y\.?\s*/i, '')
    .trim()
    .toLowerCase();

export function useMiscFeeConfigs() {
  const { data: configs, loading } = miscFeeConfigsStream.use();

  const { data: students = [] } = useStudents();
  const { data: semesters = [] } = useSemesters();

  // Resolve active terms directly from Academic Year & Semester Maintenance (SemesterDocument.academicYear)
  const activeAcademicTerm = useMemo(() => {
    const activeCollege = semesters.find(
      (s) => s.status === 'ACTIVE' && s.academicLevel !== 'SHS'
    );
    const activeShs = semesters.find(
      (s) => s.status === 'ACTIVE' && s.academicLevel === 'SHS'
    );
    const activeAny = semesters.find((s) => s.status === 'ACTIVE') || semesters[0];
    const target = activeCollege || activeAny;
    const schoolYear =
      (target?.academicYear || (target as any)?.schoolYear || '2026-2027')
        .replace(/^sy\s*/i, '')
        .trim();
    const shsSchoolYear =
      (activeShs?.academicYear || schoolYear).replace(/^sy\s*/i, '').trim();
    const isSecond = String(target?.semester || '').toLowerCase().includes('2nd');
    return {
      schoolYear,
      shsSchoolYear,
      semester: (isSecond ? '2nd Semester' : '1st Semester') as '1st Semester' | '2nd Semester',
      collegeTermLabel: target?.label || '',
      shsTermLabel: activeShs?.label || '',
    };
  }, [semesters]);

  const activeConfig = useMemo(() => {
    const match = configs.find(
      (c) => normalizeSY(c.schoolYear) === normalizeSY(activeAcademicTerm.schoolYear)
    );
    if (match) return match;
    if (configs.length > 0) return configs[0];
    return createDefaultMiscFeeConfig(
      activeAcademicTerm.schoolYear,
      activeAcademicTerm.semester
    );
  }, [configs, activeAcademicTerm]);

  // Compute live enrolled SHS & College counts from Student Registry
  // Mirrors StudentRegistry.tsx & RegistryDashboard.tsx exact active categorization (e.g. 963 College + 75 SHS = 1,038).
  const liveRegistryCounts = useMemo(() => {
    const EXCLUDED = new Set(['INACTIVE', 'SUSPENDED', 'ARCHIVED']);

    let shs = 0;
    let shsGrade11 = 0;
    let shsGrade12 = 0;
    let collegeTotal = 0;

    for (const s of students) {
      const status = String(s.status || 'ACTIVE').toUpperCase().trim();
      if (EXCLUDED.has(status)) continue;

      const ylLower = String(s.yearLevel || s.year || '').toLowerCase();

      // Match RegistryDashboard.tsx exact College vs SHS classification
      const isCollege =
        s.academicLevel === 'COLLEGE' ||
        (!s.academicLevel &&
          !String(s.semester || '').includes('Trimester') &&
          s.yearLevel !== 'Grade 11' &&
          s.yearLevel !== 'Grade 12');

      if (!isCollege) {
        shs++;
        if (ylLower.includes('11')) shsGrade11++;
        else if (ylLower.includes('12')) shsGrade12++;
      } else {
        collegeTotal++;
      }
    }

    const college1stSem = collegeTotal;
    const college2ndSem = collegeTotal;
    const college = collegeTotal;

    return {
      shs,
      shsGrade11,
      shsGrade12,
      college,
      college1stSem,
      college2ndSem,
    };
  }, [students]);

  const effectiveHeadcounts = useMemo(() => {
    if (activeConfig.headcountSource === 'student_registry') {
      return {
        shsEnrolled: liveRegistryCounts.shs,
        shsGrade12Enrolled: liveRegistryCounts.shsGrade12,
        college1stSemEnrolled: liveRegistryCounts.college1stSem,
        college2ndSemEnrolled: liveRegistryCounts.college2ndSem,
        isUsingLiveRegistry: true,
      };
    }
    return {
      shsEnrolled: activeConfig.shsEnrolledOverride || 0,
      shsGrade12Enrolled: activeConfig.shsEnrolledOverride || 0,
      college1stSemEnrolled: activeConfig.college1stSemEnrolledOverride || 0,
      college2ndSemEnrolled: activeConfig.college2ndSemEnrolledOverride || 0,
      isUsingLiveRegistry: false,
    };
  }, [activeConfig, liveRegistryCounts]);

  const computedBuckets: ComputedBucketBalance[] = useMemo(() => {
    return (activeConfig.buckets || []).map((b) =>
      computeBucketBalance(b, effectiveHeadcounts, activeConfig.activeSemester)
    );
  }, [activeConfig, effectiveHeadcounts]);

  const saoEligibleBuckets = useMemo(() => {
    return computedBuckets.filter(
      (cb) =>
        cb.bucket.saoEligible &&
        String(cb.bucket.assessmentType || '').toLowerCase() === 'assessment' &&
        inferSaoActivityEligibility(cb.bucket.assessmentType, cb.bucket.mfTitle, cb.bucket.particular)
    );
  }, [computedBuckets]);

  return {
    configs,
    activeConfig,
    activeAcademicTerm,
    loading,
    liveRegistryCounts,
    effectiveHeadcounts,
    computedBuckets,
    saoEligibleBuckets,
  };
}

const miscFeeLedgerStream = createSingletonStream<
  (MiscFeeLedgerEntry & {
    allocations?: Array<{ bucketId: string; bucketName: string; amount: number }>;
  })[]
>({
  initialData: [],
  start: (emit) => {
    return onSnapshot(
      collection(db, MISC_FEE_LEDGER_COLLECTION),
      (snap) => {
        const docs = snap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...(d.data() as any),
            } as MiscFeeLedgerEntry & {
              allocations?: Array<{ bucketId: string; bucketName: string; amount: number }>;
            })
        );
        docs.sort((a, b) => parseTimestampMillis(b.createdAt) - parseTimestampMillis(a.createdAt));
        emit(docs);
      },
      (err) => {
        console.warn('[useMiscFeeLedger] Snapshot warning:', err?.message);
        emit([]);
      }
    );
  },
});

export function useMiscFeeLedger() {
  return miscFeeLedgerStream.use();
}
