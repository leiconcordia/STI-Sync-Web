import { collection, getDocs, type DocumentData } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { isAdministratorSignatory } from './signatory-filter.mjs';
import { formatPersonName } from '../../../utils/name.utils';

export type AccountKind = 'advisers' | 'students' | 'signatories';
export type AccountTabKind = 'all' | AccountKind;
export interface AccountRow {
  id: string;
  name: string;
  identifier: string;
  email: string;
  status: string;
  requiresPasswordChange: boolean;
  accountKind?: AccountKind;
}

const collections: Record<AccountKind, string> = {
  advisers: 'organization_advisers',
  students: 'students',
  signatories: 'institutional_signatories',
};

export function toAccountRow(id: string, data: DocumentData, accountKind?: AccountKind): AccountRow {
  const name = formatPersonName(data);
  return {
    id,
    name: name || data.name || 'Unnamed account',
    identifier: data.studentId || data.employeeId || '—',
    email: data.email || '',
    status: data.isActive === false ? 'INACTIVE' : String(data.status || 'ACTIVE').toUpperCase(),
    requiresPasswordChange: Boolean(data.tempPass || data.requiresPasswordChange || data.requiresChangePassword || data.resetInProgress),
    ...(accountKind ? { accountKind } : {}),
  };
}

export async function getAccounts(kind: AccountTabKind): Promise<AccountRow[]> {
  if (kind === 'all') {
    const [advisers, students, signatories] = await Promise.all([
      getAccounts('advisers'),
      getAccounts('students'),
      getAccounts('signatories'),
    ]);
    return [...advisers, ...students, ...signatories].sort((a, b) => a.name.localeCompare(b.name));
  }
  // Admins can also appear in the signatory collection. Compare both the
  // linked UID and normalized email, including inactive admin profiles.
  const [snapshot, adminSnapshot] = await Promise.all([
    getDocs(collection(db, collections[kind])),
    kind === 'signatories' ? getDocs(collection(db, 'sas_admins')) : Promise.resolve(null),
  ]);
  const adminUids = new Set(adminSnapshot?.docs.flatMap((item) => [item.id, item.data().uid].filter(Boolean)) || []);
  const adminEmails = new Set(adminSnapshot?.docs.map((item) => String(item.data().email || '').trim().toLowerCase()).filter(Boolean) || []);
  return snapshot.docs.filter((item) => {
    if (!adminSnapshot) return true;
    return !isAdministratorSignatory(item.id, item.data(), adminUids, adminEmails);
  }).map((item) => toAccountRow(item.id, item.data(), kind))
    .sort((a, b) => a.name.localeCompare(b.name));
}
