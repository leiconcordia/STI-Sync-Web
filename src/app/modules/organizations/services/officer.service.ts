import { collection, doc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';

interface OfficerAssignmentData {
  roleId: string;
  studentId: string;
  studentName: string;
  email: string;
}

export const batchCreateOfficers = async (organizationId: string, officers: OfficerAssignmentData[]) => {
  const batch = writeBatch(db);
  const collectionRef = collection(db, 'organization_officers');
  
  for (const officer of officers) {
    const docRef = doc(collectionRef);
    batch.set(docRef, {
      id: docRef.id,
      organizationId,
      roleId: officer.roleId,
      studentId: officer.studentId,
      studentName: officer.studentName,
      email: officer.email,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  
  // Implement a timeout to prevent infinite hanging
  const commitPromise = batch.commit();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Firestore batch write timed out. Check your network or Firestore security rules.")), 15000);
  });
  
  try {
    await Promise.race([commitPromise, timeoutPromise]);
  } catch (error: any) {
    console.error("Batch officer creation failed:", error);
    throw new Error(`Batch officer creation failed: ${error.message}`);
  }
};
