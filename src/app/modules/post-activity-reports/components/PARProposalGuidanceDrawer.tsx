import React, { useState } from 'react';
import {
  FileText, Target, Calendar, DollarSign, Wrench, X,
  Copy, Check, ChevronRight, Download, Users, MapPin, Sparkles, Megaphone
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

type GuidanceTab = 'objectives' | 'mechanics' | 'financial' | 'logistics';

export default function PARProposalGuidanceDrawer({
  isOpen,
  onClose,
  proposalData,
  eventData,
  onCopyText,
  onInsertObjectiveResult,
}: PARProposalGuidanceDrawerProps) {
  const [activeTab, setActiveTab] = useState<GuidanceTab>('objectives');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string, label: string) => {
    if (onCopyText) {
      onCopyText(text, label);
    } else {
      navigator.clipboard.writeText(text);
      toast.success(`Copied ${label} to clipboard!`);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const objectives: string[] =
    proposalData?.objectives || eventData?.objectives || [];
  const successIndicators: string[] =
    proposalData?.successIndicators || eventData?.successIndicators || [];
  const mechanics: string[] =
    proposalData?.mechanics || eventData?.mechanics || [];
  const materials: string[] =
    proposalData?.materials || eventData?.materials || [];
  const lineItems: any[] =
    proposalData?.lineItems || eventData?.lineItems || [];
  const marketingPlan: string[] =
    proposalData?.marketingPlan || eventData?.marketingPlan || [];
  const documentationPlan: string[] =
    proposalData?.documentationPlan || eventData?.documentationPlan || [];

  const totalExpense =
    Number(proposalData?.totalExpenseAmount ?? proposalData?.totalBudget ?? eventData?.budget ?? 0);
  const allocatedBudget =
    Number(proposalData?.allocatedBudget ?? proposalData?.totalProposedBudget ?? totalExpense);

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-200 text-gray-800">
      {/* Top Header */}
      <div className="p-4 bg-gradient-to-r from-[#001A4D] via-[#0E4EBD] to-[#001A4D] text-white flex items-center justify-between shrink-0 shadow-sm">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[#FFD41C] text-[10px] font-mono font-bold uppercase tracking-wider">
              {proposalData?.referenceNo || eventData?.referenceId || 'Form AP-01'}
            </span>
            <span className="text-xs font-bold text-white truncate">
              Proposal Guidance
            </span>
          </div>
          <h3 className="text-sm font-extrabold text-white truncate mt-0.5">
            {proposalData?.title || eventData?.title || 'Activity Proposal'}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
          title="Close guidance panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-gray-200 bg-gray-50/80 px-2 pt-2 gap-1 shrink-0 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('objectives')}
          className={`px-3 py-2 rounded-t-xl font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'objectives'
              ? 'border-[#0E4EBD] text-[#0E4EBD] bg-white shadow-2xs'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>Objectives & KPIs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mechanics')}
          className={`px-3 py-2 rounded-t-xl font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'mechanics'
              ? 'border-[#0E4EBD] text-[#0E4EBD] bg-white shadow-2xs'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Mechanics</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('financial')}
          className={`px-3 py-2 rounded-t-xl font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'financial'
              ? 'border-[#0E4EBD] text-[#0E4EBD] bg-white shadow-2xs'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Budget ({lineItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logistics')}
          className={`px-3 py-2 rounded-t-xl font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'logistics'
              ? 'border-[#0E4EBD] text-[#0E4EBD] bg-white shadow-2xs'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Logistics</span>
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* TAB 1: Objectives & KPIs */}
        {activeTab === 'objectives' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Compare your post-activity results against these approved targets. You can reference or copy any objective directly into your report narrative.
              </p>
            </div>

            {/* Objectives */}
            <div className="space-y-2">
              <h4 className="font-extrabold uppercase tracking-wider text-[11px] text-[#001A4D] flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>Approved Objectives ({objectives.length})</span>
              </h4>

              {objectives.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No formal objectives listed in proposal.</p>
              ) : (
                <div className="space-y-2">
                  {objectives.map((obj, i) => (
                    <div
                      key={`obj-${i}`}
                      className="p-3 bg-gray-50 hover:bg-blue-50/50 border border-gray-200 hover:border-blue-200 rounded-xl transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-gray-700 text-[11px] leading-snug">
                          {i + 1}. {obj}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(obj, `obj-${i}`, 'Objective')}
                          className="shrink-0 p-1 text-gray-400 hover:text-[#0E4EBD] rounded hover:bg-white transition-colors"
                          title="Copy objective text"
                        >
                          {copiedKey === `obj-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Matching success indicator if mapped by index */}
                      {successIndicators[i] && (
                        <div className="pt-2 border-t border-gray-200/60 text-[10px] text-gray-500">
                          <span className="font-bold text-gray-700">KPI Indicator: </span>
                          <span>{successIndicators[i]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Success Indicators List */}
            {successIndicators.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <h4 className="font-extrabold uppercase tracking-wider text-[11px] text-[#001A4D]">
                  Target Success Indicators / KPIs ({successIndicators.length})
                </h4>
                <div className="space-y-1.5">
                  {successIndicators.map((ind, i) => (
                    <div
                      key={`ind-${i}`}
                      className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-start justify-between gap-2"
                    >
                      <span className="text-[11px] text-gray-700 font-medium leading-tight">
                        • {ind}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(ind, `ind-${i}`, 'KPI')}
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
          </div>
        )}

        {/* TAB 2: Mechanics & Schedule */}
        {activeTab === 'mechanics' && (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">
                Conducted Procedures
              </span>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                In the PAR, note down only if your actual procedures differed from these proposed mechanics.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-xs">Proposed Program Flow / Mechanics:</h4>
              {mechanics.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No step-by-step mechanics registered in proposal.</p>
              ) : (
                <ol className="space-y-2 list-decimal list-inside text-gray-700">
                  {mechanics.map((step, idx) => (
                    <li key={`mech-${idx}`} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 leading-snug">
                      <span className="font-medium">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Financial Projection */}
        {activeTab === 'financial' && (
          <div className="space-y-4">
            {/* Header Totals */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-[10px] font-bold text-[#0E4EBD] uppercase tracking-wider">Approved Budget</span>
                <p className="font-extrabold text-sm text-[#001A4D] font-mono mt-0.5">
                  {formatCurrency(allocatedBudget)}
                </p>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Projected Cost</span>
                <p className="font-extrabold text-sm text-gray-800 font-mono mt-0.5">
                  {formatCurrency(totalExpense)}
                </p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-xs">Itemized Budget Line Items:</h4>
              {lineItems.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">₱0 Non-monetary activity or no line items recorded.</p>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 bg-white">
                  {lineItems.map((item, i) => (
                    <div key={`li-${i}`} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-gray-800 text-[11px]">{item.description || item.particulars || 'Item'}</p>
                        <p className="text-[10px] text-gray-400 font-mono">
                          {item.quantity ? `${item.quantity} x ` : ''}
                          {formatCurrency(Number(item.unitCost || item.unitAmount || 0))}
                        </p>
                      </div>
                      <span className="font-bold text-[#001A4D] font-mono text-xs">
                        {formatCurrency(Number(item.totalCost || item.totalAmount || 0))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Logistics & Marketing */}
        {activeTab === 'logistics' && (
          <div className="space-y-4">
            {/* Target Audience & Venue */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <div className="flex items-center gap-2 text-gray-700">
                <Users className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span className="font-bold text-[11px]">Target Audience:</span>
                <span className="text-[11px] truncate">{proposalData?.targetAudienceText || eventData?.targetAudienceText || 'Enrolled Students'}</span>
              </div>

              <div className="flex items-center gap-2 text-gray-700">
                <MapPin className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span className="font-bold text-[11px]">Assigned Venue:</span>
                <span className="text-[11px] truncate">{proposalData?.venueName || eventData?.venue || 'Campus Venue'}</span>
              </div>
            </div>

            {/* Materials List */}
            <div className="space-y-1.5">
              <h4 className="font-bold text-gray-900 text-xs">Materials / Equipment Planned:</h4>
              {materials.length === 0 ? (
                <p className="text-gray-400 italic text-[11px]">No specific materials registered.</p>
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

            {/* Marketing Channels */}
            {marketingPlan.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  <span>Marketing & Promotion Channels:</span>
                </h4>
                <div className="space-y-1">
                  {marketingPlan.map((m, i) => (
                    <p key={`mkt-${i}`} className="text-[11px] text-gray-600 font-medium">
                      • {m}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Note */}
      <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-500 shrink-0">
        <span>Sponsoring: <strong className="text-gray-700">{eventData?.org || proposalData?.organizationName || 'Student Org'}</strong></span>
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
