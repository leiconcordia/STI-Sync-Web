import React from 'react';
import {
  FileText,
  CheckCircle2,
  Clock,
  RotateCcw,
  Wallet,
  Eye,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { APAnalyticsSummary, APReportRow } from '../types/report.types';
import { TablePagination, usePagination } from '../../../components/ui/table-pagination';

interface ActivityProposalsTabProps {
  summary: APAnalyticsSummary;
  onSelectProposal: (row: APReportRow) => void;
  onExport: () => void;
  onExportCSV?: () => void;
}

export const ActivityProposalsTab: React.FC<ActivityProposalsTabProps> = ({
  summary,
  onSelectProposal,
  onExport,
  onExportCSV,
}) => {
  const rows = summary?.rows || [];
  const kpis = summary?.kpis || {
    totalProposalsSubmitted: 0,
    approvalRate: 0,
    averageLeadTimeDays: 0,
    totalProposedBudget: 0,
    totalApprovedBudget: 0,
    pendingRevisionCount: 0,
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

  const formatPHP = (val?: number | null) =>
    `₱${(Number(val) || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const statusBadge = (status: string) => {
    const lower = (status || '').toLowerCase();
    if (lower === 'approved' || lower === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> {status.toUpperCase()}
        </span>
      );
    }
    if (lower === 'pending' || lower === 'in_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" /> UNDER REVIEW
        </span>
      );
    }
    if (lower === 'returned') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
          <RotateCcw className="w-3 h-3" /> RETURNED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
        {(status || 'PENDING').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase mb-1">
            <span>Total Proposals</span>
            <FileText className="w-4 h-4 text-[#003B73]" />
          </div>
          <div className="text-2xl font-black text-gray-900">
            {(kpis.totalProposalsSubmitted || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">Matching current filter</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-600 uppercase mb-1">
            <span>Approval Rate</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{kpis.approvalRate || 0}%</div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Avg Lead Time: {kpis.averageLeadTimeDays || 0} days
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-amber-600 uppercase mb-1">
            <span>Pending / Revision</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-amber-700">
            {(kpis.pendingRevisionCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">In signatory pipeline</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-blue-600 uppercase mb-1">
            <span>Proposed Budget</span>
            <Wallet className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-gray-900 truncate">
            {formatPHP(kpis.totalProposedBudget)}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">Total requested</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs font-bold text-[#003B73] uppercase mb-1">
            <span>Approved Budget</span>
            <Wallet className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-[#003B73] truncate">
            {formatPHP(kpis.totalApprovedBudget)}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1 truncate">
            Authorized allocation
          </div>
        </div>
      </div>

      {/* Detailed Ledger Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-gray-900">
                Activity Proposals Master Ledger (AP-01)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#003B73]/10 text-[#003B73]">
                {rows.length} Proposals
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete list of submitted Activity Proposals, assigned Club Advisers, requested budgets, and signatory pipeline progress.
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
                <th className="py-3.5 px-4">Ref Code</th>
                <th className="py-3.5 px-4">Activity Title</th>
                <th className="py-3.5 px-4">Organization</th>
                <th className="py-3.5 px-4">Club Adviser</th>
                <th className="py-3.5 px-4">Event Date & Venue</th>
                <th className="py-3.5 px-4 text-right">Proposed / Approved</th>
                <th className="py-3.5 px-4">Pipeline Stage</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400 font-medium">
                    No Activity Proposals match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#003B73] whitespace-nowrap">
                      {row.referenceNo}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{row.title}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Submitted: {row.submissionDate}
                        {row.fundingSource ? ` · ${row.fundingSource}` : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800">{row.organizer}</td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700">
                      {row.adviserName || 'SAS Office'}
                    </td>
                    <td className="py-3.5 px-4 text-gray-700 font-medium">{row.targetDateVenue}</td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="font-extrabold text-gray-900">
                        {formatPHP(row.proposedBudget)}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-semibold">
                        Appr: {formatPHP(row.approvedBudget)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-gray-700 font-semibold">{row.stage}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {statusBadge(row.signatoryStatus)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => onSelectProposal(row)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#003B73] bg-blue-50 hover:bg-[#003B73] hover:text-white transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
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
