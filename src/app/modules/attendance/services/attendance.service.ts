import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import { STUDENTS_COLLECTION } from '../../students/services/student.service';
import type { AttendanceRecord, AttendanceStatus } from '../types/attendance.types';
import {
  buildDeterministicAttendanceDocId,
  buildCanonicalAttendanceLookup,
  extractStudentMatchKeys,
  isRealAttendanceTime,
  resolveMergedAttendanceStatus,
  resolveAnticipatedParticipantsForEvent,
  isStudentTargetedForEvent,
  mergeAttendanceRecordsForRoster,
  isAttendedStatus,
  dedupeActiveStudents,
} from '../utils/attendance-sync.utils';

export {
  buildDeterministicAttendanceDocId,
  buildCanonicalAttendanceLookup,
  extractStudentMatchKeys,
  isRealAttendanceTime,
  resolveMergedAttendanceStatus,
  resolveAnticipatedParticipantsForEvent,
  isStudentTargetedForEvent,
  mergeAttendanceRecordsForRoster,
  isAttendedStatus,
  dedupeActiveStudents,
};

export const ATTENDANCE_COLLECTION = 'attendance';

export const createAttendanceRecord = async (
  data: Omit<AttendanceRecord, 'id' | 'createdAt'>
): Promise<string> => {
  const docRef = await addDoc(collection(db, ATTENDANCE_COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

/**
 * Checks if a session's check-in scanning window or start time cutoff has passed.
 */
export function isSessionCheckInPassed(
  session: {
    date?: string;
    startTime?: string;
    endTime?: string;
    timeInClose?: string;
    timeOutClose?: string;
  },
  graceMinutes = 15,
  lateThresholdMinutes = 60
): boolean {
  if (!session || !session.date || session.date === 'TBA' || session.date === 'TBD') {
    return false;
  }

  const dateStr = session.date.trim();
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return false;

  const [_, yStr, mStr, dStr] = dateMatch;
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1;
  const day = parseInt(dStr, 10);

  const now = new Date();

  // 1. If explicit timeInClose is specified (e.g. "00:20")
  if (session.timeInClose) {
    const [ch, cm] = session.timeInClose.split(':').map(Number);
    if (!isNaN(ch) && !isNaN(cm)) {
      const closeDate = new Date(year, month, day, ch, cm, 0);
      return now.getTime() >= closeDate.getTime();
    }
  }

  // 2. If session has startTime, check startTime + lateThresholdMinutes
  if (session.startTime) {
    const [sh, sm] = session.startTime.split(':').map(Number);
    if (!isNaN(sh) && !isNaN(sm)) {
      const totalMinutes = sh * 60 + sm + (lateThresholdMinutes || 60);
      const closeH = Math.floor(totalMinutes / 60);
      const closeM = totalMinutes % 60;
      const closeDate = new Date(year, month, day, closeH, closeM, 0);
      return now.getTime() >= closeDate.getTime();
    }
  }

  // 3. If session has endTime, check endTime
  if (session.endTime) {
    const [eh, em] = session.endTime.split(':').map(Number);
    if (!isNaN(eh) && !isNaN(em)) {
      const closeDate = new Date(year, month, day, eh, em, 0);
      return now.getTime() >= closeDate.getTime();
    }
  }

  // 4. Default: check if the session day has completed
  const endOfDay = new Date(year, month, day, 23, 59, 59);
  return now.getTime() >= endOfDay.getTime();
}

const reconciledSeedCache = new Map<string, string>();
const inFlightEventSeedKeys = new Set<string>();

/**
 * Resolves anticipated participants and idempotently pre-seeds default `Absent`
 * attendance documents in `/attendance` (using deterministic document IDs) across
 * all configured sessions—before, during, and after the event.
 */
export async function seedDefaultAbsentAttendanceForEvent(
  event: any,
  eligibleStudents: any[],
  options?: {
    markTimeFieldsAbsent?: boolean;
    seedUpcomingAndOngoing?: boolean;
    preFetchedAttendanceDocs?: AttendanceRecord[];
  }
): Promise<number> {
  if (!event || !event.id || !eligibleStudents || eligibleStudents.length === 0) return 0;

  const sessions =
    Array.isArray(event.sessions) && event.sessions.length > 0
      ? event.sessions
      : [
          {
            id: `${event.id}-main`,
            title: 'Main Session',
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
          },
        ];

  const seedAllTimingStates = options?.seedUpcomingAndOngoing !== false;
  const isEventCompleted =
    String(event.proposalStatus || '').toLowerCase() === 'completed' ||
    String(event.status || '').toLowerCase() === 'completed' ||
    String((event as any).lifecycleStatus || '').toLowerCase() === 'completed';

  const markAbsentTime = Boolean(options?.markTimeFieldsAbsent || isEventCompleted);
  const syncLockKey = `${event.id}::${sessions.map((s: any, i: number) => s.id || `session-${i}`).join(',')}::${eligibleStudents.length}::${markAbsentTime ? 'closed' : 'open'}`;
  if (inFlightEventSeedKeys.has(syncLockKey)) return 0;
  inFlightEventSeedKeys.add(syncLockKey);

  try {
    // 1. Fetch existing attendance docs across top-level and event subcollections
    const existingRecords: AttendanceRecord[] = Array.isArray(options?.preFetchedAttendanceDocs)
      ? [...options.preFetchedAttendanceDocs]
      : [];
    const existingDocIds = new Set<string>(existingRecords.map((r) => r.id));

    const [topSnap, eventsSubSnap, activitiesSubSnap] = await Promise.all([
      getDocs(query(collection(db, ATTENDANCE_COLLECTION), where('eventId', '==', event.id))).catch(
        () => null
      ),
      getDocs(collection(db, 'events', event.id, ATTENDANCE_COLLECTION)).catch(() => null),
      getDocs(collection(db, 'activities', event.id, ATTENDANCE_COLLECTION)).catch(() => null),
    ]);

    for (const snap of [topSnap, eventsSubSnap, activitiesSubSnap]) {
      if (!snap) continue;
      snap.docs.forEach((d) => {
        existingDocIds.add(d.id);
        existingRecords.push({ id: d.id, ...(d.data() as any) } as AttendanceRecord);
      });
    }

    const canonicalLookup = buildCanonicalAttendanceLookup(eligibleStudents);
    const pendingWrites: Array<{ docId: string; payload: Record<string, any> }> = [];

    sessions.forEach((session: any, sIdx: number) => {
      const sId = session.id || `session-${sIdx}`;
      const isPassed =
        isEventCompleted ||
        isSessionCheckInPassed(session, event.gracePeriodMinutes, event.lateThresholdMinutes);

      if (!seedAllTimingStates && !isPassed) {
        return;
      }

      const sessionTitle = session.title || session.name || `Session ${sIdx + 1}`;
      const useAbsentTextForTime = Boolean(options?.markTimeFieldsAbsent || isEventCompleted);

      eligibleStudents.forEach((student) => {
        const studentKeys = extractStudentMatchKeys(student);
        const studentSchoolId = String(student.studentId || student.schoolId || '').trim();
        const studentAuthUid = String(student.authUid || student.id || '').trim();
        const primaryKey = (studentSchoolId || studentAuthUid || studentKeys[0] || '').trim();
        if (!primaryKey) return;

        const detDocId = buildDeterministicAttendanceDocId(event.id, sId, primaryKey);

        const alreadyHasDoc =
          existingDocIds.has(detDocId) ||
          existingRecords.some((r) => {
            const rSession = r.sessionId || `${event.id}-main`;
            const matchSession =
              rSession === sId ||
              (!r.sessionId && sIdx === 0) ||
              (rSession === `${event.id}-main` && sIdx === 0);
            if (!matchSession) return false;

            const recKeys = extractStudentMatchKeys(r);
            return recKeys.some(
              (rk) =>
                studentKeys.includes(rk) ||
                (canonicalLookup.get(rk) &&
                  studentKeys.includes(canonicalLookup.get(rk)!))
            );
          });

        if (!alreadyHasDoc) {
          existingDocIds.add(detDocId);
          pendingWrites.push({
            docId: detDocId,
            payload: sanitizeFirestorePayload({
              eventId: event.id,
              event: event.title || event.name || 'Event',
              organizationId: event.hostingOrgId || event.organizationId || 'sas',
              org: event.hostingOrgName || event.hostingOrgId || 'SAS',
              sessionId: sId,
              sessionTitle,
              studentId: studentSchoolId || studentAuthUid,
              studentNumber: studentSchoolId || undefined,
              studentSchoolId: studentSchoolId || undefined,
              studentAuthUid: studentAuthUid || undefined,
              name:
                `${student.firstName || ''} ${student.lastName || ''}`.trim() ||
                student.studentName ||
                'Student',
              courseCode: student.courseCode || '',
              section: student.section || '',
              yearLevel: student.yearLevel || '',
              checkIn: useAbsentTextForTime ? 'Absent' : '—',
              checkOut: useAbsentTextForTime ? 'Absent' : '—',
              status: 'Absent' as AttendanceStatus,
              isDefaultAbsentSeed: true,
              syncedFromMobile: false,
            }),
          });
        }
      });
    });

    if (pendingWrites.length === 0) return 0;

    const CHUNK_SIZE = 450;
    for (let i = 0; i < pendingWrites.length; i += CHUNK_SIZE) {
      const chunk = pendingWrites.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(({ docId, payload }) => {
        const docRef = doc(db, ATTENDANCE_COLLECTION, docId);
        batch.set(
          docRef,
          {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    return pendingWrites.length;
  } finally {
    inFlightEventSeedKeys.delete(syncLockKey);
  }
}

/**
 * Backward-compatible alias preserved for existing callers.
 */
export async function syncEventAbsenteeRecords(
  event: any,
  eligibleStudents: any[],
  options?: { markTimeFieldsAbsent?: boolean; preFetchedAttendanceDocs?: AttendanceRecord[] }
): Promise<number> {
  return seedDefaultAbsentAttendanceForEvent(event, eligibleStudents, {
    ...options,
    seedUpcomingAndOngoing: true,
  });
}

/**
 * Upgrades pre-seeded default `Absent` documents in top-level `/attendance`
 * whenever incoming mobile scans (from `/events/{id}/attendance`, `/activities/{id}/attendance`,
 * or separate `/attendance` scan documents) are detected for the same student & session.
 * Ensures Firestore state reflects `Present` / `Late` / `Complete` / `Checked Out` + Time-In/Time-Out
 * across Student Details, PAR Bridge, Signatory View, Fines, and Certificates.
 */
export async function reconcileMobileScansWithAbsentSeeds(
  event: any,
  allAttendanceRecords: AttendanceRecord[],
  students: any[] = []
): Promise<number> {
  if (!event?.id || !Array.isArray(allAttendanceRecords) || allAttendanceRecords.length === 0) {
    return 0;
  }

  const eventRecords = allAttendanceRecords.filter(
    (r) =>
      r.eventId === event.id ||
      (r.event && event.title && String(r.event).trim().toLowerCase() === String(event.title).trim().toLowerCase())
  );
  if (eventRecords.length === 0) return 0;

  const canonicalLookup = buildCanonicalAttendanceLookup(students);
  const resolveKey = (r: AttendanceRecord) => {
    const keys = extractStudentMatchKeys(r);
    for (const k of keys) {
      const c = canonicalLookup.get(k);
      if (c) return c;
    }
    return keys[0] || String(r.id || '').trim().toLowerCase();
  };

  // Group raw records by (session, canonicalStudent)
  const grouped = new Map<string, AttendanceRecord[]>();
  eventRecords.forEach((r) => {
    const sessKey = String(r.sessionId || `${event.id}-main`).trim().toLowerCase();
    const stuKey = resolveKey(r);
    if (!stuKey) return;
    const gKey = `${sessKey}::${stuKey}`;
    if (!grouped.has(gKey)) grouped.set(gKey, []);
    grouped.get(gKey)!.push(r);
  });

  const updates: Array<{ docId: string; payload: Record<string, any> }> = [];

  grouped.forEach((groupRecords) => {
    if (groupRecords.length < 2) return;

    const absentSeeds = groupRecords.filter(
      (r) =>
        r.collectionSource === 'top_level' &&
        (r.isDefaultAbsentSeed ||
          (r.status === 'Absent' && !isRealAttendanceTime(r.checkIn) && !r.scannedAt))
    );
    if (absentSeeds.length === 0) return;

    const activeScans = groupRecords.filter(
      (r) =>
        isRealAttendanceTime(r.checkIn) ||
        isRealAttendanceTime(r.checkOut) ||
        Boolean(r.scannedAt) ||
        isAttendedStatus(r.status) ||
        r.status === 'Flagged'
    );
    if (activeScans.length === 0) return;

    const [merged] = mergeAttendanceRecordsForRoster(groupRecords, canonicalLookup);
    if (!merged || merged.status === 'Absent') return;

    absentSeeds.forEach((seed) => {
      const sig = `${seed.id}::${merged.status}::${merged.checkIn}::${merged.checkOut}`;
      if (reconciledSeedCache.get(seed.id) === sig) return;
      reconciledSeedCache.set(seed.id, sig);

      updates.push({
        docId: seed.id,
        payload: sanitizeFirestorePayload({
          status: merged.status,
          checkIn: merged.checkIn || '—',
          checkOut: merged.checkOut || '—',
          scannedAt: merged.scannedAt || undefined,
          timeInAt: merged.timeInAt || undefined,
          timeOutAt: merged.timeOutAt || undefined,
          scannedBy: merged.scannedBy || undefined,
          scannedByName: merged.scannedByName || undefined,
          scanMethod: merged.scanMethod || 'qr',
          studentAuthUid: merged.studentAuthUid || undefined,
          studentSchoolId: merged.studentSchoolId || undefined,
          syncedFromMobile: true,
          isDefaultAbsentSeed: false,
          updatedAt: serverTimestamp(),
        }),
      });
    });
  });

  if (updates.length === 0) return 0;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ docId, payload }) => {
      batch.set(doc(db, ATTENDANCE_COLLECTION, docId), payload, { merge: true });
    });
    await batch.commit();
  }

  return updates.length;
}

/**
 * Conclusively seals event attendance:
 * 1. Synchronizes Absent records (both checkIn and checkOut explicitly marked 'Absent') for all non-attendees.
 * 2. Updates unresolved seeded `Absent` rows so checkIn/checkOut read 'Absent' instead of '—'.
 * 3. For students who checked in but never checked out before event conclusion (when Time-Out is required),
 *    sets checkOut to 'Absent'.
 */
export async function finalizeEventAttendance(
  event: any,
  providedStudents?: any[],
  rawOrgMembers?: any[]
): Promise<{ absenteesCreated: number; incompleteCheckoutsMarked: number }> {
  if (!event || !event.id) return { absenteesCreated: 0, incompleteCheckoutsMarked: 0 };

  // 1. Resolve student cohort & org members if needed
  let studentPool = providedStudents;
  if (!studentPool || studentPool.length === 0) {
    const studentsSnap = await getDocs(collection(db, STUDENTS_COLLECTION));
    studentPool = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  let orgMembersPool = rawOrgMembers;
  if (event.targetAudienceScope === 'members' && (!orgMembersPool || orgMembersPool.length === 0)) {
    const targetOrgId = event.hostingOrgId || event.organizationId;
    if (targetOrgId) {
      try {
        const memSnap = await getDocs(
          query(collection(db, 'organization_members'), where('organizationId', '==', targetOrgId))
        );
        orgMembersPool = memSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch {
        orgMembersPool = [];
      }
    }
  }

  const targetedStudents = resolveAnticipatedParticipantsForEvent(
    event,
    studentPool,
    orgMembersPool
  );

  // 2. Mark missing absentees
  const absenteesCreated = await seedDefaultAbsentAttendanceForEvent(event, targetedStudents, {
    markTimeFieldsAbsent: true,
    seedUpcomingAndOngoing: true,
  });

  // 3. Finalize unresolved pre-seeded Absent time fields & incomplete checkouts
  let incompleteCheckoutsMarked = 0;
  const attRef = collection(db, ATTENDANCE_COLLECTION);
  const q = query(attRef, where('eventId', '==', event.id));
  const snap = await getDocs(q);

  const sessionMap = new Map<string, any>();
  (event.sessions || []).forEach((s: any, idx: number) => {
    sessionMap.set(s.id || `session-${idx}`, s);
  });

  const updates: Array<{ id: string; fields: Record<string, any> }> = [];
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as AttendanceRecord;
    const sess = data.sessionId ? sessionMap.get(data.sessionId) : undefined;
    const requiresTimeOut = sess ? Boolean(sess.hasTimeOut) : true;

    if (data.status === 'Absent') {
      const needsAbsentLabel =
        !data.checkIn || data.checkIn === '—' || !data.checkOut || data.checkOut === '—';
      if (needsAbsentLabel) {
        updates.push({
          id: docSnap.id,
          fields: {
            checkIn: !data.checkIn || data.checkIn === '—' ? 'Absent' : data.checkIn,
            checkOut: !data.checkOut || data.checkOut === '—' ? 'Absent' : data.checkOut,
            updatedAt: serverTimestamp(),
          },
        });
      }
    } else if (requiresTimeOut) {
      const missingCheckout =
        !data.checkOut || data.checkOut === '—' || data.checkOut.trim() === '';
      if (missingCheckout) {
        updates.push({
          id: docSnap.id,
          fields: {
            checkOut: 'Absent',
            updatedAt: serverTimestamp(),
          },
        });
      }
    }
  });

  if (updates.length > 0) {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((u) => {
        const docRef = doc(db, ATTENDANCE_COLLECTION, u.id);
        batch.update(docRef, u.fields);
      });
      await batch.commit();
      incompleteCheckoutsMarked += chunk.length;
    }
  }

  return { absenteesCreated, incompleteCheckoutsMarked };
}

export interface AttendanceEligibilityOptions {
  role: 'admin' | 'officer';
  activeOrgId?: string | null;
}

/**
 * Checks whether an event/activity is eligible to appear in Attendance Monitoring (Admin)
 * or Attendance Logs (Officer).
 *
 * Requirements:
 * 1. Must have explicitly configured sessions created post-publication (sessions.length > 0).
 *    Note: The date/time set during proposal creation is NOT a session.
 * 2. Must be approved, published, ongoing, or completed (not draft, pending review, returned, or cancelled).
 * 3. Attendance tracking must be enabled (attendanceEnabled !== false && enableQRTickets !== false).
 * 4. At least one scanner must be assigned (scanners.length > 0 or scannerUserIds.length > 0).
 * 5. If officer role, must strictly belong to the officer's active organization (activeOrgId).
 *    Admin sees all eligible events across all organizations.
 */
export function isEventEligibleForAttendance(
  evt: any,
  options: AttendanceEligibilityOptions
): boolean {
  if (!evt) return false;

  // 1. Mandatory Sessions: Must have real sessions created after publishing
  // Note: Proposal date/time is NOT a session!
  if (!Array.isArray(evt.sessions) || evt.sessions.length === 0) {
    return false;
  }

  // 2. Lifecycle Status check: Must be approved, published, ongoing, or completed
  const pStatus = (evt.proposalStatus || '').toString().toLowerCase();
  const eStatus = (evt.status || '').toString().toLowerCase();
  const lStatus = ((evt as any).lifecycleStatus || '').toString().toLowerCase();

  const isUnapproved =
    pStatus === 'draft' ||
    pStatus === 'pending' ||
    pStatus === 'pending_review' ||
    pStatus === 'under_review' ||
    pStatus === 'returned' ||
    pStatus === 'rejected' ||
    pStatus === 'cancelled' ||
    eStatus === 'cancelled';

  if (isUnapproved) return false;

  const isApprovedOrPublished =
    pStatus === 'approved' ||
    pStatus === 'completed' ||
    eStatus === 'published' ||
    eStatus === 'approved' ||
    eStatus === 'completed' ||
    eStatus === 'ongoing' ||
    lStatus === 'completed' ||
    evt.isVisible === true ||
    evt.visibleToStudents === true;

  if (!isApprovedOrPublished) return false;

  // 3. Attendance must be enabled
  const isAttendanceEnabled =
    evt.attendanceEnabled === true ||
    (evt.attendanceEnabled !== false && evt.enableQRTickets !== false);

  if (!isAttendanceEnabled) return false;

  // 4. Must have at least one scanner assigned
  const hasScanners =
    (Array.isArray(evt.scanners) && evt.scanners.length > 0) ||
    (Array.isArray(evt.scannerUserIds) && evt.scannerUserIds.length > 0);

  if (!hasScanners) return false;

  // 5. Organizational Scoping for Officer
  if (options.role === 'officer') {
    if (!options.activeOrgId) return false;
    const cleanActiveId = options.activeOrgId.trim().toLowerCase();
    const hostingId = (evt.hostingOrgId || '').trim().toLowerCase();
    const orgId = (evt.organizationId || '').trim().toLowerCase();
    const createdByOrg = (evt.createdByOrgId || '').trim().toLowerCase();
    const directOrg = ((evt as any).orgId || '').trim().toLowerCase();

    const isMyOrg =
      hostingId === cleanActiveId ||
      orgId === cleanActiveId ||
      createdByOrg === cleanActiveId ||
      directOrg === cleanActiveId;

    if (!isMyOrg) return false;
  }

  // Admin sees all activities across all organizations
  return true;
}

