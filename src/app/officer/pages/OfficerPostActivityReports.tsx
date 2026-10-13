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
  Edit3,
  ArrowRight,
  TrendingUp,
  FileText,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { useOfficerProfile } from '../../auth/hooks/useOfficerProfile';
import {
  useOfficerPARs,
  useEligibleEventsForPAR,
} from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import PostActivityReportWizardModal from '../../modules/post-activity-reports/components/PostActivityReportWizardModal';
import PostActivityReportDetailModal from '../../modules/post-activity-reports/components/PostActivityReportDetailModal';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import { formatCurrency, formatVariance } from '../../utils/currency';
import { TablePagination } from '../../components/common/TablePagination';
import { toast } from 'sonner';

type FilterTab = 'all' | 'pending' | 'approved' | 'returned' | 'draft';
const ITEMS_PER_PAGE = 8;

export default function OfficerPostActivityReports() {
  const { profile } = useOfficerProfile();

  // Session fallback
  const [session] = useState(() => {
    try {
      const raw = localStorage.getItem('sti_sync_officer_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const orgId = profile?.activeOrganizationId || session?.activeOrganizationId || '';
  const orgName = profile?.studentName || session?.studentName ? `${profile?.studentName || session?.studentName}'s Org` : 'Student Organization';
  const userUid = profile?.studentId || session?.studentId || 'officer_user';
  const userName = profile?.studentName || session?.studentName || 'Officer';
  const userEmail = profile?.email || session?.email || '';

  // Real-time Streams
  const { pars, loading: parsLoading } = useOfficerPARs(orgId);
  const { eligibleEvents, loading: eventsLoading } = useEligibleEventsForPAR('officer', orgId, orgName);

  // Filter & Search State
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals State
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [wizardEventId, setWizardEventId] = useState<string>('');
  const [editingReport, setEditingReport] = useState<PostActivityReportDocument | null>(null);
  const [viewingReport, setViewingReport] = useState<PostActivityReportDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Counts
  const counts = useMemo(() => {
    return {
      all: pars.length,
      pending: pars.filter((p) => p.status === 'under_review').length,
      approved: pars.filter((p) => p.status === 'approved').length,
      returned: pars.filter((p) => p.status === 'returned').length,
      draft: pars.filter((p) => p.status === 'draft').length,
    };
  }, [pars]);

  // Filtered List
  const filteredPars = useMemo(() => {
    return pars.filter((p) => {
      if (activeTab === 'pending' && p.status !== 'under_review') return false;
      if (activeTab === 'approved' && p.status !== 'approved') return false;
      if (activeTab === 'returned' && p.status !== 'returned') return false;
      if (activeTab === 'draft' && p.status !== 'draft') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = p.referenceNo?.toLowerCase().includes(q);
        const matchesTitle = p.eventTitle?.toLowerCase().includes(q);
        const matchesVenue = p.eventVenue?.toLowerCase().includes(q);
        if (!matchesRef && !matchesTitle && !matchesVenue) return false;
      }
      return true;
    });
  }, [pars, activeTab, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPars.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPars.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPars, currentPage]);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

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

  const handleCreateForEvent = (eventId: string) => {
    setWizardEventId(eventId);
    setEditingReport(null);
    setShowWizardModal(true);
  };

  const handleEditReport = (rep: PostActivityReportDocument) => {
    setEditingReport(rep);
    setWizardEventId(rep.eventId);
    setShowWizardModal(true);
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Under Review
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
      {/* ── Header (Matching Officer Design Language) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="text-gray-500 text-xs font-medium">Dashboard &gt; Post-Activity Reports</div>
            {profile?.isAdviser ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Adviser Authorized
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                Student Officer Mode
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5 font-medium">
            Submit post-mortem evaluations, attendance audits, and categorized recommendations for concluded events
          </p>
        </div>

        {/* Solid Officer Button without gradients */}
        <button
          onClick={() => {
            setEditingReport(null);
            setWizardEventId(eligibleEvents.length > 0 ? eligibleEvents[0].id : '');
            setShowWizardModal(true);
          }}
          disabled={eligibleEvents.length === 0}
          title={
            eligibleEvents.length === 0
              ? 'No concluded events with approved liquidations are awaiting a Post-Activity Report.'
              : 'Create Post-Activity Report'
          }
          className="flex items-center gap-2 px-4 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-white rounded-xl text-sm font-bold shadow-xs transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 text-[#FFD41C]" />
          New Post-Activity Report
          {eligibleEvents.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-xs font-bold bg-[#FFD41C] text-[#001A4D]">
              {eligibleEvents.length}
            </span>
          )}
        </button>
      </div>

      {/* ── 3 KPI Summary Cards (Matching Officer Format) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Pending Endorsement */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Pending Endorsement</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5 tracking-tight">
              {counts.pending} {counts.pending === 1 ? 'report' : 'reports'}
            </div>
            <div className="text-[11px] text-amber-700 font-medium">
              Awaiting institutional sign-offs
            </div>
          </div>
        </div>

        {/* Card 2: Approved Spendings & Clearances */}
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
              Fully approved and archived to EDMS
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
              Requires update &amp; resubmission
            </div>
          </div>
        </div>
      </div>

      {/* ── Concluded Activities Awaiting PAR (Queue & 15-Day Policy Banner) ── */}
      {eligibleEvents.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-700" />
              <div>
                <h3 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                  Concluded Activities Awaiting Post-Activity Report ({eligibleEvents.length})
                </h3>
                <p className="text-xs text-amber-800">
                  Institutional policy compliance: Submit Form PAR within fifteen (15) school days following event conclusion and LF-01 liquidation clearance.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {eligibleEvents.map((ev) => (
              <div
                key={ev.id}
                className="bg-white rounded-xl p-4 border border-amber-200 shadow-2xs flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      LF-01 Cleared
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {(ev as any).date || 'Concluded'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 line-clamp-1">{ev.title}</h4>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {ev.description || 'Concluded organization event.'}
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-gray-100 mt-3">
                  <span className="text-[11px] text-gray-500 font-medium">
                    Venue: {(ev as any).venue || 'STI Campus'}
                  </span>
                  <button
                    onClick={() => handleCreateForEvent(ev.id)}
                    className="bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    File PAR <ArrowRight className="w-3.5 h-3.5 text-[#FFD41C]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Container: Tabs + Search + Table + Pagination ── */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xs overflow-hidden">
        {/* Top Control Bar */}
        <div className="p-4 border-b border-gray-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'pending', label: 'Pending', count: counts.pending },
              { key: 'approved', label: 'Approved', count: counts.approved },
              { key: 'returned', label: 'Returned', count: counts.returned },
              { key: 'draft', label: 'Drafts', count: counts.draft },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key as FilterTab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#001A4D] text-white shadow-xs'
                      : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-60">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference # or title..."
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#001A4D] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-gray-50/75 border-b border-gray-100 font-bold text-gray-700 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Ref Number</th>
                <th className="py-3 px-4">Event Title</th>
                <th className="py-3 px-4">Conducted</th>
                <th className="py-3 px-4 text-center">Verified Attendance</th>
                <th className="py-3 px-4 text-right">Balance</th>
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
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Reports filed by your organization will appear here.
                    </p>
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
                        <span className="text-[11px] text-gray-400">{r.eventVenue}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {r.eventDateFormatted}
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
                            title="View Report Details"
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
                          {(r.status === 'draft' || r.status === 'returned') && (
                            <button
                              onClick={() => handleEditReport(r)}
                              title="Edit Report"
                              className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
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
      </div>

      {/* Creation / Edit Wizard Modal */}
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
          uid: userUid,
          name: userName,
          email: userEmail,
          role: 'officer',
          organizationId: orgId,
          organizationName: orgName,
        }}
        isSasAdmin={false}
      />

      {/* Detail / Inspection Modal */}
      <PostActivityReportDetailModal
        isOpen={Boolean(viewingReport)}
        onClose={() => setViewingReport(null)}
        report={viewingReport}
        canEdit={true}
        onEdit={handleEditReport}
        isSasAdmin={false}
        currentUser={{
          uid: userUid,
          name: userName,
          email: userEmail,
          role: 'officer',
          organizationId: orgId,
        }}
        currentUserId={userUid}
        currentUserName={userName}
      />
    </div>
  );
}
