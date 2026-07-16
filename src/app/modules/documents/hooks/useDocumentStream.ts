import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { DocumentDocument } from '../types/document.types';

const COL = 'documents';

function sortByCreatedAtDesc(a: DocumentDocument, b: DocumentDocument): number {
  const aTime = a.createdAt?.toMillis?.() ?? 0;
  const bTime = b.createdAt?.toMillis?.() ?? 0;
  return bTime - aTime;
}

// ─── Admin: Incoming submissions ─────────────────────────────────────────────

export function useIncomingDocuments() {
  const [data, setData] = useState<DocumentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, COL),
      where('type', '==', 'submission'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentDocument));
        docs.sort(sortByCreatedAtDesc);
        setData(docs);
        setLoading(false);
      },
      (err) => { console.error('[useIncomingDocuments]', err); setError(err); setLoading(false); },
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

// ─── Admin: Sent broadcasts ──────────────────────────────────────────────────

export function useSentDocuments() {
  const [data, setData] = useState<DocumentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, COL),
      where('type', '==', 'broadcast'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentDocument));
        docs.sort(sortByCreatedAtDesc);
        setData(docs);
        setLoading(false);
      },
      (err) => { console.error('[useSentDocuments]', err); setError(err); setLoading(false); },
    );
    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}

// ─── Officer: My submissions ─────────────────────────────────────────────────
// Uses single where clause on submittedByOrgId (most selective),
// filters type === 'submission' client-side to avoid composite index requirement.

export function useOfficerSubmissions(orgId: string | null) {
  const [data, setData] = useState<DocumentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!orgId) { setData([]); setLoading(false); return; }

    const q = query(
      collection(db, COL),
      where('submittedByOrgId', '==', orgId),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as DocumentDocument))
          .filter(d => d.type === 'submission');
        docs.sort(sortByCreatedAtDesc);
        setData(docs);
        setLoading(false);
      },
      (err) => { console.error('[useOfficerSubmissions]', err); setError(err); setLoading(false); },
    );
    return () => unsubscribe();
  }, [orgId]);

  return { data, loading, error };
}

// ─── Officer: Inbox (broadcasts targeting this org) ──────────────────────────
// Fetches all broadcasts, filters client-side by distribution/targetOrgIds
// since Firestore can't do OR logic across distribution === 'all' and array-contains.

export function useOfficerInbox(orgId: string | null) {
  const [data, setData] = useState<DocumentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!orgId) { setData([]); setLoading(false); return; }

    const q = query(
      collection(db, COL),
      where('type', '==', 'broadcast'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as DocumentDocument));
        const filtered = all.filter(d =>
          d.distribution === 'all' ||
          (d.targetOrgIds && d.targetOrgIds.includes(orgId))
        );
        filtered.sort(sortByCreatedAtDesc);
        setData(filtered);
        setLoading(false);
      },
      (err) => { console.error('[useOfficerInbox]', err); setError(err); setLoading(false); },
    );
    return () => unsubscribe();
  }, [orgId]);

  return { data, loading, error };
}

// ─── Shared: Single Document ─────────────────────────────────────────────────

export function useDocument(docId: string | undefined) {
  const [data, setData] = useState<DocumentDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!docId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, COL, docId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setData({ id: snap.id, ...snap.data() } as DocumentDocument);
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[useDocument]', err);
        setError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [docId]);

  return { data, loading, error };
}
