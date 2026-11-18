import { formatPersonName } from '../../utils/name.utils';
import { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2, Building2, AlertTriangle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import {
  useActiveAcademicPeriods,
  useDepartments,
  useCourses,
} from '../../modules/academic/hooks/useAcademicStream';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useOrgMembers } from '../../modules/organizations/hooks/useOrgMembers';
import { addMember } from '../../modules/organizations/services/member.service';
import type { AddMemberPayload } from '../../modules/organizations/types/member.types';
import {
  checkStudentDepartmentEligibility,
  isOrganizationCrossDepartmental,
  resolveCanonicalDepartment,
  resolveOrgDepartmentDisplay,
} from '../../modules/organizations/utils/department-eligibility.utils';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  addedBy: string; // The studentId of the officer adding them
}

export function AddMemberModal({ isOpen, onClose, organizationId, addedBy }: AddMemberModalProps) {
  const { data: allStudents = [], loading: loadingStudents } = useStudents();
  const { members: existingOrgMembers = [], loading: loadingMembers } = useOrgMembers(organizationId);
  const { data: orgs = [] } = useOrganizationStream();
  const { data: departments = [] } = useDepartments();
  const { data: courses = [] } = useCourses();
  const { isStudentPendingReEnrollment } = useActiveAcademicPeriods();

  const activeOrg = orgs.find((o) => o.id === organizationId);

  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    studentId: '',
    authUid: '',
    studentName: '',
    email: '',
    course: '',
    year: '',
    section: '',
    departmentId: '',
    department: '',
    contactNumber: '',
    paymentStatus: 'outstanding' as 'paid' | 'outstanding',
  });

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setShowDropdown(false);
      setSubmitError(null);
      setFormData({
        studentId: '',
        authUid: '',
        studentName: '',
        email: '',
        course: '',
        year: '',
        section: '',
        departmentId: '',
        department: '',
        contactNumber: '',
        paymentStatus: 'outstanding',
      });
    }
  }, [isOpen]);

  const isCrossDept = useMemo(
    () => isOrganizationCrossDepartmental(activeOrg),
    [activeOrg]
  );

  const orgDeptLabel = useMemo(
    () => resolveOrgDepartmentDisplay(activeOrg, departments),
    [activeOrg, departments]
  );

  // Evaluate active/enrolled status and strict department eligibility
  const evaluateStudentEligibility = (student: any) => {
    if (!student) {
      return { eligible: false, deptLabel: 'Unknown', reason: 'Student record not found.' };
    }
    if (student.archived || student.status !== 'ACTIVE' || isStudentPendingReEnrollment(student)) {
      return {
        eligible: false,
        deptLabel: resolveCanonicalDepartment(student, departments, courses).label,
        reason: 'Student must be Active and enrolled for the current term.',
      };
    }

    const deptResult = checkStudentDepartmentEligibility(activeOrg, student, departments, courses);
    return {
      eligible: deptResult.eligible,
      deptLabel: deptResult.studentDeptLabel,
      reason: deptResult.reason,
    };
  };

  if (!isOpen) return null;

  const handleSelectStudent = (student: any) => {
    const check = evaluateStudentEligibility(student);
    if (!check.eligible) {
      const msg =
        check.reason ||
        `Cannot select student: This organization is restricted to ${orgDeptLabel} students.`;
      setSubmitError(msg);
      toast.error(msg);
      return;
    }

    const resolvedDept = resolveCanonicalDepartment(student, departments, courses);
    setSubmitError(null);
    setFormData({
      ...formData,
      studentId: student.studentId || student.id || '',
      authUid: student.authUid || student.id || '',
      studentName: formatPersonName(student),
      email: student.email || '',
      course: student.courseCode || student.courseName || '',
      year: student.yearLevel || '',
      section: student.section || '',
      departmentId: resolvedDept.canonicalDeptId || student.departmentId || '',
      department: resolvedDept.canonicalName || student.departmentName || student.department || '',
      contactNumber: student.contactNumber || student.phone || '',
    });
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!formData.studentId || !formData.studentName) {
      const msg = 'Please select an eligible student from the search dropdown.';
      setSubmitError(msg);
      toast.error(msg);
      return;
    }

    const studentObj = allStudents.find(
      (s) =>
        (s.studentId && s.studentId.trim().toLowerCase() === formData.studentId.trim().toLowerCase()) ||
        (s.id && s.id.trim().toLowerCase() === formData.studentId.trim().toLowerCase()) ||
        (s.authUid && formData.authUid && s.authUid.trim().toLowerCase() === formData.authUid.trim().toLowerCase())
    );

    if (!studentObj) {
      const msg = 'Student record could not be verified in the active Student Registry.';
      setSubmitError(msg);
      toast.error(msg);
      return;
    }

    const check = evaluateStudentEligibility(studentObj);
    if (!check.eligible) {
      const msg =
        check.reason ||
        `Cannot add member: This organization is restricted strictly to ${orgDeptLabel} students.`;
      setSubmitError(msg);
      toast.error(msg);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: AddMemberPayload = {
        ...formData,
        studentId: (formData.studentId || '').trim(),
        authUid: (formData.authUid || '').trim() || undefined,
        studentName: (formData.studentName || '').trim(),
        email: (formData.email || '').trim().toLowerCase(),
        course: formData.course || '',
        year: formData.year || '',
        section: formData.section || '',
        departmentId: formData.departmentId || undefined,
        department: formData.department || '',
        contactNumber: formData.contactNumber || '',
        organizationId,
        status: 'active',
      };

      await addMember(payload, addedBy);
      toast.success(`${payload.studentName} added to ${activeOrg?.acronym || activeOrg?.name || 'organization'}.`);
      onClose();
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || 'Failed to add member.';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-[500px] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="bg-[#001A4D] px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-lg">Add New Member</h2>
            {activeOrg && (
              <p className="text-blue-200 text-xs flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>{activeOrg.name}</span>
                {isCrossDept ? (
                  <span className="text-emerald-300 font-semibold">• Open to All Students</span>
                ) : (
                  <span className="text-amber-300 font-semibold">
                    • Exclusive to {orgDeptLabel} Students
                  </span>
                )}
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={isSubmitting} className="text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {submitError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Quick Search Student */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Eligible Student</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={
                  isCrossDept
                    ? "Search active student by name, ID, or email..."
                    : `Search ${orgDeptLabel} student by name, ID, or email...`
                }
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-4 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:ring-2 focus:ring-[#1E70E8] outline-none"
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              {isCrossDept
                ? "Showing active, enrolled students from any department."
                : `Restricted strictly to active ${orgDeptLabel} students. Students from other departments cannot be added.`}
            </p>

            {/* Dropdown */}
            {showDropdown && searchQuery.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E0E0E0] rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                {loadingStudents || loadingMembers ? (
                  <div className="p-3 text-sm text-gray-500 text-center">Loading eligible students...</div>
                ) : (
                  (() => {
                    const queryText = searchQuery.trim().toLowerCase();
                    const existingMemberIds = new Set<string>();
                    const existingMemberEmails = new Set<string>();

                    existingOrgMembers.forEach((m) => {
                      const st = String(m.status || '').toLowerCase();
                      if (st === 'removed' || st === 'rejected') return;
                      if (m.studentId) existingMemberIds.add(m.studentId.toLowerCase().trim());
                      if (m.studentSchoolId) existingMemberIds.add(m.studentSchoolId.toLowerCase().trim());
                      if (m.authUid) existingMemberIds.add(m.authUid.toLowerCase().trim());
                      if (m.email) existingMemberEmails.add(m.email.toLowerCase().trim());
                    });

                    const activeMatches = allStudents
                      .filter((s) => {
                        if (!s || s.archived || s.status !== 'ACTIVE' || isStudentPendingReEnrollment(s)) {
                          return false;
                        }

                        // Exclude students already registered in this org
                        const sDocId = (s.id || '').toLowerCase().trim();
                        const sAuthUid = (s.authUid || '').toLowerCase().trim();
                        const sSchoolId = (s.studentId || '').toLowerCase().trim();
                        const sEmail = (s.email || '').toLowerCase().trim();

                        if (
                          existingMemberIds.has(sDocId) ||
                          (sAuthUid && existingMemberIds.has(sAuthUid)) ||
                          (sSchoolId && existingMemberIds.has(sSchoolId)) ||
                          (sEmail && existingMemberEmails.has(sEmail))
                        ) {
                          return false;
                        }

                        // Search query matching
                        const fullName = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase();
                        return fullName.includes(queryText) || sSchoolId.includes(queryText) || sEmail.includes(queryText);
                      })
                      .map((s) => ({
                        student: s,
                        check: evaluateStudentEligibility(s),
                      }))
                      .sort((a, b) => Number(b.check.eligible) - Number(a.check.eligible))
                      .slice(0, 6);

                    if (activeMatches.length === 0) {
                      return (
                        <div className="p-3 text-xs text-gray-500 text-center">
                          {isCrossDept
                            ? `No eligible students found matching "${searchQuery}".`
                            : `No active students found matching "${searchQuery}". Only ${orgDeptLabel} students can join this organization.`}
                        </div>
                      );
                    }

                    return activeMatches.map(({ student: s, check }) => {
                      if (!check.eligible) {
                        return (
                          <div
                            key={s.id}
                            aria-disabled="true"
                            onClick={() => handleSelectStudent(s)}
                            className="px-4 py-2.5 bg-rose-50/40 border-b border-gray-100 last:border-0 cursor-not-allowed opacity-75"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-600 text-sm">{formatPersonName(s)}</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold">
                                <Lock className="w-2.5 h-2.5" />
                                Different Dept
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="font-mono">{s.studentId}</span>
                              <span>•</span>
                              <span>{s.courseCode || s.courseName || 'Student'}</span>
                              <span>•</span>
                              <span className="text-rose-700 font-medium">{check.deptLabel}</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={s.id}
                          onClick={() => handleSelectStudent(s)}
                          className="px-4 py-2.5 hover:bg-blue-50/60 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                        >
                          <div className="font-medium text-[#001A4D] text-sm">{formatPersonName(s)}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="font-mono">{s.studentId}</span>
                            <span>•</span>
                            <span className="text-[#0E4EBD] font-semibold">{s.courseCode || s.courseName || 'Student'}</span>
                            <span>•</span>
                            <span className="text-gray-600 font-medium">{check.deptLabel}</span>
                            <span>•</span>
                            <span className="text-green-600 font-semibold">Eligible</span>
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            )}
          </div>

          <form id="add-member-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student ID *</label>
                <input
                  type="text"
                  required
                  readOnly
                  placeholder="Select student above"
                  value={formData.studentId}
                  className="w-full px-3 py-2 border border-[#E0E0E0] bg-gray-100 text-gray-700 rounded-lg text-sm cursor-not-allowed outline-none select-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  readOnly
                  placeholder="Select student above"
                  value={formData.studentName}
                  className="w-full px-3 py-2 border border-[#E0E0E0] bg-gray-100 text-gray-700 rounded-lg text-sm cursor-not-allowed outline-none select-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                readOnly
                placeholder="Auto-filled from official record"
                value={formData.email}
                className="w-full px-3 py-2 border border-[#E0E0E0] bg-gray-100 text-gray-700 rounded-lg text-sm cursor-not-allowed outline-none select-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
                <input
                  type="text"
                  readOnly
                  placeholder="Auto-filled"
                  value={formData.course}
                  className="w-full px-3 py-2 border border-[#E0E0E0] bg-gray-100 text-gray-700 rounded-lg text-sm cursor-not-allowed outline-none select-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year Level</label>
                <input
                  type="text"
                  readOnly
                  placeholder="Auto-filled"
                  value={formData.year}
                  className="w-full px-3 py-2 border border-[#E0E0E0] bg-gray-100 text-gray-700 rounded-lg text-sm cursor-not-allowed outline-none select-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  readOnly
                  placeholder="Auto-filled"
                  value={formData.department}
                  className="w-full px-3 py-2 border border-[#E0E0E0] bg-gray-100 text-gray-700 rounded-lg text-sm cursor-not-allowed outline-none select-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                <input
                  type="text"
                  readOnly
                  placeholder="Auto-filled"
                  value={formData.contactNumber}
                  className="w-full px-3 py-2 border border-[#E0E0E0] bg-gray-100 text-gray-700 rounded-lg text-sm cursor-not-allowed outline-none select-none"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="border-t border-[#E0E0E0] px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-member-form"
            disabled={isSubmitting || !formData.studentId || !formData.studentName}
            className="px-4 py-2 text-sm font-bold text-white bg-[#0E4EBD] rounded-lg hover:bg-[#0E4EBD]/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Adding...' : 'Add Member'}
          </button>
        </div>
      </div>
    </div>
  );
}
