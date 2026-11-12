import React, { useMemo, useEffect } from 'react';
import {
  Wallet,
  Landmark,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react';
import type { ActivityFundingSource } from '../../types/proposal.types';
import { useOrgLedger, useSaoLedger } from '../../../finance/hooks/useFinanceStream';

interface FundingSourceSelectorProps {
  value?: ActivityFundingSource;
  onChange: (source: ActivityFundingSource, note?: string) => void;
  organizationId?: string | null;
  organizationName?: string;
  isOfficer?: boolean;
  proposedBudget?: number;
  className?: string;
}

export default function FundingSourceSelector({
  value = 'school_budget',
  onChange,
  organizationId,
  organizationName,
  isOfficer = false,
  proposedBudget = 0,
  className = '',
}: FundingSourceSelectorProps) {
  // Streams for live available treasury balance (only used if officer proposal)
  const { data: orgLedgerData = [], loading: orgLoading } = useOrgLedger(isOfficer ? (organizationId || null) : null);
  const { data: saoLedgerData = [], loading: saoLoading } = useSaoLedger();

  // If not an officer proposal (e.g. SAS Admin/Institutional), organization_funds is not allowed
  useEffect(() => {
    if (!isOfficer && value === 'organization_funds') {
      onChange('school_budget');
    }
  }, [isOfficer, value, onChange]);

  const orgTreasuryBalance = useMemo(() => {
    if (!isOfficer || !orgLedgerData || orgLedgerData.length === 0) return 0;
    const totalIncome = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalExpenses = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return Math.max(0, totalIncome - totalExpenses);
  }, [isOfficer, orgLedgerData]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const hasShortage =
    isOfficer &&
    value === 'organization_funds' &&
    proposedBudget > 0 &&
    orgTreasuryBalance < proposedBudget;

  return (
    <div className={`space-y-3.5 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
            Funding Source & Budget Origin <span className="text-red-500">*</span>
          </label>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {isOfficer
              ? 'Select who funds this activity to apply appropriate approval routing and ledger encumbrance.'
              : 'Institutional activities organized by SAS are funded through central school budget allocation.'}
          </p>
        </div>
        {isOfficer && value === 'organization_funds' && (
          <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
            {orgLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                <span>Checking ledger...</span>
              </>
            ) : (
              <>
                <Wallet className="w-3.5 h-3.5 text-purple-600" />
                <span>Live Club Balance: <strong className="font-mono">{formatCurrency(orgTreasuryBalance)}</strong></span>
              </>
            )}
          </span>
        )}
        {!isOfficer && (
          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
            <Landmark className="w-3.5 h-3.5 text-blue-600" />
            <span>Institutional / SAS Admin Allocation</span>
          </span>
        )}
      </div>

      {/* Interactive Options: 3 cards for Officers, 2 cards for SAS Admin */}
      <div className={`grid grid-cols-1 ${isOfficer ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3`}>
        {/* Option 1: Organization Own Funds (Only shown for Student Officers / Clubs) */}
        {isOfficer && (
          <button
            type="button"
            onClick={() => onChange('organization_funds')}
            className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col justify-between ${
              value === 'organization_funds'
                ? 'border-purple-600 bg-purple-50/70 shadow-sm ring-2 ring-purple-500/20'
                : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    value === 'organization_funds'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                </div>
                {value === 'organization_funds' && (
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                )}
              </div>
              <h4 className="text-xs font-bold text-gray-900 mb-1">
                Club / Organization Own Funds
              </h4>
              <p className="text-[11px] text-gray-600 leading-snug">
                Funded from the organization's own treasury ledger. Debits the approved budget from your club's funds upon final approval.
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-purple-200/60 flex items-center justify-between text-[10px]">
              <span className="font-bold text-purple-800 uppercase tracking-wide">
                Club Treasury
              </span>
              <span className="font-mono font-bold text-purple-900">
                {orgLoading ? '...' : formatCurrency(orgTreasuryBalance)}
              </span>
            </div>
          </button>
        )}

        {/* Option 2: School Budget Allocation */}
        <button
          type="button"
          onClick={() => onChange('school_budget')}
          className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col justify-between ${
            value === 'school_budget'
              ? 'border-[#001A4D] bg-blue-50/70 shadow-sm ring-2 ring-[#001A4D]/20'
              : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  value === 'school_budget'
                    ? 'bg-[#001A4D] text-white shadow-xs'
                    : 'bg-blue-100 text-[#001A4D]'
                }`}
              >
                <Landmark className="w-4 h-4" />
              </div>
              {value === 'school_budget' && (
                <CheckCircle2 className="w-5 h-5 text-[#001A4D]" />
              )}
            </div>
            <h4 className="text-xs font-bold text-gray-900 mb-1">
              School / Institutional Budget
            </h4>
            <p className="text-[11px] text-gray-600 leading-snug">
              Funded through institutional school budget allocation. Central school funds cover the approved activity expenses.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-blue-200/60 flex items-center justify-between text-[10px]">
            <span className="font-bold text-[#001A4D] uppercase tracking-wide">
              School Budget
            </span>
            <span className="font-semibold text-blue-800">
              School Budget Allocation
            </span>
          </div>
        </button>

        {/* Option 3: Zero Budget */}
        <button
          type="button"
          onClick={() => onChange('zero_budget')}
          className={`relative text-left p-4 rounded-xl border-2 transition-all duration-150 flex flex-col justify-between ${
            value === 'zero_budget'
              ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
              : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  value === 'zero_budget'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                <Sparkles className="w-4 h-4" />
              </div>
              {value === 'zero_budget' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <h4 className="text-xs font-bold text-gray-900 mb-1">
              Non-Monetary (Zero Budget)
            </h4>
            <p className="text-[11px] text-gray-600 leading-snug">
              For campus meetings, rehearsals, online seminars, or assemblies requiring ₱0 funds. Automatically exempt from Form FL-01 financial liquidation.
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-emerald-200/60 flex items-center justify-between text-[10px]">
            <span className="font-bold text-emerald-800 uppercase tracking-wide">
              ₱0 Budget
            </span>
            <span className="font-semibold text-emerald-700">
              No Liquidation Required
            </span>
          </div>
        </button>
      </div>

      {/* Advisory Banners */}
      {isOfficer && value === 'organization_funds' && (
        <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl flex items-start gap-2.5 text-xs text-purple-900">
          <Info className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Club Treasury Funds:</strong> Approved budget will be encumbered and debited from{' '}
            <span className="font-semibold">{organizationName || 'your club'}</span>'s own treasury ledger upon final approval. The approval process follows the standard default workflow configured in Admin Settings.
          </div>
        </div>
      )}

      {value === 'school_budget' && (
        <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
          <Info className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>School Budget Allocation:</strong>{' '}
            {!isOfficer ? (
              <span>
                Institutional activities organized by Student Affairs and Services (SAS) / Campus Administration are covered under institutional school budget allocation.
              </span>
            ) : (
              <span>
                Central school funds cover this activity. The approval process follows the standard default workflow configured in Admin Settings.
              </span>
            )}
          </div>
        </div>
      )}

      {value === 'zero_budget' && (
        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Zero Budget Exemption:</strong> Financial line items will default to ₱0.00. Once the event completes, your team will only need to file the Post-Activity Report (PAR-01) — Form FL-01 Financial Liquidation is waived.
          </div>
        </div>
      )}

      {/* Real-time Shortage Warning */}
      {hasShortage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-900 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Insufficient Club Treasury Funds:</strong>
            Proposed budget of{' '}
            <strong className="font-mono">{formatCurrency(proposedBudget)}</strong> exceeds the club's available balance of{' '}
            <strong className="font-mono">{formatCurrency(orgTreasuryBalance)}</strong>. Shortage: {formatCurrency(proposedBudget - orgTreasuryBalance)}. Please reduce line items or request a School Budget subsidy.
          </div>
        </div>
      )}
    </div>
  );
}

