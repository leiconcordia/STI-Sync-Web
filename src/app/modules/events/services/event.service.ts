import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { EventDocument, EventFormData } from '../types/event.types';

export const EVENTS_COLLECTION = 'events';

export const generateReferenceId = (): string => {
  const year = new Date().getFullYear();
  const sequence = Math.floor(1000 + Math.random() * 9000);
  return `EVT-ADM-${year}-${sequence}`;
};

export const generateScannerCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const createEvent = async (data: EventFormData, uid: string): Promise<string> => {
  const refId = generateReferenceId();
  const scannerCode = generateScannerCode();
  
  const scannerUserIds = data.scanners
    ? data.scanners.map(s => s.officerUserId).filter((id): id is string => id !== null && id !== undefined)
    : [];
  
  const eventPayload: Partial<EventDocument> = {
    ...data,
    referenceId: refId,
    scannerActivationCode: scannerCode,
    scannerUserIds,
    proposalStatus: 'approved', // SAO Admin creations are auto-approved
    createdBy: uid,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  const docRef = await addDoc(collection(db, EVENTS_COLLECTION), eventPayload);
  return docRef.id;
};

export const saveEventDraft = async (data: EventFormData, uid: string, existingId?: string): Promise<string> => {
  const eventPayload: Partial<EventDocument> = {
    ...data,
    proposalStatus: 'draft',
    createdBy: uid,
    updatedAt: serverTimestamp() as any,
  };

  if (data.scanners) {
    eventPayload.scannerUserIds = data.scanners
      .map(s => s.officerUserId)
      .filter((id): id is string => id !== null && id !== undefined);
  }

  if (!eventPayload.referenceId) {
    eventPayload.referenceId = generateReferenceId();
  }
  
  if (!eventPayload.scannerActivationCode) {
    eventPayload.scannerActivationCode = generateScannerCode();
  }

  if (existingId) {
    const docRef = doc(db, EVENTS_COLLECTION, existingId);
    await updateDoc(docRef, eventPayload);
    return existingId;
  } else {
    eventPayload.createdAt = serverTimestamp() as any;
    const docRef = await addDoc(collection(db, EVENTS_COLLECTION), eventPayload);
    return docRef.id;
  }
};
