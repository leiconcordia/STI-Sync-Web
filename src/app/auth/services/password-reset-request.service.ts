import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { createNotification } from '../../modules/notifications/services/notification.service';
import type { AccountKind } from '../../modules/accounts/services/account-directory.service';

export const PASSWORD_RESET_REQUESTS_COLLECTION = 'password_reset_requests';

export type PortalAccountType = 'all' | 'officer' | 'adviser' | 'signatory';

export interface PasswordResetRequestDocument {
  id: string;
  identifier: string;
  accountType?: PortalAccountType;
  mappedKind?: AccountKind | 'all';
  organizationHint?: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  requestedAt: any;
  resolvedAt?: any;
  resolvedBy?: string | null;
}

export function mapPortalAccountTypeToKind(accountType?: PortalAccountType): AccountKind | 'all' {
  if (accountType === 'adviser') return 'advisers';
  if (accountType === 'signatory') return 'signatories';
  if (accountType === 'officer') return 'students';
  return 'all';
}

export function formatPortalAccountTypeLabel(accountType?: PortalAccountType): string {
  if (accountType === 'adviser') return 'Club Adviser';
  if (accountType === 'signatory') return 'Institutional Signatory';
  if (accountType === 'officer') return 'Student Officer';
  return 'Portal Account';
}

export async function submitPasswordResetRequest(input: {
  identifier: string;
  accountType?: PortalAccountType;
  organizationHint?: string;
}): Promise<string> {
  const cleanIdentifier = input.identifier.trim();
  if (!cleanIdentifier) {
    throw new Error('Please enter your Student ID, Employee ID, or institutional email.');
  }

  const accountType: PortalAccountType = input.accountType || 'all';
  const mappedKind = mapPortalAccountTypeToKind(accountType);
  const typeLabel = formatPortalAccountTypeLabel(accountType);
  const cleanHint = (input.organizationHint || '').trim();

  const docRef = await addDoc(collection(db, PASSWORD_RESET_REQUESTS_COLLECTION), {
    identifier: cleanIdentifier,
    accountType,
    mappedKind,
    organizationHint: cleanHint || null,
    status: 'pending',
    requestedAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });

  const hintSuffix = cleanHint ? ` (${cleanHint})` : '';
  await createNotification({
    recipientRole: 'admin',
    type: 'password_reset_request',
    category: 'system',
    isUrgent: true,
    title: 'Password Reset Requested',
    message: `${cleanIdentifier}${hintSuffix} requested a portal password reset.`,
    resourceId: docRef.id,
    resourceType: 'system',
    actionRoute: `/home/account-management?kind=all&search=${encodeURIComponent(cleanIdentifier)}`,
    senderName: cleanIdentifier,
    senderRoleTitle: typeLabel,
  });

  return docRef.id;
}

export function subscribePendingPasswordResetRequests(
  onUpdate: (requests: PasswordResetRequestDocument[]) => void
): () => void {
  const q = query(
    collection(db, PASSWORD_RESET_REQUESTS_COLLECTION),
    where('status', '==', 'pending')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as PasswordResetRequestDocument[];

      items.sort((a, b) => {
        const msA = a.requestedAt?.toMillis?.() ?? 0;
        const msB = b.requestedAt?.toMillis?.() ?? 0;
        return msB - msA;
      });

      onUpdate(items);
    },
    (err) => {
      console.error('[password-reset-request.service] Listener error:', err);
      onUpdate([]);
    }
  );
}

export async function resolvePasswordResetRequest(
  requestId: string,
  resolvedBy: string
): Promise<void> {
  if (!requestId) return;
  await updateDoc(doc(db, PASSWORD_RESET_REQUESTS_COLLECTION, requestId), {
    status: 'resolved',
    resolvedAt: serverTimestamp(),
    resolvedBy,
  });
}

export async function dismissPasswordResetRequest(
  requestId: string,
  dismissedBy: string
): Promise<void> {
  if (!requestId) return;
  await updateDoc(doc(db, PASSWORD_RESET_REQUESTS_COLLECTION, requestId), {
    status: 'dismissed',
    resolvedAt: serverTimestamp(),
    resolvedBy: dismissedBy,
  });
}

