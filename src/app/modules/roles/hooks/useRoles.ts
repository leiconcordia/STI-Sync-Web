import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OfficerRoleDocument } from '../types/role.types';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const rolesStream = createSingletonStream<OfficerRoleDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(collection(db, 'officer_roles'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        emit(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OfficerRoleDocument)));
      },
      (err) => emitError(err)
    );
  },
});

export const useRoles = () => {
  return rolesStream.use();
};
