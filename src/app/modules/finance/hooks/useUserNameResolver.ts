import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { useStudents } from '../../students/hooks/useStudentStream';
import { registerSingletonResetter } from '../../../utils/createSingletonStream';

const PLACEHOLDER_BLACKLIST = new Set([
  'admin sao',
  'sao admin',
  'admin',
  'sao',
  'sao approval',
  'officer',
  'system',
  'organization creation',
  'sao org',
  'sas',
  'sas_admin',
  'sao_admin',
  'sao-adviser',
  'adviser',
  'null',
  'undefined',
  'anonymous',
  'user',
  'my organization',
]);

// Shared 5-minute TTL cache for staff/officer directory names so opening finance/org modals
// never spawns 5 full-collection onSnapshot listeners per mount.
const DIRECTORY_TTL_MS = 5 * 60 * 1000;
let cachedDirectoryMap: Map<string, string> | null = null;
let directoryFetchedAt = 0;
let inflightDirectoryPromise: Promise<Map<string, string>> | null = null;

registerSingletonResetter(() => {
  cachedDirectoryMap = null;
  directoryFetchedAt = 0;
  inflightDirectoryPromise = null;
});

async function loadDirectoryNames(): Promise<Map<string, string>> {
  if (cachedDirectoryMap && Date.now() - directoryFetchedAt < DIRECTORY_TTL_MS) {
    return cachedDirectoryMap;
  }
  if (inflightDirectoryPromise) {
    return inflightDirectoryPromise;
  }

  inflightDirectoryPromise = (async () => {
    const map = new Map<string, string>();

    const [officersSnap, advisersSnap, sasSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, 'organization_officers')).catch(() => null),
      getDocs(collection(db, 'organization_advisers')).catch(() => null),
      getDocs(collection(db, 'sas_admins')).catch(() => null),
      getDocs(collection(db, 'users')).catch(() => null),
    ]);

    officersSnap?.docs.forEach((d) => {
      const data = d.data();
      const officerName = data.studentName || data.name || data.fullName;
      if (officerName) {
        if (d.id) map.set(d.id.trim().toLowerCase(), officerName);
        if (data.authUid) map.set(String(data.authUid).trim().toLowerCase(), officerName);
        if (data.uid) map.set(String(data.uid).trim().toLowerCase(), officerName);
        if (data.studentId) map.set(String(data.studentId).trim().toLowerCase(), officerName);
        if (data.email) map.set(String(data.email).trim().toLowerCase(), officerName);
      }
    });

    advisersSnap?.docs.forEach((d) => {
      const data = d.data();
      const adviserName = data.name || data.fullName || data.adviserName;
      if (adviserName) {
        if (d.id) map.set(d.id.trim().toLowerCase(), adviserName);
        if (data.authUid) map.set(String(data.authUid).trim().toLowerCase(), adviserName);
        if (data.uid) map.set(String(data.uid).trim().toLowerCase(), adviserName);
        if (data.email) map.set(String(data.email).trim().toLowerCase(), adviserName);
      }
    });

    sasSnap?.docs.forEach((d) => {
      const data = d.data();
      const adminName = data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name;
      if (adminName) {
        if (d.id) map.set(d.id.trim().toLowerCase(), adminName);
        if (data.uid) map.set(String(data.uid).trim().toLowerCase(), adminName);
        if (data.authUid) map.set(String(data.authUid).trim().toLowerCase(), adminName);
        if (data.email) map.set(String(data.email).trim().toLowerCase(), adminName);
      }
    });

    usersSnap?.docs.forEach((d) => {
      const data = d.data();
      const userName = data.displayName || data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name;
      if (userName) {
        if (d.id) map.set(d.id.trim().toLowerCase(), userName);
        if (data.uid) map.set(String(data.uid).trim().toLowerCase(), userName);
        if (data.authUid) map.set(String(data.authUid).trim().toLowerCase(), userName);
        if (data.email) map.set(String(data.email).trim().toLowerCase(), userName);
      }
    });

    cachedDirectoryMap = map;
    directoryFetchedAt = Date.now();
    return map;
  })().finally(() => {
    inflightDirectoryPromise = null;
  });

  return inflightDirectoryPromise;
}

/**
 * Hook to resolve any User UID, Student ID, or Officer Email to their real human full name.
 * Reuses the shared `useStudents()` singleton for student names and a cached directory lookup
 * for officers/advisers/admins instead of opening 5 raw onSnapshot listeners per mount.
 */
export function useUserNameResolver() {
  const { data: students = [] } = useStudents();
  const [directoryMap, setDirectoryMap] = useState<Map<string, string>>(
    () => cachedDirectoryMap || new Map()
  );

  useEffect(() => {
    let active = true;
    loadDirectoryNames()
      .then((map) => {
        if (active) setDirectoryMap(map);
      })
      .catch((e) => {
        console.warn('[useUserNameResolver] Error loading name directory:', e);
      });
    return () => {
      active = false;
    };
  }, []);

  const nameMap = useMemo(() => {
    const merged = new Map<string, string>();
    students.forEach((data: any) => {
      const fullName = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
      if (fullName) {
        if (data.id) merged.set(String(data.id).trim().toLowerCase(), fullName);
        if (data.studentId) merged.set(String(data.studentId).trim().toLowerCase(), fullName);
        if (data.authUid) merged.set(String(data.authUid).trim().toLowerCase(), fullName);
        if (data.email) merged.set(String(data.email).trim().toLowerCase(), fullName);
      }
    });
    directoryMap.forEach((val, key) => {
      merged.set(key, val);
    });
    return merged;
  }, [students, directoryMap]);

  const resolveUserName = useCallback((rawString: string | null | undefined): string | null => {
    if (!rawString) return null;
    const clean = rawString.trim();
    if (!clean) return null;

    const lower = clean.toLowerCase();

    // If it's a generic placeholder, ignore and leave blank
    if (PLACEHOLDER_BLACKLIST.has(lower)) {
      return null;
    }

    // Check if it matches an entry in our database
    const matched = nameMap.get(lower);
    if (matched && !PLACEHOLDER_BLACKLIST.has(matched.toLowerCase())) {
      return matched;
    }

    // Check if clean is a UID / batch ID / numeric ID
    const isNumericOrId = /^\d+$/.test(clean) || clean.startsWith('TRANS-') || (clean.length >= 20 && !clean.includes(' '));
    if (isNumericOrId) {
      // Unresolved ID -> leave blank
      return null;
    }

    // Check if clean is an email address
    if (clean.includes('@')) {
      return null;
    }

    // If it is a multi-word person name (e.g. "Juan Dela Cruz")
    const words = clean.split(/\s+/);
    if (words.length >= 2 && !PLACEHOLDER_BLACKLIST.has(lower)) {
      return clean;
    }

    return null;
  }, [nameMap]);

  return { resolveUserName, nameMap };
}
