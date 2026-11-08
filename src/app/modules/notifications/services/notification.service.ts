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
import type {
  InAppNotification,
  CreateNotificationInput,
  NotificationFilter,
} from '../types/notification.types';

export const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Dispatch an in-app notification.
 */
export async function createNotification(input: CreateNotificationInput): Promise<string> {
  try {
    const notifsRef = collection(db, NOTIFICATIONS_COLLECTION);
    const newDoc = await addDoc(notifsRef, {
      recipientRole: input.recipientRole,
      recipientId: input.recipientId || null,
      targetOrgId: input.targetOrgId || null,
      targetOrgName: input.targetOrgName || null,
      type: input.type,
      category: input.category,
      title: input.title,
      message: input.message,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      actionRoute: input.actionRoute,
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

/**
 * Real-time subscription to notifications.
 * Queries recent notifications and applies client-side scope filtering
 * to avoid requiring complex composite Firestore indexes.
 */
export function subscribeToNotifications(
  filter: NotificationFilter,
  callback: (notifications: InAppNotification[]) => void
): () => void {
  const notifsRef = collection(db, NOTIFICATIONS_COLLECTION);
  const maxLimit = filter.limitCount || 100;
  const q = query(notifsRef, orderBy('createdAt', 'desc'), limit(maxLimit));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: InAppNotification[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const notif: InAppNotification = {
          id: docSnap.id,
          recipientRole: data.recipientRole,
          recipientId: data.recipientId,
          targetOrgId: data.targetOrgId,
          targetOrgName: data.targetOrgName,
          type: data.type,
          category: data.category,
          title: data.title,
          message: data.message,
          resourceId: data.resourceId,
          resourceType: data.resourceType,
          actionRoute: data.actionRoute,
          isRead: Boolean(data.isRead),
          readAt: data.readAt,
          isUrgent: Boolean(data.isUrgent),
          urgencyTier: data.urgencyTier,
          senderId: data.senderId,
          senderName: data.senderName,
          senderRoleTitle: data.senderRoleTitle,
          createdAt: data.createdAt,
        };

        // Scope filter
        if (filter.role === 'admin') {
          // Admin receives admin-targeted and global notifications
          if (notif.recipientRole === 'admin' || notif.recipientRole === 'all') {
            items.push(notif);
          }
        } else if (filter.role === 'officer') {
          // Officer receives officer-targeted notifications for their organization or user
          if (notif.recipientRole === 'officer' || notif.recipientRole === 'all') {
            if (
              !filter.orgId ||
              !notif.targetOrgId ||
              notif.targetOrgId.toLowerCase() === filter.orgId.toLowerCase() ||
              (filter.userId && notif.recipientId === filter.userId)
            ) {
              items.push(notif);
            }
          }
        } else if (filter.role === 'signatory') {
          if (
            notif.recipientRole === 'signatory' ||
            notif.recipientRole === 'all' ||
            (filter.userId && notif.recipientId === filter.userId)
          ) {
            items.push(notif);
          }
        } else {
          items.push(notif);
        }
      });

      if (filter.unreadOnly) {
        callback(items.filter((n) => !n.isRead));
      } else {
        callback(items);
      }
    },
    (err) => {
      console.warn('[notification.service] subscribeToNotifications snapshot error:', err);
      callback([]);
    }
  );
}

