/**
 * src/app/signatory/pages/SignatoryLiquidationsPage.tsx
 *
 * Dedicated institutional audit portal for Financial Liquidations (Form LF-01).
 * Features sub-tabs: Pending My Signature | Signed History & Archive | Returned for Revision.
 */

import React, { useState } from 'react';
import { useOutletContext } from 'react-router';
import {
  FileSpreadsheet,
  Search,
  Clock,
  CheckCircle2,
  RotateCcw,
  Building,
  Calendar,
  Send,
  Eye,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
} from 'lucide-react';
import { useSignatoryDocuments } from '../hooks/useSignatoryDocuments';
import { formatCurrency, formatVariance } from '../../utils/currency';
import LiquidationEndorsementModal from '../components/LiquidationEndorsementModal';
import type { LiquidationDocument } from '../../modules/finance/types/liquidation.types';

interface ContextType {
  session: any;
  onOpenSignatureModal: () => void;
  onOpenPasswordModal: () => void;
}

export default function SignatoryLiquidationsPage() {
  const { session, onOpenSignatureModal } = useOutletContext<ContextType>();
  const {
    pendingLiquidations,
    endorsedLiquidations,
    returnedLiquidations,
    loading,
  } = useSignatoryDocuments(session);

  const [activeTab, setActiveTab] = useState<'pending' | 'endorsed' | 'returned'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLiquidation, setSelectedLiquidation] = useState<LiquidationDocument | null>(null);

  const currentList =
    activeTab === 'pending'
      ? pendingLiquidations
      : activeTab === 'endorsed'
      ? endorsedLiquidations
      : returnedLiquidations;

  const filteredList = currentList.filter((l) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const title = (l.activityTitle || '').toLowerCase();
    const org = (l.organizationName || '').toLowerCase();
    const ref = (l.id || '').toLowerCase();
    return title.includes(q) || org.includes(q) || ref.includes(q);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-2">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
          <span>Financial Liquidation Audit Center</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#001A4D] tracking-tight">
          Financial Liquidation
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Inspect official disbursement receipts, verify surplus/deficit balances, and record financial endorsements.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'pending'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Pending My Signature</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'pending' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {pendingLiquidations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('endorsed')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'endorsed'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Signed History & Archive</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'endorsed' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {endorsedLiquidations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('returned')}
          className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'returned'
              ? 'bg-[#001A4D] text-[#FFD41C] shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Returned for Revision</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'returned' ? 'bg-[#FFD41C] text-[#001A4D]' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {returnedLiquidations.length}
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search liquidations by activity title or student club..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:outline-none transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* Liquidation Cards List */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Liquidations in this category</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              {activeTab === 'pending'
                ? 'All financial liquidation reports for your stage are cleared.'
                : 'No liquidations currently match this archive filter.'}
            </p>
          </div>
        ) : (
          filteredList.map((liq) => {
            const allocated = liq.allocatedBudget || 0;
            const spent = liq.totalActualSpending || 0;
            const variance = liq.surplusOrDeficit ?? (allocated - spent);
            const isDeficit = variance < 0;

            return (
              <div
                key={liq.id}
                onClick={() => setSelectedLiquidation(liq)}
                className="bg-white hover:bg-slate-50/80 rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-700 text-white">
                      Liquidation
                    </span>
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-slate-400" />
                      {liq.organizationName || 'Student Club'}
                    </span>
                    <span className="text-xs text-slate-400">
                      • Stage {liq.currentStageIndex ?? 1}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-[#001A4D] hover:text-[#0E4EBD] transition-colors">
                    {liq.activityTitle}
                  </h3>

                  <div className="flex items-center gap-4 text-xs flex-wrap">
                    <span className="text-slate-500">
                      Allocated: <strong>{formatCurrency(allocated)}</strong>
                    </span>
                    <span className="text-slate-500">
                      Actual Spent: <strong>{formatCurrency(spent)}</strong>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold flex items-center gap-1 ${
                        isDeficit
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isDeficit ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      <span>{isDeficit ? `Deficit: ${formatVariance(variance)}` : `Surplus: ${formatVariance(variance)}`}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center">
                  <button
                    type="button"
                    onClick={() => setSelectedLiquidation(liq)}
                    className="px-4 py-2 rounded-xl bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                  >
                    {activeTab === 'pending' ? (
                      <>
                        <Send className="w-3.5 h-3.5 text-[#FFD41C]" />
                        <span>Audit & Endorse</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#FFD41C]" />
                        <span>View Ledger</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Liquidation Modal */}
      {selectedLiquidation && (
        <LiquidationEndorsementModal
          isOpen={Boolean(selectedLiquidation)}
          liquidation={selectedLiquidation}
          signatorySession={session}
          onClose={() => setSelectedLiquidation(null)}
          onOpenSignaturePad={onOpenSignatureModal}
        />
      )}
    </div>
  );
}
