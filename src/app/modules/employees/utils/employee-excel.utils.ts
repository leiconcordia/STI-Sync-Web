import * as XLSX from 'xlsx';
import type {
  EmployeeExcelParseResult,
  EmployeeStatus,
  ParsedEmployeeRow,
} from '../types/employee.types';

export const EMPLOYEE_SAMPLE_ROWS = [
  {
    'Employee ID': 'EMP-2026-001',
    'First Name': 'Elena',
    'Middle Name': 'Reyes',
    'Last Name': 'Santos',
    'Position / Role Title': 'School President',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'EMP-2026-002',
    'First Name': 'Roberto',
    'Middle Name': 'Cruz',
    'Last Name': 'Villanueva',
    'Position / Role Title': 'Academic Head',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'EMP-2026-003',
    'First Name': 'Maricel',
    'Middle Name': 'Gomez',
    'Last Name': 'Bautista',
    'Position / Role Title': 'Finance & Accounting Head',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'FAC-2026-004',
    'First Name': 'Rona Mira',
    'Middle Name': 'Sigmund',
    'Last Name': 'Lucanas',
    'Position / Role Title': 'IT Program Head',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'FAC-2026-005',
    'First Name': 'Jerome',
    'Middle Name': 'Dela Torre',
    'Last Name': 'Mendoza',
    'Position / Role Title': 'HM Program Head',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'FAC-2026-006',
    'First Name': 'Clarissa',
    'Middle Name': 'Navarro',
    'Last Name': 'Aquino',
    'Position / Role Title': 'BA Program Head',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'FAC-2026-007',
    'First Name': 'Daniel',
    'Middle Name': 'Pascual',
    'Last Name': 'Soriano',
    'Position / Role Title': 'SHS Assistant Principal',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'FAC-2026-008',
    'First Name': 'Katrina',
    'Middle Name': 'Lim',
    'Last Name': 'Tan',
    'Position / Role Title': 'IT Faculty Adviser',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'FAC-2026-009',
    'First Name': 'Mark Anthony',
    'Middle Name': 'Ramos',
    'Last Name': 'Castro',
    'Position / Role Title': 'TM Faculty Adviser',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'FAC-2026-010',
    'First Name': 'Angela',
    'Middle Name': 'Perez',
    'Last Name': 'Flores',
    'Position / Role Title': 'SHS Faculty Adviser',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'EMP-2026-011',
    'First Name': 'Patricia',
    'Middle Name': 'Alvarez',
    'Last Name': 'Garcia',
    'Position / Role Title': 'Guidance Counselor',
    'Employment Status': 'ACTIVE',
  },
  {
    'Employee ID': 'EMP-2026-012',
    'First Name': 'Carlo',
    'Middle Name': 'Velasco',
    'Last Name': 'Dizon',
    'Position / Role Title': 'Student Affairs Coordinator',
    'Employment Status': 'ACTIVE',
  },
];

export function formatEmployeeFullName(
  firstName: string,
  lastName: string,
  middleName?: string
): string {
  const f = String(firstName || '').trim();
  const l = String(lastName || '').trim();
  const m = String(middleName || '').trim();
  if (!f && !l) return '';
  if (m) {
    return `${f} ${m[0].toUpperCase()}. ${l}`.replace(/\s+/g, ' ').trim();
  }
  return `${f} ${l}`.replace(/\s+/g, ' ').trim();
}

const normalizeHeaderKey = (key: string): string =>
  String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function pickField(normalizedRow: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    if (normalizedRow[alias] !== undefined && normalizedRow[alias] !== '') {
      return normalizedRow[alias];
    }
  }
  return '';
}

function normalizeStatus(raw: string): EmployeeStatus {
  const clean = String(raw || '').trim().toUpperCase();
  if (clean === 'INACTIVE') return 'INACTIVE';
  if (clean === 'ARCHIVED') return 'ARCHIVED';
  return 'ACTIVE';
}

export function parseEmployeeArrayBuffer(buffer: ArrayBuffer | Uint8Array): EmployeeExcelParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { validRows: [], invalidRows: [], totalRows: 0 };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawObjects = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  const validRows: ParsedEmployeeRow[] = [];
  const invalidRows: ParsedEmployeeRow[] = [];
  const seenEmpIds = new Set<string>();

  rawObjects.forEach((rawObj, idx) => {
    const normalized: Record<string, string> = {};
    Object.entries(rawObj).forEach(([k, v]) => {
      normalized[normalizeHeaderKey(k)] = String(v ?? '').trim();
    });

    const employeeId = pickField(normalized, ['employeeid', 'empid', 'idnumber', 'employeeno', 'id']);
    const firstName = pickField(normalized, ['firstname', 'fname', 'givenname']);
    const middleName = pickField(normalized, ['middlename', 'mname', 'middleinitial']);
    const lastName = pickField(normalized, ['lastname', 'lname', 'surname', 'familyname']);
    const positionTitle = pickField(normalized, [
      'positionroletitle',
      'positiontitle',
      'position',
      'roletitle',
      'title',
      'role',
      'designation',
    ]);
    const status = normalizeStatus(
      pickField(normalized, ['employmentstatus', 'status', 'state'])
    );

    // Skip completely blank trailing rows
    if (!employeeId && !firstName && !lastName && !positionTitle) {
      return;
    }

    const rowNumber = idx + 2; // 1-indexed + header row
    const fullName = formatEmployeeFullName(firstName, lastName, middleName);
    const empKey = employeeId.toUpperCase();

    let error: string | undefined;
    if (!employeeId) {
      error = 'Missing Employee ID.';
    } else if (!firstName || !lastName) {
      error = 'First Name and Last Name are required.';
    } else if (seenEmpIds.has(empKey)) {
      error = `Duplicate Employee ID "${employeeId}" inside Excel file.`;
    }

    const parsed: ParsedEmployeeRow = {
      rowNumber,
      employeeId,
      firstName,
      middleName,
      lastName,
      fullName,
      positionTitle,
      status,
      ...(error ? { error } : {}),
    };

    if (error) {
      invalidRows.push(parsed);
    } else {
      seenEmpIds.add(empKey);
      validRows.push(parsed);
    }
  });

  return {
    validRows,
    invalidRows,
    totalRows: validRows.length + invalidRows.length,
  };
}

export function buildSampleEmployeeWorkbook(): XLSX.WorkBook {
  const ws = XLSX.utils.json_to_sheet(EMPLOYEE_SAMPLE_ROWS);
  ws['!cols'] = [
    { wch: 16 }, // Employee ID
    { wch: 18 }, // First Name
    { wch: 16 }, // Middle Name
    { wch: 18 }, // Last Name
    { wch: 28 }, // Position / Role Title
    { wch: 18 }, // Employment Status
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  return wb;
}
