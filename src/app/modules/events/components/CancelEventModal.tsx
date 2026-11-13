import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  X,
  ShieldAlert,
  QrCode,
  FileText,
  Users,
  Loader2,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { toast } from 'sonner';
import { cancelEventTransaction } from '../services/event.service';
import { canCancelEvent, isEventAttendanceEnabled } from '../utils/event-lifecycle.utils';
import { LIQUIDATIONS_COLLECTION } from '../../finance/services/liquidation.service';
import { CashierProofUploader } from '../../finance/components/CashierProofUploader';
import type { ReceiptAttachment } from '../../finance/types/liquidation.types';
import type { EventDocument, EventCancellationResult } from '../types/event.types';
import { formatCurrency } from '../../../utils/currency';

export interface CancelEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventDocument | null;
  userRole?: 'admin' | 'officer';
  role?: 'admin' | 'officer';
  userId?: string;
  userName?: string;
  currentOrgId?: string;
  onCancelled?: (result: EventCancellationResult) => void;
  onSuccess?: () => void;
}

const PRESET_REASONS = [
  'Severe Weather / Typhoon Signal Campus Closure',
  'Venue Conflict or Facility Unavailability',
  'Emergency Campus Academic Suspension',
  'Speaker or Keynote Guest Cancellation',
  'Insufficient Participant Turnout & Rescheduling',
];

function hasItemReceipt(item: any): boolean {
  return Boolean(
    item?.receiptUrl ||
      (Array.isArray(item?.receiptUrls) && item.receiptUrls.length > 0) ||
      (Array.isArray(item?.receiptFiles) && item.receiptFiles.length > 0)
  );
}

export function CancelEventModal({
  isOpen,
  onClose,
  event,
  userRole: propUserRole,
  role,
  userId = 'system-user',
  userName = 'System User',
  currentOrgId,
  onCancelled,
  onSuccess,
}: CancelEventModalProps) {
  const userRole = propUserRole || role || 'officer';
  const [reason, setReason] = useState('');
  const [cashierProofs, setCashierProofs] = useState<ReceiptAttachment[]>([]);
  const [cashierReferenceNo, setCashierReferenceNo] = useState('');
  const [confirmedCheck, setConfirmedCheck] = useState(false);
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Impact Preview State
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [receiptItems, setReceiptItems] = useState<any[]>([]);
  const [liquidationsCount, setLiquidationsCount] = useState(0);

  const cancelEligibility = useMemo(() => {
    if (!event) return { canCancel: false, reason: 'Event not found.' };
    return canCancelEvent(event, userRole, currentOrgId);
  }, [event, userRole, currentOrgId, isOpen]);

  const hasAttendance = useMemo(() => isEventAttendanceEnabled(event), [event, isOpen]);

  const disbursementVoucher = (event as any)?.disbursementVoucher;
  const hasDisbursementVoucher = Boolean(disbursementVoucher?.fileUrl);
  const amountDisbursed = Number(disbursementVoucher?.amountDisbursed || 0);

  const verifiedReceiptsTotal = useMemo(
    () =>
      receiptItems.reduce(
        (sum, it) =>
          sum + Number(it.totalCost || Number(it.quantity || 1) * Number(it.unitCost || 0) || 0),
        0
      ),
    [receiptItems]
  );

  const hasVerifiedExpenses = receiptItems.length > 0;
  // Scenario 2: Voucher attached + 0 expenses => must upload Cashier Return Proof inside Cancel Modal
  const requiresCashierProofInModal = hasDisbursementVoucher && !hasVerifiedExpenses;

  const signatoriesCount = useMemo(() => {
    const chain = Array.isArray((event as any)?.approvalChain) ? (event as any).approvalChain : [];
    const unique = new Set<string>();
    chain.forEach((s: any) => {
      const k = s?.signatoryUid || s?.signatoryId || s?.uid || s?.signatoryEmail;
      if (k) unique.add(String(k).toLowerCase());
    });
    return unique.size;
  }, [event]);

  useEffect(() => {
    if (!isOpen || !event?.id) {
      setReason('');
      setCashierProofs([]);
      setCashierReferenceNo('');
      setConfirmedCheck(false);
      setConfirmKeyword('');
      setReceiptItems([]);
      setLiquidationsCount(0);
      return;
    }

    let isMounted = true;
    setLoadingImpact(true);

    const fetchImpactData = async () => {
      try {
        const liquidationsQ = query(
          collection(db, LIQUIDATIONS_COLLECTION),
          where('eventId', '==', event.id)
        );
        const liquidationsSnap = await getDocs(liquidationsQ);
        const activeDocs = liquidationsSnap.docs.filter((d) => {
          const data = d.data();
          const st = String(data.status || '').toLowerCase();
          return st !== 'voided' && st !== 'cancelled' && data.isDeleted !== true;
        });

        const foundReceipts: any[] = [];
        activeDocs.forEach((d) => {
          const items = Array.isArray(d.data().lineItems) ? d.data().lineItems : [];
          items.forEach((it: any) => {
            if (hasItemReceipt(it)) foundReceipts.push(it);
          });
        });

        if (isMounted) {
          setLiquidationsCount(activeDocs.length);
          setReceiptItems(foundReceipts);
        }
      } catch (err) {
        console.warn('[CancelEventModal] Error calculating impact preview:', err);
      } finally {
        if (isMounted) setLoadingImpact(false);
      }
    };

    fetchImpactData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, event?.id]);

  if (!isOpen || !event) return null;

  const isReasonValid = reason.trim().length >= 10;
  const isCashierProofValid = !requiresCashierProofInModal || cashierProofs.length > 0;
  const isKeywordValid = confirmKeyword.trim().toUpperCase() === 'CANCEL';
  const canSubmit =
    cancelEligibility.canCancel &&
    !loadingImpact &&
    isReasonValid &&
    isCashierProofValid &&
    confirmedCheck &&
    isKeywordValid &&
    !isSubmitting;

  const handleCancelSubmit = async () => {
    if (!canSubmit) return;

    const liveCheck = canCancelEvent(event, userRole, currentOrgId);
    if (!liveCheck.canCancel) {
      toast.error('Cannot Cancel Event', {
        description: liveCheck.reason || 'This event has already started or cannot be cancelled.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await cancelEventTransaction({
        eventId: event.id,
        cancelledBy: userId,
        cancelledByName: userName,
        cancelledByRole: userRole,
        userOrgId: currentOrgId,
        cancellationReason: reason.trim(),
        notifyAttendees: true,
        cashierSettlementProofs: requiresCashierProofInModal ? cashierProofs : [],
        cashierReferenceNo: requiresCashierProofInModal ? cashierReferenceNo.trim() : '',
      });

      if (result.cancellationPendingApproval) {
        toast.success('Cancellation & Financial Liquidation Submitted', {
          description: `Form LF-01 with attached receipts was submitted to the Financial Liquidation signatory pipeline. Once approved, "${event.title}" will finalize as cancelled and Cashier return proof will unlock.`,
          duration: 7000,
        });
      } else {
        toast.success('Event Cancelled', {
          description: hasDisbursementVoucher
            ? `Successfully cancelled "${event.title}" with Cashier Return Proof attached. ${result.notifiedSignatoriesCount || 0} signatory(ies) notified.`
            : `Successfully cancelled "${event.title}". ${result.notifiedSignatoriesCount || 0} signatory(ies) notified.`,
          duration: 6000,
        });
      }

      if (onCancelled) onCancelled(result);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[CancelEventModal] Error:', err);
      toast.error('Failed to cancel event', {
        description: err.message || 'Please verify your network connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-red-200 animate-in fade-in zoom-in-95 duration-200">
          {/* Danger Header */}
          <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-6 py-5 text-white flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/15 rounded-xl border border-white/20 backdrop-blur-xs">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold">Cancel Activity &amp; Notify Stakeholders</h3>
                  <span className="px-2 py-0.5 bg-white/20 rounded text-[11px] font-mono uppercase tracking-wider font-semibold">
                    Irreversible
                  </span>
                </div>
                <p className="text-white/80 text-xs mt-0.5">
                  Activity: <strong className="text-white">{event.title}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {!cancelEligibility.canCancel && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-300 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-900 space-y-0.5">
                  <p className="font-bold">Cancellation Blocked</p>
                  <p>{cancelEligibility.reason}</p>
                </div>
              </div>
            )}

            {/* Impact Summary Matrix */}
            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4.5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Financial &amp; Operational Impact Preview
                </h4>
                {loadingImpact && (
                  <span className="text-[11px] text-rose-700 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking voucher &amp; receipts...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Disbursement Voucher */}
                <div className="bg-white p-3 rounded-lg border border-rose-100 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-medium">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    <span>Disbursement Voucher</span>
                  </div>
                  <p className="text-base font-extrabold text-gray-900 mt-1">
                    {hasDisbursementVoucher ? formatCurrency(amountDisbursed) : 'None'}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {hasDisbursementVoucher
                      ? `Cheque #${disbursementVoucher.chequeNumber || 'Attached'}`
                      : 'Not yet disbursed'}
                  </p>
                </div>

                {/* Attached Receipts */}
                <div className="bg-white p-3 rounded-lg border border-rose-100 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-medium">
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Attached Receipts</span>
                  </div>
                  <p className="text-base font-extrabold text-gray-900 mt-1">
                    {receiptItems.length}{' '}
                    <span className="text-xs font-normal text-gray-500">
                      receipt{receiptItems.length === 1 ? '' : 's'}
                    </span>
                  </p>
                  <p className="text-[11px] font-mono text-emerald-700 font-semibold">
                    {hasVerifiedExpenses ? formatCurrency(verifiedReceiptsTotal) : '₱0.00 spent'}
                  </p>
                </div>

                {/* Attendance / QR Passes */}
                <div className="bg-white p-3 rounded-lg border border-rose-100 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-medium">
                    <QrCode className="w-3.5 h-3.5 text-blue-600" />
                    <span>Attendance</span>
                  </div>
                  <p className="text-base font-extrabold text-gray-900 mt-1">
                    {hasAttendance ? 'Enabled' : '—'}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {hasAttendance ? 'Gate & QR locked' : 'Not enabled'}
                  </p>
                </div>

                {/* Signatories & Stakeholders Notified */}
                <div className="bg-white p-3 rounded-lg border border-rose-100 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-medium">
                    <Users className="w-3.5 h-3.5 text-rose-600" />
                    <span>Notifications</span>
                  </div>
                  <p className="text-base font-extrabold text-gray-900 mt-1">
                    {signatoriesCount}{' '}
                    <span className="text-xs font-normal text-gray-500">signatories</span>
                  </p>
                  <p className="text-[11px] text-gray-500">+ SAS / Org alerted</p>
                </div>
              </div>

              <p className="text-[11px] text-rose-800 leading-relaxed pt-1">
                {hasVerifiedExpenses
                  ? 'Because official expense receipts are already attached, confirming will submit Form LF-01 (with your Activity Cancelled reason) to the Financial Liquidation signatory pipeline first. Once approved, the activity becomes Cancelled and Cashier return proof will unlock.'
                  : hasDisbursementVoucher
                    ? `A Disbursement Voucher (${formatCurrency(amountDisbursed)}) is attached with 0 expense receipts. Upload the Cashier Return Proof below to confirm the full amount was returned before cancelling.`
                    : `No Disbursement Voucher and no expense receipts are attached (${liquidationsCount} empty draft(s)). This activity can be cancelled immediately with no liquidation required.`}
              </p>
            </div>

            {/* Read-Only List of Attached Receipts (Scenario 3) */}
            {hasVerifiedExpenses && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Tracked Expense Receipts ({receiptItems.length})
                  </h4>
                  <span className="text-xs font-mono font-bold text-emerald-800">
                    Verified Total: {formatCurrency(verifiedReceiptsTotal)}
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {receiptItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between bg-white border border-emerald-100 rounded-lg px-3 py-1.5 text-xs"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="font-semibold text-gray-900 truncate">{item.description || 'Expense Item'}</p>
                        <p className="text-[10px] text-gray-500">
                          {item.vendorName ? `${item.vendorName} • ` : ''}
                          {item.receiptNumber ? `OR #${item.receiptNumber}` : 'Receipt attached'}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-gray-800 whitespace-nowrap">
                        {formatCurrency(
                          Number(item.totalCost || Number(item.quantity || 1) * Number(item.unitCost || 0) || 0)
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {hasDisbursementVoucher && amountDisbursed > verifiedReceiptsTotal && (
                  <p className="text-[11px] text-emerald-900 font-medium pt-1">
                    Estimated Cash to Return to Cashier after FL Approval:{' '}
                    <strong>{formatCurrency(amountDisbursed - verifiedReceiptsTotal)}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Scenario 2: Disbursement Voucher + 0 Expenses => Multi-File Cashier Return Proof in Cancel Modal */}
            {requiresCashierProofInModal && (
              <CashierProofUploader
                proofs={cashierProofs}
                onChange={setCashierProofs}
                cashierReferenceNo={cashierReferenceNo}
                onReferenceNoChange={setCashierReferenceNo}
                folderKey={event.id}
                required
                disabled={isSubmitting}
                title={`Cashier Return Proof Required (${formatCurrency(amountDisbursed)})`}
                description={`A Disbursement Voucher for ${formatCurrency(amountDisbursed)} was uploaded with 0 expense receipts. Upload one or more Cashier Official Receipts / Return Slips proving the money was returned to the Cashier.`}
              />
            )}

            {/* Cancellation Reason (Required, min 10 chars) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800">
                  Cancellation Reason <span className="text-red-500">*</span>
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    reason.trim().length >= 10 ? 'text-green-600 font-bold' : 'text-gray-400'
                  }`}
                >
                  {reason.trim().length} / 10 characters minimum
                </span>
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Explain why this event is being cancelled (e.g., Severe typhoon warning and campus closure announced by city government)..."
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs leading-relaxed focus:outline-none focus:ring-2 transition-all ${
                  reason.length > 0 && reason.trim().length < 10
                    ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                    : 'border-gray-300 focus:ring-rose-100 focus:border-rose-500 bg-white'
                }`}
              />

              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[11px] text-gray-400 font-medium self-center mr-1">Quick Select:</span>
                {PRESET_REASONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReason(preset)}
                    className="px-2.5 py-1 bg-gray-100 hover:bg-rose-50 hover:text-rose-700 text-gray-700 text-[11px] rounded-lg border border-gray-200 transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Safety Confirmation Verification */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-800">
                <input
                  type="checkbox"
                  checked={confirmedCheck}
                  onChange={(e) => setConfirmedCheck(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
                <span>
                  {hasVerifiedExpenses
                    ? 'I understand that confirming will lock this activity as Cancellation Pending and submit the Financial Liquidation (Form LF-01) with attached receipts to the FL signatory pipeline for approval.'
                    : hasDisbursementVoucher
                      ? 'I confirm that the full disbursed amount has been returned to the Cashier with authentic proof attached, and cancelling will permanently mark this event as Cancelled.'
                      : 'I understand that cancelling this event will permanently set its status to Cancelled, notify all designated signatories, and release unused budget allocations.'}
                </span>
              </label>

              <div className="pt-2 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs text-gray-600">
                  Type <strong className="text-red-700 font-mono">CANCEL</strong> to unlock button:
                </span>
                <input
                  type="text"
                  value={confirmKeyword}
                  onChange={(e) => setConfirmKeyword(e.target.value)}
                  placeholder="CANCEL"
                  className="w-36 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono font-bold uppercase tracking-wider text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
            >
              Nevermind, Keep Event
            </button>

            <button
              type="button"
              onClick={handleCancelSubmit}
              disabled={!canSubmit}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Cancellation...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  <span>
                    {hasVerifiedExpenses
                      ? 'Submit Cancellation & Liquidation'
                      : 'Confirm & Cancel Event'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CancelEventModal;
