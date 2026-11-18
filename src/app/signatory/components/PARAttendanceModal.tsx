import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Users,
  ScanLine,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Loader2,
  Download,
  ExternalLink,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import {
  ATTENDANCE_COLLECTION,
  mergeAttendanceRecordsForRoster,
  resolveMergedAttendanceStatus,
} from '../../modules/attendance/services/attendance.service';
import { formatAppTime } from '../../utils/date';

interface PARAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId?: string;
  eventTitle: string;
  estimatedAttendance: number;
  estimatedAttendanceLabel?: string;
  reportedAttendedCount?: number;
  reportedTurnoutRate?: number;
  attendanceListUrl?: string;
  attendanceListName?: string;
}

interface ParsedAttendanceRow {
  id: string;
  studentId: string;
  studentName: string;
  courseCode: string;
  section: string;
  yearLevel: string;
  sessionTitle: string;
  checkIn: string;
  checkOut: string;
  status: 'Present' | 'Complete' | 'Checked In' | 'Checked Out' | 'Late' | 'Absent' | 'Flagged';
  flaggedReason?: string;
}

function normalizeAttendanceStatus(raw?: string): ParsedAttendanceRow['status'] {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'present') return 'Present';
  if (s === 'complete') return 'Complete';
  if (s === 'checked out') return 'Checked Out';
  if (s === 'late') return 'Late';
  if (s === 'absent') return 'Absent';
  if (s === 'flagged') return 'Flagged';
  return 'Checked In';
}

export default function PARAttendanceModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  estimatedAttendance,
  estimatedAttendanceLabel,
  reportedAttendedCount,
  reportedTurnoutRate,
  attendanceListUrl,
  attendanceListName,
}: PARAttendanceModalProps) {
  const [rows, setRows] = useState<ParsedAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadAttendance = async () => {
      setLoading(true);
      try {
        const docsMap = new Map<string, any>();

        if (eventId) {
          try {
            const snap = await getDocs(
              query(collection(db, ATTENDANCE_COLLECTION), where('eventId', '==', eventId))
            );
            snap.docs.forEach((d) => docsMap.set(d.id, d.data()));
          } catch {}

          // Merge event subcollection if used
          try {
            const subSnap = await getDocs(collection(db, 'events', eventId, ATTENDANCE_COLLECTION));
            subSnap.docs.forEach((d) => {
              if (!docsMap.has(d.id)) docsMap.set(d.id, d.data());
            });
          } catch {}
        }

        // Legacy fallback by event title
        if (docsMap.size === 0 && eventTitle) {
          try {
            const titleSnap = await getDocs(
              query(collection(db, ATTENDANCE_COLLECTION), where('event', '==', eventTitle))
            );
            titleSnap.docs.forEach((d) => docsMap.set(d.id, d.data()));
          } catch {}
        }

        const rawParsed: any[] = [];
        docsMap.forEach((data, docId) => {
          const rawGate = String(data.gateType || '').trim().toLowerCase();
          const scanTime = formatAppTime(data.scannedAt || data.createdAt, '—');
          const checkIn =
            data.checkIn ||
            (rawGate === 'time_in' || rawGate === 'entry'
              ? scanTime
              : data.scannedAt && rawGate !== 'time_out' && rawGate !== 'exit' && !data.isDefaultAbsentSeed && data.status !== 'Absent'
              ? scanTime
              : '—');
          const checkOut =
            data.checkOut || (rawGate === 'time_out' || rawGate === 'exit' ? scanTime : '—');
          const resolvedStatus = resolveMergedAttendanceStatus({
            rawStatus: data.status,
            checkIn,
            checkOut,
            scannedAt: data.scannedAt,
            isFlagged: data.status === 'Flagged' || Boolean(data.flagReason || data.flaggedReason),
            flaggedReason: data.flagReason || data.flagNote || data.flaggedReason,
          });

          rawParsed.push({
            id: docId,
            studentId: data.studentSchoolId || data.studentNumber || data.studentId || 'N/A',
            studentSchoolId: data.studentSchoolId || data.studentNumber || undefined,
            studentNumber: data.studentNumber || undefined,
            studentAuthUid: data.studentAuthUid || data.authUid || undefined,
            name: data.studentName || data.name || 'Unknown Student',
            org: data.organizationId || data.org || 'SAS',
            eventId: data.eventId || eventId || '',
            event: data.event || eventTitle || '',
            sessionId: data.sessionId || 'default',
            sessionTitle: data.sessionTitle || data.sessionName || '',
            courseCode: data.courseCode || data.program || '',
            section: data.section || '',
            yearLevel: data.yearLevel || '',
            checkIn,
            checkOut,
            status: resolvedStatus,
            scannedAt: data.scannedAt,
            createdAt: data.createdAt,
            isDefaultAbsentSeed: Boolean(data.isDefaultAbsentSeed),
            flaggedReason: data.flagReason || data.flagNote || data.flaggedReason,
          });
        });

        const merged = mergeAttendanceRecordsForRoster(rawParsed);
        const parsed: ParsedAttendanceRow[] = merged.map((m: any) => ({
          id: m.id,
          studentId: m.studentId || 'N/A',
          studentName: m.name || 'Unknown Student',
          courseCode: m.courseCode || '',
          section: m.section || '',
          yearLevel: m.yearLevel || '',
          sessionTitle: m.sessionTitle || '',
          checkIn: m.checkIn || '—',
          checkOut: m.checkOut || '—',
          status: normalizeAttendanceStatus(m.status),
          flaggedReason: m.flaggedReason,
        }));

        parsed.sort((a, b) => a.studentName.localeCompare(b.studentName));
        if (!cancelled) setRows(parsed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [isOpen, eventId, eventTitle]);

  const stats = useMemo(() => {
    const uniqueAttended = new Set<string>();
    const counts: Record<string, number> = {
      Present: 0,
      Complete: 0,
      'Checked In': 0,
      'Checked Out': 0,
      Late: 0,
      Absent: 0,
      Flagged: 0,
    };

    rows.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
      if (r.status !== 'Absent' && r.status !== 'Flagged') {
        const key = (r.studentId !== 'N/A' ? r.studentId : r.studentName || r.id).toLowerCase();
        uniqueAttended.add(key);
      }
    });

    const attended = uniqueAttended.size > 0 ? uniqueAttended.size : reportedAttendedCount || 0;
    const turnout =
      estimatedAttendance > 0
        ? Math.min(100, Math.round((attended / estimatedAttendance) * 100))
        : reportedTurnoutRate;

    return { attended, turnout, counts };
  }, [rows, estimatedAttendance, reportedAttendedCount, reportedTurnoutRate]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q) ||
        r.courseCode.toLowerCase().includes(q) ||
        r.section.toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery, statusFilter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-5 py-4 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center border border-white/20 shrink-0">
              <ScanLine className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200 block">
                Digital Attendance Monitoring Logs
              </span>
              <h3 className="text-base font-black truncate">{eventTitle}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {attendanceListUrl && (
              <a
                href={attendanceListUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{attendanceListName || 'Attendance File'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-center text-xs">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Estimated</span>
            <strong className="text-sm font-black text-slate-900">
              {estimatedAttendanceLabel || (estimatedAttendance > 0 ? estimatedAttendance.toLocaleString() : '—')}
            </strong>
          </div>
          <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-200">
            <span className="text-[10px] text-blue-700 font-semibold block">Verified Attended</span>
            <strong className="text-sm font-black text-blue-900">
              {stats.attended.toLocaleString()}
              {stats.turnout !== undefined ? ` (${stats.turnout}%)` : ''}
            </strong>
          </div>
          <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
            <span className="text-[10px] text-emerald-700 font-semibold block">Present / Complete</span>
            <strong className="text-sm font-black text-emerald-900">
              {(stats.counts.Present || 0) + (stats.counts.Complete || 0)}
            </strong>
          </div>
          <div className="bg-sky-50 p-2.5 rounded-xl border border-sky-200">
            <span className="text-[10px] text-sky-700 font-semibold block">Checked In / Out</span>
            <strong className="text-sm font-black text-sky-900">
              {(stats.counts['Checked In'] || 0) + (stats.counts['Checked Out'] || 0)}
            </strong>
          </div>
          <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
            <span className="text-[10px] text-amber-700 font-semibold block">Late / Flagged</span>
            <strong className="text-sm font-black text-amber-900">
              {stats.counts.Late + stats.counts.Flagged}
            </strong>
          </div>
          <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200">
            <span className="text-[10px] text-rose-700 font-semibold block">Absent</span>
            <strong className="text-sm font-black text-rose-900">{stats.counts.Absent}</strong>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-3 sm:px-5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student name, ID, program, section..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD]"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            {(['ALL', 'Present', 'Complete', 'Checked In', 'Checked Out', 'Late', 'Flagged', 'Absent'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                  statusFilter === status
                    ? 'bg-[#001A4D] text-white border-[#001A4D]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {status === 'ALL' ? `All (${rows.length})` : status}
              </button>
            ))}
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-[#0E4EBD]" />
              <span>Loading attendance monitoring logs...</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-14 text-center space-y-2 text-xs text-slate-500">
              <Users className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-700">
                {rows.length === 0
                  ? 'No individual digital scan logs found for this event.'
                  : 'No attendance records match your current search or filter.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Student ID</th>
                    <th className="px-3 py-2.5">Student Name</th>
                    <th className="px-3 py-2.5">Program / Section</th>
                    <th className="px-3 py-2.5">Session</th>
                    <th className="px-3 py-2.5">Check In</th>
                    <th className="px-3 py-2.5">Check Out</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{row.studentId}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.studentName}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {[row.courseCode, row.yearLevel, row.section].filter(Boolean).join(' • ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{row.sessionTitle || 'Main Session'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.checkIn}</td>
                      <td className="px-3 py-2 text-slate-700">{row.checkOut}</td>
                      <td className="px-3 py-2">
                        <span
                          title={row.flaggedReason || row.status}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            row.status === 'Complete' || row.status === 'Present'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : row.status === 'Checked In' || row.status === 'Checked Out'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : row.status === 'Late'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : row.status === 'Flagged'
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {row.status === 'Complete' && <CheckCircle2 className="w-3 h-3" />}
                          {row.status === 'Checked In' && <Clock className="w-3 h-3" />}
                          {(row.status === 'Late' || row.status === 'Flagged') && (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {row.status === 'Absent' && <XCircle className="w-3 h-3" />}
                          <span>{row.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Showing {filteredRows.length} of {rows.length} attendance log(s)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
