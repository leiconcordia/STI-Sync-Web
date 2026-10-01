/**
 * src/app/modules/signatories/hooks/useSignatoryRolesStream.ts
 *
 * Real-time subscription hook for dynamic institutional signatory roles and hierarchy tiers.
 */

import { useState, useEffect } from 'react';
import {
  subscribeToSignatoryRoles,
} from '../services/signatory-role.service';
import {
  DEFAULT_SIGNATORY_ROLES,
  type SignatoryRoleDocument,
} from '../types/signatory-role.types';

export function useSignatoryRolesStream() {
  const [roles, setRoles] = useState<SignatoryRoleDocument[]>(() =>
    DEFAULT_SIGNATORY_ROLES.map((r) => ({
      id: `default_${r.code}`,
      ...r,
      archived: false,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      const unsubscribe = subscribeToSignatoryRoles((updatedRoles) => {
        setRoles(updatedRoles);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (err: any) {
      console.error('[useSignatoryRolesStream] Error subscribing to roles:', err);
      setError(err);
      setLoading(false);
    }
  }, []);

  return { roles, loading, error };
}
