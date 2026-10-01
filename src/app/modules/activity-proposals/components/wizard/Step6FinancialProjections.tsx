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

import React from 'react';
import {
  DollarSign,
  Plus,
  Trash2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
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

interface Step6Props {
  formData: ProposalFormData;
  onChange: (updates: Partial<ProposalFormData>) => void;
  errors?: Record<string, string>;
}

const DEFAULT_REVENUE_PRESETS = [
  {
    description: 'SAS Institutional Activity Subsidy / Budget',
    lastYearActual: 0,
    thisYearProposed: 5000,
    adjustment: 0,
    remarks: 'Approved institutional department allocation',
  },
];

const DEFAULT_EXPENSE_PRESETS = [
  {
    description: 'Guest Speaker Honorarium / Token of Appreciation',
    lastYearActual: 0,
    thisYearProposed: 2000,
    adjustment: 0,
    remarks: 'Resource speaker honorarium',
  },
  {
    description: 'Meals & Refreshments (Speakers, Guests & Working Committee)',
    lastYearActual: 0,
    thisYearProposed: 1500,
    adjustment: 0,
    remarks: 'Packed lunch and snack sets',
  },
  {
    description: 'Certificates of Participation & Certificate Frames',
    lastYearActual: 0,
    thisYearProposed: 800,
    adjustment: 0,
    remarks: 'High-gloss specialty paper & token frames',
  },
  {
    description: 'Promotional Tarpaulin & Stage Backdrop',
    lastYearActual: 0,
    thisYearProposed: 700,
    adjustment: 0,
    remarks: '6x4 ft campus backdrop banner',
  },
];

export default function Step6FinancialProjections({ formData, onChange, errors = {} }: Step6Props) {
  const currentProjections: FinancialProjections = formData.financialProjections || {
    revenues: [
      {
        id: 'rev-1',
        description: 'Student Affairs & Services (SAS) Activity Subsidy',
        lastYearActual: 0,
        thisYearProposed: 5000,
        totalAmount: 5000,
        adjustment: 0,
        remarks: 'Funded from Institutional Activity Fund',
      },
    ],
    expenses: [
      {
        id: 'exp-1',
        description: 'Resource Speaker Honorarium',
        lastYearActual: 0,
        thisYearProposed: 2000,
        totalAmount: 2000,
        adjustment: 0,
        remarks: 'Direct token',
      },
      {
        id: 'exp-2',
        description: 'Working Committee Refreshments',
        lastYearActual: 0,
        thisYearProposed: 1500,
        totalAmount: 1500,
        adjustment: 0,
        remarks: 'For volunteers & staff',
      },
    ],
    totalRevenue: 5000,
    totalExpenses: 3500,
    balance: 1500,
  };

  const handleUpdateLineItem = (
    type: 'revenues' | 'expenses',
    index: number,
    field: keyof FinancialLineItem,
    val: any
  ) => {
    const list = [...currentProjections[type]];
    list[index] = {
      ...list[index],
      [field]: val,
    };

    const recalculated = calculateFinancialTotals(
      type === 'revenues' ? list : currentProjections.revenues,
      type === 'expenses' ? list : currentProjections.expenses
    );

    onChange({ financialProjections: recalculated });
  };

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

  const loadPresets = () => {
    const revs: FinancialLineItem[] = DEFAULT_REVENUE_PRESETS.map((r, i) => ({
      ...r,
      id: `rev-p-${Date.now()}-${i}`,
      totalAmount: r.thisYearProposed + r.adjustment,
    }));

    const exps: FinancialLineItem[] = DEFAULT_EXPENSE_PRESETS.map((e, i) => ({
      ...e,
      id: `exp-p-${Date.now()}-${i}`,
      totalAmount: e.thisYearProposed + e.adjustment,
    }));

    const recalculated = calculateFinancialTotals(revs, exps);
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold text-xs">
                  14
                </div>
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  Financial projections
                </h4>
              </div>
              <p className="text-xs text-emerald-700/90 mt-0.5 leading-relaxed">
                Itemize proposed revenues and expenditures. Formula: <code>Total Amount = Proposed + Adjustment</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={loadPresets}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex-shrink-0 self-start sm:self-center"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load STI Defaults</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pure SAS Proposal Policy Badge */}
      <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-800 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span>
          <strong>SAS Institutional Policy:</strong> Proposals reviewed by Student Affairs are educational and co-curricular.
          They operate under school subsidy and do not charge commercial student admission fees.
        </span>
      </div>

      {/* ── SECTION A: REVENUES ── */}
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
                      placeholder="e.g. Institutional Subsidy"
                      className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                    />
                  </td>
                  <td className="p-2.5">
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
                      className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-right"
                    />
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
                      type="number"
                      value={item.adjustment || 0}
                      onChange={(e) =>
                        handleUpdateLineItem(
                          'revenues',
                          idx,
                          'adjustment',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-right"
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

      {/* ── SECTION B: EXPENSES ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <h3 className="text-sm font-bold text-slate-800">
              B. Projected Expenditures / Budget Breakdown
            </h3>
          </div>
          <button
            type="button"
            onClick={() => handleAddLineItem('expenses')}
            className="text-xs text-rose-700 hover:text-rose-800 font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Expense Item</span>
          </button>
        </div>

        {/* Expenses Table */}
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
                      className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-right"
                    />
                  </td>
                  <td className="p-2.5">
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
                      className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-right font-semibold text-rose-700"
                    />
                  </td>
                  <td className="p-2.5">
                    <input
                      type="number"
                      value={item.adjustment || 0}
                      onChange={(e) =>
                        handleUpdateLineItem(
                          'expenses',
                          idx,
                          'adjustment',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-2 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-right"
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
              <tr className="bg-rose-50/50 border-t border-rose-100 font-bold text-rose-950">
                <td colSpan={4} className="py-2.5 px-3 text-right uppercase tracking-wider text-[11px]">
                  Total Projected Expenses:
                </td>
                <td className="py-2.5 px-3 text-right text-rose-800 text-sm">
                  {formatPHP(currentProjections.totalExpenses)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── FINANCIAL SUMMARY CARD ── */}
      <div className={`p-4 rounded-2xl border transition-all ${
        isBalanced
          ? 'bg-emerald-50/60 border-emerald-200'
          : 'bg-amber-50/60 border-amber-200'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isBalanced ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
            }`}>
              {isBalanced ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800">
                  Projected Net Balance: {formatPHP(currentProjections.balance)}
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isBalanced
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {isBalanced ? 'BALANCED / SURPLUS' : 'DEFICIT ALERT'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBalanced
                  ? 'Revenues cover all projected line items. Ready for institutional budget endorsement.'
                  : 'Total proposed expenses exceed revenues. Please request additional allocation or reduce line items.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold self-end sm:self-center">
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">TOTAL REVENUES</span>
              <span className="text-emerald-700 font-bold">{formatPHP(currentProjections.totalRevenue)}</span>
            </div>
            <div className="text-slate-300">|</div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">TOTAL EXPENSES</span>
              <span className="text-rose-700 font-bold">{formatPHP(currentProjections.totalExpenses)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
