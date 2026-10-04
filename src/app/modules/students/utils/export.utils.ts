/**
 * src/app/modules/students/utils/export.utils.ts
 *
 * Dynamic Student Export Utility for STI Sync.
 * Supports:
 *  - Excel (.xlsx) and CSV (.csv) exports
 *  - Credentials mode (includes default temporary passwords for distribution)
 *  - Official Class Roster mode (no passwords, clean public/faculty sheet)
 *  - Dynamic filtering by Section, Course, Year Level, and Academic Level
 *  - Multi-sheet workbook grouping by section
 */

import * as XLSX from 'xlsx';
import type { StudentDocument } from '../types/student.types';
import { generateDefaultStudentPassword } from '../services/registrar-import.service';

export interface DynamicExportOptions {
  includePassword?: boolean;
  format?: 'xlsx' | 'csv';
  filenamePrefix?: string;
  sectionFilter?: string; // 'ALL' or specific section name
  courseFilter?: string; // 'ALL' or specific course code
  yearLevelFilter?: string; // 'ALL' or specific year level
  groupBySection?: boolean; // In Excel (.xlsx): creates a separate sheet tab for each section!
}

/**
 * Normalizes and extracts tabular student rows based on credential settings.
 */
function prepareStudentExportRows(
  students: StudentDocument[],
  includePassword = false
): Record<string, any>[] {
  return students.map((s, index) => {
    const password =
      s.defaultPassword ||
      (s.lastName && s.studentId
        ? generateDefaultStudentPassword(s.lastName, s.studentId)
        : 'N/A');

    if (includePassword) {
      return {
        'No.': index + 1,
        'Student ID': s.studentId || '',
        'Last Name': (s.lastName || '').toUpperCase(),
        'First Name': (s.firstName || '').toUpperCase(),
        'Middle Name': (s.middleName || '').toUpperCase(),
        'Sex': s.sex || '',
        'Program / Strand': s.courseCode || s.courseName || '',
        'Year Level': s.yearLevel || '',
        'Section': s.section || 'UNASSIGNED',
        'Email': s.email || 'Pending Mobile Registration',
        'Default Password': password,
        'Profile Setup': s.isProfileComplete ? 'Completed' : 'Pending First Login',
        'Academic Year': s.schoolYear || '',
        'Term': s.semester || '',
        'Status': s.status || 'ACTIVE',
      };
    }

    // Clean Roster (No Passwords)
    return {
      'No.': index + 1,
      'Student ID': s.studentId || '',
      'Last Name': (s.lastName || '').toUpperCase(),
      'First Name': (s.firstName || '').toUpperCase(),
      'Middle Name': (s.middleName || '').toUpperCase(),
      'Sex': s.sex || '',
      'Program / Strand': s.courseCode || s.courseName || '',
      'Year Level': s.yearLevel || '',
      'Section': s.section || 'UNASSIGNED',
      'Email': s.email || '',
      'Contact Number': s.contactNumber || '',
      'Status': s.status || 'ACTIVE',
      'Academic Year': s.schoolYear || '',
      'Term': s.semester || '',
    };
  });
}

/**
 * Filter students array based on dynamic export options.
 */
export function filterStudentsForExport(
  students: StudentDocument[],
  options: DynamicExportOptions
): StudentDocument[] {
  return students.filter((s) => {
    if (options.sectionFilter && options.sectionFilter !== 'ALL') {
      const sec = s.section || 'UNASSIGNED';
      if (sec.toLowerCase() !== options.sectionFilter.toLowerCase()) return false;
    }
    if (options.courseFilter && options.courseFilter !== 'ALL') {
      if ((s.courseCode || '').toLowerCase() !== options.courseFilter.toLowerCase()) return false;
    }
    if (options.yearLevelFilter && options.yearLevelFilter !== 'ALL') {
      if ((s.yearLevel || '').toLowerCase() !== options.yearLevelFilter.toLowerCase()) return false;
    }
    return true;
  });
}

/**
 * Exports students dynamically with credentials or clean roster, by section or all.
 */
export function exportStudentsDynamic(
  students: StudentDocument[],
  options: DynamicExportOptions = {}
): { totalExported: number; filename: string } {
  const {
    includePassword = false,
    format = 'xlsx',
    filenamePrefix = includePassword ? 'Student_Credentials_List' : 'Class_Roster',
    groupBySection = false,
  } = options;

  const filtered = filterStudentsForExport(students, options);
  if (filtered.length === 0) {
    throw new Error('No students match the chosen export criteria.');
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const sectionTag =
    options.sectionFilter && options.sectionFilter !== 'ALL'
      ? `_${options.sectionFilter.replace(/[^a-zA-Z0-9_-]/g, '')}`
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
      const allRows = prepareStudentExportRows(filtered, includePassword);
      const wsAll = XLSX.utils.json_to_sheet(allRows);
      XLSX.utils.book_append_sheet(wb, wsAll, 'All Students');

      // Add individual section sheets (sheet names capped at 31 chars per Excel spec)
      sectionBuckets.forEach((secStudents, secName) => {
        const secRows = prepareStudentExportRows(secStudents, includePassword);
        const wsSec = XLSX.utils.json_to_sheet(secRows);
        const safeSheetName = secName.replace(/[\\/?*[\]]/g, '').slice(0, 31);
        XLSX.utils.book_append_sheet(wb, wsSec, safeSheetName);
      });
    } else {
      // Single sheet export
      const rows = prepareStudentExportRows(filtered, includePassword);
      const ws = XLSX.utils.json_to_sheet(rows);
      const sheetTitle = options.sectionFilter && options.sectionFilter !== 'ALL'
        ? options.sectionFilter.slice(0, 31)
        : 'Students';
      XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    }

    XLSX.writeFile(wb, `${finalFilename}.xlsx`);
  } else {
    // CSV Export
    const rows = prepareStudentExportRows(filtered, includePassword);
    if (rows.length === 0) return { totalExported: 0, filename: '' };

    const headers = Object.keys(rows[0]);
    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escapeCSV(row[h])).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
    includePassword: false,
  });
}
