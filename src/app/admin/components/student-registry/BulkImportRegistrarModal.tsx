/**
 * src/app/admin/components/student-registry/BulkImportRegistrarModal.tsx
 *
 * 3-Step Wizard for Bulk Ingestion of Registrar Enrollment Excel Lists:
 *  1. File Upload & Auto-Detection (SHS / College, Programs, Terms, Records)
 *  2. Interactive Validation & Decision Matrix:
 *     - Auto-Promotion for existing students
 *     - New student account provisioning
 *     - Reconciliation of missing students (Inactive unenrolled / Graduated)
 *     - Name collision conflict resolution
 *  3. Batch Execution & Exportable Audit Report
 */

import { useState, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  UserCheck,
  UserX,
  UserPlus,
  GraduationCap,
  ShieldAlert,
  Download,
  Loader2,
  ChevronRight,
  Filter,
  Check,
  AlertCircle,
  Eye,
  Building,
} from 'lucide-react';
import { useDepartments } from '../../../modules/academic';
import {
  parseRegistrarExcelFile,
  analyzeRegistrarImport,
  executeRegistrarBulkImport,
  generateDefaultStudentPassword,
  type ParsedRegistrarFile,
  type ImportReconciliationAnalysis,
  type MatchedPromotionItem,
  type NameConflictItem,
  type MissingStudentItem,
  type ImportExecutionResult,
} from '../../../modules/students/services/registrar-import.service';
import type { StudentDocument } from '../../../modules/students/types/student.types';

interface BulkImportRegistrarModalProps {
  onClose: () => void;
  onSuccess: () => void;
  existingStudents: StudentDocument[];
  adminUid: string;
}

type TabType = 'promote' | 'new' | 'missing' | 'conflicts';

export default function BulkImportRegistrarModal({
  onClose,
  onSuccess,
  existingStudents,
  adminUid,
}: BulkImportRegistrarModalProps) {
  // Wizard Steps: 1 = Upload, 2 = Validation & Decisions, 3 = Committing / Complete
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1 State
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedRegistrarFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ImportReconciliationAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('promote');
  const [searchQuery, setSearchQuery] = useState('');

  // Department stream for program-to-department alignment
  const { data: departments = [] } = useDepartments();
  const activeDepartments = useMemo(
    () => departments.filter((d) => d.status !== 'archived'),
    [departments]
  );
  const [programDepartmentMap, setProgramDepartmentMap] = useState<Record<string, string>>({});

  // Editable Decisions State in Step 2
  const [promotions, setPromotions] = useState<MatchedPromotionItem[]>([]);
  const [conflicts, setConflicts] = useState<NameConflictItem[]>([]);
  const [missing, setMissing] = useState<MissingStudentItem[]>([]);
  const [autoProvisionCourses, setAutoProvisionCourses] = useState(true);
  const [autoProvisionSemester, setAutoProvisionSemester] = useState(true);

  // Step 3 State
  const [isCommitting, setIsCommitting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [result, setResult] = useState<ImportExecutionResult | null>(null);

  // ─── File Upload & Parsing Handler ──────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    await processFile(selected);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    await processFile(dropped);
  };

  const processFile = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setParseError('Please upload a valid Excel spreadsheet (.xlsx or .xls).');
      return;
    }

    setFile(selectedFile);
    setParseError(null);
    setIsParsing(true);

    try {
      const parsed = await parseRegistrarExcelFile(selectedFile);
      if (parsed.students.length === 0) {
        throw new Error('No valid student records found in this spreadsheet. Please ensure it follows the registrar format.');
      }

      setParsedFile(parsed);
      setIsParsing(false);

      // Immediately run reconciliation analysis
      setIsAnalyzing(true);
      const analysisResult = await analyzeRegistrarImport(parsed, existingStudents);
      setAnalysis(analysisResult);
      setPromotions(analysisResult.matchedPromotions);
      setConflicts(analysisResult.nameConflicts);
      setMissing(analysisResult.missingStudents);

      // Initialize program-department alignment map from analysis
      const initialMap: Record<string, string> = {};
      analysisResult.detectedPrograms.forEach((p) => {
        if (p.departmentId) {
          initialMap[p.code] = p.departmentId;
        }
      });
      setProgramDepartmentMap(initialMap);

      setIsAnalyzing(false);

      // Auto-set starting tab based on content
      if (analysisResult.matchedPromotions.length > 0) {
        setActiveTab('promote');
      } else if (analysisResult.newStudents.length > 0) {
        setActiveTab('new');
      } else if (analysisResult.missingStudents.length > 0) {
        setActiveTab('missing');
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParseError(err.message || 'Failed to read the Excel spreadsheet.');
      setIsParsing(false);
      setIsAnalyzing(false);
    }
  };

  // ─── Bulk Decision Helpers ──────────────────────────────────────────────────

  const handlePromoteAll = (decision: 'AUTO_PROMOTE' | 'SKIP') => {
    setPromotions((prev) => prev.map((item) => ({ ...item, decision })));
  };

  const handleConflictsAll = (decision: 'SKIP_INCOMING' | 'OVERWRITE_EXISTING') => {
    setConflicts((prev) => prev.map((item) => ({ ...item, decision })));
  };

  const handleMissingAll = (decision: 'SET_INACTIVE' | 'ARCHIVE_GRADUATED' | 'KEEP_ACTIVE') => {
    setMissing((prev) => prev.map((item) => ({ ...item, decision })));
  };

  // ─── Execution Handler ──────────────────────────────────────────────────────

  const handleExecuteImport = async () => {
    if (!analysis) return;

    setCurrentStep(3);
    setIsCommitting(true);
    setProgressPercent(5);
    setProgressText('Preparing records for database sync...');

    try {
      const execResult = await executeRegistrarBulkImport({
        analysis,
        matchedPromotions: promotions,
        nameConflicts: conflicts,
        missingStudents: missing,
        autoProvisionCourses,
        autoProvisionSemester,
        programDepartmentMap,
        adminUid,
        onProgress: (current, total, text) => {
          const pct = Math.round((current / (total || 1)) * 100);
          setProgressPercent(pct);
          setProgressText(text);
        },
      });

      setResult(execResult);
      setIsCommitting(false);
      setProgressPercent(100);
      setProgressText('Sync complete!');
    } catch (err: any) {
      console.error('Execution error:', err);
      setIsCommitting(false);
      setParseError(err.message || 'An error occurred during database import.');
    }
  };

  // ─── Audit Log Export Helper ────────────────────────────────────────────────

  const downloadAuditLogCSV = () => {
    if (!result || result.auditLog.length === 0) return;

    const headers = ['Student ID', 'Student Name', 'Course Program', 'Year Level', 'Action Taken', 'Initial Default Password'];
    const rows = result.auditLog.map((log) => [
      `"${log.studentId}"`,
      `"${log.studentName}"`,
      `"${log.courseCode}"`,
      `"${log.yearLevel}"`,
      `"${log.action}"`,
      `"${log.defaultPassword || 'N/A (Existing/Preserved)'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Registrar_Import_Audit_${parsedFile?.academicLevel}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-100">
        
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/20">
              <FileSpreadsheet className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight">Registrar Bulk Enrollment & Promotion</h2>
              <p className="text-xs text-blue-100">
                Official registrar spreadsheet ingestion, auto-promotion, and enrollment reconciliation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isCommitting}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-xs sm:text-sm font-semibold">
          <div className={`flex items-center gap-2 ${currentStep === 1 ? 'text-[#001A4D] font-bold' : 'text-gray-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 1 ? 'bg-[#001A4D] text-white' : 'bg-gray-200 text-gray-600'}`}>1</span>
            <span>Upload & Detection</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${currentStep === 2 ? 'text-[#001A4D] font-bold' : 'text-gray-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 2 ? 'bg-[#001A4D] text-white' : 'bg-gray-200 text-gray-600'}`}>2</span>
            <span>Validation & Decisions</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
          <div className={`flex items-center gap-2 ${currentStep === 3 ? 'text-[#001A4D] font-bold' : 'text-gray-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep === 3 ? 'bg-[#001A4D] text-white' : 'bg-gray-200 text-gray-600'}`}>3</span>
            <span>Execution & Audit</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">

          {/* ─────────────────────────────────────────────────────────────
              STEP 1: UPLOAD & DETECTION
             ───────────────────────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="space-y-6 max-w-2xl mx-auto py-4">
              
              {/* Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-200 hover:border-[#001A4D] bg-white hover:bg-blue-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all shadow-sm group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
                <div className="w-16 h-16 rounded-2xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center mx-auto mb-4 text-[#001A4D] transition-colors">
                  {isParsing ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                </div>
                <h3 className="text-base font-bold text-gray-800 mb-1">
                  {file ? file.name : 'Upload Registrar Enrollment Spreadsheet'}
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Accepts Senior High (`SHS 2026-2027`) or Tertiary (`TER 2026-2027`) Excel files (.xlsx)
                </p>
                <span className="inline-block px-4 py-1.5 bg-[#001A4D]/5 text-[#001A4D] rounded-full text-xs font-semibold">
                  Browse File on Computer
                </span>
              </div>

              {parseError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Error reading file: </strong>
                    {parseError}
                  </div>
                </div>
              )}

              {/* Parsing Indicator */}
              {isParsing && (
                <div className="flex items-center justify-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm text-sm text-gray-600">
                  <Loader2 className="w-5 h-5 animate-spin text-[#001A4D]" />
                  <span>Scanning spreadsheet blocks, courses, and student records...</span>
                </div>
              )}

              {/* Detected Metadata Card */}
              {parsedFile && !isParsing && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">File Analysis</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${parsedFile.academicLevel === 'SHS' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                      {parsedFile.academicLevel === 'SHS' ? 'Senior High School' : 'Tertiary / College'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-2xl font-bold text-[#001A4D]">{parsedFile.totalStudents}</div>
                      <div className="text-xs text-gray-500 font-medium">Students Found</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-sm font-bold text-gray-800">{parsedFile.detectedSchoolYear}</div>
                      <div className="text-xs text-gray-500 font-medium">Academic Year</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-sm font-bold text-gray-800">{parsedFile.detectedSemester}</div>
                      <div className="text-xs text-gray-500 font-medium">Semester / Term</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="text-2xl font-bold text-indigo-600">{parsedFile.programsDetected.length}</div>
                      <div className="text-xs text-gray-500 font-medium">Programs / Strands</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">Detected Programs:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedFile.programsDetected.map((p) => (
                        <span key={p.code} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-medium border border-blue-100" title={p.name}>
                          {p.code}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={isAnalyzing}
                    className="w-full py-3 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white rounded-xl font-bold hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analyzing Database Matches...
                      </>
                    ) : (
                      <>
                        <span>Continue to Validation & Decisions</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              STEP 2: VALIDATION & DECISION MATRIX (User's Core Requirement!)
             ───────────────────────────────────────────────────────────── */}
          {currentStep === 2 && analysis && (
            <div className="space-y-5 animate-fade-in">
              
              {/* Summary Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('promote')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeTab === 'promote'
                      ? 'bg-blue-50/80 border-blue-400 shadow-sm ring-1 ring-blue-300'
                      : 'bg-white border-gray-200 hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">Auto-Promote</span>
                    <RefreshCw className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold text-blue-700">{promotions.length}</div>
                  <div className="text-[11px] text-gray-500">Existing student matches</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('new')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeTab === 'new'
                      ? 'bg-emerald-50/80 border-emerald-400 shadow-sm ring-1 ring-emerald-300'
                      : 'bg-white border-gray-200 hover:border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">New Students</span>
                    <UserPlus className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-700">{analysis.newStudents.length}</div>
                  <div className="text-[11px] text-gray-500">Brand new accounts</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('missing')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeTab === 'missing'
                      ? 'bg-amber-50/80 border-amber-400 shadow-sm ring-1 ring-amber-300'
                      : 'bg-white border-gray-200 hover:border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">Missing / Inactive</span>
                    <UserX className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-bold text-amber-700">{missing.length}</div>
                  <div className="text-[11px] text-gray-500">Not in new list / Graduating</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('conflicts')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    activeTab === 'conflicts'
                      ? 'bg-red-50/80 border-red-400 shadow-sm ring-1 ring-red-300'
                      : 'bg-white border-gray-200 hover:border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">ID Conflicts</span>
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-2xl font-bold text-red-700">{conflicts.length}</div>
                  <div className="text-[11px] text-gray-500">Name collision warnings</div>
                </button>
              </div>

              {/* Tab Content Panels */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                
                {/* 1. AUTO-PROMOTE TAB */}
                {activeTab === 'promote' && (
                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/50 p-3.5 rounded-xl border border-blue-100">
                      <div>
                        <h4 className="text-sm font-bold text-[#001A4D]">
                          Existing Students Matching Incoming List ({promotions.length})
                        </h4>
                        <p className="text-xs text-gray-600">
                          These students match existing records by Student Number and Name. Auto-promoting will update their term, year level, and clear pending re-enrollment without losing their credentials.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePromoteAll('AUTO_PROMOTE')}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                        >
                          Promote All
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePromoteAll('SKIP')}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-300 transition-colors"
                        >
                          Skip All
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[360px] border border-gray-100 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600">
                          <tr>
                            <th className="p-3">Student ID</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Current Academic Standing</th>
                            <th className="p-3">New Registrar Standing</th>
                            <th className="p-3 text-right">Decision</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {promotions.map((item, idx) => (
                            <tr key={item.incoming.studentNo} className="hover:bg-blue-50/20">
                              <td className="p-3 font-mono font-semibold text-gray-900">{item.incoming.studentNo}</td>
                              <td className="p-3 font-bold text-[#001A4D]">
                                {item.incoming.lastName}, {item.incoming.firstName}
                              </td>
                              <td className="p-3 text-gray-600">
                                <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-[11px]">
                                  {item.existing.yearLevel || 'Prior'} • {item.existing.courseCode}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                                  {item.incoming.yearLevel} • {item.incoming.courseCode}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <select
                                  value={item.decision}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setPromotions((prev) =>
                                      prev.map((p, i) => (i === idx ? { ...p, decision: val } : p))
                                    );
                                  }}
                                  className={`text-xs font-bold rounded-lg px-2.5 py-1 border transition-colors cursor-pointer ${
                                    item.decision === 'AUTO_PROMOTE'
                                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                                      : 'bg-gray-100 text-gray-600 border-gray-300'
                                  }`}
                                >
                                  <option value="AUTO_PROMOTE">Auto-Promote & Update</option>
                                  <option value="SKIP">Skip (Keep Current)</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. NEW STUDENTS TAB */}
                {activeTab === 'new' && (
                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100">
                      <h4 className="text-sm font-bold text-emerald-900">
                        Brand New Enrollees ({analysis.newStudents.length})
                      </h4>
                      <p className="text-xs text-emerald-800">
                        These students do not exist in the system yet. They will be added with <code className="bg-white px-1.5 py-0.5 rounded text-emerald-900 font-mono font-bold">status: 'ACTIVE'</code>, <code className="bg-white px-1.5 py-0.5 rounded text-emerald-900 font-mono">isProfileComplete: false</code>, and initial default passwords based on the formula: <span className="font-semibold underline">Caps(LastName) + Last 6 Digits</span>.
                      </p>
                    </div>

                    <div className="overflow-x-auto max-h-[360px] border border-gray-100 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600">
                          <tr>
                            <th className="p-3">Student ID</th>
                            <th className="p-3">Full Name</th>
                            <th className="p-3">Sex</th>
                            <th className="p-3">Program / Strand</th>
                            <th className="p-3">Year Level</th>
                            <th className="p-3">Initial Default Password</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {analysis.newStudents.map((st) => {
                            const pwd = generateDefaultStudentPassword(st.lastName, st.studentNo);
                            return (
                              <tr key={st.studentNo} className="hover:bg-emerald-50/20">
                                <td className="p-3 font-mono font-semibold text-gray-900">{st.studentNo}</td>
                                <td className="p-3 font-bold text-gray-800">
                                  {st.lastName}, {st.firstName} {st.middleName ? `${st.middleName[0]}.` : ''}
                                </td>
                                <td className="p-3 text-gray-600">{st.sex}</td>
                                <td className="p-3 font-semibold text-emerald-700">{st.courseCode}</td>
                                <td className="p-3 text-gray-700">{st.yearLevel}</td>
                                <td className="p-3 font-mono font-bold text-blue-600 bg-blue-50/50">
                                  {pwd}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. MISSING STUDENTS / INACTIVE DETECTION TAB (User's explicit requirement!) */}
                {activeTab === 'missing' && (
                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200">
                      <div>
                        <h4 className="text-sm font-bold text-amber-900">
                          Students Missing from New Registrar List ({missing.length})
                        </h4>
                        <p className="text-xs text-amber-800">
                          These students were previously ACTIVE, but are <strong>not present</strong> in this enrollment list.
                          Continuing students can be set to <code className="font-mono font-bold text-amber-950">INACTIVE</code> (unenrolled), while final-year students can be archived as <code className="font-mono font-bold text-amber-950">GRADUATED</code>.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleMissingAll('SET_INACTIVE')}
                          className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors"
                        >
                          Inactivate All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMissingAll('KEEP_ACTIVE')}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-300 transition-colors"
                        >
                          Keep All Active
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[360px] border border-gray-100 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600">
                          <tr>
                            <th className="p-3">Student ID</th>
                            <th className="p-3">Student Name</th>
                            <th className="p-3">Last Recorded Program & Level</th>
                            <th className="p-3">Classification</th>
                            <th className="p-3 text-right">Reconciliation Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {missing.map((item, idx) => (
                            <tr key={item.student.id} className="hover:bg-amber-50/20">
                              <td className="p-3 font-mono font-semibold text-gray-900">{item.student.studentId}</td>
                              <td className="p-3 font-bold text-gray-800">
                                {item.student.lastName}, {item.student.firstName}
                              </td>
                              <td className="p-3 text-gray-600">
                                {item.student.yearLevel} • {item.student.courseCode}
                              </td>
                              <td className="p-3">
                                {item.isGraduating ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">
                                    <GraduationCap className="w-3 h-3" /> Graduating Cohort
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                                    Continuing Cohort
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <select
                                  value={item.decision}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setMissing((prev) =>
                                      prev.map((m, i) => (i === idx ? { ...m, decision: val } : m))
                                    );
                                  }}
                                  className={`text-xs font-bold rounded-lg px-2.5 py-1 border transition-colors cursor-pointer ${
                                    item.decision === 'SET_INACTIVE'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : item.decision === 'ARCHIVE_GRADUATED'
                                      ? 'bg-purple-50 text-purple-800 border-purple-300'
                                      : 'bg-gray-100 text-gray-600 border-gray-300'
                                  }`}
                                >
                                  {item.isGraduating && (
                                    <option value="ARCHIVE_GRADUATED">Archive as Graduated</option>
                                  )}
                                  <option value="SET_INACTIVE">Mark as Inactive (Unenrolled)</option>
                                  <option value="KEEP_ACTIVE">Keep Active (Skip)</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. CONFLICTS TAB (Name Collisions) */}
                {activeTab === 'conflicts' && (
                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="bg-red-50/50 p-3.5 rounded-xl border border-red-200">
                      <h4 className="text-sm font-bold text-red-900">
                        Student ID Collision Warnings ({conflicts.length})
                      </h4>
                      <p className="text-xs text-red-800">
                        These incoming rows have a Student Number that already exists in your database, but with a <strong>completely different student name</strong>. Review each collision carefully before overwriting.
                      </p>
                    </div>

                    {conflicts.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 text-sm">
                        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                        No student number collisions detected. All IDs are clean!
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[360px] border border-gray-100 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600">
                            <tr>
                              <th className="p-3">Student ID</th>
                              <th className="p-3">Existing DB Student</th>
                              <th className="p-3">Incoming Registrar Student</th>
                              <th className="p-3 text-right">Conflict Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {conflicts.map((item, idx) => (
                              <tr key={item.incoming.studentNo} className="hover:bg-red-50/20">
                                <td className="p-3 font-mono font-bold text-red-700">{item.incoming.studentNo}</td>
                                <td className="p-3 text-gray-700 font-medium">
                                  {item.existing.lastName}, {item.existing.firstName}
                                </td>
                                <td className="p-3 text-red-800 font-bold">
                                  {item.incoming.lastName}, {item.incoming.firstName}
                                </td>
                                <td className="p-3 text-right">
                                  <select
                                    value={item.decision}
                                    onChange={(e) => {
                                      const val = e.target.value as any;
                                      setConflicts((prev) =>
                                        prev.map((c, i) => (i === idx ? { ...c, decision: val } : c))
                                      );
                                    }}
                                    className={`text-xs font-bold rounded-lg px-2.5 py-1 border transition-colors cursor-pointer ${
                                      item.decision === 'SKIP_INCOMING'
                                        ? 'bg-gray-100 text-gray-700 border-gray-300'
                                        : 'bg-red-50 text-red-700 border-red-300'
                                    }`}
                                  >
                                    <option value="SKIP_INCOMING">Skip Incoming (Keep DB)</option>
                                    <option value="OVERWRITE_EXISTING">Overwrite Existing DB Record</option>
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Academic Program & Department Alignment */}
              {analysis.detectedPrograms && analysis.detectedPrograms.length > 0 && (
                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-blue-50 text-[#001A4D]">
                        <Building className="w-5 h-5 text-[#001A4D]" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">
                          Academic Program & Department Alignment
                        </h4>
                        <p className="text-xs text-gray-500">
                          Align detected programs to their academic department so sections, courses, and students carry the proper department linkage.
                        </p>
                      </div>
                    </div>
                    <span className="self-start sm:self-auto text-xs font-semibold px-2.5 py-1 bg-blue-50 text-[#001A4D] rounded-full border border-blue-200 whitespace-nowrap">
                      {analysis.detectedPrograms.length} Programs Detected
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-gray-100 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                        <tr>
                          <th className="p-3">Program / Strand</th>
                          <th className="p-3">Academic Track</th>
                          <th className="p-3 text-center">Students In File</th>
                          <th className="p-3">Assigned Academic Department</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {analysis.detectedPrograms.map((prog) => {
                          const currentDeptId = programDepartmentMap[prog.code] || '';
                          return (
                            <tr key={prog.code} className="hover:bg-gray-50/60 transition-colors">
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs px-2 py-0.5 bg-blue-50 text-[#001A4D] rounded border border-blue-100">
                                    {prog.code}
                                  </span>
                                  <span className="font-medium text-gray-800">{prog.name}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px]">
                                  {prog.track || 'General'}
                                </span>
                              </td>
                              <td className="p-3 text-center font-semibold text-gray-700">
                                {prog.studentCount}
                              </td>
                              <td className="p-3">
                                <select
                                  value={currentDeptId}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setProgramDepartmentMap((prev) => ({
                                      ...prev,
                                      [prog.code]: val,
                                    }));
                                  }}
                                  className={`w-full max-w-xs text-xs rounded-lg px-2.5 py-1.5 border transition-all cursor-pointer ${
                                    currentDeptId
                                      ? 'bg-blue-50/50 border-blue-300 text-gray-900 font-medium'
                                      : 'bg-amber-50 border-amber-300 text-amber-900 font-medium'
                                  }`}
                                >
                                  <option value="">-- Select Academic Department --</option>
                                  {activeDepartments.map((dept) => (
                                    <option key={dept.id} value={dept.id}>
                                      {dept.name} ({dept.code})
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Master Auto-Provisioning Options */}
              <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  Master Maintenance Synchronization
                </span>
                <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoProvisionCourses}
                    onChange={(e) => setAutoProvisionCourses(e.target.checked)}
                    className="w-4 h-4 rounded text-[#001A4D] focus:ring-0 cursor-pointer"
                  />
                  <span>
                    Auto-provision missing programs into <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-800">courses</code> collection
                    {analysis.missingCourses.length > 0 ? ` (${analysis.missingCourses.length} will be created)` : ' (All exist)'}
                  </span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoProvisionSemester}
                    onChange={(e) => setAutoProvisionSemester(e.target.checked)}
                    className="w-4 h-4 rounded text-[#001A4D] focus:ring-0 cursor-pointer"
                  />
                  <span>
                    Auto-provision active term into <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-800">semesters</code> collection
                    {analysis.isSemesterProvisionNeeded ? ' (New term will be activated)' : ' (Already active)'}
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-colors"
                >
                  Back to File Upload
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white rounded-xl text-xs font-bold hover:opacity-95 transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <span>Commit Registrar Import to Database</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              STEP 3: EXECUTION & AUDIT LOG
             ───────────────────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div className="max-w-2xl mx-auto py-6 space-y-6">
              
              {isCommitting ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-center space-y-4">
                  <Loader2 className="w-12 h-12 text-[#001A4D] animate-spin mx-auto" />
                  <h3 className="text-lg font-bold text-gray-800">Executing Registrar Import</h3>
                  <p className="text-xs text-gray-500">{progressText}</p>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[#001A4D] to-blue-600 h-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono font-bold text-blue-700">{progressPercent}%</div>
                </div>
              ) : result ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-6 animate-fade-in">
                  
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-bold text-[#001A4D]">Import Successfully Executed!</h3>
                    <p className="text-xs text-gray-500">
                      All records have been synchronized with Firestore database in batches.
                    </p>
                  </div>

                  {/* Results Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <div className="text-2xl font-bold text-emerald-700">{result.createdCount}</div>
                      <div className="text-xs text-emerald-800 font-medium">New Enrollees</div>
                    </div>
                    <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl">
                      <div className="text-2xl font-bold text-blue-700">{result.promotedCount}</div>
                      <div className="text-xs text-blue-800 font-medium">Promoted / Updated</div>
                    </div>
                    <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl">
                      <div className="text-2xl font-bold text-amber-700">{result.inactivatedCount}</div>
                      <div className="text-xs text-amber-800 font-medium">Marked Inactive</div>
                    </div>
                    <div className="p-3.5 bg-purple-50 border border-purple-100 rounded-xl">
                      <div className="text-2xl font-bold text-purple-700">{result.graduatedCount}</div>
                      <div className="text-xs text-purple-800 font-medium">Graduated Archived</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={downloadAuditLogCSV}
                      className="w-full sm:w-auto flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-[#001A4D]" />
                      Download Audit Log CSV (with Passwords)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSuccess();
                        onClose();
                      }}
                      className="w-full sm:w-auto flex-1 py-3 px-4 bg-gradient-to-r from-[#001A4D] to-[#0A3D91] text-white rounded-xl font-bold text-xs hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                    >
                      <span>Finish & View Registry</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : null}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
