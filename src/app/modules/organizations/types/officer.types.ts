import { Timestamp } from 'firebase/firestore';

export interface OrganizationOfficerDocument {
  id: string;
  organizationId: string;
  roleId: string;
  
  studentId: string;
  studentName: string;
  email: string;
  
  isActive: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
