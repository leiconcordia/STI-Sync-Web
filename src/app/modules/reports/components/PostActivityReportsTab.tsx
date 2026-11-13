import React from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  Star,
  Users,
  Eye,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { PARAnalyticsSummary, PARReportRow } from '../types/report.types';
import { TablePagination, usePagination } from '../../../components/ui/table-pagination';

interface PostActivityReportsTabProps {
  summary: PARAnalyticsSummary;
  onSelectPAR: (row: PARReportRow) => void;
  onExport: () => void;
  onExportCSV?: () => void;
}

export const PostActivityReportsTab: React.FC<PostActivityReportsTabProps> = ({
  summary,
  onSelectPAR,
  onExport,
  onExportCSV,
}) => {
  const rows = summary?.rows || [];
  const kpis = summary?.kpis || {
    totalActivitiesConducted: 0,
    turnoutAccuracyRate: 0,
    totalUniqueStudentAttendees: 0,
    parCompletionCompliance: 0,
    overallEventRating: 0,
  };

  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedItems,
    setCurrentPage,
    setPageSize,
    totalItems,
  } = usePagination(rows, 10);

  const statusBadge = (status: string) => {
    const lower = (status || '').toLowerCase();
    if (lower === 'approved' || lower === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> APPROVED
        </span>
      );
    }
    if (lower === 'pending' || lower === 'under_review' || lower === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" /> UNDER REVIEW
        </span>
      );
    }
    if (lower === 'returned') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
          RETURNED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
        {(status || 'PENDING').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase mb-1">
            <span>Activities Conducted</span>
            <ClipboardCheck className="w-4 h-4 text-[#003B73]" />
          </div>
          <div className="text-2xl font-black text-gray-900">
            {(kpis.totalActivitiesConducted || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Total PARs in current filter
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-600 uppercase mb-1">
            <span>PAR Compliance Rate</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-emerald-700">
            {kpis.parCompletionCompliance || 0}%
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Turnout Accuracy: {kpis.turnoutAccuracyRate || 0}%
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-amber-600 uppercase mb-1">
            <span>Average Evaluation</span>
            <Star className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-gray-900">
            ⭐ {Number(kpis.overallEventRating || 0).toFixed(2)}{' '}
            <span className="text-xs font-semibold text-gray-400">/ 5.0</span>
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Participant evaluation average
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-purple-600 uppercase mb-1">
            <span>Verified Attendance</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-purple-700">
            {(kpis.totalUniqueStudentAttendees || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Verified student participants
          </div>
        </div>
      </div>

      {/* Detailed PAR Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-gray-900">
                Post-Activity Reports & Outcomes Ledger (PAR-01)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                {rows.length} Reports
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete registry of submitted Post-Activity Reports, Club Advisers, verified student turnout, and activity evaluation ratings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onExportCSV && (
              <button
                onClick={onExportCSV}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>
            )}
            <button
              onClick={onExport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#003B73] text-white hover:bg-[#002855] transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF / CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                <th className="py-3.5 px-4">PAR Code</th>
                <th className="py-3.5 px-4">Activity Title</th>
                <th className="py-3.5 px-4">Organization</th>
                <th className="py-3.5 px-4">Club Adviser</th>
                <th className="py-3.5 px-4">Date Held</th>
                <th className="py-3.5 px-4 text-right">Turnout (Actual / Est.)</th>
                <th className="py-3.5 px-4 text-center">Rating</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400 font-medium">
                    No Post-Activity Reports match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#003B73] whitespace-nowrap">
                      {row.parCode}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{row.activityName}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Photos: {row.documentationStatus?.photosCount || 0}
                        {row.documentationStatus?.hasEvaluation ? ' · Eval Attached' : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800">{row.organizer}</td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700">
                      {row.adviserName || 'SAS Office'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800">{row.dateHeld}</td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="font-extrabold text-gray-900">
                        {(row.actualTurnout || 0).toLocaleString()} /{' '}
                        {(row.targetTurnout || 0).toLocaleString()}
                      </div>
                      <div className="text-[11px] font-bold text-purple-700">
                        {row.turnoutPercent || 0}% turnout
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-amber-600 whitespace-nowrap">
                      ⭐ {Number(row.rating || 0).toFixed(1)}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">{statusBadge(row.status)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => onSelectPAR(row)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#003B73] bg-blue-50 hover:bg-[#003B73] hover:text-white transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
};
