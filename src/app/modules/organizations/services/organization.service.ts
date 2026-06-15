import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../../services/firebase';
import type { CreateOrganizationPayload } from '../types/organization.types';

const COLLECTION = 'organizations';

export const createOrganization = async (
  payload: CreateOrganizationPayload,
  createdBy: string,
  logoFile?: File | null
): Promise<string> => {
  let logoUrl: string | null = null;
  if (logoFile) {
    try {
      const fileRef = ref(storage, `organizations/${Date.now()}_${logoFile.name}`);
      
      // Implement a 15-second timeout for the upload to prevent infinite hanging
      const uploadPromise = uploadBytes(fileRef, logoFile);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Firebase Storage upload timed out. Your storage bucket may not be configured properly or has CORS issues.")), 15000);
      });
      
      const snapshot = await Promise.race([uploadPromise, timeoutPromise]);
      logoUrl = await getDownloadURL(snapshot.ref);
    } catch (error: any) {
      console.error("Logo upload failed (Storage may not be initialized). Falling back to acronym.", error);
      alert(`Warning: Logo upload failed. The organization will be created without a logo. Please initialize Firebase Storage in your Firebase Console.\n\nDetails: ${error.message}`);
      logoUrl = null; // Fallback so the org still gets created
    }
  }

  try {
    const addPromise = addDoc(collection(db, COLLECTION), {
      ...payload,
      logoUrl,
      status: 'active',
      memberCount: 0,
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as Omit<CreateOrganizationPayload, never> & {
      logoUrl: string | null;
      status: string;
      memberCount: number;
      createdBy: string;
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore database write timed out. Check your network or Firestore security rules.")), 15000);
    });
    
    const docRef = await Promise.race([addPromise, timeoutPromise]);
    return docRef.id;
  } catch (error: any) {
    console.error("Organization creation failed:", error);
    throw new Error(`Organization creation failed: ${error.message}`);
  }
};
