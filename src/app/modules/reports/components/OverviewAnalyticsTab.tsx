import React from 'react';
import {
  FileText,
  CalendarCheck,
  Receipt,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import type { OverviewAnalyticsSummary, ReportTabId } from '../types/report.types';
import { formatCurrency } from '../../../utils/currency';

interface OverviewAnalyticsTabProps {
  summary: OverviewAnalyticsSummary;
  onNavigateTab: (tab: ReportTabId) => void;
  onOpenQuickReport?: (type: 'ap' | 'fl' | 'par' | 'roster') => void;
}

export const OverviewAnalyticsTab: React.FC<OverviewAnalyticsTabProps> = ({
  summary,
  onNavigateTab,
}) => {
  const { kpis } = summary;

  return (
    <div className="space-y-6">
      {/* ── 4 Executive KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AP Card */}
        <Card
          onClick={() => onNavigateTab('ACTIVITY_PROPOSALS')}
          className="border-gray-200 hover:border-[#0E4EBD] hover:shadow-md transition-all cursor-pointer group rounded-2xl"
        >
          <CardContent className="p-4.5 flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Activity Proposals</p>
              <h3 className="text-2xl font-black text-[#001A4D] mt-1">{kpis.totalProposals}</h3>
              <p className="text-xs text-green-600 font-semibold mt-1">
                {formatCurrency(kpis.approvedFunding)} approved
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#0E4EBD] group-hover:scale-105 transition-transform flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
          </CardContent>
          <div className="px-4.5 py-2 bg-gray-50/80 border-t border-gray-100 rounded-b-2xl flex items-center justify-between text-[11px] font-bold text-[#0E4EBD]">
            <span>View Sub-Directory</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Card>

        {/* FL Card */}
        <Card
          onClick={() => onNavigateTab('FINANCIAL_LIQUIDATIONS')}
          className="border-gray-200 hover:border-[#0E4EBD] hover:shadow-md transition-all cursor-pointer group rounded-2xl"
        >
          <CardContent className="p-4.5 flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Liquidated Funds</p>
              <h3 className="text-2xl font-black text-[#001A4D] mt-1">{formatCurrency(kpis.totalSpent)}</h3>
              <p className="text-xs text-blue-600 font-semibold mt-1">
                From {formatCurrency(kpis.totalDisbursed)} advance
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-105 transition-transform flex-shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
          </CardContent>
          <div className="px-4.5 py-2 bg-gray-50/80 border-t border-gray-100 rounded-b-2xl flex items-center justify-between text-[11px] font-bold text-purple-600">
            <span>View Ledger Audits</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Card>

        {/* PAR Card */}
        <Card
          onClick={() => onNavigateTab('POST_ACTIVITY_REPORTS')}
          className="border-gray-200 hover:border-[#0E4EBD] hover:shadow-md transition-all cursor-pointer group rounded-2xl"
        >
          <CardContent className="p-4.5 flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Conducted Events</p>
              <h3 className="text-2xl font-black text-[#001A4D] mt-1">{kpis.activitiesConducted}</h3>
              <p className="text-xs text-amber-600 font-semibold mt-1">
                {kpis.totalAttendees.toLocaleString()} student turnouts
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600 group-hover:scale-105 transition-transform flex-shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
          </CardContent>
          <div className="px-4.5 py-2 bg-gray-50/80 border-t border-gray-100 rounded-b-2xl flex items-center justify-between text-[11px] font-bold text-green-600">
            <span>View Accomplishments</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Card>

        {/* Clubs & Officers Card */}
        <Card
          onClick={() => onNavigateTab('CLUBS_AND_OFFICERS')}
          className="border-gray-200 hover:border-[#0E4EBD] hover:shadow-md transition-all cursor-pointer group rounded-2xl"
        >
          <CardContent className="p-4.5 flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Clubs & Officers</p>
              <h3 className="text-2xl font-black text-[#001A4D] mt-1">{kpis.recognizedClubs}</h3>
              <p className="text-xs text-[#0E4EBD] font-semibold mt-1">
                {kpis.activeOfficers} active leaders
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-105 transition-transform flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
          <div className="px-4.5 py-2 bg-gray-50/80 border-t border-gray-100 rounded-b-2xl flex items-center justify-between text-[11px] font-bold text-amber-700">
            <span>View Governance</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Card>
      </div>

      {/* ── Sub-Directory Navigation Quick Banners ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          {
            key: 'ACTIVITY_PROPOSALS' as ReportTabId,
            title: 'Activity Proposals (AP)',
            desc: 'Form AP-01 approvals, budgets, and lead time metrics.',
            color: 'border-l-4 border-l-[#0E4EBD] hover:bg-blue-50/40',
            badge: 'AP Engine',
          },
          {
            key: 'FINANCIAL_LIQUIDATIONS' as ReportTabId,
            title: 'Financial Liquidations (FL)',
            desc: 'Form LF-01 reconciliation, receipts, & disbursement balances.',
            color: 'border-l-4 border-l-purple-600 hover:bg-purple-50/40',
            badge: 'Audit Ledger',
          },
          {
            key: 'POST_ACTIVITY_REPORTS' as ReportTabId,
            title: 'Post-Activity Reports (PAR)',
            desc: 'Turnout accuracy, student ratings, and accomplishment portfolio.',
            color: 'border-l-4 border-l-green-600 hover:bg-green-50/40',
            badge: 'Compliance',
          },
          {
            key: 'CLUBS_AND_OFFICERS' as ReportTabId,
            title: 'Clubs & Officer Roster',
            desc: 'Accreditation scorecards, faculty advisers, & student leadership.',
            color: 'border-l-4 border-l-amber-600 hover:bg-amber-50/40',
            badge: 'Governance',
          },
        ].map((item) => (
          <div
            key={item.key}
            onClick={() => onNavigateTab(item.key)}
            className={`bg-white p-4 rounded-xl border border-gray-200 shadow-xs cursor-pointer transition-all ${item.color}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {item.badge}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <h4 className="font-bold text-sm text-[#001A4D]">{item.title}</h4>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

