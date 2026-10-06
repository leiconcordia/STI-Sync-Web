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
} from 'lucide-react';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument, EventSession, EventScanner } from '../types/event.types';
import { useOrgOfficers } from '../../organizations/hooks/useOrgOfficers';
import { toast } from 'sonner';

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

  useEffect(() => {
    if (activity) {
      setEnableQRTickets(
        activity.enableQRTickets !== false && (activity as any).enableQR !== false
      );
      setAttendanceEnabled(activity.attendanceEnabled !== false);

      const baseDate =
        (activity as any).date ||
        (activity as any).targetImplementationDate ||
        '';

      if (activity.sessions && activity.sessions.length > 0) {
        setSessions(
          activity.sessions.map((s, idx) => ({
            id: s.id || `sess_${idx + 1}_${Date.now()}`,
            title: s.title || s.name || `Session ${idx + 1}`,
            name: s.title || s.name || `Session ${idx + 1}`,
            date: s.date || baseDate,
            startTime: s.startTime || '08:00',
            endTime: s.endTime || '12:00',
            timeInOpen: s.timeInOpen || s.startTime || '07:30',
            timeInClose: s.timeInClose || '09:00',
            isLateEnabled: (s as any).isLateEnabled ?? false,
            markLateAfter: (s as any).markLateAfter || '08:15',
            hasTimeOut: s.hasTimeOut ?? false,
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
            startTime: (activity as any).startTime || '08:00',
            endTime: (activity as any).endTime || '12:00',
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
        (activity.scanners || []).map((sc) => ({
          ...sc,
          canCheckIn: sc.canCheckIn ?? true,
          canCheckOut: sc.canCheckOut ?? true,
          allowManualAttendance: sc.allowManualAttendance ?? true,
        }))
      );
    }
  }, [activity]);

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

  // Conflict Engine: detect overlapping scan windows on the same date
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

          const s1Start = s1.timeInOpen || s1.startTime || '00:00';
          const s1End =
            s1.hasTimeOut && s1.timeOutClose
              ? s1.timeOutClose
              : s1.timeInClose || s1.endTime || '23:59';

          const s2Start = s2.timeInOpen || s2.startTime || '00:00';
          const s2End =
            s2.hasTimeOut && s2.timeOutClose
              ? s2.timeOutClose
              : s2.timeInClose || s2.endTime || '23:59';

          if (s1Start < s2End && s2Start < s1End) {
            conflicts.push(
              `Conflict on ${date}: "${s1.title || s1.name}" (${s1Start} - ${s1End}) overlaps with "${s2.title || s2.name}" (${s2Start} - ${s2End}).`
            );
          }
        }
      }
    }

    return conflicts;
  }, [sessions]);

  if (!isOpen) return null;

  // Add a new session
  const handleAddSession = () => {
    const nextIdx = sessions.length + 1;
    const newSession: EventSession = {
      id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `Session ${nextIdx}`,
      name: `Session ${nextIdx}`,
      date: sessions[sessions.length - 1]?.date || proposalDate,
      startTime: '13:00',
      endTime: '17:00',
      timeInOpen: '12:30',
      timeInClose: '14:00',
      isLateEnabled: false,
      markLateAfter: '13:15',
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

  // Toggle Officer Scanner Assignment
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
      };
      setAssignedScanners((prev) => [...prev, newScanner]);
    }
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

    // Check session conflicts
    if (sessionConflicts.length > 0) {
      toast.error('Schedule Conflict: Overlapping scanning windows detected on the same date.');
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

      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      const updates = {
        enableQRTickets,
        attendanceEnabled: enableQRTickets,
        sessions: sanitizedSessions,
        scanners: assignedScanners,
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
                <span>Session Time Conflict Detected</span>
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

                return (
                  <div
                    key={sess.id || idx}
                    className={`p-4 rounded-2xl border transition-all space-y-4 ${
                      isDateInvalid
                        ? 'bg-rose-50/40 border-rose-300'
                        : 'bg-slate-50/80 border-slate-200'
                    }`}
                  >
                    {/* Session Top Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-[#001A4D] text-[#FFD41C] text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          disabled={readOnly}
                          value={sess.title || sess.name || ''}
                          onChange={(e) =>
                            handleUpdateSession(sess.id, {
                              title: e.target.value,
                              name: e.target.value,
                            })
                          }
                          placeholder="e.g. Morning Plenary / Day 1 Registration"
                          className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 w-full max-w-xs outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Session Date */}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="date"
                            disabled={readOnly}
                            min={proposalDate || undefined}
                            value={sess.date || ''}
                            onChange={(e) =>
                              handleUpdateSession(sess.id, { date: e.target.value })
                            }
                            className={`px-2 py-1 bg-white border rounded-lg text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed ${
                              isDateInvalid
                                ? 'border-rose-400 text-rose-700 bg-rose-50'
                                : 'border-slate-200 text-slate-700'
                            }`}
                          />
                        </div>

                        {/* Remove Session Button */}
                        {!readOnly && sessions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSession(sess.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove this session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

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
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                              Time-In Opens
                            </label>
                            <input
                              type="time"
                              disabled={readOnly}
                              value={sess.timeInOpen || ''}
                              onChange={(e) =>
                                handleUpdateSession(sess.id, { timeInOpen: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                              Time-In Closes (Cutoff)
                            </label>
                            <input
                              type="time"
                              disabled={readOnly}
                              value={sess.timeInClose || ''}
                              onChange={(e) =>
                                handleUpdateSession(sess.id, { timeInClose: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                        </div>

                        {/* Late Marking Toggle */}
                        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              disabled={readOnly}
                              checked={Boolean(sess.isLateEnabled)}
                              onChange={(e) =>
                                handleUpdateSession(sess.id, {
                                  isLateEnabled: e.target.checked,
                                  markLateAfter: e.target.checked
                                    ? sess.markLateAfter || sess.timeInClose || '08:15'
                                    : null,
                                })
                              }
                              className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                            />
                            <span className="text-xs font-semibold text-slate-700">
                              Tag late arrivals for this session
                            </span>
                          </label>

                          {sess.isLateEnabled && (
                            <div className="flex items-center gap-2 pl-6 sm:pl-0">
                              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                                Mark Late After:
                              </span>
                              <input
                                type="time"
                                disabled={readOnly}
                                value={sess.markLateAfter || ''}
                                onChange={(e) =>
                                  handleUpdateSession(sess.id, {
                                    markLateAfter: e.target.value,
                                  })
                                }
                                className="px-2 py-1 bg-amber-50 border border-amber-300 rounded-lg text-xs font-semibold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500/20"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Time-Out Row (Optional) */}
                      <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              disabled={readOnly}
                              checked={Boolean(sess.hasTimeOut)}
                              onChange={(e) =>
                                handleUpdateSession(sess.id, {
                                  hasTimeOut: e.target.checked,
                                  timeOutOpen: e.target.checked ? sess.timeOutOpen || '11:30' : '',
                                  timeOutClose: e.target.checked ? sess.timeOutClose || '13:00' : '',
                                })
                              }
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Require Time-Out Scan Window</span>
                            </span>
                          </label>

                          {!sess.hasTimeOut && (
                            <span className="text-[10px] text-slate-400 italic">
                              Check-In Only (No Time-Out Required)
                            </span>
                          )}
                        </div>

                        {sess.hasTimeOut && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                Time-Out Opens
                              </label>
                              <input
                                type="time"
                                disabled={readOnly}
                                value={sess.timeOutOpen || ''}
                                onChange={(e) =>
                                  handleUpdateSession(sess.id, { timeOutOpen: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                Time-Out Closes
                              </label>
                              <input
                                type="time"
                                disabled={readOnly}
                                value={sess.timeOutClose || ''}
                                onChange={(e) =>
                                  handleUpdateSession(sess.id, { timeOutClose: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
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
                  Select student officers to assign camera scanning rights and configure specific privileges (Time-Out, Manual Attendance).
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

            {/* Officer Roster Grid */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100">
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

                  return (
                    <div
                      key={officer.id}
                      className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                        isAssigned ? 'bg-blue-50/50' : 'bg-white'
                      }`}
                    >
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
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isAssigned ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            officer.studentName.charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-tight">
                            {officer.studentName}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                            ID: {officer.studentId || 'N/A'} {officer.roleId ? `• ${officer.roleId}` : ''}
                          </p>
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
                              className="text-[10px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        ) : !isPublished ? (
                          <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full flex items-center gap-1">
                            <Lock className="w-3 h-3 text-amber-700" />
                            Publish First
                          </span>
                        ) : readOnly ? null : (
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
                    Object.keys(dateErrors).length > 0 ||
                    sessionConflicts.length > 0
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
