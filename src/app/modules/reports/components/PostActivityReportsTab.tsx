import React, { useState } from 'react';
import {
  FileCheck2,
  Users,
  Target,
  Award,
  Star,
  Download,
  Eye,
  Camera,
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { PARAnalyticsSummary, PARReportRow } from '../types/report.types';
import type { PostActivityReportDocument } from '../../post-activity-reports/types/par.types';

interface PostActivityReportsTabProps {
  summary: PARAnalyticsSummary;
  onSelectPAR: (par: PostActivityReportDocument) => void;
  onExport: () => void;
}

const ITEMS_PER_PAGE = 8;

export const PostActivityReportsTab: React.FC<PostActivityReportsTabProps> = ({
  summary,
  onSelectPAR,
  onExport,
}) => {
  const { kpis, charts, rows } = summary;
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'under_review' | 'returned'>('all');

  const filteredRows = rows.filter((r) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'approved') return r.status === 'approved';
    if (statusFilter === 'returned') return r.status === 'returned';
    if (statusFilter === 'under_review') return r.status === 'under_review' || r.status === 'draft';
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
            <span className="text-[11px] font-bold uppercase tracking-wider">Conducted Events</span>
            <FileCheck2 className="w-4 h-4 text-green-600" />
          </div>
          <h3 className="text-2xl font-black text-[#001A4D]">{kpis.totalActivitiesConducted}</h3>
          <p className="text-[11px] text-gray-400 mt-1">Completed campus activities</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Turnout Accuracy</span>
            <Target className="w-4 h-4 text-[#0E4EBD]" />
          </div>
          <h3 className="text-2xl font-black text-[#0E4EBD]">{kpis.turnoutAccuracyRate}%</h3>
          <p className="text-[11px] text-blue-600 font-semibold mt-1">Actual vs Target attendees</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Attendees</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <h3 className="text-2xl font-black text-[#001A4D]">{kpis.totalUniqueStudentAttendees.toLocaleString()}</h3>
          <p className="text-[11px] text-purple-600 font-semibold mt-1">Verified check-in records</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">PAR Compliance</span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <h3 className="text-2xl font-black text-emerald-600">{kpis.parCompletionCompliance}%</h3>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">Submitted PAR documents</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Overall Rating</span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          </div>
          <h3 className="text-2xl font-black text-amber-600">{kpis.overallEventRating} / 5.0</h3>
          <p className="text-[11px] text-amber-700 font-semibold mt-1">Student feedback score</p>
        </div>
      </div>

      {/* ── Visual Analytics: Turnout vs Capacity & Engagement by Course ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Turnout vs Capacity */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Attendance Turnout vs Capacity</span>
              <span className="text-xs font-normal text-gray-500">Target vs Actual</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.turnoutVsCapacity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="eventTitle" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="target" fill="#94A3B8" name="Expected Target" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#22C55E" name="Actual Turnout" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Engagement by Academic Strand / Course */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Student Turnout by Strand / Course</span>
              <span className="text-xs font-normal text-gray-500">Participation Breakdown</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.engagementByStrandCourse}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="courseStrand" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="#0E4EBD" name="Student Attendees" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Sub-Directory Table & Export ── */}
      <Card className="border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-base text-[#001A4D]">Post-Activity Reports (PAR) Portfolio</h3>
            <p className="text-xs text-gray-500">
              Showing {filteredRows.length} post-activity reports with verified evidence & documentation
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
              <option value="all">All Approval States</option>
              <option value="approved">Approved & Finalized</option>
              <option value="under_review">Under Review</option>
              <option value="returned">Returned for Revisions</option>
            </select>

            <Button
              onClick={onExport}
              className="bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export PAR Portfolio
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#001A4D] text-white font-bold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">PAR Code</th>
                <th className="px-4 py-3 whitespace-nowrap">Activity Title</th>
                <th className="px-4 py-3 whitespace-nowrap">Date Held</th>
                <th className="px-4 py-3 whitespace-nowrap">Organizer</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">Target vs Actual</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">Turnout %</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">Evidence & Docs</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedRows.map((row) => {
                const isApproved = row.status === 'approved';
                const isReturned = row.status === 'returned';

                return (
                  <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-[#0E4EBD] whitespace-nowrap">
                      {row.parCode}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 max-w-xs truncate">
                      {row.activityName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {row.dateHeld}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-medium">
                      {row.organizer}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap font-medium">
                      <span className="text-gray-900 font-bold">{row.actualTurnout}</span>
                      <span className="text-gray-400"> / {row.targetTurnout}</span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="font-extrabold text-[#0E4EBD] bg-blue-50 px-2 py-0.5 rounded-md">
                        {row.turnoutPercent}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold">
                          <Camera className="w-3 h-3 text-[#0E4EBD]" />
                          {row.documentationStatus.photosCount} photos
                        </span>
                        {row.documentationStatus.hasEvaluation && (
                          <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-bold">
                            Evaluated
                          </span>
                        )}
                      </div>
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
                        {isApproved ? 'Approved' : isReturned ? 'Returned' : 'Under Review'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => onSelectPAR(row.rawPAR)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0E4EBD] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="View Full PAR Document"
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
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    No post-activity reports found matching the selected filters.
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
          itemName="reports"
        />
      </Card>
    </div>
  );
};

