import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  EventTypeDocument,
  EventCategoryDocument,
  VenueDocument
} from '../types/event-config.types';

// ==========================================
// EVENT TYPES
// ==========================================

export async function createEventType(
  data: Omit<EventTypeDocument, 'id' | 'createdAt' | 'updatedAt'>
) {
  const colRef = collection(db, 'event_types');
  return addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateEventType(
  id: string,
  data: Partial<Omit<EventTypeDocument, 'id' | 'createdAt' | 'updatedAt'>>
) {
  const docRef = doc(db, 'event_types', id);
  return updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveEventType(id: string) {
  return updateEventType(id, { archived: true });
}

export async function restoreEventType(id: string) {
  return updateEventType(id, { archived: false });
}

export async function deleteEventTypeForever(id: string) {
  const docRef = doc(db, 'event_types', id);
  return deleteDoc(docRef);
}

// ==========================================
// EVENT CATEGORIES
// ==========================================

export async function createEventCategory(
  data: Omit<EventCategoryDocument, 'id' | 'createdAt' | 'updatedAt'>
) {
  const colRef = collection(db, 'event_categories');
  return addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateEventCategory(
  id: string,
  data: Partial<Omit<EventCategoryDocument, 'id' | 'createdAt' | 'updatedAt'>>
) {
  const docRef = doc(db, 'event_categories', id);
  return updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveEventCategory(id: string) {
  return updateEventCategory(id, { archived: true });
}

export async function restoreEventCategory(id: string) {
  return updateEventCategory(id, { archived: false });
}

export async function deleteEventCategoryForever(id: string) {
  const docRef = doc(db, 'event_categories', id);
  return deleteDoc(docRef);
}

// ==========================================
// VENUES
// ==========================================

export async function createVenue(
  data: Omit<VenueDocument, 'id' | 'createdAt' | 'updatedAt'>
) {
  const colRef = collection(db, 'venues');
  return addDoc(colRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateVenue(
  id: string,
  data: Partial<Omit<VenueDocument, 'id' | 'createdAt' | 'updatedAt'>>
) {
  const docRef = doc(db, 'venues', id);
  return updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveVenue(id: string) {
  return updateVenue(id, { archived: true });
}

export async function restoreVenue(id: string) {
  return updateVenue(id, { archived: false });
}

export async function deleteVenueForever(id: string) {
  const docRef = doc(db, 'venues', id);
  return deleteDoc(docRef);
}
