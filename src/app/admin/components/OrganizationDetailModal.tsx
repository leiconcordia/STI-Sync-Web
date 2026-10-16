import { useState, useMemo } from 'react';
import {
  X,
  Users,
  Crown,
  Calendar,
  Building2,
  Shield,
  Mail,
  FileText,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertCircle,
  Eye,
  Search,
  Filter,
  Receipt,
  FileCheck2,
  DollarSign,
  Activity,
  Layers,
} from 'lucide-react';
import type { OrganizationDocument } from '../../modules/organizations/types/organization.types';
import type { EventDocument } from '../../modules/events/types/event.types';
import { useOrgOfficers } from '../../modules/organizations/hooks/useOrgOfficers';
import { useOrgMembers } from '../../modules/organizations/hooks/useOrgMembers';
import { useOrganizationTypes } from '../../modules/organizations/hooks/useOrganizationTypes';
import { useRoles } from '../../modules/roles/hooks/useRoles';
import { useUserNameResolver } from '../../modules/finance/hooks/useUserNameResolver';
import { useOrgActivities } from '../../modules/events/hooks/useEventStream';
import { useOrgLiquidations } from '../../modules/finance/hooks/useLiquidationStream';
import { useOfficerPARs } from '../../modules/post-activity-reports/hooks/usePostActivityReportStream';
import { OrganizationActivityDetailModal } from './OrganizationActivityDetailModal';
import { formatCurrency } from '../../utils/currency';
import { formatAppDate } from '../../utils/date';

interface OrganizationDetailModalProps {
  organization: OrganizationDocument | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OrganizationDetailModal({ organization, isOpen, onClose }: OrganizationDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'officers' | 'members'>('overview');
  const [selectedActivity, setSelectedActivity] = useState<EventDocument | null>(null);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'approved' | 'pending' | 'completed' | 'returned' | 'cancelled'>('all');

  const orgId = organization?.id || '';
  const { officers, loading: loadingOfficers } = useOrgOfficers(orgId);
  const { members, loading: loadingMembers } = useOrgMembers(orgId);
  const { events: activities = [], loading: loadingActivities } = useOrgActivities(orgId);
  const { liquidations = [], loading: loadingLiquidations } = useOrgLiquidations(orgId);
  const { pars = [], loading: loadingPars } = useOfficerPARs(orgId);
  const { data: orgTypes } = useOrganizationTypes();
  const { data: roles } = useRoles();
  const { resolveUserName } = useUserNameResolver();

  const resolvedCreatorName = useMemo(() => {
    if (!organization?.createdBy) return 'System Administrator';

    // First attempt resolving via real-time name resolver (matching students, officers, advisers, sas_admins, users)
    const resolved = resolveUserName(organization.createdBy);
    if (resolved) return resolved;

    const raw = organization.createdBy.trim();
    const lower = raw.toLowerCase();

    // If it's a known placeholder or system indicator
    if (lower === 'system' || lower === 'admin' || lower === 'sas_admin' || lower === 'sao' || lower === 'sas') {
      return 'SAS Administrator';
    }

    // If it's not an email, not a raw UID hash, and looks like a readable name
    const isUidHash = /^[a-zA-Z0-9_-]{20,}$/.test(raw);
    const isEmail = raw.includes('@');
    if (!isUidHash && !isEmail && raw.length > 1) {
      return raw;
    }

    return 'SAS Administrator';
  }, [organization?.createdBy, resolveUserName]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const titleMatch = (act.title || '').toLowerCase().includes(activitySearch.toLowerCase()) ||
        (act.referenceId || '').toLowerCase().includes(activitySearch.toLowerCase());
      
      const st = act.proposalStatus || act.status || 'draft';
      const statusMatch =
        activityFilter === 'all'
          ? true
          : activityFilter === 'pending'
          ? st === 'pending' || st === 'pending_review' || st === 'under_review'
          : st === activityFilter;

      return titleMatch && statusMatch;
    });
  }, [activities, activitySearch, activityFilter]);

  if (!isOpen || !organization) return null;

  const orgType = orgTypes.find(t => t.id === organization.typeId);

  const getRoleName = (roleId: string) => {
    const r = roles.find(role => role.id === roleId);
    return r ? r.name : roleId || 'Officer';
  };

  const activeMembers = members.filter(m => m.status === 'active');

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

        {/* Modal Container */}
        <div className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 border border-gray-200">
          
          {/* Banner / Header */}
          <div className="h-28 bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] relative p-6 flex items-end justify-between flex-shrink-0"
            style={orgType?.color ? { background: `linear-gradient(135deg, ${orgType.color}, #001A4D)` } : {}}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 p-2 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Logo overlapping banner */}
            <div className="absolute -bottom-8 left-6 flex items-center gap-4">
              <div className="w-20 h-20 bg-[#001A4D] rounded-2xl flex items-center justify-center text-white font-bold text-xl border-4 border-white shadow-xl overflow-hidden">
                {organization.logoUrl ? (
                  <img src={organization.logoUrl} alt={organization.acronym} className="w-full h-full object-cover" />
                ) : (
                  organization.acronym || 'ORG'
                )}
              </div>
            </div>
          </div>

          {/* Title Bar */}
          <div className="pt-10 px-6 pb-4 border-b border-gray-100 flex-shrink-0 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#001A4D]">{organization.name}</h2>
                <span className="text-xs font-mono px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                  ({organization.acronym})
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Department: <span className="font-semibold text-gray-700">{organization.department || 'General'}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#FFD54F] text-[#001A4D] font-bold text-xs rounded-full">
                {orgType?.name || 'Student Org'}
              </span>
              <span className={`px-3 py-1 text-xs font-bold rounded-full capitalize ${
                organization.status === 'active' ? 'bg-green-100 text-green-700 border border-green-300' :
                organization.status === 'suspended' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                'bg-gray-100 text-gray-600 border border-gray-300'
              }`}>
                {organization.status}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-6 border-b border-gray-200 flex gap-4 text-sm font-medium flex-shrink-0 bg-gray-50/50">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3 px-1 border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-[#001A4D] text-[#001A4D] font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={`py-3 px-1 border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'activities'
                  ? 'border-[#001A4D] text-[#001A4D] font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Calendar className="w-4 h-4 text-[#0E4EBD]" />
              Activities ({activities.length})
            </button>
            <button
              onClick={() => setActiveTab('officers')}
              className={`py-3 px-1 border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'officers'
                  ? 'border-[#001A4D] text-[#001A4D] font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Crown className="w-4 h-4 text-amber-500" />
              Officers ({officers.length})
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`py-3 px-1 border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'members'
                  ? 'border-[#001A4D] text-[#001A4D] font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4 text-blue-500" />
              Active Members ({activeMembers.length})
            </button>
          </div>

          {/* Content Body */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-200 leading-relaxed">
                    {organization.description || 'No description provided.'}
                  </p>
                </div>

                {/* Appointed Club Adviser Card */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                      <Shield className="w-5 h-5 text-[#FFD41C]" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                        Appointed Club Adviser
                      </span>
                      {organization.adviser?.name ? (
                        <>
                          <p className="font-bold text-[#001A4D] text-sm">{organization.adviser.name}</p>
                          <p className="text-xs text-gray-500 font-mono">
                            {organization.adviser.email}
                            {organization.adviser.employeeId ? ` • ID: ${organization.adviser.employeeId}` : ''}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No adviser currently assigned to this organization.</p>
                      )}
                    </div>
                  </div>
                  {organization.adviser?.name ? (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-[11px] rounded-full border border-emerald-200 shrink-0">
                      Active Adviser
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-gray-200 text-gray-700 font-bold text-[11px] rounded-full shrink-0">
                      Unassigned
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
                    <div className="text-xs text-blue-600 font-semibold mb-1">Active Members</div>
                    <div className="text-2xl font-bold text-[#001A4D]">{activeMembers.length}</div>
                  </div>

                  <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-xl">
                    <div className="text-xs text-amber-700 font-semibold mb-1">Appointed Officers</div>
                    <div className="text-2xl font-bold text-[#001A4D]">{officers.length}</div>
                  </div>

                  <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl">
                    <div className="text-xs text-emerald-700 font-semibold mb-1">Total Activities</div>
                    <div className="text-2xl font-bold text-[#001A4D]">{activities.length}</div>
                  </div>

                  <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
                    <div className="text-xs text-[#0E4EBD] font-semibold mb-1">Organization Type</div>
                    <div className="text-base font-bold text-[#001A4D] truncate">{orgType?.name || 'General'}</div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4 text-xs text-gray-500">
                  <div>
                    <span className="font-semibold text-gray-700 block mb-0.5">Academic Department</span>
                    <span>{organization.department || 'College-wide'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700 block mb-0.5">Created By</span>
                    <span className="font-medium text-gray-800">{resolvedCreatorName}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ACTIVITIES TAB */}
            {activeTab === 'activities' && (
              <div className="space-y-4">
                {/* Search & Filter Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search activities by title or code..."
                      value={activitySearch}
                      onChange={(e) => setActivitySearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#001A4D] focus:border-transparent"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                    <select
                      value={activityFilter}
                      onChange={(e) => setActivityFilter(e.target.value as any)}
                      className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#001A4D]"
                    >
                      <option value="all">All Statuses ({activities.length})</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending Review</option>
                      <option value="completed">Completed</option>
                      <option value="returned">Returned</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {loadingActivities ? (
                  <div className="text-center py-10 text-xs text-gray-400">Loading organization activities...</div>
                ) : filteredActivities.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-xs space-y-1">
                    <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-1" />
                    <p className="font-bold text-gray-600">No activities found</p>
                    <p className="text-gray-400">
                      {activitySearch || activityFilter !== 'all'
                        ? 'Try clearing your search or status filter.'
                        : 'This organization has not submitted any activities yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#001A4D] text-white">
                        <tr>
                          <th className="p-3 font-bold uppercase">Activity & Code</th>
                          <th className="p-3 font-bold uppercase">Schedule & Venue</th>
                          <th className="p-3 font-bold uppercase">Activity Status</th>
                          <th className="p-3 font-bold uppercase">Financial Liquidation</th>
                          <th className="p-3 font-bold uppercase">PAR Status</th>
                          <th className="p-3 font-bold uppercase text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredActivities.map((act) => {
                          const liq = liquidations.find((l) => l.eventId === act.id);
                          const par = pars.find((p) => p.eventId === act.id);

                          const pStatus = act.proposalStatus || act.status || 'draft';
                          const firstSession = act.sessions?.[0];
                          const dateText = firstSession?.date ? formatAppDate(firstSession.date) : 'TBA';
                          const venueText = act.customVenueName || 'Campus Venue';

                          // Financial Liquidation status
                          const budget = act.totalApprovedBudget || 0;
                          const spent = liq?.totalActualSpending;
                          const isNoLiqRequired = act.liquidationRequired === false || budget === 0;

                          return (
                            <tr key={act.id} className="hover:bg-gray-50/80 transition-colors">
                              {/* Title & Code */}
                              <td className="p-3 max-w-[200px]">
                                <p className="font-bold text-[#001A4D] truncate" title={act.title}>
                                  {act.title}
                                </p>
                                <span className="text-[10px] text-gray-500 font-mono">
                                  {act.referenceId || act.id.slice(0, 8)}
                                </span>
                              </td>

                              {/* Schedule & Venue */}
                              <td className="p-3 whitespace-nowrap">
                                <p className="font-medium text-gray-800">{dateText}</p>
                                <p className="text-[10px] text-gray-500 truncate max-w-[140px]" title={venueText}>
                                  {venueText}
                                </p>
                              </td>

                              {/* Proposal Status */}
                              <td className="p-3 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded-full font-bold text-[10px] border capitalize ${
                                    pStatus === 'approved'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : pStatus === 'pending' || pStatus === 'pending_review' || pStatus === 'under_review'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : pStatus === 'completed'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : pStatus === 'returned'
                                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                                      : pStatus === 'cancelled'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-gray-50 text-gray-600 border-gray-200'
                                  }`}
                                >
                                  {pStatus.replace('_', ' ')}
                                </span>
                              </td>

                              {/* Financial Liquidation */}
                              <td className="p-3">
                                {liq ? (
                                  <div>
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] border capitalize inline-block ${
                                        liq.status === 'approved'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : liq.status === 'under_review' || liq.status === 'pending'
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : liq.status === 'returned'
                                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                                          : 'bg-purple-50 text-purple-700 border-purple-200'
                                      }`}
                                    >
                                      {liq.status === 'approved' ? 'Approved' : liq.status === 'under_review' ? 'Under Review' : liq.status}
                                    </span>
                                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                      {formatCurrency(spent)} / {formatCurrency(budget)}
                                    </p>
                                  </div>
                                ) : isNoLiqRequired ? (
                                  <div>
                                    <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-gray-100 text-gray-500 border border-gray-200">
                                      None Required
                                    </span>
                                    <p className="text-[10px] text-gray-400 mt-0.5">₱0 Budget</p>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
                                      Pending Filing
                                    </span>
                                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                      Budget: {formatCurrency(budget)}
                                    </p>
                                  </div>
                                )}
                              </td>

                              {/* PAR Status */}
                              <td className="p-3 whitespace-nowrap">
                                {par ? (
                                  <div>
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] border capitalize ${
                                        par.status === 'approved'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : par.status === 'under_review'
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : par.status === 'returned'
                                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                                          : 'bg-purple-50 text-purple-700 border-purple-200'
                                      }`}
                                    >
                                      {par.status.replace('_', ' ')}
                                    </span>
                                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                                      {par.referenceNo || 'PAR'}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-gray-100 text-gray-400 border border-gray-200">
                                    Not Submitted
                                  </span>
                                )}
                              </td>

                              {/* Action */}
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => setSelectedActivity(act)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-[#001A4D] hover:bg-[#001A4D] hover:text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs cursor-pointer"
                                  title="Inspect Activity Details"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Inspect</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          {activeTab === 'officers' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Appointed Organization Officers</h4>
              {loadingOfficers ? (
                <div className="text-center py-8 text-xs text-gray-400">Loading officers...</div>
              ) : officers.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 border border-dashed rounded-xl text-gray-400 text-xs">
                  No officers appointed yet for this organization.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {officers.map((off) => (
                    <div key={off.id} className="p-3.5 bg-white border border-gray-200 rounded-xl flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#001A4D] text-amber-300 font-bold rounded-lg flex items-center justify-center text-xs">
                          <Crown className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#001A4D]">{off.studentName}</p>
                          <p className="text-xs text-gray-500 font-mono">{off.studentId} • {off.email}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-[11px] rounded-full border border-amber-200">
                        {getRoleName(off.roleId)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Active Member Roster</h4>
              {loadingMembers ? (
                <div className="text-center py-8 text-xs text-gray-400">Loading members...</div>
              ) : activeMembers.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 border border-dashed rounded-xl text-gray-400 text-xs">
                  No active members registered in this organization.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#001A4D] text-white">
                      <tr>
                        <th className="p-3 font-bold uppercase">Student ID</th>
                        <th className="p-3 font-bold uppercase">Name</th>
                        <th className="p-3 font-bold uppercase">Course</th>
                        <th className="p-3 font-bold uppercase">Year</th>
                        <th className="p-3 font-bold uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeMembers.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="p-3 font-mono font-medium text-gray-600">{m.studentId}</td>
                          <td className="p-3 font-bold text-[#001A4D]">{m.studentName}</td>
                          <td className="p-3 text-[#0E4EBD] font-semibold">{m.course || '—'}</td>
                          <td className="p-3 text-gray-600">{m.year || '—'}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold text-[10px]">
                              Active
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#001A4D] text-white rounded-xl text-xs font-bold hover:bg-[#0E4EBD] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    {/* Dedicated Activity Inspection Modal */}
    <OrganizationActivityDetailModal
      isOpen={Boolean(selectedActivity)}
      onClose={() => setSelectedActivity(null)}
      activity={selectedActivity}
      liquidation={liquidations.find((l) => l.eventId === selectedActivity?.id)}
      par={pars.find((p) => p.eventId === selectedActivity?.id)}
      organizationName={organization.name}
      organizationAcronym={organization.acronym}
    />
  </>
  );
}

