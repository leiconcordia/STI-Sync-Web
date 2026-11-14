import { useState, useEffect } from 'react';
import { doc, collection, collectionGroup, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { StudentDocument } from '../types/student.types';
import type { OrganizationMemberDocument } from '../../organizations/types/member.types';
import type { OrganizationDocument } from '../../organizations/types/organization.types';
import type { PayableDocument } from '../../finance/types/payable.types';
import type { AttendanceRecord } from '../../attendance/types/attendance.types';
import { formatAppTime } from '../../../utils/date';

export interface EnrichedClubMembership {
  id: string;
  organizationId: string;
  clubName: string;
  clubAcronym: string;
  logoUrl: string | null;
  role: 'Officer' | 'Member';
  isOfficer: boolean;
  status: string;
  paymentStatus: 'paid' | 'outstanding';
  dateJoined: any;
}

export interface EnrichedStudentAttendance extends AttendanceRecord {
  hostOrgId: string;
  hostOrgName: string;
  completedChecks: number;
  totalExpectedChecks: number;
}

export interface StudentDetailState {
  student: StudentDocument | null;
  memberships: EnrichedClubMembership[];
  organizations: OrganizationDocument[];
  payables: PayableDocument[];
  attendances: EnrichedStudentAttendance[];
  stats: {
    totalBilled: number;
    totalPaid: number;
    outstandingBalance: number;
    paymentStatus: 'Paid' | 'Outstanding' | 'None';
    eventsAttended: number;
    totalEvents: number;
    attendanceRate: number;
  };
  loading: boolean;
  error: Error | null;
}

export function useStudentDetail(studentDocOrId: StudentDocument | string | null): StudentDetailState {
  const [student, setStudent] = useState<StudentDocument | null>(
    typeof studentDocOrId === 'object' ? studentDocOrId : null
  );
  const [allRawMemberships, setAllRawMemberships] = useState<OrganizationMemberDocument[]>([]);
  const [allOrgs, setAllOrgs] = useState<OrganizationDocument[]>([]);
  const [allEvents, setAllEvents] = useState<Map<string, any>>(new Map());
  const [payables, setPayables] = useState<PayableDocument[]>([]);
  const [attendances, setAttendances] = useState<Array<AttendanceRecord & { rawOrgId?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const studentId = typeof studentDocOrId === 'string' ? studentDocOrId : studentDocOrId?.id;
  const schoolId = student?.studentId || (typeof studentDocOrId === 'object' ? studentDocOrId?.studentId : '');
  const authUid = (student as any)?.authUid || (typeof studentDocOrId === 'object' ? (studentDocOrId as any)?.authUid : '');
  const emailRaw = (student?.email || (typeof studentDocOrId === 'object' ? studentDocOrId?.email : '') || '').trim();
  const email = emailRaw.toLowerCase();
  const studentFullName = student ? `${student.firstName} ${student.lastName}`.trim().toLowerCase() : '';

  useEffect(() => {
    const candidateIds = Array.from(
      new Set([studentId, schoolId, authUid].filter((v): v is string => Boolean(v && String(v).trim())))
    );

    if (candidateIds.length === 0 && !email) {
      setStudent(null);
      setAllRawMemberships([]);
      setPayables([]);
      setAttendances([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubs: Array<() => void> = [];

    // 1. Subscribe to student document if ID provided
    if (typeof studentDocOrId === 'string' || !student) {
      const studentDocRef = doc(db, 'students', studentId || schoolId);
      const unsubStudent = onSnapshot(
        studentDocRef,
        (snap) => {
          if (snap.exists()) {
            setStudent({ id: snap.id, ...snap.data() } as StudentDocument);
          }
        },
        (err) => {
          console.warn('Error streaming student document:', err);
        }
      );
      unsubs.push(unsubStudent);
    } else {
      setStudent(studentDocOrId);
    }

    // 2. Subscribe to All Organizations to resolve club names, acronyms, and logos
    const unsubOrgs = onSnapshot(
      collection(db, 'organizations'),
      (snap) => {
        const orgDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrganizationDocument));
        setAllOrgs(orgDocs);
      },
      (err) => console.warn('Error streaming organizations:', err)
    );
    unsubs.push(unsubOrgs);

    // 2.1 Subscribe to Activities and Events collections to resolve host organization and session count
    let evMapLegacy = new Map<string, any>();
    let evMapActivities = new Map<string, any>();

    const updateAllEvents = () => {
      const merged = new Map<string, any>([...evMapLegacy, ...evMapActivities]);
      setAllEvents(merged);
    };

    const unsubActivities = onSnapshot(
      query(collection(db, 'activities'), limit(300)),
      (snap) => {
        evMapActivities = new Map<string, any>();
        snap.docs.forEach((doc) => {
          evMapActivities.set(doc.id, { id: doc.id, ...doc.data() });
        });
        updateAllEvents();
      },
      (err) => console.warn('Error streaming activities in useStudentDetail:', err)
    );
    unsubs.push(unsubActivities);

    const unsubEvents = onSnapshot(
      query(collection(db, 'events'), limit(300)),
      (snap) => {
        evMapLegacy = new Map<string, any>();
        snap.docs.forEach((doc) => {
          evMapLegacy.set(doc.id, { id: doc.id, ...doc.data() });
        });
        updateAllEvents();
      },
      (err) => console.warn('Error streaming events in useStudentDetail:', err)
    );
    unsubs.push(unsubEvents);

    // 3. Subscribe to Organization Memberships across doc ID, school ID, authUid, and email
    const memberBuckets = new Map<string, Map<string, OrganizationMemberDocument>>();
    const emitMergedMembers = () => {
      const merged = new Map<string, OrganizationMemberDocument>();
      memberBuckets.forEach((bucket) => {
        bucket.forEach((docItem, id) => merged.set(id, docItem));
      });
      setAllRawMemberships(Array.from(merged.values()));
    };

    const addMemberListener = (bucketKey: string, qRef: any) => {
      const unsub = onSnapshot(
        qRef,
        (snap: any) => {
          const bucket = new Map<string, OrganizationMemberDocument>();
          snap.docs.forEach((d: any) => {
            bucket.set(d.id, { id: d.id, ...d.data() } as OrganizationMemberDocument);
          });
          memberBuckets.set(bucketKey, bucket);
          emitMergedMembers();
        },
        (err) => console.warn(`Error streaming organization members (${bucketKey}):`, err)
      );
      unsubs.push(unsub);
    };

    if (candidateIds.length > 0) {
      addMemberListener(
        'studentId',
        query(collection(db, 'organization_members'), where('studentId', 'in', candidateIds.slice(0, 10)))
      );
    }
    if (schoolId) {
      addMemberListener(
        'studentSchoolId',
        query(collection(db, 'organization_members'), where('studentSchoolId', '==', schoolId))
      );
    }
    if (emailRaw) {
      addMemberListener(
        'emailRaw',
        query(collection(db, 'organization_members'), where('email', '==', emailRaw))
      );
      if (email && email !== emailRaw) {
        addMemberListener(
          'emailLower',
          query(collection(db, 'organization_members'), where('email', '==', email))
        );
      }
    }

    // 4. Subscribe to Payables across doc ID, school ID, authUid, and studentSchoolId
    const payableBuckets = new Map<string, Map<string, PayableDocument>>();
    const emitMergedPayables = () => {
      const merged = new Map<string, PayableDocument>();
      payableBuckets.forEach((bucket) => {
        bucket.forEach((docItem, id) => merged.set(id, docItem));
      });
      setPayables(Array.from(merged.values()));
    };

    const addPayableListener = (bucketKey: string, qRef: any) => {
      const unsub = onSnapshot(
        qRef,
        (snap: any) => {
          const bucket = new Map<string, PayableDocument>();
          snap.docs.forEach((d: any) => {
            bucket.set(d.id, { id: d.id, ...d.data() } as PayableDocument);
          });
          payableBuckets.set(bucketKey, bucket);
          emitMergedPayables();
        },
        (err) => console.warn(`Error streaming student payables (${bucketKey}):`, err)
      );
      unsubs.push(unsub);
    };

    if (candidateIds.length > 0) {
      addPayableListener(
        'studentId',
        query(collection(db, 'payables'), where('studentId', 'in', candidateIds.slice(0, 10)))
      );
    }
    if (schoolId) {
      addPayableListener(
        'studentSchoolId',
        query(collection(db, 'payables'), where('studentSchoolId', '==', schoolId))
      );
    }

    // 5. Subscribe to Attendance Records across all student identifiers
    const formatTime = (timestamp: any): string => {
      return formatAppTime(timestamp, '—');
    };

    const attBuckets = new Map<string, Map<string, AttendanceRecord & { rawOrgId?: string }>>();
    const emitMergedAttendance = () => {
      const merged = new Map<string, AttendanceRecord & { rawOrgId?: string }>();
      attBuckets.forEach((bucket) => {
        bucket.forEach((item, pathKey) => merged.set(pathKey, item));
      });
      const list = Array.from(merged.values());
      list.sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      setAttendances(list);
      setLoading(false);
    };

    const parseAttendanceSnap = (bucketKey: string, snap: any) => {
      const bucket = new Map<string, AttendanceRecord & { rawOrgId?: string }>();
      snap.docs.forEach((d: any) => {
        const data = d.data();
        const dStudentId = String(data.studentId || data.studentSchoolId || data.studentNumber || '').trim();
        const dEmail = String(data.email || '').trim().toLowerCase();
        const dName = String(data.studentName || data.name || '').trim().toLowerCase();

        const isMatch =
          candidateIds.includes(dStudentId) ||
          (email && dEmail === email) ||
          (studentFullName && dName === studentFullName);

        if (isMatch) {
          const scanTimeStr = formatTime(data.scannedAt || data.createdAt);
          const checkInTime = data.gateType === 'time_in' ? scanTimeStr : (data.checkIn || '—');
          const checkOutTime = data.gateType === 'time_out' ? scanTimeStr : (data.checkOut || '—');
          const mappedStatus = data.status === 'Present' ? 'Checked In' : (data.status || 'Checked In');
          const parentEventId = d.ref?.parent?.parent?.id || '';

          bucket.set(d.ref.path, {
            id: d.id,
            studentId: dStudentId || schoolId || studentId || '',
            name: data.studentName || data.name || studentFullName || 'Student',
            org: data.organizationName || data.organizationId || data.hostingOrgId || data.org || 'SAO Event',
            rawOrgId: data.organizationId || data.hostingOrgId || '',
            eventId: data.eventId || parentEventId || '',
            event: data.eventName || data.event || 'Campus Event',
            checkIn: checkInTime,
            checkOut: checkOutTime,
            status: mappedStatus,
            createdAt: data.createdAt || data.serverTimestamp,
            flaggedReason: data.flagNote || data.flaggedReason,
          });
        }
      });
      attBuckets.set(bucketKey, bucket);
      emitMergedAttendance();
    };

    const addAttendanceListener = (bucketKey: string, qRef: any) => {
      const unsub = onSnapshot(
        qRef,
        (snap: any) => parseAttendanceSnap(bucketKey, snap),
        (err) => {
          console.warn(`Error streaming attendance logs (${bucketKey}):`, err);
          setLoading(false);
        }
      );
      unsubs.push(unsub);
    };

    candidateIds.forEach((cid, idx) => {
      addAttendanceListener(
        `att_studentId_${idx}`,
        query(collectionGroup(db, 'attendance'), where('studentId', '==', cid), limit(100))
      );
    });
    if (schoolId) {
      addAttendanceListener(
        'att_schoolId',
        query(collectionGroup(db, 'attendance'), where('studentSchoolId', '==', schoolId), limit(100))
      );
      addAttendanceListener(
        'att_studentNumber',
        query(collectionGroup(db, 'attendance'), where('studentNumber', '==', schoolId), limit(100))
      );
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [studentId, schoolId, authUid, emailRaw, email, studentFullName]);

  // Build Enriched Club Memberships
  const orgMap = new Map<string, OrganizationDocument>();
  allOrgs.forEach((o) => orgMap.set(o.id, o));

  const memberships: EnrichedClubMembership[] = allRawMemberships
    .filter((m) => {
      if (m.status === 'rejected') return false;
      const matchId = studentId && m.studentId === studentId;
      const matchSchoolId = schoolId && (m.studentId === schoolId || (m as any).studentSchoolId === schoolId);
      const matchAuthUid = authUid && (m.studentId === authUid || (m as any).authUid === authUid);
      const matchEmail = email && m.email?.trim().toLowerCase() === email;
      const matchName = studentFullName && m.studentName?.trim().toLowerCase() === studentFullName;
      return matchId || matchSchoolId || matchAuthUid || matchEmail || matchName;
    })
    .map((m) => {
      const org = orgMap.get(m.organizationId);
      const clubName = org?.name || m.department || 'Student Club';
      const clubAcronym = org?.acronym || (m.department?.length <= 6 ? m.department : '');
      const logoUrl = org?.logoUrl || null;

      return {
        id: m.id,
        organizationId: m.organizationId,
        clubName,
        clubAcronym,
        logoUrl,
        role: m.isOfficer ? 'Officer' : 'Member',
        isOfficer: Boolean(m.isOfficer),
        status: m.status || 'active',
        paymentStatus: m.paymentStatus || 'paid',
        dateJoined: m.dateJoined || m.createdAt,
      };
    });

  // Compute aggregated stats (excluding waived items from outstanding balance)
  const activePayables = payables.filter((p) => p.status !== 'waived');
  const totalBilled = activePayables.reduce((sum, p) => sum + (Number(p.assignedAmount) || 0), 0);
  const totalPaid = payables.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
  const outstandingBalance = Math.max(0, totalBilled - totalPaid);

  let paymentStatus: 'Paid' | 'Outstanding' | 'None' = 'None';
  if (activePayables.length > 0) {
    paymentStatus = outstandingBalance <= 0 ? 'Paid' : 'Outstanding';
  } else if (payables.length > 0) {
    paymentStatus = 'Paid';
  }

  // Enrich attendance with actual host organization and attendance check count vs expected
  const enrichedAttendances: EnrichedStudentAttendance[] = attendances.map((a) => {
    const eventDoc = a.eventId ? allEvents.get(a.eventId) : null;
    const rawHostOrgId = eventDoc?.hostingOrgId || eventDoc?.organizationId || a.rawOrgId || '';
    let hostOrg = rawHostOrgId ? orgMap.get(rawHostOrgId) : undefined;
    if (!hostOrg && a.org) {
      const orgKey = a.org.trim().toLowerCase();
      hostOrg = allOrgs.find(
        (o) =>
          o.id === a.org ||
          o.name?.trim().toLowerCase() === orgKey ||
          o.acronym?.trim().toLowerCase() === orgKey
      );
    }

    const isSasEvent =
      Boolean(eventDoc?.isSasDirect) ||
      (!hostOrg &&
        (!rawHostOrgId ||
          rawHostOrgId === 'sas' ||
          rawHostOrgId === 'sao' ||
          !a.org ||
          a.org === 'N/A' ||
          a.org.startsWith('SAO') ||
          a.org.startsWith('SAS')));

    const hostOrgId = hostOrg?.id || (isSasEvent ? '__sas__' : rawHostOrgId || '__sas__');
    const hostOrgName =
      hostOrg?.name ||
      hostOrg?.acronym ||
      eventDoc?.hostingOrgName ||
      (isSasEvent ? 'Student Affairs & Services (SAS)' : a.org || 'Student Affairs & Services (SAS)');

    // Expected check-in/out checks for this event:
    let totalExpectedChecks = 2; // Default Time-In & Time-Out
    if (eventDoc?.sessions && Array.isArray(eventDoc.sessions) && eventDoc.sessions.length > 0) {
      totalExpectedChecks = eventDoc.sessions.reduce(
        (sum: number, s: any) => sum + (s.hasTimeOut ? 2 : 1),
        0
      );
    } else if (eventDoc && typeof eventDoc.hasTimeOut === 'boolean') {
      totalExpectedChecks = eventDoc.hasTimeOut ? 2 : 1;
    }

    let completedChecks = 0;
    if (a.checkIn && a.checkIn !== '—' && a.checkIn !== '') completedChecks += 1;
    if (a.checkOut && a.checkOut !== '—' && a.checkOut !== '') completedChecks += 1;
    if (a.status === 'Complete' && completedChecks < totalExpectedChecks) {
      completedChecks = totalExpectedChecks;
    }

    return {
      ...a,
      hostOrgId,
      hostOrgName,
      completedChecks,
      totalExpectedChecks,
    };
  });

  const eventsAttended = enrichedAttendances.filter(
    (a) => a.completedChecks >= a.totalExpectedChecks || a.status === 'Complete' || a.status === 'Checked In' || a.status === 'Late'
  ).length;
  const totalEvents = enrichedAttendances.length;
  const attendanceRate = totalEvents > 0 ? Math.round((eventsAttended / totalEvents) * 100) : 100;

  return {
    student,
    memberships,
    organizations: allOrgs,
    payables,
    attendances: enrichedAttendances,
    stats: {
      totalBilled,
      totalPaid,
      outstandingBalance,
      paymentStatus,
      eventsAttended,
      totalEvents,
      attendanceRate,
    },
    loading,
    error,
  };
}
