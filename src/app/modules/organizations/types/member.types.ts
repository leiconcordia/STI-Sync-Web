import { Timestamp } from 'firebase/firestore';

export type OrganizationMemberStatus =
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'pending'
  | 'rejected'
  | 'pending_removal'
  | 'removed';

export interface OrganizationMemberDocument {
  id: string;
  organizationId: string;
  studentId: string;
  studentSchoolId?: string;
  authUid?: string;
  studentName: string;
  email: string;
  course: string;
  year: string;
  section?: string;
  departmentId?: string;
  department: string;
  contactNumber: string;
  status: OrganizationMemberStatus;
  paymentStatus: 'paid' | 'outstanding';
  dateJoined: any;
  isOfficer: boolean;
  rejectionReason?: string;
  applicationDate?: any;
  removedAt?: any;
  removedBy?: string;
  removalReason?: string;
  removalRequestedAt?: any;
  removalRequestedBy?: string;
  scheduledRemovalActivityIds?: string[];
  scheduledRemovalActivityTitles?: string[];
  createdAt: any;
  updatedAt: any;
  addedBy: string;
}

export interface AddMemberPayload {
  organizationId: string;
  studentId: string;
  authUid?: string;
  studentName: string;
  email: string;
  course: string;
  year: string;
  section?: string;
  departmentId?: string;
  department: string;
  contactNumber: string;
  status: OrganizationMemberStatus;
  paymentStatus: 'paid' | 'outstanding';
}
