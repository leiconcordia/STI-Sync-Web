import { useState } from 'react';
import { createOrganization } from '../services/organization.service';
import { batchCreateOfficers } from '../services/officer.service';
import type { CreateOrganizationPayload } from '../types/organization.types';

export const useOrganizationMutations = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = async (
    payload: CreateOrganizationPayload, 
    createdBy: string,
    logoFile: File | null,
    officers: { roleId: string; studentId: string; studentName: string; email: string; password?: string; }[]
  ): Promise<{ success: boolean; id?: string; error?: string }> => {
    setIsSaving(true);
    setError(null);
    try {
      const orgId = await createOrganization(payload, createdBy, logoFile);
      if (officers.length > 0) {
        await batchCreateOfficers(orgId, officers);
      }
      return { success: true, id: orgId };
    } catch (e) {
      console.error("Mutation failed:", e);
      const err = e as Error;
      setError(err);
      return { success: false, error: err.message };
    } finally {
      setIsSaving(false);
    }
  };

  return { create, isSaving, error };
};
