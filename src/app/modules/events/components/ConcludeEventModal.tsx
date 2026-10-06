import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Lock,
  X,
  Clock,
  Calendar,
  Loader2,
  DollarSign,
  UserCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import type { EventDocument } from '../types/event.types';
import { concludeEvent } from '../services/event-lifecycle.service';
import { areEventSessionsOver } from '../utils/event-lifecycle.utils';
import { formatPHP } from '../../activity-proposals/utils/proposal-calculations';

interface ConcludeEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventDocument | null;
  adminUid: string;
  adminName?: string;
  onSuccess?: () => void;
}

export const ConcludeEventModal: React.FC<ConcludeEventModalProps> = ({
  isOpen,
  onClose,
  event,
  adminUid,
  adminName,
  onSuccess,
}) => {
  const [note, setNote] = useState('');
  const [finalizeAttendance, setFinalizeAttendance] = useState(true);
  const [forceConclude, setForceConclude] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if scheduled sessions are finished
  const sessions = event?.sessions || [];
  const sessionsOver = useMemo(() => areEventSessionsOver(event), [event]);

  // Compute total approved budget & cash custodian allocations
  const totalApprovedBudget = useMemo(() => {
    if (!event) return 0;
    if (event.totalApprovedBudget && Number(event.totalApprovedBudget) > 0) {
      return Number(event.totalApprovedBudget);
    }
    if (event.approvedBudget && Number(event.approvedBudget) > 0) {
      return Number(event.approvedBudget);
    }
    if (event.totalBudget && Number(event.totalBudget) > 0) {
      return Number(event.totalBudget);
    }
    const fromItems = (event.budgetItems || []).reduce(
      (sum, bi) =>
        sum +
        Number(
          bi.approvedAmount ||
            bi.totalCost ||
            Number(bi.quantity || 1) * Number(bi.unitCost || 0) ||
            0
        ),
      0
    );
    if (fromItems > 0) return fromItems;
    return Number((event as any).financialProjections?.totalExpenses || 0);
  }, [event]);

  const hasCashCustodians = useMemo(() => {
    return (
      Array.isArray(event?.budgetCustodians) &&
      event.budgetCustodians.some((c) => Number(c.allocatedAmount || 0) > 0)
    );
  }, [event]);

  const isLiquidationCompulsory = totalApprovedBudget > 0 || hasCashCustodians;

  if (!isOpen || !event) return null;

  const handleConfirm = async () => {
    if (!sessionsOver.allOver && !forceConclude) {
      toast.error('Cannot Conclude Event', {
        description:
          sessionsOver.reason ||
          'Scheduled sessions are not finished yet. Check early conclusion override if testing or event finished ahead of time.',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await concludeEvent(event.id, adminUid, adminName, {
        note,
        finalizeAttendance,
        forceConclude,
      });

      if (finalizeAttendance && res.absenteesCount > 0) {
        toast.success(
          `Event "${event.title}" concluded! Attendance finalized with ${res.absenteesCount} absentee record(s) logged.`
        );
      } else {
        toast.success(`Event "${event.title}" is now marked as Completed!`);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[ConcludeEventModal] Error:', err);
      toast.error(err.message || 'Failed to conclude event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Conclude & Complete Event</h2>
              <p className="text-xs text-emerald-100">Finalize event lifecycle and lock attendance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                {event.referenceId || 'EVT-REF'}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  sessionsOver.allOver
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                }`}
              >
                {sessionsOver.allOver ? 'Ready for Completion' : 'Sessions Ongoing / Incomplete'}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug">
              {event.title}
            </h3>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {sessions.length} Session(s)
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {event.schoolYear || 'Current AY'}
              </span>
            </div>
          </div>

          {/* Sessions Ongoing Warning & Override */}
          {!sessionsOver.allOver && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  <span className="font-bold block text-xs mb-0.5 text-amber-950 dark:text-amber-100">
                    Sessions Ongoing / Scheduled:
                  </span>
                  {sessionsOver.reason ||
                    'Scheduled sessions have not ended yet based on the event schedule.'}
                </div>
              </div>

              <label className="flex items-center gap-2 pt-2 border-t border-amber-200/80 dark:border-amber-800/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceConclude}
                  onChange={(e) => setForceConclude(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                  Conclude early ahead of scheduled end (Testing & Operational Override)
                </span>
              </label>
            </div>
          )}

          {/* Financial Liquidation Readiness Card */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              isLiquidationCompulsory
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
            }`}
          >
            <div
              className={`p-2 rounded-lg flex-shrink-0 ${
                isLiquidationCompulsory
                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="text-xs leading-relaxed space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white">
                  {isLiquidationCompulsory
                    ? 'Compulsory Financial Liquidation Ready'
                    : 'Zero-Budget Event (Liquidation Exempt)'}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.2 rounded-full uppercase tracking-wider ${
                    isLiquidationCompulsory
                      ? 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100'
                      : 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100'
                  }`}
                >
                  {isLiquidationCompulsory ? 'Required' : 'Exempt'}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                {isLiquidationCompulsory
                  ? `This event has approved allocations of ₱${formatPHP(totalApprovedBudget)}. Pre-set expense items will be locked into the liquidation report and require verified receipt attachments.`
                  : 'This event has ₱0.00 approved funds and no cash advances. No financial liquidation report is required.'}
              </p>
            </div>
          </div>

          {/* Attendance Finalization Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Finalize Attendance & Mark Absentees
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={finalizeAttendance}
                  onChange={(e) => setFinalizeAttendance(e.target.checked)}
                  disabled={isSubmitting}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
              </label>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              {finalizeAttendance
                ? 'All eligible students who did not scan in will have both Time-In and Time-Out recorded as Absent. Any incomplete check-outs will be sealed.'
                : 'Leave attendance as currently scanned without generating automated absentee records.'}
            </p>
          </div>

          {/* Scanner Duty Gate Lock & Sync Safeguard */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Scanner Duty Gate Lock & Sync Safeguard
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                {(event.scanners || []).length} Scanner(s) Assigned
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              Upon conclusion, camera scanning gates will be locked immediately. Any assigned officer with unsynced offline attendance will be prompted with "Upload your attendance: Event has been concluded" before local scanner caches are cleaned up.
            </p>
          </div>

          {/* Action Impact List */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Enforced Lifecycle Policies:
            </p>
            <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
              <li className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Cash Allocations Sealed:</strong> Cash advance allocations are switched to read-only for audit and liquidation.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Scanner Duty Locked & Synced:</strong> Live scanners are locked and offline attendance sync guards are enforced before scanner cache cleanup.
                </span>
              </li>
            </ul>
          </div>

          {/* Optional Note */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Closing Remarks / Notes (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={!sessionsOver.allOver}
              placeholder="e.g., Event successfully concluded with all attendees accounted for."
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || (!sessionsOver.allOver && !forceConclude)}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Concluding Event...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Conclude Event</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConcludeEventModal;
