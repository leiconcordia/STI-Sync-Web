/**
 * src/app/signatory/pages/SignatoryReportsPage.tsx
 *
 * Dedicated Executive Readout & Campus Activity Reports Feed for Institutional Signatories.
 * Allows executive leaders (President, Deans, Academic Heads, Principals, Accountants)
 * to read what happened on campus: completed activities, attendance turnout KPIs,
 * photo proof documentation, financial execution variances, and Form PAR-01 PDFs.
 */

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  Download,
  Search,
  Filter,
  DollarSign,
  Camera,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Award,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAllEvents } from '../../modules/events/hooks/useEventStream';
import { useAllPARsForSignatories } from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useActiveAcademicPeriods } from '../../modules/academic/hooks/useAcademicStream';
import { exportPostActivityReportPDF } from '../../modules/post-activity-reports/utils/par-pdf-exporter';
import { formatAppDate } from '../../utils/date';
import { formatPHP } from '../../modules/activity-proposals/utils/proposal-calculations';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';

export default function SignatoryReportsPage() {
  const { events = [], loading: eventsLoading } = useAllEvents();
  const { pars = [], loading: parsLoading } = useAllPARsForSignatories();
  const { data: orgs = [] } = useOrganizationStream();
  const { activeCollegePeriod } = useActiveAcademicPeriods();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('all');
  const [selectedReportForModal, setSelectedReportForModal] = useState<PostActivityReportDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Map PARs by eventId for quick enrichment
  const parMap = useMemo(() => {
    const map = new Map<string, PostActivityReportDocument>();
    pars.forEach((p) => {
      if (p.eventId) map.set(p.eventId, p);
    });
    return map;
  }, [pars]);

  // Map organization names & acronyms
  const orgMap = useMemo(() => {
    const map = new Map<string, { name: string; acronym: string }>();
    orgs.forEach((o) => {
      map.set(o.id, { name: o.name, acronym: o.acronym || o.name });
    });
    return map;
  }, [orgs]);

  // Concluded & Completed Activities List
  const completedActivities = useMemo(() => {
    return events
      .filter((e) => {
        const isCompleted =
          e.proposalStatus === 'completed' ||
          (e as any).status === 'completed' ||
          (e as any).status === 'Completed' ||
          (e as any).lifecycleStatus === 'completed' ||
          parMap.has(e.id);
        return isCompleted;
      })
      .map((e) => {
        const linkedPar = parMap.get(e.id);
        const hostInfo = orgMap.get(e.hostingOrgId);
        const hostName =
          e.hostingOrgId === 'sas' || (e as any).isSas
            ? 'STI SAS'
            : hostInfo?.acronym || hostInfo?.name || 'STI SAS';

        const firstSession = e.sessions && e.sessions[0];
        const dateStr = linkedPar?.eventDateFormatted || (firstSession?.date ? formatAppDate(firstSession.date) : 'Concluded Term');
        const venueStr = linkedPar?.eventVenue || e.customVenueName || firstSession?.venueName || 'STI Ormoc Campus';

        const attendees =
          linkedPar?.attendanceSummary?.attendedCount ??
          (e as any).actualAttendanceCount ??
          (e as any).estAttendanceCount ??
          0;
        const targetAudience =
          linkedPar?.attendanceSummary?.registeredCount ??
          (e as any).estAttendanceCount ??
          attendees ??
          1;
        const turnoutRate = targetAudience > 0 ? Math.min(100, Math.round((attendees / targetAudience) * 100)) : 100;

        return {
          id: e.id,
          title: e.title,
          referenceNo: (e as any).referenceNo || (e as any).referenceNumber || 'ACT-COMPLETED',
          hostName,
          hostingOrgId: e.hostingOrgId,
          dateStr,
          venueStr,
          attendees,
          targetAudience,
          turnoutRate,
          linkedPar,
          event: e,
        };
      })
      .filter((item) => {
        if (selectedOrgFilter !== 'all') {
          if (selectedOrgFilter === 'sas') {
            if (item.hostingOrgId !== 'sas' && !(item.event as any).isSas) return false;
          } else if (item.hostingOrgId !== selectedOrgFilter) {
            return false;
          }
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchHost = item.hostName.toLowerCase().includes(q);
          const matchRef = item.referenceNo.toLowerCase().includes(q);
          const matchParRef = item.linkedPar?.referenceNo?.toLowerCase().includes(q);
          if (!matchTitle && !matchHost && !matchRef && !matchParRef) return false;
        }

        return true;
      });
  }, [events, parMap, orgMap, selectedOrgFilter, searchQuery]);

  // Aggregate Institutional Executive KPIs
  const kpis = useMemo(() => {
    const totalActivities = completedActivities.length;
    const totalStudentsTurnout = completedActivities.reduce((acc, curr) => acc + curr.attendees, 0);
    const clearedParsCount = pars.filter((p) => p.status === 'approved').length;
    const avgTurnoutRate =
      totalActivities > 0
        ? Math.round(completedActivities.reduce((acc, curr) => acc + curr.turnoutRate, 0) / totalActivities)
        : 100;

    return {
      totalActivities,
      totalStudentsTurnout,
      clearedParsCount,
      avgTurnoutRate,
    };
  }, [completedActivities, pars]);

  const handleDownloadParPdf = async (e: React.MouseEvent, par: PostActivityReportDocument) => {
    e.stopPropagation();
    setDownloadingId(par.id);
    try {
      await exportPostActivityReportPDF(par);
      toast.success(`Downloaded official Post-Activity Report for ${par.eventTitle || par.referenceNo}`);
    } catch (err: any) {
      toast.error('Failed to export PDF: ' + (err?.message || 'Please try again.'));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Executive Welcome & Campus Activity Readout Header */}
      <div className="bg-gradient-to-r from-[#001A4D] via-[#082E76] to-[#001A4D] text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-[#FFD41C] text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Executive Activity Readout · {activeCollegePeriod?.semester || 'Academic Term'} {activeCollegePeriod?.academicYear || ''}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Campus Activity Reports & Execution Logs
          </h1>
          <p className="text-blue-100 text-xs sm:text-sm mt-2 leading-relaxed">
            Institutional overview of completed student programs, official Post-Activity Reports, verified attendance engagement, and executive photo documentations.
          </p>
        </div>
        <Building className="absolute right-6 -bottom-6 w-56 h-56 text-white/5 pointer-events-none" />
      </div>

      {/* Institutional High-Level KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Activities Completed */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Completed Activities</span>
            <div className="text-2xl font-bold text-[#001A4D] mt-1">
              {eventsLoading ? '...' : kpis.totalActivities}
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">Successfully executed</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0E4EBD]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Total Verified Student Attendance */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Engagements</span>
            <div className="text-2xl font-bold text-[#001A4D] mt-1">
              {eventsLoading ? '...' : kpis.totalStudentsTurnout.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-400">Verified campus attendees</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Average Turnout Rate */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg. Turnout Rate</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">
              {eventsLoading ? '...' : `${kpis.avgTurnoutRate}%`}
            </div>
            <span className="text-[11px] text-slate-400">Attendance vs. projected</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Cleared Post-Activity Reports */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reports Certified</span>
            <div className="text-2xl font-bold text-[#001A4D] mt-1">
              {parsLoading ? '...' : kpis.clearedParsCount}
            </div>
            <span className="text-[11px] text-slate-400">Fully signed & archived</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search completed activities or PARs..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedOrgFilter}
            onChange={(e) => setSelectedOrgFilter(e.target.value)}
            aria-label="Filter completed activities by host organization or SAS"
            className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#0E4EBD]"
          >
            <option value="all">All Organizations & Departments</option>
            <option value="sas">STI SAS (Institutional Events)</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.acronym || o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Completed Activities & Reports List */}
      <div className="space-y-4">
        {eventsLoading || parsLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs">
            Loading campus activity records...
          </div>
        ) : completedActivities.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-700 text-sm">No Concluded Activities Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Completed student activities and approved Post-Activity Reports for this term will automatically populate here for executive reading.
            </p>
          </div>
        ) : (
          completedActivities.map((item) => {
            const par = item.linkedPar;
            const photos = par?.photos || [];

            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-5 shadow-xs transition-all space-y-4"
              >
                {/* Header Row: Title, Host Badge, and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#001A4D] text-[#FFD41C] uppercase tracking-wider">
                        {item.hostName}
                      </span>
                      {par?.referenceNo && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-[#0E4EBD] border border-blue-200">
                          {par.referenceNo}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono">
                        {item.referenceNo}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#001A4D]">
                      {item.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {par && (
                      <button
                        onClick={(e) => handleDownloadParPdf(e, par)}
                        disabled={downloadingId === par.id}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#0E4EBD] border border-blue-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Download official Post-Activity Report PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{downloadingId === par.id ? 'Exporting...' : 'Report PDF'}</span>
                      </button>
                    )}
                    {par && (
                      <button
                        onClick={() => setSelectedReportForModal(par)}
                        className="px-3 py-1.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <span>Inspect Report</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Event Logistics & Attendance Turnout Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
                    <span><strong>Date:</strong> {item.dateStr}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
                    <span className="truncate"><strong>Venue:</strong> {item.venueStr}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
                    <span>
                      <strong>Turnout:</strong> {item.attendees.toLocaleString()} attendees ({item.turnoutRate}%)
                    </span>
                  </div>
                </div>

                {/* Executive Narrative / Objectives Assessment from PAR */}
                {par ? (
                  <div className="space-y-2 text-xs">
                    {par.eventDescription && (
                      <p className="text-slate-600 line-clamp-2">
                        <strong className="text-slate-900">Event Overview:</strong> {par.eventDescription}
                      </p>
                    )}

                    {par.financialSummary && (
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                        <span>
                          Total Disbursed: <strong className="text-slate-700">{formatPHP(par.financialSummary.totalDisbursed || 0)}</strong>
                        </span>
                        <span>·</span>
                        <span>
                          Surplus / Variance: <strong className="text-emerald-700">{formatPHP(par.financialSummary.surplusOrDeficit || 0)}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Concluded activity — Post-activity report is currently undergoing final officer documentation.
                  </p>
                )}

                {/* Photo Documentation Strip if Available */}
                {photos.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      Photo Proof Documentation ({photos.length} photos)
                    </span>
                    <div className="flex items-center gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                      {photos.map((photo, pIdx) => (
                        <div
                          key={photo.id || pIdx}
                          className="w-24 h-20 rounded-lg overflow-hidden border border-slate-200 flex-shrink-0 bg-slate-100 relative group"
                        >
                          <img
                            src={photo.url}
                            alt={photo.caption || 'Event photo'}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Detail Modal for Full PAR Inspection */}
      {selectedReportForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#001A4D] text-white p-5 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FFD41C] text-[#001A4D] uppercase">
                    Post-Activity Report
                  </span>
                  <span className="text-xs text-white/70 font-mono">
                    {selectedReportForModal.referenceNo}
                  </span>
                </div>
                <h3 className="font-bold text-lg leading-tight">
                  {selectedReportForModal.eventTitle}
                </h3>
              </div>
              <button
                onClick={() => setSelectedReportForModal(null)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[11px]">Organization / Unit</span>
                  <strong className="text-slate-900">{selectedReportForModal.organizationName} ({selectedReportForModal.organizationAcronym})</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Submission Date</span>
                  <strong className="text-slate-900">{selectedReportForModal.eventDateFormatted}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Verified Attendance</span>
                  <strong className="text-slate-900">{selectedReportForModal.attendanceSummary?.attendedCount} Participants</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Actual Expenses Disbursed</span>
                  <strong className="text-slate-900">{formatPHP(selectedReportForModal.financialSummary?.totalDisbursed || 0)}</strong>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1">Executive Summary</h4>
                <p className="text-slate-600 leading-relaxed">
                  {selectedReportForModal.eventDescription || 'No narrative provided.'}
                </p>
              </div>

              {selectedReportForModal.photos && selectedReportForModal.photos.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 text-sm mb-2">Photo Proof Documentation</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedReportForModal.photos.map((ph, idx) => (
                      <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                        <img src={ph.url} alt={ph.caption || 'Event'} className="w-full h-32 object-cover" />
                        {ph.caption && (
                          <p className="p-1.5 text-[10px] text-slate-600 truncate bg-white">
                            {ph.caption}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <button
                onClick={(e) => handleDownloadParPdf(e, selectedReportForModal)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Official PDF
              </button>
              <button
                onClick={() => setSelectedReportForModal(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
