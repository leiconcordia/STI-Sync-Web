import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../../../services/firebase';
import type { DocumentCategoryDocument } from '../types/document.types';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const documentCategoriesStream = createSingletonStream<DocumentCategoryDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    let unsubscribe: (() => void) | undefined;
    const stop = onAuthStateChanged(auth, (user) => {
      unsubscribe?.();
      if (!user) {
        emit([]);
        return;
      }
      unsubscribe = onSnapshot(
        query(collection(db, 'document_categories'), orderBy('sortOrder', 'asc')),
        (snapshot) => {
          emit(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as DocumentCategoryDocument)));
        },
        (error) => emitError(error)
      );
    });
    return () => {
      stop();
      unsubscribe?.();
    };
  },
});

export const useDocumentCategories = () => {
  return documentCategoriesStream.use();
};
