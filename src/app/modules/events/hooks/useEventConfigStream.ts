import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { EventTypeDocument, EventCategoryDocument, VenueDocument } from '../types/event-config.types';
import { createSingletonStream } from '../../../utils/createSingletonStream';

const eventTypesStream = createSingletonStream<EventTypeDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    return onSnapshot(
      collection(db, 'event_types'),
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventTypeDocument));
        docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        emit(docs);
      },
      (err) => {
        console.warn('Error fetching event types:', err);
        emitError(err);
      }
    );
  },
});

const eventCategoriesStream = createSingletonStream<EventCategoryDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    return onSnapshot(
      collection(db, 'event_categories'),
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as EventCategoryDocument));
        docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        emit(docs);
      },
      (err) => {
        console.warn('Error fetching event categories:', err);
        emitError(err);
      }
    );
  },
});

const venuesStream = createSingletonStream<VenueDocument[]>({
  initialData: [],
  start: (emit, emitError) => {
    return onSnapshot(
      collection(db, 'venues'),
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as VenueDocument));
        docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        emit(docs);
      },
      (err) => {
        console.warn('Error fetching venues:', err);
        emitError(err);
      }
    );
  },
});

export function useEventTypesStream() {
  const { data: eventTypes, loading, error } = eventTypesStream.use();
  return { eventTypes, loading, error };
}

export function useEventCategoriesStream() {
  const { data: categories, loading, error } = eventCategoriesStream.use();
  return { categories, loading, error };
}

export function useVenuesStream() {
  const { data: venues, loading, error } = venuesStream.use();
  return { venues, loading, error };
}
