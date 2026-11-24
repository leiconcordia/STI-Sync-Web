import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  X,
  ArrowRightLeft,
  AlertTriangle,
  Lock,
  Bell,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPersonName } from '../../../utils/name.utils';
import { useCourses, useDepartments, useSections } from '../../academic/hooks/useAcademicStream';
import {
  previewStudentCourseShift,
  flagIneligibleMembershipsForCourseShift,
  executeStudentCourseShift,
} from '../services/student-lifecycle.service';
import type { CourseShiftImpactResult } from '../utils/course-shift.utils';
import type {
  AcademicLevel,
  StudentDocument,
  StudentYearLevel,
} from '../types/student.types';

interface CourseShiftModalProps {
  student: StudentDocument;
  adminUid: string;
  onClose: () => void;
  onSuccess: () => void;
}

const COLLEGE_YEARS: StudentYearLevel[] = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SHS_YEARS: StudentYearLevel[] = ['Grade 11', 'Grade 12'];

export default function CourseShiftModal({
  student,
  adminUid,
  onClose,
  onSuccess,
}: CourseShiftModalProps) {
  const { data: courses = [] } = useCourses();
  const { data: departments = [] } = useDepartments();
  const { data: sections = [] } = useSections();

  const initialLevel: AcademicLevel =
    student.academicLevel === 'SHS' ||
    student.yearLevel === 'Grade 11' ||
    student.yearLevel === 'Grade 12'
      ? 'SHS'
      : 'COLLEGE';

  const [academicLevel, setAcademicLevel] = useState<AcademicLevel>(initialLevel);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(student.courseId || '');
  const [yearLevel, setYearLevel] = useState<StudentYearLevel>(
    student.yearLevel || (initialLevel === 'SHS' ? 'Grade 11' : '1st Year')
  );
  const [section, setSection] = useState<string>(student.section || 'UNASSIGNED');
  const [reason, setReason] = useState<string>('');

  const [checking, setChecking] = useState(false);
  const [impact, setImpact] = useState<CourseShiftImpactResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeCourses = useMemo(
    () => courses.filter((c) => !c.archived && (c.academicLevel || 'COLLEGE') === academicLevel),
    [courses, academicLevel]
  );

  useEffect(() => {
    if (activeCourses.length === 0) return;
    const matchById = activeCourses.find((c) => c.id === selectedCourseId);
    if (!matchById) {
      const matchByCode = activeCourses.find(
        (c) => String(c.code || '').toLowerCase() === String(student.courseCode || '').toLowerCase()
      );
      setSelectedCourseId(matchByCode?.id || activeCourses[0].id);
    }
  }, [activeCourses, selectedCourseId, student.courseCode]);

  useEffect(() => {
    if (academicLevel === 'SHS' && !SHS_YEARS.includes(yearLevel)) {
      setYearLevel('Grade 11');
    } else if (academicLevel === 'COLLEGE' && !COLLEGE_YEARS.includes(yearLevel)) {
      setYearLevel('1st Year');
    }
  }, [academicLevel, yearLevel]);

  const selectedCourse = useMemo(
    () => activeCourses.find((c) => c.id === selectedCourseId) || null,
    [activeCourses, selectedCourseId]
  );

  const selectedDepartment = useMemo(() => {
    if (!selectedCourse?.departmentId) return null;
    return departments.find((d) => d.id === selectedCourse.departmentId) || null;
  }, [departments, selectedCourse]);

  const availableSections = useMemo(() => {
    if (!selectedCourse) return [];
    return sections.filter((s) => !s.archived && s.courseId === selectedCourse.id);
  }, [sections, selectedCourse]);

  useEffect(() => {
    if (section !== 'UNASSIGNED' && !availableSections.some((s) => s.name === section)) {
      setSection('UNASSIGNED');
    }
  }, [availableSections, section]);

  const runImpactPreview = useCallback(async () => {
    if (!selectedCourse) return;
    setChecking(true);
    setCheckError(null);
    try {
      const res = await previewStudentCourseShift(student, {
        academicLevel,
        courseId: selectedCourse.id,
        courseCode: selectedCourse.code,
        courseName: selectedCourse.name,
        departmentId: selectedCourse.departmentId || '',
        departmentName: selectedDepartment?.name || '',
        yearLevel,
        section,
      });
      setImpact(res);
    } catch (err: any) {
      setCheckError(err?.message || 'Failed to check organization eligibility impact.');
      setImpact(null);
    } finally {
      setChecking(false);
    }
  }, [student, academicLevel, selectedCourse, selectedDepartment, yearLevel, section]);

  useEffect(() => {
    void runImpactPreview();
  }, [runImpactPreview]);

  const handleFlagAndNotify = async () => {
    if (!selectedCourse || !impact || impact.blockingActiveMemberships.length === 0) return;
    setFlagging(true);
    try {
      const res = await flagIneligibleMembershipsForCourseShift(
        student,
        {
          academicLevel,
          courseId: selectedCourse.id,
          courseCode: selectedCourse.code,
          courseName: selectedCourse.name,
          departmentId: selectedCourse.departmentId || '',
          departmentName: selectedDepartment?.name || '',
          yearLevel,
          section,
        },
        impact,
        adminUid,
        'MANUAL_PENDING'
      );
      toast.success(
        `Flagged ${res.flaggedCount} membership(s) and notified ${res.notifiedOrgCount} organization(s). Officers will now see an Ineligible Member banner in Member Directory.`
      );
      await runImpactPreview();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to flag and notify club officers.');
    } finally {
      setFlagging(false);
    }
  };

  const handleConfirmShift = async () => {
    if (!selectedCourse || !impact || !impact.isProgramChanging || !impact.canShiftImmediately) return;
    setSubmitting(true);
    try {
      const res = await executeStudentCourseShift(
        student,
        {
          academicLevel,
          courseId: selectedCourse.id,
          courseCode: selectedCourse.code,
          courseName: selectedCourse.name,
          departmentId: selectedCourse.departmentId || '',
          departmentName: selectedDepartment?.name || '',
          yearLevel,
          section,
        },
        adminUid,
        {
          source: 'MANUAL',
          reason,
          allowFlagInsteadOfBlock: false,
        }
      );

      const extras: string[] = [];
      if (res.revokedOfficerCount > 0) {
        extras.push(`${res.revokedOfficerCount} ineligible officer role(s) revoked & Adviser notified`);
      }
      if (res.withdrawnPendingCount > 0) {
        extras.push(`${res.withdrawnPendingCount} ineligible pending application(s) withdrawn`);
      }
      toast.success(
        `Shifted ${formatPersonName(student)} to ${selectedCourse.code}.${extras.length ? ` (${extras.join('; ')})` : ''}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not complete course shift.');
      await runImpactPreview();
    } finally {
      setSubmitting(false);
    }
  };

  const allBlockingAlreadyFlagged = Boolean(
    impact &&
      impact.blockingActiveMemberships.length > 0 &&
      impact.blockingActiveMemberships.every((m) => m.alreadyFlagged)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#001A4D] to-[#0E4EBD] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <ArrowRightLeft className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <h3 className="font-bold text-base">Course Shift / Change Academic Program</h3>
              <p className="text-xs text-white/80">
                {formatPersonName(student)} · {student.studentId} (Current: {student.courseCode})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || flagging}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Program Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                Academic Track
              </label>
              <select
                value={academicLevel}
                onChange={(e) => setAcademicLevel(e.target.value as AcademicLevel)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30"
              >
                <option value="COLLEGE">College / Tertiary</option>
                <option value="SHS">Senior High School (SHS)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                Target Program / Course
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30"
              >
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                Target Year Level
              </label>
              <select
                value={yearLevel}
                onChange={(e) => setYearLevel(e.target.value as StudentYearLevel)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30"
              >
                {(academicLevel === 'SHS' ? SHS_YEARS : COLLEGE_YEARS).map((yl) => (
                  <option key={yl} value={yl}>
                    {yl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                Target Section
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#0E4EBD]/30"
              >
                <option value="UNASSIGNED">UNASSIGNED</option>
                {availableSections.map((sec) => (
                  <option key={sec.id} value={sec.name}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedDepartment && (
            <div className="px-3.5 py-2 rounded-lg bg-blue-50/70 border border-blue-100 text-xs text-[#001A4D] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#0E4EBD] shrink-0" />
              <span>
                Target Department: <strong>{selectedDepartment.name}</strong>
                {selectedDepartment.code ? ` (${selectedDepartment.code})` : ''}
              </span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
              Shift Reason / Registrar Reference <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              placeholder="e.g. Approved Registrar Program Shift Form #2026-041"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0E4EBD]/30"
            />
          </div>

          {/* Organization Eligibility Impact Preview */}
          <div className="border-t border-gray-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider">
                Organization Eligibility &amp; Membership Impact
              </h4>
              <button
                type="button"
                onClick={() => void runImpactPreview()}
                disabled={checking || submitting}
                className="text-xs font-semibold text-[#0E4EBD] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                Re-check
              </button>
            </div>

            {checking ? (
              <div className="p-5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center gap-2 text-xs text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin text-[#0E4EBD]" />
                Validating organization memberships and officer roles...
              </div>
            ) : checkError ? (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{checkError}</span>
              </div>
            ) : impact ? (
              <div className="space-y-3">
                {!impact.isProgramChanging ? (
                  <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600">
                    Select a different program/course from <strong>{student.courseCode}</strong> to perform a course shift.
                  </div>
                ) : (
                  <>
                    {/* HARD-BLOCKED: Ineligible Active Memberships */}
                    {impact.blockingActiveMemberships.length > 0 && (
                      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-rose-900">
                            <div className="font-bold text-sm text-rose-800">
                              Course Shift Blocked — Remove Ineligible Club Membership(s) First
                            </div>
                            <p className="mt-0.5 text-rose-700">
                              This student belongs to {impact.blockingActiveMemberships.length} departmental organization(s) that do not allow{' '}
                              <strong>{impact.toDepartmentLabel}</strong>. Club officers must manually remove them in Member Directory before this shift can be completed.
                            </p>
                          </div>
                        </div>

                        <div className="bg-white border border-rose-100 rounded-lg divide-y divide-rose-100">
                          {impact.blockingActiveMemberships.map((m) => (
                            <div key={m.membershipId} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                              <div>
                                <div className="font-bold text-gray-900">
                                  {m.organizationName} ({m.organizationAcronym})
                                </div>
                                <div className="text-[11px] text-rose-700">
                                  Allowed: {m.orgDeptLabel}
                                </div>
                              </div>
                              {m.alreadyFlagged ? (
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold shrink-0">
                                  Flagged · Awaiting Officer
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold shrink-0">
                                  Ineligible
                                </span>
                              )}
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleFlagAndNotify}
                          disabled={flagging || submitting}
                          className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {flagging ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Bell className="w-3.5 h-3.5" />
                          )}
                          {allBlockingAlreadyFlagged
                            ? 'Re-Send Ineligible Removal Alert to Club Officers'
                            : 'Flag & Notify Club Officers for Removal'}
                        </button>
                      </div>
                    )}

                    {/* AUTO-REVOKE: Ineligible Officer Roles */}
                    {impact.ineligibleOfficerRoles.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                        <div className="flex items-start gap-2 text-xs text-amber-900">
                          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold text-amber-900">
                              Ineligible Officer Role(s) Will Be Automatically Revoked ({impact.ineligibleOfficerRoles.length})
                            </div>
                            <p className="mt-0.5 text-amber-800">
                              Upon completing the course shift, officer access (<code className="font-mono">isActive: false</code>) will be revoked and the Club Adviser / Co-Adviser will be notified to appoint a replacement:
                            </p>
                          </div>
                        </div>
                        <ul className="pl-6 list-disc text-xs text-amber-900 space-y-0.5">
                          {impact.ineligibleOfficerRoles.map((off) => (
                            <li key={off.officerDocId}>
                              <strong>{off.roleName}</strong> · {off.organizationName} ({off.organizationAcronym})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* RETAINED ELIGIBLE CLUBS */}
                    {impact.retainedMemberships.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Retained Eligible Club(s) ({impact.retainedMemberships.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {impact.retainedMemberships.map((m) => (
                            <span
                              key={m.membershipId}
                              className="px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-800 font-semibold text-[11px]"
                            >
                              {m.organizationAcronym} {m.isCrossDepartmental ? '(Cross-Dept)' : '(Eligible)'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PENDING APPLICATIONS TO WITHDRAW */}
                    {impact.ineligiblePendingApplications.length > 0 && (
                      <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700">
                        <strong>{impact.ineligiblePendingApplications.length}</strong> pending application(s) to newly ineligible departmental club(s) will be automatically withdrawn upon shift.
                      </div>
                    )}

                    {/* CLEAR BANNER */}
                    {impact.canShiftImmediately && impact.retainedMemberships.length === 0 && impact.ineligibleOfficerRoles.length === 0 && (
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        No conflicting club memberships or officer roles found. Ready to complete course shift.
                      </div>
                    )}

                    <p className="text-[11px] text-gray-500">
                      Existing financial payables and past event attendance history will remain preserved intact.
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting || flagging}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmShift}
            disabled={
              submitting ||
              flagging ||
              checking ||
              !impact ||
              !impact.isProgramChanging ||
              !impact.canShiftImmediately
            }
            className="px-5 py-2 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? 'Shifting Program...' : 'Confirm Course Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}
