import { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  PieChart,
  Users,
  QrCode,
  X,
  Calculator,
  Lock,
  Wallet,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Sparkles,
} from 'lucide-react';

const STANDARD_CATEGORIES = [
  { item: 'Meals & Catering', defaultDesc: 'Refreshments, lunch, and catering for attendees & committee' },
  { item: 'Transportation & Travel', defaultDesc: 'Fares, van/bus rentals, fuel, and transit allowances' },
  { item: 'Honorarium & Speaker Tokens', defaultDesc: 'Resource speaker honoraria, tokens, and plaques' },
  { item: 'Venue & Equipment Rental', defaultDesc: 'Sound system, projectors, lights, and facility rental fees' },
  { item: 'Materials, Printing & Signage', defaultDesc: 'Tarpaulins, certificates, ribbons, name tags, and printing' },
  { item: 'Contingency / Buffer Fund', defaultDesc: 'Buffer allocation for unforeseen operational adjustments' },
  { item: 'Registration & Entry Fees', defaultDesc: 'Entrance tickets, competition, or conference registration' },
];
import type { EventFormData, BudgetLineItem } from '../../types/event.types';
import { formatCurrency, formatVariance } from '../../../../utils/currency';
import { useOrgLedger, useSaoLedger } from '../../../finance/hooks/useFinanceStream';

interface Step5Props {
  data: EventFormData;
  onUpdate: (data: Partial<EventFormData>) => void;
  isOfficer?: boolean;
  errors?: Record<string, string>;
  isRestricted?: boolean;
}

export default function Step5Budget({ data, onUpdate, isOfficer, errors = {}, isRestricted }: Step5Props) {
  const [showPayables, setShowPayables] = useState(false);
  const [expandedEstimatorMap, setExpandedEstimatorMap] = useState<Record<string, boolean>>({});

  const toggleEstimator = (id: string) => {
    setExpandedEstimatorMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Dynamic Theme Styling based on Officer vs Admin
  const accentBorder = 'border-[#0E4EBD]';
  const accentText = 'text-[#0E4EBD]';
  const accentBg = 'bg-[#0E4EBD]';
  const accentFocusRing = 'focus:ring-[#0E4EBD]';
  const accentGradient = 'from-[#001A4D] to-[#0E4EBD]';
  const pieStroke = '#0E4EBD';

  // Treasury balance stream
  const { data: orgLedgerData, loading: orgLedgerLoading } = useOrgLedger(data.hostingOrgId || null);
  const { data: saoLedgerData, loading: saoLedgerLoading } = useSaoLedger();

  const isClubEvent = (data.fundingSource === 'organization_funds') || (!data.fundingSource && (isOfficer || (Boolean(data.hostingOrgId) && data.hostingOrgId !== 'sas')));
  const ledger = (data.fundingSource === 'school_budget') ? saoLedgerData : (isClubEvent ? orgLedgerData : saoLedgerData);
  const ledgerLoading = (data.fundingSource === 'school_budget') ? saoLedgerLoading : (isClubEvent ? orgLedgerLoading : saoLedgerLoading);

  const availableTreasuryBalance = useMemo(() => {
    if (data.fundingSource === 'zero_budget') return 0;
    const totalIncome = ledger
      .filter((t) => String(t.type || '').toLowerCase() === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalExpenses = ledger
      .filter((t) => String(t.type || '').toLowerCase() === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return Math.max(0, totalIncome - totalExpenses);
  }, [ledger, data.fundingSource]);

  // Sync available balance to formData for validation
  useEffect(() => {
    if (!ledgerLoading && data.maxAllowedBudget !== availableTreasuryBalance) {
      onUpdate({ maxAllowedBudget: availableTreasuryBalance });
    }
  }, [availableTreasuryBalance, ledgerLoading]);

  const budgetItems = data.budgetItems || [];

  const updateField = (field: keyof EventFormData, value: any) => {
    onUpdate({ [field]: value });
  };

  const addBudgetItem = () => {
    const newItem: BudgetLineItem = {
      id: Date.now().toString(),
      item: '',
      description: '',
      quantity: 1,
      unitCost: 0,
      approvedAmount: 0,
      status: 'approved',
    };
    updateField('budgetItems', [...budgetItems, newItem]);
  };

  const addCategoryPreset = (preset: { item: string; defaultDesc: string }) => {
    const newItem: BudgetLineItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      item: preset.item,
      description: preset.defaultDesc,
      quantity: 1,
      unitCost: 0,
      approvedAmount: 0,
      status: 'approved',
    };
    updateField('budgetItems', [...budgetItems, newItem]);
  };

  const removeBudgetItem = (id: string) => {
    updateField('budgetItems', budgetItems.filter(i => i.id !== id));
  };

  const updateItem = (id: string, updates: Partial<BudgetLineItem>) => {
    updateField('budgetItems', budgetItems.map(i => {
      if (i.id === id) {
        const merged = { ...i, ...updates };
        merged.approvedAmount = (merged.quantity || 0) * (merged.unitCost || 0);
        return merged;
      }
      return i;
    }));
  };

  const updateBaselineAmount = (id: string, amount: number) => {
    updateField(
      'budgetItems',
      budgetItems.map((i) => {
        if (i.id === id) {
          const qty = i.quantity && i.quantity > 0 ? i.quantity : 1;
          const newUnitCost = qty === 1 ? amount : Math.round((amount / qty) * 100) / 100;
          return {
            ...i,
            approvedAmount: amount,
            unitCost: newUnitCost,
            quantity: qty,
          };
        }
        return i;
      })
    );
  };

  const totalProposed = budgetItems.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unitCost || 0)), 0);
  const isOverBudget = totalProposed > availableTreasuryBalance && totalProposed > 0 && !ledgerLoading;

  // Sync total proposed budget to data
  useEffect(() => {
    if (data.totalApprovedBudget !== totalProposed || data.totalRequestedBudget !== totalProposed) {
      onUpdate({ totalApprovedBudget: totalProposed, totalRequestedBudget: totalProposed });
    }
  }, [totalProposed]);

  const participantCount = data.expectedParticipantCount || 0;
  const calculatedPerStudent = participantCount > 0 ? Math.ceil(totalProposed / participantCount) : 0;
  const amountPerStudent = data.adminFeeOverride !== undefined ? data.adminFeeOverride : calculatedPerStudent;
  const totalCollected = amountPerStudent * participantCount;
  const surplus = totalCollected - totalProposed;
  const isQREnabled = Boolean(
    data.enableQRTickets !== false && (data as any).enableQR !== false && data.attendanceEnabled !== false
  );

  useEffect(() => {
    if (data.studentPayablesEnabled && data.adminFeeOverride === undefined) {
      onUpdate({ adminFeeOverride: calculatedPerStudent, totalExpectedCollection: calculatedPerStudent * participantCount });
    }
  }, [data.studentPayablesEnabled, calculatedPerStudent]);

  // If event visibility is turned off, automatically disable and clear student payables
  useEffect(() => {
    if (data.isVisible === false && data.studentPayablesEnabled) {
      onUpdate({
        studentPayablesEnabled: false,
        adminFeeOverride: 0,
        totalExpectedCollection: 0,
      });
    }
  }, [data.isVisible, data.studentPayablesEnabled]);

  const handleAmountOverrideChange = (val: number) => {
    onUpdate({ adminFeeOverride: val, totalExpectedCollection: val * participantCount });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      <div className="space-y-6">

        {/* Top KPIs: Treasury Balance & Proposed Budget */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {isClubEvent ? 'Organization Treasury' : 'School Budget Balance'}
                </div>
                <div className="text-xl font-black text-gray-900">
                  {ledgerLoading ? 'Loading...' : formatCurrency(availableTreasuryBalance)}
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full uppercase">
              Available
            </span>
          </div>

          <div className={`p-4 bg-gradient-to-r ${accentGradient} rounded-xl text-white shadow-xs flex items-center justify-between`}>
            <div>
              <div className="text-xs text-white/70 uppercase tracking-wider font-semibold">Total Proposed Budget</div>
              <div className="text-xl font-black text-[#FFC107]">{formatCurrency(totalProposed)}</div>
            </div>
            <span className={`px-2.5 py-1 font-bold text-[10px] rounded-full uppercase ${
              totalProposed === 0 ? 'bg-white/20 text-white' : isOverBudget ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-400 text-emerald-950'
            }`}>
              {totalProposed === 0 ? 'Zero Budget' : isOverBudget ? 'Exceeded' : 'Within Budget'}
            </span>
          </div>
        </div>

        {/* Approved Event Lock Banner */}
        {isRestricted && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900 text-xs font-semibold shadow-xs">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Financial Allocations & Budget Locked: Approved budget allocations, line items, and student fee assessments are sealed and cannot be modified.</span>
            </div>
            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold uppercase tracking-wider">Locked</span>
          </div>
        )}

        {/* Over Budget Alert */}
        {isOverBudget && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-900">Budget Limit Exceeded</h4>
              <p className="text-xs text-red-800 mt-0.5">
                The total proposed budget (<strong>{formatCurrency(totalProposed)}</strong>) exceeds the available treasury balance of <strong>{formatCurrency(availableTreasuryBalance)}</strong>. Please adjust line items before proceeding.
              </p>
            </div>
          </div>
        )}

        {/* Budget Table */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className={`border-l-4 ${accentBorder} pl-3 flex items-center gap-2`}>
                <h3 className="text-[#001A4D] font-bold text-base">Proposed Budget Baseline Categories</h3>
                {isRestricted && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md">
                    <Lock className="w-3 h-3 text-amber-600" /> Locked upon Approval
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 pl-4 mt-0.5">
                Financial Allocation Guide: Define general categories (e.g., Food, Tokens, Contingency). Actual itemized receipts will be attached during post-event liquidation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-2">
                <span className="text-sm text-gray-700 mr-2 ml-1 flex items-center gap-1">
                  <span>Payables:</span>
                  {(isRestricted || data.isVisible === false) && <Lock className="w-3 h-3 text-amber-600" />}
                </span>
                <button
                  type="button"
                  disabled={isRestricted || data.isVisible === false}
                  onClick={() => updateField('studentPayablesEnabled', false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isRestricted || data.isVisible === false ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'} ${!data.studentPayablesEnabled ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  None
                </button>
                <button
                  type="button"
                  disabled={isRestricted || data.isVisible === false}
                  onClick={() => updateField('studentPayablesEnabled', true)}
                  title={data.isVisible === false ? 'Payables are disabled because Student Feed Visibility is turned off in Step 1' : undefined}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isRestricted || data.isVisible === false ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${data.studentPayablesEnabled ? `bg-white shadow ${accentText}` : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Required
                </button>
              </div>

              {data.studentPayablesEnabled && !isRestricted && data.isVisible !== false && (
                <button
                  type="button"
                  onClick={() => setShowPayables(true)}
                  className="px-4 py-2 bg-[#FFC107] text-[#001A4D] rounded-lg text-sm font-bold hover:bg-[#FFD41C] flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Users className="w-4 h-4" /> Config Payables
                </button>
              )}
              
              {!isRestricted && (
                <button
                  type="button"
                  onClick={addBudgetItem}
                  className="px-4 py-2 bg-[#1E70E8] text-white rounded-lg text-sm font-medium hover:bg-[#0E4EBD] flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Add Category
                </button>
              )}
            </div>
          </div>

          {/* Educational Callout Banner */}
          <div className="p-3.5 bg-blue-50/80 border border-blue-200/90 rounded-xl text-xs text-blue-900 shadow-xs flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-[#0E4EBD] flex items-center justify-center shrink-0 mt-0.5">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="font-bold text-[#001A4D] flex items-center gap-1.5 text-xs">
                <span>Form LF-01 Liquidation Baseline Notice</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">Standard STI Policy</span>
              </div>
              <p className="text-blue-800 leading-relaxed text-[11px]">
                Each proposed category here establishes your approved spending guide (Left Side of Form LF-01). After the event is approved and concluded, these items appear as <strong>Reference Guide Tabs</strong> in your Financial Liquidation portal, where you will attach multiple actual store receipts line-by-line.
              </p>
              <p className="text-blue-700/90 text-[11px] pt-0.5">
                💡 <strong>Contingency / Buffer Fund:</strong> Simply add a category named <em>&quot;Contingency / Buffer Fund&quot;</em> with your desired baseline. It follows the exact same receipt attachment workflow as all other categories.
              </p>
            </div>
          </div>

          {/* Quick-Add Standard Category Pills */}
          {!isRestricted && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
              <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>Quick-Add Official Baseline Categories:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STANDARD_CATEGORIES.map((preset) => {
                  const isAlreadyAdded = budgetItems.some(
                    (b) => b.item?.toLowerCase().trim() === preset.item.toLowerCase().trim()
                  );
                  return (
                    <button
                      key={preset.item}
                      type="button"
                      disabled={isRestricted || isAlreadyAdded}
                      onClick={() => addCategoryPreset(preset)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isAlreadyAdded
                          ? 'bg-gray-200/70 text-gray-400 cursor-not-allowed opacity-60'
                          : 'bg-white border border-gray-300 text-gray-700 hover:border-[#0E4EBD] hover:text-[#0E4EBD] hover:bg-blue-50/50 shadow-xs'
                      }`}
                      title={isAlreadyAdded ? 'Already added to proposed categories' : `Add ${preset.item}`}
                    >
                      <Plus className="w-3 h-3 text-[#0E4EBD]" />
                      <span>{preset.item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {data.isVisible === false && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Student Feed Visibility Disabled:</strong> Student payables and fees cannot be configured because this event is hidden from student feeds.
              </span>
            </div>
          )}

          {budgetItems.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-[#0E4EBD] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-gray-900">Zero-Budget Event (Optional)</h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                No budget baseline categories proposed. This event will not require treasury fund disbursement or post-event financial liquidation.
              </p>
              {!isRestricted && (
                <button
                  type="button"
                  onClick={addBudgetItem}
                  className="mt-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Baseline Category
                </button>
              )}
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-700 w-[30%]">Baseline Category</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-700 w-[38%]">Scope & Description</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-700 w-[24%]">Proposed Baseline Budget (₱)</th>
                      {!isRestricted && <th className="px-3 py-2.5 w-[8%]" />}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {budgetItems.map((item, idx) => {
                      const total = (item.quantity || 1) * (item.unitCost || 0);
                      const itemErr = errors[`budget_${idx}_item`];
                      const costErr = errors[`budget_${idx}_unitCost`];
                      const isEstimatorOpen = Boolean(expandedEstimatorMap[item.id]);

                      return (
                        <tr key={item.id} className={isRestricted ? 'bg-gray-50/50' : 'hover:bg-gray-50/80 transition-colors'}>
                          <td className="px-3 py-2.5 align-top">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0E4EBD] font-bold text-[10px] flex items-center justify-center shrink-0">
                                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'][idx] || `${idx + 1}`}
                              </span>
                              <input
                                type="text"
                                list={`item-suggestions-${item.id}`}
                                placeholder="e.g. Food & Catering"
                                value={item.item || ''}
                                disabled={isRestricted}
                                onChange={(e) => updateItem(item.id, { item: e.target.value })}
                                className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-semibold focus:ring-2 focus:border-transparent disabled:opacity-60 disabled:bg-gray-100 transition-colors ${
                                  itemErr
                                    ? 'border-red-500 ring-2 ring-red-200 focus:ring-red-500'
                                    : `border-gray-300 ${accentFocusRing}`
                                }`}
                              />
                            </div>
                            {itemErr && (
                              <p className="text-[10px] text-red-600 mt-1 pl-6.5 font-medium">{itemErr}</p>
                            )}
                            <datalist id={`item-suggestions-${item.id}`}>
                              {STANDARD_CATEGORIES.map((c) => (
                                <option key={c.item} value={c.item} />
                              ))}
                            </datalist>
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <input
                              type="text"
                              placeholder="Coverage details (e.g. meals for 2 days, speaker tokens...)"
                              value={item.description || ''}
                              disabled={isRestricted}
                              onChange={(e) => updateItem(item.id, { description: e.target.value })}
                              className={`w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 ${accentFocusRing} focus:border-transparent disabled:opacity-60 disabled:bg-gray-100`}
                            />
                            {/* Optional Estimator Helper Drawer */}
                            {isEstimatorOpen && !isRestricted && (
                              <div className="mt-2 p-2 bg-blue-50/60 border border-blue-200 rounded-lg flex items-center gap-2 text-xs">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Calculation:</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="1"
                                    placeholder="Qty"
                                    value={item.quantity || 1}
                                    onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                                    className="w-16 px-1.5 py-1 bg-white border border-gray-300 rounded text-xs font-mono text-center"
                                  />
                                  <span className="text-gray-400 font-bold">× ₱</span>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Rate"
                                    value={item.unitCost || 0}
                                    onChange={(e) => updateItem(item.id, { unitCost: Math.max(0, Number(e.target.value)) })}
                                    className="w-20 px-1.5 py-1 bg-white border border-gray-300 rounded text-xs font-mono text-right"
                                  />
                                </div>
                                <span className="text-gray-400 font-bold">=</span>
                                <span className="font-mono font-bold text-[#001A4D]">
                                  {formatCurrency((item.quantity || 1) * (item.unitCost || 0))}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-top text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="relative w-full max-w-[140px]">
                                <span className="absolute left-2.5 top-1.5 text-xs font-bold text-gray-400">₱</span>
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  min="0"
                                  step="any"
                                  value={total > 0 ? total : ''}
                                  disabled={isRestricted}
                                  onChange={(e) => updateBaselineAmount(item.id, Math.max(0, Number(e.target.value)))}
                                  className={`w-full pl-6 pr-2 py-1.5 border rounded-lg text-xs font-mono font-bold text-right focus:ring-2 focus:border-transparent disabled:opacity-60 disabled:bg-gray-100 transition-colors ${
                                    costErr
                                      ? 'border-red-500 ring-2 ring-red-200 focus:ring-red-500'
                                      : `border-gray-300 ${accentFocusRing} text-[#001A4D]`
                                  }`}
                                />
                              </div>
                              {!isRestricted && (
                                <button
                                  type="button"
                                  onClick={() => toggleEstimator(item.id)}
                                  className={`p-1.5 rounded-md border transition-all cursor-pointer ${
                                    isEstimatorOpen
                                      ? 'bg-blue-100 border-blue-300 text-[#0E4EBD]'
                                      : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                                  }`}
                                  title="Toggle Quantity & Unit Rate Estimator Helper"
                                >
                                  <Calculator className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            {costErr && (
                              <p className="text-[10px] text-red-600 mt-1 font-medium text-right">{costErr}</p>
                            )}
                          </td>
                          {!isRestricted && (
                            <td className="px-3 py-2.5 align-top text-center">
                              <button
                                type="button"
                                onClick={() => removeBudgetItem(item.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition-colors cursor-pointer"
                                title="Delete Category"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="p-3.5 bg-[#001A4D]/5 border border-[#001A4D]/20 rounded-xl flex items-center justify-between">
            <div>
              <span className="font-bold text-[#001A4D] text-sm">Total Proposed Baseline Budget</span>
              <p className="text-xs text-gray-500">Total approved allocation guide for post-event Form LF-01 financial liquidation</p>
            </div>
            <span className={`text-2xl font-black ${accentText}`}>{formatCurrency(totalProposed)}</span>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="sticky top-0 h-fit">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <PieChart className={`w-5 h-5 ${accentText}`} />
            Proposed Budget Summary
          </h4>
          <div className="space-y-4">
            <div className="relative aspect-square max-w-[180px] mx-auto">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="20" />
                <circle cx="50" cy="50" r="40" fill="none" stroke={pieStroke} strokeWidth="20"
                  strokeDasharray={`${totalProposed > 0 ? 251.2 : 0} 251.2`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-lg font-bold text-gray-900">{formatCurrency(totalProposed)}</div>
                <div className="text-xs text-gray-500 font-medium">Proposed Total</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${accentBg}`} />
                  <span className="text-sm text-gray-700 font-medium">Proposed Budget</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-900">{formatCurrency(totalProposed)}</div>
                  <div className="text-xs text-gray-500">100%</div>
                </div>
              </div>
            </div>

            <div className={`p-3 bg-gradient-to-br ${accentGradient} rounded-lg text-center shadow-xs`}>
              <Shield className="w-6 h-6 text-[#FFC107] mx-auto mb-1" />
              <div className="text-white text-xs font-bold mb-1">Budget Authority Seal</div>
              <div className="text-white/80 text-xs">Auto-applied to all exported financial documents</div>
            </div>

            {/* Form LF-01 Liquidation Baseline Preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-[#001A4D]" />
                  <span className="text-xs font-bold text-[#001A4D]">Form LF-01 Baseline Preview</span>
                </div>
                <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-1.5 py-0.5 rounded">
                  Left Side Guide
                </span>
              </div>
              
              <p className="text-[10px] text-slate-500 leading-tight">
                How these categories will appear as reference guide tabs in post-event Financial Liquidation:
              </p>

              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {budgetItems.length === 0 ? (
                  <div className="text-[11px] text-gray-400 italic py-2 text-center">
                    No baseline categories added yet.
                  </div>
                ) : (
                  budgetItems.map((item, idx) => {
                    const letter = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'][idx] || `${idx + 1}`;
                    const total = (item.quantity || 1) * (item.unitCost || 0);
                    return (
                      <div key={item.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                        <span className="font-semibold text-slate-700 truncate max-w-[140px]" title={item.item || `Category ${letter}`}>
                          {letter}. {item.item || 'Untitled Category'}
                        </span>
                        <span className="font-mono font-bold text-slate-900 shrink-0">
                          {formatCurrency(total)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">Total Advance Baseline:</span>
                <span className="font-mono font-black text-[#0E4EBD]">{formatCurrency(totalProposed)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Student Payables Modal */}
      {showPayables && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPayables(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">

            {/* Modal Header */}
            <div className={`bg-gradient-to-r ${accentGradient} px-6 py-5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#FFC107] rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-[#001A4D]" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">Student Payables Config</h3>
                    <p className="text-white/70 text-xs">Budget-to-participant cost calculator</p>
                  </div>
                </div>
                <button onClick={() => setShowPayables(false)} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Event Budget + Participant Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-[#001A4D]/5 border border-[#001A4D]/20 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">Total Proposed Budget</div>
                  <div className="text-2xl font-bold text-[#001A4D]">{formatCurrency(totalProposed)}</div>
                  <div className="text-xs text-gray-500 mt-1">Sum of all proposed line items</div>
                </div>
                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
                  <div className="text-xs text-gray-500 mb-1">Target Audience (Step 3)</div>
                  <div className="flex items-baseline gap-1">
                    <input
                      type="number"
                      value={participantCount}
                      onChange={(e) => updateField('expectedParticipantCount', Math.max(1, Number(e.target.value)))}
                      className={`w-24 text-2xl font-bold ${accentText} bg-transparent border-b-2 ${accentBorder} focus:outline-none`}
                    />
                    <span className="text-xs text-gray-500 font-medium">students</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Matching active audience</div>
                </div>
              </div>

              {/* Calculation Display */}
              <div className="p-4 bg-gradient-to-br from-[#FFC107]/10 to-[#FFD41C]/5 border-2 border-[#FFC107] rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="w-5 h-5 text-[#001A4D]" />
                  <span className="font-bold text-[#001A4D]">Suggested Baseline Contribution Per Student</span>
                </div>

                <div className="flex items-center justify-center gap-4 py-3">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Total Budget</div>
                    <div className="text-xl font-bold text-[#001A4D]">{formatCurrency(totalProposed)}</div>
                  </div>
                  <div className="text-2xl text-gray-400 font-light">÷</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Students</div>
                    <div className={`text-xl font-bold ${accentText}`}>{participantCount.toLocaleString()}</div>
                  </div>
                  <div className="text-2xl text-gray-400 font-light">=</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Baseline Fee</div>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(calculatedPerStudent)}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Set amount per student */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Set Amount Per Student <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center border-2 border-[#001A4D] rounded-xl px-4 py-3 bg-white flex-1 focus-within:${accentBorder} transition-colors`}>
                      <span className="text-xl font-bold text-gray-500 mr-2">₱</span>
                      <input
                        type="number"
                        min="0"
                        value={amountPerStudent || ''}
                        onChange={(e) => handleAmountOverrideChange(Math.max(0, Number(e.target.value)))}
                        placeholder={calculatedPerStudent.toString()}
                        className="flex-1 text-2xl font-bold text-[#001A4D] focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    You can set a higher amount to cover miscellaneous or buffer expenses.
                  </p>
                </div>

                {/* Summary card */}
                <div className="p-4 bg-[#001A4D] rounded-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3 flex-1">
                      <div>
                        <div className="text-white/60 text-xs mb-0.5">Required Payment Per Student</div>
                        <div className="text-3xl font-bold text-[#FFC107]">{formatCurrency(amountPerStudent)}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                        <div>
                          <div className="text-white/50 text-xs mb-0.5">Total Expected</div>
                          <div className="text-white font-bold">{formatCurrency(totalCollected)}</div>
                        </div>
                        <div>
                          <div className="text-white/50 text-xs mb-0.5">{surplus >= 0 ? 'Buffer' : 'Shortfall'}</div>
                          <div className={`font-bold ${surplus >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatVariance(surplus)}
                          </div>
                        </div>
                      </div>
                    </div>
                    {isQREnabled && (
                      <div className="w-14 h-14 bg-[#FFC107]/20 border-2 border-[#FFC107] rounded-xl flex items-center justify-center flex-shrink-0">
                        <QrCode className="w-7 h-7 text-[#FFC107]" />
                      </div>
                    )}
                  </div>
                </div>

                {/* QR Lock Notice — only shown if QR attendance tickets are enabled */}
                {isQREnabled && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                    <Lock className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-red-800 text-sm mb-1">QR Attendance Ticket Lock Policy</div>
                      <p className="text-red-700 text-sm">
                        A student's QR code for attendance check-in will <strong>not be unlocked</strong> until their event payment has been confirmed. Unpaid students will be blocked from scanning in at the event gate.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPayables(false)}
                  className="px-5 py-2.5 bg-[#001A4D] text-white rounded-lg text-sm font-bold hover:bg-[#001A4D]/90 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
