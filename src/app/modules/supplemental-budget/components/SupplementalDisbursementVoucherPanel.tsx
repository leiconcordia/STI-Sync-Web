/**
 * src/app/modules/supplemental-budget/components/SupplementalDisbursementVoucherPanel.tsx
 *
 * Renders dedicated Supplemental Disbursement Voucher input cards inside DisbursementVoucherModal
 * for every approved Supplemental Budget Request (SBR) on an event:
 * - `school_budget` / `retained_sao_fund` SBRs: Full Cheque #, Voucher #, Release Date, & File Upload
 *   (or "Bundled with Primary Event Voucher" option), with permanent lock once attached.
 * - `organization_funds` SBRs: Marked Exempt (Club Treasury) and shows Finance Center acknowledgment status.
 */

import React, { useState } from 'react';
import {
  FileCheck,
  Upload,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  Landmark,
  Wallet,
  Coins,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { formatCurrency } from '../../../utils/currency';
import { useEventSupplementalBudgets } from '../hooks/useSupplementalBudgetStream';
import {
  attachSupplementalDisbursementVoucher,
  type SbrActor,
} from '../services/sbr.service';
import type { SupplementalBudgetRequest } from '../types/sbr.types';

interface SupplementalDisbursementVoucherPanelProps {
  eventId: string;
  canManage: boolean;
  isLiquidationLocked: boolean;
  actor: SbrActor;
}

interface SingleSbrVoucherCardProps {
  sbr: SupplementalBudgetRequest;
  canManage: boolean;
  isLiquidationLocked: boolean;
  actor: SbrActor;
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function SingleSbrVoucherCard({
  sbr,
  canManage,
  isLiquidationLocked,
  actor,
}: SingleSbrVoucherCardProps) {
  const existing = sbr.disbursementVoucher;
  const isOrgFunds = sbr.fundingSource === 'organization_funds';
  const isLocked = Boolean(existing) || isLiquidationLocked || !canManage;
  const todayStr = getTodayDate();

  const [chequeNumber, setChequeNumber] = useState(existing?.chequeNumber || '');
  const [voucherNumber, setVoucherNumber] = useState(existing?.voucherNumber || '');
  const [releaseDate, setReleaseDate] = useState(existing?.releaseDate || todayStr);
  const [notes, setNotes] = useState(existing?.notes || '');
  const [attachmentUrl, setAttachmentUrl] = useState(existing?.attachmentUrl || '');
  const [fileName, setFileName] = useState(existing?.fileName || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File exceeds 10MB limit.');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadToCloudinary(file, {
        folder: 'disbursements/supplemental-vouchers',
        acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
        maxBytes: 10 * 1024 * 1024,
      });
      setAttachmentUrl(res.secureUrl);
      setFileName(file.name);
      toast.success(`Uploaded ${file.name}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload supplemental voucher copy.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleCommit = async () => {
    if (!chequeNumber.trim() && !voucherNumber.trim()) {
      toast.error('Please enter a Cheque # or Voucher # for this supplemental disbursement.');
      return;
    }
    if (!releaseDate) {
      toast.error('Please select the Date Released / Disbursed.');
      return;
    }
    if (releaseDate > todayStr) {
      toast.error('Date Released cannot be in the future. Please select today or an earlier date.');
      return;
    }
    if (!attachmentUrl) {
      toast.error('Please upload the official Supplemental Disbursement Voucher copy.');
      return;
    }

    setSaving(true);
    try {
      await attachSupplementalDisbursementVoucher(
        sbr.id,
        {
          mode: 'separate',
          chequeNumber: chequeNumber.trim(),
          voucherNumber: voucherNumber.trim() || undefined,
          releaseDate,
          attachmentUrl,
          fileName,
          notes: notes.trim() || undefined,
          disbursedAmount: sbr.requestedAmount,
        },
        actor
      );
      toast.success(
        `Supplemental Disbursement Voucher attached for ${sbr.referenceCode}! Funds deducted and reflected in Financial Liquidation.`
      );
      setConfirming(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save Supplemental Disbursement Voucher.');
    } finally {
      setSaving(false);
    }
  };

  // Option A: Organization Funds SBRs are Exempt from School Disbursement Vouchers (acknowledged in Finance Center)
  if (isOrgFunds) {
    return (
      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#001A4D]" />
            <span className="font-bold text-slate-900">
              {sbr.referenceCode} • +{formatCurrency(sbr.requestedAmount)}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
              Exempt — Club Treasury
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              sbr.ledgerDeducted
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {sbr.ledgerDeducted ? 'Acknowledged in Finance Center' : 'Pending Finance Center Acknowledgment'}
          </span>
        </div>
        <p className="text-[11px] text-slate-600">
          {sbr.ledgerDeducted
            ? `No school voucher required. Deducted from Club Treasury Ledger${sbr.ledgerAcknowledgedBy ? ` by ${sbr.ledgerAcknowledgedBy}` : ''}.`
            : 'No school voucher required. Go to Officer Finance Center → Approved Club-Funded Activities to acknowledge and deduct this supplemental budget from the Club Ledger.'}
        </p>
      </div>
    );
  }

  const bucketSummary =
    (sbr.allocations || []).map((a) => a.bucketName).filter(Boolean).join(' + ') ||
    sbr.miscFeeBucketName ||
    (sbr.fundingSource === 'retained_sao_fund' ? 'SAO Retained Activity Fund' : 'School Budget (Misc Fee)');

  return (
    <div
      className={`p-4 rounded-xl border space-y-3 text-xs ${
        existing
          ? 'bg-emerald-50/40 border-emerald-200'
          : 'bg-amber-50/40 border-amber-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {sbr.fundingSource === 'retained_sao_fund' ? (
              <Coins className="w-4 h-4 text-purple-600" />
            ) : (
              <Landmark className="w-4 h-4 text-[#001A4D]" />
            )}
            <span className="font-bold text-slate-900">
              Supplemental Voucher • {sbr.referenceCode}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#001A4D]">
              +{formatCurrency(sbr.requestedAmount)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Source: <span className="font-semibold text-slate-700">{bucketSummary}</span>
          </p>
        </div>

        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
            existing
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : 'bg-amber-100 text-amber-900 border-amber-300'
          }`}
        >
          {existing
            ? existing.mode === 'bundled_with_primary'
              ? 'Bundled with Primary'
              : 'Attached & Locked'
            : 'Pending Supplemental Voucher'}
        </span>
      </div>

      {/* Read-Only Verified State */}
      {existing ? (
        <div className="p-3 rounded-lg bg-white border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5 text-[11px] text-slate-700">
            {existing.mode === 'bundled_with_primary' ? (
              <div className="font-semibold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Combined into Primary Event Disbursement Voucher
              </div>
            ) : (
              <>
                <div className="font-mono font-bold text-slate-900">
                  Cheque #{existing.chequeNumber || 'N/A'}
                  {existing.voucherNumber ? ` • Voucher #${existing.voucherNumber}` : ''}
                </div>
                <div>
                  Released: <span className="font-mono">{existing.releaseDate || 'N/A'}</span> • Amount:{' '}
                  <strong>{formatCurrency(existing.disbursedAmount ?? sbr.requestedAmount)}</strong>
                </div>
              </>
            )}
            {existing.attachedBy && (
              <div className="text-slate-500">Recorded by {existing.attachedBy}</div>
            )}
          </div>
          {existing.attachmentUrl && (
            <a
              href={existing.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shrink-0"
            >
              <Eye className="w-3.5 h-3.5" /> View Copy <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      ) : isLocked ? (
        <div className="p-2.5 rounded-lg bg-white/80 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {isLiquidationLocked
              ? 'Locked because Financial Liquidation has been submitted or approved.'
              : 'Read-only: Awaiting SAS Admin / Club Adviser to attach this Supplemental Disbursement Voucher.'}
          </span>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Cheque / Ref # *
              </label>
              <input
                type="text"
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
                placeholder="e.g. CHK-2026-0192"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-[#001A4D] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Voucher # (Optional)
              </label>
              <input
                type="text"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
                placeholder="e.g. DV-2026-044"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-[#001A4D] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Date Released *
              </label>
              <input
                type="date"
                max={todayStr}
                value={releaseDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val > todayStr) {
                    toast.error('Date Released cannot be in the future. Please select today or an earlier date.');
                    setReleaseDate(todayStr);
                  } else {
                    setReleaseDate(val);
                  }
                }}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:border-[#001A4D] focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">Future dates banned (Today or earlier only)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Supplemental Amount Disbursed (Locked)
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={formatCurrency(sbr.requestedAmount)}
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-200 bg-slate-100 text-slate-700 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Official Voucher Scan (Image / PDF) *
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#001A4D]/40 bg-white hover:bg-blue-50 text-[#001A4D] font-bold cursor-pointer truncate">
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{fileName || 'Upload Voucher Copy'}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                {attachmentUrl && (
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    title="Preview uploaded voucher"
                  >
                    <Eye className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes (e.g. Supplemental cheque claimed at Accounting)..."
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:border-[#001A4D] focus:outline-none"
          />

          {confirming ? (
            <div className="p-3 rounded-lg bg-amber-100/80 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-amber-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                Permanent action: Confirming will lock this Supplemental Voucher, deduct the Misc Fee / Retained Fund allocation, and reflect the supplemental funds in Financial Liquidation. Confirm?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirming(false)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCommit}
                  className="px-3 py-1.5 rounded-lg bg-[#001A4D] text-[#FFD41C] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
                  Confirm &amp; Deduct
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving || uploading}
                onClick={() => setConfirming(true)}
                className="px-4 py-2 rounded-xl bg-[#001A4D] hover:bg-[#002D72] text-[#FFD41C] font-bold text-xs inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <FileCheck className="w-3.5 h-3.5" />
                Attach Supplemental Voucher &amp; Deduct Funds
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SupplementalDisbursementVoucherPanel({
  eventId,
  canManage,
  isLiquidationLocked,
  actor,
}: SupplementalDisbursementVoucherPanelProps) {
  const { approvedRequests = [] } = useEventSupplementalBudgets(eventId);

  if (approvedRequests.length === 0) return null;

  return (
    <div className="pt-4 border-t border-slate-200 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#001A4D] flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-amber-600" />
            Approved Supplemental Budget Disbursement Voucher(s)
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Record supplemental cheque/voucher copies for School Budget &amp; Retained Fund approvals. Club Treasury SBRs are acknowledged in Finance Center.
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
          {approvedRequests.length} Approved SBR{approvedRequests.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-3">
        {approvedRequests.map((sbr) => (
          <SingleSbrVoucherCard
            key={sbr.id}
            sbr={sbr}
            canManage={canManage}
            isLiquidationLocked={isLiquidationLocked}
            actor={actor}
          />
        ))}
      </div>
    </div>
  );
}
