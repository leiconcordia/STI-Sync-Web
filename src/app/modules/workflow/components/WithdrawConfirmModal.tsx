/**
 * src/app/modules/workflow/components/WithdrawConfirmModal.tsx
 *
 * Universal confirmation modal for withdrawing a pending submission back to draft.
 */

import { useState } from 'react';
import { RotateCcw, AlertTriangle, Loader2, X } from 'lucide-react';

interface WithdrawConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  documentTitle?: string;
  documentTypeLabel?: string; // e.g. "Activity Proposal", "Liquidation Report", "Post-Activity Report"
}

export default function WithdrawConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  documentTitle = 'this submission',
  documentTypeLabel = 'submission',
}: WithdrawConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      console.error('[WithdrawConfirmModal] Withdrawal failed:', err);
      setError(err?.message || 'Failed to withdraw submission. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Withdraw {documentTypeLabel}?</h3>
              <p className="text-[11px] text-amber-100">Return to Draft status for revision</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-bold">What happens when you withdraw?</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                <li>Active signatory reviews will be paused.</li>
                <li>Status will transition back to <strong>Draft</strong>.</li>
                <li>You can freely edit all fields, line items, and attachments.</li>
                <li>You can re-submit for review whenever you are ready.</li>
              </ul>
            </div>
          </div>

          <p className="text-xs text-gray-600">
            Are you sure you want to withdraw <strong className="text-gray-900">"{documentTitle}"</strong>?
          </p>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200 font-medium">
              {error}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Keep in Review
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Withdrawing...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Confirm Withdrawal</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
