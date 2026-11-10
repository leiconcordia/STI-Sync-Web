import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../../../services/firebase';
import type { DocumentDocument } from '../types/document.types';
import { ensureEdmsAccess, edmsRequest } from '../services/edms-api.service';
import { documentKind, ownsDocument } from '../utils/document-storage';

function hydrate(record: any): DocumentDocument {
  const result = { ...record };
  for (const name of ['createdAt', 'updatedAt', 'reviewedAt']) {
    const value = result[name];
    if (value && !value.toMillis) {
      const seconds = value.seconds ?? value._seconds;
      if (seconds !== undefined) result[name] = Timestamp.fromMillis(seconds * 1000);
    }
  }
  return result;
}

function sort(records: DocumentDocument[]) {
  return records.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export function useEdmsDocuments(orgId?: string | null, location: 'documents' | 'report_archives' = 'documents') {
  const scope = orgId === undefined ? 'admin' : orgId || '';
  const scopeKey = `${location}:${scope}`;
  const [state, setState] = useState<{ scope: string; data: DocumentDocument[]; loading: boolean; error: Error | null }>({
    scope: '',
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    let generation = 0;
    let unsub: (() => void) | undefined;
    setState({ scope: scopeKey, data: [], loading: true, error: null });

    const stopAuth = onAuthStateChanged(auth, async (user) => {
      const currentGeneration = ++generation;
      const current = () => live && currentGeneration === generation && auth.currentUser?.uid === user?.uid;
      unsub?.();
      setState({ scope: scopeKey, data: [], loading: !!user, error: null });
      if (!user || !scope) {
        if (current()) setState({ scope: scopeKey, data: [], loading: false, error: null });
        return;
      }

      try {
        // Resolve access gracefully without blocking on cloud function failure
        await ensureEdmsAccess().catch(() => ({ isAdmin: true, orgIds: [scope] }));
        if (!current()) return;

        let legacy: DocumentDocument[] = [];
        try {
          if (scope !== 'admin' || location !== 'documents') {
            const legacyRes = await edmsRequest('legacyDocuments', { ...(scope === 'admin' ? {} : { orgId: scope }), location });
            if (legacyRes?.documents && Array.isArray(legacyRes.documents)) {
              legacy = legacyRes.documents
                .map(hydrate)
                .filter((item: DocumentDocument) => location === 'report_archives' || item.visibility !== 'owner_and_sas' || item.isSasInternal !== false);
            }
          }
        } catch (e) {
          console.warn('[useEdmsDocuments] legacy lookup skipped:', e);
        }

        if (!current()) return;

        // Query Firestore submissions
        const filters = scope === 'admin'
          ? [where('type', '==', 'submission')]
          : [where('type', '==', 'submission'), where('submittedByOrgId', '==', scope)];

        unsub = onSnapshot(
          query(collection(db, location), ...filters),
          (snapshot) => {
            const records = new Map<string, DocumentDocument>(legacy.map((item: DocumentDocument) => [item.id, item]));
            snapshot.docs.forEach((item) => {
              const legacyIndex = legacy.findIndex((record: DocumentDocument) => record.id === item.id);
              if (legacyIndex >= 0) legacy.splice(legacyIndex, 1);
              records.set(item.id, { ...item.data(), id: item.id, archiveCollection: location } as DocumentDocument);
            });
            const data = [...records.values()].filter(
              (item) => (scope === 'admin' || ownsDocument(item, scope)) && (location === 'report_archives' ? documentKind(item) !== 'general' : documentKind(item) === 'general')
            );
            if (current()) setState({ scope: scopeKey, data: sort(data), loading: false, error: null });
          },
          (error) => {
            console.warn(`[useEdmsDocuments] Snapshot error on ${location}:`, error);
            if (current()) setState({ scope: scopeKey, data: [], loading: false, error: null });
          }
        );
      } catch (error: any) {
        console.warn(`[useEdmsDocuments] Error for ${scopeKey}:`, error);
        // Suppress raw 'internal' string from blocking the UI
        const displayError = error?.message && error.message !== 'internal' ? error : null;
        if (current()) setState({ scope: scopeKey, data: [], loading: false, error: displayError });
      }
    });

    return () => {
      live = false;
      unsub?.();
      stopAuth();
    };
  }, [scope, location, scopeKey]);

  return state.scope === scopeKey ? state : { data: [], loading: true, error: null };
}

export function useIncomingDocuments(includeWorkflow = false) {
  const result = useEdmsDocuments();
  return { ...result, data: includeWorkflow ? result.data : result.data.filter((item) => documentKind(item) === 'general') };
}

export function useOfficerSubmissions(orgId: string | null) {
  const result = useEdmsDocuments(orgId);
  return { ...result, data: result.data.filter((item) => documentKind(item) === 'general') };
}

function useBroadcasts(orgId?: string | null) {
  const scope = orgId === undefined ? 'admin' : orgId || '';
  const [state, setState] = useState<{ scope: string; data: DocumentDocument[]; loading: boolean; error: Error | null }>({
    scope: '',
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    let generation = 0;
    const unsubs: (() => void)[] = [];
    setState({ scope, data: [], loading: true, error: null });

    const stop = onAuthStateChanged(auth, async (user) => {
      const currentGeneration = ++generation;
      const current = () => live && currentGeneration === generation && auth.currentUser?.uid === user?.uid;
      setState({ scope, data: [], loading: !!user, error: null });
      unsubs.splice(0).forEach((fn) => fn());
      if (!user || !scope) {
        if (current()) setState({ scope, data: [], loading: false, error: null });
        return;
      }

      try {
        await ensureEdmsAccess().catch(() => ({ isAdmin: true, orgIds: [scope] }));
        if (!current()) return;

        const queries = scope === 'admin'
          ? [query(collection(db, 'documents'), where('type', '==', 'broadcast'))]
          : [
              query(collection(db, 'documents'), where('type', '==', 'broadcast'), where('distribution', '==', 'all')),
              query(collection(db, 'documents'), where('type', '==', 'broadcast'), where('targetOrgIds', 'array-contains', scope)),
            ];

        const results = new Map<number, DocumentDocument[]>();
        queries.forEach((q, index) =>
          unsubs.push(
            onSnapshot(
              q,
              (snapshot) => {
                results.set(index, snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as DocumentDocument)));
                const documents = new Map<string, DocumentDocument>();
                results.forEach((items) => items.forEach((item) => documents.set(item.id, item)));
                if (current()) setState({ scope, data: sort([...documents.values()]), loading: false, error: null });
              },
              (error) => {
                console.warn('[useBroadcasts] Snapshot error:', error);
                if (current()) setState({ scope, data: [], loading: false, error: null });
              }
            )
          )
        );
      } catch (error: any) {
        console.warn('[useBroadcasts] Error:', error);
        const displayError = error?.message && error.message !== 'internal' ? error : null;
        if (current()) setState({ scope, data: [], loading: false, error: displayError });
      }
    });

    return () => {
      live = false;
      stop();
      unsubs.forEach((fn) => fn());
    };
  }, [scope]);

  return state.scope === scope ? state : { data: [], loading: true, error: null };
}

export function useSentDocuments() {
  return useBroadcasts();
}

export function useOfficerInbox(orgId: string | null) {
  return useBroadcasts(orgId);
}

export function useDocument(docId: string | undefined) {
  const [state, setState] = useState<{ id?: string; data: DocumentDocument | null; loading: boolean; error: Error | null }>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    let generation = 0;
    let unsubscribe: (() => void) | undefined;
    setState({ id: docId, data: null, loading: true, error: null });

    const stop = onAuthStateChanged(auth, async (user) => {
      const currentGeneration = ++generation;
      const current = () => live && currentGeneration === generation && auth.currentUser?.uid === user?.uid;
      unsubscribe?.();
      setState({ id: docId, data: null, loading: true, error: null });
      if (!docId || !user) {
        if (current()) setState({ id: docId, data: null, loading: false, error: null });
        return;
      }

      try {
        await ensureEdmsAccess().catch(() => {});
        if (!current()) return;
        unsubscribe = onSnapshot(
          doc(db, 'documents', docId),
          (snapshot) => {
            if (current()) {
              setState({
                id: docId,
                data: snapshot.exists()
                  ? ({ ...snapshot.data(), id: snapshot.id, archiveCollection: 'documents' } as DocumentDocument)
                  : null,
                loading: false,
                error: null,
              });
            }
          },
          (error) => {
            console.warn('[useDocument] Snapshot error:', error);
            if (current()) setState({ id: docId, data: null, loading: false, error: null });
          }
        );
      } catch (error: any) {
        console.warn('[useDocument] Error:', error);
        const displayError = error?.message && error.message !== 'internal' ? error : null;
        if (current()) setState({ id: docId, data: null, loading: false, error: displayError });
      }
    });

    return () => {
      live = false;
      stop();
      unsubscribe?.();
    };
  }, [docId]);

  return state.id === docId ? state : { data: null, loading: true, error: null };
}
