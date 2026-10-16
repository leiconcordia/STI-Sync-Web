/**
 * src/app/modules/events/components/AttendanceScannersModal.tsx
 *
 * Dedicated Modal for Activity Attendance, Sessions & Scanners:
 * - QR Gate Tickets enforcement
 * - Multi-Session Creation with Custom Names & Date Pickers
 * - Strict Date Validation (session date >= proposal target date)
 * - Real-Time Conflict Detection Engine (overlapping scan windows on the same date)
 * - Configurable Late Marking Toggle (Mark Late After [Time])
 * - Optional Time-Out Window (can be enabled or omitted)
 * - Granular Scanner Permissions (canTimeOut, allowManualAttendance)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  QrCode,
  Clock,
  Users,
  CheckCircle2,
  Calendar,
  Save,
  Search,
  Check,
  Plus,
  Lock,
  AlertTriangle,
  Trash2,
  AlertCircle,
  HelpCircle,
  Shield,
} from 'lucide-react';
import { doc, updateDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument, EventSession, EventScanner } from '../types/event.types';
import { useOrgOfficers } from '../../organizations/hooks/useOrgOfficers';
import { useAllEvents } from '../hooks/useEventStream';
import { toast } from 'sonner';
import {
  timeToMinutes,
  formatTime12Hour,
  addMinutesToTime,
} from '../utils/event-validation';

export interface SessionTimeErrors {
  timeInOpen?: string;
  timeInClose?: string;
  markLateAfter?: string;
  timeOutOpen?: string;
  timeOutClose?: string;
}

export interface CrossActivityConflict {
  officerUserId: string;
  officerName: string;
  conflictingEventId: string;
  conflictingEventTitle: string;
  conflictingReferenceNo?: string;
  sessionTitle: string;
  date: string;
  timeWindow: string;
  currentSessionTitle: string;
  currentDate: string;
  currentTimeWindow: string;
}

export function getSessionTimingStatus(session: EventSession): 'upcoming' | 'active' | 'concluded' {
  if (!session.date) return 'upcoming';

  const now = new Date();
  const currentYMD = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

  if (session.date > currentYMD) {
    return 'upcoming';
  }
  if (session.date < currentYMD) {
    return 'concluded';
  }

  const currentMins = now.getHours() * 60 + now.getMinutes();
  const startMins = session.timeInOpen ? timeToMinutes(session.timeInOpen) : 0;
  const endMins = session.hasTimeOut && session.timeOutClose
    ? timeToMinutes(session.timeOutClose)
    : session.timeInClose
    ? timeToMinutes(session.timeInClose)
    : 1439;

  if (currentMins < startMins) {
    return 'upcoming';
  }
  if (currentMins > endMins) {
    return 'concluded';
  }
  return 'active';
}

interface AttendanceScannersModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: EventDocument;
  onUpdated?: () => void;
  readOnly?: boolean;
}

export default function AttendanceScannersModal({
  isOpen,
  onClose,
  activity,
  onUpdated,
  readOnly = false,
}: AttendanceScannersModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  // Attendance toggles
  const [enableQRTickets, setEnableQRTickets] = useState<boolean>(
    activity.enableQRTickets !== false && (activity as any).enableQR !== false
  );
  const [attendanceEnabled, setAttendanceEnabled] = useState<boolean>(
    activity.attendanceEnabled !== false
  );

  // Proposal base implementation date
  const proposalDate =
    (activity as any).date ||
    (activity as any).targetImplementationDate ||
    '';

  // Sessions
  const [sessions, setSessions] = useState<EventSession[]>([]);

  // Assigned Scanners
  const [assignedScanners, setAssignedScanners] = useState<EventScanner[]>(
    activity.scanners || []
  );

  // Search filter for officer roster
  const [officerSearch, setOfficerSearch] = useState('');

  // Fetch active officers from organization / campus roster
  const orgIdToQuery =
    activity.hostingOrgId && activity.hostingOrgId !== 'sas'
      ? activity.hostingOrgId
      : 'all';
  const { officers: officerRoster = [], loading: loadingOfficers } = useOrgOfficers(orgIdToQuery);
  const { officers: allCampusOfficers = [] } = useOrgOfficers('all');
  const availableOfficers = officerRoster.length > 0 ? officerRoster : allCampusOfficers;

  // Real-time campus-wide activities for cross-event scanner conflict detection
  const { events: allCampusEvents = [] } = useAllEvents();

  useEffect(() => {
    if (!activity) return;

    const baseDate =
      (activity as any).date ||
      (activity as any).targetImplementationDate ||
      '';

    const populateFromData = (data: any) => {
      setEnableQRTickets(
        data.enableQRTickets !== false && (data as any).enableQR !== false
      );
      setAttendanceEnabled(data.attendanceEnabled !== false);

      if (data.sessions && Array.isArray(data.sessions) && data.sessions.length > 0) {
        setSessions(
          data.sessions.map((s: any, idx: number) => ({
            id: s.id || `sess_${idx + 1}_${Date.now()}`,
            title: s.title || s.name || `Session ${idx + 1}`,
            name: s.title || s.name || `Session ${idx + 1}`,
            date: s.date || baseDate,
            startTime: s.startTime || '08:00',
            endTime: s.endTime || '12:00',
            timeInOpen: s.timeInOpen || s.startTime || '07:30',
            timeInClose: s.timeInClose || '09:00',
            isLateEnabled: Boolean(s.isLateEnabled),
            markLateAfter: s.markLateAfter || '08:15',
            hasTimeOut: Boolean(s.hasTimeOut),
            timeOutOpen: s.timeOutOpen || '',
            timeOutClose: s.timeOutClose || '',
          }))
        );
      } else {
        setSessions([
          {
            id: `sess_1_${Date.now()}`,
            title: 'Main Session',
            name: 'Main Session',
            date: baseDate,
            startTime: (data as any).startTime || '08:00',
            endTime: (data as any).endTime || '12:00',
            timeInOpen: '07:30',
            timeInClose: '09:00',
            isLateEnabled: false,
            markLateAfter: '08:15',
            hasTimeOut: false,
            timeOutOpen: '',
            timeOutClose: '',
          },
        ]);
      }

      setAssignedScanners(
        (data.scanners || []).map((sc: any) => ({
          ...sc,
          canCheckIn: sc.canCheckIn ?? true,
          canCheckOut: sc.canCheckOut ?? true,
          allowManualAttendance: sc.allowManualAttendance ?? true,
          assignedSessionIds: sc.assignedSessionIds || [],
        }))
      );
    };

    // 1. Initial hydration from activity prop
    populateFromData(activity);

    // 2. Real-time document subscription when modal is open to ensure saved sessions & scanners are always current
    if (isOpen && activity.id) {
      const unsub = onSnapshot(doc(db, ACTIVITIES_COLLECTION, activity.id), (snap) => {
        if (snap.exists()) {
          const fresh = snap.data();
          if (fresh.sessions && fresh.sessions.length > 0) {
            populateFromData({ id: snap.id, ...fresh });
          }
        }
      });
      return () => unsub();
    }
  }, [activity, isOpen]);

  // Filtered officers
  const filteredOfficers = useMemo(() => {
    const query = officerSearch.trim().toLowerCase();
    if (!query) return availableOfficers;
    return availableOfficers.filter(
      (o) =>
        (o.studentName && o.studentName.toLowerCase().includes(query)) ||
        (o.studentId && o.studentId.toLowerCase().includes(query)) ||
        (o.roleId && o.roleId.toLowerCase().includes(query))
    );
  }, [availableOfficers, officerSearch]);

  const isPublished = Boolean(
    (activity as any).isPublished === true ||
    activity.status === 'published' ||
    activity.lifecycleStatus === 'published' ||
    (activity as any).isDirectPublished === true
  );

  // Date validation: Session date >= proposal date
  const dateErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!proposalDate) return errors;

    for (const s of sessions) {
      if (s.date && s.date < proposalDate) {
        errors[s.id] = `Date (${s.date}) cannot be earlier than the proposal date (${proposalDate}).`;
      }
    }
    return errors;
  }, [sessions, proposalDate]);

  // Intra-Session Time Validation: Prevent crossing times and invalid scan windows
  const sessionTimeErrors = useMemo(() => {
    const errors: Record<string, SessionTimeErrors> = {};

    for (const s of sessions) {
      const sErrors: SessionTimeErrors = {};
      const openMins = s.timeInOpen ? timeToMinutes(s.timeInOpen) : null;
      const closeMins = s.timeInClose ? timeToMinutes(s.timeInClose) : null;

      // 1. Time-In Scan Window
      if (!s.timeInOpen) {
        sErrors.timeInOpen = 'Time-In Opens time is required.';
      }

      if (!s.timeInClose) {
        sErrors.timeInClose = 'Time-In Cutoff time is required.';
      } else if (openMins !== null && closeMins !== null && closeMins <= openMins) {
        sErrors.timeInClose = `Time-In Cutoff must be later than Time-In Opens (${formatTime12Hour(s.timeInOpen)}).`;
      }

      // 2. Late Arrival Tagging Window
      if (s.isLateEnabled) {
        if (!s.markLateAfter) {
          sErrors.markLateAfter = 'Late threshold time is required.';
        } else {
          const lateMins = timeToMinutes(s.markLateAfter);
          if (openMins !== null && lateMins <= openMins) {
            sErrors.markLateAfter = `Late threshold (${formatTime12Hour(s.markLateAfter)}) cannot be earlier than or equal to Time-In Opens (${formatTime12Hour(s.timeInOpen)}).`;
          } else if (closeMins !== null && openMins !== null && closeMins > openMins && lateMins >= closeMins) {
            sErrors.markLateAfter = `Late threshold (${formatTime12Hour(s.markLateAfter)}) cannot be later than or equal to Time-In Cutoff (${formatTime12Hour(s.timeInClose)}).`;
          }
        }
      }

      // 3. Time-Out Scan Window
      if (s.hasTimeOut) {
        const outOpenMins = s.timeOutOpen ? timeToMinutes(s.timeOutOpen) : null;
        const outCloseMins = s.timeOutClose ? timeToMinutes(s.timeOutClose) : null;

        if (!s.timeOutOpen) {
          sErrors.timeOutOpen = 'Time-Out Opens time is required.';
        } else if (closeMins !== null && outOpenMins !== null && outOpenMins < closeMins) {
          sErrors.timeOutOpen = `Time-Out cannot open before Time-In Cutoff (${formatTime12Hour(s.timeInClose)}).`;
        } else if (openMins !== null && outOpenMins !== null && outOpenMins <= openMins) {
          sErrors.timeOutOpen = `Time-Out must open after Time-In Opens (${formatTime12Hour(s.timeInOpen)}).`;
        }

        if (!s.timeOutClose) {
          sErrors.timeOutClose = 'Time-Out Closes time is required.';
        } else if (outOpenMins !== null && outCloseMins !== null && outCloseMins <= outOpenMins) {
          sErrors.timeOutClose = `Time-Out Closes must be later than Time-Out Opens (${formatTime12Hour(s.timeOutOpen)}).`;
        }
      }

      if (Object.keys(sErrors).length > 0) {
        errors[s.id] = sErrors;
      }
    }

    return errors;
  }, [sessions]);

  const hasAnyTimeErrors = useMemo(() => {
    return Object.keys(sessionTimeErrors).length > 0;
  }, [sessionTimeErrors]);

  // Conflict Engine: detect overlapping scan windows on the same date using minutes
  const sessionConflicts = useMemo(() => {
    const byDate = new Map<string, EventSession[]>();
    for (const s of sessions) {
      if (!s.date) continue;
      const list = byDate.get(s.date) || [];
      list.push(s);
      byDate.set(s.date, list);
    }

    const conflicts: string[] = [];

    for (const [date, dateSessions] of byDate.entries()) {
      if (dateSessions.length < 2) continue;

      for (let i = 0; i < dateSessions.length; i++) {
        for (let j = i + 1; j < dateSessions.length; j++) {
          const s1 = dateSessions[i];
          const s2 = dateSessions[j];

          const s1Start = timeToMinutes(s1.timeInOpen || s1.startTime || '00:00');
          const s1End = timeToMinutes(
            s1.hasTimeOut && s1.timeOutClose
              ? s1.timeOutClose
              : s1.timeInClose || s1.endTime || '23:59'
          );

          const s2Start = timeToMinutes(s2.timeInOpen || s2.startTime || '00:00');
          const s2End = timeToMinutes(
            s2.hasTimeOut && s2.timeOutClose
              ? s2.timeOutClose
              : s2.timeInClose || s2.endTime || '23:59'
          );

          if (s1Start < s2End && s2Start < s1End) {
            const s1Label = `${formatTime12Hour(s1.timeInOpen || s1.startTime)} - ${formatTime12Hour(s1.hasTimeOut && s1.timeOutClose ? s1.timeOutClose : s1.timeInClose || s1.endTime)}`;
            const s2Label = `${formatTime12Hour(s2.timeInOpen || s2.startTime)} - ${formatTime12Hour(s2.hasTimeOut && s2.timeOutClose ? s2.timeOutClose : s2.timeInClose || s2.endTime)}`;
            conflicts.push(
              `Conflict on ${date}: "${s1.title || s1.name}" (${s1Label}) overlaps with "${s2.title || s2.name}" (${s2Label}).`
            );
          }
        }
      }
    }

    return conflicts;
  }, [sessions]);

  // Cross-Activity Scanner Conflict Detection Engine
  const crossActivityConflicts = useMemo(() => {
    const map = new Map<string, CrossActivityConflict[]>();
    if (!allCampusEvents.length || !sessions.length) return map;

    // Filter other active/published campus activities with designated scanners
    const otherEvents = allCampusEvents.filter((ev) => {
      if (ev.id === activity.id) return false;
      const isCancelled =
        ev.status === 'cancelled' ||
        ev.lifecycleStatus === 'cancelled' ||
        (ev as any).isCancelled === true;
      const isRejected =
        (ev as any).proposalStatus === 'rejected' || ev.status === 'rejected';
      if (isCancelled || isRejected) return false;
      return Array.isArray(ev.scanners) && ev.scanners.length > 0;
    });

    if (!otherEvents.length) return map;

    for (const other of otherEvents) {
      const otherScanners = other.scanners || [];
      const otherSessions: EventSession[] =
        other.sessions && other.sessions.length > 0
          ? other.sessions
          : [
              {
                id: 'def',
                title: 'Main Session',
                date:
                  (other as any).date ||
                  (other as any).targetImplementationDate ||
                  '',
                startTime: (other as any).startTime || '08:00',
                endTime: (other as any).endTime || '12:00',
                timeInOpen:
                  (other as any).timeInOpen ||
                  (other as any).startTime ||
                  '07:30',
                timeInClose:
                  (other as any).timeInClose ||
                  (other as any).endTime ||
                  '12:00',
                hasTimeOut: false,
              },
            ];

      for (const sc of otherScanners) {
        const officerUserId = sc.officerUserId || '';
        const officerNameLower = sc.officerName ? sc.officerName.toLowerCase().trim() : '';

        // Identify other event sessions this scanner is designated for
        const relevantOtherSessions =
          sc.assignedSessionIds && sc.assignedSessionIds.length > 0
            ? otherSessions.filter((os) => sc.assignedSessionIds?.includes(os.id))
            : otherSessions;

        for (const otherSess of relevantOtherSessions) {
          if (!otherSess.date) continue;

          const otherStartM = timeToMinutes(
            otherSess.timeInOpen || otherSess.startTime || '00:00'
          );
          const otherEndM = timeToMinutes(
            otherSess.hasTimeOut && otherSess.timeOutClose
              ? otherSess.timeOutClose
              : otherSess.timeInClose || otherSess.endTime || '23:59'
          );

          // Compare against current activity sessions
          for (const currSess of sessions) {
            if (!currSess.date || currSess.date !== otherSess.date) continue;

            const currStartM = timeToMinutes(
              currSess.timeInOpen || currSess.startTime || '00:00'
            );
            const currEndM = timeToMinutes(
              currSess.hasTimeOut && currSess.timeOutClose
                ? currSess.timeOutClose
                : currSess.timeInClose || currSess.endTime || '23:59'
            );

            // Check if time windows intersect
            if (currStartM < otherEndM && otherStartM < currEndM) {
              const conflictItem: CrossActivityConflict = {
                officerUserId,
                officerName: sc.officerName,
                conflictingEventId: other.id,
                conflictingEventTitle: other.title || 'Other Campus Activity',
                conflictingReferenceNo: other.referenceId,
                sessionTitle: otherSess.title || otherSess.name || 'Session',
                date: otherSess.date,
                timeWindow: `${formatTime12Hour(otherSess.timeInOpen || otherSess.startTime)} - ${formatTime12Hour(otherSess.hasTimeOut && otherSess.timeOutClose ? otherSess.timeOutClose : otherSess.timeInClose || otherSess.endTime)}`,
                currentSessionTitle: currSess.title || currSess.name || 'Session',
                currentDate: currSess.date,
                currentTimeWindow: `${formatTime12Hour(currSess.timeInOpen)} - ${formatTime12Hour(currSess.hasTimeOut && currSess.timeOutClose ? currSess.timeOutClose : currSess.timeInClose)}`,
              };

              if (officerUserId) {
                const list = map.get(officerUserId) || [];
                list.push(conflictItem);
                map.set(officerUserId, list);
              }
              if (officerNameLower) {
                const list = map.get(officerNameLower) || [];
                list.push(conflictItem);
                map.set(officerNameLower, list);
              }
            }
          }
        }
      }
    }

    return map;
  }, [allCampusEvents, activity.id, sessions]);

  // Identify any currently assigned scanners that have cross-activity conflicts
  const assignedWithCrossConflicts = useMemo(() => {
    const list: { scanner: EventScanner; conflict: CrossActivityConflict }[] = [];
    for (const sc of assignedScanners) {
      const c =
        crossActivityConflicts.get(sc.officerUserId || '') ||
        crossActivityConflicts.get((sc.officerName || '').toLowerCase().trim()) ||
        [];
      if (c.length > 0) {
        list.push({ scanner: sc, conflict: c[0] });
      }
    }
    return list;
  }, [assignedScanners, crossActivityConflicts]);

  if (!isOpen) return null;

  // Add a new session with non-overlapping smart time defaults
  const handleAddSession = () => {
    const nextIdx = sessions.length + 1;
    const lastSession = sessions[sessions.length - 1];
    let defaultOpen = '13:00';
    let defaultClose = '14:30';
    let defaultLate = '13:30';

    if (lastSession) {
      const lastEndMins = timeToMinutes(
        lastSession.hasTimeOut && lastSession.timeOutClose
          ? lastSession.timeOutClose
          : lastSession.timeInClose || '12:00'
      );
      const nextStartMins = Math.min(lastEndMins + 60, 1320); // 1-hour gap or up to 22:00
      defaultOpen = addMinutesToTime('00:00', nextStartMins);
      defaultClose = addMinutesToTime(defaultOpen, 90);
      defaultLate = addMinutesToTime(defaultOpen, 30);
    }

    const newSession: EventSession = {
      id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `Session ${nextIdx}`,
      name: `Session ${nextIdx}`,
      date: lastSession?.date || proposalDate,
      startTime: defaultOpen,
      endTime: defaultClose,
      timeInOpen: defaultOpen,
      timeInClose: defaultClose,
      isLateEnabled: false,
      markLateAfter: defaultLate,
      hasTimeOut: false,
      timeOutOpen: '',
      timeOutClose: '',
    };
    setSessions((prev) => [...prev, newSession]);
  };

  // Remove a session
  const handleRemoveSession = (id: string) => {
    if (sessions.length <= 1) {
      toast.error('At least one attendance session is required.');
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  // Update session fields
  const handleUpdateSession = (id: string, updates: Partial<EventSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  // Toggle Officer Scanner Assignment with Cross-Activity Conflict Check
  const handleToggleOfficer = (officer: any) => {
    if (!isPublished) {
      toast.error('Publication Required: The activity must be published to the student app feed before assigning scanners.');
      return;
    }

    const isAlreadyAssigned = assignedScanners.some(
      (s) => s.officerUserId === officer.studentId || s.officerName.toLowerCase() === officer.studentName.toLowerCase()
    );

    if (isAlreadyAssigned) {
      setAssignedScanners((prev) =>
        prev.filter(
          (s) =>
            s.officerUserId !== officer.studentId &&
            s.officerName.toLowerCase() !== officer.studentName.toLowerCase()
        )
      );
    } else {
      // Check cross-activity collision
      const c =
        crossActivityConflicts.get(officer.studentId || '') ||
        crossActivityConflicts.get((officer.studentName || '').toLowerCase().trim()) ||
        [];
      if (c.length > 0) {
        const conf = c[0];
        toast.error(
          `Schedule Conflict: ${officer.studentName} is already assigned as a scanner for "${conf.conflictingEventTitle}" on ${conf.date} (${conf.timeWindow}). An officer cannot be assigned to overlapping scan windows across events.`
        );
        return;
      }

      const newScanner: EventScanner = {
        id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        officerName: officer.studentName,
        officerUserId: officer.studentId || null,
        organizationId: officer.organizationId || null,
        organizationName: null,
        fullAccess: true,
        canCheckIn: true,
        canCheckOut: true,
        canViewList: true,
        canEditRecords: false,
        allowManualAttendance: true,
        assignedSessionIds: [], // Empty means "All Sessions"
      };
      setAssignedScanners((prev) => [...prev, newScanner]);
    }
  };

  // Toggle assigned session for an officer scanner
  const handleToggleScannerSession = (scannerKey: string, sessionId: string) => {
    setAssignedScanners((prev) =>
      prev.map((s) => {
        if (s.officerUserId !== scannerKey && s.id !== scannerKey) return s;
        const current = s.assignedSessionIds || [];
        const updated = current.includes(sessionId)
          ? current.filter((id) => id !== sessionId)
          : [...current, sessionId];
        return { ...s, assignedSessionIds: updated };
      })
    );
  };

  // Set officer scanner to All Sessions
  const handleSetScannerAllSessions = (scannerKey: string) => {
    setAssignedScanners((prev) =>
      prev.map((s) => {
        if (s.officerUserId !== scannerKey && s.id !== scannerKey) return s;
        return { ...s, assignedSessionIds: [] };
      })
    );
  };

  // Update permissions for an assigned scanner
  const handleToggleScannerPermission = (
    officerUserId: string,
    permission: 'canCheckOut' | 'allowManualAttendance'
  ) => {
    setAssignedScanners((prev) =>
      prev.map((s) =>
        s.officerUserId === officerUserId
          ? { ...s, [permission]: !s[permission] }
          : s
      )
    );
  };

  // Save Settings
  const handleSave = async () => {
    if (assignedScanners.length > 0 && !isPublished) {
      toast.error('Validation Error: The event must be published to the student mobile app before assigning scanners.');
      return;
    }

    // Check date errors
    if (Object.keys(dateErrors).length > 0) {
      toast.error('Please resolve session date errors before saving.');
      return;
    }

    // Check intra-session time validation errors
    if (hasAnyTimeErrors) {
      toast.error('Please resolve time conflicts and invalid scan windows before saving.');
      return;
    }

    // Check session conflicts
    if (sessionConflicts.length > 0) {
      toast.error('Schedule Conflict: Overlapping scanning windows detected on the same date.');
      return;
    }

    // Check cross-activity scanner conflicts
    if (assignedWithCrossConflicts.length > 0) {
      const first = assignedWithCrossConflicts[0];
      toast.error(
        `Assignment Conflict: ${first.scanner.officerName} is already assigned to "${first.conflict.conflictingEventTitle}" on ${first.conflict.date} (${first.conflict.timeWindow}). Please remove or replace conflicting scanners before saving.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const scannerNames = assignedScanners.map((s) => s.officerName);
      const scannerUserIds = assignedScanners
        .map((s) => s.officerUserId)
        .filter(Boolean) as string[];

      const sanitizedSessions = sessions.map((s) => ({
        id: s.id,
        title: s.title || s.name || 'Session',
        name: s.title || s.name || 'Session',
        date: s.date || proposalDate,
        startTime: s.startTime || '08:00',
        endTime: s.endTime || '12:00',
        timeInOpen: s.timeInOpen || s.startTime || '07:30',
        timeInClose: s.timeInClose || '09:00',
        isLateEnabled: Boolean(s.isLateEnabled),
        markLateAfter: s.isLateEnabled ? s.markLateAfter || s.timeInClose || '08:15' : null,
        hasTimeOut: Boolean(s.hasTimeOut),
        timeOutOpen: s.hasTimeOut ? s.timeOutOpen || '' : '',
        timeOutClose: s.hasTimeOut ? s.timeOutClose || '' : '',
      }));

      const sanitizedScanners = assignedScanners.map((sc) => ({
        ...sc,
        assignedSessionIds: sc.assignedSessionIds || [],
      }));

      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      const updates = {
        enableQRTickets,
        attendanceEnabled: enableQRTickets,
        sessions: sanitizedSessions,
        scanners: sanitizedScanners,
        scannerStaffNames: scannerNames,
        scannerUserIds,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(docRef, updates);

      // Dual-sync to events collection for mobile app
      try {
        const mirrorRef = doc(db, 'events', activity.id);
        await setDoc(mirrorRef, updates, { merge: true });
      } catch (evtErr) {
        console.warn('[AttendanceScannersModal] Failed to mirror to events collection:', evtErr);
      }

      toast.success('Attendance sessions & scanner permissions updated successfully!');
      if (onUpdated) onUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to save attendance settings:', err);
      toast.error(err?.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#001A4D] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0E4EBD] text-white flex items-center justify-center shadow-md">
              <QrCode className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Attendance, Sessions & Scanners</h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-[#FFD41C] border border-blue-400/30">
                  {activity.referenceId}
                </span>
                {enableQRTickets && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                    QR Gates Enabled
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 truncate max-w-md">
                {activity.title}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/50">
          {/* Read-Only Notice for Club-Managed Event */}
          {readOnly && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-950 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-amber-950">Organization-Managed Utility • Read-Only for Administrators</p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  Session scanning windows and designated scanner officers are configured exclusively by student organization officers.
                </p>
              </div>
            </div>
          )}

          {/* Validation Banner: Must be published before assigning scanners */}
          {!isPublished && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3.5 text-xs text-amber-950 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-amber-900 text-xs">
                  Publication Required Before Assigning Scanners
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  This activity has not yet been published to the student mobile app. Please publish the activity first using the <strong>Publish to App</strong> button before designating attendance scanner officers.
                </p>
              </div>
            </div>
          )}

          {/* Schedule Conflict Banner */}
          {sessionConflicts.length > 0 && (
            <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 space-y-2 text-xs text-rose-950 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-rose-900">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Session Schedule Conflict Detected</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-rose-800">
                {sessionConflicts.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p className="text-[10px] text-rose-600 font-semibold pt-1">
                Please adjust session dates or scanning windows so they do not overlap.
              </p>
            </div>
          )}

          {/* Time Validation Errors Banner */}
          {hasAnyTimeErrors && (
            <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 space-y-1.5 text-xs text-rose-950 shadow-xs">
              <div className="flex items-center gap-2 font-bold text-rose-900">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Invalid Scan Window Times Detected</span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                One or more sessions contain conflicting or crossing times (such as late threshold before doors open, check-in cutoff earlier than opening, or check-out before check-in cutoff). Please resolve the red highlighted fields below.
              </p>
            </div>
          )}

          {/* Section 1: QR Tickets Gate Toggle */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Enable QR Gate Passes</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Generate personal QR codes on student mobile tickets for scanning upon entry and exit.
                </p>
              </div>
              <label className={`relative inline-flex items-center ${readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={enableQRTickets}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEnableQRTickets(checked);
                    setAttendanceEnabled(checked);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#001A4D]"></div>
              </label>
            </div>
          </div>

          {/* Section 2: Multi-Session Scanning Windows */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Attendance Sessions & Scan Windows ({sessions.length})
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Create multiple sessions with custom names, dates, and independent scan windows.
                </p>
                {proposalDate && (
                  <p className="text-[10px] text-indigo-700 font-semibold mt-1">
                    Event Implementation Date: <span className="font-mono">{proposalDate}</span> (Sessions must occur on or after this date)
                  </p>
                )}
              </div>

              {!readOnly && (
                <button
                  type="button"
                  onClick={handleAddSession}
                  className="px-3 py-1.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#FFD41C]" />
                  <span>Add Session</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {sessions.map((sess, idx) => {
                const isDateInvalid = Boolean(dateErrors[sess.id]);
                const sErrors = sessionTimeErrors[sess.id] || {};
                const hasSessionTimeErrors = Object.keys(sErrors).length > 0;
                const isSessionInvalid = isDateInvalid || hasSessionTimeErrors;

                // Lifecycle status & permissions
                const timingStatus = getSessionTimingStatus(sess);
                const isConcluded = timingStatus === 'concluded';
                const isActive = timingStatus === 'active';
                const isUpcoming = timingStatus === 'upcoming';

                // Lifecycle locking policy
                const isDateLocked = readOnly || isConcluded || isActive;
                const isTitleLocked = readOnly || isConcluded;
                const isTimeInOpenLocked = readOnly || isConcluded || isActive;
                const isTimeInCloseLocked = readOnly || isConcluded; // Extendable during active session!
                const isLateLocked = readOnly || isConcluded || isActive;
                const isTimeOutToggleLocked = readOnly || isConcluded || isActive;
                const isTimeOutOpenLocked = readOnly || isConcluded || isActive;
                const isTimeOutCloseLocked = readOnly || isConcluded; // Extendable during active session!
                const canRemoveSession = !readOnly && sessions.length > 1 && isUpcoming;

                return (
                  <div
                    key={sess.id || idx}
                    className={`p-4 rounded-2xl border transition-all space-y-4 ${
                      isSessionInvalid
                        ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-200 shadow-xs'
                        : isConcluded
                        ? 'bg-slate-100/70 border-slate-300'
                        : isActive
                        ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200 shadow-xs'
                        : 'bg-slate-50/80 border-slate-200'
                    }`}
                  >
                    {/* Session Top Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
                      <div className="flex items-center gap-2 flex-1 flex-wrap">
                        <span
                          className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSessionInvalid
                              ? 'bg-rose-600 text-white'
                              : isConcluded
                              ? 'bg-slate-400 text-white'
                              : isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[#001A4D] text-[#FFD41C]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          disabled={isTitleLocked}
                          value={sess.title || sess.name || ''}
                          onChange={(e) =>
                            handleUpdateSession(sess.id, {
                              title: e.target.value,
                              name: e.target.value,
                            })
                          }
                          placeholder="e.g. Morning Plenary / Day 1 Registration"
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 w-full max-w-xs outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                        />

                        {/* Lifecycle Status Badges */}
                        {isActive && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-bold border border-emerald-300 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            Scanning Active
                          </span>
                        )}
                        {isConcluded && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10.5px] font-bold border border-slate-300">
                            <Lock className="w-3 h-3 text-slate-500" />
                            Concluded (Locked)
                          </span>
                        )}
                        {isUpcoming && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10.5px] font-bold border border-blue-200">
                            <Clock className="w-3 h-3 text-blue-500" />
                            Upcoming
                          </span>
                        )}

                        {hasSessionTimeErrors && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            Invalid Times
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Session Date */}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="date"
                            disabled={isDateLocked}
                            min={proposalDate || undefined}
                            value={sess.date || ''}
                            onChange={(e) =>
                              handleUpdateSession(sess.id, { date: e.target.value })
                            }
                            className={`px-2 py-1 bg-white border rounded-lg text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                              isDateInvalid
                                ? 'border-rose-400 text-rose-700 bg-rose-50'
                                : 'border-slate-200 text-slate-700'
                            }`}
                          />
                        </div>

                        {/* Remove Session Button */}
                        {!readOnly && sessions.length > 1 && (
                          canRemoveSession ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveSession(sess.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove this upcoming session"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span
                              title="Active or concluded sessions cannot be removed to safeguard attendance audit records."
                              className="p-1 text-slate-300 cursor-not-allowed"
                            >
                              <Lock className="w-4 h-4" />
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Informative Lifecycle Banners */}
                    {isConcluded && (
                      <div className="bg-slate-200/80 border border-slate-300 rounded-xl p-2.5 flex items-center gap-2 text-[11px] text-slate-700">
                        <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>This session has concluded. Past records and scan windows are permanently locked to preserve attendance audit integrity.</span>
                      </div>
                    )}
                    {isActive && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2 text-[11px] text-emerald-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <span>Scanning is currently in progress. Opening and late times are locked, but closing cutoff times can be extended if the event runs late.</span>
                      </div>
                    )}

                    {isDateInvalid && (
                      <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{dateErrors[sess.id]}</span>
                      </p>
                    )}

                    {/* Scanning Windows Grid */}
                    <div className="space-y-3">
                      {/* Time-In Row */}
                      <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Time-In Scan Window</span>
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Cutoff Extendable
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                              Time-In Opens
                            </label>
                            <input
                              type="time"
                              disabled={isTimeInOpenLocked}
                              value={sess.timeInOpen || ''}
                              onChange={(e) =>
                                handleUpdateSession(sess.id, { timeInOpen: e.target.value })
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                                sErrors.timeInOpen
                                  ? 'bg-rose-50 border border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500/20'
                                  : 'bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20'
                              }`}
                            />
                            {sErrors.timeInOpen && (
                              <p className="text-[10.5px] font-semibold text-rose-600 flex items-center gap-1 mt-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>{sErrors.timeInOpen}</span>
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                              Time-In Closes (Cutoff)
                            </label>
                            <input
                              type="time"
                              disabled={isTimeInCloseLocked}
                              value={sess.timeInClose || ''}
                              onChange={(e) =>
                                handleUpdateSession(sess.id, { timeInClose: e.target.value })
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                                sErrors.timeInClose
                                  ? 'bg-rose-50 border border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500/20'
                                  : 'bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20'
                              }`}
                            />
                            {sErrors.timeInClose && (
                              <p className="text-[10.5px] font-semibold text-rose-600 flex items-center gap-1 mt-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>{sErrors.timeInClose}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Late Marking Toggle */}
                        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className={`flex items-center gap-2 select-none ${isLateLocked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              disabled={isLateLocked}
                              checked={Boolean(sess.isLateEnabled)}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                let nextLate = sess.markLateAfter;
                                if (isChecked) {
                                  const openM = sess.timeInOpen ? timeToMinutes(sess.timeInOpen) : 450;
                                  const closeM = sess.timeInClose ? timeToMinutes(sess.timeInClose) : 540;
                                  const curM = nextLate ? timeToMinutes(nextLate) : null;
                                  if (curM === null || curM <= openM || (closeM > openM && curM >= closeM)) {
                                    if (closeM > openM) {
                                      const mid = Math.round((openM + closeM) / 2);
                                      const hh = Math.floor(mid / 60).toString().padStart(2, '0');
                                      const mm = (mid % 60).toString().padStart(2, '0');
                                      nextLate = `${hh}:${mm}`;
                                    } else {
                                      nextLate = addMinutesToTime(sess.timeInOpen || '07:30', 30);
                                    }
                                  }
                                } else {
                                  nextLate = null;
                                }
                                handleUpdateSession(sess.id, {
                                  isLateEnabled: isChecked,
                                  markLateAfter: nextLate,
                                });
                              }}
                              className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs font-semibold text-slate-700">
                              Tag late arrivals for this session
                            </span>
                          </label>

                          {sess.isLateEnabled && (
                            <div className="flex flex-col sm:items-end gap-1 pl-6 sm:pl-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                                  Mark Late After:
                                </span>
                                <input
                                  type="time"
                                  disabled={isLateLocked}
                                  value={sess.markLateAfter || ''}
                                  onChange={(e) =>
                                    handleUpdateSession(sess.id, {
                                      markLateAfter: e.target.value,
                                    })
                                  }
                                  className={`px-2 py-1 rounded-lg text-xs font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                                    sErrors.markLateAfter
                                      ? 'bg-rose-50 border border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500/20'
                                      : 'bg-amber-50 border border-amber-300 text-amber-900 focus:ring-2 focus:ring-amber-500/20'
                                  }`}
                                />
                              </div>
                              {sErrors.markLateAfter && (
                                <p className="text-[10.5px] font-semibold text-rose-600 flex items-center gap-1 sm:text-right">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{sErrors.markLateAfter}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Time-Out Row (Optional) */}
                      <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className={`flex items-center gap-2 select-none ${isTimeOutToggleLocked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              disabled={isTimeOutToggleLocked}
                              checked={Boolean(sess.hasTimeOut)}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                let nextOpen = sess.timeOutOpen;
                                let nextClose = sess.timeOutClose;
                                if (isChecked) {
                                  const inCloseM = sess.timeInClose ? timeToMinutes(sess.timeInClose) : 540;
                                  const curOpenM = nextOpen ? timeToMinutes(nextOpen) : null;
                                  if (!nextOpen || (curOpenM !== null && curOpenM < inCloseM)) {
                                    nextOpen = sess.timeInClose ? addMinutesToTime(sess.timeInClose, 15) : '11:30';
                                  }
                                  const newOpenM = timeToMinutes(nextOpen);
                                  const curCloseM = nextClose ? timeToMinutes(nextClose) : null;
                                  if (!nextClose || (curCloseM !== null && curCloseM <= newOpenM)) {
                                    nextClose = addMinutesToTime(nextOpen, 90);
                                  }
                                } else {
                                  nextOpen = '';
                                  nextClose = '';
                                }
                                handleUpdateSession(sess.id, {
                                  hasTimeOut: isChecked,
                                  timeOutOpen: nextOpen,
                                  timeOutClose: nextClose,
                                });
                              }}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 disabled:cursor-not-allowed"
                            />
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Require Time-Out Scan Window</span>
                            </span>
                          </label>

                          {!sess.hasTimeOut ? (
                            <span className="text-[10px] text-slate-400 italic">
                              Check-In Only (No Time-Out Required)
                            </span>
                          ) : isActive ? (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Cutoff Extendable
                            </span>
                          ) : null}
                        </div>

                        {sess.hasTimeOut && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                Time-Out Opens
                              </label>
                              <input
                                type="time"
                                disabled={isTimeOutOpenLocked}
                                value={sess.timeOutOpen || ''}
                                onChange={(e) =>
                                  handleUpdateSession(sess.id, { timeOutOpen: e.target.value })
                                }
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                                  sErrors.timeOutOpen
                                    ? 'bg-rose-50 border border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500/20'
                                    : 'bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20'
                                }`}
                              />
                              {sErrors.timeOutOpen && (
                                <p className="text-[10.5px] font-semibold text-rose-600 flex items-center gap-1 mt-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{sErrors.timeOutOpen}</span>
                                </p>
                              )}
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                Time-Out Closes
                              </label>
                              <input
                                type="time"
                                disabled={isTimeOutCloseLocked}
                                value={sess.timeOutClose || ''}
                                onChange={(e) =>
                                  handleUpdateSession(sess.id, { timeOutClose: e.target.value })
                                }
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
                                  sErrors.timeOutClose
                                    ? 'bg-rose-50 border border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500/20'
                                    : 'bg-slate-50 border border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20'
                                }`}
                              />
                              {sErrors.timeOutClose && (
                                <p className="text-[10.5px] font-semibold text-rose-600 flex items-center gap-1 mt-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{sErrors.timeOutClose}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Officer Scanner Assignment & Permissions */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Designated Scanner Officers & Permissions ({assignedScanners.length})
                  </h4>
                  {!isPublished && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-700" />
                      Locked: Publication Required
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select student officers to assign camera scanning rights, session duties, and privileges (Time-Out, Manual Attendance).
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={officerSearch}
                  onChange={(e) => setOfficerSearch(e.target.value)}
                  placeholder="Search officers by name or ID..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Cross-Activity Conflict Warning Banner */}
            {assignedWithCrossConflicts.length > 0 && (
              <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 space-y-2 text-xs text-rose-950 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Officer Scanner Double-Booking Detected ({assignedWithCrossConflicts.length})</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-rose-800">
                  {assignedWithCrossConflicts.map(({ scanner, conflict }, cIdx) => (
                    <li key={cIdx}>
                      <strong>{scanner.officerName}</strong> is simultaneously scheduled as a scanner for{' '}
                      <strong>"{conflict.conflictingEventTitle}"</strong> on {conflict.date} ({conflict.timeWindow}).
                    </li>
                  ))}
                </ul>
                <p className="text-[10.5px] text-rose-700 font-semibold pt-1">
                  An officer cannot be assigned to scan multiple activities during overlapping time windows. Please remove or replace conflicting officers before saving.
                </p>
              </div>
            )}

            {/* Officer Roster Grid */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100">
              {loadingOfficers ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  Loading active student officers...
                </div>
              ) : filteredOfficers.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No officers found matching your search.
                </div>
              ) : (
                filteredOfficers.map((officer) => {
                  const assignedScanner = assignedScanners.find(
                    (s) =>
                      s.officerUserId === officer.studentId ||
                      s.officerName.toLowerCase() === officer.studentName.toLowerCase()
                  );
                  const isAssigned = Boolean(assignedScanner);

                  // Collision check for this officer
                  const collisions =
                    crossActivityConflicts.get(officer.studentId || '') ||
                    crossActivityConflicts.get((officer.studentName || '').toLowerCase().trim()) ||
                    [];
                  const hasCrossConflict = collisions.length > 0;

                  return (
                    <div
                      key={officer.id}
                      className={`p-3 transition-colors ${
                        isAssigned ? 'bg-blue-50/50' : 'bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div
                          onClick={() => !readOnly && handleToggleOfficer(officer)}
                          className={`flex items-center gap-3 flex-1 ${
                            readOnly || !isPublished
                              ? 'cursor-not-allowed opacity-75'
                              : 'cursor-pointer'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                              isAssigned
                                ? 'bg-[#0E4EBD] text-white shadow-2xs'
                                : hasCrossConflict
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isAssigned ? (
                              <Check className="w-4 h-4" />
                            ) : hasCrossConflict ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            ) : (
                              officer.studentName.charAt(0)
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-slate-900 leading-tight">
                                {officer.studentName}
                              </p>
                              {hasCrossConflict && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200">
                                  Conflict
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                              ID: {officer.studentId || 'N/A'} {officer.roleId ? `• ${officer.roleId}` : ''}
                            </p>
                            {hasCrossConflict && (
                              <p className="text-[10.5px] font-semibold text-rose-600 flex items-center gap-1 mt-1">
                                <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                <span>
                                  Busy: Assigned to "{collisions[0].conflictingEventTitle}" ({collisions[0].date} • {collisions[0].timeWindow})
                                </span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isAssigned ? (
                            <div className="flex items-center gap-2">
                              {/* Permission: Can Time Out */}
                              <label
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer select-none hover:bg-slate-50"
                                title="Allow scanning Time-Out gates"
                              >
                                <input
                                  type="checkbox"
                                  disabled={readOnly}
                                  checked={assignedScanner?.canCheckOut !== false}
                                  onChange={() =>
                                    handleToggleScannerPermission(
                                      assignedScanner.officerUserId || officer.studentId,
                                      'canCheckOut'
                                    )
                                  }
                                  className="w-3.5 h-3.5 text-blue-600 rounded"
                                />
                                <span>Time-Out</span>
                              </label>

                              {/* Permission: Allow Manual Attendance */}
                              <label
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer select-none hover:bg-slate-50"
                                title="Allow searching student ID and logging attendance manually"
                              >
                                <input
                                  type="checkbox"
                                  disabled={readOnly}
                                  checked={assignedScanner?.allowManualAttendance !== false}
                                  onChange={() =>
                                    handleToggleScannerPermission(
                                      assignedScanner.officerUserId || officer.studentId,
                                      'allowManualAttendance'
                                    )
                                  }
                                  className="w-3.5 h-3.5 text-indigo-600 rounded"
                                />
                                <span>Manual Check-In</span>
                              </label>

                              <button
                                type="button"
                                onClick={() => handleToggleOfficer(officer)}
                                disabled={readOnly}
                                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ) : !isPublished ? (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full flex items-center gap-1">
                              <Lock className="w-3 h-3 text-amber-700" />
                              Publish First
                            </span>
                          ) : readOnly ? null : hasCrossConflict ? (
                            <button
                              type="button"
                              onClick={() => handleToggleOfficer(officer)}
                              title={`Schedule Conflict: Assigned to "${collisions[0].conflictingEventTitle}" (${collisions[0].timeWindow})`}
                              className="px-2.5 py-1 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-lg hover:bg-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>Conflict</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleOfficer(officer)}
                              className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              + Assign
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Per-Session Assignment Chips for Assigned Scanners */}
                      {isAssigned && assignedScanner && sessions.length > 1 && (
                        <div className="flex items-center flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-200/60 pl-10">
                          <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">
                            Assigned Sessions:
                          </span>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() =>
                              handleSetScannerAllSessions(
                                assignedScanner.officerUserId || assignedScanner.id
                              )
                            }
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                              !assignedScanner.assignedSessionIds ||
                              assignedScanner.assignedSessionIds.length === 0
                                ? 'bg-[#001A4D] text-[#FFD41C] shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            All Sessions
                          </button>
                          {sessions.map((s, sIdx) => {
                            const isSelected =
                              assignedScanner.assignedSessionIds &&
                              assignedScanner.assignedSessionIds.length > 0
                                ? assignedScanner.assignedSessionIds.includes(s.id)
                                : false;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                disabled={readOnly}
                                onClick={() =>
                                  handleToggleScannerSession(
                                    assignedScanner.officerUserId || assignedScanner.id,
                                    s.id
                                  )
                                }
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {s.title || `Session ${sIdx + 1}`}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-slate-500">
            {assignedScanners.length} Officers configured • {sessions.length} Session{sessions.length > 1 ? 's' : ''}
          </span>

          <div className="flex items-center gap-2">
            {readOnly ? (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Close (Read Only)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    isSaving ||
                    hasAnyTimeErrors ||
                    Object.keys(dateErrors).length > 0 ||
                    sessionConflicts.length > 0 ||
                    assignedWithCrossConflicts.length > 0
                  }
                  className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Attendance & Scanners'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
