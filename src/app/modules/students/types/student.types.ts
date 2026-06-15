import { Timestamp } from 'firebase/firestore';

// ─── Student ──────────────────────────────────────────────────────────────────

export type StudentSex       = 'Male' | 'Female';
export type StudentYearLevel = '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
export type StudentSemester  = '1st Semester' | '2nd Semester';
export type StudentStatus    = 'ACTIVE' | 'PENDING' | 'RETURNED' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export interface StudentDocument {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:           string;       // Firestore doc id
  lastName:     string;
  firstName:    string;
  middleName:   string;       // empty string if not provided
  studentId:    string;       // official STI student ID e.g. "2023-0001"
  dateOfBirth:  string;       // ISO date string YYYY-MM-DD
  sex:          StudentSex;
  contactNumber: string;      // digits only, no country code

  // ── Academic ──────────────────────────────────────────────────────────────
  courseId:     string;       // ref → courses collection
  courseName:   string;       // denormalised for query speed
  courseCode:   string;
  departmentId: string;       // ref → departments collection
  departmentName: string;     // denormalised
  yearLevel:    StudentYearLevel;
  section:      string;
  schoolYear:   string;       // e.g. "2026-2027"
  semester:     StudentSemester;

  // ── Account ───────────────────────────────────────────────────────────────
  email:        string;
  /** hashed password stored by Firebase Auth — NOT in Firestore directly.
   *  We keep the email here; Auth is created separately via createUserWithEmailAndPassword. */
  authUid:      string;       // Firebase Auth UID, filled after account creation

  // ── Media ─────────────────────────────────────────────────────────────────
  profilePhotoUrl: string;    // Firebase Storage URL, '' if not yet uploaded
  schoolIdPhotoUrl: string;   // Firebase Storage URL, '' if not yet uploaded

  // ── Registry ──────────────────────────────────────────────────────────────
  status:       StudentStatus;
  registrationSource: 'MANUAL' | 'SELF_REGISTER'; // how the account was created
  addedBy:      string;       // admin UID who created the record manually
  rejectionReason?: string;   // if status is RETURNED, admin reason for return

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt:    Timestamp;
  updatedAt:    Timestamp;
}
