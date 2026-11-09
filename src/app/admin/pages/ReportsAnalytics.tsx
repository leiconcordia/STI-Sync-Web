import React, { useState } from 'react';
import {
  BarChart3,
  FileText,
  Receipt,
  FileCheck2,
  Building2,
  Printer,
  Download,
  Sparkles,
  LayoutDashboard,
  Filter,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { UniversalReportFilterBar } from '../../modules/reports/components/UniversalReportFilterBar';
import { OverviewAnalyticsTab } from '../../modules/reports/components/OverviewAnalyticsTab';
import { ActivityProposalsTab } from '../../modules/reports/components/ActivityProposalsTab';
import { FinancialLiquidationsTab } from '../../modules/reports/components/FinancialLiquidationsTab';
import { PostActivityReportsTab } from '../../modules/reports/components/PostActivityReportsTab';
import { ClubsAndOfficersTab } from '../../modules/reports/components/ClubsAndOfficersTab';
import { ReportExportModal } from '../../modules/reports/components/ReportExportModal';

import EventProposalReview from '../components/EventProposalReview';
import { LiquidationExportPreviewModal } from '../../modules/finance/components/LiquidationExportPreviewModal';
import ReceiptLightboxModal from '../../modules/finance/components/ReceiptLightboxModal';
import PostActivityReportDetailModal from '../../modules/post-activity-reports/components/PostActivityReportDetailModal';
import { OrganizationDetailModal } from '../components/OrganizationDetailModal';

import { useReportsAnalyticsData } from '../../modules/reports/hooks/useReportsAnalyticsData';
import type {
  ReportTabId,
  GeneratedReportData,
} from '../../modules/reports/types/report.types';
import type { EventDocument } from '../../modules/events/types/event.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import type { OrganizationDocument } from '../../modules/organizations/types/organization.types';

import {
  generateAPSummaryReport,
  generateFLLedgerReport,
  generatePARPortfolioReport,
  generateOfficerMasterRosterReport,
  generateOrgDirectoryReport,
} from '../../modules/reports/services/report-generator.service';

export function ReportsAnalytics() {
  const {
    activeTab,
    setActiveTab,
    filterState,
    updateFilters,
    resetFilters,
    semesters,
    organizations,
    activePeriod,
    apSummary,
    flSummary,
    parSummary,
    rosterSummary,
    overviewSummary,
    loading,
  } = useReportsAnalyticsData();

  // Admin session
  const [session] = useState(() => {
    try {
      const raw = localStorage.getItem('sti_sync_admin_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const adminUid = session?.uid || 'sas_admin_user';
  const adminName = session?.name || 'Student Affairs & Services';

  // Preview & Drill-down Modal States
  const [inspectingEvent, setInspectingEvent] = useState<EventDocument | null>(null);
  const [inspectingLiquidation, setInspectingLiquidation] = useState<LiquidationDocument | null>(null);
  const [lightboxData, setLightboxData] = useState<{ url: string; title?: string; vendor?: string } | null>(null);
  const [inspectingPAR, setInspectingPAR] = useState<PostActivityReportDocument | null>(null);
  const [inspectingOrg, setInspectingOrg] = useState<OrganizationDocument | null>(null);

  // Unified PDF / CSV Export Preview Modal State
  const [exportReportData, setExportReportData] = useState<GeneratedReportData | null>(null);

  // Export handlers for each sub-directory
  const handleExportAP = () => {
    const report = generateAPSummaryReport(apSummary, filterState, adminName);
    setExportReportData(report);
  };

  const handleExportFL = () => {
    const report = generateFLLedgerReport(flSummary, filterState, adminName);
    setExportReportData(report);
  };

  const handleExportPAR = () => {
    const report = generatePARPortfolioReport(parSummary, filterState, adminName);
    setExportReportData(report);
  };

  const handleExportRoster = () => {
    const report = generateOfficerMasterRosterReport(rosterSummary, filterState, adminName);
    setExportReportData(report);
  };

  const handleOpenQuickReport = (type: 'ap' | 'fl' | 'par' | 'roster') => {
    switch (type) {
      case 'ap':
        handleExportAP();
        break;
      case 'fl':
        handleExportFL();
        break;
      case 'par':
        handleExportPAR();
        break;
      case 'roster':
        handleExportRoster();
        break;
    }
  };

  const tabs: Array<{ id: ReportTabId; label: string; icon: React.ElementType; badge?: number | string }> = [
    { id: 'OVERVIEW', label: 'Executive Overview', icon: LayoutDashboard },
    {
      id: 'ACTIVITY_PROPOSALS',
      label: 'Activity Proposals (AP)',
      icon: FileText,
      badge: apSummary.rows.length,
    },
    {
      id: 'FINANCIAL_LIQUIDATIONS',
      label: 'Financial Liquidations (FL)',
      icon: Receipt,
      badge: flSummary.rows.length,
    },
    {
      id: 'POST_ACTIVITY_REPORTS',
      label: 'Post-Activity Reports (PAR)',
      icon: FileCheck2,
      badge: parSummary.rows.length,
    },
    {
      id: 'CLUBS_AND_OFFICERS',
      label: 'Clubs & Officer Roster',
      icon: Building2,
      badge: rosterSummary.orgRows.length,
    },
  ];

  return (
    <div className="space-y-6 text-left">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#001A4D] tracking-tight">
            Reports & Operational Analytics
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm font-medium mt-0.5">
            Institutional intelligence, accreditation audits, financial liquidations, and leadership directories.
          </p>
        </div>

        {/* Global Print / Export Current Sub-directory Button */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              if (activeTab === 'ACTIVITY_PROPOSALS') handleExportAP();
              else if (activeTab === 'FINANCIAL_LIQUIDATIONS') handleExportFL();
              else if (activeTab === 'POST_ACTIVITY_REPORTS') handleExportPAR();
              else if (activeTab === 'CLUBS_AND_OFFICERS') handleExportRoster();
              else handleExportAP();
            }}
            className="bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Export Tab Report (PDF/CSV)
          </Button>
        </div>
      </div>

      {/* ── Universal Persistent Filter Bar ── */}
      <UniversalReportFilterBar
        filterState={filterState}
        onChange={updateFilters}
        onReset={resetFilters}
        semesters={semesters}
        organizations={organizations}
        activePeriod={activePeriod}
      />

      {/* ── 5 Sub-Directory Navigation Tabs ── */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto pb-1" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-3.5 border-b-2 font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'border-[#001A4D] text-[#001A4D]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#0E4EBD]' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 text-[10px] font-extrabold rounded-full ${
                      isActive
                        ? 'bg-[#001A4D] text-[#FFD41C]'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Active Tab Content ── */}
      <div>
        {activeTab === 'OVERVIEW' && (
          <OverviewAnalyticsTab
            summary={overviewSummary}
            onNavigateTab={setActiveTab}
            onOpenQuickReport={handleOpenQuickReport}
          />
        )}

        {activeTab === 'ACTIVITY_PROPOSALS' && (
          <ActivityProposalsTab
            summary={apSummary}
            onSelectEvent={setInspectingEvent}
            onExport={handleExportAP}
          />
        )}

        {activeTab === 'FINANCIAL_LIQUIDATIONS' && (
          <FinancialLiquidationsTab
            summary={flSummary}
            onInspectLiquidation={setInspectingLiquidation}
            onExport={handleExportFL}
          />
        )}

        {activeTab === 'POST_ACTIVITY_REPORTS' && (
          <PostActivityReportsTab
            summary={parSummary}
            onSelectPAR={setInspectingPAR}
            onExport={handleExportPAR}
          />
        )}

        {activeTab === 'CLUBS_AND_OFFICERS' && (
          <ClubsAndOfficersTab
            summary={rosterSummary}
            onViewOrgDetails={setInspectingOrg}
            onExportRoster={handleExportRoster}
          />
        )}
      </div>

      {/* ── Interactive Modal 1: Full AP Proposal Review ── */}
      {inspectingEvent && (
        <EventProposalReview
          event={inspectingEvent}
          onClose={() => setInspectingEvent(null)}
        />
      )}

      {/* ── Interactive Modal 2: Full Form LF-01 Liquidation Preview ── */}
      {inspectingLiquidation && (
        <LiquidationExportPreviewModal
          isOpen={Boolean(inspectingLiquidation)}
          onClose={() => setInspectingLiquidation(null)}
          report={inspectingLiquidation}
        />
      )}

      {/* ── Interactive Modal 3: Receipt Lightbox ── */}
      {lightboxData && (
        <ReceiptLightboxModal
          isOpen={Boolean(lightboxData)}
          onClose={() => setLightboxData(null)}
          imageUrl={lightboxData.url}
          itemTitle={lightboxData.title}
          vendorName={lightboxData.vendor}
        />
      )}

      {/* ── Interactive Modal 4: Full PAR Detail Review ── */}
      {inspectingPAR && (
        <PostActivityReportDetailModal
          isOpen={Boolean(inspectingPAR)}
          onClose={() => setInspectingPAR(null)}
          report={inspectingPAR}
          isSasAdmin={true}
          currentUserId={adminUid}
        />
      )}

      {/* ── Interactive Modal 5: Organization Hierarchy & Profile ── */}
      {inspectingOrg && (
        <OrganizationDetailModal
          isOpen={Boolean(inspectingOrg)}
          onClose={() => setInspectingOrg(null)}
          organization={inspectingOrg}
        />
      )}

      {/* ── Interactive Modal 6: Unified PDF & CSV Report Export Preview ── */}
      {exportReportData && (
        <ReportExportModal
          isOpen={Boolean(exportReportData)}
          onClose={() => setExportReportData(null)}
          report={exportReportData}
        />
      )}
    </div>
  );
}

export default ReportsAnalytics;
