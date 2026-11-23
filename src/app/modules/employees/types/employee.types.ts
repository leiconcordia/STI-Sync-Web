import type { Timestamp } from 'firebase/firestore';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  positionTitle?: string;
  status: EmployeeStatus;
  archived: boolean;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
}

export interface CreateEmployeeInput {
  employeeId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  positionTitle?: string;
  status?: EmployeeStatus;
}

export interface ParsedEmployeeRow {
  rowNumber: number;
  employeeId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  positionTitle: string;
  status: EmployeeStatus;
  error?: string;
}

export interface EmployeeExcelParseResult {
  validRows: ParsedEmployeeRow[];
  invalidRows: ParsedEmployeeRow[];
  totalRows: number;
}
