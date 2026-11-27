/**
 * src/app/modules/supplemental-budget/components/SupplementalBudgetModal.tsx
 *
 * Lightweight 3-Part Modal for creating or editing a Pre-Implementation
 * Supplemental Budget Request (SBR):
 *   1. Justification & Supporting Quotations
 *   2. Additional Expense Line Items (+ live Base vs. Effective Budget preview)
 *   3. Permitted Supplemental Funding Source & Live Bucket Split Allocation
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Wallet,
  Landmark,
  Coins,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  Save,
  Info,
  ShieldCheck,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useOrgLedger } from '../../finance/hooks/useFinanceStream';
import { useMiscFeeConfigs } from '../../finance/hooks/useMiscFeeStream';
import { useRetainedActivityFunds } from '../../finance/hooks/useRetainedFundStream';
import { formatPHP, rebalanceBucketAllocations } from '../../activity-proposals/utils/proposal-calculations';
import type {
  ProposalApprovalStep,
  ProposalBucketAllocation,
} from '../../activity-proposals/types/proposal.types';
import { subscribeToSignatories } from '../../signatories/services/signatory.service';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import ProposalFlowBuilder from '../../activity-proposals/components/workflow/ProposalFlowBuilder';
import {
  computeSupplementalItemsTotal,
  doesSbrRequireSignatories,
  getEventBaseApprovedBudget,
  getEventStartDateTime,
  getPermittedSupplementalFundingSources,
  normalizeSbrApprovalChain,
  validateSbrFormPayload,
} from '../utils/sbr-validation.utils';
import {
  createSupplementalBudgetRequest,
  resolveDefaultSbrPipelineFromParentAp,
  updateSupplementalBudgetRequest,
  type SbrActor,
} from '../services/sbr.service';
import type {
  SupplementalBudgetRequest,
  SupplementalExpenseItem,
  SupplementalFundingSource,
} from '../types/sbr.types';

interface SupplementalBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  isSasInstitutional: boolean;
  organizationId: string;
  organizationName: string;
  organizationAcronym?: string;
  priorSupplementalTotal?: number;
  actor: SbrActor;
  existingSbr?: SupplementalBudgetRequest | null;
  onSuccess?: () => void;
}

function createEmptyItem(): SupplementalExpenseItem {
  return {
    id: `sbr_item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    description: '',
    quantity: 1,
    unit: 'lot',
    unitCost: 0,
    totalAmount: 0,
    remarks: '',
  };
}

function normalizeExistingItemsForEditor(
  existingItems?: SupplementalExpenseItem[]
): SupplementalExpenseItem[] {
  if (!existingItems || existingItems.length === 0) return [createEmptyItem()];
  return existingItems.map((it) => {
    const resolvedTotal =
      typeof it.totalAmount === 'number' && !Number.isNaN(it.totalAmount) && it.totalAmount > 0
        ? Math.round(it.totalAmount * 100) / 100
        : Math.round((Math.max(0, Number(it.quantity) || 1) * Math.max(0, Number(it.unitCost) || 0)) * 100) / 100;
    return {
      ...it,
      quantity: 1,
      unit: 'lot',
      unitCost: resolvedTotal,
      totalAmount: resolvedTotal,
      remarks: it.remarks || '',
    };
  });
}

export default function SupplementalBudgetModal({
  isOpen,
  onClose,
  event,
  isSasInstitutional,
  organizationId,
  organizationName,
  organizationAcronym,
  priorSupplementalTotal = 0,
  actor,
  existingSbr,
  onSuccess,
}: SupplementalBudgetModalProps) {
  const permittedSources = useMemo(
    () => getPermittedSupplementalFundingSources(isSasInstitutional),
    [isSasInstitutional]
  );

  const [justification, setJustification] = useState(existingSbr?.justification || '');
  const [items, setItems] = useState<SupplementalExpenseItem[]>(() =>
    normalizeExistingItemsForEditor(existingSbr?.additionalItems)
  );
  const [fundingSource, setFundingSource] = useState<SupplementalFundingSource>(
    existingSbr?.fundingSource && permittedSources.includes(existingSbr.fundingSource)
      ? existingSbr.fundingSource
      : permittedSources[0]
  );
  const [allocations, setAllocations] = useState<ProposalBucketAllocation[]>(
    existingSbr?.allocations?.filter((a) => a.fundType === 'misc_fee') || []
  );
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);
  const [approvalChain, setApprovalChain] = useState<ProposalApprovalStep[]>(
    existingSbr?.approvalChain || []
  );
  const [pipelineSourceLabel, setPipelineSourceLabel] = useState<
    'parent_ap' | 'default_ap_template' | 'custom'
  >(existingSbr?.approvalChain?.length ? 'custom' : 'parent_ap');
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [saving, setSaving] = useState(false);

  // Subscribe to institutional signatories for configurable pipeline editor
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToSignatories((list) => setSignatories(list));
    return () => unsub();
  }, [isOpen]);

  const loadParentApPipeline = async (showToast = false) => {
    setLoadingPipeline(true);
    try {
      const resolved = await resolveDefaultSbrPipelineFromParentAp({
        eventId: event?.id,
        parentEvent: event,
        isSasInstitutional,
        signatoriesOverride: signatories.length > 0 ? signatories : undefined,
      });
      setApprovalChain(resolved.chain);
      setPipelineSourceLabel(resolved.source);
      if (showToast) {
        toast.success(
          resolved.source === 'parent_ap'
            ? `Copied ${resolved.chain.length} signatory step(s) from the parent Activity Proposal.`
            : `Loaded ${resolved.chain.length} step(s) from the default Activity Proposal workflow.`
        );
      }
    } catch (err) {
      console.warn('[SupplementalBudgetModal] Could not resolve parent AP pipeline:', err);
    } finally {
      setLoadingPipeline(false);
    }
  };

  // Reset state whenever modal opens for a different existingSbr / event
  useEffect(() => {
    if (!isOpen) return;
    setJustification(existingSbr?.justification || '');
    setItems(normalizeExistingItemsForEditor(existingSbr?.additionalItems));
    setFundingSource(
      existingSbr?.fundingSource && permittedSources.includes(existingSbr.fundingSource)
        ? existingSbr.fundingSource
        : permittedSources[0]
    );
    setAllocations(existingSbr?.allocations?.filter((a) => a.fundType === 'misc_fee') || []);
    if (existingSbr?.approvalChain && existingSbr.approvalChain.length > 0) {
      setApprovalChain(existingSbr.approvalChain);
      setPipelineSourceLabel(existingSbr.pipelineSource || 'custom');
    } else {
      loadParentApPipeline(false);
    }
  }, [isOpen, existingSbr, event?.id, permittedSources]);

  // Live Financial Streams
  const { data: orgLedgerData = [] } = useOrgLedger(
    !isSasInstitutional && organizationId ? organizationId : null
  );
  const { activeConfig, saoEligibleBuckets, loading: miscLoading } = useMiscFeeConfigs();
  const { saoRetainedFund } = useRetainedActivityFunds(null, activeConfig?.schoolYear);

  const orgTreasuryAvailable = useMemo(() => {
    if (isSasInstitutional) return 0;
    const inc = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'income')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const exp = orgLedgerData
      .filter((t) => String(t.type || '').toLowerCase() === 'expense')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return Math.max(0, Math.round((inc - exp) * 100) / 100);
  }, [isSasInstitutional, orgLedgerData]);

  const saoRetainedAvailable = useMemo(
    () => Math.max(0, Number(saoRetainedFund?.availableBalance) || 0),
    [saoRetainedFund]
  );

  const baseApprovedBudget = useMemo(() => getEventBaseApprovedBudget(event), [event]);
  const requestedAmount = useMemo(() => computeSupplementalItemsTotal(items), [items]);
  const newEffectiveBudget = useMemo(
    () => Math.round((baseApprovedBudget + priorSupplementalTotal + requestedAmount) * 100) / 100,
    [baseApprovedBudget, priorSupplementalTotal, requestedAmount]
  );

  // Auto-rebalance single selected Misc Fee bucket when requestedAmount changes
  useEffect(() => {
    if (fundingSource === 'school_budget' && allocations.length === 1 && requestedAmount > 0) {
      if (Math.abs((allocations[0].allocatedAmount || 0) - requestedAmount) > 0.01) {
        setAllocations([{ ...allocations[0], allocatedAmount: requestedAmount }]);
      }
    }
  }, [fundingSource, requestedAmount, allocations.length]);

  const requiresSignatories = doesSbrRequireSignatories(fundingSource, isSasInstitutional);

  const handleItemChange = (
    id: string,
    field: keyof SupplementalExpenseItem,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === 'unitCost' || field === 'totalAmount') {
          const cleanAmt = Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
          return {
            ...item,
            quantity: 1,
            unit: 'lot',
            unitCost: cleanAmt,
            totalAmount: cleanAmt,
          };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const handleToggleMiscBucket = (cb: any) => {
    const bucketId = cb?.bucket?.id || cb?.id;
    const bucketName = cb?.bucket?.particular || cb?.particular || bucketId;
    const avail = Number(cb?.currentAvailable ?? cb?.availableBalance ?? 0);
    const pool = Number(cb?.currentPool ?? cb?.totalPool ?? 0);

    const exists = allocations.some((a) => a.bucketId === bucketId);
    if (exists) {
      const next = allocations.filter((a) => a.bucketId !== bucketId);
      setAllocations(
        next.length > 0 && requestedAmount > 0
          ? rebalanceBucketAllocations({ allocations: next, totalExpenses: requestedAmount })
          : next
      );
    } else {
      const added: ProposalBucketAllocation = {
        bucketId,
        bucketName,
        fundType: 'misc_fee',
        allocatedAmount: requestedAmount > 0 ? requestedAmount : 0,
        availableAmount: avail,
        poolAmount: pool,
      };
      const next = [...allocations, added];
      setAllocations(
        requestedAmount > 0
          ? rebalanceBucketAllocations({ allocations: next, totalExpenses: requestedAmount })
          : next
      );
    }
  };

  const handleAllocationAmountChange = (bucketId: string, val: number) => {
    const cleanVal = Math.max(0, Number(val) || 0);
    setAllocations((prev) => {
      if (prev.length > 1 && requestedAmount > 0) {
        return rebalanceBucketAllocations({
          allocations: prev,
          totalExpenses: requestedAmount,
          editedBucketId: bucketId,
          editedAmount: cleanVal,
        });
      }
      return prev.map((a) =>
        a.bucketId === bucketId ? { ...a, allocatedAmount: cleanVal } : a
      );
    });
  };

  const handleSave = async (submitImmediately: boolean) => {
    const cleanItems = items
      .filter((i) => i.description.trim() || i.totalAmount > 0)
      .map((i) => {
        const cleanAmt = Math.max(
          0,
          Math.round((Number(i.totalAmount) || Number(i.unitCost) || 0) * 100) / 100
        );
        return {
          ...i,
          description: i.description.trim(),
          quantity: 1,
          unit: 'lot',
          unitCost: cleanAmt,
          totalAmount: cleanAmt,
          remarks: (i.remarks || '').trim(),
        };
      });

    const validation = validateSbrFormPayload({
      justification,
      additionalItems: cleanItems,
      fundingSource,
      allocations: fundingSource === 'school_budget' ? allocations : [],
      isSasInstitutional,
      orgTreasuryAvailable,
      saoRetainedAvailable,
      isDraft: !submitImmediately,
    });

    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    const cleanedChain = requiresSignatories ? normalizeSbrApprovalChain(approvalChain, false) : [];
    if (submitImmediately && requiresSignatories && cleanedChain.length === 0) {
      toast.error('Please configure at least one Institutional Signatory in Part 4 (or copy the Parent AP Pipeline).');
      return;
    }

    setSaving(true);
    try {
      const startDt = getEventStartDateTime(event);
      const startIso = startDt ? startDt.toISOString().slice(0, 10) : String(event?.startDate || '');

      if (existingSbr?.id) {
        await updateSupplementalBudgetRequest(
          existingSbr.id,
          {
            reasonCategory: existingSbr.reasonCategory || 'other',
            justification,
            additionalItems: cleanItems,
            requestedAmount: computeSupplementalItemsTotal(cleanItems),
            supportingAttachments: existingSbr.supportingAttachments || [],
            fundingSource,
            allocations: fundingSource === 'school_budget' ? allocations : [],
            approvalChain: cleanedChain,
            submitImmediately,
          },
          actor
        );
        toast.success(
          submitImmediately
            ? `Resubmitted ${existingSbr.referenceCode} for review.`
            : `Updated draft ${existingSbr.referenceCode}.`
        );
      } else {
        const created = await createSupplementalBudgetRequest(
          {
            eventId: event.id,
            eventTitle: event.title || event.name || 'Approved Activity',
            eventStartDate: startIso,
            organizationId: isSasInstitutional ? 'sas_admin' : organizationId,
            organizationName: isSasInstitutional
              ? 'Student Affairs & Services (SAS)'
              : organizationName,
            organizationAcronym,
            isSasInstitutional,
            semesterId: event.semesterId || null,
            schoolYear: event.schoolYear || activeConfig?.schoolYear || null,
            semester: event.semester || activeConfig?.activeSemester || null,
            baseApprovedBudget,
            priorSupplementalTotal,
            reasonCategory: 'other',
            justification,
            additionalItems: cleanItems,
            requestedAmount: computeSupplementalItemsTotal(cleanItems),
            supportingAttachments: [],
            fundingSource,
            allocations: fundingSource === 'school_budget' ? allocations : [],
            approvalChain: cleanedChain,
            submitImmediately,
          },
          actor
        );
        toast.success(
          submitImmediately
            ? `Submitted ${created.referenceCode} (+${formatPHP(created.requestedAmount)})!`
            : `Saved draft ${created.referenceCode}.`
        );
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('[SupplementalBudgetModal] Save failed:', err);
      toast.error(err?.message || 'Failed to save Supplemental Budget Request.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const submitButtonLabel =
    actor?.role === 'officer'
      ? 'Submit to Club Adviser'
      : actor?.role === 'adviser'
      ? 'Endorse & Forward to SAS'
      : requiresSignatories
      ? 'Submit to Institutional Signatories'
      : 'Submit Supplemental Budget';

  const allocatedMiscSum = allocations.reduce((s, a) => s + (Number(a.allocatedAmount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#003366] to-[#004a93] text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-400/20 text-amber-200 border border-amber-300/30">
                Supplemental Budget Request
              </span>
              {existingSbr?.referenceCode && (
                <span className="text-xs font-mono text-blue-200">{existingSbr.referenceCode}</span>
              )}
            </div>
            <h2 className="text-lg font-bold mt-0.5 truncate max-w-xl">
              {existingSbr ? 'Edit Supplemental Budget Request' : 'Request Additional Funds'}
            </h2>
            <p className="text-xs text-blue-100/90 mt-0.5">
              For: <span className="font-semibold text-white">{event?.title || event?.name}</span> • Original AP remains immutable
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg text-blue-100 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Budget Rollup Banner */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <div className="bg-white rounded-xl px-3.5 py-2.5 border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500">Original Approved AP Budget</div>
            <div className="text-base font-bold text-slate-800 mt-0.5">
              {formatPHP(baseApprovedBudget)}
              {priorSupplementalTotal > 0 && (
                <span className="text-xs font-medium text-emerald-600 ml-1.5">
                  (+{formatPHP(priorSupplementalTotal)} prior SBR)
                </span>
              )}
            </div>
          </div>
          <div className="bg-amber-50 rounded-xl px-3.5 py-2.5 border border-amber-200">
            <div className="text-[11px] font-medium text-amber-700">Additional Requested (This SBR)</div>
            <div className="text-base font-bold text-amber-800 mt-0.5">
              + {formatPHP(requestedAmount)}
            </div>
          </div>
          <div className="bg-emerald-50 rounded-xl px-3.5 py-2.5 border border-emerald-200">
            <div className="text-[11px] font-medium text-emerald-700">New Effective Budget (If Approved)</div>
            <div className="text-base font-bold text-emerald-800 mt-0.5">
              {formatPHP(newEffectiveBudget)}
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Returned Banner if editing a returned SBR */}
          {existingSbr?.isReturned && existingSbr.returnedRemarks && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <div className="font-bold">
                  Returned for Revision by {existingSbr.returnedByName || existingSbr.returnedByRole || 'Reviewer'}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{existingSbr.returnedRemarks}</p>
              </div>
            </div>
          )}

          {/* PART 1: Justification */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#003366] text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-800">Justification</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Detailed Justification Narrative *
              </label>
              <textarea
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain clearly why the original approved budget is insufficient and how these additional items are essential prior to event implementation..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-[#003366]"
              />
            </div>
          </section>

          {/* PART 2: Additional Expense Breakdown (AP Step 6 Style, excluding Last Year Actual Budget) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#003366] text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="text-sm font-bold text-slate-800">Additional Expense Breakdown</h3>
              </div>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, createEmptyItem()])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-[#003366] hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Baseline Category
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                    <th className="py-2.5 px-3 w-44 text-right bg-blue-100/90 text-[#001A4D] font-extrabold border-x-2 border-blue-300">
                      Proposed Additional Budget (Asking)
                    </th>
                    <th className="py-2.5 px-3 w-32 text-right">Total Amount</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Remarks</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                          placeholder="e.g. Guest Speaker Honorarium"
                          className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 font-medium"
                        />
                      </td>
                      <td className="p-2.5 bg-blue-50/40 border-x-2 border-blue-200">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.totalAmount || 0}
                          onChange={(e) =>
                            handleItemChange(item.id, 'totalAmount', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-2.5 py-1.5 bg-white border-2 border-blue-400 rounded-lg text-xs text-right font-black text-[#001A4D] shadow-inner focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                        {formatPHP(item.totalAmount)}
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={item.remarks || ''}
                          onChange={(e) => handleItemChange(item.id, 'remarks', e.target.value)}
                          placeholder="Optional notes"
                          className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-600"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                            className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors cursor-pointer"
                            title="Remove item"
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
                    <td className="py-2.5 px-3 text-right bg-blue-100/90 border-x-2 border-blue-300 font-black text-[#001A4D]">
                      {formatPHP(requestedAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-rose-800 text-sm font-black whitespace-nowrap">
                      {formatPHP(requestedAmount)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* PART 3: Supplemental Funding Source */}
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#003366] text-white text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <h3 className="text-sm font-bold text-slate-800">Supplemental Funding Source</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                {requiresSignatories
                  ? 'Routes via SAS Vetting → Institutional Signatories'
                  : 'Routes via Direct SAS Approval (No Institutional Signatories)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {permittedSources.includes('organization_funds') && (
                <button
                  type="button"
                  onClick={() => setFundingSource('organization_funds')}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    fundingSource === 'organization_funds'
                      ? 'border-[#003366] bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                      <Wallet className="w-4 h-4 text-[#003366]" /> Club Treasury Funds
                    </div>
                    {fundingSource === 'organization_funds' && (
                      <CheckCircle2 className="w-4 h-4 text-[#003366]" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Pull from {organizationName} ledger. Deducted &amp; reflected in FL upon Officer Finance Center acknowledgment.
                  </p>
                  <div className="mt-2.5 text-xs font-bold text-emerald-700">
                    Available Balance: {formatPHP(orgTreasuryAvailable)}
                  </div>
                </button>
              )}

              {permittedSources.includes('school_budget') && (
                <button
                  type="button"
                  onClick={() => setFundingSource('school_budget')}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    fundingSource === 'school_budget'
                      ? 'border-[#003366] bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                      <Landmark className="w-4 h-4 text-indigo-600" /> School Budget (Misc Fees)
                    </div>
                    {fundingSource === 'school_budget' && (
                      <CheckCircle2 className="w-4 h-4 text-[#003366]" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Cross-source top-up supported. Deducted &amp; reflected in FL upon uploading its dedicated Supplemental Voucher.
                  </p>
                  <div className="mt-2.5 text-xs font-semibold text-indigo-700">
                    {activeConfig ? `Active SY ${activeConfig.schoolYear} • ${activeConfig.activeSemester}` : 'Loading Misc Fee buckets...'}
                  </div>
                </button>
              )}

              {permittedSources.includes('retained_sao_fund') && (
                <button
                  type="button"
                  onClick={() => setFundingSource('retained_sao_fund')}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    fundingSource === 'retained_sao_fund'
                      ? 'border-[#003366] bg-blue-50/50 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                      <Coins className="w-4 h-4 text-amber-600" /> SAO Retained Activity Fund
                    </div>
                    {fundingSource === 'retained_sao_fund' && (
                      <CheckCircle2 className="w-4 h-4 text-[#003366]" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Institutional Student Contribution Retained Bucket. Routes to Signatories.
                  </p>
                  <div className="mt-2.5 text-xs font-bold text-emerald-700">
                    Available Balance: {formatPHP(saoRetainedAvailable)}
                  </div>
                </button>
              )}
            </div>

            {/* Governance Note explaining blocked Student Contributions */}
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                <strong>Governance Guardrail:</strong> Student Contributions cannot be increased retroactively after approval/publication. Cross-source top-ups (e.g., Club Treasury + Misc Fees) automatically settle across buckets at Financial Liquidation.
              </span>
            </div>

            {/* Misc Fee Bucket Picker when school_budget selected */}
            {fundingSource === 'school_budget' && (
              <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-indigo-900">
                    Select Miscellaneous Fee Bucket(s) & Allocation Split
                  </div>
                  <div
                    className={`text-xs font-bold ${
                      Math.abs(allocatedMiscSum - requestedAmount) <= 0.01 && requestedAmount > 0
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    Allocated: {formatPHP(allocatedMiscSum)} / {formatPHP(requestedAmount)}
                  </div>
                </div>

                {miscLoading ? (
                  <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading live Misc Fee buckets...
                  </div>
                ) : saoEligibleBuckets.length === 0 ? (
                  <div className="py-3 text-xs text-rose-700 bg-rose-50 px-3 rounded-lg border border-rose-200">
                    No active Miscellaneous Fee buckets configured for the current School Year.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {saoEligibleBuckets.map((cb) => {
                      const bId = cb.bucket.id;
                      const bName = cb.bucket.particular;
                      const chosen = allocations.find((a) => a.bucketId === bId);
                      const avail = Number(cb.currentAvailable ?? 0);
                      const pool = Number(cb.currentPool ?? 0);
                      const overLimit = chosen && chosen.allocatedAmount > avail + 0.009;
                      return (
                        <div
                          key={bId}
                          className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                            chosen
                              ? overLimit
                                ? 'bg-rose-50 border-rose-300'
                                : 'bg-white border-indigo-400 shadow-2xs'
                              : 'bg-white/70 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={Boolean(chosen)}
                              onChange={() => handleToggleMiscBucket(cb)}
                              className="w-4 h-4 rounded text-[#003366]"
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-800">{bName}</div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                                <span>
                                  Available:{' '}
                                  <span className={`font-semibold ${avail > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                    {formatPHP(avail)}
                                  </span>
                                </span>
                                <span className="text-slate-300">•</span>
                                <span>Pool: {formatPHP(pool)}</span>
                              </div>
                            </div>
                          </label>
                          {chosen && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">₱</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={chosen.allocatedAmount}
                                onChange={(e) =>
                                  handleAllocationAmountChange(bId, Number(e.target.value))
                                }
                                className="w-32 text-right rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold focus:border-[#003366] focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* PART 4: Signatory Approval Pipeline (Copied from Parent AP & Configurable) */}
          {requiresSignatories && (
            <section className="space-y-3 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#003366] text-white text-xs font-bold flex items-center justify-center">
                    4
                  </span>
                  <h3 className="text-sm font-bold text-slate-800">
                    Signatory Approval Pipeline
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {pipelineSourceLabel === 'parent_ap'
                      ? 'Copied from Parent AP Pipeline'
                      : pipelineSourceLabel === 'default_ap_template'
                      ? 'Default AP Pipeline'
                      : 'Custom Configured'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={loadingPipeline}
                  onClick={() => loadParentApPipeline(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loadingPipeline ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  Copy Parent AP Pipeline
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Defaults to your original Activity Proposal&apos;s signatory pipeline. You can add, remove, or reorder stages and signatories below before submitting.
              </p>

              {loadingPipeline ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Copying Parent AP signatory pipeline...
                </div>
              ) : (
                <ProposalFlowBuilder
                  approvalChain={approvalChain}
                  onChange={(newChain) => {
                    setApprovalChain(newChain);
                    setPipelineSourceLabel('custom');
                  }}
                  activeSignatories={signatories}
                  creatorName={actor.name}
                  creatorEmail={actor.email}
                  creatorRole={isSasInstitutional ? 'sas_admin' : 'officer'}
                  fundingSource={fundingSource}
                />
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {submitButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
