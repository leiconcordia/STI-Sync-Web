import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationTypeDocument } from '../types/organization.types';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const organizationTypesStream = createSingletonStream<OrganizationTypeDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(collection(db, 'organization_types'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        emit(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OrganizationTypeDocument)));
      },
      (err) => emitError(err)
    );
  },
});

export const useOrganizationTypes = () => {
  return organizationTypesStream.use();
};
