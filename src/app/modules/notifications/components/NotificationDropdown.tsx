/**
 * src/app/modules/notifications/components/NotificationDropdown.tsx
 *
 * Real-time Notification Bell & Interactive Dropdown Menu for STI Sync.
 * Supports SAS Admin and Student Organization Officer views with deep navigation.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Bell,
  CheckCheck,
  FileText,
  Receipt,
  FileCheck2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ChevronRight,
  FolderOpen,
} from 'lucide-react';
import type {
  InAppNotification,
  NotificationRole,
  NotificationType,
  NotificationCategory,
} from '../types/notification.types';
import { useNotificationStream } from '../hooks/useNotificationStream';
import { stripSasPhrases } from '../../events/utils/organization-display.utils';

function cleanNotificationMessage(message?: string): string {
  if (!message) return '';
  // If the message is strictly 'Student Affairs & Services (SAS) submitted...', don't strip
  if (/^Student Affairs\s*(?:&|and)?\s*Services(?:\s*\(SAS\))?\s+(?:submitted|endorsed|returned|approved|rejected)\b/i.test(message)) {
    return message;
  }
  if (/^Student Affairs Office(?:\s*\(SAO\))?\s+(?:submitted|endorsed|returned|approved|rejected)\b/i.test(message)) {
    return message;
  }
  if (/^(?:SAS|SAO)\s+(?:submitted|endorsed|returned|approved|rejected)\b/i.test(message)) {
    return message;
  }
  return message
    .replace(/^Student Affairs\s*(?:&|and)?\s*Services(?:\s*\(SAS\))?[,\s]*/i, '')
    .replace(/^Student Affairs Office(?:\s*\(SAO\))?[,\s]*/i, '')
    .replace(/^(?:SAS|SAO)[,\s]*/i, '');
}

function cleanNotificationTargetOrg(targetOrgName?: any): string {
  if (!targetOrgName) return '';
  if (Array.isArray(targetOrgName)) {
    const filtered = targetOrgName
      .filter((n: any) => typeof n === 'string' && stripSasPhrases(n).length > 0)
      .map((n: string) => n.trim());
    return filtered.length > 0 ? filtered.join(', ') : (targetOrgName[0] || '');
  }
  if (typeof targetOrgName === 'string') {
    const stripped = stripSasPhrases(targetOrgName);
    return stripped || targetOrgName;
  }
  return String(targetOrgName);
}

interface NotificationDropdownProps {
  role: NotificationRole;
  orgId?: string;
  userId?: string;
  className?: string;
}

export function NotificationDropdown({
  role,
  orgId,
  userId,
  className = '',
}: NotificationDropdownProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotificationStream(role, orgId, userId);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const displayedNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, activeTab]);

  const handleNotificationClick = async (item: InAppNotification) => {
    if (!item.isRead) {
      await markAsRead(item.id);
    }
    setIsOpen(false);
    if (item.actionRoute) {
      navigate(item.actionRoute);
    }
  };

  const formatRelativeTime = (timestamp: any): string => {
    if (!timestamp) return 'Just now';
    let millis = 0;
    if (typeof timestamp.toMillis === 'function') {
      millis = timestamp.toMillis();
    } else if (typeof timestamp === 'number') {
      millis = timestamp;
    } else if (timestamp.seconds) {
      millis = timestamp.seconds * 1000;
    } else {
      millis = new Date(timestamp).getTime();
    }

    if (isNaN(millis) || millis === 0) return 'Just now';

    const diff = Date.now() - millis;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 45) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(millis).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderIcon = (type: NotificationType, category: NotificationCategory, isUrgent?: boolean) => {
    if (isUrgent || type === 'liquidation_reminder') {
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
      );
    }

    if (type === 'document_returned' || type === 'document_rejected') {
      return (
        <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
          <RotateCcw className="w-4 h-4" />
        </div>
      );
    }

    if (type === 'document_approved') {
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      );
    }

    switch (category) {
      case 'financial_liquidation':
        return (
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
        );
      case 'post_activity_report':
        return (
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <FileCheck2 className="w-4 h-4" />
          </div>
        );
      case 'incoming_document':
        return (
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
            <FolderOpen className="w-4 h-4" />
          </div>
        );
      case 'activity_proposal':
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* ── Bell Trigger Button ── */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
        className="relative p-2 text-[#001A4D] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
        aria-label="View notifications"
      >
        <Bell className="w-5 h-5 text-[#001A4D]" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-[#E24B4A] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs animate-in zoom-in-75">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown Popover ── */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-92 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#001A4D]">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#001A4D] text-[#FFD41C]">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-slate-100 px-3 pt-2 bg-white text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`pb-2 px-2.5 font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`pb-2 px-2.5 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'unread'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-blue-600" />
              )}
            </button>
          </div>

          {/* Notification List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
            {displayedNotifications.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-2">
                  <Sparkles className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-xs font-bold text-slate-700">All caught up!</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {activeTab === 'unread'
                    ? 'No unread notifications to review.'
                    : 'No notifications recorded yet.'}
                </p>
              </div>
            ) : (
              displayedNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-blue-50/40 ${
                    !item.isRead ? 'bg-blue-50/25' : 'bg-white'
                  }`}
                >
                  {renderIcon(item.type, item.category, item.isUrgent)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1.5">
                      <h4
                        className={`text-xs truncate ${
                          !item.isRead ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                        }`}
                      >
                        {item.title}
                      </h4>
                      {!item.isRead && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-1" />
                      )}
                    </div>

                    <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                      {cleanNotificationMessage(item.message)}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {cleanNotificationTargetOrg(item.targetOrgName) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {cleanNotificationTargetOrg(item.targetOrgName)}
                        </span>
                      )}
                      {item.isUrgent && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                          Urgent
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-medium">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-300 self-center flex-shrink-0" />
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="p-2 bg-slate-50 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-400">
              STI Sync Real-time Notification Engine
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationDropdown;

