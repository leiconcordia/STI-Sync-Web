import { Timestamp } from 'firebase/firestore';

export interface OfficerRoleDocument {
  id: string;
  name: string;
  isRequired: boolean;
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
