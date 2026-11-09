import React, { useState } from 'react';
import {
  Receipt,
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Download,
  Eye,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { TablePagination } from '../../../components/common/TablePagination';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { FLAnalyticsSummary, FLReportRow } from '../types/report.types';
import type { LiquidationDocument } from '../../finance/types/liquidation.types';
import { formatCurrency } from '../../../utils/currency';

interface FinancialLiquidationsTabProps {
  summary: FLAnalyticsSummary;
  onInspectLiquidation: (liq: LiquidationDocument) => void;
  onExport: () => void;
}

const ITEMS_PER_PAGE = 8;
const DONUT_COLORS = ['#001A4D', '#0E4EBD', '#22C55E', '#FFD41C', '#8B5CF6'];

export const FinancialLiquidationsTab: React.FC<FinancialLiquidationsTabProps> = ({
  summary,
  onInspectLiquidation,
  onExport,
}) => {
  const { kpis, charts, rows } = summary;
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'returned'>('all');

  const filteredRows = rows.filter((r) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'approved') return r.auditStatus === 'approved';
    if (statusFilter === 'returned') return r.auditStatus === 'returned';
    if (statusFilter === 'pending') {
      return (
        r.auditStatus === 'pending' ||
        r.auditStatus === 'under_review' ||
        r.auditStatus === 'draft'
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6">
      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Disbursed Advances</span>
            <DollarSign className="w-4 h-4 text-[#0E4EBD]" />
          </div>
          <h3 className="text-xl font-black text-[#001A4D]">{formatCurrency(kpis.totalDisbursedAdvances)}</h3>
          <p className="text-[11px] text-gray-400 mt-1">Cash released to clubs</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Liquidated Expenses</span>
            <Receipt className="w-4 h-4 text-purple-600" />
          </div>
          <h3 className="text-xl font-black text-purple-600">{formatCurrency(kpis.totalLiquidatedExpenses)}</h3>
          <p className="text-[11px] text-purple-700 font-semibold mt-1">Verified with receipts</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Surplus Returned</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <h3 className="text-xl font-black text-emerald-600">{formatCurrency(kpis.surplusReturned)}</h3>
          <p className="text-[11px] text-emerald-700 font-medium mt-1">Unspent balance surrendered</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Budget Variance</span>
            <TrendingDown className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-xl font-black text-[#001A4D]">
            {kpis.budgetVarianceRate > 0 ? `+${kpis.budgetVarianceRate}%` : `${kpis.budgetVarianceRate}%`}
          </h3>
          <p className="text-[11px] text-blue-600 font-semibold mt-1">Spend vs Disbursed</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Overdue Aging (7d+)</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-2xl font-black text-amber-600">{kpis.unliquidatedAgingCount}</h3>
          <p className="text-[11px] text-amber-700 font-medium mt-1">Awaiting liquidation submission</p>
        </div>
      </div>

      {/* ── Visual Analytics: Spend vs Allocation & Category Breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Disbursed vs Actual Spend per Club */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Disbursed vs Actual Spend per Club</span>
              <span className="text-xs font-normal text-gray-500">Clustered Comparison</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.disbursedVsActual}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="org" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip formatter={(val: number) => `₱${val.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="allocated" fill="#001A4D" name="Disbursed Advance (₱)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" fill="#22C55E" name="Actual Liquidated (₱)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expense Categories Breakdown */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Audited Expense Categories</span>
              <span className="text-xs font-normal text-gray-500">By Expenditure Type</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={charts.expenseCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="amount"
                  nameKey="category"
                >
                  {charts.expenseCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => `₱${val.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Sub-Directory Table & Export ── */}
      <Card className="border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-base text-[#001A4D]">Financial Liquidations (FL) Ledger</h3>
            <p className="text-xs text-gray-500">
              Showing {filteredRows.length} official Form LF-01 liquidation records
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#001A4D]"
            >
              <option value="all">All Audit Statuses</option>
              <option value="approved">Approved & Cleared</option>
              <option value="pending">Under Verification</option>
              <option value="returned">Returned for Rectification</option>
            </select>

            <Button
              onClick={onExport}
              className="bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Liquidation Ledger
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#001A4D] text-white font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Liquidation ID</th>
                <th className="px-4 py-3 whitespace-nowrap">Activity Title</th>
                <th className="px-4 py-3 whitespace-nowrap">Club / Org</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Disbursed Advance</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Actual Expense</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Surplus / (Deficit)</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">OR & Files</th>
                <th className="px-4 py-3 whitespace-nowrap">Audit Status</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedRows.map((row) => {
                const isApproved = row.auditStatus === 'approved';
                const isReturned = row.auditStatus === 'returned';
                const isSurplus = row.surplusDeficit >= 0;

                return (
                  <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-[#0E4EBD] whitespace-nowrap">
                      {row.liquidationId}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 max-w-xs truncate">
                      {row.eventTitle}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-medium">
                      {row.organization}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">
                      {formatCurrency(row.disbursedAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-purple-600 whitespace-nowrap">
                      {formatCurrency(row.totalActualExpense)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                      <span className={isSurplus ? 'text-emerald-600' : 'text-red-600'}>
                        {isSurplus ? `+${formatCurrency(row.surplusDeficit)}` : `(${formatCurrency(Math.abs(row.surplusDeficit))})`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-bold text-[10px]">
                        <Receipt className="w-3 h-3 text-[#0E4EBD]" />
                        {row.orCount} ORs ({row.attachmentsCount} files)
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isApproved
                            ? 'bg-green-100 text-green-700'
                            : isReturned
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isApproved ? 'Audited & Cleared' : isReturned ? 'Returned' : 'In Review'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => onInspectLiquidation(row.rawLiquidation)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0E4EBD] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Inspect Form LF-01 & Receipts"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}

              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    No financial liquidations found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
          itemName="liquidations"
        />
      </Card>
    </div>
  );
};

