import React from 'react';
import {
  Wallet,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  Eye,
  Download,
  FileSpreadsheet,
  Receipt,
} from 'lucide-react';
import { FLAnalyticsSummary, FLReportRow } from '../types/report.types';
import { TablePagination, usePagination } from '../../../components/ui/table-pagination';

interface FinancialLiquidationsTabProps {
  summary: FLAnalyticsSummary;
  onSelectLiquidation: (row: FLReportRow) => void;
  onExport: () => void;
  onExportCSV?: () => void;
}

export const FinancialLiquidationsTab: React.FC<FinancialLiquidationsTabProps> = ({
  summary,
  onSelectLiquidation,
  onExport,
  onExportCSV,
}) => {
  const rows = summary?.rows || [];
  const kpis = summary?.kpis || {
    totalDisbursedAdvances: 0,
    totalLiquidatedExpenses: 0,
    surplusReturned: 0,
    budgetVarianceRate: 0,
    unliquidatedAgingCount: 0,
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
    if (lower === 'approved' || lower === 'completed' || lower === 'liquidated') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> LIQUIDATED
        </span>
      );
    }
    if (lower === 'pending' || lower === 'under_review' || lower === 'submitted') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" /> UNDER AUDIT
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
      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase mb-1">
            <span>Disbursed Advances</span>
            <Wallet className="w-4 h-4 text-[#003B73]" />
          </div>
          <div className="text-xl font-black text-gray-900 truncate">
            {formatPHP(kpis.totalDisbursedAdvances)}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Across {rows.length} liquidation reports
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-600 uppercase mb-1">
            <span>Total Liquidated Spend</span>
            <Receipt className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-emerald-700 truncate">
            {formatPHP(kpis.totalLiquidatedExpenses)}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Variance Rate: {kpis.budgetVarianceRate || 0}%
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-blue-600 uppercase mb-1">
            <span>Surplus Returned</span>
            {(kpis.surplusReturned || 0) >= 0 ? (
              <TrendingDown className="w-4 h-4 text-emerald-600" />
            ) : (
              <TrendingUp className="w-4 h-4 text-red-600" />
            )}
          </div>
          <div className="text-xl font-black text-emerald-700 truncate">
            {formatPHP(kpis.surplusReturned)}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Unspent cash advances returned
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-amber-600 uppercase mb-1">
            <span>Aging Overdue (&gt;15d)</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-gray-900">
            {(kpis.unliquidatedAgingCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Concluded events awaiting clearance
          </div>
        </div>
      </div>

      {/* Detailed Ledger Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-gray-900">
                Financial Liquidation & Audit Ledger (LF-01)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {rows.length} Reports
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete financial accountability ledger showing disbursed budgets, actual expenses, variances, Club Advisers, and receipt counts.
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
                <th className="py-3.5 px-4 text-right">Disbursed</th>
                <th className="py-3.5 px-4 text-right">Actual Spend</th>
                <th className="py-3.5 px-4 text-right">Surplus / Deficit</th>
                <th className="py-3.5 px-4 text-center">Receipts</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400 font-medium">
                    No Financial Liquidation reports match the current filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#003B73] whitespace-nowrap">
                      {row.liquidationId}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{row.eventTitle}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {row.dateSubmitted || 'Submitted'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-800">{row.organization}</td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700">
                      {row.adviserName || 'SAS Office'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                      {formatPHP(row.disbursedAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-gray-900 whitespace-nowrap">
                      {formatPHP(row.totalActualExpense)}
                    </td>
                    <td
                      className={`py-3.5 px-4 text-right font-bold whitespace-nowrap ${
                        (row.surplusDeficit || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {(row.surplusDeficit || 0) >= 0 ? '+' : ''}
                      {formatPHP(row.surplusDeficit)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-700">
                      {row.orCount || 0} ORs ({row.attachmentsCount || 0} files)
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">{statusBadge(row.auditStatus)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => onSelectLiquidation(row)}
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
