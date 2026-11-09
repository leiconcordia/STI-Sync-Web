import React, { useState } from 'react';
import {
  Building2,
  Users,
  ShieldCheck,
  Award,
  Crown,
  Download,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronRight,
  School,
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
import type {
  ClubRosterSummary,
  OrgDirectoryRow,
  OfficerRosterRow,
} from '../types/report.types';
import type { OrganizationDocument } from '../../organizations/types/organization.types';

interface ClubsAndOfficersTabProps {
  summary: ClubRosterSummary;
  onViewOrgDetails: (org: OrganizationDocument) => void;
  onExportRoster: () => void;
}

const ITEMS_PER_PAGE = 8;
const DONUT_COLORS = ['#001A4D', '#0E4EBD', '#22C55E', '#FFD41C', '#8B5CF6', '#EC4899', '#F97316'];

export const ClubsAndOfficersTab: React.FC<ClubsAndOfficersTabProps> = ({
  summary,
  onViewOrgDetails,
  onExportRoster,
}) => {
  const { kpis, charts, orgRows, officerRows } = summary;
  const [subView, setSubView] = useState<'orgs' | 'officers'>('orgs');
  const [currentPage, setCurrentPage] = useState(1);

  const activeRowsCount = subView === 'orgs' ? orgRows.length : officerRows.length;
  const totalPages = Math.max(1, Math.ceil(activeRowsCount / ITEMS_PER_PAGE));

  const paginatedOrgs = orgRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const paginatedOfficers = officerRows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6">
      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Accredited Clubs</span>
            <Building2 className="w-4 h-4 text-[#0E4EBD]" />
          </div>
          <h3 className="text-2xl font-black text-[#001A4D]">{kpis.totalAccreditedOrganizations}</h3>
          <p className="text-[11px] text-gray-400 mt-1">Recognized student organizations</p>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Student Officers</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <h3 className="text-2xl font-black text-[#001A4D]">{kpis.totalStudentOfficers}</h3>
          <p className="text-[11px] text-purple-600 font-semibold mt-1">Elected campus leaders</p>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Faculty Advisers</span>
            <School className="w-4 h-4 text-green-600" />
          </div>
          <h3 className="text-2xl font-black text-[#001A4D]">{kpis.facultyAdvisersAssigned}</h3>
          <p className="text-[11px] text-green-600 font-semibold mt-1">Active faculty mentors</p>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Compliance Scorecard</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <h3 className="text-lg font-black text-[#001A4D] mt-0.5">
            <span className="text-green-600">{kpis.complianceScorecard.fullyCompliant} Full</span>
            <span className="text-gray-300 mx-1.5">/</span>
            <span className="text-amber-600">{kpis.complianceScorecard.conditional} Cond</span>
          </h3>
          <p className="text-[11px] text-gray-400 mt-1">
            {kpis.complianceScorecard.probationary > 0
              ? `${kpis.complianceScorecard.probationary} probationary`
              : '100% Good Standing'}
          </p>
        </div>
      </div>

      {/* ── Visual Analytics: Club Membership & Officer Department Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Club Membership Distribution */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Club Membership Distribution</span>
              <span className="text-xs font-normal text-gray-500">By Registered Members</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={charts.clubMembershipDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="memberCount"
                  nameKey="acronym"
                >
                  {charts.clubMembershipDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => `${val} members`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Officer Department Distribution */}
        <Card className="border-gray-200 rounded-2xl shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-[#001A4D] flex items-center justify-between">
              <span>Officer Leadership by Academic Department</span>
              <span className="text-xs font-normal text-gray-500">Program Diversity</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={charts.officerDepartmentDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="department" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="#001A4D" name="Active Officers" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Sub-Directory Views: Organization Directory vs Master Officer Roster ── */}
      <Card className="border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
          {/* Sub-view toggle */}
          <div className="flex items-center gap-2">
            <div className="bg-gray-200/70 p-1 rounded-xl flex items-center gap-1">
              <button
                onClick={() => {
                  setSubView('orgs');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  subView === 'orgs'
                    ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Organization Directory ({orgRows.length})
              </button>
              <button
                onClick={() => {
                  setSubView('officers');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  subView === 'officers'
                    ? 'bg-[#001A4D] text-[#FFD41C] shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Master Officer Roster ({officerRows.length})
              </button>
            </div>
          </div>

          <Button
            onClick={onExportRoster}
            className="bg-[#001A4D] hover:bg-[#002D72] text-white text-xs font-bold cursor-pointer shadow-xs self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {subView === 'orgs' ? 'Export Organization Directory' : 'Export Master Officer Roster'}
          </Button>
        </div>

        {/* View 1: Organization Directory */}
        {subView === 'orgs' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#001A4D] text-white font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Organization / Acronym</th>
                  <th className="px-4 py-3 whitespace-nowrap">Category / Department</th>
                  <th className="px-4 py-3 whitespace-nowrap">Faculty Adviser</th>
                  <th className="px-4 py-3 whitespace-nowrap">Club President</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">Members</th>
                  <th className="px-4 py-3 whitespace-nowrap">Accreditation</th>
                  <th className="px-4 py-3 whitespace-nowrap text-center">Hierarchy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedOrgs.map((org) => {
                  const isCompliant = org.accreditationStatus === 'Fully Compliant';
                  const isProbationary = org.accreditationStatus === 'Probationary';

                  return (
                    <tr key={org.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {org.logoUrl ? (
                            <img
                              src={org.logoUrl}
                              alt={org.name}
                              className="w-7 h-7 rounded-lg object-cover border border-gray-200"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#0E4EBD] font-bold text-xs">
                              {org.acronym?.slice(0, 2) || 'CL'}
                            </div>
                          )}
                          <div>
                            <span className="font-bold text-gray-900 block leading-tight">{org.name}</span>
                            <span className="text-[11px] text-gray-400 font-mono font-semibold">{org.acronym}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-medium">
                        {org.category}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
                        {org.adviserName}
                      </td>
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap font-bold">
                        <span className="inline-flex items-center gap-1">
                          <Crown className="w-3.5 h-3.5 text-amber-500" />
                          {org.presidentName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="font-bold text-[#0E4EBD] bg-blue-50 px-2 py-0.5 rounded-md">
                          {org.activeMembers}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isCompliant
                              ? 'bg-green-100 text-green-700'
                              : isProbationary
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {org.accreditationStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => onViewOrgDetails(org.rawOrg)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#0E4EBD] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="View Organization Hierarchy and Profile"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Hierarchy
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {paginatedOrgs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      No organizations found matching the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* View 2: Master Officer Roster */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#001A4D] text-white font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Student Name</th>
                  <th className="px-4 py-3 whitespace-nowrap">Student ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">Organization</th>
                  <th className="px-4 py-3 whitespace-nowrap">Position / Title</th>
                  <th className="px-4 py-3 whitespace-nowrap">Course & Year</th>
                  <th className="px-4 py-3 whitespace-nowrap">Institutional Email</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedOfficers.map((officer) => (
                  <tr key={officer.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                      {officer.studentName}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-gray-600 whitespace-nowrap">
                      {officer.studentId}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-bold text-[#001A4D]">{officer.organizationAcronym}</span>
                      <span className="text-gray-400 text-[11px] block">{officer.organizationName}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-[#0E4EBD]">
                        {officer.positionTitle.toLowerCase().includes('president') && (
                          <Crown className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        {officer.positionTitle}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-medium">
                      {officer.courseAndYear}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">
                      {officer.email}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">
                        {officer.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {paginatedOfficers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      No student officers found matching the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={activeRowsCount}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
          itemName={subView === 'orgs' ? 'organizations' : 'officers'}
        />
      </Card>
    </div>
  );
};

