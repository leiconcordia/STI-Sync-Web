/**
 * src/app/admin/components/student-registry/ExportStudentsModal.tsx
 *
 * Interactive Dynamic Export Modal.
 * Allows administrators to export:
 *  - Official Class Rosters (No passwords - safe for faculty & attendance)
 *  - Account Credentials Distribution Slips (With default passwords)
 *  - Comprehensive Students Masterlist (Full student registry profile details)
 *  - Dynamically and strictly filtered by Academic Level (College / SHS),
 *    Program/Strand, Year Level, and Section
 *  - Formats: Formatted Excel (.xlsx) with multi-sheet section grouping and auto-fit columns, or CSV
 */

import { useState, useMemo, useEffect } from 'react';
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
  GraduationCap,
  Layers,
  Sparkles,
  School,
  SlidersHorizontal,
  RotateCcw,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { StudentDocument } from '../../../modules/students/types/student.types';
import {
  exportStudentsDynamic,
  filterStudentsForExport,
  prepareStudentExportRows,
  StudentExportMode,
  cleanMojibake,
  ALL_EXPORT_COLUMNS,
  DEFAULT_ROSTER_COLUMNS,
  DEFAULT_MASTERLIST_COLUMNS,
} from '../../../modules/students/utils/export.utils';
import { generateDefaultStudentPassword } from '../../../modules/students/services/registrar-import.service';
import { useCourses, useSections } from '../../../modules/academic/hooks/useAcademicStream';

interface ExportStudentsModalProps {
  onClose: () => void;
  students: StudentDocument[];
  currentSectionFilter?: string;
  currentCourseFilter?: string;
}

const YEAR_NUM_MAP: Record<string, number> = {
  'Grade 11': 11,
  'Grade 12': 12,
  '1st Year': 1,
  '2nd Year': 2,
  '3rd Year': 3,
  '4th Year': 4,
};

export default function ExportStudentsModal({
  onClose,
  students,
  currentSectionFilter = 'All Sections',
  currentCourseFilter = 'All Programs',
}: ExportStudentsModalProps) {
  // Streams from Academic Database
  const { data: courses = [] } = useCourses();
  const { data: sections = [] } = useSections();

  // Export Mode: 2 Clear options ('ROSTER' or 'CREDENTIALS')
  const [exportMode, setExportMode] = useState<StudentExportMode>('ROSTER');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [groupBySection, setGroupBySection] = useState(true);

  // Dynamic Column Customization State
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_ROSTER_COLUMNS);

  // Cascading Dynamic Filters State
  const [selectedTrack, setSelectedTrack] = useState<'ALL' | 'COLLEGE' | 'SHS'>('ALL');
  const [selectedCourse, setSelectedCourse] = useState<string>(
    currentCourseFilter && currentCourseFilter !== 'All Programs' ? currentCourseFilter : 'ALL'
  );
  const [selectedYearLevel, setSelectedYearLevel] = useState<string>('ALL');
  const [selectedSection, setSelectedSection] = useState<string>(
    currentSectionFilter && currentSectionFilter !== 'All Sections' ? currentSectionFilter : 'ALL'
  );

  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Helper to switch export mode and apply default columns
  const handleSelectExportMode = (mode: 'ROSTER' | 'CREDENTIALS') => {
    setExportMode(mode);
    if (mode === 'ROSTER') {
      setSelectedColumns(DEFAULT_ROSTER_COLUMNS);
    } else {
      setSelectedColumns(DEFAULT_MASTERLIST_COLUMNS);
    }
  };

  // Toggle single column
  const toggleColumn = (colId: string) => {
    setSelectedColumns((prev) => {
      if (prev.includes(colId)) {
        if (prev.length <= 1) return prev; // Keep at least one column
        return prev.filter((id) => id !== colId);
      }
      return [...prev, colId];
    });
  };

  const handleSelectAllColumns = () => {
    setSelectedColumns(ALL_EXPORT_COLUMNS.map((c) => c.id));
  };

  const handleDeselectAllColumns = () => {
    // Keep minimum essential columns
    setSelectedColumns(['Student ID', 'Last Name', 'First Name']);
  };

  const handleResetColumns = () => {
    if (exportMode === 'ROSTER') {
      setSelectedColumns(DEFAULT_ROSTER_COLUMNS);
    } else {
      setSelectedColumns(DEFAULT_MASTERLIST_COLUMNS);
    }
  };

  // Helper to check if a course is SHS
  const isShsCourse = useMemo(() => {
    return (c: { code?: string; academicLevel?: string; yearLevels?: number }) => {
      if (c.academicLevel === 'SHS') return true;
      if (c.academicLevel === 'COLLEGE') return false;
      const code = (c.code || '').toUpperCase();
      if (['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'ICT', 'HE'].includes(code)) return true;
      if (c.yearLevels === 2 && !code.startsWith('BS')) return true;
      return false;
    };
  }, []);

  // ─── 1. DYNAMIC PROGRAM / STRAND OPTIONS (Cascades from Academic Level) ───
  const courseOptions = useMemo(() => {
    const list: Array<{ code: string; name: string }> = [];
    const seen = new Set<string>();

    // A. From Courses Stream
    courses.forEach((c) => {
      if (c.archived) return false;
      const isShs = isShsCourse(c);
      if (selectedTrack === 'SHS' && !isShs) return false;
      if (selectedTrack === 'COLLEGE' && isShs) return false;

      if (c.code && !seen.has(c.code.toUpperCase())) {
        seen.add(c.code.toUpperCase());
        list.push({ code: c.code, name: c.name || c.code });
      }
    });

    // B. From Registered Students matching current track
    students.forEach((s) => {
      const isShs =
        s.academicLevel === 'SHS' ||
        ['Grade 11', 'Grade 12'].includes(s.yearLevel) ||
        ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'ICT', 'HE'].includes((s.courseCode || '').toUpperCase());

      if (selectedTrack === 'SHS' && !isShs) return;
      if (selectedTrack === 'COLLEGE' && isShs) return;

      const code = s.courseCode?.trim();
      if (code && !seen.has(code.toUpperCase())) {
        seen.add(code.toUpperCase());
        list.push({ code, name: s.courseName || code });
      }
    });

    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [courses, students, selectedTrack, isShsCourse]);

  // ─── 2. DYNAMIC YEAR LEVEL OPTIONS (Cascades from Track & Program) ─────────
  const yearLevelOptions = useMemo(() => {
    const matchedCourse = courses.find(
      (c) => c.code?.toUpperCase() === selectedCourse.toUpperCase() || c.name === selectedCourse
    );
    const isSelectedCourseShs =
      matchedCourse ? isShsCourse(matchedCourse) : ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'ICT', 'HE'].includes(selectedCourse.toUpperCase());

    if (selectedTrack === 'SHS' || (selectedCourse !== 'ALL' && isSelectedCourseShs)) {
      return ['Grade 11', 'Grade 12'];
    }

    if (selectedTrack === 'COLLEGE' || (selectedCourse !== 'ALL' && !isSelectedCourseShs)) {
      const maxYears = matchedCourse?.yearLevels || 4;
      const allCollegeYears = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
      return allCollegeYears.slice(0, Math.max(2, maxYears));
    }

    // ALL Tracks & ALL Programs selected
    return ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Grade 11', 'Grade 12'];
  }, [selectedTrack, selectedCourse, courses, isShsCourse]);

  // ─── 3. DYNAMIC SECTION OPTIONS (Strictly dependent on Course & Year Level)
  // Example: If user selects College -> BSIT -> 3rd Year, ONLY BSIT 3rd Year sections are returned!
  const sectionOptions = useMemo(() => {
    const matchedCourse = courses.find(
      (c) => c.code?.toUpperCase() === selectedCourse.toUpperCase() || c.name === selectedCourse
    );

    const targetYearNum = selectedYearLevel !== 'ALL' ? YEAR_NUM_MAP[selectedYearLevel] : null;

    // A. Filter Sections from Database
    let validDbSections = sections.filter((sec) => !sec.archived);

    // Filter by Program
    if (selectedCourse !== 'ALL') {
      if (matchedCourse) {
        validDbSections = validDbSections.filter((sec) => sec.courseId === matchedCourse.id);
      } else {
        validDbSections = validDbSections.filter((sec) =>
          sec.name.toUpperCase().startsWith(selectedCourse.toUpperCase())
        );
      }
    } else if (selectedTrack !== 'ALL') {
      // Filter by Track if program is ALL
      const trackCourseIds = new Set(
        courses
          .filter((c) => {
            const isShs = isShsCourse(c);
            return selectedTrack === 'SHS' ? isShs : !isShs;
          })
          .map((c) => c.id)
      );
      validDbSections = validDbSections.filter((sec) => trackCourseIds.has(sec.courseId));
    }

    // Filter by Year Level Number
    if (targetYearNum !== null) {
      validDbSections = validDbSections.filter((sec) => {
        const secYear = Number(sec.yearLevel);
        if (targetYearNum === 11) return secYear === 11 || secYear === 1;
        if (targetYearNum === 12) return secYear === 12 || secYear === 2;
        return secYear === targetYearNum;
      });
    }

    // B. Build section student counts within current scope
    const counts = new Map<string, number>();

    // Seed valid DB sections (even if 0 students currently enrolled)
    validDbSections.forEach((s) => {
      if (s.name) counts.set(s.name.trim(), 0);
    });

    // Scan students matching current Track, Program, and Year Level
    students.forEach((s) => {
      // 1. Check Track
      const isShs =
        s.academicLevel === 'SHS' ||
        ['Grade 11', 'Grade 12'].includes(s.yearLevel) ||
        ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'ICT', 'HE'].includes((s.courseCode || '').toUpperCase());
      if (selectedTrack === 'SHS' && !isShs) return;
      if (selectedTrack === 'COLLEGE' && isShs) return;

      // 2. Check Course
      if (selectedCourse !== 'ALL') {
        const sCourse = (s.courseCode || s.courseName || '').toLowerCase().trim();
        if (sCourse !== selectedCourse.toLowerCase().trim()) return;
      }

      // 3. Check Year Level
      if (selectedYearLevel !== 'ALL') {
        const sYear = (s.yearLevel || '').toLowerCase().trim();
        if (sYear !== selectedYearLevel.toLowerCase().trim()) return;
      }

      // 4. Section count
      const sec = s.section?.trim() || 'UNASSIGNED';
      counts.set(sec, (counts.get(sec) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (a.name === 'UNASSIGNED') return 1;
        if (b.name === 'UNASSIGNED') return -1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [sections, courses, students, selectedTrack, selectedCourse, selectedYearLevel, isShsCourse]);

  // ─── 4. REACTIVE RESET EFFECTS FOR DEPENDENT FILTERS ──────────────────────
  // When Track changes: course, year level, and section reset if no longer valid
  const handleTrackChange = (newTrack: 'ALL' | 'COLLEGE' | 'SHS') => {
    setSelectedTrack(newTrack);
    setSelectedCourse('ALL');
    setSelectedYearLevel('ALL');
    setSelectedSection('ALL');
  };

  const handleCourseChange = (newCourse: string) => {
    setSelectedCourse(newCourse);
    setSelectedSection('ALL');
  };

  const handleYearLevelChange = (newYear: string) => {
    setSelectedYearLevel(newYear);
    setSelectedSection('ALL');
  };

  // Ensure selectedYearLevel is valid when yearLevelOptions change
  useEffect(() => {
    if (selectedYearLevel !== 'ALL' && !yearLevelOptions.includes(selectedYearLevel)) {
      setSelectedYearLevel('ALL');
    }
  }, [yearLevelOptions, selectedYearLevel]);

  // Ensure selectedSection is valid when sectionOptions change
  useEffect(() => {
    if (
      selectedSection !== 'ALL' &&
      !sectionOptions.some((s) => s.name.toLowerCase() === selectedSection.toLowerCase())
    ) {
      setSelectedSection('ALL');
    }
  }, [sectionOptions, selectedSection]);

  // ─── 5. COMPUTE FILTERED STUDENTS LIVE ────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return filterStudentsForExport(students, {
      trackFilter: selectedTrack,
      courseFilter: selectedCourse,
      yearLevelFilter: selectedYearLevel,
      sectionFilter: selectedSection,
    });
  }, [students, selectedTrack, selectedCourse, selectedYearLevel, selectedSection]);

  // Total matching students across current Track + Course + Year (before section filter)
  const totalScopeStudentsCount = useMemo(() => {
    return filterStudentsForExport(students, {
      trackFilter: selectedTrack,
      courseFilter: selectedCourse,
      yearLevelFilter: selectedYearLevel,
      sectionFilter: 'ALL',
    }).length;
  }, [students, selectedTrack, selectedCourse, selectedYearLevel]);

  // ─── 6. HANDLE DOWNLOAD EXECUTION ─────────────────────────────────────────
  const handleExport = () => {
    setExportError(null);
    setDownloadSuccess(null);

    try {
      const modePrefix =
        exportMode === 'CREDENTIALS'
          ? 'Student_Credentials_Masterlist'
          : 'Official_Class_Roster';

      const res = exportStudentsDynamic(filteredStudents, {
        mode: exportMode,
        includePassword: selectedColumns.includes('Default Password'),
        selectedColumns,
        format,
        trackFilter: selectedTrack,
        courseFilter: selectedCourse,
        yearLevelFilter: selectedYearLevel,
        sectionFilter: selectedSection,
        groupBySection,
        filenamePrefix:
          selectedSection !== 'ALL'
            ? `${modePrefix}_${selectedSection.replace(/[^a-zA-Z0-9_-]/g, '_')}`
            : selectedCourse !== 'ALL'
            ? `${modePrefix}_${selectedCourse.replace(/[^a-zA-Z0-9_-]/g, '_')}`
            : modePrefix,
      });

      setDownloadSuccess(
        `Successfully exported ${res.totalExported} student(s) to ${res.filename}.${format}`
      );
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setExportError(err.message || 'Export failed.');
    }
  };

  // Live preview rows matching dynamic selected columns
  const previewRows = useMemo(() => {
    const sample = filteredStudents.slice(0, 3);
    return prepareStudentExportRows(sample, exportMode, selectedColumns);
  }, [filteredStudents, exportMode, selectedColumns]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden border border-gray-100 max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <Download className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Export Students & Rosters</h2>
              <p className="text-xs text-blue-100">
                Official class rosters and student credentials registry with custom field selection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          
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

          {/* 1. EXPORT MODE SELECTION (2 Clear Options) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Select Export Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              {/* Option 1: Official Class Roster (Safe Faculty & Attendance Sheet) */}
              <div
                onClick={() => handleSelectExportMode('ROSTER')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  exportMode === 'ROSTER'
                    ? 'border-[#001A4D] bg-blue-50/60 shadow-xs ring-2 ring-blue-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Users className={`w-4 h-4 ${exportMode === 'ROSTER' ? 'text-[#001A4D]' : 'text-gray-400'}`} />
                    <span className="text-xs font-bold text-gray-900">Official Class Roster</span>
                  </div>
                  {exportMode === 'ROSTER' && <Check className="w-3.5 h-3.5 text-[#001A4D]" />}
                </div>
                <p className="text-[11px] text-gray-600 leading-snug">
                  Clean public roster for faculty, attendance, and grading. <strong>No passwords included.</strong>
                </p>
                <span className="inline-block mt-2.5 px-2 py-0.5 bg-blue-100/70 text-blue-900 rounded text-[10px] font-semibold">
                  Safe Public Sheet
                </span>
              </div>

              {/* Option 2: Student Credentials & Registry Masterlist (Full Admin Data) */}
              <div
                onClick={() => handleSelectExportMode('CREDENTIALS')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  exportMode === 'CREDENTIALS'
                    ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-2 ring-indigo-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <KeyRound className={`w-4 h-4 ${exportMode === 'CREDENTIALS' ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <span className="text-xs font-bold text-gray-900">Student Credentials & Registry Masterlist</span>
                  </div>
                  {exportMode === 'CREDENTIALS' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                <p className="text-[11px] text-gray-600 leading-snug">
                  Administrative directory with default mobile passwords, setup status, contacts, and registry data.
                </p>
                <span className="inline-block mt-2.5 px-2 py-0.5 bg-indigo-100/70 text-indigo-800 rounded text-[10px] font-semibold">
                  Includes Passwords & Registry Data
                </span>
              </div>

            </div>
          </div>

          {/* 2. DYNAMIC FIELD / COLUMN SELECTION (User customizable) */}
          <div className="p-4 bg-slate-50/90 border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                  Customize Exported Fields / Columns
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select which data to include or exclude (e.g. uncheck Email, Status, or Profile Setup).
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAllColumns}
                  className="px-2 py-1 text-blue-700 hover:bg-blue-50 rounded font-semibold cursor-pointer transition-colors"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={handleResetColumns}
                  className="px-2 py-1 text-slate-600 hover:bg-slate-200 rounded font-semibold cursor-pointer transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
            </div>

            {/* Column Checkbox Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ALL_EXPORT_COLUMNS.map((col) => {
                const isSelected = selectedColumns.includes(col.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => toggleColumn(col.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400 opacity-60'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded flex items-center justify-center border ${
                        isSelected
                          ? 'bg-white border-white text-blue-600'
                          : 'border-slate-400 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <span>{col.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
              <span>
                Active columns in export:{' '}
                <strong className="text-slate-700">{selectedColumns.length}</strong> of{' '}
                {ALL_EXPORT_COLUMNS.length}
              </span>
              {!selectedColumns.includes('Email') && (
                <span className="text-amber-700 font-medium">Notice: Email column will be excluded</span>
              )}
            </div>
          </div>

          {/* 3. DYNAMIC CASCADING SCOPE FILTERS */}
          <div className="p-4 bg-gray-50/80 border border-gray-200 rounded-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#001A4D]" /> Cascading Scope Filters
              </span>
              <button
                type="button"
                onClick={() => {
                  handleTrackChange('ALL');
                }}
                className="text-[11px] text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                Reset Filters
              </button>
            </div>

            {/* Filter 1: Academic Level (College vs SHS) */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Academic Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleTrackChange('ALL')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    selectedTrack === 'ALL'
                      ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  All Academic Levels
                </button>
                <button
                  type="button"
                  onClick={() => handleTrackChange('COLLEGE')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    selectedTrack === 'COLLEGE'
                      ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  College
                </button>
                <button
                  type="button"
                  onClick={() => handleTrackChange('SHS')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    selectedTrack === 'SHS'
                      ? 'bg-[#001A4D] text-[#FFD41C] border-[#001A4D] shadow-xs'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Senior High (SHS)
                </button>
              </div>
            </div>

            {/* Filter 2 & 3: Program / Strand & Year Level */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Program / Strand */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {selectedTrack === 'SHS' ? 'Senior High Strand' : 'Academic Program / Course'}
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium text-gray-800"
                >
                  <option value="ALL">
                    {selectedTrack === 'SHS' ? 'All Senior High Strands' : selectedTrack === 'COLLEGE' ? 'All College Programs' : 'All Programs & Strands'}
                  </option>
                  {courseOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Level */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Year Level
                </label>
                <select
                  value={selectedYearLevel}
                  onChange={(e) => handleYearLevelChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium text-gray-800"
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

            {/* Filter 4: Section Scope (Strictly Dependent on Selected Program & Year Level) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Section Scope
                </label>
                {selectedCourse !== 'ALL' && selectedYearLevel !== 'ALL' && (
                  <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded">
                    Filtered to {selectedCourse} · {selectedYearLevel} sections
                  </span>
                )}
              </div>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-100 focus:border-[#001A4D] bg-white font-medium text-gray-800"
              >
                <option value="ALL">
                  All Sections ({totalScopeStudentsCount} {totalScopeStudentsCount === 1 ? 'student' : 'students'})
                </option>
                {sectionOptions.map((sec) => (
                  <option key={sec.name} value={sec.name}>
                    {sec.name} ({sec.count} {sec.count === 1 ? 'student' : 'students'})
                  </option>
                ))}
              </select>
              {sectionOptions.length === 0 && (
                <span className="text-[10px] text-gray-500 mt-1 block">
                  No active sections registered for this specific combination (defaults to UNASSIGNED).
                </span>
              )}
            </div>

          </div>

          {/* 4. FORMAT & EXCEL OPTIONS */}
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
                  <span className="font-semibold text-gray-900">Excel Spreadsheet (.xlsx)</span>
                  <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                    Formatted
                  </span>
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

          {/* 5. LIVE PREVIEW TABLE (Dynamically mirrors selectedColumns) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-700 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                Live Preview (Showing selected columns for {previewRows.length} of {filteredStudents.length} matching students)
              </span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-[11px] border border-emerald-200">
                {filteredStudents.length} Students Selected
              </span>
            </div>

            {previewRows.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
                No students match your selected filters. Try broadening your criteria.
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-44 text-xs shadow-2xs">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 text-[11px] font-bold sticky top-0">
                    <tr>
                      {selectedColumns.map((col) => (
                        <th key={col} className="p-2.5 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {selectedColumns.map((col) => {
                          const val = row[col];
                          const isStudentId = col === 'Student ID';
                          const isPassword = col === 'Default Password';
                          const isEmail = col === 'Email';
                          const isStatus = col === 'Status';

                          return (
                            <td
                              key={col}
                              className={`p-2.5 whitespace-nowrap ${
                                isStudentId
                                  ? 'font-mono font-bold text-gray-900'
                                  : isPassword
                                  ? 'font-mono font-bold text-indigo-700 bg-indigo-50/50'
                                  : 'text-gray-800'
                              }`}
                            >
                              {isEmail && !val ? (
                                <span className="text-gray-400 italic">None</span>
                              ) : isStatus ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                                  {val || 'ACTIVE'}
                                </span>
                              ) : (
                                String(val ?? '—')
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
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
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={filteredStudents.length === 0 || selectedColumns.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white rounded-xl text-xs font-bold hover:opacity-95 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#FFD41C]" />
            <span>
              Download {exportMode === 'CREDENTIALS' ? 'Credentials & Masterlist' : 'Class Roster'} ({filteredStudents.length} Students)
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}
