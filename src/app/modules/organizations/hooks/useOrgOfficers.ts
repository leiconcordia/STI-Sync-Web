import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../../services/firebase';

export type OfficerAppointmentStatus = 'pending_acceptance' | 'accepted' | 'declined';

export interface OrganizationOfficerDocument {
  id: string;
  organizationId: string;
  organizationName?: string;
  memberDocId?: string | null;
  roleId: string;
  roleName?: string;
  studentId: string;
  studentName: string;
  email: string;
  authUid?: string | null;
  isActive: boolean;
  hasWebPortalAccess?: boolean;
  appointmentStatus?: OfficerAppointmentStatus;
  appointedByUid?: string | null;
  appointedByName?: string | null;
  appointedByEmail?: string | null;
  appointedAt?: any;
  acceptedAt?: any;
  declinedAt?: any;
  declineReason?: string | null;
  temporaryPassword?: string;
  createdAt: any;
  updatedAt: any;
}

/** Legacy officer records without `appointmentStatus` are grandfathered as accepted. */
export function isOfficerAppointmentConfirmed(
  officer?: Pick<OrganizationOfficerDocument, 'appointmentStatus' | 'isActive'> | null
): boolean {
  if (!officer || officer.isActive === false) return false;
  return !officer.appointmentStatus || officer.appointmentStatus === 'accepted';
}

export function isOfficerAppointmentPending(
  officer?: Pick<OrganizationOfficerDocument, 'appointmentStatus' | 'isActive'> | null
): boolean {
  if (!officer || officer.isActive === false) return false;
  return officer.appointmentStatus === 'pending_acceptance';
}

export function useOrgOfficers(orgId: string | null | undefined) {
  const [officers, setOfficers] = useState<OrganizationOfficerDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!orgId) {
      setOfficers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // If orgId is 'all', query all active officers regardless of organization
    const q = orgId === 'all'
      ? query(
          collection(db, 'organization_officers'),
          where('isActive', '==', true)
        )
      : query(
          collection(db, 'organization_officers'),
          where('organizationId', '==', orgId),
          where('isActive', '==', true)
        );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as OrganizationOfficerDocument[];
        
        // Sort in memory by studentName
        docs.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
        
        setOfficers(docs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useOrgOfficers] Error fetching officers:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [orgId]);

  return { officers, loading, error };
}

export function useAllActiveOfficers() {
  return useOrgOfficers('all');
}

