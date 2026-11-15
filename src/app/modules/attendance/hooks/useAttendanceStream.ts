import { collectionGroup, onSnapshot, collection } from 'firebase/firestore';
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
      // 1. Deduplicate identical Firestore document IDs across collectionGroup & top-level streams
      const docMap = new Map<string, AttendanceRecord>();
      for (const r of [...groupNormalRecords, ...topNormalRecords, ...groupFlaggedRecords, ...topFlaggedRecords]) {
        if (!docMap.has(r.id)) {
          docMap.set(r.id, r);
        }
      }

      // 2. Merge separate time_in and time_out documents for the same student + event + session
      const isRealTime = (val?: string) => Boolean(val && val !== '—' && val !== 'Absent');
      const pickTime = (a?: string, b?: string) => {
        if (isRealTime(a)) return a!;
        if (isRealTime(b)) return b!;
        if (a && a !== '—') return a;
        if (b && b !== '—') return b;
        return '—';
      };

      const mergedMap = new Map<string, AttendanceRecord>();
      for (const r of docMap.values()) {
        if (r.status === 'Flagged') {
          mergedMap.set(`flagged::${r.id}`, r);
          continue;
        }

        const studentKey = String(r.studentId || r.id).trim().toLowerCase();
        const sessionKey = String(r.sessionId || 'default').trim().toLowerCase();
        const eventKey = String(r.eventId || '').trim().toLowerCase();
        const mergeKey = `${eventKey}::${sessionKey}::${studentKey}`;

        const existing = mergedMap.get(mergeKey);
        if (!existing) {
          mergedMap.set(mergeKey, r);
          continue;
        }

        const mergedCheckIn = pickTime(existing.checkIn, r.checkIn);
        const mergedCheckOut = pickTime(existing.checkOut, r.checkOut);
        const hasIn = isRealTime(mergedCheckIn);
        const hasOut = isRealTime(mergedCheckOut);

        let mergedStatus = existing.status;
        if (hasOut) {
          mergedStatus = 'Checked Out';
        } else if (existing.status === 'Late' || r.status === 'Late') {
          mergedStatus = 'Late';
        } else if (hasIn) {
          mergedStatus = 'Checked In';
        } else {
          mergedStatus = r.status || existing.status;
        }

        const existingSec = (existing.createdAt as any)?.seconds ?? 0;
        const incomingSec = (r.createdAt as any)?.seconds ?? 0;

        mergedMap.set(mergeKey, {
          ...existing,
          ...r,
          id: existing.id,
          name: existing.name !== 'Unknown Student' ? existing.name : r.name,
          checkIn: mergedCheckIn,
          checkOut: mergedCheckOut,
          status: mergedStatus,
          createdAt: incomingSec > existingSec ? r.createdAt : existing.createdAt,
        });
      }

      const combined = Array.from(mergedMap.values());
      combined.sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds ?? 0;
        const bTime = (b.createdAt as any)?.seconds ?? 0;
        return bTime - aTime;
      });
      emit(combined);
    };

    const unsubAttendanceGroup = onSnapshot(
      collectionGroup(db, 'attendance'),
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
      collection(db, 'attendance'),
      (snapshot) => {
        topNormalRecords = snapshot.docs.map(parseNormalDoc);
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
  const { data: attendance, loading, error } = attendanceStream.use();
  return { attendance, loading, error };
}
