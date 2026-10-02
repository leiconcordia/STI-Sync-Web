/**
 * src/app/modules/events/components/AttendanceScannersModal.tsx
 *
 * Dedicated Modal for Activity Attendance, Sessions & Scanners:
 * - QR Gate Tickets & Attendance Tracking enforcement
 * - Grace Period & Late Entry Cutoff thresholds
 * - Multi-Session Scanning Windows (Time-In & Time-Out)
 * - Scanner Officers Selection: queries full officer roster from useOrgOfficers,
 *   allowing one-click assignment (PIN code removed).
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  QrCode,
  Clock,
  Users,
  UserCheck,
  CheckCircle2,
  Calendar,
  Save,
  Search,
  Check,
  Shield,
  Plus,
  Lock,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument, EventSession, EventScanner } from '../types/event.types';
import { useOrgOfficers } from '../../organizations/hooks/useOrgOfficers';
import { formatAppDate, format12HourTime } from '../../../../utils/date';
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
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState<number>(
    activity.gracePeriodMinutes ?? 15
  );
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState<number>(
    activity.lateThresholdMinutes ?? 30
  );

  // Sessions
  const [sessions, setSessions] = useState<EventSession[]>([]);

  // Assigned Scanners
  const [assignedScanners, setAssignedScanners] = useState<EventScanner[]>(
    activity.scanners || []
  );

  // Search filter for officer roster
  const [officerSearch, setOfficerSearch] = useState('');

  // Fetch all active officers from organization / campus roster
  const orgIdToQuery = activity.hostingOrgId && activity.hostingOrgId !== 'sas'
    ? activity.hostingOrgId
    : 'all';
  const { officers: officerRoster = [], loading: loadingOfficers } = useOrgOfficers(orgIdToQuery);

  // Also query 'all' as fallback if org roster is empty
  const { officers: allCampusOfficers = [] } = useOrgOfficers('all');
  const availableOfficers = officerRoster.length > 0 ? officerRoster : allCampusOfficers;

  useEffect(() => {
    if (activity) {
      setEnableQRTickets(
        activity.enableQRTickets !== false && (activity as any).enableQR !== false
      );
      setAttendanceEnabled(activity.attendanceEnabled !== false);
      setGracePeriodMinutes(activity.gracePeriodMinutes ?? 15);
      setLateThresholdMinutes(activity.lateThresholdMinutes ?? 30);

      if (activity.sessions && activity.sessions.length > 0) {
        setSessions(
          activity.sessions.map((s, idx) => ({
            id: s.id || `sess_${idx + 1}`,
            title: s.title || `Session ${idx + 1}`,
            date: s.date || '',
            startTime: s.startTime || '08:00',
            endTime: s.endTime || '12:00',
            timeInOpen: s.timeInOpen || s.startTime || '07:30',
            timeInClose: s.timeInClose || '09:00',
            hasTimeOut: s.hasTimeOut ?? true,
            timeOutOpen: s.timeOutOpen || s.endTime || '11:30',
            timeOutClose: s.timeOutClose || '13:00',
          }))
        );
      } else {
        setSessions([
          {
            id: 'sess_1',
            title: 'Main Session',
            date: (activity as any).date || '',
            startTime: (activity as any).startTime || '08:00',
            endTime: (activity as any).endTime || '12:00',
            timeInOpen: '07:30',
            timeInClose: '09:00',
            hasTimeOut: true,
            timeOutOpen: '11:30',
            timeOutClose: '13:00',
          },
        ]);
      }

      setAssignedScanners(activity.scanners || []);
    }
  }, [activity]);

  // Filtered officers (hook MUST be declared unconditionally before any early returns)
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

  if (!isOpen) return null;

  // Session handler
  const handleUpdateSession = (id: string, updates: Partial<EventSession>) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  // Toggle Officer Scanner Assignment
  const handleToggleOfficer = (officer: any) => {
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

  // Save Settings
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const scannerNames = assignedScanners.map((s) => s.officerName);
      const scannerUserIds = assignedScanners
        .map((s) => s.officerUserId)
        .filter(Boolean) as string[];

      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      await updateDoc(docRef, {
        enableQRTickets,
        attendanceEnabled,
        gracePeriodMinutes: Number(gracePeriodMinutes) || 15,
        lateThresholdMinutes: Number(lateThresholdMinutes) || 30,
        sessions,
        scanners: assignedScanners,
        scannerStaffNames: scannerNames,
        scannerUserIds,
        updatedAt: serverTimestamp(),
      });

      toast.success('Attendance, session windows, and scanners updated successfully!');
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
                  Session scanning windows, grace periods, and designated scanner officers are configured exclusively by student organization officers.
                </p>
              </div>
            </div>
          )}

          {/* Section 1: QR Tickets & Rules */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
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
                  onChange={(e) => setEnableQRTickets(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#001A4D]"></div>
              </label>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Mandatory Attendance Verification</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Record entrance timestamps for campus clearance and certificate issuance.
                </p>
              </div>
              <label className={`relative inline-flex items-center ${readOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={attendanceEnabled}
                  onChange={(e) => setAttendanceEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Thresholds */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Grace Period (Minutes after session start)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={gracePeriodMinutes}
                    onChange={(e) => setGracePeriodMinutes(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">mins</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Students checking in within this threshold are marked "Present".</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Late Entry Cutoff Threshold
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={lateThresholdMinutes}
                    onChange={(e) => setLateThresholdMinutes(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-medium">mins</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Scans occurring after this duration are tagged as "Late".</p>
              </div>
            </div>
          </div>

          {/* Section 2: Session Scanning Windows */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Session Scanning Windows ({sessions.length})
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Set precise time-in and time-out windows when scanner devices are active.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {sessions.map((sess, idx) => (
                <div key={sess.id || idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#001A4D]">
                      Session {idx + 1}: {sess.title}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {sess.date || 'TBD'} • {sess.startTime} - {sess.endTime}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Time-In Open
                      </label>
                      <input
                        type="time"
                        disabled={readOnly}
                        value={sess.timeInOpen || ''}
                        onChange={(e) => handleUpdateSession(sess.id, { timeInOpen: e.target.value })}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Time-In Close
                      </label>
                      <input
                        type="time"
                        disabled={readOnly}
                        value={sess.timeInClose || ''}
                        onChange={(e) => handleUpdateSession(sess.id, { timeInClose: e.target.value })}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Time-Out Open
                      </label>
                      <input
                        type="time"
                        disabled={readOnly}
                        value={sess.timeOutOpen || ''}
                        onChange={(e) => handleUpdateSession(sess.id, { timeOutOpen: e.target.value })}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Time-Out Close
                      </label>
                      <input
                        type="time"
                        disabled={readOnly}
                        value={sess.timeOutClose || ''}
                        onChange={(e) => handleUpdateSession(sess.id, { timeOutClose: e.target.value })}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Officer Scanner Assignment */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Designated Scanner Officers ({assignedScanners.length} Assigned)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select student officers from the active campus roster to grant camera scanning access.
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
            <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100">
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
                  const isAssigned = assignedScanners.some(
                    (s) =>
                      s.officerUserId === officer.studentId ||
                      s.officerName.toLowerCase() === officer.studentName.toLowerCase()
                  );

                  return (
                    <div
                      key={officer.id}
                      onClick={() => !readOnly && handleToggleOfficer(officer)}
                      className={`p-3 flex items-center justify-between transition-colors ${
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isAssigned
                          ? 'bg-blue-50/70 hover:bg-blue-50'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
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

                      <div>
                        {isAssigned ? (
                          <span className="px-2.5 py-0.5 bg-blue-100 text-[#0E4EBD] text-[10px] font-bold rounded-full">
                            Assigned as Scanner
                          </span>
                        ) : readOnly ? null : (
                          <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-semibold rounded-full hover:bg-slate-200">
                            + Assign
                          </span>
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
            {assignedScanners.length} Officers configured with scanner privileges.
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
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
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
