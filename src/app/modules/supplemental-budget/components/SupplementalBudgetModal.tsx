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
  Upload,
  FileText,
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
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { useOrgLedger } from '../../finance/hooks/useFinanceStream';
import { useMiscFeeConfigs } from '../../finance/hooks/useMiscFeeStream';
import { useRetainedActivityFunds } from '../../finance/hooks/useRetainedFundStream';
import { formatPHP, rebalanceBucketAllocations } from '../../activity-proposals/utils/proposal-calculations';
import type { ProposalBucketAllocation } from '../../activity-proposals/types/proposal.types';
import {
  computeSupplementalItemsTotal,
  doesSbrRequireSignatories,
  getEventBaseApprovedBudget,
  getEventStartDateTime,
  getPermittedSupplementalFundingSources,
  validateSbrFormPayload,
} from '../utils/sbr-validation.utils';
import {
  createSupplementalBudgetRequest,
  updateSupplementalBudgetRequest,
  type SbrActor,
} from '../services/sbr.service';
import {
  SUPPLEMENTAL_REASON_LABELS,
  type SupplementalAttachment,
  type SupplementalBudgetRequest,
  type SupplementalExpenseItem,
  type SupplementalFundingSource,
  type SupplementalReasonCategory,
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
    unit: 'pcs',
    unitCost: 0,
    totalAmount: 0,
    remarks: '',
  };
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

  const [reasonCategory, setReasonCategory] = useState<SupplementalReasonCategory>(
    existingSbr?.reasonCategory || 'price_increase'
  );
  const [justification, setJustification] = useState(existingSbr?.justification || '');
  const [items, setItems] = useState<SupplementalExpenseItem[]>(
    existingSbr?.additionalItems?.length ? existingSbr.additionalItems : [createEmptyItem()]
  );
  const [attachments, setAttachments] = useState<SupplementalAttachment[]>(
    existingSbr?.supportingAttachments || []
  );
  const [fundingSource, setFundingSource] = useState<SupplementalFundingSource>(
    existingSbr?.fundingSource && permittedSources.includes(existingSbr.fundingSource)
      ? existingSbr.fundingSource
      : permittedSources[0]
  );
  const [allocations, setAllocations] = useState<ProposalBucketAllocation[]>(
    existingSbr?.allocations?.filter((a) => a.fundType === 'misc_fee') || []
  );
  const [uploadingFile, setUploadingFile] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset state whenever modal opens for a different existingSbr
  useEffect(() => {
    if (!isOpen) return;
    setReasonCategory(existingSbr?.reasonCategory || 'price_increase');
    setJustification(existingSbr?.justification || '');
    setItems(
      existingSbr?.additionalItems?.length ? existingSbr.additionalItems : [createEmptyItem()]
    );
    setAttachments(existingSbr?.supportingAttachments || []);
    setFundingSource(
      existingSbr?.fundingSource && permittedSources.includes(existingSbr.fundingSource)
        ? existingSbr.fundingSource
        : permittedSources[0]
    );
    setAllocations(existingSbr?.allocations?.filter((a) => a.fundType === 'misc_fee') || []);
  }, [isOpen, existingSbr, permittedSources]);

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
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitCost') {
          const q = Math.max(0, Number(updated.quantity) || 0);
          const c = Math.max(0, Number(updated.unitCost) || 0);
          updated.totalAmount = Math.round(q * c * 100) / 100;
        }
        return updated;
      })
    );
  };

  const handleToggleMiscBucket = (bucket: any) => {
    const exists = allocations.some((a) => a.bucketId === bucket.id);
    if (exists) {
      const next = allocations.filter((a) => a.bucketId !== bucket.id);
      setAllocations(
        next.length > 0 && requestedAmount > 0
          ? rebalanceBucketAllocations(next, requestedAmount)
          : next
      );
    } else {
      const added: ProposalBucketAllocation = {
        bucketId: bucket.id,
        bucketName: bucket.particular,
        fundType: 'misc_fee',
        allocatedAmount: 0,
        availableAmount: Number(bucket.availableBalance ?? bucket.available ?? 0),
        poolAmount: Number(bucket.totalPool ?? bucket.poolAmount ?? 0),
      };
      const next = [...allocations, added];
      setAllocations(
        requestedAmount > 0 ? rebalanceBucketAllocations(next, requestedAmount) : next
      );
    }
  };

  const handleAllocationAmountChange = (bucketId: string, val: number) => {
    setAllocations((prev) =>
      prev.map((a) =>
        a.bucketId === bucketId
          ? { ...a, allocatedAmount: Math.max(0, Number(val) || 0) }
          : a
      )
    );
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File exceeds 10MB limit.');
      return;
    }
    setUploadingFile(true);
    try {
      const uploaded = await uploadToCloudinary(file, 'sti_sync_supplemental_budgets');
      setAttachments((prev) => [
        ...prev,
        {
          id: `att_${Date.now()}`,
          name: file.name,
          url: uploaded.secure_url,
          mimeType: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        },
      ]);
      toast.success(`Uploaded ${file.name}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload attachment');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleSave = async (submitImmediately: boolean) => {
    const cleanItems = items
      .filter((i) => i.description.trim() || i.totalAmount > 0)
      .map((i) => ({
        ...i,
        description: i.description.trim(),
        quantity: Math.max(1, Number(i.quantity) || 1),
        unitCost: Math.max(0, Number(i.unitCost) || 0),
        totalAmount: Math.round(
          Math.max(0, Number(i.quantity) || 1) * Math.max(0, Number(i.unitCost) || 0) * 100
        ) / 100,
      }));

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

    setSaving(true);
    try {
      const startDt = getEventStartDateTime(event);
      const startIso = startDt ? startDt.toISOString().slice(0, 10) : String(event?.startDate || '');

      if (existingSbr?.id) {
        await updateSupplementalBudgetRequest(
          existingSbr.id,
          {
            reasonCategory,
            justification,
            additionalItems: cleanItems,
            requestedAmount: computeSupplementalItemsTotal(cleanItems),
            supportingAttachments: attachments,
            fundingSource,
            allocations: fundingSource === 'school_budget' ? allocations : [],
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
            reasonCategory,
            justification,
            additionalItems: cleanItems,
            requestedAmount: computeSupplementalItemsTotal(cleanItems),
            supportingAttachments: attachments,
            fundingSource,
            allocations: fundingSource === 'school_budget' ? allocations : [],
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
    actor.role === 'officer'
      ? 'Submit to Club Adviser'
      : actor.role === 'adviser'
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

          {/* PART 1: Justification & Attachments */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#003366] text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-800">Justification & Supporting Proof</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Primary Reason Category *
                </label>
                <select
                  value={reasonCategory}
                  onChange={(e) => setReasonCategory(e.target.value as SupplementalReasonCategory)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-[#003366]"
                >
                  {(Object.keys(SUPPLEMENTAL_REASON_LABELS) as SupplementalReasonCategory[]).map((key) => (
                    <option key={key} value={key}>
                      {SUPPLEMENTAL_REASON_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Supporting Quotation / Canvass (Optional)
                </label>
                <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-blue-50/40 hover:border-blue-400 cursor-pointer text-xs font-semibold text-slate-700 transition-colors">
                  {uploadingFile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-blue-600" /> Upload PDF / Image Quotation
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleUploadAttachment}
                    disabled={uploadingFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-700 hover:text-blue-700 flex items-center gap-1 max-w-[180px] truncate"
                    >
                      {att.name} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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

          {/* PART 2: Additional Line-Item Expenses */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#003366] text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="text-sm font-bold text-slate-800">Additional Expense Breakdown</h3>
              </div>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, createEmptyItem()])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-[#003366] hover:bg-blue-100 border border-blue-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line Item
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-semibold">Item / Particular</th>
                      <th className="text-right px-3 py-2.5 font-semibold w-20">Qty</th>
                      <th className="text-left px-3 py-2.5 font-semibold w-24">Unit</th>
                      <th className="text-right px-3 py-2.5 font-semibold w-28">Unit Cost (₱)</th>
                      <th className="text-right px-3 py-2.5 font-semibold w-28">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.id} className="bg-white">
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            placeholder="e.g., Additional Sound System Rental"
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-[#003366] focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                            className="w-full text-right rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#003366] focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                            placeholder="pcs / set"
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#003366] focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => handleItemChange(item.id, 'unitCost', Number(e.target.value))}
                            className="w-full text-right rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#003366] focus:outline-none"
                          />
                        </td>
                        <td className="p-2 text-right font-bold text-slate-800 whitespace-nowrap">
                          {formatPHP(item.totalAmount)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            disabled={items.length <= 1}
                            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-right font-bold text-slate-700">
                        Total Supplemental Request:
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-[#003366] text-sm">
                        {formatPHP(requestedAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
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
                    Pull directly from {organizationName} ledger. Direct SAS Approval.
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
                    Cross-source top-up supported. Requires SAS Vetting, Signatories & Supplemental Voucher.
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
                    {saoEligibleBuckets.map((bucket) => {
                      const chosen = allocations.find((a) => a.bucketId === bucket.id);
                      const avail = Number((bucket as any).availableBalance ?? (bucket as any).available ?? 0);
                      const overLimit = chosen && chosen.allocatedAmount > avail + 0.009;
                      return (
                        <div
                          key={bucket.id}
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
                              onChange={() => handleToggleMiscBucket(bucket)}
                              className="w-4 h-4 rounded text-[#003366]"
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-800">{bucket.particular}</div>
                              <div className="text-[11px] text-slate-500">
                                Available: <span className="font-semibold text-emerald-700">{formatPHP(avail)}</span>
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
                                  handleAllocationAmountChange(bucket.id, Number(e.target.value))
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
