/**
 * src/app/admin/components/student-registry/ExportStudentsModal.tsx
 *
 * Interactive Dynamic Export Modal.
 * Allows administrators to export:
 *  - Official Class Rosters (No passwords - safe for faculty & attendance)
 *  - Account Credentials Distribution Slips (With default passwords)
 *  - Dynamically filtered by Section, Course, Year Level, or Academic Track
 *  - Formats: Formatted Excel (.xlsx) with multi-sheet section grouping, or CSV
 */

import { useState, useMemo } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  KeyRound,
  Users,
  ShieldAlert,
  Check,
  Filter,
  Eye,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import type { StudentDocument } from '../../../modules/students/types/student.types';
import {
  exportStudentsDynamic,
  filterStudentsForExport,
} from '../../../modules/students/utils/export.utils';
import { generateDefaultStudentPassword } from '../../../modules/students/services/registrar-import.service';

interface ExportStudentsModalProps {
  onClose: () => void;
  students: StudentDocument[];
  currentSectionFilter?: string;
  currentCourseFilter?: string;
}

export default function ExportStudentsModal({
  onClose,
  students,
  currentSectionFilter = 'All Sections',
  currentCourseFilter = 'All Programs',
}: ExportStudentsModalProps) {
  // Export Mode: 'ROSTER_NO_PASSWORD' vs 'CREDENTIALS_WITH_PASSWORD'
  const [includePassword, setIncludePassword] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [groupBySection, setGroupBySection] = useState(true);

  // Dynamic Filters State
  const [selectedTrack, setSelectedTrack] = useState<'ALL' | 'COLLEGE' | 'SHS'>('ALL');
  const [selectedSection, setSelectedSection] = useState<string>(
    currentSectionFilter === 'All Sections' ? 'ALL' : currentSectionFilter
  );
  const [selectedCourse, setSelectedCourse] = useState<string>(
    currentCourseFilter === 'All Programs' ? 'ALL' : currentCourseFilter
  );
  const [selectedYearLevel, setSelectedYearLevel] = useState<string>('ALL');

  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Extract distinct sections with counts
  const sectionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of students) {
      const sec = s.section?.trim() || 'UNASSIGNED';
      counts.set(sec, (counts.get(sec) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  // Extract distinct courses
  const courseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      if (s.courseCode) set.add(s.courseCode.trim());
    }
    return Array.from(set).sort();
  }, [students]);

  // Extract distinct year levels
  const yearLevelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      if (s.yearLevel) set.add(s.yearLevel.trim());
    }
    return Array.from(set).sort();
  }, [students]);

  // Compute filtered students live
  const filteredStudents = useMemo(() => {
    let list = students;
    if (selectedTrack !== 'ALL') {
      list = list.filter((s) => {
        const isShs =
          s.academicLevel === 'SHS' ||
          s.yearLevel === 'Grade 11' ||
          s.yearLevel === 'Grade 12';
        return selectedTrack === 'SHS' ? isShs : !isShs;
      });
    }

    return filterStudentsForExport(list, {
      sectionFilter: selectedSection,
      courseFilter: selectedCourse,
      yearLevelFilter: selectedYearLevel,
    });
  }, [students, selectedTrack, selectedSection, selectedCourse, selectedYearLevel]);

  // Handle Download Execution
  const handleExport = () => {
    setExportError(null);
    setDownloadSuccess(null);

    try {
      const res = exportStudentsDynamic(filteredStudents, {
        includePassword,
        format,
        sectionFilter: selectedSection,
        courseFilter: selectedCourse,
        yearLevelFilter: selectedYearLevel,
        groupBySection,
        filenamePrefix: includePassword
          ? selectedSection !== 'ALL'
            ? `Credentials_${selectedSection}`
            : 'Student_Credentials_List'
          : selectedSection !== 'ALL'
          ? `Roster_${selectedSection}`
          : 'Class_Roster',
      });

      setDownloadSuccess(`Successfully exported ${res.totalExported} students to ${res.filename}.${format}`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setExportError(err.message || 'Export failed.');
    }
  };

  // Preview top 3 rows
  const previewSample = useMemo(() => {
    return filteredStudents.slice(0, 3);
  }, [filteredStudents]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-gray-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <Download className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Export Students & Rosters</h2>
              <p className="text-xs text-blue-100">
                Dynamic exports by section • Credentials slips or clean class rosters
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

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[82vh]">
          
          {downloadSuccess && (
            <div className="p-3.5 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2.5 text-xs text-green-800 animate-fade-in">
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="font-semibold">{downloadSuccess}</span>
            </div>
          )}

          {exportError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-xs text-red-700 animate-fade-in">
              <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{exportError}</span>
            </div>
          )}

          {/* 1. EXPORT MODE SELECTION */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Select Export Type & Credentials Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* Option A: Clean Roster (No Passwords) */}
              <div
                onClick={() => setIncludePassword(false)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  !includePassword
                    ? 'border-[#001A4D] bg-blue-50/40 shadow-xs'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Users className={`w-4 h-4 ${!includePassword ? 'text-[#001A4D]' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold text-gray-900">Official Class Roster</span>
                  </div>
                  {!includePassword && <Check className="w-4 h-4 text-[#001A4D]" />}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  <strong>No Passwords.</strong> Safe public roster for instructors, class attendance, and section distributions.
                </p>
                <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-semibold">
                  Safe Public Roster
                </span>
              </div>

              {/* Option B: Account Credentials List (With Passwords) */}
              <div
                onClick={() => setIncludePassword(true)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  includePassword
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <KeyRound className={`w-4 h-4 ${includePassword ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold text-gray-900">Credentials Distribution</span>
                  </div>
                  {includePassword && <Check className="w-4 h-4 text-indigo-600" />}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  <strong>Includes Passwords.</strong> Contains auto-generated mobile login passwords for SAO/Adviser distribution.
                </p>
                <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-semibold">
                  Contains Default Passwords
                </span>
              </div>

            </div>
          </div>

          {/* 2. DYNAMIC FILTERS */}
          <div className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#001A4D]" /> Dynamic Scope Filters
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedTrack('ALL');
                  setSelectedSection('ALL');
                  setSelectedCourse('ALL');
                  setSelectedYearLevel('ALL');
                }}
                className="text-[11px] text-blue-700 hover:underline font-semibold"
              >
                Reset Filters
              </button>
            </div>

            {/* Section Scope Filter (User's Core Requirement) */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Section Scope
              </label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium"
              >
                <option value="ALL">All Sections ({students.length} students)</option>
                {sectionOptions.map((sec) => (
                  <option key={sec.name} value={sec.name}>
                    {sec.name} ({sec.count} {sec.count === 1 ? 'student' : 'students'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Course / Program Filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Program / Strand
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium"
                >
                  <option value="ALL">All Programs</option>
                  {courseOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Level Filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Year Level
                </label>
                <select
                  value={selectedYearLevel}
                  onChange={(e) => setSelectedYearLevel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium"
                >
                  <option value="ALL">All Year Levels</option>
                  {yearLevelOptions.map((yl) => (
                    <option key={yl} value={yl}>
                      {yl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Academic Track Filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Academic Level
                </label>
                <div className="grid grid-cols-3 gap-1 p-0.5 bg-gray-200/70 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setSelectedTrack('ALL')}
                    className={`py-1.5 rounded-md transition-all ${
                      selectedTrack === 'ALL'
                        ? 'bg-white text-[#001A4D] shadow-xs'
                        : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTrack('COLLEGE')}
                    className={`py-1.5 rounded-md transition-all ${
                      selectedTrack === 'COLLEGE'
                        ? 'bg-white text-[#001A4D] shadow-xs'
                        : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    College
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTrack('SHS')}
                    className={`py-1.5 rounded-md transition-all ${
                      selectedTrack === 'SHS'
                        ? 'bg-white text-[#001A4D] shadow-xs'
                        : 'text-gray-600 hover:text-black'
                    }`}
                  >
                    SHS
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3. FORMAT & EXCEL OPTIONS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                File Format
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    checked={format === 'xlsx'}
                    onChange={() => setFormat('xlsx')}
                    className="text-[#001A4D] focus:ring-0 cursor-pointer"
                  />
                  <span className="font-semibold">Excel Spreadsheet (.xlsx)</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    checked={format === 'csv'}
                    onChange={() => setFormat('csv')}
                    className="text-[#001A4D] focus:ring-0 cursor-pointer"
                  />
                  <span>CSV Document (.csv)</span>
                </label>
              </div>
            </div>

            {/* Multi-sheet Grouping Checkbox (if Excel + All Sections) */}
            {format === 'xlsx' && selectedSection === 'ALL' && (
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-blue-50/50 border border-blue-100 text-xs text-blue-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupBySection}
                  onChange={(e) => setGroupBySection(e.target.checked)}
                  className="w-4 h-4 rounded text-[#001A4D] focus:ring-0 cursor-pointer"
                />
                <span className="font-medium">
                  Group by section: Create an individual Excel sheet tab for each section
                </span>
              </label>
            )}
          </div>

          {/* 4. LIVE PREVIEW */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-700 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                Live Preview (First {previewSample.length} of {filteredStudents.length} matching students)
              </span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px]">
                {filteredStudents.length} Students Selected
              </span>
            </div>

            {previewSample.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
                No students match your selected filters. Try broadening your criteria.
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-32 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <tr>
                      <th className="p-2">Student ID</th>
                      <th className="p-2">Student Name</th>
                      <th className="p-2">Section</th>
                      <th className="p-2">Program</th>
                      {includePassword && <th className="p-2 text-indigo-700">Password</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewSample.map((s) => {
                      const pwd =
                        s.defaultPassword ||
                        generateDefaultStudentPassword(s.lastName || '', s.studentId || '');
                      return (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="p-2 font-mono text-gray-900 font-semibold">{s.studentId}</td>
                          <td className="p-2 font-medium text-gray-800">
                            {s.lastName}, {s.firstName}
                          </td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-semibold">
                              {s.section || 'UNASSIGNED'}
                            </span>
                          </td>
                          <td className="p-2 text-gray-600">{s.courseCode}</td>
                          {includePassword && (
                            <td className="p-2 font-mono font-bold text-indigo-700 bg-indigo-50/40">
                              {pwd}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={filteredStudents.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white rounded-xl text-xs font-bold hover:opacity-95 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4 text-yellow-400" />
            <span>
              Download {includePassword ? 'Credentials' : 'Roster'} ({filteredStudents.length} Students)
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}
