/**
 * src/app/modules/activity-proposals/components/wizard/Step6FinancialProjections.tsx
 *
 * Section 6: Official 6-Column STI Financial Table.
 * Matches Section 8 of official documents AP IT Expert Talk 1.docx, AP2025 (1).docx, and AP EVRAA.docx.
 * 
 * Matrix Columns:
 * 1. Items / Description
 * 2. Last Year's Actual (PHP)
 * 3. This Year's Proposed Budget (PHP)
 * 4. Total Amount (Proposed + Adjustment)
 * 5. Adjustment (PHP)
 * 6. Remarks
 */

import React, { useMemo, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import type {
  ProposalFormData,
  FinancialLineItem,
  FinancialProjections,
} from '../../types/proposal.types';
import {
  calculateFinancialTotals,
  formatPHP,
} from '../../utils/proposal-calculations';
import FundingSourceSelector from './FundingSourceSelector';
import HistoricalBudgetPicker from './HistoricalBudgetPicker';
import { stripSasPhrases } from '../../../events/utils/organization-display.utils';
import {
  mapHistoricalLineItems,
  type HistoricalActivityMatch,
} from '../../services/historical-budget.service';
import { useOrgLedger } from '../../../finance/hooks/useFinanceStream';

interface Step6Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

export default function Step6FinancialProjections({ formData, onChange, errors = {} }: Step6Props) {
  const isSasProposal = Boolean(
    formData.creatorRole === 'sas_admin' ||
    formData.creatorRole === 'admin' ||
    (formData.referenceNo && formData.referenceNo.includes('-SAS-')) ||
    formData.organizationId === 'sas' ||
    formData.hostingOrgId === 'sas' ||
    formData.isOfficerProposal === false
  );

  const isOfficerProposal = !isSasProposal && Boolean(
    formData.isOfficerProposal === true ||
    formData.creatorRole === 'officer' ||
    formData.creatorRole === 'student_officer' ||
    (formData.organizationId && !['sas', 'sas_admin', 'sao', 'admin'].includes(formData.organizationId.toLowerCase())) ||
    (formData.hostingOrgId && !['sas', 'sas_admin', 'sao', 'admin'].includes(formData.hostingOrgId.toLowerCase()))
  );

  const isNonMonetary = formData.fundingSource === 'zero_budget';

  const orgTargetId = formData.hostingOrgId || formData.organizationId || null;
  const { data: orgLedgerData = [], loading: orgLedgerLoading } = useOrgLedger(isOfficerProposal ? orgTargetId : null);

  const orgTreasuryBalance = useMemo(() => {
    if (!isOfficerProposal || !orgLedgerData || orgLedgerData.length === 0) return 0;
    const totalIncome = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalExpenses = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return Math.max(0, totalIncome - totalExpenses);
  }, [isOfficerProposal, orgLedgerData]);

  // Sync ledger balance into formData for modal validation
  useEffect(() => {
    if (isOfficerProposal && !orgLedgerLoading && formData.organizationLedgerBalanceAtSubmission !== orgTreasuryBalance) {
      onChange({ organizationLedgerBalanceAtSubmission: orgTreasuryBalance });
    }
  }, [isOfficerProposal, orgLedgerLoading, orgTreasuryBalance, formData.organizationLedgerBalanceAtSubmission, onChange]);

  React.useEffect(() => {
    if (!isOfficerProposal && formData.fundingSource === 'organization_funds') {
      onChange({ fundingSource: 'school_budget' });
    } else if (!formData.fundingSource) {
      onChange({ fundingSource: isOfficerProposal ? 'organization_funds' : 'school_budget' });
    }
  }, [isOfficerProposal, formData.fundingSource, onChange]);

  const rawProjections = formData.financialProjections;
  const currentProjections: FinancialProjections = useMemo(() => {
    const defaultRev: FinancialLineItem = {
      id: 'rev-1',
      description: '',
      lastYearActual: 0,
      thisYearProposed: 0,
      totalAmount: 0,
      adjustment: 0,
      remarks: '',
    };
    const defaultExp: FinancialLineItem = {
      id: 'exp-1',
      description: '',
      lastYearActual: 0,
      thisYearProposed: 0,
      totalAmount: 0,
      adjustment: 0,
      remarks: '',
    };

    const revenues = (rawProjections?.revenues && rawProjections.revenues.length > 0)
      ? rawProjections.revenues
      : [defaultRev];
    const expenses = (rawProjections?.expenses && rawProjections.expenses.length > 0)
      ? rawProjections.expenses
      : [defaultExp];

    return {
      revenues,
      expenses,
      totalRevenue: Number(rawProjections?.totalRevenue || 0),
      totalExpenses: Number(rawProjections?.totalExpenses || 0),
      balance: Number(rawProjections?.balance || 0),
    };
  }, [rawProjections]);

  // Ensure lines have auto-calculated adjustment and totalAmount
  useEffect(() => {
    const needsRecalc = [...currentProjections.revenues, ...currentProjections.expenses].some((item) => {
      const expectedAdj = (Number(item.thisYearProposed) || 0) - (Number(item.lastYearActual) || 0);
      const expectedTotal = Number(item.thisYearProposed) || 0;
      return item.adjustment !== expectedAdj || item.totalAmount !== expectedTotal;
    });

    if (needsRecalc) {
      const recalculated = calculateFinancialTotals(
        currentProjections.revenues,
        currentProjections.expenses
      );
      onChange({ financialProjections: recalculated });
    }
  }, [currentProjections.revenues, currentProjections.expenses, onChange]);

  const handleUpdateLineItem = (
    type: 'revenues' | 'expenses',
    index: number,
    field: keyof FinancialLineItem,
    val: any
  ) => {
    const list = [...currentProjections[type]];
    const prevItem = list[index];
    const isEditingHist = field === 'lastYearActual';
    const numVal = isEditingHist ? (parseFloat(val) || 0) : val;

    const isModifiedFromBaseline =
      isEditingHist &&
      prevItem.originalLastYearActual !== undefined &&
      numVal !== prevItem.originalLastYearActual;

    list[index] = {
      ...prevItem,
      [field]: numVal,
      ...(isEditingHist
        ? { isHistoricalEdited: isModifiedFromBaseline }
        : {}),
    };

    const recalculated = calculateFinancialTotals(
      type === 'revenues' ? list : currentProjections.revenues,
      type === 'expenses' ? list : currentProjections.expenses
    );

    const anyItemEdited = [...recalculated.revenues, ...recalculated.expenses].some(
      (i) => i.isHistoricalEdited === true || (i.originalLastYearActual !== undefined && i.lastYearActual !== i.originalLastYearActual)
    );

    const updatedHistRef = formData.historicalReference
      ? {
        ...formData.historicalReference,
        isManuallyEdited: anyItemEdited,
      }
      : formData.historicalReference;

    onChange({
      financialProjections: recalculated,
      historicalReference: updatedHistRef,
    });
  };

  const handleSelectHistorical = (match: HistoricalActivityMatch) => {
    const { recalculatedProjections, originalHistoricalTotal } = mapHistoricalLineItems(
      match,
      currentProjections
    );
    onChange({
      financialProjections: recalculatedProjections,
      historicalReference: {
        eventId: match.id,
        eventTitle: match.title,
        schoolYear: match.schoolYear,
        originalTotalAmount: originalHistoricalTotal,
        isManuallyEdited: false,
        isLocked: true,
        linkedAt: new Date().toISOString(),
      },
    });
  };

  const handleToggleHistoricalLock = (isLocked: boolean) => {
    if (!formData.historicalReference) return;
    onChange({
      historicalReference: {
        ...formData.historicalReference,
        isLocked,
      },
    });
  };

  const handleClearHistoricalReference = () => {
    const cleanRevs = currentProjections.revenues.map((r) => {
      const { originalLastYearActual, isHistoricalEdited, ...rest } = r;
      return rest as FinancialLineItem;
    });
    const cleanExps = currentProjections.expenses.map((e) => {
      const { originalLastYearActual, isHistoricalEdited, ...rest } = e;
      return rest as FinancialLineItem;
    });
    onChange({
      financialProjections: {
        ...currentProjections,
        revenues: cleanRevs,
        expenses: cleanExps,
      },
      historicalReference: null,
    });
  };

  const isHistoricalLocked = Boolean(
    formData.historicalReference && formData.historicalReference.isLocked !== false
  );

  const isManuallyEditedOverall = Boolean(
    formData.historicalReference?.isManuallyEdited ||
    [...currentProjections.revenues, ...currentProjections.expenses].some(
      (i) => i.isHistoricalEdited || (i.originalLastYearActual !== undefined && i.lastYearActual !== i.originalLastYearActual)
    )
  );

  const handleAddLineItem = (type: 'revenues' | 'expenses') => {
    const newItem: FinancialLineItem = {
      id: `${type === 'revenues' ? 'rev' : 'exp'}-${Date.now()}-${currentProjections[type].length + 1}`,
      description: '',
      lastYearActual: 0,
      thisYearProposed: 0,
      totalAmount: 0,
      adjustment: 0,
      remarks: '',
    };

    const updatedList = [...currentProjections[type], newItem];
    const recalculated = calculateFinancialTotals(
      type === 'revenues' ? updatedList : currentProjections.revenues,
      type === 'expenses' ? updatedList : currentProjections.expenses
    );

    onChange({ financialProjections: recalculated });
  };

  const handleRemoveLineItem = (type: 'revenues' | 'expenses', index: number) => {
    if (currentProjections[type].length <= 1) return;
    const updatedList = currentProjections[type].filter((_, idx) => idx !== index);
    const recalculated = calculateFinancialTotals(
      type === 'revenues' ? updatedList : currentProjections.revenues,
      type === 'expenses' ? updatedList : currentProjections.expenses
    );

    onChange({ financialProjections: recalculated });
  };

  const isBalanced = currentProjections.balance >= 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <DollarSign className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold text-xs">
              14
            </div>
            <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
              Financial projections
            </h4>
          </div>

        </div>
      </div>

      {/* Funding Source Selector & Real-Time Treasury Status */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <FundingSourceSelector
          value={formData.fundingSource || (isOfficerProposal ? 'organization_funds' : 'school_budget')}
          onChange={(source) => {
            const updates: Partial<ProposalFormData> = { fundingSource: source };
            if (source === 'zero_budget') {
              const zeroed = calculateFinancialTotals(
                [],
                [
                  {
                    id: 'exp-zero',
                    description: 'Zero Budget Activity (₱0)',
                    lastYearActual: 0,
                    thisYearProposed: 0,
                    totalAmount: 0,
                    adjustment: 0,
                    remarks: 'Non-monetary activity',
                  },
                ]
              );
              updates.financialProjections = zeroed;
              updates.historicalReference = null;
            } else if (source === 'organization_funds') {
              const orgLabel = formData.organizationName ? `${formData.organizationName} Treasury` : 'Organization Treasury';
              if (
                currentProjections.revenues.length > 0 &&
                (!currentProjections.revenues[0].description ||
                  currentProjections.revenues[0].description.includes('Subsidy') ||
                  currentProjections.revenues[0].description.includes('School Budget') ||
                  currentProjections.revenues[0].description.includes('Non-Monetary'))
              ) {
                const list = [...currentProjections.revenues];
                list[0] = { ...list[0], description: `${orgLabel} Ledger Funds` };
                updates.financialProjections = calculateFinancialTotals(list, currentProjections.expenses);
              }
            } else if (source === 'school_budget') {
              if (
                currentProjections.revenues.length > 0 &&
                (!currentProjections.revenues[0].description ||
                  currentProjections.revenues[0].description.includes('Treasury') ||
                  currentProjections.revenues[0].description.includes('Non-Monetary'))
              ) {
                const list = [...currentProjections.revenues];
                list[0] = { ...list[0], description: 'School Budget Allocation' };
                updates.financialProjections = calculateFinancialTotals(list, currentProjections.expenses);
              }
            }
            onChange(updates);
          }}
          organizationId={formData.organizationId || (formData as any).hostingOrgId}
          organizationName={formData.organizationName}
          isOfficer={isOfficerProposal}
          proposedBudget={currentProjections.totalExpenses}
        />

        {/* Ledger Validation Alert when Organization Funds selected */}
        {isOfficerProposal && formData.fundingSource === 'organization_funds' && !orgLedgerLoading && (
          orgTreasuryBalance <= 0 ? (
            <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-900 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold">Organization Treasury Balance: ₱0.00 (No Available Funds)</p>
                <p className="text-rose-700 mt-0.5">
                  Your club currently has ₱0.00 in its treasury ledger. You cannot allocate an activity budget from an empty treasury. Please switch to Non-Monetary (₱0) or deposit funds to the club ledger before proceeding.
                </p>
              </div>
            </div>
          ) : currentProjections.totalExpenses > orgTreasuryBalance ? (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-amber-900 shadow-2xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold">Treasury Overdraft Warning: Asking Budget Exceeds Club Funds</p>
                <p className="text-amber-800 mt-0.5">
                  Your asking budget of <strong>{formatPHP(currentProjections.totalExpenses)}</strong> exceeds your available club treasury of <strong>{formatPHP(orgTreasuryBalance)}</strong> by <strong>{formatPHP(currentProjections.totalExpenses - orgTreasuryBalance)}</strong>. Please reduce line item budgets or adjust funding to proceed.
                </p>
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* Historical Budget Reference & Auto-Populate (Hidden if Non-Monetary) */}
      {!isNonMonetary && (
        <HistoricalBudgetPicker
          currentTitle={formData.title}
          excludeEventId={formData.id}
          historicalReference={formData.historicalReference}
          onSelectHistorical={handleSelectHistorical}
          onToggleLock={handleToggleHistoricalLock}
          onClearReference={handleClearHistoricalReference}
          isManuallyEdited={isManuallyEditedOverall}
        />
      )}

      {/* ── SECTION A: REVENUES (Hidden if Non-Monetary) ── */}
      {!isNonMonetary && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-bold text-slate-800">
                A. Sources of Funds / Projected Revenues
              </h3>
            </div>
            <button
              type="button"
              onClick={() => handleAddLineItem('revenues')}
              className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Revenue Item</span>
            </button>
          </div>

          {/* Desktop Table Header */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                  <th className="py-2.5 px-3 w-32 text-right">Last Year Actual Budget</th>
                  <th className="py-2.5 px-3 w-36 text-right">This Year Proposed Budget</th>
                  <th className="py-2.5 px-3 w-28 text-right">Adjustment</th>
                  <th className="py-2.5 px-3 w-32 text-right">Total Amount</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Remarks</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentProjections.revenues.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          handleUpdateLineItem('revenues', idx, 'description', e.target.value)
                        }
                        placeholder="e.g. School Budget Allocation"
                        className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                      />
                    </td>
                    <td className="p-2.5">
                      {isHistoricalLocked ? (
                        <div className="relative">
                          <input
                            type="number"
                            value={item.lastYearActual || 0}
                            readOnly
                            disabled
                            className="w-full pl-6 pr-2 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-right text-gray-700 cursor-not-allowed select-none font-mono font-medium"
                            title="Locked to historical baseline. Click 'Unlock to Edit' in the reference card above to modify."
                          />
                          <Lock className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={item.lastYearActual || 0}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              'revenues',
                              idx,
                              'lastYearActual',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs text-right ${item.originalLastYearActual !== undefined && item.lastYearActual !== item.originalLastYearActual
                              ? 'bg-amber-50/70 border-amber-400 font-semibold text-amber-950 ring-1 ring-amber-400/30'
                              : 'bg-slate-50/60 border-slate-200'
                            }`}
                          title={
                            item.originalLastYearActual !== undefined && item.lastYearActual !== item.originalLastYearActual
                              ? `Manually adjusted from original baseline (${item.originalLastYearActual})`
                              : undefined
                          }
                        />
                      )}
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        min="0"
                        value={item.thisYearProposed || 0}
                        onChange={(e) =>
                          handleUpdateLineItem(
                            'revenues',
                            idx,
                            'thisYearProposed',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-right font-semibold text-emerald-700"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={
                          item.adjustment === 0
                            ? '0'
                            : item.adjustment > 0
                              ? `+${item.adjustment}`
                              : `${item.adjustment}`
                        }
                        className="w-full px-2 py-1.5 bg-slate-100/90 border border-slate-200 rounded-lg text-xs text-right font-bold text-slate-700 cursor-not-allowed select-none"
                        title="Auto-calculated: This Year Proposed Budget minus Last Year Actual Budget (Read-only)"
                      />
                    </td>
                    <td className="p-2.5 text-right font-bold text-slate-800">
                      {formatPHP(item.totalAmount)}
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={item.remarks}
                        onChange={(e) =>
                          handleUpdateLineItem('revenues', idx, 'remarks', e.target.value)
                        }
                        placeholder="Optional notes"
                        className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-600"
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      {currentProjections.revenues.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem('revenues', idx)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50/50 border-t border-emerald-100 font-bold text-emerald-950">
                  <td colSpan={4} className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px]">
                    Total Projected Revenues:
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-800 text-sm">
                    {formatPHP(currentProjections.totalRevenue)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION B: EXPENSES (Form LF-01 Baseline Categories - Hidden if Non-Monetary) ── */}
      {!isNonMonetary && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <h3 className="text-sm font-bold text-slate-800">
                  B. Proposed Budget Baseline Categories
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 pl-4.5 mt-0.5">
                These general baseline categories establish the asking budget and spending guide for post-event Financial Liquidation, where actual store receipts will be attached.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleAddLineItem('expenses')}
              className="text-xs text-rose-700 hover:text-rose-800 font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 transition-colors self-start sm:self-center shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Baseline Category</span>
            </button>
          </div>

          {/* Expenses Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                  <th className="py-2.5 px-3 w-32 text-right">Last Year Actual Budget</th>
                  <th className="py-2.5 px-3 w-40 text-right bg-blue-100/90 text-[#001A4D] font-extrabold border-x-2 border-blue-300">
                    This Year Proposed Budget (Asking)
                  </th>
                  <th className="py-2.5 px-3 w-28 text-right">Adjustment</th>
                  <th className="py-2.5 px-3 w-32 text-right">Total Amount</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Remarks</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentProjections.expenses.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          handleUpdateLineItem('expenses', idx, 'description', e.target.value)
                        }
                        placeholder="e.g. Guest Speaker Honorarium"
                        className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-rose-500 font-medium"
                      />
                    </td>
                    <td className="p-2.5">
                      {isHistoricalLocked ? (
                        <div className="relative">
                          <input
                            type="number"
                            value={item.lastYearActual || 0}
                            readOnly
                            disabled
                            className="w-full pl-6 pr-2 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-right text-gray-700 cursor-not-allowed select-none font-mono font-medium"
                            title="Locked to historical baseline. Click 'Unlock to Edit' in the reference card above to modify."
                          />
                          <Lock className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={item.lastYearActual || 0}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              'expenses',
                              idx,
                              'lastYearActual',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className={`w-full px-2 py-1.5 border rounded-lg text-xs text-right ${item.originalLastYearActual !== undefined && item.lastYearActual !== item.originalLastYearActual
                              ? 'bg-amber-50/70 border-amber-400 font-semibold text-amber-950 ring-1 ring-amber-400/30'
                              : 'bg-slate-50/60 border-slate-200'
                            }`}
                          title={
                            item.originalLastYearActual !== undefined && item.lastYearActual !== item.originalLastYearActual
                              ? `Manually adjusted from original baseline (${item.originalLastYearActual})`
                              : undefined
                          }
                        />
                      )}
                    </td>
                    <td className="p-2.5 bg-blue-50/40 border-x-2 border-blue-200">
                      <input
                        type="number"
                        min="0"
                        value={item.thisYearProposed || 0}
                        onChange={(e) =>
                          handleUpdateLineItem(
                            'expenses',
                            idx,
                            'thisYearProposed',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full px-2.5 py-1.5 bg-white border-2 border-blue-400 rounded-lg text-xs text-right font-black text-[#001A4D] shadow-inner focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={
                          item.adjustment === 0
                            ? '0'
                            : item.adjustment > 0
                              ? `+${item.adjustment}`
                              : `${item.adjustment}`
                        }
                        className="w-full px-2 py-1.5 bg-slate-100/90 border border-slate-200 rounded-lg text-xs text-right font-bold text-slate-700 cursor-not-allowed select-none"
                        title="Auto-calculated: This Year Proposed Budget minus Last Year Actual Budget (Read-only)"
                      />
                    </td>
                    <td className="p-2.5 text-right font-bold text-slate-800">
                      {formatPHP(item.totalAmount)}
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={item.remarks}
                        onChange={(e) =>
                          handleUpdateLineItem('expenses', idx, 'remarks', e.target.value)
                        }
                        placeholder="Optional notes"
                        className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-600"
                      />
                    </td>
                    <td className="p-2.5 text-center">
                      {currentProjections.expenses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem('expenses', idx)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                  <td className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px] text-slate-500">
                    Subtotals:
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-700">
                    {formatPHP(currentProjections.expenses.reduce((s, e) => s + (Number(e.lastYearActual) || 0), 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right bg-blue-100/90 border-x-2 border-blue-300 font-black text-[#001A4D]">
                    {formatPHP(currentProjections.expenses.reduce((s, e) => s + (Number(e.thisYearProposed) || 0), 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-700">
                    {formatPHP(currentProjections.expenses.reduce((s, e) => s + (Number(e.adjustment) || 0), 0))}
                  </td>
                  <td className="py-2.5 px-3 text-right text-rose-800 text-sm font-black">
                    {formatPHP(currentProjections.totalExpenses)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── FINANCIAL SUMMARY CARD: Total Asking Budget Highlight ── */}
      <div className="p-4 rounded-2xl border transition-all bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white border-blue-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#001A4D] text-[#FFD41C] shadow-xs shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-extrabold text-[#001A4D]">
                  Total Asking Budget: {formatPHP(currentProjections.totalExpenses)}
                </h4>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${isNonMonetary
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : formData.fundingSource === 'organization_funds'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-sky-100 text-[#001A4D] border border-sky-200'
                  }`}>
                  {isNonMonetary ? 'NON-MONETARY (₱0)' : formData.fundingSource === 'organization_funds' ? 'CLUB TREASURY PROPOSAL' : 'SCHOOL BUDGET REQUEST'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {isNonMonetary
                  ? 'Non-monetary activity requiring ₱0 funds. Automatically exempt from financial liquidation.'
                  : formData.fundingSource === 'organization_funds'
                    ? 'Proposed budget will be allocated from the official student organization treasury.'
                    : 'Institutional budget allocation requested for school administration review and endorsement.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold self-end sm:self-center">
            {currentProjections.totalRevenue > 0 && !isNonMonetary && (
              <>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px]">TOTAL REVENUES</span>
                  <span className="text-emerald-700 font-bold">{formatPHP(currentProjections.totalRevenue)}</span>
                </div>
                <div className="text-slate-300">|</div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px]">PROJECTED BALANCE</span>
                  <span className="text-slate-700 font-bold">{formatPHP(currentProjections.balance)}</span>
                </div>
                <div className="text-slate-300">|</div>
              </>
            )}
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">TOTAL ASKING BUDGET</span>
              <span className="text-[#0E4EBD] font-black text-sm">{formatPHP(currentProjections.totalExpenses)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
