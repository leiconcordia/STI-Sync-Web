import React, { useState } from 'react';
import {
  FileText,
  Target,
  Calendar,
  DollarSign,
  Wrench,
  X,
  Copy,
  Check,
  Users,
  MapPin,
  Sparkles,
  Megaphone,
  Camera,
  ClipboardList,
  Clock,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '../../../utils/currency';

interface PARProposalGuidanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  proposalData: any;
  eventData: any;
  onCopyText?: (text: string, label: string) => void;
  onInsertObjectiveResult?: (objText: string, indicatorText?: string) => void;
}

type GuidanceTab = 'overview' | 'objectives' | 'logistics' | 'financial';

export default function PARProposalGuidanceDrawer({
  isOpen,
  onClose,
  proposalData,
  eventData,
}: PARProposalGuidanceDrawerProps) {
  const [activeTab, setActiveTab] = useState<GuidanceTab>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} from Activity Proposal!`);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Canonical AP Fields (merged cleanly with fallback to eventData if AP fields absent)
  const title: string = proposalData?.title || eventData?.title || 'Activity Proposal';
  const referenceNo: string =
    proposalData?.referenceNo || eventData?.referenceId || eventData?.proposalReferenceNo || 'Activity Proposal';
  const description: string = proposalData?.description || eventData?.description || '';
  const submissionDate: string = proposalData?.submissionDate || '';
  const status: string = proposalData?.status || eventData?.proposalStatus || '';

  const organizers: string[] =
    Array.isArray(proposalData?.organizers) && proposalData.organizers.length > 0
      ? proposalData.organizers
      : Array.isArray(eventData?.organizers) && eventData.organizers.length > 0
      ? eventData.organizers
      : [proposalData?.organizationName || eventData?.hostingOrgName || eventData?.org || 'Student Affairs Services'];

  const proponents: string[] = Array.isArray(proposalData?.proponents)
    ? proposalData.proponents.filter(Boolean)
    : [];

  const objectives: string[] = proposalData?.objectives || eventData?.objectives || [];
  const successIndicators: string[] = proposalData?.successIndicators || eventData?.successIndicators || [];
  const mechanics: string[] = proposalData?.mechanics || eventData?.mechanics || [];
  const materials: string[] = proposalData?.materials || eventData?.materials || [];
  const marketingPlan: string[] = proposalData?.marketingPlan || eventData?.marketingPlan || [];
  const documentationPlan: string[] = proposalData?.documentationPlan || eventData?.documentationPlan || [];
  const tasks: any[] = Array.isArray(proposalData?.tasks) ? proposalData.tasks : [];

  // Target Market & Estimated Attendance
  const aud = proposalData?.targetAudience || eventData?.targetAudience || {};
  const targetMarketParts: string[] = [];
  if (aud?.allStudents) {
    targetMarketParts.push('All Enrolled Students');
  } else {
    if (Array.isArray(aud?.academicLevels) && aud.academicLevels.length > 0) {
      targetMarketParts.push(aud.academicLevels.join(', '));
    }
    if (Array.isArray(aud?.courseCodes) && aud.courseCodes.length > 0) {
      targetMarketParts.push(aud.courseCodes.join(', '));
    } else if (Array.isArray(aud?.departments) && aud.departments.length > 0) {
      targetMarketParts.push(aud.departments.join(', '));
    }
    if (Array.isArray(aud?.yearLevels) && aud.yearLevels.length > 0) {
      targetMarketParts.push(`Year Levels: ${aud.yearLevels.join(', ')}`);
    }
    if (Array.isArray(aud?.sections) && aud.sections.length > 0) {
      targetMarketParts.push(`Sections: ${aud.sections.join(', ')}`);
    }
  }
  if (aud?.includeFaculty) {
    targetMarketParts.push(`Faculty (${aud.facultyCount || 'Included'})`);
  }
  if (Array.isArray(aud?.customTargetMarkets) && aud.customTargetMarkets.length > 0) {
    aud.customTargetMarkets.forEach((c: any) => {
      if (c?.name) targetMarketParts.push(`${c.name}${c.count ? ` (${c.count})` : ''}`);
    });
  }

  const targetMarketDisplay: string =
    proposalData?.targetMarket ||
    aud?.targetMarketSummary ||
    (targetMarketParts.length > 0 ? targetMarketParts.join(' • ') : '') ||
    proposalData?.targetAudienceText ||
    eventData?.targetAudienceText ||
    'Not specified in proposal';

  const estCount =
    Number(proposalData?.estAttendanceCount) ||
    Number(aud?.demographicBreakdown?.expectedAttendees) ||
    Number(aud?.expectedAttendees) ||
    (proposalData?.estimatedAttendance
      ? parseInt(String(proposalData.estimatedAttendance).match(/\d+/)?.[0] || '0', 10)
      : 0) ||
    Number(eventData?.estAttendanceCount) ||
    Number(eventData?.expectedParticipantCount) ||
    0;

  const estQualifier =
    proposalData?.estAttendanceQualifier ||
    (typeof proposalData?.estimatedAttendance === 'string'
      ? proposalData.estimatedAttendance.replace(/^\d+\s*/, '').trim()
      : '') ||
    eventData?.estAttendanceQualifier ||
    'participants';

  const estAttendanceDisplay =
    proposalData?.estimatedAttendance ||
    (estCount > 0 ? `${estCount} ${estQualifier}` : 'Not specified in proposal');

  // Schedule & Venue
  const venueDisplay =
    proposalData?.venueName ||
    proposalData?.customVenueName ||
    proposalData?.venue ||
    eventData?.venueName ||
    eventData?.venue ||
    'Campus Venue';

  const sessions: any[] = Array.isArray(proposalData?.sessions)
    ? proposalData.sessions
    : Array.isArray(eventData?.sessions)
    ? eventData.sessions
    : [];

  const singleDateTime = proposalData?.date
    ? `${proposalData.date}${proposalData.startTime ? ` (${proposalData.startTime}${proposalData.endTime ? ` – ${proposalData.endTime}` : ''})` : ''}`
    : eventData?.date
    ? `${eventData.date}${eventData.startTime ? ` (${eventData.startTime}${eventData.endTime ? ` – ${eventData.endTime}` : ''})` : ''}`
    : '';

  // Financials: read canonical financialProjections first, fallback to legacy flat fields
  const proj = proposalData?.financialProjections;
  const revenueItems: any[] = Array.isArray(proj?.revenues) ? proj.revenues : [];
  const expenseItems: any[] =
    Array.isArray(proj?.expenses) && proj.expenses.length > 0
      ? proj.expenses
      : proposalData?.lineItems || eventData?.lineItems || [];

  const totalRevenue = Number(
    proj?.totalRevenue ??
      proposalData?.allocatedBudget ??
      proposalData?.totalProposedBudget ??
      0
  );
  const totalExpenses = Number(
    proj?.totalExpenses ??
      proposalData?.totalExpenseAmount ??
      proposalData?.totalBudget ??
      eventData?.budget ??
      0
  );
  const netBalance = Number(proj?.balance ?? totalRevenue - totalExpenses);
  const fundingSource = proposalData?.fundingSource || eventData?.fundingSource || '';
  const fundingSourceLabel =
    fundingSource === 'organization_funds'
      ? 'Organization Funds'
      : fundingSource === 'school_budget'
      ? 'School Budget'
      : fundingSource === 'zero_budget'
      ? 'Zero Budget / Non-Monetary'
      : fundingSource || 'Not specified';

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-200 text-gray-800">
      {/* Top Header */}
      <div className="p-4 bg-gradient-to-r from-[#001A4D] via-[#0E4EBD] to-[#001A4D] text-white flex items-center justify-between shrink-0 shadow-sm">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[#FFD41C] text-[10px] font-mono font-bold uppercase tracking-wider">
              {referenceNo}
            </span>
            {status && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold uppercase">
                {status.replace(/_/g, ' ')}
              </span>
            )}
            <span className="text-[11px] font-bold text-blue-100">
              Activity Proposal Reference
            </span>
          </div>
          <h3 className="text-sm font-extrabold text-white truncate mt-1">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          title="Close Activity Proposal Reference"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {!proposalData && (
        <div className="mx-4 mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Showing synced event snapshot. Some proposal-only details may not have been linked on older records.
          </span>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex border-b border-gray-200 bg-gray-50/80 px-2 pt-2 gap-1 shrink-0 overflow-x-auto text-xs">
        {[
          { id: 'overview', label: 'Overview & Venue', icon: FileText },
          { id: 'objectives', label: 'Objectives & Mechanics', icon: Target },
          { id: 'logistics', label: 'Target, Logistics & Docs', icon: Wrench },
          { id: 'financial', label: `Financials & Tasks`, icon: DollarSign },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as GuidanceTab)}
              className={`px-3 py-2 rounded-t-xl font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                active
                  ? 'border-[#0E4EBD] text-[#0E4EBD] bg-white shadow-2xs'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* TAB 1: OVERVIEW, DESCRIPTION, ORGANIZERS, DATE & TIME, VENUE */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                    Activity title:
                  </span>
                  <p className="font-bold text-gray-900 text-xs mt-0.5">{title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(title, 'title', 'Activity title')}
                  className="p-1 text-gray-400 hover:text-[#0E4EBD]"
                  title="Copy Activity title"
                >
                  {copiedKey === 'title' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {submissionDate && (
                <div className="text-[11px] text-gray-600">
                  <span className="font-bold text-gray-700">Proposal Date Submitted: </span>
                  <span>{submissionDate}</span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-200/70">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Description:
                  </span>
                  {description && (
                    <button
                      type="button"
                      onClick={() => handleCopy(description, 'desc', 'Description')}
                      className="p-1 text-gray-400 hover:text-[#0E4EBD]"
                      title="Copy Description"
                    >
                      {copiedKey === 'desc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-line">
                  {description || 'No description provided in proposal.'}
                </p>
              </div>
            </div>

            {/* Organizer/s & Proponents */}
            <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#001A4D] block">
                Organizer/s:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {organizers.map((org, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-blue-50 text-[#001A4D] border border-blue-200 text-[11px] font-semibold"
                  >
                    {org}
                  </span>
                ))}
              </div>
              {proponents.length > 0 && (
                <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-600">
                  <span className="font-bold text-gray-700">Proponents / Co-makers: </span>
                  <span>{proponents.join(', ')}</span>
                </div>
              )}
              {(proposalData?.createdByName || eventData?.organizerName) && (
                <div className="text-[11px] text-gray-500">
                  <span className="font-semibold">Proposal Prepared by: </span>
                  <span>{proposalData?.createdByName || eventData?.organizerName}</span>
                </div>
              )}
            </div>

            {/* Date & Time + Venue */}
            <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2.5">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#0E4EBD] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[11px] text-gray-700 block">Venue:</span>
                  <span className="text-[11px] text-gray-700">
                    {venueDisplay}
                    {proposalData?.venueType ? ` (${proposalData.venueType === 'outside' ? 'Off-Campus' : 'On-Campus'})` : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
                <Clock className="w-3.5 h-3.5 text-[#0E4EBD] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold text-[11px] text-gray-700 block mb-1">Date & time:</span>
                  {sessions.length > 0 ? (
                    <div className="space-y-1.5">
                      {sessions.map((s: any, idx: number) => (
                        <div key={s.id || idx} className="p-2 bg-gray-50 rounded-lg border border-gray-100 text-[11px]">
                          <p className="font-bold text-gray-800">{s.title || `Session ${idx + 1}`}</p>
                          <p className="text-gray-600">
                            {s.date}
                            {s.startTime ? ` • ${s.startTime}${s.endTime ? ` – ${s.endTime}` : ''}` : ''}
                            {s.venueName ? ` • ${s.venueName}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-700">
                      {singleDateTime || 'Date and time not specified in proposal.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OBJECTIVES, KPI INDICATORS & MECHANICS */}
        {activeTab === 'objectives' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Compare actual outcomes against these approved Activity Proposal objectives, success indicators, and mechanics.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-extrabold uppercase tracking-wider text-[11px] text-[#001A4D] flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>Objectives ({objectives.length})</span>
              </h4>

              {objectives.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No formal objectives listed in proposal.</p>
              ) : (
                <div className="space-y-2">
                  {objectives.map((obj, i) => (
                    <div
                      key={`obj-${i}`}
                      className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-gray-700 text-[11px] leading-snug">
                          {i + 1}. {obj}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(obj, `obj-${i}`, 'Objective')}
                          className="shrink-0 p-1 text-gray-400 hover:text-[#0E4EBD]"
                          title="Copy objective text"
                        >
                          {copiedKey === `obj-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {successIndicators[i] && (
                        <div className="pt-2 border-t border-gray-200/60 text-[10px] text-gray-500">
                          <span className="font-bold text-gray-700">Success indicator: </span>
                          <span>{successIndicators[i]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {successIndicators.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <h4 className="font-extrabold uppercase tracking-wider text-[11px] text-[#001A4D]">
                  Success Indicators ({successIndicators.length})
                </h4>
                <div className="space-y-1.5">
                  {successIndicators.map((ind, i) => (
                    <div
                      key={`ind-${i}`}
                      className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-start justify-between gap-2"
                    >
                      <span className="text-[11px] text-gray-700 font-medium leading-tight">• {ind}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(ind, `ind-${i}`, 'Success indicator')}
                        className="shrink-0 p-1 text-gray-400 hover:text-[#0E4EBD]"
                        title="Copy indicator"
                      >
                        {copiedKey === `ind-${i}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold uppercase tracking-wider text-[11px] text-[#001A4D] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  <span>Mechanics ({mechanics.length})</span>
                </h4>
                {mechanics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopy(mechanics.join('\n'), 'mech-all', 'Mechanics')}
                    className="text-[10px] font-bold text-[#0E4EBD] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy All
                  </button>
                )}
              </div>
              {mechanics.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No mechanics registered in proposal.</p>
              ) : (
                <ol className="space-y-1.5 list-decimal list-inside text-gray-700">
                  {mechanics.map((step, idx) => (
                    <li key={`mech-${idx}`} className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 leading-snug text-[11px]">
                      <span className="font-medium">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TARGET MARKET, EST. ATTENDANCE, MATERIALS, MARKETING, DOCUMENTATION */}
        {activeTab === 'logistics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-[10px] font-bold text-[#0E4EBD] uppercase tracking-wider block">
                  Est. Attendance (Proposal)
                </span>
                <p className="font-extrabold text-sm text-[#001A4D] mt-0.5">{estAttendanceDisplay}</p>
              </div>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                  Target Market
                </span>
                <p className="font-bold text-[11px] text-gray-800 mt-0.5">{targetMarketDisplay}</p>
              </div>
            </div>

            {aud?.demographicBreakdown && (
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-[11px] text-gray-600">
                <span>
                  Demographic Basis: SHS <strong>{aud.demographicBreakdown.shsTotal || 0}</strong> • College{' '}
                  <strong>{aud.demographicBreakdown.collegeTotal || 0}</strong>
                  {aud.demographicBreakdown.facultyTotal ? ` • Faculty ${aud.demographicBreakdown.facultyTotal}` : ''}
                </span>
                {aud.demographicBreakdown.expectedReachPercentage ? (
                  <span className="font-bold text-[#001A4D]">
                    {aud.demographicBreakdown.expectedReachPercentage}% Target Reach
                  </span>
                ) : null}
              </div>
            )}

            {/* Materials */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-900 text-xs">Materials:</h4>
                {materials.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopy(materials.join('\n'), 'mats', 'Materials')}
                    className="text-[10px] font-bold text-[#0E4EBD] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
              {materials.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No materials listed in proposal.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {materials.map((m, i) => (
                    <span key={`mat-${i}`} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-medium">
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Marketing */}
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  <span>Marketing:</span>
                </h4>
                {marketingPlan.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopy(marketingPlan.join('\n'), 'mkt', 'Marketing Plan')}
                    className="text-[10px] font-bold text-[#0E4EBD] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
              {marketingPlan.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No marketing plan items registered.</p>
              ) : (
                <ul className="space-y-1">
                  {marketingPlan.map((m, i) => (
                    <li key={`mkt-${i}`} className="text-[11px] text-gray-600 font-medium">
                      • {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Documentation */}
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  <span>Documentation:</span>
                </h4>
                {documentationPlan.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCopy(documentationPlan.join('\n'), 'docs', 'Documentation Plan')}
                    className="text-[10px] font-bold text-[#0E4EBD] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
              {documentationPlan.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No documentation items registered.</p>
              ) : (
                <ul className="space-y-1">
                  {documentationPlan.map((d, i) => (
                    <li key={`doc-${i}`} className="text-[11px] text-gray-600 font-medium">
                      • {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: FINANCIAL PROJECTIONS (REVENUES / EXPENSES / BALANCE) & TASK LIST */}
        {activeTab === 'financial' && (
          <div className="space-y-4">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[11px]">
              <span className="font-semibold text-gray-600">Funding Source:</span>
              <span className="font-bold text-[#001A4D]">{fundingSourceLabel}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-[10px] font-bold text-[#0E4EBD] uppercase block">Projected Revenue</span>
                <p className="font-extrabold text-xs text-[#001A4D] font-mono mt-0.5">
                  {formatCurrency(totalRevenue)}
                </p>
              </div>
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase block">Projected Expenses</span>
                <p className="font-extrabold text-xs text-gray-800 font-mono mt-0.5">
                  {formatCurrency(totalExpenses)}
                </p>
              </div>
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-700 uppercase block">Projected Balance</span>
                <p className="font-extrabold text-xs text-emerald-900 font-mono mt-0.5">
                  {formatCurrency(netBalance)}
                </p>
              </div>
            </div>

            {revenueItems.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="font-bold text-gray-900 text-xs">Proposed Revenues ({revenueItems.length}):</h4>
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                  {revenueItems.map((item: any, i: number) => (
                    <div key={`rev-${i}`} className="p-2.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-700 text-[11px]">
                        {item.description || 'Revenue Item'}
                      </span>
                      <span className="font-bold text-[#001A4D] font-mono text-[11px]">
                        {formatCurrency(Number(item.totalAmount ?? item.thisYearProposed ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <h4 className="font-bold text-gray-900 text-xs">Proposed Expenses ({expenseItems.length}):</h4>
              {expenseItems.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No monetary expense items recorded in proposal.</p>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                  {expenseItems.map((item: any, i: number) => (
                    <div key={`exp-${i}`} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-gray-800 text-[11px]">
                          {item.description || item.particulars || item.item || 'Expense Item'}
                        </p>
                        {item.remarks && (
                          <p className="text-[10px] text-gray-400">{item.remarks}</p>
                        )}
                      </div>
                      <span className="font-bold text-[#001A4D] font-mono text-xs">
                        {formatCurrency(Number(item.totalAmount ?? item.totalCost ?? item.thisYearProposed ?? item.total ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Task List */}
            <div className="space-y-1.5 pt-2 border-t border-gray-100">
              <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>Task List ({tasks.length}):</span>
              </h4>
              {tasks.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No committee tasks recorded in proposal.</p>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                  {tasks.map((t: any, i: number) => (
                    <div key={t.id || i} className="p-2.5 flex items-center justify-between gap-2 text-[11px]">
                      <div>
                        <p className="font-bold text-gray-800">{t.taskName || 'Task'}</p>
                        <p className="text-[10px] text-gray-500">Assigned: {t.assignedPerson || '—'}</p>
                      </div>
                      <span className="text-[10px] font-mono text-gray-600 shrink-0">
                        {t.completionDate || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-500 shrink-0">
        <span>
          Organizer/s: <strong className="text-gray-700">{organizers.join(', ')}</strong>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-xs font-semibold cursor-pointer"
        >
          Close Drawer
        </button>
      </div>
    </div>
  );
}
