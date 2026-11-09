import React, { useState } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Download,
  Eye,
  Filter,
  DollarSign,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { TablePagination } from '../../../components/common/TablePagination';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { APAnalyticsSummary, APReportRow } from '../types/report.types';
import type { EventDocument } from '../../events/types/event.types';
import { formatCurrency } from '../../../utils/currency';

interface ActivityProposalsTabProps {
  summary: APAnalyticsSummary;
  onSelectEvent: (event: EventDocument) => void;
  onExport: () => void;
}

const ITEMS_PER_PAGE = 8;

export const ActivityProposalsTab: React.FC<ActivityProposalsTabProps> = ({
  summary,
  onSelectEvent,
  onExport,
}) => {
  const { kpis, charts, rows } = summary;
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'returned'>('all');

  // Filter rows by local status dropdown
  const filteredRows = rows.filter((r) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'approved') return r.signatoryStatus === 'approved' || r.signatoryStatus === 'completed';
    if (statusFilter === 'returned') return r.signatoryStatus === 'returned';
    if (statusFilter === 'pending') {
      return (
        r.signatoryStatus === 'pending' ||
        r.signatoryStatus === 'pending_review' ||
        r.signatoryStatus === 'draft'
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
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Submitted</span>
            <FileText className="w-4 h-4 text-[#0E4EBD]" />
          </div>
          <h3 className="text-2xl font-black text-[#001A4D]">{kpis.totalProposalsSubmitted}</h3>
          <p className="text-[11px] text-gray-400 mt-1">Form AP-01 Submissions</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Approval Rate</span>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <h3 className="text-2xl font-black text-[#001A4D]">{kpis.approvalRate}%</h3>
          <p className="text-[11px] text-green-600 font-semibold mt-1">
            ~{kpis.averageLeadTimeDays} days avg. lead time
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Proposed Budget</span>
            <DollarSign className="w-4 h-4 text-purple-600" />
          </div>
          <h3 className="text-xl font-black text-[#001A4D]">{formatCurrency(kpis.totalProposedBudget)}</h3>
          <p className="text-[11px] text-gray-400 mt-1">Initial funding requested</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Approved Budget</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <h3 className="text-xl font-black text-emerald-600">{formatCurrency(kpis.totalApprovedBudget)}</h3>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">Officially endorsed funds</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">In Review / Revisions</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-2xl font-black text-amber-600">{kpis.pendingRevisionCount}</h3>
          <p className="text-[11px] text-amber-700 font-medium mt-1">Pending approval pipeline</p>
        </div>
      </div>

      {/* ── Visual Analytics: Monthly Volume & Stage Funnel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Submission vs Approval Volume */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Monthly Proposal Volume</span>
              <span className="text-xs font-normal text-gray-500">Submitted vs Approved</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.monthlyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="month" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="submitted" fill="#001A4D" name="Proposals Submitted" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approved" fill="#22C55E" name="Final Approved" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Approval Stage Funnel */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Approval Stage Funnel</span>
              <span className="text-xs font-normal text-gray-500">Pipeline Distribution</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.approvalFunnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" stroke="#94A3B8" fontSize={11} />
                <YAxis dataKey="stage" type="category" width={140} stroke="#475569" fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="#0E4EBD" name="Proposals Reached" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Sub-Directory Table & Export ── */}
      <Card className="border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-base text-[#001A4D]">Activity Proposals Master Log</h3>
            <p className="text-xs text-gray-500">
              Showing {filteredRows.length} activity proposals matching current filters
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#001A4D]"
            >
              <option value="all">All Approval States</option>
              <option value="approved">Approved & Completed</option>
              <option value="pending">In Review / Pending</option>
              <option value="returned">Returned for Revision</option>
            </select>

            {/* Export Summary Button */}
            <Button
              onClick={onExport}
              className="bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export AP Summary
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#001A4D] text-white font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Ref #</th>
                <th className="px-4 py-3 whitespace-nowrap">Activity Title</th>
                <th className="px-4 py-3 whitespace-nowrap">Organizer / Club</th>
                <th className="px-4 py-3 whitespace-nowrap">Target Date & Venue</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Proposed</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Approved</th>
                <th className="px-4 py-3 whitespace-nowrap">Stage / Status</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedRows.map((row) => {
                const isApproved = row.signatoryStatus === 'approved' || row.signatoryStatus === 'completed';
                const isReturned = row.signatoryStatus === 'returned';

                return (
                  <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-[#0E4EBD] whitespace-nowrap">
                      {row.referenceNo}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 max-w-xs truncate">
                      {row.title}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-medium">
                      {row.organizer}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {row.targetDateVenue}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">
                      {formatCurrency(row.proposedBudget)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                      {row.approvedBudget > 0 ? formatCurrency(row.approvedBudget) : '—'}
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
                        {row.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => onSelectEvent(row.rawEvent)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0E4EBD] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="View Full AP Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </button>
                    </td>
                  </tr>
                );
              })}

              {paginatedRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    No activity proposals found matching the selected filters.
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
          itemName="proposals"
        />
      </Card>
    </div>
  );
};

