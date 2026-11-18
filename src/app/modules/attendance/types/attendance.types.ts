import { Timestamp } from 'firebase/firestore';

export type AttendanceStatus =
  | 'Present'
  | 'Complete'
  | 'Checked In'
  | 'Checked Out'
  | 'Absent'
  | 'Flagged'
  | 'Late';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentAuthUid?: string;
  studentSchoolId?: string;
  studentNumber?: string;
  name: string;
  org: string;
  organizationId?: string;
  eventId?: string;
  event: string;
  sessionId?: string;
  sessionTitle?: string;
  checkIn: string;
  checkOut: string;
  status: AttendanceStatus;
  createdAt?: Timestamp | any;
  updatedAt?: Timestamp | any;
  scannedAt?: Timestamp | any;
  timeInAt?: Timestamp | any;
  timeOutAt?: Timestamp | any;
  flaggedReason?: string;
  scannedBy?: string;
  scannedByName?: string;
  scanMethod?: 'qr' | 'manual';
  gateType?: string;
  lateMinutes?: number;
  courseCode?: string;
  section?: string;
  yearLevel?: string;
  isDefaultAbsentSeed?: boolean;
  syncedFromMobile?: boolean;
  docPath?: string;
  collectionSource?: 'top_level' | 'subcollection' | 'flagged';
}

export interface EnrichedAttendanceRecord extends AttendanceRecord {
  studentAuthUid?: string;
  studentSchoolId?: string;
  departmentId?: string;
  departmentName?: string;
  departmentCode?: string;
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  section?: string;
  yearLevel?: string;
  sessionTitle?: string;
  duration?: string;
}

export interface EventAttendanceSummary {
  id: string;
  event: string;
  registered: number;
  checkedIn: number;
  absent: number;
}

export interface AttendanceFilterState {
  searchQuery: string;
  departmentId: string;
  courseId: string;
  section: string;
  yearLevel: string;
  sessionId: string;
  status: string;
}
