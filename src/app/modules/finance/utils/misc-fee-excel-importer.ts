import * as XLSX from 'xlsx';
import type {
  MiscFeeBucket,
  MiscFeeSemesterTerm,
  ComputedBucketBalance,
} from '../types/misc-fee.types';

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
  existingBuckets: MiscFeeBucket[] = []
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
          college1stSemRateLY: col1LY,
          college1stSemRateTY: col1TY,
          college2ndSemRateLY: col2LY,
          college2ndSemRateTY: col2TY,
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
          shsRateLY: shsLY,
          shsRateTY: shsTY,
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

  return {
    templateType: detectedType,
    schoolYear,
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
  const college1stSemEnrolled = Math.max(0, Number(counts.college1stSemEnrolled) || 0);
  const college2ndSemEnrolled = Math.max(0, Number(counts.college2ndSemEnrolled) || 0);

  const isGrade12Only = String(bucket.level || '').toLowerCase().includes('grade 12');
  const applicableShsCount = isGrade12Only ? shsGrade12Enrolled : shsEnrolled;

  const shsAnnualPool = (Number(bucket.shsRateTY) || 0) * applicableShsCount;
  const college1stSemPool = (Number(bucket.college1stSemRateTY) || 0) * college1stSemEnrolled;
  const college2ndSemPool = (Number(bucket.college2ndSemRateTY) || 0) * college2ndSemEnrolled;

  const pool1stSem = shsAnnualPool + college1stSemPool;
  const disbursed1st = Number(bucket.disbursed1stSem) || 0;
  const returned1st = Number(bucket.returnedSurplus1stSem) || 0;
  const available1stSem = Math.max(0, pool1stSem - disbursed1st + returned1st);

  const carryOverFrom1stSem = Number(bucket.carryOverFrom1stSem) || 0;
  const pool2ndSem = carryOverFrom1stSem + college2ndSemPool;
  const disbursed2nd = Number(bucket.disbursed2ndSem) || 0;
  const returned2nd = Number(bucket.returnedSurplus2ndSem) || 0;
  const available2ndSem = Math.max(0, pool2ndSem - disbursed2nd + returned2nd);

  const isSecondSem = activeSemester === '2nd Semester';

  return {
    bucket,
    shsEnrolled: applicableShsCount,
    shsGrade12Enrolled,
    college1stSemEnrolled,
    college2ndSemEnrolled,
    shsAnnualPool,
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
