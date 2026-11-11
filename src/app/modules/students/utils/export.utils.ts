/**
 * src/app/modules/students/utils/export.utils.ts
 *
 * Dynamic Student Export Utility for STI Sync.
 * Supports:
 *  - Excel (.xlsx) and CSV (.csv) exports
 *  - Official Class Roster mode (clean public/faculty sheet, no passwords)
 *  - Credentials mode (includes default temporary passwords for distribution)
 *  - Comprehensive Masterlist mode (all student profile and registry details)
 *  - Text-safe formatting for Student IDs (prevents 2E+09 scientific notation)
 *  - Auto-fit column widths with generous padding (prevents truncated text)
 *  - UTF-8 BOM encoding for CSV (preserves accented Filipino characters like Ñ)
 *  - Dynamic filtering by Academic Level, Course/Program, Year Level, and Section
 *  - Multi-sheet workbook grouping by section
 */

import * as XLSX from 'xlsx';
import type { StudentDocument } from '../types/student.types';
import { generateDefaultStudentPassword } from '../services/registrar-import.service';

export type StudentExportMode = 'ROSTER' | 'CREDENTIALS' | 'MASTERLIST';

export interface ExportColumnDefinition {
  id: string;
  label: string;
  category: 'core' | 'academic' | 'contact' | 'credentials' | 'meta';
}

export const ALL_EXPORT_COLUMNS: ExportColumnDefinition[] = [
  { id: 'No.', label: 'No. (#)', category: 'core' },
  { id: 'Student ID', label: 'Student ID', category: 'core' },
  { id: 'Last Name', label: 'Last Name', category: 'core' },
  { id: 'First Name', label: 'First Name', category: 'core' },
  { id: 'Middle Name', label: 'Middle Name', category: 'core' },
  { id: 'Sex', label: 'Sex', category: 'core' },
  { id: 'Academic Level', label: 'Academic Level', category: 'academic' },
  { id: 'Program / Strand', label: 'Program / Strand', category: 'academic' },
  { id: 'Year Level', label: 'Year Level', category: 'academic' },
  { id: 'Section', label: 'Section', category: 'academic' },
  { id: 'Email', label: 'Email', category: 'contact' },
  { id: 'Contact Number', label: 'Contact Number', category: 'contact' },
  { id: 'Date of Birth', label: 'Date of Birth', category: 'contact' },
  { id: 'Default Password', label: 'Default Password', category: 'credentials' },
  { id: 'Profile Setup', label: 'Profile Setup', category: 'credentials' },
  { id: 'Status', label: 'Status', category: 'meta' },
  { id: 'Academic Term', label: 'Academic Term', category: 'academic' },
];

export const DEFAULT_ROSTER_COLUMNS: string[] = [
  'No.',
  'Student ID',
  'Last Name',
  'First Name',
  'Middle Name',
  'Sex',
  'Program / Strand',
  'Year Level',
  'Section',
  'Contact Number',
  'Email',
  'Academic Term',
  'Status',
];

export const DEFAULT_MASTERLIST_COLUMNS: string[] = [
  'No.',
  'Student ID',
  'Last Name',
  'First Name',
  'Middle Name',
  'Sex',
  'Academic Level',
  'Program / Strand',
  'Year Level',
  'Section',
  'Contact Number',
  'Email',
  'Date of Birth',
  'Default Password',
  'Profile Setup',
  'Academic Term',
  'Status',
];

export interface DynamicExportOptions {
  mode?: StudentExportMode;
  includePassword?: boolean; // backwards compatibility
  selectedColumns?: string[]; // Dynamic custom list of columns to export
  format?: 'xlsx' | 'csv';
  filenamePrefix?: string;
  trackFilter?: string; // 'ALL' | 'COLLEGE' | 'SHS'
  sectionFilter?: string; // 'ALL' or specific section name
  courseFilter?: string; // 'ALL' or specific course code
  yearLevelFilter?: string; // 'ALL' or specific year level
  groupBySection?: boolean; // In Excel (.xlsx): creates a separate sheet tab for each section!
}

/**
 * Clean student email addresses:
 * If a student has no registered personal email or only a synthetic/placeholder
 * address (e.g. 02000479932@student.sti.edu, Pending Mobile Registration, etc.),
 * leave it empty ("") rather than outputting random/placeholder data.
 */
export function cleanStudentEmail(email?: string, studentId?: string): string {
  if (!email) return '';
  const trimmed = email.trim();
  if (
    trimmed.toLowerCase().includes('pending') ||
    trimmed.toLowerCase().includes('@example.com') ||
    /^\d+@student\.sti\.edu$/i.test(trimmed) ||
    (studentId && trimmed.toLowerCase().startsWith(studentId.toLowerCase() + '@'))
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Clean legacy mojibake characters in student names (e.g. AÃ'ASCO -> AÑASCO, CAÃ'ETE -> CAÑETE)
 */
export function cleanMojibake(text: string): string {
  if (!text) return '';
  return text
    .replace(/AÃ['‘]?ASCO/gi, 'AÑASCO')
    .replace(/CAÃ['‘]?ETE/gi, 'CAÑETE')
    .replace(/Ã‘/g, 'Ñ')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã['‘]/g, 'Ñ')
    .normalize('NFC');
}

/**
 * Normalizes and extracts tabular student rows based on export mode or dynamic columns.
 */
export function prepareStudentExportRows(
  students: StudentDocument[],
  modeOrIncludePassword: StudentExportMode | boolean = 'ROSTER',
  customColumns?: string[]
): Record<string, any>[] {
  const mode: StudentExportMode =
    typeof modeOrIncludePassword === 'boolean'
      ? modeOrIncludePassword
        ? 'CREDENTIALS'
        : 'ROSTER'
      : modeOrIncludePassword;

  // Resolve active columns: if customColumns provided, use them; otherwise default according to mode
  const activeColumns: string[] =
    customColumns && customColumns.length > 0
      ? customColumns
      : mode === 'ROSTER'
      ? DEFAULT_ROSTER_COLUMNS
      : DEFAULT_MASTERLIST_COLUMNS;

  return students.map((s, index) => {
    const cleanStudentId = String(s.studentId || '').trim();
    const cleanLastName = cleanMojibake(String(s.lastName || '').trim().toUpperCase());
    const cleanFirstName = cleanMojibake(String(s.firstName || '').trim().toUpperCase());
    const cleanMiddleName = cleanMojibake(String(s.middleName || '').trim().toUpperCase());
    const program = s.courseCode || s.courseName || '';
    const yearLevel = s.yearLevel || '';
    const section = s.section?.trim() || 'UNASSIGNED';
    const term = [s.schoolYear, s.semester].filter(Boolean).join(' ') || '2026-2027 1st Semester';
    const status = s.status || 'ACTIVE';
    const cleanEmail = cleanStudentEmail(s.email, cleanStudentId);

    const isShs =
      s.academicLevel === 'SHS' ||
      ['Grade 11', 'Grade 12'].includes(s.yearLevel) ||
      ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'ICT', 'HE'].includes((s.courseCode || '').toUpperCase());

    const password =
      s.defaultPassword ||
      (cleanLastName && cleanStudentId
        ? generateDefaultStudentPassword(cleanLastName, cleanStudentId)
        : 'N/A');

    // Complete dictionary of available fields
    const fullRecord: Record<string, any> = {
      'No.': index + 1,
      'Student ID': cleanStudentId,
      'Last Name': cleanLastName,
      'First Name': cleanFirstName,
      'Middle Name': cleanMiddleName,
      'Sex': s.sex || '',
      'Academic Level': isShs ? 'SHS' : 'COLLEGE',
      'Program / Strand': program,
      'Year Level': yearLevel,
      'Section': section,
      'Contact Number': s.contactNumber || '',
      'Email': cleanEmail,
      'Date of Birth': s.dateOfBirth || '',
      'Default Password': password,
      'Profile Setup': s.isProfileComplete ? 'Completed' : 'Pending First Login',
      'Status': status,
      'Academic Term': term,
    };

    // Construct row strictly respecting user's dynamic column choices
    const row: Record<string, any> = {};
    activeColumns.forEach((colKey) => {
      if (colKey === 'No.') {
        row['No.'] = index + 1;
      } else if (fullRecord[colKey] !== undefined) {
        row[colKey] = fullRecord[colKey];
      }
    });

    return row;
  });
}

/**
 * Applies professional cell formatting to a SheetJS worksheet:
 * 1. Explicitly sets Student ID cells to text type ('s') with text number format ('@')
 *    so Excel never converts 11-digit Student IDs to scientific notation (2E+09).
 * 2. Auto-sizes column widths with generous padding and minimum widths so no text is truncated.
 */
function applyWorksheetFormatting(ws: XLSX.WorkSheet, rows: Record<string, any>[]) {
  if (!ws['!ref'] || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const range = XLSX.utils.decode_range(ws['!ref']);

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddr];
      if (!cell) continue;

      if (R === 0) {
        cell.t = 's';
        continue;
      }

      const headerName = headers[C] || '';
      if (headerName === 'No.') {
        cell.t = 'n';
      } else {
        // Enforce string type and text format for Student ID, Phone, Password, etc.
        const strVal = String(cell.v ?? '').trim();
        cell.t = 's';
        cell.z = '@';
        cell.v = strVal;
        cell.w = strVal;
      }
    }
  }

  // Calculate generous auto-fit column widths
  const colWidths = headers.map((h) => {
    let maxLen = h.length;
    for (const r of rows) {
      const val = r[h];
      if (val !== undefined && val !== null) {
        const strLen = String(val).length;
        if (strLen > maxLen) maxLen = strLen;
      }
    }

    if (h === 'No.') return { wch: Math.max(maxLen + 2, 6) };
    if (h === 'Student ID') return { wch: Math.max(maxLen + 4, 18) };
    if (h.includes('Name')) return { wch: Math.max(maxLen + 4, 18) };
    if (h === 'Sex') return { wch: Math.max(maxLen + 2, 8) };
    if (h.includes('Program') || h.includes('Strand')) return { wch: Math.max(maxLen + 4, 20) };
    if (h === 'Year Level') return { wch: Math.max(maxLen + 3, 14) };
    if (h === 'Section') return { wch: Math.max(maxLen + 4, 16) };
    if (h === 'Email') return { wch: Math.max(maxLen + 4, 32) };
    if (h.includes('Password')) return { wch: Math.max(maxLen + 4, 20) };
    if (h.includes('Setup') || h.includes('Profile')) return { wch: Math.max(maxLen + 4, 20) };
    if (h.includes('Term') || h.includes('Academic')) return { wch: Math.max(maxLen + 4, 22) };
    if (h === 'Status') return { wch: Math.max(maxLen + 3, 12) };
    if (h.includes('Contact')) return { wch: Math.max(maxLen + 3, 16) };
    if (h.includes('Date')) return { wch: Math.max(maxLen + 3, 14) };
    return { wch: Math.max(maxLen + 4, 14) };
  });

  ws['!cols'] = colWidths;
}

/**
 * Filter students array based on dynamic export options.
 */
export function filterStudentsForExport(
  students: StudentDocument[],
  options: DynamicExportOptions
): StudentDocument[] {
  return students.filter((s) => {
    // 1. Academic Track Filter (College vs SHS)
    if (options.trackFilter && options.trackFilter !== 'ALL') {
      const isShs =
        s.academicLevel === 'SHS' ||
        s.yearLevel === 'Grade 11' ||
        s.yearLevel === 'Grade 12' ||
        ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'ICT', 'HE'].includes((s.courseCode || '').toUpperCase());
      if (options.trackFilter === 'SHS' && !isShs) return false;
      if (options.trackFilter === 'COLLEGE' && isShs) return false;
    }

    // 2. Course / Program Filter
    if (options.courseFilter && options.courseFilter !== 'ALL') {
      const sCourse = (s.courseCode || s.courseName || '').toLowerCase().trim();
      const targetCourse = options.courseFilter.toLowerCase().trim();
      if (sCourse !== targetCourse) return false;
    }

    // 3. Year Level Filter
    if (options.yearLevelFilter && options.yearLevelFilter !== 'ALL') {
      const sYear = (s.yearLevel || '').toLowerCase().trim();
      const targetYear = options.yearLevelFilter.toLowerCase().trim();
      if (sYear !== targetYear) return false;
    }

    // 4. Section Filter
    if (options.sectionFilter && options.sectionFilter !== 'ALL') {
      const sec = (s.section || 'UNASSIGNED').toLowerCase().trim();
      const targetSec = options.sectionFilter.toLowerCase().trim();
      if (sec !== targetSec) return false;
    }

    return true;
  });
}

/**
 * Exports students dynamically with credentials, official roster, or masterlist, by section or all.
 */
export function exportStudentsDynamic(
  students: StudentDocument[],
  options: DynamicExportOptions = {}
): { totalExported: number; filename: string } {
  const resolvedMode: StudentExportMode =
    options.mode || (options.includePassword ? 'CREDENTIALS' : 'ROSTER');

  const defaultPrefix =
    resolvedMode === 'CREDENTIALS'
      ? 'Student_Credentials_List'
      : resolvedMode === 'ROSTER'
      ? 'Official_Class_Roster'
      : 'Students_Masterlist';

  const {
    format = 'xlsx',
    filenamePrefix = defaultPrefix,
    groupBySection = false,
  } = options;

  const filtered = filterStudentsForExport(students, options);
  if (filtered.length === 0) {
    throw new Error('No students match the chosen export criteria.');
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const sectionTag =
    options.sectionFilter && options.sectionFilter !== 'ALL'
      ? `_${options.sectionFilter.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : options.courseFilter && options.courseFilter !== 'ALL'
      ? `_${options.courseFilter.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : '';
  const finalFilename = `${filenamePrefix}${sectionTag}_${dateStr}`;

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();

    if (groupBySection && (!options.sectionFilter || options.sectionFilter === 'ALL')) {
      // Group by section and create separate sheet tabs
      const sectionBuckets = new Map<string, StudentDocument[]>();

      for (const st of filtered) {
        const sec = st.section?.trim() || 'UNASSIGNED';
        if (!sectionBuckets.has(sec)) sectionBuckets.set(sec, []);
        sectionBuckets.get(sec)!.push(st);
      }

      // Add overview sheet
      const allRows = prepareStudentExportRows(filtered, resolvedMode, options.selectedColumns);
      const wsAll = XLSX.utils.json_to_sheet(allRows, { raw: true });
      applyWorksheetFormatting(wsAll, allRows);
      XLSX.utils.book_append_sheet(wb, wsAll, 'All Students');

      // Add individual section sheets (sheet names capped at 31 chars per Excel spec)
      sectionBuckets.forEach((secStudents, secName) => {
        const secRows = prepareStudentExportRows(secStudents, resolvedMode, options.selectedColumns);
        const wsSec = XLSX.utils.json_to_sheet(secRows, { raw: true });
        applyWorksheetFormatting(wsSec, secRows);
        const safeSheetName = secName.replace(/[\\/?*[\]]/g, '').slice(0, 31) || 'Section';
        XLSX.utils.book_append_sheet(wb, wsSec, safeSheetName);
      });
    } else {
      // Single sheet export
      const rows = prepareStudentExportRows(filtered, resolvedMode, options.selectedColumns);
      const ws = XLSX.utils.json_to_sheet(rows, { raw: true });
      applyWorksheetFormatting(ws, rows);
      const sheetTitle =
        options.sectionFilter && options.sectionFilter !== 'ALL'
          ? options.sectionFilter.replace(/[\\/?*[\]]/g, '').slice(0, 31)
          : options.courseFilter && options.courseFilter !== 'ALL'
          ? options.courseFilter.replace(/[\\/?*[\]]/g, '').slice(0, 31)
          : 'Students';
      XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    }

    XLSX.writeFile(wb, `${finalFilename}.xlsx`);
  } else {
    // CSV Export
    const rows = prepareStudentExportRows(filtered, resolvedMode, options.selectedColumns);
    if (rows.length === 0) return { totalExported: 0, filename: '' };

    const headers = Object.keys(rows[0]);
    const escapeCSV = (header: string, val: any) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      // For Student ID, use Excel text formula ="..." so Excel never parses it as 2E+09
      if (header === 'Student ID') {
        return `="""${str}"""`;
      }
      return `"${str}"`;
    };

    const csvContent = [
      headers.map((h) => `"${h}"`).join(','),
      ...rows.map((row) => headers.map((h) => escapeCSV(h, row[h])).join(',')),
    ].join('\r\n');

    // Prepend UTF-8 BOM so Excel opens accented characters like Ñ properly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${finalFilename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { totalExported: filtered.length, filename: finalFilename };
}

/**
 * Legacy wrapper function for backwards compatibility with existing views.
 */
export function exportStudentsToCSV(
  students: StudentDocument[],
  filenamePrefix = 'Active_Students_Directory'
) {
  exportStudentsDynamic(students, {
    format: 'csv',
    filenamePrefix,
    mode: 'ROSTER',
  });
}

