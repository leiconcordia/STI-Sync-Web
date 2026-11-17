import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  FileCheck,
  Landmark,
  Paperclip,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import type {
  ProposalBucketAllocation,
  SurplusReturnAllocation,
  DeficitDeductionAllocation,
} from '../../activity-proposals/types/proposal.types';
import type {
  DisbursementVoucherAttachment,
  LiquidationDocument,
  ReceiptAttachment,
} from '../../finance/types/liquidation.types';
import type {
  PARActivityLedgerTransaction,
  PARAnticipatedItem,
  PARNormalizedReceiptProof,
} from '../hooks/usePARActivityFinancials';
import { formatCurrency, formatVariance } from '../../../utils/currency';

interface PARFinancialTransactionsSectionProps {
  anticipatedExpenses: number;
  anticipatedLineItems: PARAnticipatedItem[];
  disbursedBudget: number;
  actualSpent: number;
  variance: number;
  linkedLiquidation: LiquidationDocument | null;
  copiedFromLiquidation?: boolean;
  sourceAllocations: ProposalBucketAllocation[];
  surplusReturnAllocations: SurplusReturnAllocation[];
  deficitDeductionAllocations: DeficitDeductionAllocation[];
  ledgerTransactions: PARActivityLedgerTransaction[];
  voucher: DisbursementVoucherAttachment | null;
  lineItemReceipts: PARNormalizedReceiptProof[];
  settlementProofs: ReceiptAttachment[];
  loading?: boolean;
  onOpenFinancialModal?: () => void;
  onOpenDocumentsModal?: () => void;
}

export function PARFinancialTransactionsSection({
  anticipatedExpenses,
  anticipatedLineItems,
  disbursedBudget,
  actualSpent,
  variance,
  linkedLiquidation,
  copiedFromLiquidation,
  sourceAllocations,
  surplusReturnAllocations,
  deficitDeductionAllocations,
  ledgerTransactions,
  voucher,
  lineItemReceipts,
  settlementProofs,
  loading = false,
  onOpenFinancialModal,
  onOpenDocumentsModal,
}: PARFinancialTransactionsSectionProps) {
  const isSurplus = variance >= 0;
  const isExactZero = Math.abs(variance) < 0.01;
  const settlementStatus = linkedLiquidation?.cashierSettlementStatus;
  const totalProofCount =
    (voucher?.fileUrl ? 1 : 0) + lineItemReceipts.length + settlementProofs.length;

  const settlementBadge = () => {
    if (!linkedLiquidation) return null;
    if (isExactZero && linkedLiquidation.status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Exact Match • Settled
        </span>
      );
    }
    if (settlementStatus === 'verified') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3 h-3" /> Settlement Verified &amp; Posted
        </span>
      );
    }
    if (settlementStatus === 'proof_uploaded') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
          <Clock className="w-3 h-3" /> Proof Uploaded • Awaiting SAS Verification
        </span>
      );
    }
    if (linkedLiquidation.status === 'approved' && !isExactZero) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3" /> Pending Post-Approval Settlement
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        FL Status: {String(linkedLiquidation.status || 'pending').replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-3.5">
      {/* Header & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Activity Financial Summary, Transactions &amp; Proofs
          </h4>
          {settlementBadge()}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenFinancialModal && (
            <button
              type="button"
              onClick={onOpenFinancialModal}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Anticipated vs. Actual &amp; Receipts</span>
            </button>
          )}
          {onOpenDocumentsModal && (
            <button
              type="button"
              onClick={onOpenDocumentsModal}
              className="text-[11px] font-bold text-[#001A4D] hover:bg-blue-100 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 inline-flex items-center gap-1 cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5 text-[#0E4EBD]" />
              <span>View All Proofs &amp; Voucher ({totalProofCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* 4-Card KPI Strip: Anticipated vs Disbursed vs Actual Spent vs Unspent/Overspent */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <span className="text-[10px] text-slate-500 block font-medium">
            AP Anticipated Expenses
          </span>
          <strong className="text-sm font-black text-slate-800 font-mono">
            {formatCurrency(anticipatedExpenses)}
          </strong>
          <span className="text-[10px] text-slate-400 block">
            {anticipatedLineItems.length} projected item{anticipatedLineItems.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-200">
          <span className="text-[10px] text-blue-700 block font-medium">
            Disbursed / Approved Ceiling
          </span>
          <strong className="text-sm font-black text-[#001A4D] font-mono">
            {formatCurrency(disbursedBudget)}
          </strong>
          <span className="text-[10px] text-blue-600 block truncate">
            {voucher?.chequeNumber ? `Cheque #${voucher.chequeNumber}` : (copiedFromLiquidation || linkedLiquidation ? 'From Liquidation' : 'AP Allocation')}
          </span>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <span className="text-[10px] text-slate-500 block font-medium">
            Actual Expenses Spent
          </span>
          <strong className="text-sm font-black text-slate-900 font-mono">
            {formatCurrency(actualSpent)}
          </strong>
          <span className="text-[10px] text-slate-500 block">
            {linkedLiquidation?.lineItems?.length || 0} FL line item{(linkedLiquidation?.lineItems?.length || 0) === 1 ? '' : 's'}
          </span>
        </div>

        <div
          className={`p-2.5 rounded-lg border ${
            isSurplus ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}
        >
          <span
            className={`text-[10px] block font-bold ${
              isSurplus ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isExactZero ? 'Net Variance (Exact)' : isSurplus ? 'Unspent Cash (Surplus)' : 'Overspent (Deficit)'}
          </span>
          <strong
            className={`text-sm font-black font-mono ${
              isSurplus ? 'text-emerald-900' : 'text-rose-900'
            }`}
          >
            {formatVariance(variance)}
          </strong>
          <span className={`text-[10px] block ${isSurplus ? 'text-emerald-700' : 'text-rose-700'}`}>
            {isExactZero
              ? '100% utilized'
              : isSurplus
                ? 'Remaining unspent fund'
                : 'Covered beyond budget'}
          </span>
        </div>
      </div>

      {/* Bucket Funding, Surplus Returns & Overspend Coverage Routing */}
      {(sourceAllocations.length > 0 ||
        surplusReturnAllocations.length > 0 ||
        deficitDeductionAllocations.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
          {sourceAllocations.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 text-[10px]">
                <Landmark className="w-3.5 h-3.5 text-[#0E4EBD]" />
                Source Bucket(s) Used
              </span>
              {sourceAllocations.map((alloc) => (
                <div key={alloc.bucketId} className="flex items-center justify-between gap-2 text-slate-700">
                  <span className="truncate font-medium">{alloc.bucketName}</span>
                  <span className="font-mono font-bold text-slate-900 shrink-0">
                    -{formatCurrency(alloc.allocatedAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {surplusReturnAllocations.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
              <span className="font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5 text-[10px]">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-700" />
                Unspent Surplus Returned To
                {linkedLiquidation?.cashierReferenceNo && (
                  <span className="ml-auto font-mono text-[10px] text-emerald-800">
                    OR# {linkedLiquidation.cashierReferenceNo}
                  </span>
                )}
              </span>
              {surplusReturnAllocations
                .filter((r) => Number(r.returnAmount) > 0)
                .map((r) => (
                  <div key={r.bucketId} className="flex items-center justify-between gap-2 text-emerald-900">
                    <span className="truncate font-medium">{r.bucketName}</span>
                    <span className="font-mono font-bold shrink-0">
                      +{formatCurrency(r.returnAmount)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {deficitDeductionAllocations.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1.5">
              <span className="font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5 text-[10px]">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-700" />
                Overspend Covered By Bucket(s)
                {linkedLiquidation?.cashierReferenceNo && (
                  <span className="ml-auto font-mono text-[10px] text-rose-800">
                    Ref# {linkedLiquidation.cashierReferenceNo}
                  </span>
                )}
              </span>
              {deficitDeductionAllocations
                .filter((r) => Number(r.deductAmount) > 0)
                .map((r) => (
                  <div key={r.bucketId} className="flex items-center justify-between gap-2 text-rose-900">
                    <span className="truncate font-medium">
                      {r.bucketName}
                      {r.isSupplementalSource && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold uppercase">
                          Supplemental
                        </span>
                      )}
                    </span>
                    <span className="font-mono font-bold shrink-0">
                      -{formatCurrency(r.deductAmount)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Recorded Ledger Transactions Made in This Activity */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-[11px]">
          <span className="font-bold uppercase tracking-wider text-slate-700">
            Activity Financial Transactions ({ledgerTransactions.length})
          </span>
          {loading && <span className="text-slate-500">Loading ledger entries...</span>}
        </div>
        {ledgerTransactions.length > 0 ? (
          <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto text-[11px]">
            {ledgerTransactions.map((tx) => (
              <div key={`${tx.source}-${tx.id}`} className="px-3 py-2 flex items-center justify-between gap-2 bg-white">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{tx.description}</p>
                  <p className="text-[10px] text-slate-500">
                    {tx.dateLabel} • {tx.bucketName}
                    {tx.referenceNo ? ` • Ref #${tx.referenceNo}` : ''}
                    {tx.performedBy ? ` • By ${tx.performedBy}` : ''}
                  </p>
                </div>
                <span
                  className={`font-mono font-bold shrink-0 ${
                    tx.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {tx.direction === 'in' ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 text-[11px] text-slate-500 bg-slate-50/50">
            No posted bucket ledger transactions recorded yet for this activity
            {linkedLiquidation?.status === 'approved' && !isExactZero && settlementStatus !== 'verified'
              ? ' (awaiting post-approval settlement confirmation).'
              : '.'}
          </div>
        )}
      </div>

      {/* Attached Financial Liquidation Proofs Summary Strip */}
      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold ${
            voucher?.fileUrl
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          Disbursement Voucher: {voucher?.fileUrl ? 'Attached' : 'None'}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold ${
            lineItemReceipts.length > 0
              ? 'bg-blue-50 border-blue-200 text-[#001A4D]'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          <Receipt className="w-3.5 h-3.5" />
          FL Receipts &amp; Affidavits: {lineItemReceipts.length}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold ${
            settlementProofs.length > 0
              ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {variance < -0.009 ? 'Reimbursement' : 'Cashier Settlement'} Proofs: {settlementProofs.length}
        </span>
      </div>
    </div>
  );
}
