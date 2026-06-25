import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { DocumentSettingsDocument } from '../types/document.types';
import { DEFAULT_DOCUMENT_SETTINGS } from '../types/document.types';

const DOC_PATH = 'system_settings';
const DOC_ID = 'document_settings';

export const getDocumentSettings = async (): Promise<DocumentSettingsDocument | null> => {
  const docRef = doc(db, DOC_PATH, DOC_ID);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return snapshot.data() as DocumentSettingsDocument;
};

/**
 * Save document settings — uses setDoc with merge so it creates
 * the doc if it doesn't exist, or updates if it does.
 */
export const saveDocumentSettings = async (
  data: Partial<Omit<DocumentSettingsDocument, 'updatedAt'>>
) => {
  const docRef = doc(db, DOC_PATH, DOC_ID);
  const payload = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  await setDoc(docRef, payload, { merge: true });
};

export { DEFAULT_DOCUMENT_SETTINGS };
