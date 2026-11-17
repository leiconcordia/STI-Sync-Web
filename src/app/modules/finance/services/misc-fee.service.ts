import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type {
  MiscFeeConfigDocument,
  MiscFeeBucket,
  MiscFeeSemesterTerm,
  MiscFeeLedgerEntry,
} from '../types/misc-fee.types';
import {
  computeBucketBalance,
} from '../utils/misc-fee-excel-importer';
import { STUDENTS_COLLECTION } from '../../students/services/student.service';
import { logAuditEvent } from '../../audit/services/audit.service';
import { initializeNewSchoolYearRetainedFunds } from './retained-fund.service';

export const MISC_FEE_CONFIGS_COLLECTION = 'miscellaneous_fee_configs';
export const MISC_FEE_LEDGER_COLLECTION = 'miscellaneous_fee_ledger';

export function normalizeMiscSchoolYear(sy?: string | null): string {
  return String(sy || '')
    .replace(/^sy\s*/i, '')
    .replace(/^a\.?y\.?\s*/i, '')
    .replace(/–/g, '-')
    .trim();
}

export function buildMiscFeeDocId(schoolYear: string): string {
  const clean = normalizeMiscSchoolYear(schoolYear || '2026-2027').replace(/[^0-9-]/g, '');
  return `SY_${clean || '2026-2027'}`;
}

export function createDefaultMiscFeeConfig(
  schoolYear = '2026-2027',
  activeSemester: MiscFeeSemesterTerm = '1st Semester'
): MiscFeeConfigDocument {
  const cleanSy = normalizeMiscSchoolYear(schoolYear || '2026-2027') || '2026-2027';
  return {
    id: buildMiscFeeDocId(cleanSy),
    schoolYear: cleanSy,
    status: 'ACTIVE',
    isActive: true,
    activeSemester,
    headcountSource: 'student_registry',
    shsEnrolledOverride: 0,
    college1stSemEnrolledOverride: 0,
    college2ndSemEnrolledOverride: 0,
    is1stSemCarriedOver: false,
    shsUploadedForSY: false,
    college1stSemUploaded: false,
    college2ndSemUploaded: false,
    buckets: [],
  };
}

export async function saveMiscFeeConfig(
  config: MiscFeeConfigDocument,
  performedBy = 'SAS Admin'
): Promise<void> {
  const cleanSy = normalizeMiscSchoolYear(config.schoolYear) || '2026-2027';
  const docId = config.id || buildMiscFeeDocId(cleanSy);
  const docRef = doc(db, MISC_FEE_CONFIGS_COLLECTION, docId);
  await setDoc(
    docRef,
    {
      ...config,
      id: docId,
      schoolYear: cleanSy,
      status: config.status || 'ACTIVE',
      isActive: config.isActive ?? (config.status !== 'CLOSED'),
      updatedBy: performedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Closes 1st Semester and carries over unspent bucket balances into 2nd Semester
 * of the SAME School Year (per Ma'am Sheena's Carry-Over Rule).
 */
export async function carryOver1stSemBalancesTo2ndSem(
  config: MiscFeeConfigDocument,
  counts: {
    shsEnrolled: number;
    shsGrade12Enrolled?: number;
    college1stSemEnrolled: number;
    college2ndSemEnrolled: number;
  },
  performedBy = 'SAS Admin'
): Promise<MiscFeeConfigDocument> {
  const updatedBuckets: MiscFeeBucket[] = config.buckets.map((b) => {
    const computed = computeBucketBalance(b, counts, '1st Semester');
    return {
      ...b,
      carryOverFrom1stSem: computed.available1stSem,
    };
  });

  const updatedConfig: MiscFeeConfigDocument = {
    ...config,
    status: config.status || 'ACTIVE',
    isActive: config.isActive ?? true,
    activeSemester: '2nd Semester',
    is1stSemCarriedOver: true,
    buckets: updatedBuckets,
  };

  await saveMiscFeeConfig(updatedConfig, performedBy);
  try {
    await logAuditEvent({
      action: 'MISC_FEE_CARRY_OVER_2ND_SEM',
      actionType: 'UPDATE',
      details: `Carried over 1st Semester unspent Miscellaneous Fee balances to 2nd Semester for SY ${config.schoolYear}.`,
      performedBy,
      userRole: 'SAS Admin',
      targetId: updatedConfig.id,
      targetName: `SY ${config.schoolYear} Miscellaneous Fees`,
    });
  } catch {}
  return updatedConfig;
}

export function getSuggestedNextSchoolYear(currentSchoolYear?: string | null): string {
  const clean = normalizeMiscSchoolYear(currentSchoolYear);
  const match = clean.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    const nowYear = new Date().getFullYear();
    return `${nowYear}-${nowYear + 1}`;
  }
  const startYear = parseInt(match[1], 10);
  return `${startYear + 1}-${startYear + 2}`;
}

export function validateNewSchoolYear(
  rawInput: string,
  existingSchoolYears: string[] = [],
  currentActiveSY?: string | null
): { valid: boolean; normalized: string; error?: string } {
  const clean = normalizeMiscSchoolYear(rawInput);
  if (!clean) {
    return { valid: false, normalized: '', error: 'School Year is required (e.g. 2027-2028).' };
  }
  const match = clean.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    return {
      valid: false,
      normalized: clean,
      error: 'Invalid format. Enter exact YYYY-YYYY years only (e.g. 2027-2028).',
    };
  }
  const startYear = parseInt(match[1], 10);
  const endYear = parseInt(match[2], 10);
  if (startYear < 2020 || startYear > 2099) {
    return {
      valid: false,
      normalized: clean,
      error: 'Start year must be between 2020 and 2099.',
    };
  }
  if (endYear !== startYear + 1) {
    return {
      valid: false,
      normalized: clean,
      error: `Invalid span: end year must be ${startYear + 1} (e.g. ${startYear}-${startYear + 1}).`,
    };
  }

  const normalizedExisting = existingSchoolYears
    .map((sy) => normalizeMiscSchoolYear(sy))
    .filter(Boolean);
  if (normalizedExisting.includes(clean)) {
    return {
      valid: false,
      normalized: clean,
      error: `SY ${clean} already exists.`,
    };
  }

  const referenceYears = [
    ...normalizedExisting,
    ...(currentActiveSY ? [normalizeMiscSchoolYear(currentActiveSY)] : []),
  ]
    .map((sy) => {
      const m = sy.match(/^(\d{4})-(\d{4})$/);
      return m ? { sy, start: parseInt(m[1], 10) } : null;
    })
    .filter((x): x is { sy: string; start: number } => Boolean(x));

  if (referenceYears.length > 0) {
    referenceYears.sort((a, b) => b.start - a.start);
    const latest = referenceYears[0];
    if (startYear <= latest.start) {
      return {
        valid: false,
        normalized: clean,
        error: `New School Year must be after SY ${latest.sy} (e.g. ${latest.start + 1}-${latest.start + 2}).`,
      };
    }
  }

  return { valid: true, normalized: clean };
}

/**
 * Initializes a brand-new School Year with a clean ₱0.00 slate:
 * - Closes/archives the previous School Year config so its budget, carry-overs, and ledgers stay recorded in history only.
 * - Creates the new School Year config with empty buckets (₱0.00 pool/carry-over/disbursed/surplus) awaiting new SHS + Term 1 Tertiary Excel uploads.
 * - Snapshots prior School Year Retained Funds / Student Contributions into closed history and initializes the new SY's Retained Fund & Student Contributions at ₱0.00.
 */
export async function cloneMiscFeeConfigForNewSchoolYear(
  newSchoolYear: string,
  sourceConfig?: MiscFeeConfigDocument | null,
  performedBy = 'SAS Admin'
): Promise<MiscFeeConfigDocument> {
  const allSnap = await getDocs(collection(db, MISC_FEE_CONFIGS_COLLECTION));
  const existingYears = allSnap.docs.map((d) =>
    normalizeMiscSchoolYear((d.data() as MiscFeeConfigDocument).schoolYear)
  );
  const prevSy = normalizeMiscSchoolYear(sourceConfig?.schoolYear);

  const check = validateNewSchoolYear(newSchoolYear, existingYears, prevSy || null);
  if (!check.valid) {
    throw new Error(check.error || 'Please enter a valid consecutive School Year (e.g. 2027-2028).');
  }
  const cleanSy = check.normalized;

  // Close existing active configs so historical years are preserved read-only
  for (const snapDoc of allSnap.docs) {
    const existing = snapDoc.data() as MiscFeeConfigDocument;
    if (snapDoc.id !== buildMiscFeeDocId(cleanSy) && (existing.isActive || existing.status !== 'CLOSED')) {
      await setDoc(
        doc(db, MISC_FEE_CONFIGS_COLLECTION, snapDoc.id),
        {
          status: 'CLOSED',
          isActive: false,
          closedAt: serverTimestamp(),
          updatedBy: performedBy,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  // Explicitly ensure the closing sourceConfig itself is persisted as CLOSED even if newly saved
  if (sourceConfig && prevSy) {
    const prevId = sourceConfig.id || buildMiscFeeDocId(prevSy);
    await setDoc(
      doc(db, MISC_FEE_CONFIGS_COLLECTION, prevId),
      {
        ...sourceConfig,
        id: prevId,
        schoolYear: prevSy,
        status: 'CLOSED',
        isActive: false,
        closedAt: serverTimestamp(),
        updatedBy: performedBy,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // Initialize brand-new SY with ₱0.00 Misc Pools, Carry-Over, and Counters
  const newConfig: MiscFeeConfigDocument = {
    id: buildMiscFeeDocId(cleanSy),
    schoolYear: cleanSy,
    status: 'ACTIVE',
    isActive: true,
    activeSemester: '1st Semester',
    headcountSource: 'student_registry',
    shsEnrolledOverride: 0,
    college1stSemEnrolledOverride: 0,
    college2ndSemEnrolledOverride: 0,
    is1stSemCarriedOver: false,
    shsUploadedForSY: false,
    college1stSemUploaded: false,
    college2ndSemUploaded: false,
    buckets: [],
  };

  await saveMiscFeeConfig(newConfig, performedBy);

  // Snapshot old SY Retained Funds & Student Contributions to closed archive and initialize new SY at ₱0.00
  await initializeNewSchoolYearRetainedFunds(prevSy || null, cleanSy, performedBy);

  try {
    await logAuditEvent({
      action: 'MISC_FEE_NEW_SY_RESET',
      actionType: 'CREATE',
      details: `Closed SY ${prevSy || 'previous'} (archived to history) and initialized SY ${cleanSy} with ₱0.00 Miscellaneous Pools, Carry-Over, Student Contributions, and Retained Funds.`,
      performedBy,
      userRole: 'SAS Admin',
      targetId: newConfig.id,
      targetName: `SY ${cleanSy} Miscellaneous Fees`,
    });
  } catch {}
  return newConfig;
}

function pickPreferredMiscConfig(docs: MiscFeeConfigDocument[]): MiscFeeConfigDocument | null {
  if (!docs || docs.length === 0) return null;
  const sorted = [...docs].sort((a, b) =>
    String(b.schoolYear || '').localeCompare(String(a.schoolYear || ''))
  );
  return (
    sorted.find((c) => c.isActive === true && c.status !== 'CLOSED') ||
    sorted.find((c) => c.status !== 'CLOSED') ||
    sorted[0]
  );
}

/**
 * Automatically deducts the disbursed amount from the selected Miscellaneous Fee bucket(s)
 * when a Disbursement Voucher is uploaded/saved.
 * Supports single or multiple selected buckets proportionally and is idempotent per eventId.
 */
export async function deductMiscFeeBucketOnDisbursement(params: {
  eventId: string;
  eventTitle?: string;
  bucketId: string;
  bucketIds?: string[];
  bucketAllocations?: Array<{
    bucketId: string;
    bucketName?: string;
    availableAmount?: number;
    allocatedAmount?: number;
  }>;
  bucketName?: string;
  amount: number;
  schoolYear?: string;
  semester?: string;
  chequeNumber?: string;
  performedBy?: string;
}): Promise<void> {
  const { eventId, bucketId } = params;
  const amount = Math.max(0, Number(params.amount) || 0);
  const targetBucketIds = Array.from(
    new Set(
      [
        ...(Array.isArray(params.bucketIds) ? params.bucketIds : []),
        ...(bucketId ? [bucketId] : []),
      ].filter(Boolean)
    )
  );
  if (!eventId || targetBucketIds.length === 0 || amount <= 0) return;

  // Locate target config doc (by schoolYear or latest available config)
  let configDoc: MiscFeeConfigDocument | null = null;
  if (params.schoolYear) {
    const syId = buildMiscFeeDocId(params.schoolYear);
    const snap = await getDoc(doc(db, MISC_FEE_CONFIGS_COLLECTION, syId));
    if (snap.exists()) {
      configDoc = { id: snap.id, ...(snap.data() as any) };
    }
  }

  if (!configDoc) {
    const allSnap = await getDocs(collection(db, MISC_FEE_CONFIGS_COLLECTION));
    if (!allSnap.empty) {
      const docs = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as MiscFeeConfigDocument));
      configDoc = pickPreferredMiscConfig(docs);
    }
    if (!configDoc) {
      configDoc = createDefaultMiscFeeConfig(params.schoolYear || '2026-2027');
    }
  }

  const isSecondSem =
    String(params.semester || configDoc.activeSemester || '')
      .toLowerCase()
      .includes('2nd') || configDoc.activeSemester === '2nd Semester';

  const ledgerDocId = `disb_${eventId}`;
  const ledgerRef = doc(db, MISC_FEE_LEDGER_COLLECTION, ledgerDocId);
  const existingLedgerSnap = await getDoc(ledgerRef);
  const prevAllocations: Array<{ bucketId: string; bucketName: string; amount: number }> = existingLedgerSnap.exists()
    ? Array.isArray(existingLedgerSnap.data()?.allocations)
      ? existingLedgerSnap.data()!.allocations
      : [
          {
            bucketId: String(existingLedgerSnap.data()?.bucketId || bucketId),
            bucketName: String(existingLedgerSnap.data()?.bucketName || ''),
            amount: Number(existingLedgerSnap.data()?.amount || 0),
          },
        ]
    : [];

  // Use explicit maker-specified allocatedAmount if provided; otherwise distribute proportionally by available weight
  const explicitAllocatedMap = new Map<string, number>();
  const allocWeightMap = new Map<string, number>();
  (params.bucketAllocations || []).forEach((a) => {
    if (!a.bucketId) return;
    if (a.allocatedAmount !== undefined && a.allocatedAmount !== null) {
      explicitAllocatedMap.set(a.bucketId, Math.max(0, Number(a.allocatedAmount) || 0));
    }
    allocWeightMap.set(a.bucketId, Math.max(0, Number(a.availableAmount) || 0));
  });
  const matchedBuckets = configDoc.buckets.filter(
    (b) =>
      targetBucketIds.includes(b.id) ||
      (targetBucketIds.length === 1 &&
        b.particular.toLowerCase() === (params.bucketName || '').toLowerCase())
  );
  const resolvedTargets = matchedBuckets.length > 0 ? matchedBuckets.map((b) => b.id) : targetBucketIds;

  const hasExplicitSplits =
    explicitAllocatedMap.size > 0 &&
    resolvedTargets.every((id) => explicitAllocatedMap.has(id));

  const newAllocations: Array<{ bucketId: string; bucketName: string; amount: number }> = [];
  if (hasExplicitSplits) {
    resolvedTargets.forEach((id) => {
      const matchedBucket = configDoc!.buckets.find((b) => b.id === id);
      const bName = matchedBucket?.particular || params.bucketName || id;
      newAllocations.push({
        bucketId: id,
        bucketName: bName,
        amount: Math.round((explicitAllocatedMap.get(id) || 0) * 100) / 100,
      });
    });
  } else {
    const totalWeight = resolvedTargets.reduce((s, id) => s + (allocWeightMap.get(id) || 0), 0);
    let remainingToAssign = Math.round(amount * 100) / 100;

    resolvedTargets.forEach((id, idx) => {
      const matchedBucket = configDoc!.buckets.find((b) => b.id === id);
      const bName = matchedBucket?.particular || params.bucketName || id;
      let share = 0;
      if (idx === resolvedTargets.length - 1) {
        share = Math.max(0, Math.round(remainingToAssign * 100) / 100);
      } else if (totalWeight > 0) {
        const weight = allocWeightMap.get(id) || 0;
        share = Math.round((amount * (weight / totalWeight)) * 100) / 100;
        remainingToAssign = Math.round((remainingToAssign - share) * 100) / 100;
      } else {
        share = Math.round((amount / resolvedTargets.length) * 100) / 100;
        remainingToAssign = Math.round((remainingToAssign - share) * 100) / 100;
      }
      newAllocations.push({ bucketId: id, bucketName: bName, amount: share });
    });
  }

  const updatedBuckets = configDoc.buckets.map((b) => {
    let next = { ...b };
    // Roll back prior deductions for idempotency on voucher re-upload
    for (const prev of prevAllocations) {
      if (b.id === prev.bucketId || (prev.bucketName && b.particular.toLowerCase() === prev.bucketName.toLowerCase())) {
        if (isSecondSem) {
          next.disbursed2ndSem = Math.max(0, (Number(next.disbursed2ndSem) || 0) - prev.amount);
        } else {
          next.disbursed1stSem = Math.max(0, (Number(next.disbursed1stSem) || 0) - prev.amount);
        }
      }
    }
    // Apply updated allocation(s)
    for (const curr of newAllocations) {
      if (b.id === curr.bucketId || (curr.bucketName && b.particular.toLowerCase() === curr.bucketName.toLowerCase())) {
        if (isSecondSem) {
          next.disbursed2ndSem = Math.max(0, (Number(next.disbursed2ndSem) || 0) + curr.amount);
        } else {
          next.disbursed1stSem = Math.max(0, (Number(next.disbursed1stSem) || 0) + curr.amount);
        }
      }
    }
    return next;
  });

  await saveMiscFeeConfig(
    {
      ...configDoc,
      buckets: updatedBuckets,
    },
    params.performedBy || 'Disbursement Voucher Upload'
  );

  const ledgerEntry: MiscFeeLedgerEntry & {
    allocations?: Array<{ bucketId: string; bucketName: string; amount: number }>;
  } = {
    id: ledgerDocId,
    schoolYear: configDoc.schoolYear,
    semester: isSecondSem ? '2nd Semester' : '1st Semester',
    bucketId: resolvedTargets[0],
    bucketName: newAllocations.map((a) => a.bucketName).join(' + ') || params.bucketName || bucketId,
    eventId,
    eventTitle: params.eventTitle || '',
    type: 'disbursement_deduction',
    amount,
    allocations: newAllocations,
    chequeNumber: params.chequeNumber || '',
    performedBy: params.performedBy || 'User',
    createdAt: serverTimestamp(),
  };

  await setDoc(ledgerRef, ledgerEntry, { merge: true });
}

/**
 * Reverses a Miscellaneous Fee bucket deduction if a Disbursement Voucher is deleted prior to liquidation.
 */
export async function reverseMiscFeeBucketDisbursement(
  eventId: string,
  performedBy = 'User'
): Promise<void> {
  if (!eventId) return;
  const ledgerDocId = `disb_${eventId}`;
  const ledgerRef = doc(db, MISC_FEE_LEDGER_COLLECTION, ledgerDocId);
  const snap = await getDoc(ledgerRef);
  if (!snap.exists()) return;

  const entry = snap.data() as MiscFeeLedgerEntry & {
    allocations?: Array<{ bucketId: string; bucketName: string; amount: number }>;
  };
  const amount = Number(entry.amount) || 0;
  if (amount <= 0) {
    await deleteDoc(ledgerRef);
    return;
  }

  const syId = buildMiscFeeDocId(entry.schoolYear);
  const configSnap = await getDoc(doc(db, MISC_FEE_CONFIGS_COLLECTION, syId));
  if (configSnap.exists()) {
    const configDoc = { id: configSnap.id, ...(configSnap.data() as any) } as MiscFeeConfigDocument;
    const isSecondSem = entry.semester === '2nd Semester';
    const allocs = Array.isArray(entry.allocations) && entry.allocations.length > 0
      ? entry.allocations
      : [{ bucketId: entry.bucketId, bucketName: entry.bucketName || '', amount }];

    const updatedBuckets = configDoc.buckets.map((b) => {
      let next = { ...b };
      for (const a of allocs) {
        if (b.id === a.bucketId || (a.bucketName && b.particular.toLowerCase() === a.bucketName.toLowerCase())) {
          next = {
            ...next,
            disbursed1stSem: isSecondSem
              ? next.disbursed1stSem
              : Math.max(0, (Number(next.disbursed1stSem) || 0) - a.amount),
            disbursed2ndSem: isSecondSem
              ? Math.max(0, (Number(next.disbursed2ndSem) || 0) - a.amount)
              : next.disbursed2ndSem,
          };
        }
      }
      return next;
    });
    await saveMiscFeeConfig({ ...configDoc, buckets: updatedBuckets }, performedBy);
  }

  await deleteDoc(ledgerRef);
}

/**
 * Credits unspent cash surplus (Disbursed > Actual Expenses) back into the Miscellaneous Fee bucket(s)
 * when the Financial Liquidation (with Cashier return receipt) is approved.
 * Respects multi-bucket allocations from `disb_${eventId}` if present.
 */
export async function creditMiscFeeBucketOnLiquidationSurplus(params: {
  liquidationId: string;
  eventId: string;
  eventTitle?: string;
  bucketId: string;
  bucketIds?: string[];
  bucketName?: string;
  surplusAmount: number;
  explicitReturnAllocations?: Array<{ bucketId: string; bucketName: string; returnAmount: number }>;
  schoolYear?: string;
  semester?: string;
  performedBy?: string;
}): Promise<void> {
  const { liquidationId, eventId, bucketId } = params;
  const surplusAmount = Math.max(0, Number(params.surplusAmount) || 0);
  const explicitReturns = Array.isArray(params.explicitReturnAllocations)
    ? params.explicitReturnAllocations.filter((r) => Number(r.returnAmount) > 0)
    : [];
  const targetBucketIds = Array.from(
    new Set(
      [
        ...explicitReturns.map((r) => r.bucketId),
        ...(Array.isArray(params.bucketIds) ? params.bucketIds : []),
        ...(bucketId ? [bucketId] : []),
      ].filter(Boolean)
    )
  );
  if (!liquidationId || targetBucketIds.length === 0 || surplusAmount <= 0) return;

  const ledgerDocId = `surplus_${liquidationId}`;
  const ledgerRef = doc(db, MISC_FEE_LEDGER_COLLECTION, ledgerDocId);
  const existingSnap = await getDoc(ledgerRef);
  if (existingSnap.exists()) {
    return;
  }

  // Check if disbursement voucher recorded exact per-bucket allocations
  let disbAllocations: Array<{ bucketId: string; bucketName: string; amount: number }> = [];
  if (eventId) {
    try {
      const disbSnap = await getDoc(doc(db, MISC_FEE_LEDGER_COLLECTION, `disb_${eventId}`));
      if (disbSnap.exists() && Array.isArray(disbSnap.data()?.allocations)) {
        disbAllocations = disbSnap.data()!.allocations;
      }
    } catch {}
  }

  let configDoc: MiscFeeConfigDocument | null = null;
  if (params.schoolYear) {
    const syId = buildMiscFeeDocId(params.schoolYear);
    const snap = await getDoc(doc(db, MISC_FEE_CONFIGS_COLLECTION, syId));
    if (snap.exists()) {
      configDoc = { id: snap.id, ...(snap.data() as any) };
    }
  }

  if (!configDoc) {
    const allSnap = await getDocs(collection(db, MISC_FEE_CONFIGS_COLLECTION));
    if (!allSnap.empty) {
      const docs = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as MiscFeeConfigDocument));
      configDoc =
        docs.find((c) => c.isActive === true && c.status !== 'CLOSED') ||
        docs.find((c) => c.status !== 'CLOSED') ||
        [...docs].sort((a, b) => String(b.schoolYear || '').localeCompare(String(a.schoolYear || '')))[0];
    }
  }

  if (!configDoc) return;

  const isSecondSem =
    String(params.semester || configDoc.activeSemester || '')
      .toLowerCase()
      .includes('2nd') || configDoc.activeSemester === '2nd Semester';

  // Use explicit SAS/Admin return split if provided; otherwise compute proportional return
  const returnAllocs: Array<{ bucketId: string; bucketName: string; amount: number }> = [];
  if (explicitReturns.length > 0) {
    explicitReturns.forEach((r) => {
      returnAllocs.push({
        bucketId: r.bucketId,
        bucketName: r.bucketName,
        amount: Math.round((Number(r.returnAmount) || 0) * 100) / 100,
      });
    });
  } else if (disbAllocations.length > 0) {
    const totalDisb = disbAllocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    let rem = Math.round(surplusAmount * 100) / 100;
    disbAllocations.forEach((a, idx) => {
      const share =
        idx === disbAllocations.length - 1
          ? Math.max(0, Math.round(rem * 100) / 100)
          : totalDisb > 0
          ? Math.round(surplusAmount * ((Number(a.amount) || 0) / totalDisb) * 100) / 100
          : Math.round((surplusAmount / disbAllocations.length) * 100) / 100;
      rem = Math.round((rem - share) * 100) / 100;
      returnAllocs.push({ bucketId: a.bucketId, bucketName: a.bucketName, amount: share });
    });
  } else {
    let rem = Math.round(surplusAmount * 100) / 100;
    targetBucketIds.forEach((id, idx) => {
      const share =
        idx === targetBucketIds.length - 1
          ? Math.max(0, Math.round(rem * 100) / 100)
          : Math.round((surplusAmount / targetBucketIds.length) * 100) / 100;
      rem = Math.round((rem - share) * 100) / 100;
      const matched = configDoc!.buckets.find((b) => b.id === id);
      returnAllocs.push({
        bucketId: id,
        bucketName: matched?.particular || params.bucketName || id,
        amount: share,
      });
    });
  }

  const updatedBuckets = configDoc.buckets.map((b) => {
    let next = { ...b };
    for (const r of returnAllocs) {
      if (b.id === r.bucketId || (r.bucketName && b.particular.toLowerCase() === r.bucketName.toLowerCase())) {
        next = {
          ...next,
          returnedSurplus1stSem: isSecondSem
            ? next.returnedSurplus1stSem
            : (Number(next.returnedSurplus1stSem) || 0) + r.amount,
          returnedSurplus2ndSem: isSecondSem
            ? (Number(next.returnedSurplus2ndSem) || 0) + r.amount
            : next.returnedSurplus2ndSem,
        };
      }
    }
    return next;
  });

  await saveMiscFeeConfig(
    { ...configDoc, buckets: updatedBuckets },
    params.performedBy || 'Liquidation Surplus Return'
  );

  const ledgerEntry: MiscFeeLedgerEntry & {
    allocations?: Array<{ bucketId: string; bucketName: string; amount: number }>;
  } = {
    id: ledgerDocId,
    schoolYear: configDoc.schoolYear,
    semester: isSecondSem ? '2nd Semester' : '1st Semester',
    bucketId: returnAllocs[0].bucketId,
    bucketName: returnAllocs.map((a) => a.bucketName).join(' + ') || params.bucketName || bucketId,
    eventId,
    eventTitle: params.eventTitle || '',
    liquidationId,
    type: 'liquidation_surplus_return',
    amount: surplusAmount,
    allocations: returnAllocs,
    performedBy: params.performedBy || 'SAS Admin',
    createdAt: serverTimestamp(),
  };

  await setDoc(ledgerRef, ledgerEntry, { merge: true });
}

async function resolveMiscFeeHeadcountsForService(
  configDoc: MiscFeeConfigDocument
): Promise<{
  shsEnrolled: number;
  shsGrade12Enrolled: number;
  college1stSemEnrolled: number;
  college2ndSemEnrolled: number;
}> {
  if (configDoc.headcountSource !== 'student_registry') {
    return {
      shsEnrolled: Number(configDoc.shsEnrolledOverride) || 0,
      shsGrade12Enrolled: Number(configDoc.shsEnrolledOverride) || 0,
      college1stSemEnrolled: Number(configDoc.college1stSemEnrolledOverride) || 0,
      college2ndSemEnrolled: Number(configDoc.college2ndSemEnrolledOverride) || 0,
    };
  }

  const EXCLUDED = new Set(['INACTIVE', 'SUSPENDED', 'ARCHIVED']);
  const targetSy = normalizeMiscSchoolYear(configDoc.schoolYear);
  const snap = await getDocs(collection(db, STUDENTS_COLLECTION));
  let shs = 0;
  let shsGrade12 = 0;
  let collegeTotal = 0;
  let college1stSemExplicit = 0;
  let college2ndSemExplicit = 0;

  snap.forEach((docSnap) => {
    const s = docSnap.data() as any;
    const status = String(s.status || 'ACTIVE').toUpperCase().trim();
    if (EXCLUDED.has(status)) return;

    const studentSy = normalizeMiscSchoolYear(s.schoolYear);
    if (targetSy && studentSy && studentSy !== targetSy) {
      return;
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
      if (ylLower.includes('12')) shsGrade12++;
    } else {
      collegeTotal++;
      const semLower = String(s.semester || '').toLowerCase();
      if (semLower.includes('2nd')) college2ndSemExplicit++;
      else college1stSemExplicit++;
    }
  });

  return {
    shsEnrolled: shs,
    shsGrade12Enrolled: shsGrade12,
    college1stSemEnrolled: college1stSemExplicit > 0 ? college1stSemExplicit : collegeTotal,
    college2ndSemEnrolled: college2ndSemExplicit > 0 ? college2ndSemExplicit : collegeTotal,
  };
}

/**
 * Debits Miscellaneous Fee bucket(s) for an approved overspent Financial Liquidation deficit.
 * - Verifies live available balance per bucket before deducting (prevents negative balances).
 * - Writes one explicit ledger doc per bucket (`deficit_${liquidationId}_${bucketId}`) for full auditability.
 */
export async function debitMiscFeeBucketOnLiquidationDeficit(params: {
  liquidationId: string;
  eventId: string;
  eventTitle?: string;
  explicitDeficitAllocations: Array<{
    bucketId: string;
    bucketName: string;
    deductAmount: number;
    availableBalance?: number;
    isSupplementalSource?: boolean;
  }>;
  schoolYear?: string;
  semester?: string;
  chequeNumber?: string;
  performedBy?: string;
}): Promise<void> {
  const { liquidationId, eventId } = params;
  const targetRows = (params.explicitDeficitAllocations || []).filter(
    (r) => r.bucketId && Number(r.deductAmount) > 0.009
  );
  if (!liquidationId || targetRows.length === 0) return;

  let configDoc: MiscFeeConfigDocument | null = null;
  if (params.schoolYear) {
    const syId = buildMiscFeeDocId(params.schoolYear);
    const snap = await getDoc(doc(db, MISC_FEE_CONFIGS_COLLECTION, syId));
    if (snap.exists()) {
      configDoc = { id: snap.id, ...(snap.data() as any) };
    }
  }

  if (!configDoc) {
    const allSnap = await getDocs(collection(db, MISC_FEE_CONFIGS_COLLECTION));
    if (!allSnap.empty) {
      const docs = allSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as MiscFeeConfigDocument));
      configDoc =
        docs.find((c) => c.isActive === true && c.status !== 'CLOSED') ||
        docs.find((c) => c.status !== 'CLOSED') ||
        [...docs].sort((a, b) => String(b.schoolYear || '').localeCompare(String(a.schoolYear || '')))[0];
    }
  }

  if (!configDoc) {
    throw new Error('Active Miscellaneous Fee configuration not found for deficit deduction.');
  }

  const isSecondSem =
    String(params.semester || configDoc.activeSemester || '')
      .toLowerCase()
      .includes('2nd') || configDoc.activeSemester === '2nd Semester';

  const headcounts = await resolveMiscFeeHeadcountsForService(configDoc);
  const rowsToPost: Array<{
    bucketId: string;
    bucketName: string;
    deductAmount: number;
    isSupplementalSource?: boolean;
  }> = [];

  for (const row of targetRows) {
    const ledgerDocId = `deficit_${liquidationId}_${row.bucketId}`;
    const existingSnap = await getDoc(doc(db, MISC_FEE_LEDGER_COLLECTION, ledgerDocId));
    if (existingSnap.exists()) {
      continue;
    }

    const matchedBucket = configDoc.buckets.find(
      (b) =>
        b.id === row.bucketId ||
        (row.bucketName && b.particular.toLowerCase() === row.bucketName.toLowerCase())
    );
    if (!matchedBucket) {
      throw new Error(`Miscellaneous Fee bucket "${row.bucketName || row.bucketId}" not found.`);
    }

    const computed = computeBucketBalance(matchedBucket, headcounts, configDoc.activeSemester);
    const liveAvail = computed.currentAvailable;
    const deductAmt = Math.round(Number(row.deductAmount) * 100) / 100;

    if (deductAmt > liveAvail + 0.009) {
      throw new Error(
        `Insufficient balance in "${matchedBucket.particular}": needs ₱${deductAmt.toLocaleString()} but only ₱${liveAvail.toLocaleString()} is available.`
      );
    }

    rowsToPost.push({
      bucketId: matchedBucket.id,
      bucketName: matchedBucket.particular || row.bucketName,
      deductAmount: deductAmt,
      isSupplementalSource: row.isSupplementalSource,
    });
  }

  if (rowsToPost.length === 0) return;

  const updatedBuckets = configDoc.buckets.map((b) => {
    let next = { ...b };
    for (const r of rowsToPost) {
      if (b.id === r.bucketId || (r.bucketName && b.particular.toLowerCase() === r.bucketName.toLowerCase())) {
        if (isSecondSem) {
          next.disbursed2ndSem = Math.round(((Number(next.disbursed2ndSem) || 0) + r.deductAmount) * 100) / 100;
        } else {
          next.disbursed1stSem = Math.round(((Number(next.disbursed1stSem) || 0) + r.deductAmount) * 100) / 100;
        }
      }
    }
    return next;
  });

  await saveMiscFeeConfig(
    { ...configDoc, buckets: updatedBuckets },
    params.performedBy || 'Liquidation Deficit Coverage'
  );

  for (const r of rowsToPost) {
    const ledgerDocId = `deficit_${liquidationId}_${r.bucketId}`;
    const ledgerEntry: MiscFeeLedgerEntry & { isSupplementalSource?: boolean } = {
      id: ledgerDocId,
      schoolYear: configDoc.schoolYear,
      semester: isSecondSem ? '2nd Semester' : '1st Semester',
      bucketId: r.bucketId,
      bucketName: r.bucketName,
      eventId: eventId || '',
      eventTitle: params.eventTitle || '',
      liquidationId,
      type: 'liquidation_deficit_deduction',
      amount: r.deductAmount,
      chequeNumber: params.chequeNumber || '',
      performedBy: params.performedBy || 'SAS Admin',
      isSupplementalSource: Boolean(r.isSupplementalSource),
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, MISC_FEE_LEDGER_COLLECTION, ledgerDocId), ledgerEntry, { merge: true });
  }
}
