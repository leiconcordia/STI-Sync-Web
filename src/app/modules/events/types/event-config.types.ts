import { Timestamp } from 'firebase/firestore';

export interface EventTypeDocument {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventCategoryDocument {
  id: string;
  name: string;
  typeId: string;
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VenueDocument {
  id: string;
  name: string;
  capacity: number;
  facilities: string[];
  status: 'available' | 'maintenance' | 'reserved';
  archived: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
