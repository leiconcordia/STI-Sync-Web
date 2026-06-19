import { useState } from 'react';
import * as eventConfigService from '../services/event-config.service';

export function useEventConfigMutations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleMutation = async <T,>(mutationFn: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mutationFn();
      return result;
    } catch (err) {
      console.error('Mutation error:', err);
      setError(err instanceof Error ? err : new Error('Unknown error occurred'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    
    // Event Types
    createEventType: (data: Parameters<typeof eventConfigService.createEventType>[0]) => 
      handleMutation(() => eventConfigService.createEventType(data)),
    updateEventType: (id: string, data: Parameters<typeof eventConfigService.updateEventType>[1]) => 
      handleMutation(() => eventConfigService.updateEventType(id, data)),
    archiveEventType: (id: string) => 
      handleMutation(() => eventConfigService.archiveEventType(id)),
    restoreEventType: (id: string) => 
      handleMutation(() => eventConfigService.restoreEventType(id)),
    deleteEventTypeForever: (id: string) => 
      handleMutation(() => eventConfigService.deleteEventTypeForever(id)),
      
    // Event Categories
    createEventCategory: (data: Parameters<typeof eventConfigService.createEventCategory>[0]) => 
      handleMutation(() => eventConfigService.createEventCategory(data)),
    updateEventCategory: (id: string, data: Parameters<typeof eventConfigService.updateEventCategory>[1]) => 
      handleMutation(() => eventConfigService.updateEventCategory(id, data)),
    archiveEventCategory: (id: string) => 
      handleMutation(() => eventConfigService.archiveEventCategory(id)),
    restoreEventCategory: (id: string) => 
      handleMutation(() => eventConfigService.restoreEventCategory(id)),
    deleteEventCategoryForever: (id: string) => 
      handleMutation(() => eventConfigService.deleteEventCategoryForever(id)),
      
    // Venues
    createVenue: (data: Parameters<typeof eventConfigService.createVenue>[0]) => 
      handleMutation(() => eventConfigService.createVenue(data)),
    updateVenue: (id: string, data: Parameters<typeof eventConfigService.updateVenue>[1]) => 
      handleMutation(() => eventConfigService.updateVenue(id, data)),
    archiveVenue: (id: string) => 
      handleMutation(() => eventConfigService.archiveVenue(id)),
    restoreVenue: (id: string) => 
      handleMutation(() => eventConfigService.restoreVenue(id)),
    deleteVenueForever: (id: string) => 
      handleMutation(() => eventConfigService.deleteVenueForever(id)),
  };
}
