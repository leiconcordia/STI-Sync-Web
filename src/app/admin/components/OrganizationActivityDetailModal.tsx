import React, { useState } from 'react';
import {
  X,
  Calendar,
  MapPin,
  Users,
  Target,
  Receipt,
  FileCheck2,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Building2,
  Layers,
  ChevronRight,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  DollarSign,
  QrCode,
  FileSpreadsheet,
  Paperclip,
} from 'lucide-react';
import type { EventDocument } from '../../modules/events/types/event.types';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';
import type { PostActivityReportDocument } from '../../modules/post-activity-reports/types/par.types';
import { formatCurrency } from '../../utils/currency';
import { formatAppDate, formatAppDateTime } from '../../utils/date';

interface OrganizationActivityDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: EventDocument | null;
  liquidation?: LiquidationDocument | null;
  par?: PostActivityReportDocument | null;
  organizationName?: string;
  organizationAcronym?: string;
}

export function OrganizationActivityDetailModal({
  isOpen,
  onClose,
  activity,
  liquidation,
  par,
  organizationName,
  organizationAcronym,
}: OrganizationActivityDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'par'>('overview');

  if (!isOpen || !activity) return null;

  // Format activity timing
  const firstSession = activity.sessions?.[0];
  const dateFormatted = firstSession?.date
    ? formatAppDate(firstSession.date)
    : 'Date TBA';
  const timeFormatted = firstSession?.startTime
    ? `${firstSession.startTime} - ${firstSession.endTime || 'End'}`
    : 'Time TBA';

  // Proposal Lifecycle Status Config
  const proposalStatus = activity.proposalStatus || activity.status || 'draft';
  const getProposalBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return {
          label: 'Approved Activity',
          color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: CheckCircle2,
        };
      case 'pending':
      case 'pending_review':
      case 'under_review':
        return {
          label: 'Pending Review',
          color: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: Clock,
        };
      case 'completed':
        return {
          label: 'Completed Activity',
          color: 'bg-blue-100 text-blue-800 border-blue-300',
          icon: CheckCircle2,
        };
      case 'returned':
        return {
          label: 'Returned for Revision',
          color: 'bg-orange-100 text-orange-800 border-orange-300',
          icon: RotateCcw,
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          color: 'bg-red-100 text-red-800 border-red-300',
          icon: AlertCircle,
        };
      case 'draft':
      default:
        return {
          label: 'Draft',
          color: 'bg-gray-100 text-gray-700 border-gray-300',
          icon: FileText,
        };
    }
  };

  // Liquidation Status Config
  const approvedBudget = activity.totalApprovedBudget || 0;
  const actualSpend = liquidation?.totalActualSpending ?? 0;
  const variance = approvedBudget - actualSpend;

  const getLiquidationBadge = () => {
    if (liquidation) {
      switch (liquidation.status) {
        case 'approved':
          return { label: 'Liquidation Approved', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
        case 'under_review':
        case 'pending':
          return { label: 'Liquidation Under Review', color: 'bg-blue-100 text-blue-800 border-blue-300' };
        case 'returned':
          return { label: 'Liquidation Returned', color: 'bg-orange-100 text-orange-800 border-orange-300' };
        case 'draft':
          return { label: 'Liquidation In Draft', color: 'bg-purple-100 text-purple-800 border-purple-300' };
        case 'voided':
          return { label: 'Liquidation Voided', color: 'bg-gray-100 text-gray-600 border-gray-300' };
        default:
          return { label: liquidation.status, color: 'bg-gray-100 text-gray-700 border-gray-300' };
      }
    }
    if (activity.liquidationRequired === false || approvedBudget === 0) {
      return { label: 'No Liquidation Required', color: 'bg-gray-100 text-gray-600 border-gray-300' };
    }
    if (activity.liquidationStatus === 'submitted') {
      return { label: 'Submitted / Processing', color: 'bg-blue-100 text-blue-800 border-blue-300' };
    }
    return { label: 'Pending Liquidation Submission', color: 'bg-amber-100 text-amber-800 border-amber-300' };
  };

  // PAR Status Config
  const getParBadge = () => {
    if (par) {
      switch (par.status) {
        case 'approved':
          return { label: 'PAR Approved', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
        case 'under_review':
          return { label: 'PAR Under Review', color: 'bg-blue-100 text-blue-800 border-blue-300' };
        case 'returned':
          return { label: 'PAR Returned', color: 'bg-orange-100 text-orange-800 border-orange-300' };
        case 'draft':
          return { label: 'PAR In Draft', color: 'bg-purple-100 text-purple-800 border-purple-300' };
        case 'archived':
          return { label: 'PAR Archived', color: 'bg-gray-100 text-gray-600 border-gray-300' };
        default:
          return { label: par.status, color: 'bg-gray-100 text-gray-700 border-gray-300' };
      }
    }
    return { label: 'PAR Not Submitted', color: 'bg-gray-100 text-gray-500 border-gray-300' };
  };

  const propBadge = getProposalBadge(proposalStatus);
  const liqBadge = getLiquidationBadge();
  const parBadge = getParBadge();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 border border-gray-200">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] px-6 py-5 text-white flex-shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 bg-[#FFD54F] text-[#001A4D] rounded-md font-bold text-xs uppercase tracking-wide">
              {organizationAcronym || 'ORG'} Activity
            </span>
            <span className="text-white/60 text-xs font-mono">
              Ref: {activity.referenceId || activity.id}
            </span>
          </div>

          <h2 className="text-xl font-bold text-white leading-snug">
            {activity.title}
          </h2>

          <p className="text-xs text-white/80 mt-1 flex items-center gap-2">
            <span>{organizationName || 'Student Organization'}</span>
            <span>•</span>
            <span>{dateFormatted}</span>
            <span>•</span>
            <span>{activity.customVenueName || 'Campus Venue'}</span>
          </p>

          {/* Tri-Status Indicator Bar */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-white/15">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-lg">
              <span className="text-[10px] text-white/70 font-semibold uppercase">Proposal:</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${propBadge.color}`}>
                {propBadge.label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-lg">
              <span className="text-[10px] text-white/70 font-semibold uppercase">Liquidation:</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${liqBadge.color}`}>
                {liqBadge.label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-xs px-2.5 py-1 rounded-lg">
              <span className="text-[10px] text-white/70 font-semibold uppercase">PAR:</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${parBadge.color}`}>
                {parBadge.label}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-gray-200 bg-gray-50 flex items-center gap-6 text-sm font-semibold flex-shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[#001A4D] text-[#001A4D]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileText className="w-4 h-4 text-[#0E4EBD]" />
            Activity Overview
          </button>

          <button
            onClick={() => setActiveTab('financials')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'financials'
                ? 'border-[#001A4D] text-[#001A4D]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Receipt className="w-4 h-4 text-emerald-600" />
            Financial Liquidation
            {liquidation && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('par')}
            className={`py-3.5 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'par'
                ? 'border-[#001A4D] text-[#001A4D]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileCheck2 className="w-4 h-4 text-purple-600" />
            Post-Activity Report (PAR)
            {par && (
              <span className="w-2 h-2 rounded-full bg-purple-500" />
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Description */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Description & Rationale</h4>
                <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-200 leading-relaxed">
                  {activity.description || 'No detailed description provided for this activity.'}
                </p>
              </div>

              {/* Objectives */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Activity Objectives</h4>
                {activity.objectives && activity.objectives.length > 0 ? (
                  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-2xs">
                    {activity.objectives.map((obj, idx) => (
                      <div key={idx} className="p-3 text-xs text-gray-700 flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-[#001A4D] font-bold flex items-center justify-center shrink-0 text-[10px]">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed mt-0.5">{obj}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-gray-200">
                    No explicit objectives recorded.
                  </p>
                )}
              </div>

              {/* Schedule, Venue & Format Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                  <div className="flex items-center gap-2 text-xs text-blue-700 font-semibold mb-1">
                    <Calendar className="w-4 h-4" />
                    <span>Date & Time</span>
                  </div>
                  <p className="text-sm font-bold text-[#001A4D]">{dateFormatted}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{timeFormatted}</p>
                </div>

                <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                  <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold mb-1">
                    <MapPin className="w-4 h-4" />
                    <span>Venue & Format</span>
                  </div>
                  <p className="text-sm font-bold text-[#001A4D]">
                    {activity.customVenueName || 'Campus Facility'}
                  </p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">
                    Format: {activity.eventFormat || 'On-Campus'}
                  </p>
                </div>

                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                  <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold mb-1">
                    <Users className="w-4 h-4" />
                    <span>Target Audience</span>
                  </div>
                  <p className="text-sm font-bold text-[#001A4D]">
                    {activity.expectedParticipantCount || 0} Expected
                  </p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">
                    Scope: {activity.targetAudienceScope || 'All Students'}
                  </p>
                </div>
              </div>

              {/* Target Scope Details */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">Target Courses:</span>
                  <span className="font-semibold text-gray-800">
                    {activity.targetCourses && activity.targetCourses.length > 0
                      ? activity.targetCourses.join(', ')
                      : 'All Academic Courses'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">Target Year Levels:</span>
                  <span className="font-semibold text-gray-800">
                    {activity.targetYearLevels && activity.targetYearLevels.length > 0
                      ? activity.targetYearLevels.join(', ')
                      : 'All Year Levels'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-medium">Attendance & Check-In:</span>
                  <span className="font-semibold text-gray-800">
                    {activity.attendanceEnabled ? 'Required (QR Scanners Active)' : 'Optional'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FINANCIAL & LIQUIDATION */}
          {activeTab === 'financials' && (
            <div className="space-y-6">
              {/* Top Financial Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl shadow-2xs">
                  <span className="text-xs font-semibold text-blue-700 block mb-1">Approved Budget Ceiling</span>
                  <div className="text-2xl font-bold font-mono text-[#001A4D]">
                    {formatCurrency(approvedBudget)}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">Allocated in proposal</span>
                </div>

                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl shadow-2xs">
                  <span className="text-xs font-semibold text-emerald-700 block mb-1">Total Actual Spending</span>
                  <div className="text-2xl font-bold font-mono text-emerald-800">
                    {liquidation ? formatCurrency(actualSpend) : '₱0.00'}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">
                    {liquidation ? `${liquidation.items?.length || 0} receipted line items` : 'No liquidation filed yet'}
                  </span>
                </div>

                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl shadow-2xs">
                  <span className="text-xs font-semibold text-amber-700 block mb-1">Remaining Balance</span>
                  <div className={`text-2xl font-bold font-mono ${variance >= 0 ? 'text-[#001A4D]' : 'text-red-600'}`}>
                    {liquidation ? formatCurrency(variance) : formatCurrency(approvedBudget)}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">
                    {variance >= 0 ? 'Surplus / Return to Org Fund' : 'Overspending Deficit'}
                  </span>
                </div>
              </div>

              {/* Liquidation Status Banner */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    <Receipt className="w-5 h-5 text-[#FFD41C]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Financial Liquidation Filing
                    </span>
                    <p className="font-bold text-[#001A4D] text-sm">
                      {liquidation ? `Report ID: ${liquidation.id}` : 'Filing Status'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {liquidation
                        ? `Authored by ${liquidation.createdByName} (${liquidation.createdByRole})`
                        : approvedBudget === 0
                        ? 'This activity has zero approved budget. Liquidation is not required.'
                        : 'Awaiting officer submission of official receipts and expense report.'}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 font-bold text-xs rounded-full border shrink-0 ${liqBadge.color}`}>
                  {liqBadge.label}
                </span>
              </div>

              {/* Expense Line Items (if liquidation submitted) */}
              {liquidation && liquidation.items && liquidation.items.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Liquidation Expense Items ({liquidation.items.length})
                  </h4>
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#001A4D] text-white">
                        <tr>
                          <th className="p-3 font-bold uppercase">Item & Category</th>
                          <th className="p-3 font-bold uppercase">Vendor / Payee</th>
                          <th className="p-3 font-bold uppercase text-center">Qty</th>
                          <th className="p-3 font-bold uppercase text-right">Unit Cost</th>
                          <th className="p-3 font-bold uppercase text-right">Actual Cost</th>
                          <th className="p-3 font-bold uppercase text-center">Receipts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {liquidation.items.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50/80">
                            <td className="p-3">
                              <p className="font-bold text-[#001A4D]">{item.description}</p>
                              <span className="text-[10px] text-gray-500 font-mono">{item.category}</span>
                            </td>
                            <td className="p-3 text-gray-700 font-medium">{item.vendorName || '—'}</td>
                            <td className="p-3 text-center text-gray-700">{item.quantity}</td>
                            <td className="p-3 text-right font-mono text-gray-700">
                              {formatCurrency(item.unitCost)}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-[#001A4D]">
                              {formatCurrency(item.totalCost)}
                            </td>
                            <td className="p-3 text-center">
                              {item.receiptFiles && item.receiptFiles.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                  <Paperclip className="w-3 h-3" />
                                  {item.receiptFiles.length} file(s)
                                </span>
                              ) : item.receiptUrl ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                                  <Paperclip className="w-3 h-3" />
                                  1 receipt
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">None</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Fallback to proposal budget line items */
                activity.budgetItems && activity.budgetItems.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Approved Budget Projection Items
                    </h4>
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#001A4D] text-white">
                          <tr>
                            <th className="p-3 font-bold uppercase">Item Description</th>
                            <th className="p-3 font-bold uppercase text-center">Quantity</th>
                            <th className="p-3 font-bold uppercase text-right">Unit Cost</th>
                            <th className="p-3 font-bold uppercase text-right">Allocated Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {activity.budgetItems.map((b) => (
                            <tr key={b.id} className="hover:bg-gray-50/80">
                              <td className="p-3 font-bold text-[#001A4D]">{b.item}</td>
                              <td className="p-3 text-center text-gray-700">{b.quantity}</td>
                              <td className="p-3 text-right font-mono text-gray-700">
                                {formatCurrency(b.unitCost)}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-[#001A4D]">
                                {formatCurrency(b.approvedAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              )}

              {/* Cash Custodians (if any) */}
              {activity.budgetCustodians && activity.budgetCustodians.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Designated Cash Custodians
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activity.budgetCustodians.map((c) => (
                      <div key={c.id} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between shadow-2xs">
                        <div>
                          <p className="text-xs font-bold text-[#001A4D]">{c.personName}</p>
                          <p className="text-[10px] text-gray-500">{c.purpose} • {c.personRole || 'Custodian'}</p>
                        </div>
                        <span className="font-mono font-bold text-xs text-emerald-700">
                          {formatCurrency(c.allocatedAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: POST-ACTIVITY REPORT (PAR) */}
          {activeTab === 'par' && (
            <div className="space-y-6">
              {/* PAR Status Banner */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                    <FileCheck2 className="w-5 h-5 text-[#FFD41C]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      Post-Activity Report (PAR) Status
                    </span>
                    <p className="font-bold text-[#001A4D] text-sm">
                      {par ? `Reference No: ${par.referenceNo}` : 'Report Not Filed'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {par
                        ? `Authored by ${par.createdByName} (${par.creatorRole})`
                        : 'Post-Activity Report evaluates activity turnout, objective achievement, and event highlights.'}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 font-bold text-xs rounded-full border shrink-0 ${parBadge.color}`}>
                  {parBadge.label}
                </span>
              </div>

              {par ? (
                <div className="space-y-6">
                  {/* Attendance & Turnout Metric Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl shadow-2xs">
                      <span className="text-xs font-semibold text-blue-700 block mb-1">Target Expected</span>
                      <div className="text-2xl font-bold font-mono text-[#001A4D]">
                        {activity.expectedParticipantCount || par.expectedParticipants || 0}
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1 block">Students from proposal</span>
                    </div>

                    <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl shadow-2xs">
                      <span className="text-xs font-semibold text-emerald-700 block mb-1">Actual Attendance</span>
                      <div className="text-2xl font-bold font-mono text-emerald-800">
                        {par.actualAttendanceCount ?? '—'}
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1 block">Scanned / recorded participants</span>
                    </div>

                    <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl shadow-2xs">
                      <span className="text-xs font-semibold text-purple-700 block mb-1">Turnout Percentage</span>
                      <div className="text-2xl font-bold font-mono text-purple-800">
                        {par.turnoutRate ? `${par.turnoutRate}%` : '—'}
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1 block">Participation rate</span>
                    </div>
                  </div>

                  {/* Objectives Achievement Matrix */}
                  {par.objectivesAssessment && par.objectivesAssessment.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                        Objectives Assessment Matrix
                      </h4>
                      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#001A4D] text-white">
                            <tr>
                              <th className="p-3 font-bold uppercase">Target Objective</th>
                              <th className="p-3 font-bold uppercase text-center">Status</th>
                              <th className="p-3 font-bold uppercase">Officer Remarks / Evidence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {par.objectivesAssessment.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/80">
                                <td className="p-3 font-medium text-gray-800 max-w-[280px]">
                                  {item.objective}
                                </td>
                                <td className="p-3 text-center whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                    item.status === 'fully_achieved'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : item.status === 'partially_achieved'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {item.status === 'fully_achieved'
                                      ? 'Fully Achieved'
                                      : item.status === 'partially_achieved'
                                      ? 'Partially Achieved'
                                      : 'Unmet'}
                                  </span>
                                </td>
                                <td className="p-3 text-gray-600">{item.remarks || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Qualitative Feedback */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <h5 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                        Highlights & Achievements
                      </h5>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        {par.highlights || 'No qualitative highlights recorded.'}
                      </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <h5 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                        Challenges & Recommendations
                      </h5>
                      <p className="text-xs text-gray-700 leading-relaxed">
                        {par.challengesAndRecommendations || 'No recommendations recorded.'}
                      </p>
                    </div>
                  </div>

                  {/* Photo Attachments Count */}
                  {par.photos && par.photos.length > 0 && (
                    <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl flex items-center justify-between text-xs">
                      <span className="font-semibold text-purple-900">
                        Documentation Photos Attached:
                      </span>
                      <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 font-bold rounded-full">
                        {par.photos.length} Photo(s) Recorded
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl">
                  <FileCheck2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-gray-600">No Post-Activity Report Filed Yet</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                    The student club officers have not yet completed or submitted the official Post-Activity Report for this activity.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-400 font-mono">
            Activity ID: {activity.id}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#001A4D] text-white rounded-xl text-xs font-bold hover:bg-[#0E4EBD] transition-colors cursor-pointer"
          >
            Close Activity Details
          </button>
        </div>

      </div>
    </div>
  );
}
