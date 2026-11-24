import { useState, useMemo, useEffect } from 'react';
import {
  X,
  UserX,
  Bell,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPersonName } from '../../../utils/name.utils';
import type { StudentDocument } from '../../../modules/students/types/student.types';
import type { SemesterDocument } from '../../../modules/academic/types/academic.types';
import { findUnenrolledActiveStudents } from '../../../modules/students/utils/enrollment-activation.utils';
import {
  notifyAdvisersOfUnenrolledStudents,
  deactivateUnenrolledStudents,
} from '../../../modules/students/services/student-lifecycle.service';

interface UnenrolledStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeStudents: StudentDocument[];
  activeCollegePeriod?: SemesterDocument | null;
  activeShsPeriod?: SemesterDocument | null;
  adminUid: string;
}

export default function UnenrolledStudentsModal({
  isOpen,
  onClose,
  activeStudents,
  activeCollegePeriod,
  activeShsPeriod,
  adminUid,
}: UnenrolledStudentsModalProps) {
  const [trackFilter, setTrackFilter] = useState<'ALL' | 'COLLEGE' | 'SHS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notifying, setNotifying] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const unenrolledEntries = useMemo(
    () => findUnenrolledActiveStudents(activeStudents, activeCollegePeriod, activeShsPeriod),
    [activeStudents, activeCollegePeriod, activeShsPeriod]
  );

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unenrolledEntries.filter((entry) => {
      if (trackFilter !== 'ALL' && entry.academicLevel !== trackFilter) return false;
      if (!q) return true;
      const fullName = `${entry.student.firstName} ${entry.student.middleName || ''} ${entry.student.lastName}`.toLowerCase();
      return (
        fullName.includes(q) ||
        (entry.student.studentId || '').toLowerCase().includes(q) ||
        (entry.student.courseCode || '').toLowerCase().includes(q)
      );
    });
  }, [unenrolledEntries, trackFilter, searchQuery]);

  // Keep selectedIds synced with still-present entries
  useEffect(() => {
    const validIds = new Set(unenrolledEntries.map((e) => e.student.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [unenrolledEntries]);

  if (!isOpen) return null;

  const allFilteredSelected =
    filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.includes(e.student.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredEntries.map((e) => e.student.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...filteredEntries.map((e) => e.student.id)]);
      setSelectedIds(Array.from(merged));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedStudents = unenrolledEntries
    .filter((e) => selectedIds.includes(e.student.id))
    .map((e) => e.student);

  const activeTermSummary = [
    activeCollegePeriod ? `College: ${activeCollegePeriod.academicYear} ${activeCollegePeriod.semester}` : null,
    activeShsPeriod ? `SHS: ${activeShsPeriod.academicYear} ${activeShsPeriod.semester}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'the active term';

  const handleNotifyAdvisers = async () => {
    const targets = selectedStudents.length > 0 ? selectedStudents : filteredEntries.map((e) => e.student);
    if (targets.length === 0) return;

    setNotifying(true);
    try {
      const res = await notifyAdvisersOfUnenrolledStudents(targets, activeTermSummary, adminUid, 'REMINDER');
      if (res.notifiedOrgCount === 0) {
        toast.info('None of the selected unenrolled students currently hold active club memberships or officer roles.');
      } else {
        toast.success(
          `Notified ${res.notifiedOrgCount} Club Adviser(s) regarding ${res.totalAffectedMembers} unenrolled member(s) / officer(s).`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to notify club advisers.');
    } finally {
      setNotifying(false);
    }
  };

  const handleDeactivateSelected = async () => {
    if (selectedStudents.length === 0) return;
    setDeactivating(true);
    try {
      const res = await deactivateUnenrolledStudents(
        selectedStudents,
        `Not enrolled for ${activeTermSummary}`,
        adminUid,
        activeTermSummary
      );
      toast.success(
        `Deactivated ${res.deactivatedStudentCount} student(s), updated ${res.deactivatedMembershipCount} club membership(s), revoked ${res.revokedOfficerCount} officer role(s), and notified ${res.notifiedOrgCount} Club Adviser(s).`
      );
      setSelectedIds([]);
      if (res.deactivatedStudentCount >= unenrolledEntries.length) {
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to deactivate selected students.');
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <UserX className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <h3 className="font-bold text-base">Unenrolled Active Students Check</h3>
              <p className="text-xs text-white/80">
                Active Period: {activeTermSummary}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={notifying || deactivating}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {unenrolledEntries.length === 0 ? (
            <div className="p-10 text-center space-y-2 bg-emerald-50/70 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="font-bold text-emerald-900">All Active Students Are Enrolled</h4>
              <p className="text-xs text-emerald-700">
                Every active student in the registry matches the current active academic period ({activeTermSummary}).
              </p>
            </div>
          ) : (
            <>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Found <strong>{unenrolledEntries.length}</strong> active student(s) still stamped with a previous academic period. You can <strong>Notify Club Advisers</strong> first so they can follow up with their members/officers, or manually <strong>Deactivate Selected</strong> (which marks accounts Inactive, pauses club memberships, revokes officer access, and alerts affected Advisers).
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                  {(['ALL', 'COLLEGE', 'SHS'] as const).map((trk) => (
                    <button
                      key={trk}
                      type="button"
                      onClick={() => setTrackFilter(trk)}
                      className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                        trackFilter === trk ? 'bg-white text-[#001A4D] shadow-xs' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {trk === 'ALL' ? `All (${unenrolledEntries.length})` : trk}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, ID, or course..."
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-[#001A4D]"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase">
                    <tr>
                      <th className="px-3 py-2.5 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 cursor-pointer"
                        />
                      </th>
                      <th className="px-3 py-2.5">Student</th>
                      <th className="px-3 py-2.5">Program &amp; Year</th>
                      <th className="px-3 py-2.5">Recorded Term</th>
                      <th className="px-3 py-2.5">Expected Term</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredEntries.map(({ student, expectedPeriodLabel }) => {
                      const isChecked = selectedIds.includes(student.id);
                      return (
                        <tr
                          key={student.id}
                          onClick={() => toggleOne(student.id)}
                          className={`cursor-pointer transition-colors ${
                            isChecked ? 'bg-rose-50/50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleOne(student.id)}
                              className="rounded border-gray-300 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-[#001A4D]">{formatPersonName(student)}</div>
                            <div className="font-mono text-[11px] text-gray-500">{student.studentId}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-gray-800">{student.courseCode}</span>
                            <div className="text-[11px] text-gray-500">{student.yearLevel}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                              {student.schoolYear || 'Unset'} {student.semester || ''}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 font-medium">{expectedPeriodLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-gray-600">
            {selectedStudents.length > 0
              ? `${selectedStudents.length} student(s) selected`
              : 'Select students to deactivate, or notify all listed'}
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={notifying || deactivating}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 cursor-pointer"
            >
              Close
            </button>

            {unenrolledEntries.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleNotifyAdvisers}
                  disabled={notifying || deactivating}
                  className="px-4 py-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {notifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                  {selectedStudents.length > 0
                    ? `Notify Advisers (${selectedStudents.length})`
                    : 'Notify All Advisers'}
                </button>

                <button
                  type="button"
                  onClick={handleDeactivateSelected}
                  disabled={deactivating || notifying || selectedStudents.length === 0}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deactivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                  Deactivate Selected ({selectedStudents.length})
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
