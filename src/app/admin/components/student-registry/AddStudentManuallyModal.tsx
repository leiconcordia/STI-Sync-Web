/**
 * src/app/admin/components/student-registry/AddStudentManuallyModal.tsx
 *
 * Streamlined Late Enrollee Quick Add Modal.
 * Captures essential academic & identity information only (matching bulk import).
 * Automatically generates default password (Caps(LastName) + Last 6 Digits)
 * and delegates profile completion (photos, personal email, DOB, contact) to mobile first login.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  X,
  User,
  GraduationCap,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import {
  createLateEnrolleeStudent,
  promoteOrUpdateStudentStanding,
} from '../../../modules/students/services/student.service';
import {
  useCourses,
  useSections,
  useActiveAcademicPeriods,
} from '../../../modules/academic/hooks/useAcademicStream';
import { useAdviserProfile } from '../../../modules/auth/hooks/useAdviserProfile';
import { useStudents } from '../../../modules/students/hooks/useStudentStream';
import { generateDefaultStudentPassword } from '../../../modules/students/services/registrar-import.service';
import type {
  StudentSex,
  StudentYearLevel,
  StudentSemester,
  AcademicLevel,
  StudentDocument,
} from '../../../modules/students/types/student.types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const COLLEGE_YEAR_LEVELS: StudentYearLevel[] = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SHS_YEAR_LEVELS: StudentYearLevel[] = ['Grade 11', 'Grade 12'];

export default function AddStudentManuallyModal({ onClose, onSuccess }: Props) {
  const { user, profile } = useAdviserProfile();
  const adminUid = user?.uid || profile?.uid || 'admin';

  const { data: allStudents = [] } = useStudents();
  const { data: courses = [] } = useCourses();
  const { data: sections = [] } = useSections();
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();

  // Form State
  const [studentId, setStudentId] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [sex, setSex] = useState<StudentSex>('Male');
  const [academicLevel, setAcademicLevel] = useState<AcademicLevel>('COLLEGE');
  const [courseCode, setCourseCode] = useState('');
  const [yearLevel, setYearLevel] = useState<StudentYearLevel>('1st Year');
  const [section, setSection] = useState('UNASSIGNED');

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Active period based on selected academic level
  const activePeriod = academicLevel === 'SHS' ? activeShsPeriod : activeCollegePeriod;
  const schoolYear = activePeriod?.academicYear || '2026-2027';
  const semester: StudentSemester = (activePeriod?.semester as StudentSemester) || '1st Semester';

  // Filter courses by selected academic level
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => !c.archived && (c.academicLevel || 'COLLEGE') === academicLevel);
  }, [courses, academicLevel]);

  // Auto-select first course when academic level changes
  useEffect(() => {
    if (filteredCourses.length > 0 && (!courseCode || !filteredCourses.some((c) => c.code === courseCode))) {
      setCourseCode(filteredCourses[0].code);
    }
  }, [filteredCourses, courseCode]);

  // Adjust default year level on level change
  useEffect(() => {
    if (academicLevel === 'SHS') {
      if (!SHS_YEAR_LEVELS.includes(yearLevel)) setYearLevel('Grade 11');
    } else {
      if (!COLLEGE_YEAR_LEVELS.includes(yearLevel)) setYearLevel('1st Year');
    }
  }, [academicLevel, yearLevel]);

  // Available sections for chosen course & level
  const availableSections = useMemo(() => {
    const matchedCourse = courses.find((c) => c.code === courseCode);
    if (!matchedCourse) return [];
    return sections.filter((s) => !s.archived && s.courseId === matchedCourse.id);
  }, [sections, courses, courseCode]);

  // ─── Real-Time Duplicate & Collision Validation ─────────────────────────────

  const duplicateCheck = useMemo(() => {
    const cleanId = studentId.trim();
    if (!cleanId || cleanId.length < 5) return null;

    const existing = allStudents.find((s) => s.studentId && s.studentId.trim() === cleanId);
    if (!existing) return { status: 'AVAILABLE' as const, student: null };

    const exLast = (existing.lastName || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    const inLast = lastName.trim().toUpperCase().replace(/[^A-Z]/g, '');

    // If last name is entered and doesn't match -> ID COLLISION CONFLICT
    if (inLast.length > 0 && exLast !== inLast && !exLast.includes(inLast) && !inLast.includes(exLast)) {
      return {
        status: 'COLLISION' as const,
        student: existing,
        message: `ID Conflict: Student ID ${cleanId} already belongs to ${existing.lastName}, ${existing.firstName} (${existing.courseCode || ''} ${existing.yearLevel || ''}).`,
      };
    }

    // Name matches -> EXISTING STUDENT RECORD (can be updated / promoted)
    return {
      status: 'EXISTS_SAME_STUDENT' as const,
      student: existing,
      message: `Student ${existing.lastName}, ${existing.firstName} is already registered in ${existing.courseCode || ''} (${existing.yearLevel || ''}, ${existing.schoolYear || ''} ${existing.semester || ''}).`,
    };
  }, [studentId, lastName, allStudents]);

  // Computed Default Password
  const generatedPassword = useMemo(() => {
    if (!lastName || !studentId) return 'Ablen496332 (example)';
    return generateDefaultStudentPassword(lastName, studentId);
  }, [lastName, studentId]);

  // ─── Submit Handler ─────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const cleanId = studentId.trim();
    const cleanLast = lastName.trim().toUpperCase();
    const cleanFirst = firstName.trim().toUpperCase();

    if (!cleanId || !/^\d{8,15}$/.test(cleanId)) {
      setSubmitError('Please enter a valid official Student ID (digits only).');
      return;
    }
    if (!cleanLast || !cleanFirst) {
      setSubmitError('Please enter the student full legal name (Last and First name).');
      return;
    }

    const selectedCourseObj = courses.find((c) => c.code === courseCode);
    if (!selectedCourseObj) {
      setSubmitError('Please select a valid Course / Academic Program.');
      return;
    }

    if (duplicateCheck?.status === 'COLLISION') {
      setSubmitError(duplicateCheck.message);
      return;
    }

    setSaving(true);
    try {
      if (duplicateCheck?.status === 'EXISTS_SAME_STUDENT' && duplicateCheck.student) {
        // Update / Advance existing student standing
        await promoteOrUpdateStudentStanding(duplicateCheck.student.id, {
          yearLevel,
          courseId: selectedCourseObj.id,
          courseCode: selectedCourseObj.code,
          courseName: selectedCourseObj.name,
          departmentId: selectedCourseObj.departmentId,
          section: section.trim() || 'UNASSIGNED',
          schoolYear,
          semester,
          academicLevel,
        });
      } else {
        // Create new Late Enrollee student
        await createLateEnrolleeStudent(
          {
            studentId: cleanId,
            lastName: cleanLast,
            firstName: cleanFirst,
            middleName: middleName.trim().toUpperCase(),
            sex,
            academicLevel,
            courseId: selectedCourseObj.id,
            courseCode: selectedCourseObj.code,
            courseName: selectedCourseObj.name,
            departmentId: selectedCourseObj.departmentId,
            yearLevel,
            section: section.trim() || 'UNASSIGNED',
            schoolYear,
            semester,
          },
          adminUid
        );
      }

      setSaving(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save student:', err);
      setSubmitError(err.message || 'Failed to save student record.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <User className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Add Student (Late Enrollee)</h2>
              <p className="text-xs text-blue-100">
                Quick entry for late enrollees • Profile completed on mobile login
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[82vh]">
          
          {submitError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Conflict Warning */}
          {duplicateCheck?.status === 'COLLISION' && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 flex items-start gap-2.5 text-xs text-red-800 animate-fade-in">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
              <div>
                <strong className="font-bold">Student ID Collision Detected:</strong>
                <p className="mt-0.5">{duplicateCheck.message}</p>
                <span className="text-[11px] text-red-600 font-semibold block mt-1">
                  You cannot register a different student with an existing Student Number.
                </span>
              </div>
            </div>
          )}

          {/* Same Student Already Registered Notice */}
          {duplicateCheck?.status === 'EXISTS_SAME_STUDENT' && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2.5 text-xs text-blue-900 animate-fade-in">
              <RefreshCw className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600 animate-spin-slow" />
              <div>
                <strong className="font-bold">Existing Student Record:</strong>
                <p className="mt-0.5">{duplicateCheck.message}</p>
                <p className="text-[11px] text-blue-700 font-medium mt-1">
                  Submitting will update and advance their academic standing to this term without creating a duplicate record.
                </p>
              </div>
            </div>
          )}

          {/* Step 1: Identity Information */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#001A4D]" /> Identity & Registration
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Student ID / Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 02000496332"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.trim())}
                  className={`w-full px-3 py-2 text-xs font-mono rounded-lg border focus:ring-2 focus:outline-none transition-all ${
                    duplicateCheck?.status === 'COLLISION'
                      ? 'border-red-400 bg-red-50/30 focus:ring-red-300'
                      : 'border-gray-300 focus:ring-blue-100 focus:border-[#001A4D]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Sex <span className="text-red-500">*</span>
                </label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as StudentSex)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ABLEN"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-semibold uppercase rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. JUAN"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-semibold uppercase rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Middle Name <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. DELA CRUZ"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs uppercase rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D]"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Academic Program & Level */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-[#001A4D]" /> Academic Standing
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Academic Level <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAcademicLevel('COLLEGE')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      academicLevel === 'COLLEGE'
                        ? 'bg-[#001A4D] text-white border-[#001A4D]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    College
                  </button>
                  <button
                    type="button"
                    onClick={() => setAcademicLevel('SHS')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      academicLevel === 'SHS'
                        ? 'bg-[#001A4D] text-white border-[#001A4D]'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Senior High
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Academic Program / Strand <span className="text-red-500">*</span>
                </label>
                <select
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white"
                >
                  {filteredCourses.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Year Level <span className="text-red-500">*</span>
                </label>
                <select
                  value={yearLevel}
                  onChange={(e) => setYearLevel(e.target.value as StudentYearLevel)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium"
                >
                  {(academicLevel === 'SHS' ? SHS_YEAR_LEVELS : COLLEGE_YEAR_LEVELS).map((yl) => (
                    <option key={yl} value={yl}>
                      {yl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Section <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                {availableSections.length > 0 ? (
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium"
                  >
                    <option value="UNASSIGNED">UNASSIGNED</option>
                    {availableSections.map((sec) => (
                      <option key={sec.id} value={sec.name}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. BSIT-1A or UNASSIGNED"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D]"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Credentials Info Notice */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5 text-xs text-gray-600">
            <div className="flex items-center gap-1.5 font-bold text-gray-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Auto-Generated Mobile Credentials:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-500">Initial Password: </span>
                <span className="font-mono font-bold text-blue-700">{generatedPassword}</span>
              </div>
              <div>
                <span className="text-gray-500">Email Address: </span>
                <span className="text-amber-800 font-semibold">Entered by Student on Mobile</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-200">
              No email is pre-assigned. The student will upload their email address, contact number, birthdate, and photos upon their first login in the mobile app.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || duplicateCheck?.status === 'COLLISION'}
              className="px-5 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white rounded-xl text-xs font-bold hover:opacity-95 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Student...
                </>
              ) : duplicateCheck?.status === 'EXISTS_SAME_STUDENT' ? (
                <>
                  <RefreshCw className="w-4 h-4 text-yellow-300" />
                  <span>Update & Advance Student</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Register Late Enrollee</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
