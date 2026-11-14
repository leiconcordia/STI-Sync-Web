import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationDocument } from '../types/organization.types';
import { formatPersonName } from '../../../utils/name.utils';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const organizationStream = createSingletonStream<OrganizationDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(collection(db, 'organizations'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        emit(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              ...(data.adviser ? { adviser: { ...data.adviser, name: formatPersonName(data.adviser) } } : {}),
            } as OrganizationDocument;
          })
        );
      },
      (err) => emitError(err)
    );
  },
});

export function peekCachedOrganizations(): OrganizationDocument[] | null {
  const { data, isLoaded } = organizationStream.peekData();
  return isLoaded ? data : null;
}

export const useOrganizationStream = () => {
  return organizationStream.use();
};
