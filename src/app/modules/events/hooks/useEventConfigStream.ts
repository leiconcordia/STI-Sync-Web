import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { EventTypeDocument, EventCategoryDocument, VenueDocument } from '../types/event-config.types';

export function useEventTypesStream() {
  const [eventTypes, setEventTypes] = useState<EventTypeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'event_types'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setEventTypes(
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventTypeDocument))
        );
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching event types:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { eventTypes, loading, error };
}

export function useEventCategoriesStream() {
  const [categories, setCategories] = useState<EventCategoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'event_categories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setCategories(
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventCategoryDocument))
        );
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching event categories:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { categories, loading, error };
}

export function useVenuesStream() {
  const [venues, setVenues] = useState<VenueDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'venues'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setVenues(
          snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VenueDocument))
        );
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching venues:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { venues, loading, error };
}
