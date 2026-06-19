import { useState } from 'react';
import { createEvent, saveEventDraft } from '../services/event.service';
import type { EventFormData } from '../types/event.types';
import { useAuth } from '../../auth/hooks/useAuth'; // Note: Adjust import based on actual auth hook location

export function useEventCreation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Using a mock UID if useAuth is not fully implemented yet, or assuming the environment gives us one.
  // Replace this with actual auth hook if available. For now we use "ADMIN-MOCK-UID".
  const uid = 'ADMIN-MOCK-UID';

  const handleCreateEvent = async (data: EventFormData): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const id = await createEvent(data, uid);
      setLoading(false);
      return id;
    } catch (err: any) {
      setError(err);
      setLoading(false);
      return null;
    }
  };

  const handleSaveDraft = async (data: EventFormData, existingId?: string): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const id = await saveEventDraft(data, uid, existingId);
      setLoading(false);
      return id;
    } catch (err: any) {
      setError(err);
      setLoading(false);
      return null;
    }
  };

  return {
    createEvent: handleCreateEvent,
    saveDraft: handleSaveDraft,
    loading,
    error
  };
}
