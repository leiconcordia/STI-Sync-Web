/**
 * src/app/modules/events/components/CashCustodiansModal.tsx
 *
 * Official Cash Custodian Allocations & Liquidation Bridge Modal.
 * Directly implements the STI institutional cash advance workflow from LIQUIDATION-FORMAT_v1.xlsx:
 * - Divides approved budget from Proposal Financial Projections (expense line items)
 * - Supports dedicated Contingency Fund Distribution (emergency cash reserves)
 * - Allows adding custom cash advance items outside the projection list
 * - Real-time budget deduction: Remaining Budget = Approved Budget - Total Allocated
 * - Persists structured advances to activities.budgetCustodians for post-event receipt liquidation
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  DollarSign,
  Plus,
  Trash2,
  Save,
  HelpCircle,
  FileText,
  Users,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Coins,
  Receipt,
  Lock,
  Shield,
  Tag,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { ACTIVITIES_COLLECTION } from '../services/event.service';
import type { EventDocument, BudgetCustodianAllocation } from '../types/event.types';
import type { FinancialProjections, FinancialLineItem } from '../../activity-proposals/types/proposal.types';
import { formatPHP } from '../../activity-proposals/utils/proposal-calculations';
import { toast } from 'sonner';

interface CashCustodiansModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: EventDocument;
  financialProjections?: FinancialProjections | null;
  /** @deprecated Retained for backward-compatibility if caller still passes tasks */
  proposalTasks?: any[];
  onUpdated?: () => void;
  readOnly?: boolean;
}

export default function CashCustodiansModal({
  isOpen,
  onClose,
  activity,
  financialProjections,
  proposalTasks,
  onUpdated,
  readOnly = false,
}: CashCustodiansModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [custodians, setCustodians] = useState<BudgetCustodianAllocation[]>([]);

  // Compute Total Approved Budget Pool
  const totalApprovedBudget = useMemo(() => {
    if (activity.totalApprovedBudget && Number(activity.totalApprovedBudget) > 0) {
      return Number(activity.totalApprovedBudget);
    }
    if (activity.approvedBudget && Number(activity.approvedBudget) > 0) {
      return Number(activity.approvedBudget);
    }
    const fromItems = (activity.budgetItems || []).reduce(
      (sum, bi) => sum + Number(bi.approvedAmount || (bi.unitCost || 0) * (bi.quantity || 1)),
      0
    );
    if (fromItems > 0) return fromItems;
    if (financialProjections?.totalExpenses && Number(financialProjections.totalExpenses) > 0) {
      return Number(financialProjections.totalExpenses);
    }
    return Number((activity as any).financialProjections?.totalExpenses || 0);
  }, [activity, financialProjections]);

  // Extract effective expense projection items from proposal or activity
  const effectiveExpenseItems = useMemo<any[]>(() => {
    // 1. Passed explicitly via props
    if (financialProjections?.expenses && financialProjections.expenses.length > 0) {
      return financialProjections.expenses;
    }
    // 2. Saved on activity document
    const actFP = (activity as any)?.financialProjections;
    if (actFP?.expenses && Array.isArray(actFP.expenses) && actFP.expenses.length > 0) {
      return actFP.expenses;
    }
    // 3. Fallback to activity.budgetItems (which was mapped from proposal expenses)
    if (activity.budgetItems && activity.budgetItems.length > 0) {
      return activity.budgetItems.map((bi) => ({
        id: bi.id,
        description: bi.item || bi.description || 'Expense Item',
        totalAmount: Number(bi.approvedAmount || (bi.unitCost || 0) * (bi.quantity || 1)),
        thisYearProposed: Number(bi.approvedAmount || (bi.unitCost || 0) * (bi.quantity || 1)),
        remarks: bi.description || '',
      }));
    }
    return [];
  }, [financialProjections, activity]);

  // Initialize data
  useEffect(() => {
    if (!activity) return;

    if (activity.budgetCustodians && activity.budgetCustodians.length > 0) {
      // Existing allocations saved in activity document
      setCustodians(activity.budgetCustodians);
    } else if (effectiveExpenseItems.length > 0) {
      // Pre-fill directly from Proposal Financial Projections (with approved amounts intact)
      const projectionRows: BudgetCustodianAllocation[] = effectiveExpenseItems.map((item, idx) => {
        const isContingency = (item.description || '').toLowerCase().includes('contingency');
        const approvedCost = Number(item.totalAmount ?? item.thisYearProposed ?? item.approvedAmount ?? 0);
        return {
          id: `ca_exp_${item.id || idx}`,
          expenseItemId: item.id,
          expenseTitle: item.description || `Expense ${idx + 1}`,
          purpose: item.description || `Expense ${idx + 1}`,
          isCustomItem: false,
          isContingencyFund: isContingency,
          personName: '',
          personRole: isContingency ? 'Contingency Custodian' : 'Expense Custodian',
          allocatedAmount: approvedCost,
          notes: item.remarks || '',
        };
      });
      setCustodians(projectionRows);
    } else if (proposalTasks && proposalTasks.length > 0) {
      // Fallback if no financial projections exist but legacy tasks do
      const taskRows: BudgetCustodianAllocation[] = proposalTasks.map((t, idx) => ({
        id: `task_ca_${t.id || idx}`,
        taskId: t.id || `task_${idx + 1}`,
        taskName: t.taskName || `Task ${idx + 1}`,
        isCustomItem: false,
        isContingencyFund: false,
        personName: t.assignedPerson || '',
        personRole: 'Committee Lead',
        purpose: t.taskName || 'Committee Task',
        allocatedAmount: 0,
        notes: '',
      }));
      setCustodians(taskRows);
    } else {
      setCustodians([]);
    }
  }, [activity, effectiveExpenseItems, proposalTasks]);

  if (!isOpen) return null;

  // Real-time calculation: Total Allocated, Contingency, Base, and Remaining
  const contingencyAllocated = custodians
    .filter((c) => c.isContingencyFund === true)
    .reduce((sum, c) => sum + (Number(c.allocatedAmount) || 0), 0);

  const totalAllocated = custodians.reduce(
    (sum, c) => sum + (Number(c.allocatedAmount) || 0),
    0
  );

  const baseOperationalAllocated = totalAllocated - contingencyAllocated;
  const remainingBudget = totalApprovedBudget - totalAllocated;
  const isOverBudget = remainingBudget < -0.01;
  const isFullyAllocated = Math.abs(remainingBudget) < 0.01 && totalApprovedBudget > 0;

  // Check if allocations are sealed / read-only for completed event or admin view
  const isLocked = Boolean(
    readOnly ||
    activity.status === 'completed' ||
    activity.proposalStatus === 'completed' ||
    (activity as any).cashAllocationsLocked === true ||
    activity.isArchived === true
  );

  // Add custom row (outside original projection list)
  const handleAddCustomItem = () => {
    if (isLocked) {
      toast.error('Cash allocations are locked and read-only for concluded events.');
      return;
    }
    const newRow: BudgetCustodianAllocation = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      isCustomItem: true,
      isContingencyFund: false,
      personName: '',
      personRole: 'Committee Lead',
      purpose: '',
      allocatedAmount: remainingBudget > 0 ? remainingBudget : 0,
      notes: '',
    };
    setCustodians((prev) => [...prev, newRow]);
  };

  // Add designated Contingency Fund Distribution
  const handleAddContingencyFund = () => {
    if (isLocked) {
      toast.error('Cash allocations are locked and read-only for concluded events.');
      return;
    }
    const defaultAmount = remainingBudget > 0 ? remainingBudget : 0;
    const newContingencyRow: BudgetCustodianAllocation = {
      id: `contingency_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      isCustomItem: true,
      isContingencyFund: true,
      personName: '',
      personRole: 'Contingency Custodian',
      purpose: 'Contingency Fund Distribution',
      allocatedAmount: defaultAmount,
      notes: 'Emergency buffer for unforeseen event operational expenses',
    };
    setCustodians((prev) => [...prev, newContingencyRow]);
    toast.success('Added Contingency Fund allocation row.');
  };

  // Update allocation row
  const handleUpdateRow = (id: string, updates: Partial<BudgetCustodianAllocation>) => {
    if (isLocked) return;
    setCustodians((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  // Delete row (allowed for custom/contingency items, or resets projection row to 0)
  const handleDeleteRow = (id: string, isCustomOrContingency?: boolean) => {
    if (isLocked) {
      toast.error('Cash allocations cannot be modified for concluded events.');
      return;
    }
    if (isCustomOrContingency) {
      setCustodians((prev) => prev.filter((c) => c.id !== id));
    } else {
      handleUpdateRow(id, { allocatedAmount: 0 });
      toast.info('Item budget set to ₱0.00 (No advance requested)');
    }
  };

  // Reload from Proposal Financial Projections
  const handleReloadProjections = () => {
    if (isLocked) {
      toast.error('Cannot reload projections: Cash allocations are locked.');
      return;
    }
    if (effectiveExpenseItems.length === 0) {
      toast.info('No proposal financial projections available to load.');
      return;
    }
    const projectionRows: BudgetCustodianAllocation[] = effectiveExpenseItems.map((item, idx) => {
      const isContingency = (item.description || '').toLowerCase().includes('contingency');
      const approvedCost = Number(item.totalAmount ?? item.thisYearProposed ?? item.approvedAmount ?? 0);
      return {
        id: `ca_exp_${item.id || idx}_${Date.now()}`,
        expenseItemId: item.id,
        expenseTitle: item.description || `Expense ${idx + 1}`,
        purpose: item.description || `Expense ${idx + 1}`,
        isCustomItem: false,
        isContingencyFund: isContingency,
        personName: '',
        personRole: isContingency ? 'Contingency Custodian' : 'Expense Custodian',
        allocatedAmount: approvedCost,
        notes: item.remarks || '',
      };
    });
    setCustodians(projectionRows);
    toast.success(`Loaded ${projectionRows.length} items from proposal financial projections.`);
  };

  // Save allocations
  const handleSave = async () => {
    if (isLocked) {
      toast.error('Cash allocations are sealed and cannot be modified.');
      return;
    }
    if (isOverBudget) {
      toast.error(
        `Cannot save: Total allocated (${formatPHP(totalAllocated)}) exceeds approved budget (${formatPHP(totalApprovedBudget)}) by ${formatPHP(Math.abs(remainingBudget))}.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const cleanCustodians: BudgetCustodianAllocation[] = custodians.map((c) => ({
        ...c,
        isContingencyFund: Boolean(c.isContingencyFund),
        isCustomItem: Boolean(c.isCustomItem),
        personName: (c.personName || '').trim(),
        personRole: (c.personRole || '').trim(),
        purpose: (c.purpose || c.expenseTitle || c.taskName || '').trim(),
        allocatedAmount: Number(c.allocatedAmount) || 0,
        notes: (c.notes || '').trim(),
      }));

      const docRef = doc(db, ACTIVITIES_COLLECTION, activity.id);
      await updateDoc(docRef, {
        budgetCustodians: cleanCustodians,
        totalAllocatedBudget: totalAllocated,
        budgetDisbursed: totalAllocated > 0,
        updatedAt: serverTimestamp(),
      });

      toast.success('Cash custodian allocations saved successfully!');
      if (onUpdated) onUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to save cash allocations:', err);
      toast.error(err?.message || 'Failed to save allocations.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#001A4D] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0E4EBD] text-white flex items-center justify-center shadow-md">
              <DollarSign className="w-5 h-5 text-[#FFD41C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Cash Custodians & Liquidation Bridge</h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-[#FFD41C] border border-blue-400/30">
                  {activity.referenceId}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Form AP-01 Approved
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 truncate max-w-md">
                {activity.title} • Sourced from approved proposal financial projections & contingency fund
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-slate-50/50">
          {/* Read-Only Notice for Club-Managed Event */}
          {readOnly && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-950 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-amber-950">Organization-Managed Utility • Read-Only for Administrators</p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  Cash advances and custodian allocations for student club events are managed exclusively by designated organization officers.
                </p>
              </div>
            </div>
          )}

          {/* Top KPI Summary Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Approved Budget */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Approved Budget
              </span>
              <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                {formatPHP(totalApprovedBudget)}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Endorsed financial ceiling</p>
            </div>

            {/* 2. Base Operational Advances */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Itemized Line Advances
              </span>
              <div className="text-xl font-black text-slate-800 mt-1 font-mono">
                {formatPHP(baseOperationalAllocated)}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {custodians.filter((c) => !c.isContingencyFund && (c.allocatedAmount || 0) > 0).length} projected expense advances
              </p>
            </div>

            {/* 3. Contingency Fund Allocated */}
            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/90 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                  Contingency Fund
                </span>
                <Shield className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-xl font-black text-amber-950 mt-1 font-mono">
                {formatPHP(contingencyAllocated)}
              </div>
              <p className="text-[10px] text-amber-800/80 mt-0.5">
                {custodians.filter((c) => c.isContingencyFund && (c.allocatedAmount || 0) > 0).length > 0
                  ? 'Allocated emergency reserve'
                  : 'Unallocated emergency buffer'}
              </p>
            </div>

            {/* 4. Remaining to Disburse */}
            <div
              className={`p-4 rounded-2xl border shadow-xs ${
                isOverBudget
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : isFullyAllocated
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block">
                {isOverBudget ? 'Budget Deficit / Over' : 'Remaining to Disburse'}
              </span>
              <div className="text-xl font-black mt-1 font-mono">
                {formatPHP(Math.abs(remainingBudget))}
              </div>
              <p className="text-[10px] mt-0.5 opacity-80">
                {isOverBudget
                  ? 'Exceeds approved budget! Please adjust amounts.'
                  : isFullyAllocated
                  ? '✓ 100% Subdivided perfectly'
                  : 'Available for remaining allocations'}
              </p>
            </div>
          </div>

          {/* Concluded Event Lock Banner */}
          {isLocked && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-xs text-amber-950 shadow-xs">
              <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">
                  Cash Allocations Locked & Read-Only
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  This event is concluded. Cash custodian allocations are sealed for post-event financial liquidation and auditing. These exact allocations will be referenced when attaching official receipts.
                </p>
              </div>
            </div>
          )}

          {/* Institutional Liquidation Bridge Notice */}
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-950">
            <Receipt className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#001A4D]">
                Institutional Liquidation Bridge (LIQUIDATION-FORMAT_v1.xlsx)
              </p>
              <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                Assign cash advances directly to approved financial projection line items or contingency reserves. When the activity concludes, the official <strong>Liquidation Report</strong> will automatically load these exact custodians and cash amounts for attaching physical receipts (ORs) and computing variances.
              </p>
            </div>
          </div>

          {/* Table Controls */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Financial Projection Advances & Custodians ({custodians.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                {isLocked
                  ? 'Allocations are read-only and preserved for financial liquidation.'
                  : 'Assign each proposed expense line item to a custodian, allocate contingency funds, or add extra advances.'}
              </p>
            </div>

            {!isLocked && (
              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleReloadProjections}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Reload line items from proposal financial projections"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reload Financial Projections</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddContingencyFund}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border border-amber-600/30"
                  title="Allocate remaining budget or buffer to a designated contingency custodian"
                >
                  <Shield className="w-3.5 h-3.5 text-slate-950" />
                  <span>+ Add Contingency Fund Distribution</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddCustomItem}
                  className="px-3.5 py-1.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Additional Item</span>
                </button>
              </div>
            )}
          </div>

          {/* Allocation Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {custodians.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-400 opacity-50" />
                <p className="font-bold text-slate-700">No financial projections or cash allocations listed.</p>
                <p className="text-slate-400 text-[11px] mt-1">
                  Click "Reload Financial Projections" or "+ Add Contingency Fund Distribution" to allocate advances.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-3 w-56">Expense Particular / Description</th>
                      <th className="py-3 px-3 w-44">Designated Custodian (Holds Money)</th>
                      <th className="py-3 px-3 w-36">Role / Committee</th>
                      <th className="py-3 px-3 w-36">Allocated Budget (₱)</th>
                      <th className="py-3 px-3">Notes / Instructions</th>
                      <th className="py-3 px-3 text-right w-16">{isLocked ? 'Status' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {custodians.map((c, idx) => {
                      const isCustom = c.isCustomItem === true || !c.expenseItemId;
                      const isContingency = c.isContingencyFund === true;

                      return (
                        <tr
                          key={c.id || idx}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isContingency
                              ? 'bg-amber-50/30'
                              : (c.allocatedAmount || 0) > 0
                              ? 'bg-blue-50/20'
                              : ''
                          }`}
                        >
                          {/* Expense / Particular Description */}
                          <td className="py-2.5 px-3">
                            <div className="space-y-1">
                              {isCustom ? (
                                <input
                                  type="text"
                                  value={c.purpose}
                                  disabled={isLocked}
                                  onChange={(e) =>
                                    handleUpdateRow(c.id, { purpose: e.target.value })
                                  }
                                  placeholder={isContingency ? 'Contingency Fund Distribution' : 'e.g. Extra logistics, emergency transport'}
                                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                                />
                              ) : (
                                <div className="space-y-0.5">
                                  <span className="font-bold text-[#001A4D] block text-xs">
                                    {c.purpose || c.expenseTitle || 'Expense Item'}
                                  </span>
                                </div>
                              )}
                              <div>
                                {isContingency ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                    <Shield className="w-2.5 h-2.5 text-amber-600" />
                                    Contingency Fund
                                  </span>
                                ) : isCustom ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                                    Additional Advance
                                  </span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-[#0E4EBD]">
                                    Proposal Projection
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Person Name (Custodian) */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={c.personName}
                              disabled={isLocked}
                              onChange={(e) =>
                                handleUpdateRow(c.id, { personName: e.target.value })
                              }
                              placeholder={isContingency ? 'e.g. Maria Santos (Treasurer)' : 'Name of person holding cash'}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Role / Committee */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={c.personRole || ''}
                              disabled={isLocked}
                              onChange={(e) =>
                                handleUpdateRow(c.id, { personRole: e.target.value })
                              }
                              placeholder={isContingency ? 'Contingency Custodian' : 'e.g. Committee Lead'}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Allocated Amount */}
                          <td className="py-2.5 px-3">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold font-mono">
                                ₱
                              </span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                disabled={isLocked}
                                value={c.allocatedAmount === 0 ? '0' : c.allocatedAmount || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  handleUpdateRow(c.id, {
                                    allocatedAmount: isNaN(val) ? 0 : val,
                                  });
                                }}
                                placeholder="0"
                                className={`w-full pl-6 pr-2.5 py-1.5 rounded-lg text-xs font-bold font-mono outline-none border transition-colors disabled:bg-slate-100 disabled:cursor-not-allowed ${
                                  isContingency
                                    ? 'bg-amber-50/50 border-amber-400 text-amber-950 font-bold shadow-2xs'
                                    : (c.allocatedAmount || 0) > 0
                                    ? 'bg-white border-[#0E4EBD] text-[#001A4D] shadow-2xs'
                                    : 'bg-slate-50 border-slate-200 text-slate-400'
                                }`}
                              />
                            </div>
                            {(c.allocatedAmount || 0) === 0 && (
                              <span className="text-[10px] text-slate-400 block mt-0.5 italic">
                                No budget
                              </span>
                            )}
                          </td>

                          {/* Notes / Instructions */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={c.notes || ''}
                              disabled={isLocked}
                              onChange={(e) =>
                                handleUpdateRow(c.id, { notes: e.target.value })
                              }
                              placeholder={isContingency ? 'Reserve for emergency price increases or transport' : 'e.g. Collect official receipt / invoice'}
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Delete / Reset or Lock Indicator */}
                          <td className="py-2.5 px-3 text-right">
                            {isLocked ? (
                              <div className="flex items-center justify-end pr-1 text-slate-400" title="Locked: Read-only for liquidation">
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(c.id, isCustom || isContingency)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title={isCustom || isContingency ? 'Delete item' : 'Set budget to ₱0'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-slate-600">
            Total Allocated: <strong className="text-[#001A4D] font-mono">{formatPHP(totalAllocated)}</strong> of{' '}
            <strong className="font-mono">{formatPHP(totalApprovedBudget)}</strong>
            {contingencyAllocated > 0 && (
              <span className="text-amber-800 font-semibold ml-2">
                (incl. {formatPHP(contingencyAllocated)} Contingency)
              </span>
            )}
            {isOverBudget && (
              <span className="text-rose-600 font-bold ml-2">
                (Exceeds ceiling by {formatPHP(Math.abs(remainingBudget))})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isLocked ? (
              <>
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-200/80 text-slate-700 text-xs font-semibold">
                  <Lock className="w-3.5 h-3.5 text-slate-600" />
                  <span>{readOnly ? 'Club-Managed (Read Only)' : 'Sealed & Read-Only'}</span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#001A4D] hover:bg-[#002D72] rounded-xl transition-colors cursor-pointer"
                >
                  {readOnly ? 'Close (Read Only)' : 'Close'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isOverBudget}
                  className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving Allocations...' : 'Save Cash Allocations'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
