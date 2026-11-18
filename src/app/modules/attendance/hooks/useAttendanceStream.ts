import { collectionGroup, onSnapshot, collection } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { AttendanceRecord } from '../types/attendance.types';
import { formatAppTime } from '../../../utils/date';
import { createSingletonStream } from '../../../utils/createSingletonStream';
import {
  mergeAttendanceRecordsForRoster,
  resolveMergedAttendanceStatus,
  isRealAttendanceTime,
} from '../utils/attendance-sync.utils';

const parseNormalDoc = (
  docSnap: any,
  collectionSource: 'top_level' | 'subcollection'
): AttendanceRecord => {
  const data = docSnap.data();
  const parentEventId = docSnap.ref?.parent?.parent?.id || '';
  const rawGate = String(data.gateType || '').trim().toLowerCase();
  const scanTimeStr = formatAppTime(data.scannedAt || data.createdAt, '—');

  const explicitIn =
    data.checkIn ||
    data.timeIn ||
    (data.timeInAt ? formatAppTime(data.timeInAt, '—') : undefined);
  const explicitOut =
    data.checkOut ||
    data.timeOut ||
    (data.timeOutAt ? formatAppTime(data.timeOutAt, '—') : undefined);

  const isInGate = rawGate === 'time_in' || rawGate === 'entry';
  const isOutGate = rawGate === 'time_out' || rawGate === 'exit';

  const checkInTime = isInGate
    ? isRealAttendanceTime(explicitIn)
      ? explicitIn!
      : scanTimeStr
    : isRealAttendanceTime(explicitIn)
    ? explicitIn!
    : data.scannedAt && !isOutGate && !data.isDefaultAbsentSeed && data.status !== 'Absent'
    ? scanTimeStr
    : data.checkIn || '—';

  const checkOutTime = isOutGate
    ? isRealAttendanceTime(explicitOut)
      ? explicitOut!
      : scanTimeStr
    : explicitOut || data.checkOut || '—';

  const status = resolveMergedAttendanceStatus({
    rawStatus: data.status,
    checkIn: checkInTime,
    checkOut: checkOutTime,
    scannedAt: data.scannedAt || data.timeInAt || data.timeOutAt,
    isFlagged: data.status === 'Flagged' || Boolean(data.flagReason || data.flaggedReason),
    flaggedReason: data.flagNote || data.flaggedReason,
  });

  return {
    id: docSnap.id,
    docPath: docSnap.ref?.path || docSnap.id,
    collectionSource,
    studentId: data.studentSchoolId || data.studentNumber || data.studentId || 'N/A',
    studentSchoolId: data.studentSchoolId || data.studentNumber || undefined,
    studentNumber: data.studentNumber || data.studentSchoolId || undefined,
    studentAuthUid: data.studentAuthUid || data.authUid || (data.studentId && !data.studentNumber ? data.studentId : undefined),
    name: data.studentName || data.name || 'Unknown Student',
    org: data.organizationId || data.org || 'N/A',
    organizationId: data.organizationId || undefined,
    eventId: data.eventId || parentEventId || '',
    event: data.event || data.eventName || 'General Event',
    sessionId: data.sessionId || '',
    sessionTitle: data.sessionTitle || undefined,
    checkIn: checkInTime,
    checkOut: checkOutTime,
    status,
    createdAt: data.createdAt || data.serverTimestamp,
    updatedAt: data.updatedAt,
    scannedAt: data.scannedAt,
    timeInAt: data.timeInAt,
    timeOutAt: data.timeOutAt,
    scannedBy: data.scannedBy,
    scannedByName: data.scannedByName,
    scanMethod: data.scanMethod,
    gateType: data.gateType,
    lateMinutes: data.lateMinutes,
    courseCode: data.courseCode,
    section: data.section,
    yearLevel: data.yearLevel ? String(data.yearLevel) : undefined,
    flaggedReason: data.flagNote || data.flaggedReason,
    isDefaultAbsentSeed: Boolean(data.isDefaultAbsentSeed),
    syncedFromMobile: Boolean(data.syncedFromMobile || collectionSource === 'subcollection'),
  };
};

const parseFlaggedDoc = (docSnap: any): AttendanceRecord => {
  const data = docSnap.data();
  const parentEventId = docSnap.ref?.parent?.parent?.id || '';
  const rawGate = String(data.gateType || '').trim().toLowerCase();
  const scanTimeStr = formatAppTime(data.scannedAt || data.createdAt, '—');

  return {
    id: docSnap.id,
    docPath: docSnap.ref?.path || docSnap.id,
    collectionSource: 'flagged',
    studentId: data.studentSchoolId || data.studentNumber || data.studentId || 'N/A',
    studentSchoolId: data.studentSchoolId || data.studentNumber || undefined,
    studentNumber: data.studentNumber || undefined,
    studentAuthUid: data.studentAuthUid || data.authUid || undefined,
    name: data.studentName || data.name || 'Unknown Student',
    org: data.organizationId || data.org || 'N/A',
    organizationId: data.organizationId || undefined,
    eventId: data.eventId || parentEventId || '',
    event: data.event || data.eventName || 'General Event',
    sessionId: data.sessionId || '',
    sessionTitle: data.sessionTitle || undefined,
    checkIn: rawGate === 'time_in' || rawGate === 'entry' ? scanTimeStr : data.checkIn || '—',
    checkOut: rawGate === 'time_out' || rawGate === 'exit' ? scanTimeStr : data.checkOut || '—',
    status: 'Flagged',
    createdAt: data.createdAt,
    scannedAt: data.scannedAt,
    scannedBy: data.scannedBy,
    scannedByName: data.scannedByName,
    scanMethod: data.scanMethod,
    gateType: data.gateType,
    flaggedReason: data.flagReason || data.flagNote || 'Flagged Attendance',
  };
};

const attendanceStream = createSingletonStream<{
  raw: AttendanceRecord[];
  merged: AttendanceRecord[];
}>({
  initialData: { raw: [], merged: [] },
  start: (emit) => {
    let groupNormalRecords: AttendanceRecord[] = [];
    let topNormalRecords: AttendanceRecord[] = [];
    let groupFlaggedRecords: AttendanceRecord[] = [];
    let topFlaggedRecords: AttendanceRecord[] = [];

    const updateCombinedRecords = () => {
      // 1. Deduplicate identical Firestore document paths across collectionGroup & top-level streams
      const docMap = new Map<string, AttendanceRecord>();
      for (const r of [
        ...groupNormalRecords,
        ...topNormalRecords,
        ...groupFlaggedRecords,
        ...topFlaggedRecords,
      ]) {
        const pathKey = r.docPath || r.id;
        if (!docMap.has(pathKey)) {
          docMap.set(pathKey, r);
        }
      }

      const raw = Array.from(docMap.values());
      const merged = mergeAttendanceRecordsForRoster(raw);
      emit({ raw, merged });
    };

    const unsubAttendanceGroup = onSnapshot(
      collectionGroup(db, 'attendance'),
      (snapshot) => {
        groupNormalRecords = snapshot.docs.map((d) => {
          const isTopLevel = d.ref.parent.parent === null;
          return parseNormalDoc(d, isTopLevel ? 'top_level' : 'subcollection');
        });
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collectionGroup(attendance) warning:', err?.message);
        updateCombinedRecords();
      }
    );

    const unsubTopAttendance = onSnapshot(
      collection(db, 'attendance'),
      (snapshot) => {
        topNormalRecords = snapshot.docs.map((d) => parseNormalDoc(d, 'top_level'));
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collection(attendance) warning:', err?.message);
      }
    );

    const unsubFlaggedGroup = onSnapshot(
      collectionGroup(db, 'flagged_attendance'),
      (snapshot) => {
        groupFlaggedRecords = snapshot.docs.map(parseFlaggedDoc);
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collectionGroup(flagged_attendance) warning:', err?.message);
        updateCombinedRecords();
      }
    );

    const unsubTopFlagged = onSnapshot(
      collection(db, 'flagged_attendance'),
      (snapshot) => {
        topFlaggedRecords = snapshot.docs.map(parseFlaggedDoc);
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collection(flagged_attendance) warning:', err?.message);
      }
    );

    return () => {
      unsubAttendanceGroup();
      unsubTopAttendance();
      unsubFlaggedGroup();
      unsubTopFlagged();
    };
  },
});

export function useAttendanceStream() {
  const { data, loading, error } = attendanceStream.use();
  return {
    attendance: data.merged,
    rawAttendance: data.raw,
    loading,
    error,
  };
}
