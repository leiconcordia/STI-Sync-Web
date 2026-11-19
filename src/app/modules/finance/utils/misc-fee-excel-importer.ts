import * as XLSX from 'xlsx';
import type {
  MiscFeeBucket,
  MiscFeeConfigDocument,
  MiscFeeSemesterTerm,
  ComputedBucketBalance,
} from '../types/misc-fee.types';

export const MAX_TERTIARY_UPLOADS_PER_SY = 2;
export const MAX_SHS_UPLOADS_PER_SY = 1;

export function getMiscFeeUploadCounts(
  config?: Pick<
    MiscFeeConfigDocument,
    | 'collegeUploadCount'
    | 'shsUploadCount'
    | 'shsUploadedForSY'
    | 'college1stSemUploaded'
    | 'college2ndSemUploaded'
    | 'uploadedImportFingerprints'
    | 'buckets'
  > | null
): { collegeCount: number; shsCount: number; hasBothSemCollegeRates: boolean } {
  const fps = Array.isArray(config?.uploadedImportFingerprints)
    ? config!.uploadedImportFingerprints!
    : [];

  const fpCollege = fps.filter(
    (f) => f.templateType === 'COLLEGE' || f.templateType === 'COMBINED'
  ).length;
  const fpShs = fps.filter(
    (f) => f.templateType === 'SHS' || f.templateType === 'COMBINED'
  ).length;

  const buckets = Array.isArray(config?.buckets) ? config!.buckets! : [];
  const hasLegacyCol1 = Boolean(
    config?.college1stSemUploaded ||
      buckets.some((b) => (Number(b.college1stSemRateTY) || 0) > 0)
  );
  const hasLegacyCol2 = Boolean(
    config?.college2ndSemUploaded ||
      buckets.some((b) => (Number(b.college2ndSemRateTY) || 0) > 0)
  );
  const hasBothSemCollegeRates = hasLegacyCol1 && hasLegacyCol2;
  const hasLegacyShs = Boolean(
    config?.shsUploadedForSY ||
      buckets.some(
        (b) => (Number(b.shsRateTY) || 0) > 0 || (Number(b.shs2ndSemRateTY) || 0) > 0
      )
  );

  const explicitCollege =
    typeof config?.collegeUploadCount === 'number'
      ? config.collegeUploadCount
      : hasBothSemCollegeRates
      ? 2
      : hasLegacyCol1 || hasLegacyCol2
      ? 1
      : 0;
  const explicitShs =
    typeof config?.shsUploadCount === 'number'
      ? config.shsUploadCount
      : hasLegacyShs
      ? 1
      : 0;

  return {
    // When a single Tertiary sheet already includes both 1st & 2nd Sem rates, treat Tertiary as complete.
    collegeCount: hasBothSemCollegeRates
      ? MAX_TERTIARY_UPLOADS_PER_SY
      : Math.max(explicitCollege, fpCollege),
    shsCount: Math.max(explicitShs, fpShs),
    hasBothSemCollegeRates,
  };
}

function fnv1aHex(input: string, seed = 0x811c9dc5): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function computeMiscImportFingerprint(
  templateType: 'SHS' | 'COLLEGE' | 'COMBINED',
  schoolYear: string | undefined,
  canonicalSignatures: string[]
): string {
  const normSy = String(schoolYear || '')
    .replace(/^sy\s*/i, '')
    .replace(/–/g, '-')
    .trim()
    .toLowerCase();
  const payload = `${templateType}::${normSy}::${[...canonicalSignatures].sort().join('\n')}`;
  return `${fnv1aHex(payload, 0x811c9dc5)}${fnv1aHex(payload, 0x9e3779b1)}`;
}

export function slugifyParticular(particular: string, program = 'All', level = 'All'): string {
  const base = `${particular}_${program}_${level}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `bucket_${Date.now()}`;
}

function toNum(val: any): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function parseStrictRate(val: any, rowLabel: string, colLabel: string): number {
  if (val === '' || val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    if (isNaN(val) || val < 0) {
      throw new Error(`Invalid rate in "${rowLabel}" (${colLabel}): rate cannot be negative or NaN.`);
    }
    return val;
  }
  const str = String(val).trim();
  if (!str || str === '-' || str === '—') return 0;
  // Reject values containing alphabetic letters (corrupt text cell)
  if (/[a-zA-Z]/.test(str.replace(/^php\s*/i, ''))) {
    throw new Error(`Invalid rate text "${str}" in "${rowLabel}" (${colLabel}).`);
  }
  const parsed = parseFloat(str.replace(/[₱,\s]/g, ''));
  if (isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid negative or non-numeric rate "${str}" in "${rowLabel}" (${colLabel}).`);
  }
  return parsed;
}

export interface ParsedMiscFeeImport {
  templateType: 'SHS' | 'COLLEGE' | 'COMBINED';
  schoolYear?: string;
  contentHash: string;
  canonicalSignatures: string[];
  shsEnrolled?: number;
  college1stSemEnrolled?: number;
  college2ndSemEnrolled?: number;
  excludedCount: number;
  parsedBuckets: MiscFeeBucket[];
  buckets: MiscFeeBucket[];
}

/**
 * Classifies whether a Miscellaneous Fee Particular belongs to pooled SAO-manageable
 * Assessment Student Related Activities.
 * Strictly excludes ALL Non-Assessment (optional/per-participant/graduating) fees,
 * medical/drug tests, IT/LMS/connectivity fees, and academic lab/course fees.
 */
export function inferSaoActivityEligibility(
  assessmentType: string,
  mfTitle: string,
  particular: string
): boolean {
  const assessLower = String(assessmentType || '').toLowerCase().trim();
  const titleLower = String(mfTitle || '').toLowerCase();
  const partLower = String(particular || '').toLowerCase();

  if (assessLower !== 'assessment') {
    return false;
  }
  if (partLower.includes('random drug test') || partLower.includes('commencement fee')) {
    return false;
  }
  if (titleLower.includes('student related activities')) {
    return true;
  }
  if (partLower === 'students organization fee' || partLower === 'student organization fee') {
    return true;
  }
  return false;
}

/**
 * Parses and strictly validates an uploaded Excel (.xlsx/.xls) file matching either
 * the official STI SHS/Tertiary Miscellaneous Fees layout (v2) or template v1.
 * Throws an error if the uploaded Excel file fails structural, rate, or duplicate validation.
 */
export function parseMiscFeeExcelWorkbook(
  buffer: ArrayBuffer,
  existingBuckets: MiscFeeBucket[] = [],
  options?: {
    targetTerm?: MiscFeeSemesterTerm;
    fallbackSchoolYear?: string;
    existingShsUploadCount?: number;
    existingCollegeUploadCount?: number;
  }
): ParsedMiscFeeImport {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new Error('Unable to read Excel file. Please upload a valid .xlsx or .xls Miscellaneous Fees file.');
  }

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('The uploaded Excel workbook contains no worksheets.');
  }

  const bucketMap = new Map<string, MiscFeeBucket>();
  const parsedFromFileMap = new Map<string, MiscFeeBucket>();
  const canonicalSignatures: string[] = [];

  existingBuckets.forEach((b) => {
    if (!b.saoEligible || String(b.assessmentType || '').toLowerCase() !== 'assessment') return;
    const key = b.particular.trim().toLowerCase();
    bucketMap.set(key, { ...b });
  });

  let detectedType: 'SHS' | 'COLLEGE' | 'COMBINED' = 'COMBINED';
  let sawShs = false;
  let sawCollege = false;
  let validSheetCount = 0;
  let excludedCount = 0;
  let schoolYear: string | undefined;
  let shsEnrolled: number | undefined;
  let college1stSemEnrolled: number | undefined;
  let college2ndSemEnrolled: number | undefined;

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes('summary')) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
    });
    if (!rows || rows.length < 7) continue;

    // Inspect top banner rows (0..4) for SHS vs Tertiary title and School Year
    const topBannerText = rows
      .slice(0, 5)
      .map((r) => (r || []).join(' '))
      .join(' ');
    const topBannerUpper = topBannerText.toUpperCase();

    const syMatch = topBannerText.match(/school\s*year[:\s]*([0-9]{4}\s*[-–]\s*[0-9]{4})/i);
    if (syMatch?.[1]) {
      schoolYear = syMatch[1].replace(/\s+/g, '').replace('–', '-');
    }

    // Parse legacy Row 4 key-value metadata if present
    const metaRow = rows[3] || [];
    for (let c = 0; c < metaRow.length; c++) {
      const cell = String(metaRow[c] || '').trim().toLowerCase();
      if (cell.includes('school year')) {
        const rawSy = String(metaRow[c + 1] || '').replace(/^sy\s*/i, '').trim();
        if (rawSy) schoolYear = rawSy;
      } else if (cell.includes('shs enrolled')) {
        const count = toNum(metaRow[c + 1]);
        if (count > 0) shsEnrolled = count;
      } else if (cell.includes('1st sem enrolled')) {
        const count = toNum(metaRow[c + 1]);
        if (count > 0) college1stSemEnrolled = count;
      } else if (cell.includes('2nd sem enrolled')) {
        const count = toNum(metaRow[c + 1]);
        if (count > 0) college2ndSemEnrolled = count;
      }
    }

    // Require BOTH "ASSESSMENT TYPE" (col 0) and "PARTICULAR" (col 4) in the header row
    let headerIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const firstCol = String(rows[r]?.[0] || '').trim().toUpperCase();
      const fifthCol = String(rows[r]?.[4] || '').trim().toUpperCase();
      if (firstCol === 'ASSESSMENT TYPE' && fifthCol === 'PARTICULAR') {
        headerIdx = r;
        break;
      }
    }

    if (headerIdx === -1) continue;

    // Locate the LY / TY subheader row (headerIdx + 1 for SHS, or headerIdx + 2 for College 2-row subheaders)
    let lyTyRowIdx = -1;
    for (const offset of [1, 2]) {
      const candidate = rows[headerIdx + offset] || [];
      if (
        String(candidate[7] || '').trim().toUpperCase() === 'LY' &&
        String(candidate[8] || '').trim().toUpperCase() === 'TY'
      ) {
        lyTyRowIdx = headerIdx + offset;
        break;
      }
    }

    if (lyTyRowIdx === -1) continue;

    const lyTyRow = rows[lyTyRowIdx] || [];
    const hasSecondSemCols =
      String(lyTyRow[9] || '').trim().toUpperCase() === 'LY' &&
      String(lyTyRow[10] || '').trim().toUpperCase() === 'TY';

    const headerRow = rows[headerIdx] || [];
    const explicitEligibleCol = headerRow.findIndex((h: any) =>
      String(h || '').toUpperCase().includes('SAO ACTIVITY ELIGIBLE')
    );

    const isShsSheet =
      !hasSecondSemCols &&
      (sheetName.toLowerCase().includes('shs') || topBannerUpper.includes('SENIOR HIGH SCHOOL'));
    const isCollegeSheet =
      hasSecondSemCols ||
      (!isShsSheet &&
        (sheetName.toLowerCase().includes('college') ||
          sheetName.toLowerCase().includes('tertiary') ||
          topBannerUpper.includes('TERTIARY')));

    validSheetCount++;
    if (isCollegeSheet) sawCollege = true;
    else sawShs = true;

    const dataStartIdx = lyTyRowIdx + 1;
    const seenInSheet = new Set<string>();

    for (let r = dataStartIdx; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const assessmentType = String(row[0] || '').trim();
      const upperCol0 = assessmentType.toUpperCase();

      // Stop if we reached the embedded SUMMARY OF MISCELLANEOUS FEES section or Grand Total
      if (
        upperCol0.includes('SUMMARY OF MISCELLANEOUS') ||
        upperCol0.includes('GRAND TOTAL')
      ) {
        break;
      }

      const particular = String(row[4] || '').trim();
      if (!particular) continue;

      const mfType = String(row[1] || '').trim();
      const mfTitle = String(row[2] || '').trim();
      const program = String(row[3] || 'All').trim() || 'All';
      const level = String(row[5] || 'All').trim() || 'All';
      const remarks = String(row[6] || '').trim();

      const dedupeKey = `${particular.toLowerCase()}::${program.toLowerCase()}::${level.toLowerCase()}`;
      if (seenInSheet.has(dedupeKey)) {
        throw new Error(`Duplicate Particular detected in sheet "${sheetName}": "${particular}".`);
      }
      seenInSheet.add(dedupeKey);

      const isAssessmentRow = assessmentType.toLowerCase() === 'assessment';
      let saoEligible: boolean;
      if (explicitEligibleCol !== -1) {
        const rawEligible = String(row[explicitEligibleCol] ?? '').trim().toLowerCase();
        saoEligible =
          isAssessmentRow && (rawEligible === 'yes' || rawEligible === 'true' || rawEligible === '1');
      } else {
        saoEligible = inferSaoActivityEligibility(assessmentType, mfTitle, particular);
      }

      // Only fetch Assessment SAO Activity Eligible particulars
      if (!saoEligible) {
        excludedCount++;
        continue;
      }

      const key = particular.toLowerCase();
      const existing = bucketMap.get(key);

      if (hasSecondSemCols) {
        const col1LY = parseStrictRate(row[7], particular, '1st Sem LY');
        const col1TY = parseStrictRate(row[8], particular, '1st Sem TY');
        const col2LY = parseStrictRate(row[9], particular, '2nd Sem LY');
        const col2TY = parseStrictRate(row[10], particular, '2nd Sem TY');

        canonicalSignatures.push(
          `COL4|${particular.toLowerCase()}|${program.toLowerCase()}|${level.toLowerCase()}|${col1LY}|${col1TY}|${col2LY}|${col2TY}`
        );

        // When re-uploading Tertiary Misc in 2nd Semester, preserve existing 1st Sem rates
        // if the 2nd Term sheet leaves 1st Sem columns at 0 so Term 1 history never zeros out.
        const preserve1stSemRates =
          (options?.targetTerm === '2nd Semester' || (options?.existingCollegeUploadCount ?? 0) >= 1) &&
          col1TY === 0 &&
          (existing?.college1stSemRateTY ?? 0) > 0;

        if ((options?.existingCollegeUploadCount ?? 0) >= 1) {
          const isSecondTermTarget = options?.targetTerm === '2nd Semester' || col2TY > 0;
          if (!isSecondTermTarget && (existing?.college1stSemRateTY ?? 0) > 0 && col1TY > 0) {
            throw new Error(
              `Duplicate 1st Semester Tertiary row for "${particular}": 1st Semester Tertiary rates for this particular already exist.`
            );
          }
          if (isSecondTermTarget && (existing?.college2ndSemRateTY ?? 0) > 0 && col2TY > 0) {
            throw new Error(
              `Duplicate 2nd Semester Tertiary row for "${particular}": 2nd Semester Tertiary rates for this particular already exist.`
            );
          }
        }

        const mergedBucket: MiscFeeBucket = {
          id: existing?.id || slugifyParticular(particular, program, level),
          particular,
          assessmentType: assessmentType || existing?.assessmentType || 'Assessment',
          mfType: mfType || existing?.mfType || 'Common MF',
          mfTitle: mfTitle || existing?.mfTitle || '',
          program: program || existing?.program || 'All',
          level: level || existing?.level || 'All',
          remarks: remarks || existing?.remarks || '',
          saoEligible: true,
          shsRateLY: existing?.shsRateLY ?? 0,
          shsRateTY: existing?.shsRateTY ?? 0,
          shs2ndSemRateLY: existing?.shs2ndSemRateLY ?? 0,
          shs2ndSemRateTY: existing?.shs2ndSemRateTY ?? 0,
          college1stSemRateLY: preserve1stSemRates ? (existing?.college1stSemRateLY ?? 0) : col1LY,
          college1stSemRateTY: preserve1stSemRates ? (existing?.college1stSemRateTY ?? 0) : col1TY,
          college2ndSemRateLY:
            (existing?.college2ndSemRateLY ?? 0) > 0 && col2LY === 0
              ? existing!.college2ndSemRateLY
              : col2LY,
          college2ndSemRateTY:
            (existing?.college2ndSemRateTY ?? 0) > 0 && col2TY === 0
              ? existing!.college2ndSemRateTY
              : col2TY,
          carryOverFrom1stSem: existing?.carryOverFrom1stSem ?? 0,
          disbursed1stSem: existing?.disbursed1stSem ?? 0,
          returnedSurplus1stSem: existing?.returnedSurplus1stSem ?? 0,
          disbursed2ndSem: existing?.disbursed2ndSem ?? 0,
          returnedSurplus2ndSem: existing?.returnedSurplus2ndSem ?? 0,
        };
        bucketMap.set(key, mergedBucket);
        parsedFromFileMap.set(key, mergedBucket);
      } else if (isCollegeSheet) {
        // 2-column Tertiary/College sheet (assigns to 1st or 2nd Sem based on targetTerm, defaulting to 1st Sem)
        const rateLY = parseStrictRate(row[7], particular, 'College LY');
        const rateTY = parseStrictRate(row[8], particular, 'College TY');
        const isSecond = options?.targetTerm === '2nd Semester';

        if ((options?.existingCollegeUploadCount ?? 0) >= 1) {
          if (isSecond && ((existing?.college2ndSemRateTY ?? 0) > 0 || (existing?.college2ndSemRateLY ?? 0) > 0)) {
            throw new Error(
              `Duplicate 2nd Semester Tertiary row for "${particular}": 2nd Semester Tertiary rates for this particular already exist.`
            );
          }
          if (!isSecond && ((existing?.college1stSemRateTY ?? 0) > 0 || (existing?.college1stSemRateLY ?? 0) > 0)) {
            throw new Error(
              `Duplicate 1st Semester Tertiary row for "${particular}": 1st Semester Tertiary rates for this particular already exist.`
            );
          }
        }

        canonicalSignatures.push(
          `COL2|${particular.toLowerCase()}|${program.toLowerCase()}|${level.toLowerCase()}|${rateLY}|${rateTY}|0|0`
        );

        const mergedBucket: MiscFeeBucket = {
          id: existing?.id || slugifyParticular(particular, program, level),
          particular,
          assessmentType: assessmentType || existing?.assessmentType || 'Assessment',
          mfType: mfType || existing?.mfType || 'Common MF',
          mfTitle: mfTitle || existing?.mfTitle || '',
          program: program || existing?.program || 'All',
          level: level || existing?.level || 'All',
          remarks: remarks || existing?.remarks || '',
          saoEligible: true,
          shsRateLY: existing?.shsRateLY ?? 0,
          shsRateTY: existing?.shsRateTY ?? 0,
          shs2ndSemRateLY: existing?.shs2ndSemRateLY ?? 0,
          shs2ndSemRateTY: existing?.shs2ndSemRateTY ?? 0,
          college1stSemRateLY: isSecond ? (existing?.college1stSemRateLY ?? 0) : rateLY,
          college1stSemRateTY: isSecond ? (existing?.college1stSemRateTY ?? 0) : rateTY,
          college2ndSemRateLY: isSecond ? rateLY : (existing?.college2ndSemRateLY ?? 0),
          college2ndSemRateTY: isSecond ? rateTY : (existing?.college2ndSemRateTY ?? 0),
          carryOverFrom1stSem: existing?.carryOverFrom1stSem ?? 0,
          disbursed1stSem: existing?.disbursed1stSem ?? 0,
          returnedSurplus1stSem: existing?.returnedSurplus1stSem ?? 0,
          disbursed2ndSem: existing?.disbursed2ndSem ?? 0,
          returnedSurplus2ndSem: existing?.returnedSurplus2ndSem ?? 0,
        };
        bucketMap.set(key, mergedBucket);
        parsedFromFileMap.set(key, mergedBucket);
      } else {
        const shsLY = parseStrictRate(row[7], particular, 'SHS LY');
        const shsTY = parseStrictRate(row[8], particular, 'SHS TY');
        const isSecond = options?.targetTerm === '2nd Semester';

        canonicalSignatures.push(
          `SHS|${particular.toLowerCase()}|${program.toLowerCase()}|${level.toLowerCase()}|${shsLY}|${shsTY}|0|0`
        );

        if (isSecond) {
          if (
            (existing?.shs2ndSemRateTY ?? 0) > 0 ||
            (existing?.shs2ndSemRateLY ?? 0) > 0
          ) {
            throw new Error(
              `Duplicate 2nd Semester SHS row for "${particular}": 2nd Semester SHS rates for this particular already exist. Re-uploading duplicate SHS data in the same semester is blocked.`
            );
          }
        } else if (
          (options?.existingShsUploadCount ?? 0) >= 1 &&
          ((existing?.shsRateTY ?? 0) > 0 || (existing?.shsRateLY ?? 0) > 0)
        ) {
          throw new Error(
            `Duplicate 1st Semester SHS row for "${particular}": 1st Semester SHS rates for this particular already exist. Upload new SHS particulars or switch to 2nd Semester.`
          );
        }

        const mergedBucket: MiscFeeBucket = {
          id: existing?.id || slugifyParticular(particular, program, level),
          particular,
          assessmentType: assessmentType || existing?.assessmentType || 'Assessment',
          mfType: mfType || existing?.mfType || 'Common MF',
          mfTitle: mfTitle || existing?.mfTitle || '',
          program: program || existing?.program || 'All',
          level: level || existing?.level || 'All',
          remarks: remarks || existing?.remarks || '',
          saoEligible: true,
          shsRateLY: isSecond ? (existing?.shsRateLY ?? 0) : shsLY,
          shsRateTY: isSecond ? (existing?.shsRateTY ?? 0) : shsTY,
          shs2ndSemRateLY: isSecond ? shsLY : (existing?.shs2ndSemRateLY ?? 0),
          shs2ndSemRateTY: isSecond ? shsTY : (existing?.shs2ndSemRateTY ?? 0),
          college1stSemRateLY: existing?.college1stSemRateLY ?? 0,
          college1stSemRateTY: existing?.college1stSemRateTY ?? 0,
          college2ndSemRateLY: existing?.college2ndSemRateLY ?? 0,
          college2ndSemRateTY: existing?.college2ndSemRateTY ?? 0,
          carryOverFrom1stSem: existing?.carryOverFrom1stSem ?? 0,
          disbursed1stSem: existing?.disbursed1stSem ?? 0,
          returnedSurplus1stSem: existing?.returnedSurplus1stSem ?? 0,
          disbursed2ndSem: existing?.disbursed2ndSem ?? 0,
          returnedSurplus2ndSem: existing?.returnedSurplus2ndSem ?? 0,
        };
        bucketMap.set(key, mergedBucket);
        parsedFromFileMap.set(key, mergedBucket);
      }
    }
  }

  if (validSheetCount === 0 || parsedFromFileMap.size === 0) {
    throw new Error(
      'Wrong or invalid Excel file. Please upload a valid SHS or Tertiary (College) Miscellaneous Fees Excel file with ASSESSMENT TYPE, PARTICULAR, LY/TY rate columns, and SAO-eligible Assessment rows.'
    );
  }

  if (sawShs && !sawCollege) detectedType = 'SHS';
  else if (sawCollege && !sawShs) detectedType = 'COLLEGE';
  else detectedType = 'COMBINED';

  const resolvedSyForHash = schoolYear || options?.fallbackSchoolYear || '';
  const contentHash = computeMiscImportFingerprint(
    detectedType,
    resolvedSyForHash,
    canonicalSignatures
  );

  return {
    templateType: detectedType,
    schoolYear,
    contentHash,
    canonicalSignatures,
    shsEnrolled,
    college1stSemEnrolled,
    college2ndSemEnrolled,
    excludedCount,
    parsedBuckets: Array.from(parsedFromFileMap.values()),
    buckets: Array.from(bucketMap.values()),
  };
}

/**
 * Computes actual fund pool and remaining balance for a single Miscellaneous Fee bucket.
 * Automatically scopes Level-Specific Grade 12 items (e.g. WRCC) to Grade 12 SHS enrolled count.
 */
export function computeBucketBalance(
  bucket: MiscFeeBucket,
  counts: {
    shsEnrolled: number;
    shsGrade12Enrolled?: number;
    shs2ndSemEnrolled?: number;
    shs2ndSemGrade12Enrolled?: number;
    college1stSemEnrolled: number;
    college2ndSemEnrolled: number;
  },
  activeSemester: MiscFeeSemesterTerm
): ComputedBucketBalance {
  const shsEnrolled = Math.max(0, Number(counts.shsEnrolled) || 0);
  const shsGrade12Enrolled = Math.max(
    0,
    counts.shsGrade12Enrolled !== undefined ? Number(counts.shsGrade12Enrolled) || 0 : shsEnrolled
  );
  const shs2ndBase =
    counts.shs2ndSemEnrolled !== undefined ? Math.max(0, Number(counts.shs2ndSemEnrolled) || 0) : shsEnrolled;
  const shs2ndG12Base =
    counts.shs2ndSemGrade12Enrolled !== undefined
      ? Math.max(0, Number(counts.shs2ndSemGrade12Enrolled) || 0)
      : counts.shs2ndSemEnrolled !== undefined
      ? shs2ndBase
      : shsGrade12Enrolled;
  const college1stSemEnrolled = Math.max(0, Number(counts.college1stSemEnrolled) || 0);
  const college2ndSemEnrolled = Math.max(0, Number(counts.college2ndSemEnrolled) || 0);

  const isGrade12Only = String(bucket.level || '').toLowerCase().includes('grade 12');
  const applicableShsCount = isGrade12Only ? shsGrade12Enrolled : shsEnrolled;
  const applicableShs2ndCount = isGrade12Only ? shs2ndG12Base : shs2ndBase;

  const shsAnnualPool = (Number(bucket.shsRateTY) || 0) * applicableShsCount;
  const shs2ndSemPool = (Number(bucket.shs2ndSemRateTY) || 0) * applicableShs2ndCount;
  const college1stSemPool = (Number(bucket.college1stSemRateTY) || 0) * college1stSemEnrolled;
  const college2ndSemPool = (Number(bucket.college2ndSemRateTY) || 0) * college2ndSemEnrolled;

  const pool1stSem = shsAnnualPool + college1stSemPool;
  const disbursed1st = Number(bucket.disbursed1stSem) || 0;
  const returned1st = Number(bucket.returnedSurplus1stSem) || 0;
  const available1stSem = Math.max(0, pool1stSem - disbursed1st + returned1st);

  const carryOverFrom1stSem = Number(bucket.carryOverFrom1stSem) || 0;
  const pool2ndSem = carryOverFrom1stSem + college2ndSemPool + shs2ndSemPool;
  const disbursed2nd = Number(bucket.disbursed2ndSem) || 0;
  const returned2nd = Number(bucket.returnedSurplus2ndSem) || 0;
  const available2ndSem = Math.max(0, pool2ndSem - disbursed2nd + returned2nd);

  const isSecondSem = activeSemester === '2nd Semester';

  return {
    bucket,
    shsEnrolled: applicableShsCount,
    shsGrade12Enrolled,
    shs2ndSemEnrolled: applicableShs2ndCount,
    college1stSemEnrolled,
    college2ndSemEnrolled,
    shsAnnualPool,
    shs2ndSemPool,
    college1stSemPool,
    college2ndSemPool,
    pool1stSem,
    available1stSem,
    carryOverFrom1stSem,
    pool2ndSem,
    available2ndSem,
    currentPool: isSecondSem ? pool2ndSem : pool1stSem,
    currentDisbursed: isSecondSem ? disbursed2nd : disbursed1st,
    currentReturnedSurplus: isSecondSem ? returned2nd : returned1st,
    currentAvailable: isSecondSem ? available2ndSem : available1stSem,
  };
}
