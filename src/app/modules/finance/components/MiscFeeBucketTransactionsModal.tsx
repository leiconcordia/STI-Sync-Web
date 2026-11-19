import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Landmark,
  Loader2,
  Receipt,
  Wallet,
  X,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type {
  ComputedBucketBalance,
  MiscFeeLedgerEntry,
  MiscFeeSemesterTerm,
} from '../types/misc-fee.types';
import type {
  DisbursementVoucherAttachment,
  ReceiptAttachment,
} from '../types/liquidation.types';
import { useUserNameResolver } from '../hooks/useUserNameResolver';
import { filterMiscLedgerForPeriod } from '../services/misc-fee.service';
import { formatCurrency } from '../../../utils/currency';
import ReceiptLightboxModal from './ReceiptLightboxModal';

type LedgerEntryWithAlloc = MiscFeeLedgerEntry & {
  allocations?: Array<{ bucketId: string; bucketName: string; amount: number }>;
  isSupplementalSource?: boolean;
};

interface EventVoucherInfo {
  disbursementVoucher?: DisbursementVoucherAttachment | null;
}

interface LiquidationProofInfo {
  id: string;
  cashierSettlementProofs?: ReceiptAttachment[];
  cashierSettlementStatus?: string;
  cashierReferenceNo?: string;
}

interface MiscFeeBucketTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bucket: ComputedBucketBalance | null;
  schoolYear: string;
  activeSemester: MiscFeeSemesterTerm | string;
  ledgerEntries: LedgerEntryWithAlloc[];
}

export function MiscFeeBucketTransactionsModal({
  isOpen,
  onClose,
  bucket,
  schoolYear,
  activeSemester,
  ledgerEntries,
}: MiscFeeBucketTransactionsModalProps) {
  const { resolveUserName } = useUserNameResolver();
  const [vouchersByEventId, setVouchersByEventId] = useState<Record<string, EventVoucherInfo>>({});
  const [liquidationsByKey, setLiquidationsByKey] = useState<Record<string, LiquidationProofInfo>>({});
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    fileName?: string;
    fileType?: string;
    title?: string;
    amount?: number;
  } | null>(null);

  const matchingLedger = useMemo(() => {
    if (!bucket) return [];
    const bucketId = bucket.bucket.id;
    const particularLower = (bucket.bucket.particular || '').toLowerCase();
    const scopedEntries = filterMiscLedgerForPeriod(ledgerEntries || [], schoolYear, activeSemester);
    return scopedEntries.filter((entry) => {
      const matchesPrimary =
        entry.bucketId === bucketId ||
        (entry.bucketName && particularLower && entry.bucketName.toLowerCase().includes(particularLower));
      const matchesAlloc =
        Array.isArray(entry.allocations) && entry.allocations.some((a) => a.bucketId === bucketId);
      return matchesPrimary || matchesAlloc;
    });
  }, [bucket, ledgerEntries, schoolYear, activeSemester]);

  useEffect(() => {
    if (!isOpen || matchingLedger.length === 0) {
      setVouchersByEventId({});
      setLiquidationsByKey({});
      return;
    }

    let cancelled = false;
    setLoadingProofs(true);

    const eventIds = Array.from(
      new Set(matchingLedger.map((tx) => String(tx.eventId || '').trim()).filter(Boolean))
    );
    const liquidationIds = Array.from(
      new Set(matchingLedger.map((tx) => String(tx.liquidationId || '').trim()).filter(Boolean))
    );

    const loadAll = async () => {
      const nextVouchers: Record<string, EventVoucherInfo> = {};
      const nextLiquidations: Record<string, LiquidationProofInfo> = {};

      await Promise.all(
        eventIds.map(async (evId) => {
          try {
            let evSnap = await getDoc(doc(db, 'activities', evId));
            if (!evSnap.exists()) {
              evSnap = await getDoc(doc(db, 'events', evId));
            }
            if (evSnap.exists()) {
              const evData = evSnap.data() as any;
              if (evData?.disbursementVoucher) {
                nextVouchers[evId] = { disbursementVoucher: evData.disbursementVoucher };
              }
            }
          } catch {}
        })
      );

      await Promise.all(
        liquidationIds.map(async (liqId) => {
          try {
            const liqSnap = await getDoc(doc(db, 'liquidations', liqId));
            if (liqSnap.exists()) {
              const lData = liqSnap.data() as any;
              nextLiquidations[liqId] = {
                id: liqSnap.id,
                cashierSettlementProofs: Array.isArray(lData?.cashierSettlementProofs)
                  ? lData.cashierSettlementProofs
                  : [],
                cashierSettlementStatus: lData?.cashierSettlementStatus,
                cashierReferenceNo: lData?.cashierReferenceNo,
              };
            }
          } catch {}
        })
      );

      // Fallback by eventId in case an entry only stored eventId or voucher sits on the liquidation doc
      await Promise.all(
        eventIds.map(async (evId) => {
          try {
            const liqQ = await getDocs(
              query(collection(db, 'liquidations'), where('eventId', '==', evId))
            );
            liqQ.docs.forEach((d) => {
              const lData = d.data() as any;
              if (String(lData?.status || '').toLowerCase() === 'voided' || lData?.isDeleted) return;
              const info: LiquidationProofInfo = {
                id: d.id,
                cashierSettlementProofs: Array.isArray(lData?.cashierSettlementProofs)
                  ? lData.cashierSettlementProofs
                  : [],
                cashierSettlementStatus: lData?.cashierSettlementStatus,
                cashierReferenceNo: lData?.cashierReferenceNo,
              };
              nextLiquidations[d.id] = info;
              nextLiquidations[`event:${evId}`] = info;
              if (!nextVouchers[evId]?.disbursementVoucher && lData?.disbursementVoucher) {
                nextVouchers[evId] = { disbursementVoucher: lData.disbursementVoucher };
              }
            });
          } catch {}
        })
      );

      if (!cancelled) {
        setVouchersByEventId(nextVouchers);
        setLiquidationsByKey(nextLiquidations);
        setLoadingProofs(false);
      }
    };

    loadAll().catch(() => {
      if (!cancelled) setLoadingProofs(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, matchingLedger]);

  if (!isOpen || !bucket) return null;

  const totalBudget = Number(bucket.currentPool) || 0;
  const totalDeductions = Number(bucket.currentDisbursed) || 0;
  const totalReturned = Number(bucket.currentReturnedSurplus) || 0;
  const availableBalance = Number(bucket.currentAvailable) || 0;

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-gray-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-[#001A4D] px-5 py-4 flex items-center justify-between text-white">
            <div>
              <h3 className="text-sm font-bold">{bucket.bucket.particular}</h3>
              <p className="text-[11px] text-white/75">
                Bucket Financial Summary, Disbursement Vouchers &amp; Settlement Proofs • SY {schoolYear} ({activeSemester})
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4">
            {/* KPI Summary Cards: Total Budget, Total Deductions, Returned Surplus, Available Balance */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#001A4D]">
                  <span>Total Budget</span>
                  <Landmark className="w-3.5 h-3.5 text-[#0E4EBD]" />
                </div>
                <p className="text-sm font-black font-mono text-[#001A4D]">
                  {formatCurrency(totalBudget)}
                </p>
                <span className="text-[10px] text-blue-700 block">
                  {activeSemester}
                  {activeSemester === '2nd Semester' && bucket.carryOverFrom1stSem > 0
                    ? ` (incl. ${formatCurrency(bucket.carryOverFrom1stSem)} carry-over)`
                    : ''}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-900">
                  <span>Total Deductions</span>
                  <ArrowDownRight className="w-3.5 h-3.5 text-amber-700" />
                </div>
                <p className="text-sm font-black font-mono text-amber-900">
                  {totalDeductions > 0 ? `-${formatCurrency(totalDeductions)}` : formatCurrency(0)}
                </p>
                <span className="text-[10px] text-amber-700 block">Disbursed &amp; Overspend</span>
              </div>

              <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-purple-900">
                  <span>Returned Surplus</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-purple-700" />
                </div>
                <p className="text-sm font-black font-mono text-purple-900">
                  {totalReturned > 0 ? `+${formatCurrency(totalReturned)}` : formatCurrency(0)}
                </p>
                <span className="text-[10px] text-purple-700 block">Liquidation Returns</span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                  <span>Available Balance</span>
                  <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <p className="text-sm font-black font-mono text-emerald-900">
                  {formatCurrency(availableBalance)}
                </p>
                <span className="text-[10px] text-emerald-700 block">Actual Remaining Pool</span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-[#0E4EBD] shrink-0" />
                <span>
                  Reconciliation: <strong>{formatCurrency(totalBudget)}</strong> Budget{' '}
                  − <strong>{formatCurrency(totalDeductions)}</strong> Deductions{' '}
                  + <strong>{formatCurrency(totalReturned)}</strong> Returned{' '}
                  ={' '}
                  <strong className="text-emerald-800">{formatCurrency(availableBalance)}</strong>
                </span>
              </div>
              {loadingProofs && (
                <span className="inline-flex items-center gap-1 text-[10px] text-[#0E4EBD] font-sans font-semibold">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading attached proofs...
                </span>
              )}
            </div>

            {/* All Activity Ledger Transactions with Viewable Vouchers & Return Proofs */}
            <div>
              <h4 className="text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-2">
                Activity Disbursement &amp; Settlement Ledger ({matchingLedger.length})
              </h4>
              {matchingLedger.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500 border border-dashed border-gray-200 rounded-xl">
                  No Disbursement Vouchers, Overspend Deductions, or Surplus Returns logged for this Particular yet.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Activity</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Disbursement Voucher / Transaction Proofs</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {matchingLedger.map((tx) => {
                        const isReturn = tx.type === 'liquidation_surplus_return' || tx.type === 'disbursement_reversal';
                        const isDeficit = tx.type === 'liquidation_deficit_deduction';
                        const isDisbursement = !isReturn && !isDeficit;
                        const allocShare = Array.isArray(tx.allocations)
                          ? tx.allocations.find((a) => a.bucketId === bucket.bucket.id)?.amount
                          : undefined;
                        const amt = allocShare !== undefined ? allocShare : tx.amount;
                        const resolvedActor =
                          resolveUserName(tx.performedBy) ||
                          (tx.performedBy && !/^[A-Za-z0-9]{20,}$/.test(tx.performedBy.trim())
                            ? tx.performedBy
                            : 'SAS Admin');
                        const badgeLabel =
                          tx.type === 'liquidation_surplus_return'
                            ? 'Surplus Returned'
                            : tx.type === 'disbursement_reversal'
                              ? 'Reversed'
                              : isDeficit
                                ? tx.isSupplementalSource
                                  ? 'Overspend (Supp.)'
                                  : 'Overspend Deducted'
                                : 'Disbursed';

                        const evKey = String(tx.eventId || '').trim();
                        const liqKey = String(tx.liquidationId || '').trim();
                        const voucher = evKey ? vouchersByEventId[evKey]?.disbursementVoucher : null;
                        const liqProofInfo =
                          (liqKey ? liquidationsByKey[liqKey] : undefined) ||
                          (evKey ? liquidationsByKey[`event:${evKey}`] : undefined);
                        const settlementProofs = liqProofInfo?.cashierSettlementProofs || [];

                        return (
                          <tr key={tx.id} className="hover:bg-slate-50 align-top">
                            <td className="p-2.5 font-semibold text-gray-800">
                              {tx.eventTitle || tx.eventId || tx.bucketName}
                              <span className="block text-[10px] text-gray-500 font-normal mt-0.5">
                                {tx.semester}
                                {tx.chequeNumber ? ` • Cheque/Ref #${tx.chequeNumber}` : ''}
                                {` • ${resolvedActor}`}
                              </span>
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  isReturn
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isDeficit
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {badgeLabel}
                              </span>
                            </td>
                            <td className="p-2.5">
                              {isDisbursement ? (
                                voucher?.fileUrl ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewFile({
                                          url: voucher.fileUrl,
                                          fileName: voucher.fileName || `Disbursement Voucher${voucher.chequeNumber ? ` (${voucher.chequeNumber})` : ''}`,
                                          fileType: voucher.fileType,
                                          title: `${tx.eventTitle || 'Activity'} • Disbursement Voucher`,
                                          amount: Number(amt) || voucher.amountDisbursed,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#001A4D] border border-blue-200 text-[11px] font-bold cursor-pointer transition-colors"
                                      title="View Disbursement Voucher file"
                                    >
                                      <FileCheck className="w-3 h-3 text-[#0E4EBD]" />
                                      <span className="max-w-[160px] truncate">
                                        {voucher.fileName || 'View Disbursement Voucher'}
                                      </span>
                                      <Eye className="w-3 h-3 text-[#0E4EBD]" />
                                    </button>
                                    <a
                                      href={voucher.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-1 text-slate-500 hover:text-[#0E4EBD] rounded"
                                      title="Open voucher in new tab"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic">
                                    {loadingProofs ? 'Checking voucher...' : 'No voucher file attached'}
                                  </span>
                                )
                              ) : settlementProofs.length > 0 ? (
                                <div className="space-y-1">
                                  {liqProofInfo?.cashierReferenceNo && (
                                    <div className="text-[10px] font-mono text-slate-600">
                                      OR/Ref #: {liqProofInfo.cashierReferenceNo}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap gap-1.5">
                                    {settlementProofs.map((proof, idx) => (
                                      <div key={proof.id || idx} className="inline-flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewFile({
                                              url: proof.url,
                                              fileName: proof.name || `Settlement Proof #${idx + 1}`,
                                              fileType: proof.fileType,
                                              title: `${tx.eventTitle || 'Activity'} • ${
                                                isDeficit ? 'Reimbursement Proof' : 'Cashier Return Receipt'
                                              }`,
                                              amount: Number(amt) || 0,
                                            })
                                          }
                                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                                            isDeficit
                                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200'
                                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
                                          }`}
                                          title={`View ${proof.name || 'proof file'}`}
                                        >
                                          {proof.fileType === 'pdf' ? (
                                            <FileText className="w-3 h-3 shrink-0" />
                                          ) : (
                                            <Receipt className="w-3 h-3 shrink-0" />
                                          )}
                                          <span className="max-w-[140px] truncate">
                                            {proof.name || (isDeficit ? `Reimbursement #${idx + 1}` : `Return Proof #${idx + 1}`)}
                                          </span>
                                          <Eye className="w-3 h-3 shrink-0" />
                                        </button>
                                        <a
                                          href={proof.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 text-slate-500 hover:text-[#0E4EBD] rounded"
                                          title="Open in new tab"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-amber-700 italic">
                                  {loadingProofs
                                    ? 'Checking proofs...'
                                    : tx.type === 'disbursement_reversal'
                                      ? 'Disbursement reversed'
                                      : 'No return/settlement proof attached'}
                                </span>
                              )}
                            </td>
                            <td
                              className={`p-2.5 text-right font-mono font-bold whitespace-nowrap ${
                                isReturn ? 'text-emerald-700' : isDeficit ? 'text-rose-700' : 'text-amber-800'
                              }`}
                            >
                              {isReturn ? '+' : '-'}
                              {formatCurrency(amt)}
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
        </div>
      </div>

      <ReceiptLightboxModal
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        imageUrl={previewFile?.url || ''}
        itemTitle={previewFile?.title}
        amount={previewFile?.amount}
        fileName={previewFile?.fileName}
        fileType={previewFile?.fileType}
      />
    </>
  );
}
