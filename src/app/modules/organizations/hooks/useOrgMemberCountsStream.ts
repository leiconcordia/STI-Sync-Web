import { useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { OrganizationMemberDocument } from '../types/member.types';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const activeMembershipsStream = createSingletonStream<OrganizationMemberDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    const q = query(
      collection(db, 'organization_members'),
      where('status', 'in', ['active', 'pending_removal'])
    );
    return onSnapshot(
      q,
      (snapshot) => {
        emit(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as OrganizationMemberDocument)
          )
        );
      },
      (err) => {
        console.error('[useOrgMemberCountsStream] Error fetching member counts:', err);
        emitError(err);
      }
    );
  },
});

export function useAllActiveMemberships() {
  return activeMembershipsStream.use();
}

export function useOrgMemberCountsStream() {
  const { data: memberships, loading, error } = activeMembershipsStream.use();

  const countsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    memberships.forEach((m) => {
      if (m.organizationId) {
        counts[m.organizationId] = (counts[m.organizationId] || 0) + 1;
      }
    });
    return counts;
  }, [memberships]);

  return { countsMap, loading, error };
}
