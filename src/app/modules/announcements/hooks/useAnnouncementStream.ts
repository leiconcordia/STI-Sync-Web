import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { AnnouncementDocument } from '../types/announcement.types';
import { ANNOUNCEMENTS_COLLECTION } from '../services/announcement.service';

export function useAnnouncementStream() {
  const [announcements, setAnnouncements] = useState<AnnouncementDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Note: Firestore doesn't support sorting by boolean (pinned) then descending date easily without composite indexes.
    // However, since we need pinned items first, we can just fetch all ordered by createdAt DESC,
    // and sort them locally, or set up a composite index if there are many.
    // For now, we'll fetch ordered by createdAt DESC and sort locally so pinned is at the top.
    const q = query(
      collection(db, ANNOUNCEMENTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnnouncementDocument));
        
        // Sort locally: pinned items first, then by createdAt (already ordered by createdAt from query)
        const sorted = docs.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return 0; // maintain original createdAt desc order for same pinned status
        });

        setAnnouncements(sorted);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching announcements:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { announcements, loading, error };
}
