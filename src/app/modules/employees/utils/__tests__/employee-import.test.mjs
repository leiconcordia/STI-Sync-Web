import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  buildSampleEmployeeWorkbook,
  parseEmployeeArrayBuffer,
} from '../employee-excel.utils.ts';

describe('Employee Master Excel Parser', () => {
  test('parses the generated sample employee workbook cleanly with zero invalid rows', () => {
    const wb = buildSampleEmployeeWorkbook();
    const outBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const parsed = parseEmployeeArrayBuffer(outBuf);

    assert.equal(parsed.invalidRows.length, 0);
    assert.ok(parsed.validRows.length >= 10);
    assert.equal(parsed.validRows[0].employeeId, 'EMP-2026-001');
    assert.equal(parsed.validRows[0].firstName, 'Elena');
    assert.equal(parsed.validRows[0].lastName, 'Santos');
    assert.equal(parsed.validRows[0].positionTitle, 'School President');
  });

  test('flags missing required fields and duplicate Employee IDs inside the same sheet', () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'Employee ID': 'EMP-1', 'First Name': 'Ana', 'Middle Name': '', 'Last Name': 'Reyes', 'Position / Role Title': 'Adviser', 'Employment Status': 'ACTIVE' },
      { 'Employee ID': 'EMP-1', 'First Name': 'Ana', 'Middle Name': '', 'Last Name': 'Reyes', 'Position / Role Title': 'Adviser', 'Employment Status': 'ACTIVE' },
      { 'Employee ID': '', 'First Name': 'Juan', 'Middle Name': '', 'Last Name': 'Cruz', 'Position / Role Title': 'Faculty', 'Employment Status': 'ACTIVE' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    const outBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const parsed = parseEmployeeArrayBuffer(outBuf);
    assert.equal(parsed.validRows.length, 1);
    assert.equal(parsed.invalidRows.length, 2);
    assert.match(parsed.invalidRows[0].error || '', /Duplicate Employee ID/i);
    assert.match(parsed.invalidRows[1].error || '', /Missing Employee ID/i);
  });
});
