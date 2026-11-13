import React, { useState } from 'react';
import {
  FileSpreadsheet,
  LayoutDashboard,
  FileText,
  Wallet,
  ClipboardCheck,
  Building2,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { useAdviserProfile } from '../../modules/auth/hooks/useAdviserProfile';
import { useReportsAnalyticsData } from '../../modules/reports/hooks/useReportsAnalyticsData';
import { UniversalReportFilterBar } from '../../modules/reports/components/UniversalReportFilterBar';
import { OverviewAnalyticsTab } from '../../modules/reports/components/OverviewAnalyticsTab';
import { ActivityProposalsTab } from '../../modules/reports/components/ActivityProposalsTab';
import { FinancialLiquidationsTab } from '../../modules/reports/components/FinancialLiquidationsTab';
import { PostActivityReportsTab } from '../../modules/reports/components/PostActivityReportsTab';
import { ClubsAndOfficersTab, ClubsSubView } from '../../modules/reports/components/ClubsAndOfficersTab';
import { ReportExportModal } from '../../modules/reports/components/ReportExportModal';
import {
  ReportDetailDrawer,
  ReportDrawerSelection,
} from '../../modules/reports/components/ReportDetailDrawer';
import {
  generateMasterSystemLedgerReport,
  generateAPSummaryReport,
  generateFLLedgerReport,
  generatePARPortfolioReport,
  generateOfficerMasterRosterReport,
  generateOrgDirectoryReport,
  generateClubAdvisersDirectoryReport,
} from '../../modules/reports/services/report-generator.service';
import { exportReportToCSV } from '../../modules/reports/utils/csv-report-builder';
import {
  GeneratedReportData,
  APReportRow,
  FLReportRow,
  PARReportRow,
  OrgDirectoryRow,
  OfficerRosterRow,
} from '../../modules/reports/types/report.types';

type ActiveReportTab = 'overview' | 'ap' | 'fl' | 'par' | 'clubs';

export const ReportsAnalytics: React.FC = () => {
  const { profile } = useAdviserProfile();
  const adminName = profile?.fullName || 'SAS Administrator';

  const {
    loading,
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
  } = useReportsAnalyticsData();

  const [activeTab, setActiveTab] = useState<ActiveReportTab>('overview');
  const [previewReport, setPreviewReport] = useState<GeneratedReportData | null>(null);
  const [drawerSelection, setDrawerSelection] = useState<ReportDrawerSelection>(null);

  const buildReportForTab = (tab: ActiveReportTab): GeneratedReportData => {
    switch (tab) {
      case 'overview':
        return generateMasterSystemLedgerReport(overviewSummary, filterState, adminName);
      case 'ap':
        return generateAPSummaryReport(apSummary, filterState, adminName);
      case 'fl':
        return generateFLLedgerReport(flSummary, filterState, adminName);
      case 'par':
        return generatePARPortfolioReport(parSummary, filterState, adminName);
      case 'clubs':
        return generateOrgDirectoryReport(rosterSummary, filterState, adminName);
    }
  };

  // Trigger PDF/CSV Preview Modal based on current tab
  const handleExportCurrentTab = () => {
    setPreviewReport(buildReportForTab(activeTab));
  };

  // Direct 1-click CSV download for current tab
  const handleQuickExportCSV = () => {
    exportReportToCSV(buildReportForTab(activeTab));
  };

  const handleExportClubsSubView = (subView: ClubsSubView) => {
    if (subView === 'orgs') {
      setPreviewReport(generateOrgDirectoryReport(rosterSummary, filterState, adminName));
    } else if (subView === 'advisers') {
      setPreviewReport(generateClubAdvisersDirectoryReport(rosterSummary, filterState, adminName));
    } else {
      setPreviewReport(generateOfficerMasterRosterReport(rosterSummary, filterState, adminName));
    }
  };

  const handleExportClubsSubViewCSV = (subView: ClubsSubView) => {
    if (subView === 'orgs') {
      exportReportToCSV(generateOrgDirectoryReport(rosterSummary, filterState, adminName));
    } else if (subView === 'advisers') {
      exportReportToCSV(generateClubAdvisersDirectoryReport(rosterSummary, filterState, adminName));
    } else {
      exportReportToCSV(generateOfficerMasterRosterReport(rosterSummary, filterState, adminName));
    }
  };

  const handleExportSingleRecord = (selection: ReportDrawerSelection) => {
    if (!selection) return;

    if (selection.type === 'ap') {
      const singleSummary = {
        ...apSummary,
        kpis: {
          ...apSummary.kpis,
          totalProposalsSubmitted: 1,
          totalProposedBudget: selection.data.proposedBudget || 0,
          totalApprovedBudget: selection.data.approvedBudget || 0,
        },
        rows: [selection.data],
      };
      setPreviewReport(generateAPSummaryReport(singleSummary, filterState, adminName));
    } else if (selection.type === 'fl') {
      const singleSummary = {
        ...flSummary,
        kpis: {
          ...flSummary.kpis,
          totalDisbursedAdvances: selection.data.disbursedAmount || 0,
          totalLiquidatedExpenses: selection.data.totalActualExpense || 0,
          surplusReturned: Math.max(0, selection.data.surplusDeficit || 0),
        },
        rows: [selection.data],
      };
      setPreviewReport(generateFLLedgerReport(singleSummary, filterState, adminName));
    } else if (selection.type === 'par') {
      const singleSummary = {
        ...parSummary,
        kpis: {
          ...parSummary.kpis,
          totalActivitiesConducted: 1,
          totalUniqueStudentAttendees: selection.data.actualTurnout || 0,
          overallEventRating: selection.data.rating || 0,
        },
        rows: [selection.data],
      };
      setPreviewReport(generatePARPortfolioReport(singleSummary, filterState, adminName));
    } else if (selection.type === 'org') {
      const singleSummary = {
        ...rosterSummary,
        orgRows: [selection.data],
      };
      setPreviewReport(generateOrgDirectoryReport(singleSummary, filterState, adminName));
    } else if (selection.type === 'officer') {
      const singleSummary = {
        ...rosterSummary,
        officerRows: [selection.data],
      };
      setPreviewReport(generateOfficerMasterRosterReport(singleSummary, filterState, adminName));
    }

    setDrawerSelection(null);
  };

  const handleSelectMasterEvent = (eventId: string) => {
    const apRow = (apSummary.rows || []).find((r) => r.id === eventId);
    if (apRow) {
      setDrawerSelection({ type: 'ap', data: apRow });
    }
  };

  const tabs: { id: ActiveReportTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'overview',
      label: 'System Ledger & Top Orgs',
      icon: <LayoutDashboard className="w-4 h-4" />,
      badge: overviewSummary.masterLedgerRows?.length || 0,
    },
    {
      id: 'ap',
      label: 'Activity Proposals (AP)',
      icon: <FileText className="w-4 h-4" />,
      badge: apSummary.rows?.length || 0,
    },
    {
      id: 'fl',
      label: 'Financial Liquidations (FL)',
      icon: <Wallet className="w-4 h-4" />,
      badge: flSummary.rows?.length || 0,
    },
    {
      id: 'par',
      label: 'Post-Activity Reports (PAR)',
      icon: <ClipboardCheck className="w-4 h-4" />,
      badge: parSummary.rows?.length || 0,
    },
    {
      id: 'clubs',
      label: 'Orgs, Advisers & Officers',
      icon: <Building2 className="w-4 h-4" />,
      badge: rosterSummary.orgRows?.length || 0,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-8 space-y-6">
      {/* Institutional Header */}
      <div className="bg-gradient-to-r from-[#003B73] via-[#002855] to-[#001F42] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-72 h-72 rounded-full bg-[#FFD100]/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[#FFD100] text-xs font-extrabold uppercase tracking-wider mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              Student Affairs & Services • Master Institutional Ledger & Reports
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              SAS Reports & System Ledger
            </h1>
            <p className="text-xs md:text-sm text-blue-100/90 mt-1.5 max-w-2xl leading-relaxed">
              Dynamically filter, audit, and export all Organizations, Club Advisers, Officers, Activity Proposals (AP), Financial Liquidations (FL), and Post-Activity Reports (PAR) with clean CSV & PDF exports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleQuickExportCSV}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider hover:bg-emerald-400 transition-all shadow-lg"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Quick Export CSV
            </button>
            <button
              onClick={handleExportCurrentTab}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#FFD100] text-[#003B73] text-xs font-black uppercase tracking-wider hover:bg-amber-300 transition-all shadow-lg"
            >
              <Download className="w-4 h-4" />
              Preview & Export (PDF / CSV)
            </button>
          </div>
        </div>
      </div>

      {/* Universal Filter Bar */}
      <UniversalReportFilterBar
        filterState={filterState}
        onChange={updateFilters}
        onReset={resetFilters}
        semesters={semesters}
        organizations={organizations}
        activePeriod={activePeriod}
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#003B73] text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-[#FFD100] text-[#003B73]' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-gray-200 p-16 text-center space-y-3 shadow-sm">
          <div className="w-10 h-10 rounded-full border-4 border-[#003B73] border-t-transparent animate-spin mx-auto" />
          <div className="text-sm font-bold text-gray-700">
            Synchronizing Institutional Analytics & Live Firebase Collections...
          </div>
          <p className="text-xs text-gray-400">
            Compiling Activity Proposals, Financial Liquidations, Post-Activity Reports, Club Advisers, and Officer Rosters
          </p>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <OverviewAnalyticsTab
              summary={overviewSummary}
              onNavigateTab={(t) => setActiveTab(t as ActiveReportTab)}
              onFilterOrg={(orgId) => updateFilters({ organizationId: orgId })}
              onSelectEvent={handleSelectMasterEvent}
              onExportMasterCSV={() =>
                exportReportToCSV(
                  generateMasterSystemLedgerReport(overviewSummary, filterState, adminName)
                )
              }
              onExportMasterModal={() =>
                setPreviewReport(
                  generateMasterSystemLedgerReport(overviewSummary, filterState, adminName)
                )
              }
            />
          )}

          {activeTab === 'ap' && (
            <ActivityProposalsTab
              summary={apSummary}
              onSelectProposal={(row: APReportRow) =>
                setDrawerSelection({ type: 'ap', data: row })
              }
              onExport={() =>
                setPreviewReport(generateAPSummaryReport(apSummary, filterState, adminName))
              }
              onExportCSV={() =>
                exportReportToCSV(generateAPSummaryReport(apSummary, filterState, adminName))
              }
            />
          )}

          {activeTab === 'fl' && (
            <FinancialLiquidationsTab
              summary={flSummary}
              onSelectLiquidation={(row: FLReportRow) =>
                setDrawerSelection({ type: 'fl', data: row })
              }
              onExport={() =>
                setPreviewReport(generateFLLedgerReport(flSummary, filterState, adminName))
              }
              onExportCSV={() =>
                exportReportToCSV(generateFLLedgerReport(flSummary, filterState, adminName))
              }
            />
          )}

          {activeTab === 'par' && (
            <PostActivityReportsTab
              summary={parSummary}
              onSelectPAR={(row: PARReportRow) =>
                setDrawerSelection({ type: 'par', data: row })
              }
              onExport={() =>
                setPreviewReport(generatePARPortfolioReport(parSummary, filterState, adminName))
              }
              onExportCSV={() =>
                exportReportToCSV(generatePARPortfolioReport(parSummary, filterState, adminName))
              }
            />
          )}

          {activeTab === 'clubs' && (
            <ClubsAndOfficersTab
              summary={rosterSummary}
              onSelectOrg={(row: OrgDirectoryRow) =>
                setDrawerSelection({ type: 'org', data: row })
              }
              onSelectOfficer={(row: OfficerRosterRow) =>
                setDrawerSelection({ type: 'officer', data: row })
              }
              onExportView={handleExportClubsSubView}
              onExportCSVView={handleExportClubsSubViewCSV}
              onFilterByAdviser={(advName) => updateFilters({ adviserName: advName })}
            />
          )}
        </>
      )}

      {/* Print / PDF / CSV Preview Modal */}
      <ReportExportModal
        report={previewReport}
        isOpen={Boolean(previewReport)}
        onClose={() => setPreviewReport(null)}
      />

      {/* Detail Inspection Drawer */}
      <ReportDetailDrawer
        selection={drawerSelection}
        onClose={() => setDrawerSelection(null)}
        onExportSingle={handleExportSingleRecord}
      />
    </div>
  );
};

export default ReportsAnalytics;
