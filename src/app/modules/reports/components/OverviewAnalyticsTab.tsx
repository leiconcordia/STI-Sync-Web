import React, { useState, useMemo } from 'react';
import {
  FileText,
  Wallet,
  ClipboardCheck,
  Building2,
  CheckCircle2,
  Users,
  Trophy,
  Download,
  FileSpreadsheet,
  Eye,
  Filter,
  Award,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { OverviewAnalyticsSummary } from '../types/report.types';
import { TablePagination, usePagination } from '../../../components/ui/table-pagination';

interface OverviewAnalyticsTabProps {
  summary: OverviewAnalyticsSummary;
  onNavigateTab: (tab: string) => void;
  onFilterOrg?: (orgId: string) => void;
  onSelectEvent?: (eventId: string) => void;
  onExportMasterCSV?: () => void;
  onExportMasterModal?: () => void;
}

type LeaderboardMetric =
  | 'overallScore'
  | 'completedActivities'
  | 'totalAttendees'
  | 'liquidationComplianceRate';

const BAR_COLORS = [
  '#003B73',
  '#0369a1',
  '#0284c7',
  '#0d9488',
  '#10b981',
  '#6366f1',
  '#8b5cf6',
  '#f59e0b',
];

export const OverviewAnalyticsTab: React.FC<OverviewAnalyticsTabProps> = ({
  summary,
  onNavigateTab,
  onFilterOrg,
  onSelectEvent,
  onExportMasterCSV,
  onExportMasterModal,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<LeaderboardMetric>('overallScore');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('ALL');

  const formatPHP = (val?: number | null) =>
    `₱${(Number(val) || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Sort Top Performing Orgs based on selected metric
  const sortedOrgs = useMemo(() => {
    const list = [...(summary?.topPerformingOrgs || [])];
    list.sort((a, b) => {
      if (selectedMetric === 'completedActivities') {
        return (b.completedActivities || 0) - (a.completedActivities || 0) || (b.overallScore || 0) - (a.overallScore || 0);
      }
      if (selectedMetric === 'totalAttendees') {
        return (b.totalAttendees || 0) - (a.totalAttendees || 0) || (b.overallScore || 0) - (a.overallScore || 0);
      }
      if (selectedMetric === 'liquidationComplianceRate') {
        return (
          (b.liquidationComplianceRate || 0) - (a.liquidationComplianceRate || 0) ||
          (b.overallScore || 0) - (a.overallScore || 0)
        );
      }
      return (b.overallScore || 0) - (a.overallScore || 0);
    });
    return list;
  }, [summary?.topPerformingOrgs, selectedMetric]);

  const topChartData = useMemo(() => {
    return sortedOrgs.slice(0, 8).map((org, idx) => ({
      ...org,
      shortName:
        org.acronym || (org.name && org.name.length > 18 ? `${org.name.slice(0, 16)}…` : org.name || 'Org'),
      metricValue:
        selectedMetric === 'completedActivities'
          ? org.completedActivities || 0
          : selectedMetric === 'totalAttendees'
          ? org.totalAttendees || 0
          : selectedMetric === 'liquidationComplianceRate'
          ? org.liquidationComplianceRate || 0
          : org.overallScore || 0,
      rank: idx + 1,
    }));
  }, [sortedOrgs, selectedMetric]);

  const metricLabelMap: Record<LeaderboardMetric, { label: string; unit: string; desc: string }> = {
    overallScore: {
      label: 'Overall Performance Score (0–100)',
      unit: 'pts',
      desc: 'Weighted composite: 30% Activity Execution · 25% Student Turnout · 25% FL Compliance · 20% PAR Compliance',
    },
    completedActivities: {
      label: 'Completed & Approved Activities',
      unit: 'events',
      desc: 'Total institutional activities with approved Activity Proposals / PARs',
    },
    totalAttendees: {
      label: 'Verified Student Turnout',
      unit: 'students',
      desc: 'Total verified student attendance across Post-Activity Reports and events',
    },
    liquidationComplianceRate: {
      label: 'Financial & PAR Compliance Rate',
      unit: '%',
      desc: 'Percentage of approved activities with settled Financial Liquidations',
    },
  };

  const masterRows = summary?.masterLedgerRows || [];

  const filteredMasterLedger = useMemo(() => {
    if (lifecycleFilter === 'ALL') return masterRows;
    return masterRows.filter((r) => r.lifecycleStage === lifecycleFilter);
  }, [masterRows, lifecycleFilter]);

  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedItems,
    setCurrentPage,
    setPageSize,
    totalItems,
  } = usePagination(filteredMasterLedger, 10);

  const lifecycleBadge = (stage: string) => {
    if (stage.includes('Fully Cleared')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (stage.includes('Post-Activity Clearance')) {
      return 'bg-teal-50 text-teal-700 border-teal-200';
    }
    if (stage.includes('Approved for Execution') || stage.includes('Event Concluded')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (stage === 'Cancelled') {
      return 'bg-gray-100 text-gray-600 border-gray-300';
    }
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const kpis = summary?.kpis || {
    totalProposals: 0,
    approvedFunding: 0,
    totalDisbursed: 0,
    totalSpent: 0,
    activitiesConducted: 0,
    totalAttendees: 0,
    recognizedClubs: 0,
    activeOfficers: 0,
    totalAdvisers: 0,
  };

  return (
    <div className="space-y-6">
      {/* Executive KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AP Card */}
        <div
          onClick={() => onNavigateTab('ap')}
          className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-[#003B73]/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
              Activity Proposals (AP)
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#003B73] flex items-center justify-center group-hover:bg-[#003B73] group-hover:text-white transition-colors">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 mb-1">
            {(kpis.totalProposals || 0).toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mt-3 pt-3 border-t border-gray-100">
            <span className="flex items-center gap-1 text-emerald-600 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approved Funding:
            </span>
            <span className="font-bold text-gray-800">{formatPHP(kpis.approvedFunding)}</span>
          </div>
        </div>

        {/* FL Card */}
        <div
          onClick={() => onNavigateTab('fl')}
          className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-emerald-500/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
              Financial Liquidations (FL)
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 mb-1 truncate">
            {formatPHP(kpis.totalSpent)}
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mt-3 pt-3 border-t border-gray-100">
            <span>Disbursed: {formatPHP(kpis.totalDisbursed)}</span>
            <span className="text-emerald-600 font-bold">Liquidated</span>
          </div>
        </div>

        {/* PAR Card */}
        <div
          onClick={() => onNavigateTab('par')}
          className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-purple-500/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
              Post-Activity Reports (PAR)
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 mb-1">
            {(kpis.activitiesConducted || 0).toLocaleString()} Events
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mt-3 pt-3 border-t border-gray-100">
            <span>Verified Student Turnout:</span>
            <span className="text-purple-700 font-bold">
              {(kpis.totalAttendees || 0).toLocaleString()} Attendees
            </span>
          </div>
        </div>

        {/* Clubs & Advisers Card */}
        <div
          onClick={() => onNavigateTab('clubs')}
          className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-amber-500/30 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
              Orgs, Advisers & Officers
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 mb-1">
            {(kpis.recognizedClubs || 0).toLocaleString()} Orgs
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mt-3 pt-3 border-t border-gray-100">
            <span className="flex items-center gap-1 text-[#003B73] font-bold">
              <Award className="w-3.5 h-3.5" /> {(kpis.totalAdvisers || 0).toLocaleString()} Advisers
            </span>
            <span className="flex items-center gap-1 text-amber-700 font-bold">
              <Users className="w-3.5 h-3.5" /> {(kpis.activeOfficers || 0).toLocaleString()} Officers
            </span>
          </div>
        </div>
      </div>

      {/* Top Performing Organizations Chart + Leaderboard */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Trophy className="w-4 h-4" />
              </div>
              <h3 className="text-base font-extrabold text-gray-900">
                Top Performing Organizations Leaderboard
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#003B73] border border-blue-200">
                Click any organization to filter all reports
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{metricLabelMap[selectedMetric].desc}</p>
          </div>

          {/* Metric Selector Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
            {(
              [
                { id: 'overallScore', label: 'Overall Score (0–100)' },
                { id: 'completedActivities', label: 'Approved Activities' },
                { id: 'totalAttendees', label: 'Student Turnout' },
                { id: 'liquidationComplianceRate', label: 'Compliance %' },
              ] as { id: LeaderboardMetric; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMetric(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedMetric === m.id
                    ? 'bg-[#003B73] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {topChartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-gray-400 font-medium">
            No organization activity records match the active filter criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Horizontal Bar Chart (6 cols) */}
            <div className="lg:col-span-6 h-80 bg-slate-50/60 rounded-xl border border-gray-100 p-4">
              <div className="text-xs font-bold text-gray-600 mb-2 flex items-center justify-between">
                <span>{metricLabelMap[selectedMetric].label}</span>
                <span className="text-[11px] text-gray-400">Top {topChartData.length} Organizations</span>
              </div>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart
                  data={topChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 28, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    domain={
                      selectedMetric === 'overallScore' || selectedMetric === 'liquidationComplianceRate'
                        ? [0, 100]
                        : [0, 'auto']
                    }
                  />
                  <YAxis
                    dataKey="shortName"
                    type="category"
                    width={115}
                    tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 700 }}
                  />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const org = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs space-y-1.5 min-w-[230px]">
                          <div className="font-extrabold text-[#003B73] text-sm">
                            #{org.rank} {org.name}
                          </div>
                          <div className="text-gray-500 font-medium">
                            Adviser: <span className="text-gray-800 font-bold">{org.adviserName}</span>
                          </div>
                          <div className="pt-1.5 border-t border-gray-100 grid grid-cols-2 gap-1.5">
                            <div>
                              <span className="text-gray-400 block text-[10px]">Overall Score</span>
                              <span className="font-black text-[#003B73]">{org.overallScore} / 100</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px]">Approved APs</span>
                              <span className="font-bold text-gray-800">
                                {org.completedActivities} / {org.totalProposals}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px]">FL & PAR Compliance</span>
                              <span className="font-bold text-emerald-700">
                                {org.liquidationComplianceRate}% FL · {org.parComplianceRate}% PAR
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px]">Verified Turnout</span>
                              <span className="font-bold text-purple-700">
                                {(org.totalAttendees || 0).toLocaleString()} students
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="metricValue"
                    radius={[0, 6, 6, 0]}
                    barSize={22}
                    onClick={(data) => {
                      if (data && data.orgId && onFilterOrg) {
                        onFilterOrg(data.orgId);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    {topChartData.map((entry, idx) => (
                      <Cell key={entry.orgId} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Compact Leaderboard Scorecard Table (6 cols) */}
            <div className="lg:col-span-6 overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-2.5 px-3">Rank & Organization</th>
                    <th className="py-2.5 px-3">Club Adviser</th>
                    <th className="py-2.5 px-2.5 text-center">Events / Compliance</th>
                    <th className="py-2.5 px-2.5 text-right">Turnout</th>
                    <th className="py-2.5 px-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {sortedOrgs.slice(0, 6).map((org, index) => (
                    <tr
                      key={org.orgId}
                      onClick={() => onFilterOrg && onFilterOrg(org.orgId)}
                      className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                      title="Click to filter reports by this organization"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                              index === 0
                                ? 'bg-amber-400 text-amber-950'
                                : index === 1
                                ? 'bg-slate-300 text-slate-900'
                                : index === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <div>
                            <div className="font-bold text-gray-900 line-clamp-1">{org.name}</div>
                            <div className="text-[10px] text-[#003B73] font-bold">{org.acronym}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-700">{org.adviserName}</td>
                      <td className="py-2.5 px-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 font-bold text-[11px]">
                          {org.completedActivities} acts · {org.liquidationComplianceRate}% FL
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-semibold text-gray-700">
                        {(org.totalAttendees || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-[#003B73]/10 text-[#003B73]">
                          <TrendingUp className="w-3 h-3" />
                          {org.overallScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Master Unified System Activity Ledger (All AP + FL + PAR + Org + Adviser in One Table) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-gray-900">
                Master Unified System Activity Ledger (AP · FL · PAR)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#003B73]/10 text-[#003B73]">
                {filteredMasterLedger.length} Activities
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete end-to-end audit trail joining every Activity Proposal, Club Adviser, Financial Liquidation, and Post-Activity Report.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Lifecycle Stage Quick Filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={lifecycleFilter}
                onChange={(e) => setLifecycleFilter(e.target.value)}
                className="text-xs font-bold text-gray-700 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Lifecycle Stages ({masterRows.length})</option>
                <option value="5. Fully Cleared & Concluded">5. Fully Cleared & Concluded</option>
                <option value="4. Post-Activity Clearance (FL / PAR)">
                  4. Post-Activity Clearance (FL / PAR)
                </option>
                <option value="3. Event Concluded (Awaiting Reports)">
                  3. Event Concluded (Awaiting Reports)
                </option>
                <option value="2. Approved for Execution">2. Approved for Execution</option>
                <option value="1. Proposal Review">1. Proposal Review</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {onExportMasterCSV && (
              <button
                onClick={onExportMasterCSV}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Master CSV
              </button>
            )}

            {onExportMasterModal && (
              <button
                onClick={onExportMasterModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#003B73] text-white hover:bg-[#002855] transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Export PDF / CSV
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                <th className="py-3.5 px-4">Activity Title & Date</th>
                <th className="py-3.5 px-4">Organization</th>
                <th className="py-3.5 px-4">Club Adviser</th>
                <th className="py-3.5 px-4">1. Activity Proposal (AP)</th>
                <th className="py-3.5 px-4">2. Financial Liquidation (FL)</th>
                <th className="py-3.5 px-4">3. Post-Activity Report (PAR)</th>
                <th className="py-3.5 px-4">Lifecycle Stage</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                    No system activities match the current filter selection.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{row.eventTitle}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{row.eventDate}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-gray-800">{row.organization}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700">{row.adviserName}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{row.apStatus}</div>
                      <div className="text-[11px] text-gray-500">
                        {row.apRef} · {formatPHP(row.approvedBudget)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div
                        className={`font-bold ${
                          row.flStatus === 'APPROVED' || row.flStatus === 'EXEMPT'
                            ? 'text-emerald-700'
                            : row.flStatus === 'PENDING'
                            ? 'text-gray-400'
                            : 'text-amber-700'
                        }`}
                      >
                        {row.flStatus}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {row.flRef} · Spend: {formatPHP(row.actualSpent)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div
                        className={`font-bold ${
                          row.parStatus === 'APPROVED'
                            ? 'text-emerald-700'
                            : row.parStatus === 'PENDING'
                            ? 'text-gray-400'
                            : 'text-amber-700'
                        }`}
                      >
                        {row.parStatus}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {row.parRef} · {(row.actualAttendees || 0).toLocaleString()} attendees
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${lifecycleBadge(
                          row.lifecycleStage
                        )}`}
                      >
                        {row.lifecycleStage}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {onSelectEvent && (
                        <button
                          onClick={() => onSelectEvent(row.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#003B73] bg-blue-50 hover:bg-[#003B73] hover:text-white transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      )}
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
