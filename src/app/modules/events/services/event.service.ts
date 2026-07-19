import { collection, addDoc, updateDoc, doc, serverTimestamp, writeBatch, getDocs, query } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { EventDocument, EventFormData } from '../types/event.types';
import { STUDENTS_COLLECTION } from '../../students/services/student.service';

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

  // Handle payables creation
  if (data.studentPayablesEnabled && data.adminFeeOverride && data.adminFeeOverride > 0) {
    try {
      const q = query(collection(db, STUDENTS_COLLECTION));
      const snapshot = await getDocs(q);
      
      const targetYearLevels = data.targetYearLevels || [];
      const targetDeptIds = data.targetDepartmentIds || [];
      const isAllStudents = data.targetAudience === 'all';
      
      const studentsToCharge = snapshot.docs.map(d => d.data()).filter((student: any) => {
        if (student.status !== 'ACTIVE') return false;
        if (isAllStudents) return true;
        
        const matchesDept = targetDeptIds.length === 0 || targetDeptIds.includes(student.departmentId);
        const matchesYear = targetYearLevels.length === 0 || targetYearLevels.includes(student.yearLevel);
        
        return matchesDept && matchesYear;
      });

      if (studentsToCharge.length > 0) {
        // Firestore batch has 500 operation limit
        const chunks = [];
        for (let i = 0; i < studentsToCharge.length; i += 500) {
          chunks.push(studentsToCharge.slice(i, i + 500));
        }

        for (const chunk of chunks) {
          const batch = writeBatch(db);
          for (const student of chunk) {
            const payableRef = doc(collection(db, 'payables'));
            batch.set(payableRef, {
              id: payableRef.id,
              memberId: student.id,
              typeId: docRef.id, // using event id as type id for event fee
              eventId: docRef.id,
              assignedAmount: data.adminFeeOverride,
              paidAmount: 0,
              status: 'pending',
              dueDate: data.startDate || null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          await batch.commit();
        }
      }
    } catch (err) {
      console.error('[createEvent] Error generating payables:', err);
    }
  }

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

export const approveEvent = async (
  eventId: string,
  adminUserId: string,
  remarks: string
): Promise<void> => {
  const ref = doc(db, EVENTS_COLLECTION, eventId);
  await updateDoc(ref, {
    proposalStatus: 'approved',
    approvedBy: adminUserId,
    approvedAt: serverTimestamp(),
    adviserRemarks: remarks || null,
    updatedAt: serverTimestamp(),
  });
};

export const rejectEvent = async (
  eventId: string,
  adminUserId: string,
  reason: string,
  remarks: string
): Promise<void> => {
  const ref = doc(db, EVENTS_COLLECTION, eventId);
  await updateDoc(ref, {
    proposalStatus: 'rejected',
    rejectedBy: adminUserId,
    rejectedAt: serverTimestamp(),
    rejectionReason: reason,
    adviserRemarks: remarks || null,
    updatedAt: serverTimestamp(),
  });
};

export const returnEvent = async (
  eventId: string,
  adminUserId: string,
  flags: string[],
  deadline: string,
  remarks: string
): Promise<void> => {
  const ref = doc(db, EVENTS_COLLECTION, eventId);
  await updateDoc(ref, {
    proposalStatus: 'returned',
    returnedBy: adminUserId,
    returnedAt: serverTimestamp(),
    returnFlags: flags,
    returnDeadline: deadline || null,
    adviserRemarks: remarks || null,
    updatedAt: serverTimestamp(),
  });
};
