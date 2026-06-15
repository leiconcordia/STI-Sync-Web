import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';

export const createOfficerRole = async (data: { name: string; isRequired: boolean; archived: boolean }) => {
  const collectionRef = collection(db, 'officer_roles');
  return addDoc(collectionRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateOfficerRole = async (roleId: string, data: Partial<{ name: string; isRequired: boolean; archived: boolean }>) => {
  const docRef = doc(db, 'officer_roles', roleId);
  return updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteOfficerRole = async (roleId: string) => {
  const docRef = doc(db, 'officer_roles', roleId);
  return deleteDoc(docRef);
};
