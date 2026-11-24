import {
  collection,
  doc,
  getDoc,
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
import { assignOrRevokeOrganizationAdviser } from '../../organizations/services/organization.service';
import { toggleSignatoryStatus } from '../../signatories/services/signatory.service';
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
import {
  evaluateArchiveEligibility,
  evaluateAssignmentUnassignBlockers,
  evaluateDeleteEligibility,
  evaluateEmployeeDeleteBlockers,
  resolveEmployeeAssignments,
  type EmployeeBlockerReport,
  type EmployeeLifecycleEligibility,
  type EmployeeRoleAssignment,
  type WorkflowBlockerDatasets,
} from '../utils/employee-lifecycle-validation.utils';

export const EMPLOYEES_COLLECTION = 'employees';

async function fetchWorkflowBlockerDatasets(): Promise<WorkflowBlockerDatasets> {
  const [activitiesSnap, liquidationsSnap, parSnap, sbrSnap] = await Promise.all([
    getDocs(collection(db, 'activities')),
    getDocs(collection(db, 'liquidations')),
    getDocs(collection(db, 'post_activity_reports')),
    getDocs(collection(db, 'supplemental_budget_requests')),
  ]);

  return {
    activities: activitiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    liquidations: liquidationsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    postActivityReports: parSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    supplementalBudgets: sbrSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

async function fetchLiveRolesContext(): Promise<{
  organizations: Array<Record<string, any>>;
  signatories: Array<Record<string, any>>;
}> {
  const [orgSnap, sigSnap] = await Promise.all([
    getDocs(collection(db, 'organizations')),
    getDocs(collection(db, 'institutional_signatories')),
  ]);

  return {
    organizations: orgSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    signatories: sigSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

export async function parseEmployeeExcelFile(file: File): Promise<EmployeeExcelParseResult> {
  const buf = await file.arrayBuffer();
  return parseEmployeeArrayBuffer(buf);
}

/**
 * Checks whether an assigned employee role (Primary Adviser, Co-Adviser, or Institutional Signatory)
 * can be safely unassigned without stranding pending signatures or active/pending club activities.
 */
export async function checkEmployeeAssignmentBlockers(
  employee: EmployeeDocument,
  assignment: EmployeeRoleAssignment
): Promise<EmployeeBlockerReport> {
  const datasets = await fetchWorkflowBlockerDatasets();
  return evaluateAssignmentUnassignBlockers(employee, assignment, datasets);
}

/**
 * Live eligibility check for permanently deleting an employee:
 * requires archived status, zero active role assignments, and zero pending workflow blockers.
 */
export async function checkEmployeeDeleteEligibilityLive(
  employee: EmployeeDocument
): Promise<EmployeeLifecycleEligibility> {
  const [{ organizations, signatories }, datasets] = await Promise.all([
    fetchLiveRolesContext(),
    fetchWorkflowBlockerDatasets(),
  ]);

  const assignments = resolveEmployeeAssignments(employee, organizations, signatories);
  const blockerReport = evaluateEmployeeDeleteBlockers(employee, assignments, datasets, signatories);
  return evaluateDeleteEligibility(employee, assignments, blockerReport.blockers);
}

/**
 * Unassigns an active Club Adviser, Co-Adviser, or Institutional Signatory role from an employee
 * after re-verifying live Firestore pending signatures & pending/active club activities.
 */
export async function unassignEmployeeRole(
  employee: EmployeeDocument,
  assignment: EmployeeRoleAssignment,
  adminUser = 'SAS Administrator'
): Promise<void> {
  const blockerReport = await checkEmployeeAssignmentBlockers(employee, assignment);
  if (!blockerReport.canProceed) {
    throw new Error(
      `Cannot unassign ${employee.fullName} from ${assignment.label}: ${blockerReport.summary}`
    );
  }

  if (assignment.kind === 'primary_adviser' || assignment.kind === 'co_adviser') {
    if (!assignment.organizationId) {
      throw new Error('Missing organization reference for adviser unassignment.');
    }
    await assignOrRevokeOrganizationAdviser(
      assignment.organizationId,
      assignment.organizationName || 'Organization',
      {
        action: 'unassign',
        adviserRole: assignment.adviserRole || (assignment.kind === 'co_adviser' ? 'co_adviser' : 'primary'),
        adminUser,
      }
    );
    return;
  }

  if (assignment.kind === 'institutional_signatory') {
    if (!assignment.signatoryId) {
      throw new Error('Missing signatory reference for unassignment.');
    }
    await toggleSignatoryStatus(assignment.signatoryId, false);
    return;
  }

  throw new Error('Unsupported role assignment type.');
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

  // Enforce Archive guard at the service boundary so active/assigned employees cannot be archived
  if (updates.archived === true || updates.status === 'ARCHIVED') {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const existingEmp = { id: existingSnap.id, ...existingSnap.data() } as EmployeeDocument;
      const { organizations, signatories } = await fetchLiveRolesContext();
      const assignments = resolveEmployeeAssignments(existingEmp, organizations, signatories);
      const eligibility = evaluateArchiveEligibility(existingEmp, assignments);
      if (!eligibility.allowed) {
        throw new Error(eligibility.reason || 'Unassign this employee’s active role(s) before archiving.');
      }
    }
  }

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

export async function archiveEmployeeSafely(employee: EmployeeDocument): Promise<void> {
  await updateEmployee(employee.id, { archived: true });
}

export async function deleteEmployee(id: string): Promise<void> {
  const ref = doc(db, EMPLOYEES_COLLECTION, id);
  const existingSnap = await getDoc(ref);
  if (existingSnap.exists()) {
    const existingEmp = { id: existingSnap.id, ...existingSnap.data() } as EmployeeDocument;
    const eligibility = await checkEmployeeDeleteEligibilityLive(existingEmp);
    if (!eligibility.allowed) {
      throw new Error(eligibility.reason || 'This employee cannot be permanently deleted right now.');
    }
  }
  await deleteDoc(ref);
}

export async function deleteEmployeeSafely(employee: EmployeeDocument): Promise<void> {
  await deleteEmployee(employee.id);
}

export async function bulkImportEmployees(
  rows: ParsedEmployeeRow[],
  existingEmployees: EmployeeDocument[]
): Promise<{ created: number; updated: number; skippedArchiveCount: number }> {
  const existingByEmpId = new Map<string, EmployeeDocument>();
  existingEmployees.forEach((emp) => {
    const key = String(emp.employeeId || '').trim().toLowerCase();
    if (key) existingByEmpId.set(key, emp);
  });

  const hasArchiveRequest = rows.some((r) => !r.error && r.status === 'ARCHIVED');
  const liveRoles = hasArchiveRequest ? await fetchLiveRolesContext() : null;

  const batch = writeBatch(db);
  let created = 0;
  let updated = 0;
  let skippedArchiveCount = 0;

  for (const row of rows) {
    if (row.error) continue;
    const key = row.employeeId.trim().toLowerCase();
    const matched = existingByEmpId.get(key);
    if (matched) {
      let targetArchived = row.status === 'ARCHIVED';
      let targetStatus = row.status === 'ARCHIVED' ? 'ARCHIVED' : row.status;

      if (targetArchived && liveRoles) {
        const assignments = resolveEmployeeAssignments(
          matched,
          liveRoles.organizations,
          liveRoles.signatories
        );
        if (assignments.length > 0) {
          targetArchived = false;
          targetStatus = 'ACTIVE';
          skippedArchiveCount++;
        }
      }

      const ref = doc(db, EMPLOYEES_COLLECTION, matched.id);
      batch.update(ref, {
        employeeId: row.employeeId,
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        fullName: row.fullName,
        positionTitle: row.positionTitle,
        status: targetStatus,
        archived: targetArchived,
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

  return { created, updated, skippedArchiveCount };
}
