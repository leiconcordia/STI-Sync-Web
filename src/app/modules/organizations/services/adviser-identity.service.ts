import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type { AdviserIdentity } from '../utils/adviser-identity.utils';

export const ADVISER_IDENTITY_SOURCES = [
  ['organization_advisers', 'adviser'], ['institutional_signatories', 'signatory'], ['sas_admins', 'admin'],
] as const;
export async function readAdviserIdentities() {
  const snapshots = await Promise.all([...ADVISER_IDENTITY_SOURCES.map(([name]) => getDocs(collection(db, name))), getDocs(collection(db, 'organizations'))]);
  const records: AdviserIdentity[] = ADVISER_IDENTITY_SOURCES.flatMap(([, sourceType], index) => snapshots[index].docs.map((record) => ({ ...record.data(), id: record.id, sourceType })));
  const organizations = snapshots.at(-1)!.docs.map((record) => ({ ...record.data(), id: record.id }));
  return { records, organizations };
}
