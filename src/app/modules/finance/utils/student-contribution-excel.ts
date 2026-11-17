import * as XLSX from 'xlsx';
import type { PayableDocument } from '../types/payable.types';

export interface CashierMatchedRow {
  rowNumber: number;
  studentIdInput: string;
  studentNameInput: string;
  payable: PayableDocument;
  paidAmount: number;
  orNumber: string;
  paidDate: string;
}

export interface CashierAlreadyPaidRow {
  rowNumber: number;
  studentIdInput: string;
  studentName: string;
  paidAmount: number;
}

export interface CashierUnmatchedRow {
  rowNumber: number;
  studentIdInput: string;
  studentNameInput: string;
  reason: string;
}

export interface ParsedCashierContributionResult {
  detectedActivityTitle: string;
  detectedReferenceId: string;
  matchedToMarkPaid: CashierMatchedRow[];
  alreadyPaid: CashierAlreadyPaidRow[];
  unmatched: CashierUnmatchedRow[];
  skippedUnpaidRows: number;
  totalNewCollectionAmount: number;
}

export const REQUIRED_CASHIER_EXCEL_HEADERS = [
  'Student ID',
  'Student Name',
  'Course / Strand',
  'Year Level',
  'Section',
  'Academic Level',
  'Amount Due (PHP)',
  'Status',
  'Paid Amount (PHP)',
  'OR / Reference No.',
  'Date Paid',
] as const;

/**
 * Generates a ready-to-copy prompt specifying the exact Excel header block and columns
 * accepted by the Student Contribution Cashier upload validator.
 */
export function buildCashierExcelFormatPrompt(params: {
  eventTitle: string;
  referenceId?: string;
  contributionRate?: number;
}): string {
  const title = (params.eventTitle || 'Activity Title').trim();
  const ref = (params.referenceId || 'AP-REF-ID').trim();
  const rate = Number(params.contributionRate || 0) > 0 ? Number(params.contributionRate) : 100;

  return [
    `Generate an Excel (.xlsx) Cashier Collection sheet for an STI Student Contribution activity using this exact layout so STI Sync Web accepts it:`,
    ``,
    `1. Top Metadata Header Block (Rows 1–3):`,
    `   - Row 1, Cell A1: STI COLLEGE ORMOC — STUDENT CONTRIBUTION CASHIER COLLECTION`,
    `   - Row 2: Column A = "Activity Title", Column B = "${title}"`,
    `   - Row 3: Column A = "Reference ID", Column B = "${ref}"`,
    `   - Row 4: Blank row`,
    ``,
    `2. Table Header Row (Row 5 — exact column names):`,
    `   ${REQUIRED_CASHIER_EXCEL_HEADERS.join(' | ')}`,
    ``,
    `3. Student Rows (Row 6 onward):`,
    `   - Student ID: Official 11-digit STI Student ID matching Student Registry`,
    `   - Status: "PAID" or "UNPAID"`,
    `   - Paid Amount (PHP): ${rate} (numeric paid amount) for PAID students; blank or 0 for UNPAID`,
    `   - OR / Reference No.: Official Cashier Receipt / OR number`,
    `   - Date Paid: YYYY-MM-DD`,
    ``,
    `Rules:`,
    `- Keep Row 2 ("Activity Title" = "${title}") and Row 5 column headers intact.`,
    `- Include previously paid students as PAID and change newly collected students from UNPAID to PAID on updated uploads (the system skips already paid students and adds only newly paid students).`,
  ].join('\n');
}

const normalizeId = (val: unknown): string =>
  String(val ?? '').trim().toLowerCase().replace(/\s+/g, '');

const normalizeHeader = (val: unknown): string =>
  String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeTitleText = (val: unknown): string =>
  String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const parseCurrencyNumber = (val: unknown): number | null => {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/[₱$,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};

/**
 * Exports all targeted student payables for an event into the official Cashier-ready Excel (.xlsx) format
 * with a top Activity Title & Reference ID metadata block above the table headers.
 */
export function exportEventContributionRosterExcel(params: {
  eventTitle: string;
  referenceId?: string;
  contributionRate?: number;
  payables: PayableDocument[];
  resolveStudentName: (p: PayableDocument) => string;
  resolveStudentId: (p: PayableDocument) => string;
}): void {
  const {
    eventTitle,
    referenceId = '',
    contributionRate = 0,
    payables,
    resolveStudentName,
    resolveStudentId,
  } = params;

  const metaRows: any[][] = [
    ['STI COLLEGE ORMOC — STUDENT CONTRIBUTION CASHIER COLLECTION'],
    ['Activity Title', eventTitle || 'Student Contribution Activity'],
    [
      'Reference ID',
      referenceId || '',
      'Contribution Rate (PHP)',
      Number(contributionRate) || '',
    ],
    [],
    [...REQUIRED_CASHIER_EXCEL_HEADERS],
  ];

  const dataRows = payables.map((p) => {
    const isPaid = String(p.status || '').toLowerCase() === 'paid';
    return [
      resolveStudentId(p),
      resolveStudentName(p),
      p.courseCode || '',
      p.yearLevel || '',
      p.section || '',
      p.academicLevel || '',
      Number(p.assignedAmount) || 0,
      isPaid ? 'PAID' : 'UNPAID',
      isPaid ? Number(p.paidAmount ?? p.assignedAmount) || 0 : '',
      (p as any).orNumber || (p as any).receiptNumber || '',
      (p as any).paidAt?.toDate
        ? (p as any).paidAt.toDate().toISOString().split('T')[0]
        : '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([...metaRows, ...dataRows]);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Student Roster');

  const safeSlug = (eventTitle || 'activity')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  XLSX.writeFile(wb, `${safeSlug || 'student_contribution'}_cashier_roster.xlsx`);
}

/**
 * Strictly validates the Cashier Excel/CSV header block (Activity Title + required columns)
 * and reconciles rows against the event's `/payables`, returning only newly paid deltas.
 */
export function parseCashierContributionFile(
  buffer: ArrayBuffer,
  eventPayables: PayableDocument[],
  resolveStudentName: (p: PayableDocument) => string,
  resolveStudentId: (p: PayableDocument) => string,
  options?: {
    expectedActivityTitle?: string;
    expectedReferenceId?: string;
  }
): ParsedCashierContributionResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new Error('Could not read file. Please upload a valid .xlsx, .xls, or .csv file.');
  }

  const firstSheet = wb.SheetNames?.[0];
  if (!firstSheet) {
    throw new Error('Uploaded file has no worksheets.');
  }

  const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[firstSheet], {
    header: 1,
    defval: '',
  });
  if (!grid || grid.length === 0) {
    throw new Error('Uploaded worksheet is empty.');
  }

  const studentIdAliases = ['student id', 'school id', 'student number', 'id number', 'id'];
  const paymentAliases = ['paid amount', 'amount paid', 'collected', 'payment', 'paid', 'status', 'payment status'];

  // Locate the table header row within the top 15 rows
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(15, grid.length); r++) {
    const row = Array.isArray(grid[r]) ? grid[r] : [];
    const headersNorm = row.map((cell) => normalizeHeader(cell));
    const hasStudentIdCol = headersNorm.some((h) => studentIdAliases.some((a) => h === a || h.includes(a)));
    const hasPaymentCol = headersNorm.some((h) => paymentAliases.some((a) => h === a || h.includes(a)));
    if (hasStudentIdCol && hasPaymentCol) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      `Invalid Excel Header Format: Could not find required columns ("Student ID" and "Status" or "Paid Amount (PHP)"). Download the official Cashier template or copy the Excel Format Prompt.`
    );
  }

  // Extract Activity Title & Reference ID from metadata rows above the header row
  let detectedActivityTitle = '';
  let detectedReferenceId = '';
  for (let r = 0; r < headerRowIdx; r++) {
    const row = Array.isArray(grid[r]) ? grid[r] : [];
    for (let c = 0; c < row.length; c++) {
      const cellStr = String(row[c] ?? '').trim();
      const cellNorm = normalizeHeader(cellStr);
      if (!cellNorm) continue;

      if (cellNorm === 'activity title' || cellNorm === 'event title' || cellNorm === 'activity') {
        const nextVal = row.slice(c + 1).find((v) => String(v ?? '').trim() !== '');
        if (nextVal !== undefined) detectedActivityTitle = String(nextVal).trim();
      } else if (cellNorm.startsWith('activity title ')) {
        detectedActivityTitle = cellStr.replace(/^activity\s*title\s*[:\-]?\s*/i, '').trim();
      }

      if (cellNorm === 'reference id' || cellNorm === 'reference no' || cellNorm === 'event id') {
        const nextVal = row.slice(c + 1).find((v) => String(v ?? '').trim() !== '');
        if (nextVal !== undefined) detectedReferenceId = String(nextVal).trim();
      }
    }
  }

  // Build row objects from headerRowIdx onward
  const rawHeaderCells = (Array.isArray(grid[headerRowIdx]) ? grid[headerRowIdx] : []).map((h) =>
    String(h ?? '').trim()
  );
  const rawRows: Array<{ rowNumber: number; obj: Record<string, any> }> = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const cells = Array.isArray(grid[r]) ? grid[r] : [];
    const hasAnyValue = cells.some((v) => String(v ?? '').trim() !== '');
    if (!hasAnyValue) continue;
    const obj: Record<string, any> = {};
    rawHeaderCells.forEach((colName, idx) => {
      if (colName) obj[colName] = cells[idx] ?? '';
    });
    rawRows.push({ rowNumber: r + 1, obj });
  }

  if (rawRows.length === 0) {
    throw new Error('No student rows were found beneath the Excel header row.');
  }

  // Fallback: check if Activity Title was supplied as a column on data rows
  if (!detectedActivityTitle) {
    for (const { obj } of rawRows) {
      for (const [k, v] of Object.entries(obj)) {
        const h = normalizeHeader(k);
        if ((h === 'activity title' || h === 'event title' || h === 'activity') && String(v ?? '').trim()) {
          detectedActivityTitle = String(v).trim();
          break;
        }
      }
      if (detectedActivityTitle) break;
    }
  }

  const expectedTitle = (options?.expectedActivityTitle || '').trim();
  if (expectedTitle) {
    if (!detectedActivityTitle) {
      throw new Error(
        `Missing Activity Title Header: Please ensure Row 2 contains "Activity Title" | "${expectedTitle}" (or an "Activity Title" column matching this activity).`
      );
    }
    if (normalizeTitleText(detectedActivityTitle) !== normalizeTitleText(expectedTitle)) {
      throw new Error(
        `Activity Title Mismatch: Uploaded Excel is for "${detectedActivityTitle}", expected "${expectedTitle}".`
      );
    }
  }

  const bySchoolId = new Map<string, PayableDocument>();
  const byName = new Map<string, PayableDocument>();

  for (const p of eventPayables) {
    const sId = normalizeId(resolveStudentId(p));
    if (sId && sId !== 'n/a') bySchoolId.set(sId, p);
    const rawSchool = normalizeId(p.studentSchoolId);
    if (rawSchool && rawSchool !== 'n/a') bySchoolId.set(rawSchool, p);
    const sUid = normalizeId(p.studentId);
    if (sUid) bySchoolId.set(sUid, p);

    const sName = normalizeHeader(resolveStudentName(p));
    if (sName && sName !== 'student') byName.set(sName, p);
  }

  const findColValue = (row: Record<string, any>, matchers: string[]): any => {
    for (const [k, v] of Object.entries(row)) {
      const h = normalizeHeader(k);
      if (matchers.some((m) => h === m || h.includes(m))) {
        if (v !== '' && v !== null && v !== undefined) return v;
      }
    }
    return '';
  };

  const matchedToMarkPaid: CashierMatchedRow[] = [];
  const alreadyPaid: CashierAlreadyPaidRow[] = [];
  const unmatched: CashierUnmatchedRow[] = [];
  const seenPayableIds = new Set<string>();
  let skippedUnpaidRows = 0;

  rawRows.forEach(({ rowNumber, obj: row }) => {
    const idRaw = findColValue(row, studentIdAliases);
    const nameRaw = findColValue(row, ['student name', 'full name', 'name']);
    const statusRaw = String(findColValue(row, ['payment status', 'status', 'remarks']) || '').trim().toUpperCase();
    const paidAmtRaw = findColValue(row, ['paid amount', 'amount paid', 'collected', 'payment', 'paid']);
    const orRaw = String(findColValue(row, ['or number', 'or no', 'or', 'reference no', 'receipt']) || '').trim();
    const dateRaw = String(findColValue(row, ['date paid', 'payment date', 'date']) || '').trim();

    if (!String(idRaw).trim() && !String(nameRaw).trim()) {
      return;
    }

    const parsedPaid = parseCurrencyNumber(paidAmtRaw);

    if (
      (statusRaw === 'UNPAID' || statusRaw === 'PENDING' || statusRaw === 'NOT PAID') &&
      (!parsedPaid || parsedPaid <= 0)
    ) {
      skippedUnpaidRows++;
      return;
    }

    const idKey = normalizeId(idRaw);
    const nameKey = normalizeHeader(nameRaw);
    const payable =
      (idKey && bySchoolId.get(idKey)) ||
      (nameKey && byName.get(nameKey)) ||
      undefined;

    if (!payable) {
      unmatched.push({
        rowNumber,
        studentIdInput: String(idRaw || ''),
        studentNameInput: String(nameRaw || ''),
        reason: 'No matching payable found in this activity',
      });
      return;
    }

    if (seenPayableIds.has(payable.id)) return;
    seenPayableIds.add(payable.id);

    const existingStatus = String(payable.status || '').toLowerCase();
    if (existingStatus === 'paid' || existingStatus === 'waived') {
      alreadyPaid.push({
        rowNumber,
        studentIdInput: String(idRaw || resolveStudentId(payable)),
        studentName: resolveStudentName(payable),
        paidAmount: Number(payable.paidAmount ?? payable.assignedAmount) || 0,
      });
      return;
    }

    const assignedAmt = Number(payable.assignedAmount) || 0;
    const finalPaidAmt =
      parsedPaid !== null && parsedPaid > 0 ? parsedPaid : assignedAmt;

    if (finalPaidAmt <= 0) {
      skippedUnpaidRows++;
      return;
    }

    matchedToMarkPaid.push({
      rowNumber,
      studentIdInput: String(idRaw || resolveStudentId(payable)),
      studentNameInput: String(nameRaw || resolveStudentName(payable)),
      payable,
      paidAmount: finalPaidAmt,
      orNumber: orRaw,
      paidDate: dateRaw,
    });
  });

  const totalNewCollectionAmount = Math.round(
    matchedToMarkPaid.reduce((s, r) => s + r.paidAmount, 0) * 100
  ) / 100;

  return {
    detectedActivityTitle,
    detectedReferenceId,
    matchedToMarkPaid,
    alreadyPaid,
    unmatched,
    skippedUnpaidRows,
    totalNewCollectionAmount,
  };
}
