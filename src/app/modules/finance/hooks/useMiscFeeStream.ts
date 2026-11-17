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
  normalizeMiscSchoolYear,
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

const normalizeSY = (sy: any): string => normalizeMiscSchoolYear(sy).toLowerCase();

export function useMiscFeeConfigs(selectedSchoolYear?: string | null) {
  const { data: configs, loading } = miscFeeConfigsStream.use();

  const { data: students = [] } = useStudents();
  const { data: semesters = [] } = useSemesters();

  // Resolve active School Year & Term with MiscFeeConfig as the primary source of truth
  // (falls back to semesters collection only when no active MiscFeeConfig exists yet).
  const activeConfig = useMemo(() => {
    const explicitActive = configs.find(
      (c) => c.isActive === true && c.status !== 'CLOSED'
    );
    if (explicitActive) return explicitActive;

    const firstOpen = configs.find((c) => c.status !== 'CLOSED');
    if (firstOpen) return firstOpen;

    if (configs.length > 0) return configs[0];

    const activeSem =
      semesters.find((s) => s.status === 'ACTIVE' && s.academicLevel !== 'SHS') ||
      semesters.find((s) => s.status === 'ACTIVE') ||
      semesters[0];
    const fallbackSy = normalizeMiscSchoolYear(
      activeSem?.academicYear || (activeSem as any)?.schoolYear || '2026-2027'
    ) || '2026-2027';
    const isSecond = String(activeSem?.semester || '').toLowerCase().includes('2nd');
    return createDefaultMiscFeeConfig(
      fallbackSy,
      isSecond ? '2nd Semester' : '1st Semester'
    );
  }, [configs, semesters]);

  const viewedConfig = useMemo(() => {
    if (selectedSchoolYear) {
      const matched = configs.find(
        (c) => normalizeSY(c.schoolYear) === normalizeSY(selectedSchoolYear)
      );
      if (matched) return matched;
    }
    return activeConfig;
  }, [configs, activeConfig, selectedSchoolYear]);

  const isViewingHistory = useMemo(() => {
    if (!viewedConfig) return false;
    return (
      viewedConfig.status === 'CLOSED' ||
      (Boolean(activeConfig?.schoolYear) &&
        normalizeSY(viewedConfig.schoolYear) !== normalizeSY(activeConfig.schoolYear))
    );
  }, [viewedConfig, activeConfig]);

  const activeAcademicTerm = useMemo(() => {
    const schoolYear = normalizeMiscSchoolYear(activeConfig?.schoolYear) || '2026-2027';
    const activeShs = semesters.find(
      (s) => s.status === 'ACTIVE' && s.academicLevel === 'SHS'
    );
    const activeCollege = semesters.find(
      (s) => s.status === 'ACTIVE' && s.academicLevel !== 'SHS'
    );
    return {
      schoolYear,
      shsSchoolYear: schoolYear,
      semester: (activeConfig?.activeSemester || '1st Semester') as '1st Semester' | '2nd Semester',
      collegeTermLabel: activeCollege?.label || `${schoolYear} • ${activeConfig?.activeSemester || '1st Semester'}`,
      shsTermLabel: activeShs?.label || `${schoolYear} • Annual`,
    };
  }, [activeConfig, semesters]);

  // Compute live enrolled SHS & College counts from Student Registry scoped strictly to viewedConfig.schoolYear.
  // SHS students are counted once per School Year; College tracks 1st vs 2nd Sem when present.
  const liveRegistryCounts = useMemo(() => {
    const EXCLUDED = new Set(['INACTIVE', 'SUSPENDED', 'ARCHIVED']);
    const targetSyNorm = normalizeSY(viewedConfig?.schoolYear);
    const oldestSyNorm = configs.length > 0
      ? normalizeSY(configs[configs.length - 1]?.schoolYear)
      : targetSyNorm;
    const allowUntaggedLegacy = !targetSyNorm || configs.length <= 1 || targetSyNorm === oldestSyNorm;

    let shs = 0;
    let shsGrade11 = 0;
    let shsGrade12 = 0;
    let collegeTotal = 0;
    let college1stSemExplicit = 0;
    let college2ndSemExplicit = 0;

    for (const s of students) {
      const status = String(s.status || 'ACTIVE').toUpperCase().trim();
      if (EXCLUDED.has(status)) continue;

      const studentSyNorm = normalizeSY(s.schoolYear);
      if (targetSyNorm) {
        if (studentSyNorm) {
          if (studentSyNorm !== targetSyNorm) continue;
        } else if (!allowUntaggedLegacy) {
          continue;
        }
      }

      const ylLower = String(s.yearLevel || s.year || '').toLowerCase();

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
        const semLower = String(s.semester || '').toLowerCase();
        if (semLower.includes('2nd')) college2ndSemExplicit++;
        else college1stSemExplicit++;
      }
    }

    const college1stSem = college1stSemExplicit > 0 ? college1stSemExplicit : collegeTotal;
    const college2ndSem = college2ndSemExplicit > 0 ? college2ndSemExplicit : collegeTotal;
    const college = collegeTotal;

    return {
      shs,
      shsGrade11,
      shsGrade12,
      college,
      college1stSem,
      college2ndSem,
      hasExplicit2ndSemStudents: college2ndSemExplicit > 0,
    };
  }, [students, viewedConfig?.schoolYear, configs]);

  const effectiveHeadcounts = useMemo(() => {
    if (viewedConfig.headcountSource === 'student_registry') {
      return {
        shsEnrolled: liveRegistryCounts.shs,
        shsGrade12Enrolled: liveRegistryCounts.shsGrade12,
        college1stSemEnrolled: liveRegistryCounts.college1stSem,
        college2ndSemEnrolled: liveRegistryCounts.college2ndSem,
        isUsingLiveRegistry: true,
      };
    }
    return {
      shsEnrolled: viewedConfig.shsEnrolledOverride || 0,
      shsGrade12Enrolled: viewedConfig.shsEnrolledOverride || 0,
      college1stSemEnrolled: viewedConfig.college1stSemEnrolledOverride || 0,
      college2ndSemEnrolled: viewedConfig.college2ndSemEnrolledOverride || 0,
      isUsingLiveRegistry: false,
    };
  }, [viewedConfig, liveRegistryCounts]);

  const computedBuckets: ComputedBucketBalance[] = useMemo(() => {
    return (viewedConfig.buckets || []).map((b) =>
      computeBucketBalance(b, effectiveHeadcounts, viewedConfig.activeSemester)
    );
  }, [viewedConfig, effectiveHeadcounts]);

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
    viewedConfig,
    isViewingHistory,
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
