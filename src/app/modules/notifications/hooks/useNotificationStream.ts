/**
 * src/app/modules/notifications/hooks/useNotificationStream.ts
 *
 * Real-time notification hook for STI Sync.
 * Provides live notifications, unread count, and read status modifiers.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  InAppNotification,
  NotificationFilter,
  NotificationRole,
} from '../types/notification.types';
import {
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notification.service';

export function useNotificationStream(
  role: NotificationRole,
  orgId?: string,
  userId?: string
) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const filter: NotificationFilter = {
      role,
      orgId,
      userId,
      limitCount: 50,
    };

    const unsubscribe = subscribeToNotifications(filter, (items) => {
      setNotifications(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [role, orgId, userId]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    // Optimistic local update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    await markNotificationAsRead(notificationId);
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    // Optimistic local update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsAsRead(notifications);
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
  };
}

