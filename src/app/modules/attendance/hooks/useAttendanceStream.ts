import { useState, useEffect } from 'react';
import { collectionGroup, onSnapshot, collection, query, limit } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { AttendanceRecord } from '../types/attendance.types';
import { formatAppTime } from '../../../utils/date';

export function useAttendanceStream() {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let groupNormalRecords: AttendanceRecord[] = [];
    let topNormalRecords: AttendanceRecord[] = [];
    let groupFlaggedRecords: AttendanceRecord[] = [];
    let topFlaggedRecords: AttendanceRecord[] = [];

    const formatTime = (timestamp: any): string => {
      return formatAppTime(timestamp, '—');
    };

    const updateCombinedRecords = () => {
      const recordMap = new Map<string, AttendanceRecord>();
      for (const r of [...groupNormalRecords, ...topNormalRecords, ...groupFlaggedRecords, ...topFlaggedRecords]) {
        if (!recordMap.has(r.id)) {
          recordMap.set(r.id, r);
        }
      }
      const combined = Array.from(recordMap.values());
      // Sort newest first
      combined.sort((a, b) => {
        const aTime = (a.createdAt as any)?.seconds ?? 0;
        const bTime = (b.createdAt as any)?.seconds ?? 0;
        return bTime - aTime;
      });
      setAttendance(combined);
      setLoading(false);
    };

    const parseNormalDoc = (doc: any): AttendanceRecord => {
      const data = doc.data();
      const scanTimeStr = formatTime(data.scannedAt || data.createdAt);
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
      const scanTimeStr = formatTime(data.scannedAt || data.createdAt);

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

    // 1. Listen to recent /attendance subcollections (limited to 150 to prevent unbounded database reads)
    const unsubAttendanceGroup = onSnapshot(
      query(collectionGroup(db, 'attendance'), limit(150)),
      (snapshot) => {
        groupNormalRecords = snapshot.docs.map(parseNormalDoc);
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collectionGroup(attendance) warning:', err?.message);
        setLoading(false);
      }
    );

    // 2. Listen to top-level /attendance collection (limited to 100)
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

    // 3. Listen to recent /flagged_attendance subcollections (limited to 100)
    const unsubFlaggedGroup = onSnapshot(
      query(collectionGroup(db, 'flagged_attendance'), limit(100)),
      (snapshot) => {
        groupFlaggedRecords = snapshot.docs.map(parseFlaggedDoc);
        updateCombinedRecords();
      },
      (err) => {
        console.warn('[useAttendanceStream] collectionGroup(flagged_attendance) warning:', err?.message);
        setLoading(false);
      }
    );

    // 4. Listen to top-level /flagged_attendance collection (limited to 100)
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
  }, []);

  return { attendance, loading, error };
}
