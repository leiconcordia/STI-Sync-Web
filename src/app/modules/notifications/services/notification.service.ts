/**
 * src/app/modules/notifications/services/notification.service.ts
 *
 * Real-time notification services for STI Sync.
 * Handles dispatching, querying, reading, and batch-marking notifications.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { createSingletonStream } from '../../../utils/createSingletonStream';
import type {
  InAppNotification,
  CreateNotificationInput,
  NotificationFilter,
} from '../types/notification.types';

export const NOTIFICATIONS_COLLECTION = 'notifications';

function matchesRecipientToken(
  recipientId: string | null | undefined,
  filterUserId: string | undefined
): boolean {
  if (!recipientId) return true;
  if (!filterUserId) return false;
  const targetTokens = recipientId
    .split(/[|,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const userTokens = filterUserId
    .split(/[|,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (targetTokens.length === 0 || userTokens.length === 0) return false;
  return targetTokens.some((token) => userTokens.includes(token));
}

/**
 * Dispatch an in-app notification.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string> {
  try {
    const derivedTokens = Array.from(
      new Set(
        [
          ...(input.recipientTokens || []),
          ...(input.recipientId ? input.recipientId.split(/[|,]+/) : []),
        ]
          .map((t) => String(t || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const notifsRef = collection(db, NOTIFICATIONS_COLLECTION);
    const newDoc = await addDoc(notifsRef, {
      recipientRole: input.recipientRole,
      recipientId: input.recipientId || null,
      recipientTokens: derivedTokens,
      targetOrgId: input.targetOrgId || null,
      targetOrgName: input.targetOrgName || null,
      type: input.type,
      category: input.category,
      title: input.title,
      message: input.message,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      actionRoute: input.actionRoute,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      isRead: false,
      readAt: null,
      isUrgent: Boolean(input.isUrgent),
      urgencyTier: input.urgencyTier || null,
      senderId: input.senderId || null,
      senderName: input.senderName || null,
      senderRoleTitle: input.senderRoleTitle || null,
      createdAt: serverTimestamp(),
    });
    return newDoc.id;
  } catch (error) {
    console.error('[notification.service] Failed to create notification:', error);
    throw error;
  }
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  if (!notificationId) return;
  try {
    const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await updateDoc(notifRef, {
      isRead: true,
      readAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`[notification.service] Failed to mark notification ${notificationId} as read:`, error);
  }
}

/**
 * Batch mark all notifications matching the recipient filter as read.
 */
export async function markAllNotificationsAsRead(
  notifications: InAppNotification[]
): Promise<void> {
  const unreadItems = notifications.filter((n) => !n.isRead);
  if (unreadItems.length === 0) return;

  try {
    const batch = writeBatch(db);
    unreadItems.forEach((n) => {
      const ref = doc(db, NOTIFICATIONS_COLLECTION, n.id);
      batch.update(ref, {
        isRead: true,
        readAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    console.error('[notification.service] Failed to batch mark notifications as read:', error);
  }
}

const rawNotificationsStream = createSingletonStream<InAppNotification[]>({
  initialData: [],
  start: (emit) => {
    const notifsRef = collection(db, NOTIFICATIONS_COLLECTION);
    const q = query(notifsRef, orderBy('createdAt', 'desc'), limit(50));

    return onSnapshot(
      q,
      (snapshot) => {
        const items: InAppNotification[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          items.push({
            id: docSnap.id,
            recipientRole: data.recipientRole,
            recipientId: data.recipientId,
            recipientTokens: Array.isArray(data.recipientTokens) ? data.recipientTokens : undefined,
            targetOrgId: data.targetOrgId,
            targetOrgName: data.targetOrgName,
            type: data.type,
            category: data.category,
            title: data.title,
            message: data.message,
            resourceId: data.resourceId,
            resourceType: data.resourceType,
            actionRoute: data.actionRoute,
            metadata: data.metadata,
            isRead: Boolean(data.isRead),
            readAt: data.readAt,
            isUrgent: Boolean(data.isUrgent),
            urgencyTier: data.urgencyTier,
            senderId: data.senderId,
            senderName: data.senderName,
            senderRoleTitle: data.senderRoleTitle,
            createdAt: data.createdAt,
          });
        });
        emit(items);
      },
      (err) => {
        console.warn('[notification.service] subscribeToNotifications snapshot error:', err);
        emit([]);
      }
    );
  },
});

function filterNotificationsForScope(
  rawItems: InAppNotification[],
  filter: NotificationFilter
): InAppNotification[] {
  const items: InAppNotification[] = [];

  for (const notif of rawItems) {
    if (filter.role === 'admin') {
      if (notif.recipientRole === 'admin' || notif.recipientRole === 'all') {
        items.push(notif);
      }
    } else if (filter.role === 'officer') {
      if (notif.recipientRole === 'all') {
        items.push(notif);
      } else if (notif.recipientRole === 'officer') {
        const orgMatches =
          !filter.orgId ||
          !notif.targetOrgId ||
          notif.targetOrgId.toLowerCase() === filter.orgId.toLowerCase();
        if (notif.recipientId) {
          if (orgMatches && matchesRecipientToken(notif.recipientId, filter.userId)) {
            items.push(notif);
          }
        } else if (
          orgMatches ||
          (filter.userId && matchesRecipientToken(notif.recipientId, filter.userId))
        ) {
          items.push(notif);
        }
      }
    } else if (filter.role === 'signatory') {
      if (notif.recipientRole === 'all') {
        items.push(notif);
      } else if (notif.recipientRole === 'signatory') {
        if (!notif.recipientId || matchesRecipientToken(notif.recipientId, filter.userId)) {
          items.push(notif);
        }
      } else if (filter.userId && notif.recipientId && matchesRecipientToken(notif.recipientId, filter.userId)) {
        items.push(notif);
      }
    } else {
      items.push(notif);
    }
  }

  return filter.unreadOnly ? items.filter((n) => !n.isRead) : items;
}

/**
 * Real-time subscription to notifications.
 * Multiplexed via a shared singleton stream so multiple NotificationDropdown mounts
 * (e.g. Signatory mobile + desktop bars) share a single 50-doc Firestore subscription.
 */
export function subscribeToNotifications(
  filter: NotificationFilter,
  callback: (notifications: InAppNotification[]) => void
): () => void {
  return rawNotificationsStream.subscribe((state) => {
    if (!state.loading) {
      callback(filterNotificationsForScope(state.data, filter));
    }
  });
}

