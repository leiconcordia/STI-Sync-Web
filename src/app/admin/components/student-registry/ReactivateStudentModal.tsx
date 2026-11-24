import { formatPersonName } from '../../../utils/name.utils';
import { useState, useMemo, useEffect } from 'react';
import { X, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react';
import type {
  AcademicLevel,
  StudentDocument,
  StudentSemester,
  StudentYearLevel,
} from '../../../modules/students/types/student.types';
import { reactivateStudentForTerm } from '../../../modules/students/services/student-lifecycle.service';
import {
  useActiveAcademicPeriods,
  useCourses,
  useDepartments,
  useSections,
} from '../../../modules/academic/hooks/useAcademicStream';
import { useAdviserProfile } from '../../../modules/auth/hooks/useAdviserProfile';
import { toast } from 'sonner';

interface ReactivateStudentModalProps {
  student: StudentDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const COLLEGE_YEARS: StudentYearLevel[] = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SHS_YEARS: StudentYearLevel[] = ['Grade 11', 'Grade 12'];

export default function ReactivateStudentModal({
  student,
  isOpen,
  onClose,
  onSuccess,
}: ReactivateStudentModalProps) {
  const { user, profile } = useAdviserProfile();
  const adminUid = user?.uid || profile?.uid || 'admin';
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();
  const { data: courses = [] } = useCourses();
  const { data: departments = [] } = useDepartments();
  const { data: sections = [] } = useSections();

  const [academicLevel, setAcademicLevel] = useState<AcademicLevel>('COLLEGE');
  const [courseId, setCourseId] = useState('');
  const [yearLevel, setYearLevel] = useState<StudentYearLevel>('1st Year');
  const [section, setSection] = useState('UNASSIGNED');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!student || !isOpen) return;
    const isShs =
      student.academicLevel === 'SHS' ||
      student.yearLevel === 'Grade 11' ||
      student.yearLevel === 'Grade 12';
    setAcademicLevel(isShs ? 'SHS' : 'COLLEGE');
    setCourseId(student.courseId || '');
    setYearLevel(student.yearLevel || (isShs ? 'Grade 11' : '1st Year'));
    setSection(student.section || 'UNASSIGNED');
  }, [student, isOpen]);

  const activeCourses = useMemo(
    () => courses.filter((c) => !c.archived && (c.academicLevel || 'COLLEGE') === academicLevel),
    [courses, academicLevel]
  );

  useEffect(() => {
    if (!student || activeCourses.length === 0) return;
    if (!activeCourses.some((c) => c.id === courseId)) {
      const byCode = activeCourses.find(
        (c) => String(c.code || '').toLowerCase() === String(student.courseCode || '').toLowerCase()
      );
      setCourseId(byCode?.id || activeCourses[0].id);
    }
  }, [activeCourses, courseId, student]);

  useEffect(() => {
    if (academicLevel === 'SHS' && !SHS_YEARS.includes(yearLevel)) {
      setYearLevel('Grade 11');
    } else if (academicLevel === 'COLLEGE' && !COLLEGE_YEARS.includes(yearLevel)) {
      setYearLevel('1st Year');
    }
  }, [academicLevel, yearLevel]);

  const selectedCourse = useMemo(
    () => activeCourses.find((c) => c.id === courseId) || null,
    [activeCourses, courseId]
  );

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === selectedCourse?.departmentId) || null,
    [departments, selectedCourse]
  );

  const availableSections = useMemo(() => {
    if (!selectedCourse) return [];
    return sections.filter((s) => !s.archived && s.courseId === selectedCourse.id);
  }, [sections, selectedCourse]);

  if (!isOpen || !student) return null;

  const activePeriod = academicLevel === 'SHS' ? activeShsPeriod : activeCollegePeriod;
  const targetSchoolYear = activePeriod?.academicYear || student.schoolYear || '2026-2027';
  const targetSemester = (activePeriod?.semester || student.semester || '1st Semester') as StudentSemester;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const res = await reactivateStudentForTerm(student.id, {
        schoolYear: targetSchoolYear,
        semester: targetSemester,
        academicLevel,
        yearLevel,
        section: section.trim() || 'UNASSIGNED',
        courseId: selectedCourse?.id || student.courseId,
        courseCode: selectedCourse?.code || student.courseCode,
        courseName: selectedCourse?.name || student.courseName,
        departmentId: selectedCourse?.departmentId || student.departmentId,
        departmentName: selectedDept?.name || student.departmentName,
        adminUid,
      });

      const notes: string[] = [];
      if (res.restoredMembershipCount > 0) {
        notes.push(`${res.restoredMembershipCount} eligible club membership(s) restored`);
      }
      if (res.flaggedIneligibleCount > 0) {
        notes.push(`${res.flaggedIneligibleCount} ineligible club(s) flagged for officer removal`);
      }
      if (res.revokedOfficerCount > 0) {
        notes.push(`${res.revokedOfficerCount} ineligible officer role(s) revoked`);
      }

      toast.success(
        `Reactivated ${formatPersonName(student)} for A.Y. ${targetSchoolYear} (${targetSemester}).${
          notes.length ? ` ${notes.join('; ')}.` : ''
        }`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Reactivation error:', err);
      toast.error(`Failed to reactivate student: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-green-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Re-Enroll &amp; Reactivate Student</h3>
              <p className="text-xs text-white/80">
                Restore active standing for A.Y. {targetSchoolYear} ({targetSemester})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="w-10 h-10 bg-[#001A4D] rounded-full flex items-center justify-center text-white font-bold text-xs uppercase overflow-hidden flex-shrink-0">
              {student.profilePhotoUrl ? (
                <img src={student.profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                `${student.firstName?.[0] || ''}${student.lastName?.[0] || ''}`
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-[#001A4D]">
                {formatPersonName(student)}
              </p>
              <p className="text-xs text-gray-500 font-mono">
                {student.studentId} · Last Term: {student.schoolYear || '—'} {student.semester || ''}
              </p>
            </div>
          </div>

          {/* Confirm / Update Current Standing on Re-Enrollment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                Program / Course
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
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
                Year Level
              </label>
              <select
                value={yearLevel}
                onChange={(e) => setYearLevel(e.target.value as StudentYearLevel)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
              >
                {(academicLevel === 'SHS' ? SHS_YEARS : COLLEGE_YEARS).map((yl) => (
                  <option key={yl} value={yl}>
                    {yl}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                Section
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
              >
                <option value="UNASSIGNED">UNASSIGNED</option>
                {availableSections.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-xl p-3.5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-green-900 leading-relaxed space-y-1">
              <span className="font-bold block">Re-Enrollment &amp; Reactivation Notice</span>
              <p>
                Sets status to <strong>ACTIVE</strong> for <strong>A.Y. {targetSchoolYear} ({targetSemester})</strong>, restores mobile app access, and automatically restores department-eligible club memberships. If the student shifted programs, ineligible clubs will be flagged for officer removal.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Reactivating...
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                Confirm Re-Enroll &amp; Reactivate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
