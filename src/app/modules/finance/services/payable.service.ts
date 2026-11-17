import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  runTransaction,
  serverTimestamp,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { addLedgerTransaction, addOrgLedgerTransaction } from './finance.service';
import type {
  PayableDocument,
  PayableType,
  CreatePayablePayload,
  GenerateDuesPayload,
  PayableStatus,
  GenerateEventFinesPayload,
  SessionFineRule,
  FineViolationDetail,
  ProcessRefundPayload,
} from '../types/payable.types';

export const PAYABLES_COLLECTION = 'payables';

const cleanStudentKey = (value: any): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

/**
 * Prefers active student profiles with a linked Firebase Auth UID when duplicate
 * /students documents exist for the same school ID or email.
 */
export function pickPreferredStudentRecord(current: any, candidate: any): any {
  if (!current) return candidate;
  if (!candidate) return current;

  const scoreRecord = (s: any): number => {
    let score = 0;
    const status = String(s.status || '').toUpperCase();
    const enrollment = String(s.enrollmentStatus || '').toUpperCase();
    if (!s.archived && status !== 'INACTIVE' && enrollment !== 'INACTIVE') {
      score += 4;
    }
    if (cleanStudentKey(s.authUid)) score += 2;
    if (cleanStudentKey(s.studentId || s.schoolId || s.studentNumber)) score += 1;
    return score;
  };

  return scoreRecord(candidate) > scoreRecord(current) ? candidate : current;
}

/**
 * Builds a case-insensitive lookup map of /students records keyed by studentId,
 * authUid, email, and Firestore document ID without letting stale/inactive duplicates
 * overwrite active Auth-linked profiles.
 */
export function buildStudentsLookupMap(docs: Array<any>): Map<string, any> {
  const lookup = new Map<string, any>();
  const setPreferred = (rawKey: any, record: any) => {
    const key = cleanStudentKey(rawKey).toLowerCase();
    if (!key) return;
    lookup.set(key, pickPreferredStudentRecord(lookup.get(key), record));
  };

  docs.forEach((entry) => {
    const sData =
      typeof entry?.data === 'function'
        ? { id: entry.id, ...entry.data() }
        : entry;
    if (!sData) return;
    setPreferred(sData.studentId || sData.schoolId || sData.studentNumber, sData);
    setPreferred(sData.authUid, sData);
    setPreferred(sData.email, sData);
    setPreferred(sData.id, sData);
  });

  return lookup;
}

/**
 * Resolves the canonical `studentId` stored on /payables documents.
 * Mobile queries `/payables` with `where('studentId', '==', authUid)`, so linked
 * Firebase `authUid` must always win over auto-generated `/students` doc IDs.
 */
export function resolvePayableStudentUid(student: any, fallbackId: string = ''): string {
  if (!student) return cleanStudentKey(fallbackId);
  return (
    cleanStudentKey(student.authUid) ||
    cleanStudentKey(student.studentAuthUid) ||
    cleanStudentKey(student.id) ||
    cleanStudentKey(student.studentId) ||
    cleanStudentKey(student.schoolId) ||
    cleanStudentKey(student.studentNumber) ||
    cleanStudentKey(fallbackId)
  );
}

/**
 * Resolves the active semester or trimester matching a student's academic level track
 * (`COLLEGE` vs `SHS`) when both tracks have simultaneous ACTIVE periods.
 */
export function resolveActivePeriodForLevel(
  semesters: Array<any>,
  academicLevel?: string
): { id: string; semester: string; schoolYear: string; label: string } {
  const normalizedLevel =
    cleanStudentKey(academicLevel).toUpperCase() === 'SHS' ? 'SHS' : 'COLLEGE';
  const nonArchived = (semesters || []).filter((s) => s && !s.archived);
  const pool = nonArchived.length > 0 ? nonArchived : semesters || [];

  const exactActive = pool.find(
    (s) =>
      s?.status === 'ACTIVE' &&
      (cleanStudentKey(s?.academicLevel).toUpperCase() || 'COLLEGE') === normalizedLevel
  );
  const anyActive = pool.find((s) => s?.status === 'ACTIVE');
  const exactAny = pool.find(
    (s) => (cleanStudentKey(s?.academicLevel).toUpperCase() || 'COLLEGE') === normalizedLevel
  );
  const chosen = exactActive || anyActive || exactAny || pool[0];

  return {
    id: chosen?.id || 'active',
    semester: chosen?.semester || chosen?.term || chosen?.label || '',
    schoolYear: chosen?.academicYear || '',
    label: chosen?.label || chosen?.semester || '',
  };
}

/**
 * Targeted Firestore fallback to resolve a student's canonical payable UID (`authUid`)
 * when an in-memory stream cache is incomplete or has not populated `authUid` yet.
 */
export async function lookupStudentAuthUidByIdentifiers(params: {
  authUid?: string;
  schoolId?: string;
  studentId?: string;
  docId?: string;
  email?: string;
}): Promise<string> {
  const explicitAuth = cleanStudentKey(params.authUid);
  if (explicitAuth) return explicitAuth;

  const candidates: any[] = [];
  const studentsRef = collection(db, 'students');
  const schoolId = cleanStudentKey(params.schoolId || params.studentId);
  const docId = cleanStudentKey(params.docId);
  const email = cleanStudentKey(params.email).toLowerCase();

  try {
    if (schoolId) {
      const snap = await getDocs(query(studentsRef, where('studentId', '==', schoolId)));
      snap.docs.forEach((d) => candidates.push({ id: d.id, ...d.data() }));
    }
    if (candidates.length === 0 && docId) {
      const dSnap = await getDoc(doc(db, 'students', docId));
      if (dSnap.exists()) {
        candidates.push({ id: dSnap.id, ...dSnap.data() });
      }
    }
    if (candidates.length === 0 && email) {
      const emailSnap = await getDocs(query(studentsRef, where('email', '==', email)));
      emailSnap.docs.forEach((d) => candidates.push({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn('[lookupStudentAuthUidByIdentifiers] Lookup fallback failed:', err);
  }

  let preferred: any = null;
  for (const c of candidates) {
    preferred = pickPreferredStudentRecord(preferred, c);
  }

  return resolvePayableStudentUid(
    preferred,
    docId || schoolId || cleanStudentKey(params.studentId)
  );
}

/**
 * Generate membership dues for org members.
 * Deduplicates automatically by checking existing membership_due payables.
 */
export async function generateMembershipDues(payload: GenerateDuesPayload): Promise<number> {
  const {
    organizationId,
    organizationName,
    semesterId,
    membershipFee,
    memberIds,
    dueDate,
    createdBy,
  } = payload;

  // 1. Fetch target members from organization_members
  const membersRef = collection(db, 'organization_members');
  const qMembers = query(
    membersRef,
    where('organizationId', '==', organizationId),
    where('status', '==', 'active')
  );
  const snapshot = await getDocs(qMembers);

  // Load students map for resolving Auth UID and 11-digit School ID
  let studentsLookup = new Map<string, any>();
  try {
    const studentsRef = collection(db, 'students');
    const studentsSnap = await getDocs(studentsRef);
    studentsLookup = buildStudentsLookupMap(studentsSnap.docs);
  } catch (e) {
    console.warn('[generateMembershipDues] Could not pre-fetch students for ID resolution:', e);
  }

  const membersToProcess: Array<{
    studentId: string;
    studentName: string;
    studentSchoolId: string;
    courseCode?: string;
    courseName?: string;
    departmentId?: string;
    departmentName?: string;
    yearLevel?: string;
    section?: string;
    academicLevel?: string;
    semester?: string;
    schoolYear?: string;
  }> = [];

  snapshot.docs.forEach((d) => {
    const data = d.data();
    const rawStudentId = (data.studentId || d.id || '').toString().trim();
    if (memberIds === 'all' || memberIds.includes(rawStudentId) || memberIds.includes(d.id)) {
      const matched =
        (data.authUid ? studentsLookup.get(String(data.authUid).trim().toLowerCase()) : undefined) ||
        studentsLookup.get(rawStudentId.toLowerCase()) ||
        (data.studentSchoolId ? studentsLookup.get(String(data.studentSchoolId).trim().toLowerCase()) : undefined);
      const authUid = resolvePayableStudentUid(
        matched,
        cleanStudentKey(data.authUid) || cleanStudentKey(data.studentAuthUid) || rawStudentId
      );
      const schoolId = matched?.studentId || data.studentSchoolId || data.studentId || rawStudentId;
      const fullName =
        data.studentName ||
        (matched ? `${matched.firstName || ''} ${matched.lastName || ''}`.trim() : '') ||
        'Student';
      const resolvedYear = matched?.yearLevel || data.yearLevel || '';

      membersToProcess.push({
        studentId: authUid,
        studentName: fullName,
        studentSchoolId: schoolId,
        courseCode: matched?.courseCode || data.courseCode || '',
        courseName: matched?.courseName || data.courseName || '',
        departmentId: matched?.departmentId || data.departmentId || '',
        departmentName: matched?.departmentName || matched?.department || data.department || '',
        yearLevel: resolvedYear,
        section: matched?.section || data.section || '',
        academicLevel:
          matched?.academicLevel ||
          data.academicLevel ||
          (String(resolvedYear).toLowerCase().includes('grade') ? 'SHS' : 'COLLEGE'),
        semester: matched?.semester || data.semester || '',
        schoolYear: matched?.schoolYear || data.schoolYear || '',
      });
    }
  });

  if (membersToProcess.length === 0) return 0;

  // 2. Query existing membership_due payables for this org + semester to deduplicate
  const payablesRef = collection(db, PAYABLES_COLLECTION);
  const qExisting = query(
    payablesRef,
    where('organizationId', '==', organizationId),
    where('semesterId', '==', semesterId),
    where('type', '==', 'membership_due')
  );
  const existingSnapshot = await getDocs(qExisting);
  const existingStudentIds = new Set<string>();
  existingSnapshot.docs.forEach((d) => {
    const dData = d.data();
    if (dData.studentId) existingStudentIds.add(String(dData.studentId).trim().toLowerCase());
    if (dData.studentSchoolId) existingStudentIds.add(String(dData.studentSchoolId).trim().toLowerCase());
  });

  // Filter out already generated members
  const newMembers = membersToProcess.filter(
    (m) =>
      !existingStudentIds.has(m.studentId.toLowerCase()) &&
      !existingStudentIds.has(m.studentSchoolId.toLowerCase())
  );

  if (newMembers.length === 0) return 0;

  // 3. Batch write new payables in chunks of 500
  const chunks = [];
  for (let i = 0; i < newMembers.length; i += 500) {
    chunks.push(newMembers.slice(i, i + 500));
  }

  let createdCount = 0;
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const member of chunk) {
      const newRef = doc(payablesRef);
      batch.set(
        newRef,
        buildCanonicalPayableRecord(newRef.id, {
          studentId: member.studentId,
          studentName: member.studentName,
          studentSchoolId: member.studentSchoolId,
          type: 'membership_due',
          label: `Membership Due (${organizationName})`,
          title: `Membership Due (${organizationName})`,
          feeTitle: `Membership Due (${organizationName})`,
          category: 'Membership Due',
          description: `Semester membership fee for ${organizationName}`,
          organizationId,
          organizationName,
          semesterId,
          semester: member.semester,
          schoolYear: member.schoolYear,
          eventId: null,
          assignedAmount: membershipFee,
          dueDate: dueDate || null,
          courseCode: member.courseCode,
          courseName: member.courseName,
          departmentId: member.departmentId,
          departmentName: member.departmentName,
          yearLevel: member.yearLevel,
          section: member.section,
          academicLevel: member.academicLevel,
          createdBy,
        })
      );
      createdCount++;
    }
    await batch.commit();
  }

  return createdCount;
}

/**
 * Builds a canonical Firestore /payables payload with full STI Sync Mobile App parity.
 */
export function buildCanonicalPayableRecord(
  id: string,
  payload: CreatePayablePayload,
  nowTimestamp?: any
): Record<string, any> {
  let formattedDueDate: Timestamp | null = null;
  if (payload.dueDate) {
    if (payload.dueDate instanceof Timestamp) {
      formattedDueDate = payload.dueDate;
    } else {
      const parsed = new Date(payload.dueDate as any);
      if (!isNaN(parsed.getTime())) {
        formattedDueDate = Timestamp.fromDate(parsed);
      }
    }
  }

  const payableAmount = Number(payload.assignedAmount ?? payload.amount ?? 0);
  const initialPaid = Math.min(payableAmount, Math.max(0, Number(payload.paidAmount ?? 0)));
  const remainingBalance = Math.max(0, payableAmount - initialPaid);
  const computedStatus: PayableStatus =
    payload.status ||
    (initialPaid >= payableAmount && payableAmount > 0
      ? 'paid'
      : initialPaid > 0
      ? 'partial'
      : 'pending');
  const payableTitle = (payload.title || payload.label || payload.feeTitle || 'Payable Fee').trim();
  const category =
    payload.category ||
    (payload.type === 'admin_fine' || payload.type === 'org_fine'
      ? 'Fine'
      : payload.type === 'membership_due'
      ? 'Membership Due'
      : payload.type === 'event_pass'
      ? 'Event Pass'
      : payload.type === 'event_fee'
      ? 'Event Fee'
      : 'Institutional Assessment');
  const paymentStatus =
    payload.paymentStatus ||
    (computedStatus === 'paid'
      ? 'PAID'
      : computedStatus === 'partial'
      ? 'PARTIAL'
      : computedStatus === 'waived'
      ? 'WAIVED'
      : computedStatus === 'refunded'
      ? 'REFUNDED'
      : 'UNPAID');

  const tsNow = nowTimestamp || serverTimestamp();

  const record: Record<string, any> = {
    id,
    payableId: payload.payableId || id,
    studentId: payload.studentId,
    studentName: payload.studentName,
    studentSchoolId: payload.studentSchoolId,
    studentNumber: payload.studentSchoolId || '',
    type: payload.type,
    label: payableTitle,
    title: payableTitle,
    feeTitle: payableTitle,
    eventTitle: payload.eventTitle ?? (payload.eventId ? payableTitle : null),
    category,
    description: payload.description || '',
    organizationId: payload.organizationId || null,
    organizationName: payload.organizationName || (payload.organizationId ? null : 'SAO Administration'),
    semesterId: payload.semesterId || '',
    semester: payload.semester || '',
    schoolYear: payload.schoolYear || '',
    eventId: payload.eventId || null,
    autoRuleId: payload.autoRuleId || null,
    amount: payableAmount,
    amountDue: payableAmount,
    assignedAmount: payableAmount,
    paidAmount: initialPaid,
    amountPaid: initialPaid,
    balance: remainingBalance,
    status: computedStatus,
    paymentStatus,
    qrTicketUnlocked: Boolean(payload.qrTicketUnlocked),
    dueDate: formattedDueDate,
    courseCode: payload.courseCode || '',
    courseName: payload.courseName || '',
    departmentId: payload.departmentId || '',
    departmentName: payload.departmentName || '',
    yearLevel: payload.yearLevel || '',
    section: payload.section || '',
    academicLevel: payload.academicLevel || 'COLLEGE',
    paidAt: computedStatus === 'paid' ? tsNow : null,
    recordedBy: payload.recordedBy ?? null,
    paymentMethod: payload.paymentMethod ?? null,
    transferredToBudget: Boolean(payload.transferredToBudget),
    transferredAt: null,
    createdBy: payload.createdBy,
    createdAt: tsNow,
    updatedAt: tsNow,
  };

  if (payload.fineViolations && payload.fineViolations.length > 0) {
    record.fineViolations = payload.fineViolations;
  }

  return record;
}

/**
 * Create a single payable doc (fine, custom fee, event fee, club due)
 */
export async function createPayable(payload: CreatePayablePayload): Promise<string> {
  const payablesRef = collection(db, PAYABLES_COLLECTION);
  const newDocRef = doc(payablesRef);

  await setDoc(newDocRef, buildCanonicalPayableRecord(newDocRef.id, payload));

  return newDocRef.id;
}

/**
 * Record a full or partial payment for a payable
 */
export async function recordPayment(
  payableId: string,
  paymentAmount: number,
  recordedBy: string,
  paymentMethod: string = 'cash',
  unlockQRTicket?: boolean,
  receiptNumber?: string,
  notes?: string
): Promise<void> {
  const payableRef = doc(db, PAYABLES_COLLECTION, payableId);
  const snap = await getDoc(payableRef);

  if (!snap.exists()) {
    throw new Error('Payable document not found');
  }

  const data = snap.data() as PayableDocument;
  const currentPaid = Number(data.paidAmount) || 0;
  const assigned = Number(data.assignedAmount) || 0;
  // GUARD: Reject if payable is closed, waived, refunded, or queued for refund
  if (data.status === 'waived') {
    throw new Error('Cannot record payment: This payable has been waived.');
  }
  if (data.status === 'refund_pending' || data.status === 'refunded') {
    throw new Error('Cannot record payment: This payable has been refunded or queued for refund.');
  }
  if ((data as any).status === 'cancelled') {
    throw new Error('Cannot record payment: This payable is cancelled.');
  }

  // GUARD: Check if the associated event is cancelled
  if (data.eventId) {
    try {
      let eventSnap = await getDoc(doc(db, 'activities', data.eventId));
      if (!eventSnap.exists()) {
        eventSnap = await getDoc(doc(db, 'events', data.eventId));
      }
      if (eventSnap.exists()) {
        const evData = eventSnap.data();
        if (
          evData.status === 'cancelled' ||
          evData.isCancelled === true ||
          evData.proposalStatus === 'cancelled' ||
          evData.lifecycleStatus === 'cancelled'
        ) {
          throw new Error('Cannot record payment: This event has been cancelled.');
        }
      }
    } catch (e: any) {
      if (e.message?.includes('Cannot record payment: This event has been cancelled.')) {
        throw e;
      }
      console.warn('[recordPayment] Could not verify event status:', e);
    }
  }

  // GUARD: Reject if already fully paid
  if (data.status === 'paid' || (assigned > 0 && currentPaid >= assigned)) {
    throw new Error('This payable is already fully paid.');
  }

  // Calculate remaining balance to prevent double payments
  const remaining = assigned > 0 ? Math.max(0, assigned - currentPaid) : paymentAmount;
  const actualPayment = Math.min(paymentAmount, remaining);
  if (actualPayment <= 0) {
    throw new Error('This payable has no remaining balance to pay.');
  }

  const newPaidAmount = currentPaid + actualPayment;
  const orgIdClean = String(data.organizationId || '').trim();
  const isClubOwnedPayable =
    Boolean(orgIdClean) &&
    !['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgIdClean.toLowerCase());

  const transferredAmt = isClubOwnedPayable
    ? newPaidAmount
    : typeof data.transferredAmount === 'number'
      ? data.transferredAmount
      : 0;
  const isFullyTransferred = isClubOwnedPayable
    ? true
    : transferredAmt >= newPaidAmount && newPaidAmount > 0;

  let newStatus: PayableStatus = 'partial';
  let paidAtTimestamp: Timestamp | null = data.paidAt || null;

  if (newPaidAmount >= assigned) {
    newStatus = 'paid';
    paidAtTimestamp = Timestamp.now();
  } else if (newPaidAmount > 0) {
    newStatus = 'partial';
    if (!paidAtTimestamp) paidAtTimestamp = Timestamp.now();
  }

  const remainingAfterPayment =
    assigned > 0 ? Math.max(0, assigned - newPaidAmount) : 0;
  const paymentStatusStr =
    newStatus === 'paid'
      ? 'PAID'
      : newStatus === 'partial'
      ? 'PARTIAL'
      : 'UNPAID';

  const autoTransferBatchId = isClubOwnedPayable
    ? `ORG-PAY-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    : undefined;

  const updates: Record<string, any> = {
    paidAmount: newPaidAmount,
    amountPaid: newPaidAmount,
    balance: remainingAfterPayment,
    status: newStatus,
    paymentStatus: paymentStatusStr,
    paidAt: paidAtTimestamp,
    recordedBy,
    paymentMethod,
    transferredToBudget: isFullyTransferred,
    ...(isClubOwnedPayable
      ? {
          transferredAmount: newPaidAmount,
          transferredAt: serverTimestamp(),
          transferredBatchId: autoTransferBatchId,
        }
      : {}),
    updatedAt: serverTimestamp(),
  };

  if (receiptNumber) updates.receiptNumber = receiptNumber;
  if (notes) updates.notes = notes;

  // Option A (Strict): Automatically unlock only when 100% fully paid, or if explicit boolean passed
  if (typeof unlockQRTicket === 'boolean') {
    updates.qrTicketUnlocked = unlockQRTicket;
  } else if (newStatus === 'paid') {
    updates.qrTicketUnlocked = true;
  }

  await updateDoc(payableRef, updates);

  // Automatically record payment into the Club's own organization_ledger so it immediately appears in Finance Center Budget Ledger Transactions
  if (isClubOwnedPayable && actualPayment > 0) {
    try {
      const labelTitle =
        data.label || (data as any).eventTitle || (data as any).title || 'Club Payable';
      const studentLabel = data.studentName || data.studentSchoolId || data.studentId || 'Student';
      await addDoc(collection(db, 'organization_ledger'), {
        organizationId: orgIdClean,
        semesterId: data.semesterId || null,
        date: Timestamp.now(),
        description: `Student Payment (${studentLabel}) – ${labelTitle}`,
        eventId: data.eventId || null,
        type: 'income' as const,
        source: 'student_collection' as const,
        amount: Math.round(actualPayment * 100) / 100,
        addedBy: recordedBy || 'Officer',
        collectionId: autoTransferBatchId || payableId,
        receiptNumber: receiptNumber || null,
        createdAt: serverTimestamp(),
      });
    } catch (ledgerErr) {
      console.warn('[recordPayment] Auto org ledger write warning:', ledgerErr);
    }
  }

  if (data.eventId) {
    try {
      await syncEventContributionCollectionSnapshot(data.eventId);
    } catch (syncErr) {
      console.warn('[recordPayment] Event collection snapshot sync warning:', syncErr);
    }
  }
}

/**
 * Explicitly toggle QR Ticket Unlock status (unlocked vs locked)
 */
export async function toggleQRTicketUnlock(payableId: string, unlocked: boolean): Promise<void> {
  const payableRef = doc(db, PAYABLES_COLLECTION, payableId);
  await updateDoc(payableRef, {
    qrTicketUnlocked: unlocked,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Waive a payable
 */
export async function waivePayable(payableId: string, waivedBy: string): Promise<void> {
  const payableRef = doc(db, PAYABLES_COLLECTION, payableId);
  await updateDoc(payableRef, {
    status: 'waived' as PayableStatus,
    paymentStatus: 'WAIVED',
    balance: 0,
    recordedBy: waivedBy,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Bulk record full payment for multiple payables
 */
export async function bulkRecordPayment(payableIds: string[], recordedBy: string): Promise<void> {
  if (payableIds.length === 0) return;

  const chunks = [];
  for (let i = 0; i < payableIds.length; i += 500) {
    chunks.push(payableIds.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const snaps = await Promise.all(
      chunk.map((id) => getDoc(doc(db, PAYABLES_COLLECTION, id)).catch(() => null))
    );
    const batch = writeBatch(db);
    chunk.forEach((id, idx) => {
      const ref = doc(db, PAYABLES_COLLECTION, id);
      const snap = snaps[idx];
      const existingData = snap && snap.exists() ? snap.data() : null;
      const assigned = existingData
        ? Number(existingData.assignedAmount ?? existingData.amount ?? 0)
        : 0;
      const orgIdClean = String(existingData?.organizationId || '').trim();
      const isClubOwned =
        Boolean(orgIdClean) &&
        !['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgIdClean.toLowerCase());
      const updatePayload: Record<string, any> = {
        status: 'paid' as PayableStatus,
        paymentStatus: 'PAID',
        balance: 0,
        paidAt: serverTimestamp(),
        recordedBy,
        paymentMethod: 'cash',
        ...(isClubOwned
          ? {
              transferredToBudget: true,
              transferredAmount: assigned,
              transferredAt: serverTimestamp(),
            }
          : {}),
        updatedAt: serverTimestamp(),
      };
      if (assigned > 0) {
        updatePayload.paidAmount = assigned;
        updatePayload.amountPaid = assigned;
      }
      batch.update(ref, updatePayload);
    });
    await batch.commit();
  }
}

/**
 * Delete a payable (only allowed if paidAmount is 0)
 */
export async function deletePayable(payableId: string): Promise<void> {
  const payableRef = doc(db, PAYABLES_COLLECTION, payableId);
  const snap = await getDoc(payableRef);

  if (snap.exists() && (snap.data().paidAmount || 0) > 0) {
    throw new Error('Cannot delete a payable that has recorded payments');
  }

  await deleteDoc(payableRef);
}

/**
 * Update payable due date
 */
export async function updatePayableDueDate(payableId: string, newDueDate: Date | null): Promise<void> {
  const payableRef = doc(db, PAYABLES_COLLECTION, payableId);
  await updateDoc(payableRef, {
    dueDate: newDueDate ? Timestamp.fromDate(newDueDate) : null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Bulk mark all event fee payables for an event as transferred to the SAO school budget
 */
export async function markEventPayablesTransferred(eventId: string): Promise<void> {
  const payablesRef = collection(db, PAYABLES_COLLECTION);
  const q = query(
    payablesRef,
    where('eventId', '==', eventId)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) return;

  const chunks = [];
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += 500) {
    chunks.push(docs.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.update(d.ref, {
        transferredToBudget: true,
        transferredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

/**
 * Automatically evaluate attendance records for an event and record fines (Absent, Late, Missed Scan)
 * based on event settings and rules configured by officers/admins.
 */
export async function recordEventFinePayables(
  eventId: string,
  createdBy: string,
  isOfficer: boolean = true
): Promise<{ created: number; skipped: number }> {
  let eventRef = doc(db, 'activities', eventId);
  let eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists()) {
    eventRef = doc(db, 'events', eventId);
    eventSnap = await getDoc(eventRef);
  }
  if (!eventSnap.exists()) {
    throw new Error('Activity not found');
  }
  const eventData = eventSnap.data();
  const fineAmount = Number(eventData.latePenaltyAmount) || 50;

  const attendanceRef = collection(db, 'attendance');
  const qAttendance = query(attendanceRef, where('eventId', '==', eventId));
  const attendanceSnap = await getDocs(qAttendance);

  let attendanceDocs = attendanceSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (attendanceDocs.length === 0 && eventData.title) {
    const qByTitle = query(attendanceRef, where('event', '==', eventData.title));
    const titleSnap = await getDocs(qByTitle);
    attendanceDocs = titleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  if (attendanceDocs.length === 0) {
    return { created: 0, skipped: 0 };
  }

  const payablesRef = collection(db, PAYABLES_COLLECTION);
  const qPayables = query(
    payablesRef,
    where('eventId', '==', eventId),
    where('type', 'in', ['org_fine', 'admin_fine'])
  );
  const existingPayablesSnap = await getDocs(qPayables);

  const existingFineKeys = new Set<string>();
  existingPayablesSnap.docs.forEach((d) => {
    const data = d.data();
    const studentId = (data.studentId || '').toString().trim();
    const label = (data.label || '').toString().toLowerCase();
    let category = 'absent';
    if (label.includes('late')) category = 'late';
    else if (label.includes('missed scan') || label.includes('flagged')) category = 'missed_scan';
    existingFineKeys.add(`${studentId}_${category}`);
  });

  const isSasAdminEvent =
    eventData.hostingOrgId === 'sas_admin' ||
    eventData.hostingOrgId === 'sas' ||
    eventData.hostingOrgId === 'sao_admin' ||
    eventData.hostingOrgId === 'sao' ||
    eventData.isOfficerProposal === false ||
    !isOfficer;

  const payableType: PayableType = isSasAdminEvent ? 'admin_fine' : 'org_fine';
  const orgId = isSasAdminEvent ? null : (eventData.hostingOrgId || null);
  const orgName = isSasAdminEvent ? 'Student Affairs and Services (SAS)' : (eventData.hostingOrgName || eventData.org || null);
  const semesterId = eventData.semesterId || 'current';

  let createdCount = 0;
  let skippedCount = 0;

  // Load students map for robust resolution between Auth UID and 11-digit Student ID
  let studentsLookup = new Map<string, any>();
  try {
    const studentsRef = collection(db, 'students');
    const studentsSnap = await getDocs(studentsRef);
    studentsLookup = buildStudentsLookupMap(studentsSnap.docs);
  } catch (e) {
    console.warn('[recordEventFinePayables] Could not pre-fetch students for ID resolution:', e);
  }

  const newPayablesToCreate: CreatePayablePayload[] = [];

  for (const rec of attendanceDocs) {
    const rawStudentId = (rec.studentId || '').toString().trim();
    const rawSchoolId = ((rec as any).studentSchoolId || '').toString().trim();
    const status = (rec.status || '').toString();

    const matched =
      ((rec as any).studentAuthUid ? studentsLookup.get(String((rec as any).studentAuthUid).trim().toLowerCase()) : undefined) ||
      studentsLookup.get(rawStudentId.toLowerCase()) ||
      (rawSchoolId ? studentsLookup.get(rawSchoolId.toLowerCase()) : undefined);

    const authUid = resolvePayableStudentUid(matched, (rec as any).studentAuthUid || rawStudentId);
    const schoolId = matched?.studentId || rawSchoolId || rawStudentId;
    const studentName =
      rec.name ||
      (matched ? `${matched.firstName || ''} ${matched.lastName || ''}`.trim() : '') ||
      'Student';

    let violationCategory: 'absent' | 'late' | 'missed_scan' | null = null;
    let label = '';
    let description = '';

    if (status === 'Absent') {
      violationCategory = 'absent';
      label = `Absent Fine — ${eventData.title}`;
      description = `Automatic fine for unexcused absence at ${eventData.title}`;
    } else if (status === 'Late') {
      violationCategory = 'late';
      label = `Late Arrival Fine — ${eventData.title}`;
      description = `Automatic fine for late check-in at ${eventData.title}`;
    } else if (status === 'Flagged' || (rec.checkIn && !rec.checkOut && eventData.sessions?.[0]?.hasTimeOut)) {
      violationCategory = 'missed_scan';
      label = `Missed Scan Fine — ${eventData.title}`;
      description = `Automatic fine for incomplete scan-in / scan-out at ${eventData.title}`;
    }

    if (!violationCategory || (!authUid && !schoolId)) continue;

    const fineKey = `${authUid}_${violationCategory}`;
    const fineSchoolKey = `${schoolId}_${violationCategory}`;
    if (existingFineKeys.has(fineKey) || existingFineKeys.has(fineSchoolKey)) {
      skippedCount++;
      continue;
    }

    existingFineKeys.add(fineKey);
    existingFineKeys.add(fineSchoolKey);
    const resolvedYear = matched?.yearLevel || '';
    newPayablesToCreate.push({
      studentId: authUid,
      studentName,
      studentSchoolId: schoolId,
      type: payableType,
      label,
      title: label,
      feeTitle: label,
      eventTitle: eventData.title || '',
      category: 'Fine',
      description,
      organizationId: orgId,
      organizationName: orgName,
      semesterId,
      semester: eventData.semester || matched?.semester || '',
      schoolYear: eventData.schoolYear || matched?.schoolYear || '',
      eventId,
      assignedAmount: fineAmount,
      courseCode: matched?.courseCode || '',
      courseName: matched?.courseName || '',
      departmentId: matched?.departmentId || '',
      departmentName: matched?.departmentName || matched?.department || '',
      yearLevel: resolvedYear,
      section: matched?.section || '',
      academicLevel:
        matched?.academicLevel ||
        (String(resolvedYear).toLowerCase().includes('grade') ? 'SHS' : 'COLLEGE'),
      createdBy,
    });
  }

  if (newPayablesToCreate.length === 0) {
    return { created: 0, skipped: skippedCount };
  }

  const chunks = [];
  for (let i = 0; i < newPayablesToCreate.length; i += 500) {
    chunks.push(newPayablesToCreate.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const payload of chunk) {
      const newDocRef = doc(payablesRef);
      batch.set(newDocRef, buildCanonicalPayableRecord(newDocRef.id, payload));
      createdCount++;
    }
    await batch.commit();
  }

  return { created: createdCount, skipped: skippedCount };
}

/**
 * Dynamically evaluate event attendance per session against custom fine rules
 * and batch-create/update fine payables.
 */
export async function generateDynamicEventFines(
  payload: GenerateEventFinesPayload
): Promise<{ created: number; updated: number; skipped: number; totalAmount: number }> {
  const {
    eventId,
    eventTitle,
    semesterId,
    rules,
    createdBy,
    isOfficer,
    hostingOrgId,
    hostingOrgName,
    dueDate,
    studentViolations,
    rawAttendanceRecords,
  } = payload;

  const parsedDueDate = dueDate
    ? dueDate instanceof Timestamp
      ? dueDate
      : Timestamp.fromDate(new Date(dueDate))
    : null;

  let eventRef = doc(db, 'activities', eventId);
  let eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists()) {
    eventRef = doc(db, 'events', eventId);
    eventSnap = await getDoc(eventRef);
  }
  if (!eventSnap.exists()) {
    throw new Error('Activity not found');
  }
  const eventData = eventSnap.data();

  // 1. Determine if Admin / SAS event vs Club Event
  const isSasAdminEvent =
    !isOfficer ||
    eventData.hostingOrgId === 'sas_admin' ||
    eventData.hostingOrgId === 'sas' ||
    eventData.hostingOrgId === 'sao_admin' ||
    eventData.hostingOrgId === 'sao' ||
    eventData.isOfficerProposal === false;

  const payableType: PayableType = isSasAdminEvent ? 'admin_fine' : 'org_fine';
  const orgId = isSasAdminEvent ? null : (hostingOrgId || eventData.hostingOrgId || null);
  const orgName = isSasAdminEvent
    ? 'Student Affairs and Services (SAS)'
    : (hostingOrgName || eventData.hostingOrgName || eventData.org || null);

  // 2. Query existing fine payables for this event
  const payablesRef = collection(db, PAYABLES_COLLECTION);
  const qExisting = query(
    payablesRef,
    where('eventId', '==', eventId),
    where('type', '==', payableType)
  );
  const existingSnap = await getDocs(qExisting);
  const existingPayablesByStudent = new Map<string, { id: string; status: string; paidAmount: number }>();
  existingSnap.docs.forEach((d) => {
    const data = d.data();
    const sId = (data.studentId || '').toString().trim().toLowerCase();
    const schoolId = (data.studentSchoolId || '').toString().trim().toLowerCase();
    const val = {
      id: d.id,
      status: data.status,
      paidAmount: data.paidAmount || 0,
    };
    if (sId) existingPayablesByStudent.set(sId, val);
    if (schoolId) existingPayablesByStudent.set(schoolId, val);
  });

  // 3. Load students map for robust resolution between Auth UID and 11-digit Student ID
  let studentsLookup = new Map<string, any>();
  try {
    const studentsRef = collection(db, 'students');
    const studentsSnap = await getDocs(studentsRef);
    studentsLookup = buildStudentsLookupMap(studentsSnap.docs);
  } catch (e) {
    console.warn('[generateDynamicEventFines] Could not pre-fetch students for ID resolution:', e);
  }

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let totalAssessedAmount = 0;

  const writeOps: Array<{
    type: 'create' | 'update';
    docId?: string;
    data: any;
  }> = [];

  // Case A: Precalculated student violations passed directly from the modal preview
  if (studentViolations && studentViolations.length > 0) {
    studentViolations.forEach((student) => {
      if (!student.violations || student.violations.length === 0 || student.totalFine <= 0) return;

      const rawStudentId = (student.studentId || '').toString().trim();
      const rawSchoolId = (student.studentSchoolId || '').toString().trim();
      if (!rawStudentId && !rawSchoolId) return;

      const matched =
        (student.studentAuthUid ? studentsLookup.get(String(student.studentAuthUid).trim().toLowerCase()) : undefined) ||
        studentsLookup.get(rawStudentId.toLowerCase()) ||
        (rawSchoolId ? studentsLookup.get(rawSchoolId.toLowerCase()) : undefined);

      // studentId must be Auth UID (or Firestore student doc id) so Mobile App query (where('studentId', '==', authUid)) matches
      const authUid = resolvePayableStudentUid(matched, student.studentAuthUid || rawStudentId);
      const schoolId = matched?.studentId || rawSchoolId || rawStudentId;
      const fullName =
        student.studentName ||
        (matched ? `${matched.firstName || ''} ${matched.lastName || ''}`.trim() : '') ||
        'Student';

      const existing = existingPayablesByStudent.get(authUid.toLowerCase()) || existingPayablesByStudent.get(schoolId.toLowerCase());
      if (existing && (existing.status === 'paid' || existing.status === 'waived' || existing.paidAmount > 0)) {
        skippedCount++;
        return;
      }

      const violationDescriptions = student.violations
        .map((v) => `${v.description} (₱${v.amount})`)
        .join(', ');

      if (existing) {
        const remainingBal = Math.max(0, student.totalFine - (existing.paidAmount || 0));
        writeOps.push({
          type: 'update',
          docId: existing.id,
          data: {
            assignedAmount: student.totalFine,
            amount: student.totalFine,
            amountDue: student.totalFine,
            balance: remainingBal,
            description: `Event Violations: ${violationDescriptions}`,
            fineViolations: student.violations,
            updatedAt: serverTimestamp(),
          },
        });
        updatedCount++;
        totalAssessedAmount += student.totalFine;
      } else {
        const fineLabel = isSasAdminEvent ? `Event Fine — ${eventTitle}` : `Club Fine — ${eventTitle}`;
        const resolvedYear = matched?.yearLevel || '';
        writeOps.push({
          type: 'create',
          data: {
            studentId: authUid,
            studentSchoolId: schoolId,
            studentName: fullName,
            type: payableType,
            label: fineLabel,
            title: fineLabel,
            feeTitle: fineLabel,
            eventTitle,
            category: 'Fine',
            description: `Event Violations: ${violationDescriptions}`,
            organizationId: orgId,
            organizationName: orgName,
            semesterId: semesterId || eventData.semesterId || 'active',
            semester: eventData.semester || matched?.semester || '',
            schoolYear: eventData.schoolYear || matched?.schoolYear || '',
            eventId,
            assignedAmount: student.totalFine,
            dueDate: parsedDueDate,
            courseCode: matched?.courseCode || '',
            courseName: matched?.courseName || '',
            departmentId: matched?.departmentId || '',
            departmentName: matched?.departmentName || matched?.department || '',
            yearLevel: resolvedYear,
            section: matched?.section || '',
            academicLevel:
              matched?.academicLevel ||
              (String(resolvedYear).toLowerCase().includes('grade') ? 'SHS' : 'COLLEGE'),
            fineViolations: student.violations,
            createdBy,
          } satisfies CreatePayablePayload,
        });
        createdCount++;
        totalAssessedAmount += student.totalFine;
      }
    });
  } else {
    // Case B: Evaluate against raw attendance records or query attendance from Firestore
    let attendanceDocs = rawAttendanceRecords || [];
    if (attendanceDocs.length === 0) {
      const attendanceRef = collection(db, 'attendance');
      const qAttendance = query(attendanceRef, where('eventId', '==', eventId));
      const attendanceSnap = await getDocs(qAttendance);
      attendanceDocs = attendanceSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (attendanceDocs.length === 0 && eventTitle) {
        const qByTitle = query(attendanceRef, where('event', '==', eventTitle));
        const titleSnap = await getDocs(qByTitle);
        attendanceDocs = titleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    }

    if (attendanceDocs.length === 0) {
      return { created: 0, updated: 0, skipped: 0, totalAmount: 0 };
    }

    const studentMap = new Map<string, {
      studentId: string;
      studentName: string;
      studentSchoolId: string;
      sessionRecords: Map<string, any>;
    }>();

    attendanceDocs.forEach((rec: any) => {
      const sId = (rec.studentId || '').toString().trim();
      if (!sId) return;

      if (!studentMap.has(sId)) {
        studentMap.set(sId, {
          studentId: sId,
          studentName: rec.name || 'Student',
          studentSchoolId: sId,
          sessionRecords: new Map(),
        });
      }

      const entry = studentMap.get(sId)!;
      const sessId = rec.sessionId || 'main';
      entry.sessionRecords.set(sessId, rec);
      if (!entry.sessionRecords.has('all')) {
        entry.sessionRecords.set('all', rec);
      }
    });

    studentMap.forEach((student) => {
      const violations: FineViolationDetail[] = [];
      let studentTotalFine = 0;

      rules.forEach((rule) => {
        const rec = student.sessionRecords.get(rule.sessionId) || student.sessionRecords.get('all');
        if (!rec) return;

        const status = (rec.status || '').toString();

        if (rule.enableTimeInAbsent && rule.timeInAbsentAmount > 0 && status === 'Absent') {
          violations.push({
            sessionId: rule.sessionId,
            sessionTitle: rule.sessionTitle,
            violationType: 'time_in_absent',
            amount: rule.timeInAbsentAmount,
            description: `${rule.sessionTitle}: Time-In Absent`,
          });
          studentTotalFine += rule.timeInAbsentAmount;
        }

        if (rule.enableTimeInLate && rule.timeInLateAmount > 0 && status === 'Late') {
          violations.push({
            sessionId: rule.sessionId,
            sessionTitle: rule.sessionTitle,
            violationType: 'time_in_late',
            amount: rule.timeInLateAmount,
            description: `${rule.sessionTitle}: Time-In Late`,
          });
          studentTotalFine += rule.timeInLateAmount;
        }

        if (
          rule.enableTimeOutAbsent &&
          rule.timeOutAbsentAmount > 0 &&
          (status === 'Flagged' || (rec.checkIn && (!rec.checkOut || rec.checkOut === '—')))
        ) {
          violations.push({
            sessionId: rule.sessionId,
            sessionTitle: rule.sessionTitle,
            violationType: 'time_out_absent',
            amount: rule.timeOutAbsentAmount,
            description: `${rule.sessionTitle}: Time-Out Missed / Absent`,
          });
          studentTotalFine += rule.timeOutAbsentAmount;
        }
      });

      if (violations.length === 0 || studentTotalFine <= 0) return;

      const rawStudentId = (student.studentId || '').toString().trim();
      const rawSchoolId = (student.studentSchoolId || '').toString().trim();

      const matched =
        ((student as any).studentAuthUid
          ? studentsLookup.get(String((student as any).studentAuthUid).trim().toLowerCase())
          : undefined) ||
        studentsLookup.get(rawStudentId.toLowerCase()) ||
        (rawSchoolId ? studentsLookup.get(rawSchoolId.toLowerCase()) : undefined);

      const authUid = resolvePayableStudentUid(matched, (student as any).studentAuthUid || rawStudentId);
      const schoolId = matched?.studentId || rawSchoolId || rawStudentId;
      const fullName =
        student.studentName ||
        (matched ? `${matched.firstName || ''} ${matched.lastName || ''}`.trim() : '') ||
        'Student';

      const existing = existingPayablesByStudent.get(authUid.toLowerCase()) || existingPayablesByStudent.get(schoolId.toLowerCase());
      if (existing && (existing.status === 'paid' || existing.status === 'waived' || existing.paidAmount > 0)) {
        skippedCount++;
        return;
      }

      const violationDescriptions = violations.map((v) => `${v.description} (₱${v.amount})`).join(', ');

      if (existing) {
        const remainingBal = Math.max(0, studentTotalFine - (existing.paidAmount || 0));
        writeOps.push({
          type: 'update',
          docId: existing.id,
          data: {
            assignedAmount: studentTotalFine,
            amount: studentTotalFine,
            amountDue: studentTotalFine,
            balance: remainingBal,
            description: `Event Violations: ${violationDescriptions}`,
            fineViolations: violations,
            updatedAt: serverTimestamp(),
          },
        });
        updatedCount++;
        totalAssessedAmount += studentTotalFine;
      } else {
        const fineLabel = isSasAdminEvent ? `Event Fine — ${eventTitle}` : `Club Fine — ${eventTitle}`;
        const resolvedYear = matched?.yearLevel || '';
        writeOps.push({
          type: 'create',
          data: {
            studentId: authUid,
            studentSchoolId: schoolId,
            studentName: fullName,
            type: payableType,
            label: fineLabel,
            title: fineLabel,
            feeTitle: fineLabel,
            eventTitle,
            category: 'Fine',
            description: `Event Violations: ${violationDescriptions}`,
            organizationId: orgId,
            organizationName: orgName,
            semesterId: semesterId || eventData.semesterId || 'active',
            semester: eventData.semester || matched?.semester || '',
            schoolYear: eventData.schoolYear || matched?.schoolYear || '',
            eventId,
            assignedAmount: studentTotalFine,
            dueDate: parsedDueDate,
            courseCode: matched?.courseCode || '',
            courseName: matched?.courseName || '',
            departmentId: matched?.departmentId || '',
            departmentName: matched?.departmentName || matched?.department || '',
            yearLevel: resolvedYear,
            section: matched?.section || '',
            academicLevel:
              matched?.academicLevel ||
              (String(resolvedYear).toLowerCase().includes('grade') ? 'SHS' : 'COLLEGE'),
            fineViolations: violations,
            createdBy,
          } satisfies CreatePayablePayload,
        });
        createdCount++;
        totalAssessedAmount += studentTotalFine;
      }
    });
  }

  // Commit batch
  if (writeOps.length > 0) {
    const chunks = [];
    for (let i = 0; i < writeOps.length; i += 500) {
      chunks.push(writeOps.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const op of chunk) {
        if (op.type === 'create') {
          const newDocRef = doc(payablesRef);
          batch.set(newDocRef, buildCanonicalPayableRecord(newDocRef.id, op.data));
        } else if (op.type === 'update' && op.docId) {
          const docRef = doc(payablesRef, op.docId);
          batch.update(docRef, op.data);
        }
      }
      await batch.commit();
    }

    // Update event doc
    try {
      await updateDoc(eventRef, {
        finesAssessed: true,
        finesAssessedAt: serverTimestamp(),
        finesAssessedBy: createdBy,
        finesRuleMatrix: rules,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[generateDynamicEventFines] Could not update event doc fines status:', e);
    }
  }

  return {
    created: createdCount,
    updated: updatedCount,
    skipped: skippedCount,
    totalAmount: totalAssessedAmount,
  };
}

/**
 * Transfer all collected event fines directly into designated target ledger:
 * - Admin/Institutional Event -> /sao_ledger (Institutional Balance)
 * - Officer/Organization Event -> /organization_ledger (Club Balance)
 */
export async function transferEventFinesToBudget(
  eventId: string,
  eventTitle: string,
  isOfficer: boolean,
  orgId?: string | null,
  semesterId?: string
): Promise<{ transferredCount: number; totalAmount: number }> {
  const targetType = isOfficer ? 'org_fine' : 'admin_fine';
  const targetLedger = isOfficer ? 'org' : 'sao';

  const res = await transferCollectionGroupToLedger({
    collectionGroupId: eventId,
    eventId,
    type: targetType,
    organizationId: orgId,
    targetLedger,
    semesterId,
    recordedByUid: isOfficer ? 'Officer' : 'Admin SAO',
    collectionName: `Event Fines — ${eventTitle}`,
  });

  return {
    transferredCount: res.transferredCount,
    totalAmount: res.transferredAmount,
  };
}

/**
 * Dynamically synchronizes missing event payables and membership dues for a student.
 * Useful when a student registers late, is approved to ACTIVE status, or joins a club/department.
 */
export async function syncStudentPayablesForActiveEvents(
  student: {
    id?: string;
    studentId?: string;
    schoolId?: string;
    authUid?: string;
    firstName?: string;
    lastName?: string;
    studentName?: string;
    departmentId?: string;
    courseId?: string;
    courseCode?: string;
    courseName?: string;
    academicLevel?: string;
    section?: string;
    yearLevel?: string;
    schoolYear?: string;
    semester?: string;
  },
  createdBy: string = 'system_sync'
): Promise<number> {
  const studentDocId = resolvePayableStudentUid(student);
  if (!studentDocId) return 0;

  const officialSchoolId = student.studentId || student.schoolId || '';
  const fullName =
    student.studentName ||
    `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
    'Student';
  const studentDeptId = student.departmentId || '';
  const studentCourseId = student.courseId || '';
  const studentCourseCode = student.courseCode || '';
  const studentSection = (student.section || '').trim().toLowerCase();
  const studentYear = student.yearLevel || '';
  const studentSemester = student.semester || '';
  const studentAcademicLevel = student.academicLevel || '';

  let createdCount = 0;

  try {
    // 1. Fetch approved activities (with fallback to legacy events)
    const actSnap = await getDocs(query(collection(db, 'activities'), where('proposalStatus', '==', 'approved')));
    const legacySnap = await getDocs(query(collection(db, 'events'), where('proposalStatus', '==', 'approved')));
    const eventMap = new Map<string, any>();
    legacySnap.docs.forEach((d) => eventMap.set(d.id, { id: d.id, ...d.data() }));
    actSnap.docs.forEach((d) => eventMap.set(d.id, { id: d.id, ...d.data() }));
    const eligibleEvents = Array.from(eventMap.values())
      .filter((event: any) => {
        const feeAmount =
          Number(event.adminFeeOverride) ||
          Number(event.studentContributionRate) ||
          Number(event.suggestedFeePerStudent) ||
          Number(event.feeAmount) ||
          Number(event.fee) ||
          0;
        const isQREnabled = Boolean(
          event.enableQRTickets === true || (event as any).enableQR === true
        );
        const requiresPayment = Boolean(
          (event.studentPayablesEnabled || event.fundingSource === 'student_contributions') &&
            feeAmount > 0
        );
        if (!requiresPayment && !isQREnabled) return false;

        // Semester filter (if event is tied to a specific semester/school year)
        if (event.schoolYear && student.schoolYear && event.schoolYear !== student.schoolYear) {
          return false;
        }
        if (event.semester && studentSemester && event.semester !== studentSemester) {
          return false;
        }

        const targetDeptIds = event.targetDepartmentIds || [];
        const targetYearLevels = event.targetYearLevels || [];
        const targetCourseIds = event.targetCourseIds || event.targetCourses || [];
        const targetSections = (event.targetSections || event.targetSectionNames || []).map((s: string) => String(s).trim().toLowerCase());

        const isAllStudents =
          event.targetAudience === 'all' ||
          !event.targetAudience ||
          (targetDeptIds.length === 0 && targetYearLevels.length === 0 && targetCourseIds.length === 0 && targetSections.length === 0);

        if (isAllStudents) return true;

        const matchesDept =
          targetDeptIds.length === 0 ||
          (studentDeptId && targetDeptIds.includes(studentDeptId));
        
        const matchesCourse =
          targetCourseIds.length === 0 ||
          (studentCourseId && targetCourseIds.includes(studentCourseId)) ||
          (studentCourseCode && targetCourseIds.includes(studentCourseCode));

        const matchesYear =
          targetYearLevels.length === 0 ||
          (studentYear && targetYearLevels.includes(studentYear));

        const matchesSection =
          targetSections.length === 0 ||
          (studentSection && targetSections.includes(studentSection));

        return matchesDept && matchesCourse && matchesYear && matchesSection;
      });

    // 2. Query existing payables for this student to deduplicate
    const payablesRef = collection(db, PAYABLES_COLLECTION);
    const qStudentPayables = query(
      payablesRef,
      where('studentId', 'in', Array.from(new Set([studentDocId, student.id, officialSchoolId].filter(Boolean))))
    );
    const studentPayablesSnap = await getDocs(qStudentPayables);

    const existingEventIds = new Set<string>();
    const existingOrgPayableKeys = new Set<string>();

    studentPayablesSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.eventId) existingEventIds.add(data.eventId);
      if (data.organizationId) {
        if (data.type === 'membership_due') {
          existingOrgPayableKeys.add(`${data.organizationId}::membership_due`);
        }
        if (data.autoRuleId) {
          existingOrgPayableKeys.add(`${data.organizationId}::rule::${data.autoRuleId}`);
        }
        const normLabel = String(data.label || data.title || '').trim().toLowerCase();
        if (normLabel) {
          existingOrgPayableKeys.add(`${data.organizationId}::label::${normLabel}`);
        }
      }
    });

    const newPayablesToCreate: any[] = [];

    for (const evt of eligibleEvents) {
      if (existingEventIds.has(evt.id)) continue;

      const fee =
        Number(evt.adminFeeOverride) ||
        Number(evt.studentContributionRate) ||
        Number(evt.suggestedFeePerStudent) ||
        Number(evt.feeAmount) ||
        Number(evt.fee) ||
        0;

      const isQREnabled = Boolean(
        evt.enableQRTickets === true || (evt as any).enableQR === true
      );
      const requiresPayment = Boolean(
        (evt.studentPayablesEnabled || evt.fundingSource === 'student_contributions') && fee > 0
      );

      if (!requiresPayment && !isQREnabled) continue;

      const eventPayableTitle = requiresPayment
        ? `Event Fee — ${evt.title || 'Event'}`
        : `Event Pass (Free) — ${evt.title || 'Event'}`;
      newPayablesToCreate.push(
        buildCanonicalPayableRecord('', {
          studentId: studentDocId,
          studentName: fullName,
          studentSchoolId: officialSchoolId,
          type: requiresPayment ? 'event_fee' : 'event_pass',
          label: eventPayableTitle,
          title: eventPayableTitle,
          feeTitle: eventPayableTitle,
          eventTitle: evt.title || 'Event',
          category: requiresPayment ? 'Event Fee' : 'Event Pass',
          description: requiresPayment
            ? `Fee for event: ${evt.title || ''}`
            : `Free entry pass with QR ticket access for: ${evt.title || ''}`,
          organizationId:
            evt.hostingOrgId &&
            evt.hostingOrgId !== 'sas_admin' &&
            evt.hostingOrgId !== 'sas' &&
            evt.hostingOrgId !== 'sao_admin' &&
            evt.hostingOrgId !== 'sao'
              ? evt.hostingOrgId
              : null,
          organizationName:
            evt.hostingOrgId === 'sas' || evt.hostingOrgId === 'sas_admin'
              ? 'Student Affairs and Services (SAS)'
              : (evt.hostingOrgName || evt.org || 'SAO Administration'),
          semesterId: evt.semesterId || '',
          semester: evt.semester || studentSemester,
          schoolYear: evt.schoolYear || student.schoolYear || '',
          eventId: evt.id,
          assignedAmount: requiresPayment ? fee : 0,
          status: requiresPayment ? 'pending' : 'paid',
          qrTicketUnlocked: !requiresPayment && isQREnabled,
          dueDate:
            evt.sessions && evt.sessions[0]?.date
              ? new Date(evt.sessions[0].date)
              : null,
          paymentMethod: requiresPayment ? null : 'free_entry',
          courseCode: studentCourseCode,
          courseName: student.courseName || '',
          departmentId: studentDeptId,
          yearLevel: studentYear,
          section: student.section || '',
          academicLevel: studentAcademicLevel || 'COLLEGE',
          createdBy,
        })
      );
      existingEventIds.add(evt.id);
    }

    // 3. Batch commit in chunks of 500
    if (newPayablesToCreate.length > 0) {
      const chunks = [];
      for (let i = 0; i < newPayablesToCreate.length; i += 500) {
        chunks.push(newPayablesToCreate.slice(i, i + 500));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const p of chunk) {
          const newRef = doc(payablesRef);
          batch.set(newRef, { ...p, id: newRef.id, payableId: newRef.id });
          createdCount++;
        }
        await batch.commit();
      }
    }
  } catch (err) {
    console.error('[syncStudentPayablesForActiveEvents] Error syncing payables:', err);
  }

  return createdCount;
}

/**
 * Centralized transfer function: Transfers all collected payments in a collection group to the designated ledger.
 * - If targetLedger === 'sao' -> credits /sao_ledger
 * - If targetLedger === 'org' -> credits /organization_ledger
 * 
 * Atomically marks payables as transferredToBudget: true, transferredAt: serverTimestamp(), transferredBatchId: batchId.
 * Guarantees zero ghost money: only strictly sums paidAmount of records with paidAmount > 0 and status === 'paid'.
 */
export async function transferCollectionGroupToLedger(params: {
  collectionGroupId: string;
  eventId?: string | null;
  type?: PayableType;
  organizationId?: string | null;
  targetLedger: 'sao' | 'org';
  semesterId?: string | null;
  recordedByUid?: string;
  collectionName?: string;
  payableIds?: string[];
}): Promise<{ transferredCount: number; transferredAmount: number }> {
  const {
    collectionGroupId,
    eventId,
    type,
    organizationId,
    targetLedger,
    semesterId,
    recordedByUid,
    collectionName,
    payableIds,
  } = params;

  const payablesRef = collection(db, PAYABLES_COLLECTION);
  let eligibleDocs: any[] = [];

  if (payableIds && payableIds.length > 0) {
    // Fetch directly by document IDs for precision
    const fetchedDocs = await Promise.all(
      payableIds.map((id) => getDoc(doc(payablesRef, id)))
    );
    eligibleDocs = fetchedDocs
      .filter((d) => d.exists())
      .filter((d) => {
        const data = d.data()!;
        const st = String(data.status || '').toLowerCase();
        if (st === 'refund_pending' || st === 'refunded' || st === 'waived' || st === 'cancelled') {
          return false;
        }
        const isPaidStatus = st === 'paid';
        const hasPaid = (Number(data.paidAmount) || 0) > 0;
        const assignedAmt = Number(data.assignedAmount) || 0;
        const effectivePaid = hasPaid ? Number(data.paidAmount) : (isPaidStatus ? assignedAmt : 0);
        const alreadyTransferred = typeof data.transferredAmount === 'number'
          ? Math.max(0, data.transferredAmount)
          : (data.transferredToBudget ? effectivePaid : 0);
        const untransferredDelta = Math.max(0, effectivePaid - alreadyTransferred);
        return untransferredDelta > 0;
      }) as any;
  } else {
    let qDocs;
    if (eventId && eventId !== 'unassigned') {
      if (type) {
        qDocs = query(
          payablesRef,
          where('eventId', '==', eventId),
          where('type', '==', type)
        );
      } else {
        qDocs = query(payablesRef, where('eventId', '==', eventId));
      }
    } else if (organizationId && type === 'membership_due') {
      qDocs = query(
        payablesRef,
        where('organizationId', '==', organizationId),
        where('type', '==', 'membership_due')
      );
    } else if (organizationId) {
      qDocs = query(payablesRef, where('organizationId', '==', organizationId));
    } else if (type) {
      qDocs = query(payablesRef, where('type', '==', type));
    } else {
      qDocs = query(payablesRef, where('type', 'in', ['admin_fine', 'event_fee', 'custom']));
    }

    const snap = await getDocs(qDocs);
    eligibleDocs = snap.docs.filter((d) => {
      const data = d.data();
      const st = String(data.status || '').toLowerCase();
      if (st === 'refund_pending' || st === 'refunded' || st === 'waived' || st === 'cancelled') {
        return false;
      }
      const isPaidStatus = st === 'paid';
      const hasPaid = (Number(data.paidAmount) || 0) > 0;
      const assignedAmt = Number(data.assignedAmount) || 0;
      const effectivePaid = hasPaid ? Number(data.paidAmount) : (isPaidStatus ? assignedAmt : 0);
      const alreadyTransferred = typeof data.transferredAmount === 'number'
        ? Math.max(0, data.transferredAmount)
        : (data.transferredToBudget ? effectivePaid : 0);
      const untransferredDelta = Math.max(0, effectivePaid - alreadyTransferred);
      return untransferredDelta > 0;
    });
  }

  // Fallback: If no docs matched query, check if collectionGroupId is a direct payable document ID
  if (eligibleDocs.length === 0 && collectionGroupId && collectionGroupId !== 'unassigned') {
    try {
      const singleDocRef = doc(payablesRef, collectionGroupId);
      const singleSnap = await getDoc(singleDocRef);
      if (singleSnap.exists()) {
        const sData = singleSnap.data();
        const st = String(sData.status || '').toLowerCase();
        if (st === 'refund_pending' || st === 'refunded' || st === 'waived' || st === 'cancelled') {
          return { transferredCount: 0, transferredAmount: 0 };
        }
        const isPaidStatus = st === 'paid';
        const hasPaid = (Number(sData.paidAmount) || 0) > 0;
        const assignedAmt = Number(sData.assignedAmount) || 0;
        const effectivePaid = hasPaid ? Number(sData.paidAmount) : (isPaidStatus ? assignedAmt : 0);
        const alreadyTransferred = typeof sData.transferredAmount === 'number'
          ? Math.max(0, sData.transferredAmount)
          : (sData.transferredToBudget ? effectivePaid : 0);
        const untransferredDelta = Math.max(0, effectivePaid - alreadyTransferred);
        if (untransferredDelta > 0) {
          eligibleDocs = [singleSnap as any];
        }
      }
    } catch (e) {
      console.warn('[transferCollectionGroupToLedger] singleDoc lookup error:', e);
    }
  }

  if (eligibleDocs.length === 0) {
    return { transferredCount: 0, transferredAmount: 0 };
  }

  const totalTransferDelta = eligibleDocs.reduce((sum, d) => {
    const data = d.data();
    const isPaidStatus = String(data.status || '').toLowerCase() === 'paid';
    const hasPaid = (Number(data.paidAmount) || 0) > 0;
    const assignedAmt = Number(data.assignedAmount) || 0;
    const effectivePaid = hasPaid ? Number(data.paidAmount) : (isPaidStatus ? assignedAmt : 0);
    const alreadyTransferred = typeof data.transferredAmount === 'number'
      ? Math.max(0, data.transferredAmount)
      : (data.transferredToBudget ? effectivePaid : 0);
    const untransferredDelta = Math.max(0, effectivePaid - alreadyTransferred);
    return sum + untransferredDelta;
  }, 0);

  const batchId = `TRANS-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Batch commit in chunks of 500
  const chunks = [];
  for (let i = 0; i < eligibleDocs.length; i += 500) {
    chunks.push(eligibleDocs.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const docSnap of chunk) {
      const dData = docSnap.data();
      const isPaidStatus = String(dData.status || '').toLowerCase() === 'paid';
      const hasPaid = (Number(dData.paidAmount) || 0) > 0;
      const assignedAmt = Number(dData.assignedAmount) || 0;
      const effectivePaid = hasPaid ? Number(dData.paidAmount) : (isPaidStatus ? assignedAmt : 0);

      batch.update(docSnap.ref, {
        paidAmount: effectivePaid,
        transferredAmount: effectivePaid,
        transferredToBudget: true,
        transferredAt: serverTimestamp(),
        transferredBatchId: batchId,
        status: 'paid',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  // Insert ledger income entry
  const displayTitle = collectionName || (eventId ? `Event Collection (${eventId})` : 'Student Collection');
  if (targetLedger === 'org' && organizationId) {
    await addDoc(collection(db, 'organization_ledger'), {
      organizationId,
      semesterId: semesterId || null,
      date: Timestamp.now(),
      description: `Student Collections – ${displayTitle}`,
      eventId: eventId && eventId !== 'unassigned' ? eventId : null,
      type: 'income' as const,
      source: 'student_collection' as const,
      amount: totalTransferDelta,
      addedBy: recordedByUid || 'Officer',
      collectionId: batchId,
      createdAt: serverTimestamp(),
    });
  } else {
    await addDoc(collection(db, 'sao_ledger'), {
      semesterId: semesterId || null,
      date: Timestamp.now(),
      description: `Student Collections – ${displayTitle}`,
      eventId: eventId && eventId !== 'unassigned' ? eventId : null,
      type: 'income' as const,
      source: 'student_collection' as const,
      amount: totalTransferDelta,
      addedBy: recordedByUid || 'Admin SAO',
      collectionId: batchId,
      createdAt: serverTimestamp(),
    });
  }

  // Mirror revenue into persistent SAO Retained Student Activity Fund for SAS collections only
  // (Organizations use organization_ledger as their single unified Club Treasury)
  if (targetLedger !== 'org') {
    try {
      const { creditRetainedFundOnCollection } = await import('./retained-fund.service');
      await creditRetainedFundOnCollection({
        collectionId: batchId,
        amount: totalTransferDelta,
        organizationId: 'sas',
        eventId: eventId && eventId !== 'unassigned' ? eventId : undefined,
        eventTitle: displayTitle,
        description: `Student Contribution Collection – ${displayTitle}`,
        performedBy: recordedByUid || 'SAO Admin',
      });
    } catch (retErr) {
      console.warn('[transferCollectionGroupToLedger] Retained fund credit warning:', retErr);
    }
  }

  if (eventId && eventId !== 'unassigned') {
    await syncEventContributionCollectionSnapshot(eventId);
  }

  return {
    transferredCount: eligibleDocs.length,
    transferredAmount: totalTransferDelta,
  };
}

export interface ProcessPayableRefundParams extends ProcessRefundPayload {
  actorRole?: 'admin' | 'officer';
  actorOrgId?: string | null;
}

/**
 * Atomically processes a student refund for a payable.
 * - Enforces zero ghost money by debiting ledger if funds were previously transferred to treasury.
 * - Prevents double-refunding and validates non-zero refundable balance.
 * - Strictly enforces officer vs admin organization boundaries.
 */
export async function processPayableRefund(params: ProcessPayableRefundParams): Promise<{
  payableId: string;
  studentName: string;
  refundedAmount: number;
  ledgerAdjusted: boolean;
}> {
  const {
    payableId,
    refundedAmount,
    refundedBy,
    refundedByName,
    refundMethod = 'cash',
    receiptNumber,
    refundNotes,
    actorRole,
    actorOrgId,
  } = params;

  if (!payableId) {
    throw new Error('Payable ID is required for refund processing.');
  }

  const payableRef = doc(db, PAYABLES_COLLECTION, payableId);

  return await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(payableRef);
    if (!snap.exists()) {
      throw new Error(`Payable with ID "${payableId}" does not exist.`);
    }

    const data = snap.data() as PayableDocument;

    // 1. Guard against double-refunding
    if (data.status === 'refunded') {
      throw new Error(`This payable for ${data.studentName || 'student'} has already been refunded.`);
    }

    // 2. Strict Role & Ownership boundary
    if (actorRole === 'officer') {
      if (data.organizationId && actorOrgId && data.organizationId !== actorOrgId) {
        throw new Error('Unauthorized: You can only process refunds for events hosted by your own organization.');
      }
    }

    // 3. Amount verification (no ghost money)
    const paidAmt = Number(data.paidAmount || 0);
    const refundDue = typeof data.refundDue === 'number' ? data.refundDue : paidAmt;
    const maxRefundable = Math.max(0, Math.min(paidAmt > 0 ? paidAmt : refundDue, refundDue > 0 ? refundDue : paidAmt));

    if (maxRefundable <= 0) {
      throw new Error('This payable has no refundable balance (paid amount is 0).');
    }

    const requestedRefund = Number(refundedAmount);
    if (isNaN(requestedRefund) || requestedRefund <= 0) {
      throw new Error('Please enter a valid positive refund amount.');
    }

    if (requestedRefund > maxRefundable) {
      throw new Error(`Refund amount (₱${requestedRefund.toFixed(2)}) cannot exceed refundable balance (₱${maxRefundable.toFixed(2)}).`);
    }

    const now = Timestamp.now();
    const actorName = refundedByName || (actorRole === 'admin' ? 'SAO Admin' : 'Student Officer');

    // 4. Zero ghost money: If this payable was already transferred to the ledger, record an offsetting expense
    const transferredAmt = Number(data.transferredAmount || 0);
    const wasTransferred = data.transferredToBudget === true || transferredAmt > 0;
    const ledgerDebit = Math.min(transferredAmt, requestedRefund);

    if (wasTransferred && ledgerDebit > 0) {
      if (data.organizationId) {
        const orgLedgerRef = doc(collection(db, 'organization_ledger'));
        transaction.set(orgLedgerRef, {
          organizationId: data.organizationId,
          semesterId: data.semesterId || null,
          date: now,
          description: `Student Refund – ${data.label || 'Event Fee'} (${data.studentName || data.studentSchoolId})`,
          eventId: data.eventId || null,
          type: 'expense' as const,
          source: 'student_refund' as const,
          amount: ledgerDebit,
          addedBy: actorName,
          payableId: data.id,
          receiptNumber: receiptNumber || null,
          notes: refundNotes || `Event cancellation refund disbursed via ${refundMethod}`,
          createdAt: serverTimestamp(),
        });
      } else {
        const saoLedgerRef = doc(collection(db, 'sao_ledger'));
        transaction.set(saoLedgerRef, {
          semesterId: data.semesterId || null,
          date: now,
          description: `Student Refund – ${data.label || 'Event Fee'} (${data.studentName || data.studentSchoolId})`,
          eventId: data.eventId || null,
          type: 'expense' as const,
          source: 'student_refund' as const,
          amount: ledgerDebit,
          addedBy: actorName,
          payableId: data.id,
          receiptNumber: receiptNumber || null,
          notes: refundNotes || `Event cancellation refund disbursed via ${refundMethod}`,
          createdAt: serverTimestamp(),
        });
      }
    }

    // 5. Update payable document
    const newTransferredAmount = Math.max(0, transferredAmt - ledgerDebit);
    transaction.update(payableRef, {
      status: 'refunded' as PayableStatus,
      paymentStatus: 'REFUNDED',
      balance: 0,
      refundedAmount: requestedRefund,
      refundedAt: now,
      refundedBy,
      refundedByName: actorName,
      refundMethod,
      refundNotes: refundNotes || null,
      receiptNumber: receiptNumber || null,
      transferredAmount: newTransferredAmount,
      transferredToBudget: newTransferredAmount > 0,
      qrTicketUnlocked: false,
      updatedAt: serverTimestamp(),
    });

    // 6. Audit log entry
    const auditRef = doc(collection(db, 'audit_logs'));
    transaction.set(auditRef, {
      action: 'PROCESS_STUDENT_REFUND',
      entity: 'payable',
      entityId: data.id,
      details: `Processed refund of ₱${requestedRefund.toFixed(2)} to ${data.studentName || data.studentSchoolId} via ${refundMethod}. By ${actorName}.`,
      actorId: refundedBy,
      actorName,
      actorRole: actorRole || 'user',
      metadata: {
        payableId: data.id,
        eventId: data.eventId,
        organizationId: data.organizationId,
        studentSchoolId: data.studentSchoolId,
        refundedAmount: requestedRefund,
        refundMethod,
        receiptNumber: receiptNumber || null,
        ledgerAdjusted: wasTransferred && ledgerDebit > 0,
      },
      timestamp: now,
    });

    return {
      payableId: data.id,
      studentName: data.studentName || data.studentSchoolId,
      refundedAmount: requestedRefund,
      ledgerAdjusted: wasTransferred && ledgerDebit > 0,
    };
  });
}

export interface CashierContributionUploadItem {
  payableId: string;
  paidAmount: number;
  orNumber?: string;
  paidDate?: string;
}

export interface CashierUploadReceiptProof {
  url: string;
  fileName: string;
  fileType: string;
}

/**
 * Recomputes live Student Contribution collection totals for an activity and propagates recovery
 * progress onto the event document and any recovering Financial Liquidation report.
 */
export async function syncEventContributionCollectionSnapshot(
  eventId: string,
  batchEntry?: {
    batchId: string;
    uploadedAt: string;
    uploadedByUid: string;
    uploadedByName: string;
    paidCount: number;
    amountCollected: number;
    batchReferenceNo?: string;
    receiptProof?: CashierUploadReceiptProof | null;
  }
): Promise<{ totalCollected: number; totalProjected: number; uncollectedReceivables: number }> {
  const payablesSnap = await getDocs(
    query(collection(db, PAYABLES_COLLECTION), where('eventId', '==', eventId))
  );

  let totalCollected = 0;
  let totalProjected = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  payablesSnap.docs.forEach((d) => {
    const p = d.data() as any;
    const st = String(p.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'waived' || st === 'refunded') return;
    const assigned = Math.max(0, Number(p.assignedAmount) || 0);
    totalProjected += assigned;
    if (st === 'paid') {
      paidCount++;
      totalCollected += Math.max(0, Number(p.paidAmount) || assigned);
    } else {
      unpaidCount++;
    }
  });

  totalCollected = Math.round(totalCollected * 100) / 100;
  totalProjected = Math.round(totalProjected * 100) / 100;
  const uncollectedReceivables = Math.max(0, Math.round((totalProjected - totalCollected) * 100) / 100);

  const eventSnapshotUpdate: Record<string, any> = {
    totalContributionCollected: totalCollected,
    totalContributionProjected: totalProjected,
    uncollectedReceivables,
    contributionPaidCount: paidCount,
    contributionUnpaidCount: unpaidCount,
    lastCashierSyncAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };

  if (batchEntry) {
    eventSnapshotUpdate.contributionUploadHistory = arrayUnion(batchEntry);
  }

  for (const colName of ['activities', 'events', 'activity_proposals']) {
    try {
      const targetRef = doc(db, colName, eventId);
      const snap = await getDoc(targetRef);
      if (snap.exists()) {
        await updateDoc(targetRef, eventSnapshotUpdate);
      }
    } catch (syncErr) {
      console.warn(`[syncEventContributionCollectionSnapshot] ${colName} update note:`, syncErr);
    }
  }

  // Update collection recovery progress on linked Financial Liquidation reports
  try {
    const actSnap = await getDoc(doc(db, 'activities', eventId));
    const actData = actSnap.exists() ? (actSnap.data() as any) : {};
    const retainedTopUp = (Array.isArray(actData.allocations) ? actData.allocations : [])
      .filter((a: any) => a.fundType === 'student_contribution_retained')
      .reduce((s: number, a: any) => s + (Number(a.allocatedAmount) || 0), 0);

    const liqSnap = await getDocs(
      query(collection(db, 'liquidations'), where('eventId', '==', eventId))
    );

    for (const lDoc of liqSnap.docs) {
      const lData = lDoc.data() as any;
      if (lData.status === 'voided' || lData.isDeleted === true) continue;
      if ((lData.fundingSource || actData.fundingSource) !== 'student_contributions') continue;

      const actualSpent = Number(lData.totalActualSpending) || 0;
      const availableCoverage = Math.round((totalCollected + retainedTopUp) * 100) / 100;
      const collectionDeficitAmount = Math.max(0, Math.round((actualSpent - availableCoverage) * 100) / 100);
      const prevStatus = lData.collectionSettlementStatus;
      const nextCollectionStatus =
        prevStatus === 'deficit_absorbed'
          ? 'deficit_absorbed'
          : collectionDeficitAmount > 0.009
          ? 'deficit_recovering'
          : 'fully_recovered';

      await updateDoc(lDoc.ref, {
        totalProjectedCollection: totalProjected,
        totalCollectedAtLiquidation: totalCollected,
        uncollectedReceivablesAtLiquidation: uncollectedReceivables,
        collectionDeficitAmount,
        collectionSettlementStatus: nextCollectionStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (liqErr) {
    console.warn('[syncEventContributionCollectionSnapshot] Liquidation recovery update note:', liqErr);
  }

  return { totalCollected, totalProjected, uncollectedReceivables };
}

/**
 * Batch-marks matched Student Contribution / Event Payables as PAID from an uploaded Cashier report,
 * unlocks mobile QR tickets immediately, and credits total collected funds into sao_ledger + SAO_CAMPUS.
 */
export async function applyCashierContributionPayments(params: {
  eventId: string;
  eventTitle: string;
  semesterId?: string | null;
  schoolYear?: string;
  semester?: string;
  items: CashierContributionUploadItem[];
  recordedByUid: string;
  recordedByName: string;
  batchReferenceNo?: string;
  receiptProof?: CashierUploadReceiptProof | null;
}): Promise<{
  updatedCount: number;
  totalCollectedAmount: number;
  batchId: string;
  routedToRetainedFund: boolean;
}> {
  const {
    eventId,
    eventTitle,
    semesterId,
    schoolYear,
    semester,
    items,
    recordedByUid,
    recordedByName,
    batchReferenceNo,
    receiptProof,
  } = params;

  if (!eventId || items.length === 0) {
    return { updatedCount: 0, totalCollectedAmount: 0, batchId: '', routedToRetainedFund: false };
  }

  const batchId = `CASHIER-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const nowTs = Timestamp.now();

  const updatedEntries: Array<{
    ref: any;
    paidAmount: number;
    orNumber: string;
    paidAt: Timestamp;
    addedAmount: number;
  }> = [];

  for (const item of items) {
    const pRef = doc(db, PAYABLES_COLLECTION, item.payableId);
    const snap = await getDoc(pRef);
    if (!snap.exists()) continue;
    const pData = snap.data() as any;
    const st = String(pData.status || '').toLowerCase();
    if (st === 'paid' || st === 'waived' || st === 'refunded' || st === 'cancelled') {
      continue;
    }

    const assignedAmt = Number(pData.assignedAmount) || 0;
    const effectivePaid = Math.max(0, Number(item.paidAmount) || assignedAmt);
    if (effectivePaid <= 0) continue;

    const alreadyTransferred = Math.max(0, Number(pData.transferredAmount) || 0);
    const deltaToCredit = Math.max(0, effectivePaid - alreadyTransferred);

    let paidAtTs = nowTs;
    if (item.paidDate) {
      const parsed = new Date(item.paidDate);
      if (!isNaN(parsed.getTime())) {
        paidAtTs = Timestamp.fromDate(parsed);
      }
    }

    updatedEntries.push({
      ref: pRef,
      paidAmount: effectivePaid,
      orNumber: (item.orNumber || batchReferenceNo || '').trim(),
      paidAt: paidAtTs,
      addedAmount: deltaToCredit,
    });
  }

  if (updatedEntries.length === 0) {
    return { updatedCount: 0, totalCollectedAmount: 0, batchId: '', routedToRetainedFund: false };
  }

  for (let i = 0; i < updatedEntries.length; i += 450) {
    const chunk = updatedEntries.slice(i, i + 450);
    const batch = writeBatch(db);
    for (const entry of chunk) {
      batch.update(entry.ref, {
        status: 'paid',
        paymentStatus: 'PAID',
        paidAmount: entry.paidAmount,
        balance: 0,
        paymentMethod: 'cashier_upload',
        orNumber: entry.orNumber || null,
        receiptNumber: entry.orNumber || null,
        cashierBatchReceiptUrl: receiptProof?.url || null,
        paidAt: entry.paidAt,
        recordedBy: recordedByUid,
        recordedByName: recordedByName || 'SAS Admin',
        qrTicketUnlocked: true,
        transferredToBudget: true,
        transferredAmount: entry.paidAmount,
        transferredAt: serverTimestamp(),
        transferredBatchId: batchId,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  const totalCollectedAmount = Math.round(
    updatedEntries.reduce((sum, e) => sum + e.addedAmount, 0) * 100
  ) / 100;

  // Check if this activity's Financial Liquidation has already been approved & settled:
  // - Before liquidation settlement: funds stay as active activity cash-on-hand (avoids double-counting when surplus returns).
  // - After liquidation settlement (extra Cashier collection while activity is still open): credit directly to SAS Student Contribution & Retained Funds!
  let isLiquidationSettled = false;
  try {
    const liqSnap = await getDocs(
      query(collection(db, 'liquidations'), where('eventId', '==', eventId))
    );
    isLiquidationSettled = liqSnap.docs.some((d) => {
      const ld = d.data() as any;
      if (ld.isDeleted || ld.status === 'voided' || ld.status !== 'approved') return false;
      const variance = Number(
        ld.surplusOrDeficit ?? ((ld.allocatedBudget ?? 0) - (ld.totalActualSpending ?? 0))
      ) || 0;
      return (
        ld.cashierSettlementStatus === 'verified' ||
        ld.cashierSettlementStatus === 'not_required' ||
        Math.abs(variance) < 0.01
      );
    });
  } catch (liqErr) {
    console.warn('[applyCashierContributionPayments] Liquidation settlement lookup note:', liqErr);
  }

  let routedToRetainedFund = false;
  if (totalCollectedAmount > 0) {
    await addDoc(collection(db, 'sao_ledger'), {
      semesterId: semesterId || null,
      date: nowTs,
      description: isLiquidationSettled
        ? `Post-Liquidation Extra Cashier Collection (${updatedEntries.length} student${updatedEntries.length === 1 ? '' : 's'}) – ${eventTitle}`
        : `Cashier Student Contribution Upload (${updatedEntries.length} student${updatedEntries.length === 1 ? '' : 's'}) – ${eventTitle}`,
      eventId,
      type: 'income' as const,
      source: 'student_collection' as const,
      fundCategory: 'retained_student_activity_fund',
      amount: totalCollectedAmount,
      addedBy: recordedByName || recordedByUid || 'SAS Admin',
      collectionId: batchId,
      batchReferenceNo: batchReferenceNo || null,
      receiptProofUrl: receiptProof?.url || null,
      createdAt: serverTimestamp(),
    });

    if (isLiquidationSettled) {
      try {
        const { creditRetainedFundOnCollection } = await import('./retained-fund.service');
        await creditRetainedFundOnCollection({
          collectionId: batchId,
          amount: totalCollectedAmount,
          organizationId: 'sas',
          eventId,
          eventTitle,
          schoolYear,
          semester,
          description: `Extra Cashier Collection (Post-Liquidation • ${updatedEntries.length} paid) – ${eventTitle}`,
          performedBy: recordedByName || recordedByUid || 'SAS Admin',
        });
        routedToRetainedFund = true;
      } catch (retErr) {
        console.warn('[applyCashierContributionPayments] SAO retained credit warning:', retErr);
      }
    }
  }

  await syncEventContributionCollectionSnapshot(eventId, {
    batchId,
    uploadedAt: new Date().toISOString(),
    uploadedByUid: recordedByUid,
    uploadedByName: recordedByName || 'SAS Admin',
    paidCount: updatedEntries.length,
    amountCollected: totalCollectedAmount,
    batchReferenceNo: batchReferenceNo?.trim() || undefined,
    receiptProof: receiptProof || null,
  });

  return {
    updatedCount: updatedEntries.length,
    totalCollectedAmount,
    batchId,
    routedToRetainedFund,
  };
}
