import { collectionGroup, onSnapshot, collection, query, limit } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { AttendanceRecord } from '../types/attendance.types';
import { formatAppTime } from '../../../utils/date';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const parseNormalDoc = (doc: any): AttendanceRecord => {
  const data = doc.data();
  const scanTimeStr = formatAppTime(data.scannedAt || data.createdAt, '—');
  const checkInTime = data.gateType === 'time_in' ? scanTimeStr : (data.checkIn || '—');
  const checkOutTime = data.gateType === 'time_out' ? scanTimeStr : (data.checkOut || '—');
  const mappedStatus = data.status === 'Present' ? 'Checked In' : (data.status || 'Checked In');

  return {
    id: doc.id,
    studentId: data.studentId || data.studentNumber || 'N/A',
    name: data.studentName || data.name || 'Unknown Student',
    org: data.organizationId || data.org || 'N/A',
    eventId: data.eventId || '',
    event: data.event || data.eventName || 'General Event',
    sessionId: data.sessionId || '',
    checkIn: checkInTime,
    checkOut: checkOutTime,
    status: mappedStatus as any,
    createdAt: data.createdAt || data.serverTimestamp,
    flaggedReason: data.flagNote || data.flaggedReason,
  };
};

const parseFlaggedDoc = (doc: any): AttendanceRecord => {
  const data = doc.data();
  const scanTimeStr = formatAppTime(data.scannedAt || data.createdAt, '—');

  return {
    id: doc.id,
    studentId: data.studentId || data.studentNumber || 'N/A',
    name: data.studentName || data.name || 'Unknown Student',
    org: data.organizationId || data.org || 'N/A',
    eventId: data.eventId || '',
    event: data.event || data.eventName || 'General Event',
    sessionId: data.sessionId || '',
    checkIn: data.gateType === 'time_in' ? scanTimeStr : '—',
    checkOut: data.gateType === 'time_out' ? scanTimeStr : '—',
    status: 'Flagged',
    createdAt: data.createdAt,
    flaggedReason: data.flagReason || data.flagNote || 'Flagged Attendance',
  };
};

const attendanceStream = createSingletonStream<AttendanceRecord[]>({
  initialData: [],
  start: (emit) => {
    let groupNormalRecords: AttendanceRecord[] = [];
    let topNormalRecords: AttendanceRecord[] = [];
    let groupFlaggedRecords: AttendanceRecord[] = [];
    let topFlaggedRecords: AttendanceRecord[] = [];

    const updateCombinedRecords = () => {
      const recordMap = new Map<string, AttendanceRecord>();
      for (const r of [...groupNormalRecords, ...topNormalRecords, ...groupFlaggedRecords, ...topFlaggedRecords]) {
        if (!recordMap.has(r.id)) {
          recordMap.set(r.id, r);
        }
      }
      const combined = Array.from(recordMap.values());
      combined.sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds ?? 0;
        const bTime = (b.createdAt as any)?.seconds ?? 0;
        return bTime - aTime;
      });
      emit(combined);
    };

    const unsubAttendanceGroup = onSnapshot(
      query(collectionGroup(db, 'attendance'), limit(150)),
      (snapshot) => {
        groupNormalRecords = snapshot.docs.map(parseNormalDoc);
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collectionGroup(attendance) warning:', err?.message);
        updateCombinedRecords();
      }
    );

    const unsubTopAttendance = onSnapshot(
      query(collection(db, 'attendance'), limit(100)),
      (snapshot) => {
        topNormalRecords = snapshot.docs.map(parseNormalDoc);
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collection(attendance) warning:', err?.message);
      }
    );

    const unsubFlaggedGroup = onSnapshot(
      query(collectionGroup(db, 'flagged_attendance'), limit(100)),
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
      query(collection(db, 'flagged_attendance'), limit(100)),
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
  const { data: attendance, loading, error } = attendanceStream.use();
  return { attendance, loading, error };
}
