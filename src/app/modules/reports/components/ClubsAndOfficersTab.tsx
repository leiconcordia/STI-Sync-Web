import React, { useState } from 'react';
import {
  Building2,
  Users,
  Award,
  ShieldCheck,
  Eye,
  Download,
  FileSpreadsheet,
  Mail,
} from 'lucide-react';
import {
  ClubRosterSummary,
  OrgDirectoryRow,
  OfficerRosterRow,
  AdviserDirectoryRow,
} from '../types/report.types';
import { TablePagination, usePagination } from '../../../components/ui/table-pagination';

export type ClubsSubView = 'orgs' | 'advisers' | 'officers';

interface ClubsAndOfficersTabProps {
  summary: ClubRosterSummary;
  onSelectOrg: (row: OrgDirectoryRow) => void;
  onSelectOfficer: (row: OfficerRosterRow) => void;
  onExportView: (subView: ClubsSubView) => void;
  onExportCSVView?: (subView: ClubsSubView) => void;
  onFilterByAdviser?: (adviserName: string) => void;
}

export const ClubsAndOfficersTab: React.FC<ClubsAndOfficersTabProps> = ({
  summary,
  onSelectOrg,
  onSelectOfficer,
  onExportView,
  onExportCSVView,
  onFilterByAdviser,
}) => {
  const [subView, setSubView] = useState<ClubsSubView>('orgs');

  const orgRows = summary?.orgRows || [];
  const adviserRows = summary?.adviserRows || [];
  const officerRows = summary?.officerRows || [];
  const kpis = summary?.kpis || {
    totalAccreditedOrganizations: 0,
    totalStudentOfficers: 0,
    facultyAdvisersAssigned: 0,
    complianceScorecard: { fullyCompliant: 0, conditional: 0, probationary: 0 },
  };

  const orgPagination = usePagination(orgRows, 10);
  const adviserPagination = usePagination(adviserRows, 10);
  const officerPagination = usePagination(officerRows, 10);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setSubView('orgs')}
          className={`bg-white rounded-2xl border p-4 shadow-sm cursor-pointer transition-all ${
            subView === 'orgs'
              ? 'border-[#003B73] ring-2 ring-[#003B73]/15'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 uppercase mb-1">
            <span>Organizations</span>
            <Building2 className="w-4 h-4 text-[#003B73]" />
          </div>
          <div className="text-2xl font-black text-gray-900">
            {(kpis.totalAccreditedOrganizations || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-emerald-600 mt-1">
            {kpis.complianceScorecard?.fullyCompliant || 0} in full standing
          </div>
        </div>

        <div
          onClick={() => setSubView('advisers')}
          className={`bg-white rounded-2xl border p-4 shadow-sm cursor-pointer transition-all ${
            subView === 'advisers'
              ? 'border-[#003B73] ring-2 ring-[#003B73]/15'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-[#003B73] uppercase mb-1">
            <span>Club Advisers</span>
            <Award className="w-4 h-4 text-[#003B73]" />
          </div>
          <div className="text-2xl font-black text-[#003B73]">
            {(kpis.facultyAdvisersAssigned || adviserRows.length || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-gray-400 mt-1">
            Faculty & institutional advisers
          </div>
        </div>

        <div
          onClick={() => setSubView('officers')}
          className={`bg-white rounded-2xl border p-4 shadow-sm cursor-pointer transition-all ${
            subView === 'officers'
              ? 'border-[#003B73] ring-2 ring-[#003B73]/15'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-amber-600 uppercase mb-1">
            <span>Student Officers</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-gray-900">
            {(kpis.totalStudentOfficers || 0).toLocaleString()}
          </div>
          <div className="text-[11px] font-semibold text-emerald-600 mt-1">
            Active student leaders across clubs
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-600 uppercase mb-1">
            <span>Standing Scorecard</span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="text-sm font-black text-gray-900 space-y-0.5 mt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 font-semibold">Fully Compliant:</span>
              <span className="font-extrabold text-emerald-700">
                {kpis.complianceScorecard?.fullyCompliant || 0} orgs
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 font-semibold">Conditional / Probation:</span>
              <span className="font-extrabold text-amber-700">
                {(kpis.complianceScorecard?.conditional || 0) +
                  (kpis.complianceScorecard?.probationary || 0)}{' '}
                orgs
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-View Switcher & Table Container */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 bg-gray-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setSubView('orgs')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                subView === 'orgs'
                  ? 'bg-[#003B73] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              All Organizations ({orgRows.length})
            </button>
            <button
              onClick={() => setSubView('advisers')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                subView === 'advisers'
                  ? 'bg-[#003B73] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              All Club Advisers ({adviserRows.length})
            </button>
            <button
              onClick={() => setSubView('officers')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                subView === 'officers'
                  ? 'bg-[#003B73] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Master Officer Roster ({officerRows.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onExportCSVView && (
              <button
                onClick={() => onExportCSVView(subView)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export{' '}
                {subView === 'orgs' ? 'Orgs' : subView === 'advisers' ? 'Advisers' : 'Officers'} CSV
              </button>
            )}
            <button
              onClick={() => onExportView(subView)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#003B73] text-white hover:bg-[#002855] transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF / CSV
            </button>
          </div>
        </div>

        {/* SUB-VIEW 1: ORGANIZATIONS DIRECTORY */}
        {subView === 'orgs' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3.5 px-4">Organization</th>
                    <th className="py-3.5 px-4">Category / Scope</th>
                    <th className="py-3.5 px-4">Club Adviser</th>
                    <th className="py-3.5 px-4">President</th>
                    <th className="py-3.5 px-4 text-center">Officers / Members</th>
                    <th className="py-3.5 px-4 text-center">AP / FL / PAR</th>
                    <th className="py-3.5 px-4">Standing</th>
                    <th className="py-3.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {orgPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                        No organizations match the current filter selection.
                      </td>
                    </tr>
                  ) : (
                    orgPagination.paginatedItems.map((org) => (
                      <tr key={org.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-gray-900">{org.name}</div>
                          {org.acronym && (
                            <div className="text-[11px] font-bold text-[#003B73]">{org.acronym}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-800">{org.category}</div>
                          <div className="text-[11px] text-gray-500">{org.academicYear}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-800">{org.adviserName}</div>
                          {org.adviserEmail && (
                            <div className="text-[11px] text-gray-500">{org.adviserEmail}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-700">
                          {org.presidentName}
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-gray-800">
                          {org.activeOfficersCount || 0} officers · {org.activeMembers || 0} members
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-gray-800 font-bold text-[11px]">
                            {org.totalAPs || 0} AP · {org.approvedFLs || 0} FL · {org.approvedPARs || 0} PAR
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                              org.accreditationStatus === 'Fully Compliant'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {org.accreditationStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => onSelectOrg(org)}
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
              currentPage={orgPagination.currentPage}
              totalPages={orgPagination.totalPages}
              pageSize={orgPagination.pageSize}
              totalItems={orgPagination.totalItems}
              onPageChange={orgPagination.setCurrentPage}
              onPageSizeChange={orgPagination.setPageSize}
            />
          </>
        )}

        {/* SUB-VIEW 2: CLUB ADVISERS DIRECTORY */}
        {subView === 'advisers' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3.5 px-4">Club Adviser Name</th>
                    <th className="py-3.5 px-4">Official Email</th>
                    <th className="py-3.5 px-4">Advised Organization(s)</th>
                    <th className="py-3.5 px-4">Department / Track</th>
                    <th className="py-3.5 px-4 text-center">Activities Advised</th>
                    <th className="py-3.5 px-4 text-center">Cleared Activities</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-center">Filter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {adviserPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                        No Club Advisers match the current filter selection.
                      </td>
                    </tr>
                  ) : (
                    adviserPagination.paginatedItems.map((adv: AdviserDirectoryRow) => (
                      <tr key={adv.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-gray-900">{adv.adviserName}</td>
                        <td className="py-3.5 px-4 text-gray-600">
                          {adv.adviserEmail ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="w-3 h-3 text-gray-400" />
                              {adv.adviserEmail}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-800">
                            {(adv.assignedClubs || []).join(', ')}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {adv.assignedClubsCount || 0} organization
                            {adv.assignedClubsCount === 1 ? '' : 's'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#003B73]">
                          {adv.department}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-50 text-[#003B73] font-bold">
                            {adv.totalActivitiesAdvised || 0} Activities
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold">
                            {adv.clearedActivitiesCount || 0} Cleared
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {adv.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {onFilterByAdviser && (
                            <button
                              onClick={() => onFilterByAdviser(adv.adviserName)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#003B73] bg-blue-50 hover:bg-[#003B73] hover:text-white transition-colors"
                            >
                              Filter System
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
              currentPage={adviserPagination.currentPage}
              totalPages={adviserPagination.totalPages}
              pageSize={adviserPagination.pageSize}
              totalItems={adviserPagination.totalItems}
              onPageChange={adviserPagination.setCurrentPage}
              onPageSizeChange={adviserPagination.setPageSize}
            />
          </>
        )}

        {/* SUB-VIEW 3: MASTER OFFICER ROSTER */}
        {subView === 'officers' && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3.5 px-4">Student ID</th>
                    <th className="py-3.5 px-4">Officer Name & Email</th>
                    <th className="py-3.5 px-4">Position</th>
                    <th className="py-3.5 px-4">Organization</th>
                    <th className="py-3.5 px-4">Club Adviser</th>
                    <th className="py-3.5 px-4">Course & Year</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {officerPagination.paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400 font-medium">
                        No student officers match the current filter selection.
                      </td>
                    </tr>
                  ) : (
                    officerPagination.paginatedItems.map((off) => (
                      <tr key={off.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-[#003B73] whitespace-nowrap">
                          {off.studentId}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-gray-900">{off.studentName}</div>
                          <div className="text-[11px] text-gray-500">{off.email}</div>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-gray-800">{off.positionTitle}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-gray-800">{off.organizationName}</div>
                          <div className="text-[10px] font-bold text-[#003B73] uppercase">
                            {off.organizationAcronym}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-700">
                          {off.adviserName || 'SAS Office'}
                        </td>
                        <td className="py-3.5 px-4 text-gray-700">{off.courseAndYear}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                              (off.status || '').toLowerCase() === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {off.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => onSelectOfficer(off)}
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
              currentPage={officerPagination.currentPage}
              totalPages={officerPagination.totalPages}
              pageSize={officerPagination.pageSize}
              totalItems={officerPagination.totalItems}
              onPageChange={officerPagination.setCurrentPage}
              onPageSizeChange={officerPagination.setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
};
