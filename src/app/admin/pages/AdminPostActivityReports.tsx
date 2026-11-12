import { useSearchParams } from 'react-router';
import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCheck2,
  Calendar,
  Building2,
  Users,
  DollarSign,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertCircle,
  Download,
  Eye,
  FileText,
  ArrowRight,
  TrendingUp,
  Edit3,
  Trash2,
} from 'lucide-react';
import {
  useAdminPARs,
  useEligibleEventsForPAR,
} from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import PostActivityReportWizardModal from '../../modules/post-activity-reports/components/PostActivityReportWizardModal';
import PostActivityReportDetailModal from '../../modules/post-activity-reports/components/PostActivityReportDetailModal';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import { deletePAR } from '../../modules/post-activity-reports/services/par.service';
import { formatCurrency, formatVariance } from '../../utils/currency';
import { TablePagination } from '../../components/common/TablePagination';
import { TrashRepositoryViewer } from '../../modules/workflow/components/TrashRepositoryViewer';
import { useSemesters, useActiveAcademicPeriods } from '../../modules/academic/hooks/useAcademicStream';
import { toast } from 'sonner';

type TabValue = 'all' | 'pending' | 'approved' | 'returned' | 'sas_internal' | 'trash';
const ITEMS_PER_PAGE = 8;

export default function AdminPostActivityReports() {
  // Session / Profile
  const [session] = useState(() => {
    try {
      const raw = localStorage.getItem('sti_sync_admin_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const adminUid = session?.uid || 'sas_admin_user';
  const adminName = session?.name || 'Student Affairs Services';
  const adminEmail = session?.email || 'sas@ormoc.sti.edu.ph';

  // Streams
  const { pars, loading: parsLoading } = useAdminPARs();
  const { eligibleEvents, loading: eventsLoading } = useEligibleEventsForPAR('admin');

  // Filters & State
  const [activeTab, setActiveTab] = useState<TabValue>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('all');
  const [filterSchoolYear, setFilterSchoolYear] = useState('all');
  const [filterSemester, setFilterSemester] = useState('all');
  const [hasInitializedPeriod, setHasInitializedPeriod] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Streams
  const { data: semesters = [] } = useSemesters();
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();

  // Initialize filter to Current Active Semester
  useEffect(() => {
    if (!hasInitializedPeriod && (activeCollegePeriod || activeShsPeriod)) {
      const active = activeCollegePeriod || activeShsPeriod;
      if (active?.academicYear) setFilterSchoolYear(active.academicYear);
      if (active?.semester) setFilterSemester(active.semester);
      setHasInitializedPeriod(true);
    }
  }, [activeCollegePeriod, activeShsPeriod, hasInitializedPeriod]);

  // Derived available school years and semesters
  const availableSchoolYears = useMemo(() => {
    const set = new Set<string>();
    semesters.forEach((s) => { if (s.academicYear) set.add(s.academicYear); });
    pars.forEach((p) => { if (p.schoolYear) set.add(p.schoolYear); });
    if (activeCollegePeriod?.academicYear) set.add(activeCollegePeriod.academicYear);
    return Array.from(set).sort().reverse();
  }, [semesters, pars, activeCollegePeriod]);

  const availableSemesters = useMemo(() => {
    const set = new Set<string>();
    semesters.forEach((s) => {
      const termName = s.semester || (s as any).term;
      if (termName) set.add(termName);
    });
    pars.forEach((p) => { if (p.semester) set.add(p.semester); });
    if (set.size === 0) {
      set.add('1st Semester');
      set.add('2nd Semester');
      set.add('1st Trimester');
      set.add('2nd Trimester');
      set.add('3rd Trimester');
      set.add('Summer');
    }
    return Array.from(set);
  }, [semesters, pars]);

  // Modals
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [wizardEventId, setWizardEventId] = useState<string>('');
  const [editingReport, setEditingReport] = useState<PostActivityReportDocument | null>(null);
  const [viewingReport, setViewingReport] = useState<PostActivityReportDocument | null>(null);
  const [documentParams, setDocumentParams] = useSearchParams();
  const targetDocumentId = documentParams.get('id');
  useEffect(() => {
    if (targetDocumentId) {
      const selected = pars.find((record) => record.id === targetDocumentId);
      if (selected) setViewingReport(selected);
    }
  }, [targetDocumentId, pars]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState<PostActivityReportDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Unique orgs for dropdown filter
  const uniqueOrgs = useMemo(() => {
    const set = new Set<string>();
    pars.forEach((p) => {
      if (p.organizationName) set.add(p.organizationName);
    });
    return Array.from(set);
  }, [pars]);

  // Tab counts
  const counts = useMemo(() => {
    return {
      all: pars.length,
      pending: pars.filter((p) => p.status === 'under_review').length,
      approved: pars.filter((p) => p.status === 'approved').length,
      returned: pars.filter((p) => p.status === 'returned').length,
      sas_internal: pars.filter((p) => p.isSasInternal).length,
    };
  }, [pars]);

  // Filtered List
  const filteredPars = useMemo(() => {
    return pars.filter((p) => {
      if (activeTab === 'pending' && p.status !== 'under_review') return false;
      if (activeTab === 'approved' && p.status !== 'approved') return false;
      if (activeTab === 'returned' && p.status !== 'returned') return false;
      if (activeTab === 'sas_internal' && !p.isSasInternal) return false;

      if (selectedOrgFilter !== 'all' && p.organizationName !== selectedOrgFilter) return false;

      // School Year filter
      if (filterSchoolYear !== 'all') {
        const sem = p.semesterId ? semesters.find((s) => s.id === p.semesterId) : null;
        const pSy = p.schoolYear || sem?.academicYear;
        if (pSy && pSy !== filterSchoolYear) return false;
      }

      // Semester filter
      if (filterSemester !== 'all') {
        const sem = p.semesterId ? semesters.find((s) => s.id === p.semesterId) : null;
        const pTerm = p.semester || sem?.semester || (sem as any)?.term;
        if (pTerm && pTerm !== filterSemester) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = p.referenceNo?.toLowerCase().includes(q);
        const matchesTitle = p.eventTitle?.toLowerCase().includes(q);
        const matchesOrg = p.organizationName?.toLowerCase().includes(q);
        if (!matchesRef && !matchesTitle && !matchesOrg) return false;
      }

      return true;
    });
  }, [pars, activeTab, selectedOrgFilter, filterSchoolYear, filterSemester, searchQuery, semesters]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPars.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPars.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPars, currentPage]);

  const handleTabChange = (tab: TabValue) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleDownload = async (e: React.MouseEvent, r: PostActivityReportDocument) => {
    e.stopPropagation();
    setDownloadingId(r.id);
    try {
      await exportPostActivityReportPDF(r);
      toast.success(`Downloaded official PDF for ${r.referenceNo}`);
    } catch (err: any) {
      toast.error('Failed to export PDF: ' + (err?.message || 'Error'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCreateSasPAR = (eventId: string) => {
    setEditingReport(null);
    setWizardEventId(eventId);
    setShowWizardModal(true);
  };

  const handleEditReport = (rep: PostActivityReportDocument) => {
    setEditingReport(rep);
    setWizardEventId(rep.eventId);
    setShowWizardModal(true);
  };

  const handleDeleteReport = async () => {
    if (!deletingReport) return;
    setIsDeleting(true);
    try {
      await deletePAR(
        deletingReport.id,
        {
          uid: adminUid,
          name: adminName,
          role: 'admin',
        },
        'Draft discarded by SAS Admin'
      );
      toast.success(`Draft Post-Activity Report (${deletingReport.referenceNo}) moved to Trash. You can restore it anytime.`);
      setDeletingReport(null);
    } catch (err: any) {
      toast.error('Failed to discard report: ' + (err?.message || 'Error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending Review
          </span>
        );
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Returned
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 w-full animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-gray-500 text-sm font-medium">
            Review and clear post-activity reports from student organizations and author institutional SAS reports
          </p>
        </div>

        {/* Solid Admin Button without gradients */}
        <button
          onClick={() => {
            if (eligibleEvents.length > 0) {
              setWizardEventId(eligibleEvents[0].id);
            }
            setShowWizardModal(true);
          }}
          disabled={eligibleEvents.length === 0}
          title={
            eligibleEvents.length === 0
              ? 'No concluded SAS institutional activities are awaiting a Post-Activity Report.'
              : 'Create Post-Activity Report for concluded SAS event'
          }
          className="bg-[#001A4D] hover:bg-[#002D72] text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 text-[#FFD41C]" />
          Author SAS Post-Activity Report
          {eligibleEvents.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-bold bg-[#FFD41C] text-[#001A4D]">
              {eligibleEvents.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Top 3 KPI Summary Cards (Uniform Admin Format) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Pending SAS Review */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Pending SAS Clearance</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">
              {counts.pending} {counts.pending === 1 ? 'report' : 'reports'}
            </div>
            <div className="text-[11px] text-amber-700 font-medium">
              Awaiting institutional clearance
            </div>
          </div>
        </div>

        {/* Card 2: Approved & Archived */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Approved &amp; Cleared</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">
              {counts.approved} {counts.approved === 1 ? 'report' : 'reports'}
            </div>
            <div className="text-[11px] text-emerald-700 font-medium">
              Auto-archived into EDMS
            </div>
          </div>
        </div>

        {/* Card 3: Returned for Revision */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 flex-shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Returned for Revision</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">
              {counts.returned} {counts.returned === 1 ? 'report' : 'reports'}
            </div>
            <div className="text-[11px] text-red-700 font-medium">
              Requires organizer update
            </div>
          </div>
        </div>
      </div>



      {/* ── Main Container: Tabs + Search + Table + Pagination ── */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xs overflow-hidden">
        {/* Top Control Bar */}
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'pending', label: 'Pending Review', count: counts.pending },
              { key: 'approved', label: 'Approved', count: counts.approved },
              { key: 'returned', label: 'Returned', count: counts.returned },
              { key: 'sas_internal', label: 'SAS Internal', count: counts.sas_internal },
              { key: 'trash', label: 'Trash', count: undefined },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key as TabValue)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#001A4D] text-white shadow-xs'
                      : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Controls: School Year + Semester + Org Filter + Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* School Year Filter */}
            <select
              value={filterSchoolYear}
              onChange={(e) => {
                setFilterSchoolYear(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-gray-300 rounded-xl text-xs font-semibold px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#001A4D]"
            >
              <option value="all">All School Years</option>
              {availableSchoolYears.map((sy) => (
                <option key={sy} value={sy}>
                  A.Y. {sy} {activeCollegePeriod?.academicYear === sy ? '• Current SY' : ''}
                </option>
              ))}
            </select>

            {/* Semester Filter */}
            <select
              value={filterSemester}
              onChange={(e) => {
                setFilterSemester(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-gray-300 rounded-xl text-xs font-semibold px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#001A4D]"
            >
              <option value="all">All Semesters</option>
              {availableSemesters.map((term) => (
                <option key={term} value={term}>
                  {term} {activeCollegePeriod?.semester === term ? '• Active Term' : ''}
                </option>
              ))}
            </select>

            {/* Org Filter */}
            <select
              value={selectedOrgFilter}
              onChange={(e) => {
                setSelectedOrgFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-gray-300 rounded-xl text-xs font-semibold px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#001A4D]"
            >
              <option value="all">All Organizations</option>
              {uniqueOrgs.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>

            {(filterSchoolYear !== (activeCollegePeriod?.academicYear || 'all') || filterSemester !== (activeCollegePeriod?.semester || 'all') || selectedOrgFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setFilterSchoolYear(activeCollegePeriod?.academicYear || 'all');
                  setFilterSemester(activeCollegePeriod?.semester || 'all');
                  setSelectedOrgFilter('all');
                  setCurrentPage(1);
                }}
                className="text-xs text-blue-700 hover:text-blue-900 font-bold px-1.5 py-1 cursor-pointer"
                title="Reset filters to current active academic semester"
              >
                Reset to Current
              </button>
            )}

            <div className="relative flex-1 sm:w-52">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search reference # or title..."
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D] focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {activeTab === 'trash' ? (
          <div className="p-4">
            <TrashRepositoryViewer
              collectionName="post_activity_reports"
              documentTypeLabel="Post-Activity Reports"
              isSasAdmin={true}
              currentUser={{
                uid: adminUid,
                name: adminName,
                role: 'admin',
              }}
            />
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50/75 border-b border-gray-100 font-bold text-gray-700 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Ref Number</th>
                <th className="py-3 px-4">Event Title</th>
                <th className="py-3 px-4">Hosting Body</th>
                <th className="py-3 px-4 text-center">Verified Attendance</th>
                <th className="py-3 px-4 text-right">Liquidation Balance</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parsLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400 font-medium">
                    Loading Post-Activity Reports...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <FileCheck2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="font-semibold text-gray-600">No Post-Activity Reports found.</p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((r) => {
                  const net =
                    (r.financialSummary?.totalRevenue || 0) -
                    (r.financialSummary?.totalDisbursed || 0);

                  return (
                    <tr
                      key={r.id}
                      onClick={() => setViewingReport(r)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#001A4D]">
                        {r.referenceNo}
                      </td>
                      <td className="py-3 px-4">
                        <strong className="text-gray-900 block font-bold">{r.eventTitle}</strong>
                        <span className="text-[11px] text-gray-400">{r.eventDateFormatted}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-gray-800 block">
                          {r.organizationName}
                        </span>
                        {r.isSasInternal && (
                          <span className="text-[10px] text-blue-700 font-bold uppercase">
                            SAS Internal
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-gray-900">
                          {r.attendanceSummary?.attendedCount || 0}
                        </span>
                        <span className="text-gray-400 text-[10px] block">
                          / {r.attendanceSummary?.registeredCount || 0} registered
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-gray-800">
                        {formatVariance(net)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {renderStatusBadge(r.status)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setViewingReport(r)}
                            title="Inspect & Review"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-[#001A4D] hover:bg-gray-100 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDownload(e, r)}
                            disabled={downloadingId === r.id}
                            title="Export PDF"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-[#001A4D] hover:bg-gray-100 disabled:opacity-40 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {r.isSasInternal && (r.status === 'draft' || r.status === 'returned') && (
                            <button
                              onClick={() => handleEditReport(r)}
                              title={r.status === 'returned' ? 'Revise Returned SAS Report' : 'Edit Draft Report'}
                              className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {r.isSasInternal && r.status === 'draft' && (
                            <button
                              onClick={() => setDeletingReport(r)}
                              title="Discard Draft Report"
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredPars.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
          </>
        )}
      </div>

      {/* Creation Modal for SAS Internal Activities */}
      <PostActivityReportWizardModal
        isOpen={showWizardModal}
        onClose={() => {
          setShowWizardModal(false);
          setEditingReport(null);
        }}
        onSuccess={() => {
          setShowWizardModal(false);
          setEditingReport(null);
        }}
        eligibleEvents={eligibleEvents}
        initialEventId={wizardEventId}
        initialReport={editingReport}
        currentUser={{
          uid: adminUid,
          name: adminName,
          email: adminEmail,
          role: 'admin',
          organizationId: 'sao_admin',
          organizationName: 'Student Affairs Services (SAS)',
          signatureUrl: session?.signatureUrl || session?.signatureDataUrl || null,
        }}
        isSasAdmin={true}
      />

      {/* Detail & Review Modal */}
      <PostActivityReportDetailModal
        isOpen={Boolean(viewingReport)}
        onClose={() => { setViewingReport(null); setDocumentParams((previous) => { previous.delete('id'); return previous; }); }}
        report={viewingReport}
        isSasAdmin={true}
        currentUserId={adminUid}
        currentUserName={adminName}
        currentUser={{
          uid: adminUid,
          name: adminName,
          email: adminEmail,
          role: 'admin',
          organizationId: 'sao_admin',
        }}
        canEdit={true}
        onEdit={(rep) => {
          setViewingReport(null);
          setEditingReport(rep);
          setWizardEventId(rep.eventId);
          setShowWizardModal(true);
        }}
      />

      {/* Discard Confirmation Modal */}
      {deletingReport && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Discard Draft Report?</h3>
                <p className="text-xs text-gray-500">Unlinks and permanently removes this draft Post-Activity Report.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
              Are you sure you want to discard draft <strong>{deletingReport.referenceNo}</strong> for <strong>"{deletingReport.eventTitle}"</strong>? The event will become eligible to start a fresh Post-Activity Report under the 1:1:1 invariant.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingReport(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReport}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Discarding...' : 'Discard Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
