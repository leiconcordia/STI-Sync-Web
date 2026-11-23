import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type {
  CreateEmployeeInput,
  EmployeeDocument,
  EmployeeExcelParseResult,
  ParsedEmployeeRow,
} from '../types/employee.types';
import {
  formatEmployeeFullName,
  parseEmployeeArrayBuffer,
} from '../utils/employee-excel.utils';

export const EMPLOYEES_COLLECTION = 'employees';

export async function parseEmployeeExcelFile(file: File): Promise<EmployeeExcelParseResult> {
  const buf = await file.arrayBuffer();
  return parseEmployeeArrayBuffer(buf);
}

export async function createEmployee(input: CreateEmployeeInput): Promise<string> {
  const cleanEmpId = input.employeeId.trim();
  const cleanFirst = input.firstName.trim();
  const cleanMiddle = (input.middleName || '').trim();
  const cleanLast = input.lastName.trim();
  const cleanPosition = (input.positionTitle || '').trim();

  if (!cleanEmpId || !cleanFirst || !cleanLast) {
    throw new Error('Employee ID, First Name, and Last Name are required.');
  }

  const snap = await getDocs(
    query(collection(db, EMPLOYEES_COLLECTION), where('archived', '==', false))
  );
  const dup = snap.docs.find(
    (d) => String(d.data()?.employeeId || '').trim().toLowerCase() === cleanEmpId.toLowerCase()
  );
  if (dup) {
    throw new Error(`An active employee with ID "${cleanEmpId}" already exists.`);
  }

  const newRef = doc(collection(db, EMPLOYEES_COLLECTION));
  await setDoc(newRef, {
    id: newRef.id,
    employeeId: cleanEmpId,
    firstName: cleanFirst,
    middleName: cleanMiddle,
    lastName: cleanLast,
    fullName: formatEmployeeFullName(cleanFirst, cleanLast, cleanMiddle),
    positionTitle: cleanPosition,
    status: input.status || 'ACTIVE',
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newRef.id;
}

export async function updateEmployee(
  id: string,
  updates: Partial<CreateEmployeeInput> & { archived?: boolean }
): Promise<void> {
  const ref = doc(db, EMPLOYEES_COLLECTION, id);
  const payload: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.employeeId !== undefined) {
    const cleanEmpId = updates.employeeId.trim();
    const snap = await getDocs(
      query(collection(db, EMPLOYEES_COLLECTION), where('archived', '==', false))
    );
    const dup = snap.docs.find(
      (d) =>
        d.id !== id &&
        String(d.data()?.employeeId || '').trim().toLowerCase() === cleanEmpId.toLowerCase()
    );
    if (dup) {
      throw new Error(`Another active employee already uses ID "${cleanEmpId}".`);
    }
    payload.employeeId = cleanEmpId;
  }

  if (updates.firstName !== undefined) payload.firstName = updates.firstName.trim();
  if (updates.middleName !== undefined) payload.middleName = updates.middleName.trim();
  if (updates.lastName !== undefined) payload.lastName = updates.lastName.trim();
  if (updates.positionTitle !== undefined) payload.positionTitle = updates.positionTitle.trim();
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.archived !== undefined) {
    payload.archived = updates.archived;
    payload.status = updates.archived ? 'ARCHIVED' : 'ACTIVE';
  }

  if (
    updates.firstName !== undefined ||
    updates.lastName !== undefined ||
    updates.middleName !== undefined
  ) {
    payload.fullName = formatEmployeeFullName(
      updates.firstName || '',
      updates.lastName || '',
      updates.middleName || ''
    );
  }

  await updateDoc(ref, payload);
}

export async function deleteEmployee(id: string): Promise<void> {
  await deleteDoc(doc(db, EMPLOYEES_COLLECTION, id));
}

export async function bulkImportEmployees(
  rows: ParsedEmployeeRow[],
  existingEmployees: EmployeeDocument[]
): Promise<{ created: number; updated: number }> {
  const existingByEmpId = new Map<string, EmployeeDocument>();
  existingEmployees.forEach((emp) => {
    const key = String(emp.employeeId || '').trim().toLowerCase();
    if (key) existingByEmpId.set(key, emp);
  });

  const batch = writeBatch(db);
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    if (row.error) continue;
    const key = row.employeeId.trim().toLowerCase();
    const matched = existingByEmpId.get(key);
    if (matched) {
      const ref = doc(db, EMPLOYEES_COLLECTION, matched.id);
      batch.update(ref, {
        employeeId: row.employeeId,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        fullName: row.fullName,
        positionTitle: row.positionTitle,
        status: row.status === 'ARCHIVED' ? 'ARCHIVED' : row.status,
        archived: row.status === 'ARCHIVED',
        updatedAt: serverTimestamp(),
      });
      updated++;
    } else {
      const newRef = doc(collection(db, EMPLOYEES_COLLECTION));
      batch.set(newRef, {
        id: newRef.id,
        employeeId: row.employeeId,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        fullName: row.fullName,
        positionTitle: row.positionTitle,
        status: row.status === 'ARCHIVED' ? 'ARCHIVED' : row.status,
        archived: row.status === 'ARCHIVED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      created++;
    }
  }

  if (created > 0 || updated > 0) {
    await batch.commit();
  }

  return { created, updated };
}
