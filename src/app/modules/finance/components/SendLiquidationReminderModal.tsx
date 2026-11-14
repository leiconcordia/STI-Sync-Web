/**
 * src/app/modules/finance/components/SendLiquidationReminderModal.tsx
 *
 * SAS Admin Studio modal to dispatch targeted Financial Liquidation reminders
 * to Student Organization Officers adhering to the 15-calendar-day policy.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Bell,
  AlertTriangle,
  Clock,
  Send,
  Calendar,
  Building,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { doc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import { createNotification } from '../../notifications';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import { resolveCleanOrgName, isEventLiquidationExempt } from '../../events/utils/organization-display.utils';

interface SendLiquidationReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    id: string;
    title?: string;
    hostingOrgId?: string;
    organizers?: string;
    reminderCount?: number;
    lastRemindedAt?: any;
    financialProjections?: any;
    totalApprovedBudget?: number;
  } | null;
  daysRemaining: number;
  deadlineDateStr: string;
  concludedDateStr: string;
  onReminderSent?: () => void;
}

export function SendLiquidationReminderModal({
  isOpen,
  onClose,
  event,
  daysRemaining,
  deadlineDateStr,
  concludedDateStr,
  onReminderSent,
}: SendLiquidationReminderModalProps) {
  if (!isOpen || !event) return null;

  const eventTitle = event.title || 'Concluded Activity';
  const orgName = (event as any).cleanOrgName || resolveCleanOrgName(event) || 'Student Organization';

  // Determine initial tone based on days remaining
  const initialTone = useMemo(() => {
    if (daysRemaining < 0) return 'overdue';
    if (daysRemaining <= 3) return 'urgent';
    return 'friendly';
  }, [daysRemaining]);

  const [selectedTone, setSelectedTone] = useState<'friendly' | 'urgent' | 'overdue'>(initialTone);
  const [customInstructions, setCustomInstructions] = useState('');
  const [isSending, setIsSending] = useState(false);

  const isLiquidationExempt = useMemo(() => {
    return isEventLiquidationExempt(event);
  }, [event]);

  // Generate suggested text based on tone
  const suggestedMessage = useMemo(() => {
    if (selectedTone === 'overdue') {
      const absDays = Math.abs(daysRemaining);
      return `OVERDUE NOTICE: Financial Liquidation for "${eventTitle}" is overdue by ${absDays} day${
        absDays === 1 ? '' : 's'
      } (Deadline was ${deadlineDateStr}). Immediate submission of the Financial Liquidation report and physical receipts to the SAS Office is required.`;
    }
    if (selectedTone === 'urgent') {
      return `URGENT NOTICE: Financial Liquidation for "${eventTitle}" is due in ${daysRemaining} day${
        daysRemaining === 1 ? '' : 's'
      } (${deadlineDateStr}). Please finalize your Financial Liquidation report and attach all official receipts.`;
    }
    return `Friendly reminder from the SAS Office: Financial Liquidation for "${eventTitle}" is due on ${deadlineDateStr} (${daysRemaining} days remaining). Please prepare your official receipts and disbursement summary.`;
  }, [selectedTone, eventTitle, daysRemaining, deadlineDateStr]);

  const [message, setMessage] = useState(suggestedMessage);

  // Update message when preset tone changes
  const handleToneChange = (tone: 'friendly' | 'urgent' | 'overdue') => {
    setSelectedTone(tone);
    if (tone === 'overdue') {
      const absDays = Math.abs(daysRemaining);
      setMessage(
        `OVERDUE NOTICE: Financial Liquidation for "${eventTitle}" is overdue by ${absDays} day${
          absDays === 1 ? '' : 's'
        } (Deadline was ${deadlineDateStr}). Immediate submission of the Financial Liquidation report and physical receipts to the SAS Office is required.`
      );
    } else if (tone === 'urgent') {
      setMessage(
        `URGENT NOTICE: Financial Liquidation for "${eventTitle}" is due in ${daysRemaining} day${
          daysRemaining === 1 ? '' : 's'
        } (${deadlineDateStr}). Please finalize your Financial Liquidation report and attach all official receipts.`
      );
    } else {
      setMessage(
        `Friendly reminder from the SAS Office: Financial Liquidation for "${eventTitle}" is due on ${deadlineDateStr} (${daysRemaining} days remaining). Please prepare your official receipts and disbursement summary.`
      );
    }
  };

  const handleSendReminder = async () => {
    if (isLiquidationExempt) {
      toast.info('Non-monetary activity: No financial liquidation is required, so liquidation reminders are exempt.');
      return;
    }

    if (!message.trim()) {
      toast.warning('Please enter a reminder message.');
      return;
    }

    setIsSending(true);
    try {
      const finalMessage = customInstructions.trim()
        ? `${message.trim()}\n\nNote from SAS: ${customInstructions.trim()}`
        : message.trim();

      const urgencyTier =
        daysRemaining < 0
          ? 'overdue'
          : daysRemaining <= 3
          ? 'critical'
          : daysRemaining <= 7
          ? 'due_soon'
          : 'on_track';

      // 1. Dispatch in-app notification to organization officers
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: event.hostingOrgId,
        targetOrgName: orgName,
        type: 'liquidation_reminder',
        category: 'financial_liquidation',
        title:
          selectedTone === 'overdue'
            ? `⚠️ OVERDUE: Financial Liquidation for ${eventTitle}`
            : selectedTone === 'urgent'
            ? `🚨 URGENT: Financial Liquidation Due in ${daysRemaining} Days`
            : `📅 Reminder: Financial Liquidation for ${eventTitle}`,
        message: finalMessage,
        resourceId: event.id,
        resourceType: 'event',
        actionRoute: `/officer/documents?tab=liquidations`,
        isUrgent: daysRemaining <= 3,
        urgencyTier,
      });

      // 2. Update event document tracking fields
      try {
        const eventRef = doc(db, EVENTS_COLLECTION, event.id);
        await updateDoc(
          eventRef,
          sanitizeFirestorePayload({
            lastLiquidationReminderAt: serverTimestamp(),
            liquidationReminderCount: increment(1),
            updatedAt: serverTimestamp(),
          })
        );
      } catch (evtErr) {
        console.warn('[SendLiquidationReminderModal] Event tracking update notice:', evtErr);
      }

      toast.success(`Liquidation reminder dispatched to ${orgName} officers!`);
      if (onReminderSent) onReminderSent();
      onClose();
    } catch (err: any) {
      console.error('[SendLiquidationReminderModal] Send error:', err);
      toast.error(err?.message || 'Failed to dispatch reminder.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#001A4D] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFD41C] text-[#001A4D] flex items-center justify-center font-bold shadow-xs">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Send Liquidation Reminder
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">
                STI 15-Calendar-Day Liquidation Policy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Event Context Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full inline-block mb-1">
                  {orgName}
                </span>
                <h4 className="text-sm font-bold text-[#001A4D] truncate">{eventTitle}</h4>
              </div>
              <div>
                {daysRemaining < 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Overdue: {Math.abs(daysRemaining)}d</span>
                  </span>
                ) : daysRemaining <= 3 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Critical: {daysRemaining}d left</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{daysRemaining} days left</span>
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Concluded Date</span>
                <span className="font-semibold text-slate-700">{concludedDateStr || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">15-Day Deadline</span>
                <span className="font-bold text-[#001A4D]">{deadlineDateStr || '—'}</span>
              </div>
            </div>
          </div>

          {isLiquidationExempt && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-950 uppercase tracking-wider text-[11px]">Non-Monetary Activity — Liquidation Exempt:</span>
                <p className="mt-0.5 text-emerald-800 leading-relaxed">
                  This activity has no budget and no monetary expense projections. Financial liquidation is strictly exempt and not required for clearance or compliance.
                </p>
              </div>
            </div>
          )}

          {/* Tone Presets Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Reminder Tone Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleToneChange('friendly')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                  selectedTone === 'friendly'
                    ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Friendly
              </button>
              <button
                type="button"
                onClick={() => handleToneChange('urgent')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                  selectedTone === 'urgent'
                    ? 'bg-amber-50 border-amber-600 text-amber-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Urgent Notice
              </button>
              <button
                type="button"
                onClick={() => handleToneChange('overdue')}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                  selectedTone === 'overdue'
                    ? 'bg-rose-50 border-rose-600 text-rose-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Overdue Demand
              </button>
            </div>
          </div>

          {/* Editable Notification Message */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Notification Message</span>
              <span className="text-[10px] text-slate-400 font-normal">Sent to club officers</span>
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium leading-relaxed"
            />
          </div>

          {/* Additional Specific SAS Notes (Optional) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Additional SAS Office Instructions (Optional)</span>
              <span className="text-[10px] text-slate-400 font-normal">e.g. specific room or person to look for</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Please bring original physical receipts to Room 302 before 5:00 PM."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSendReminder}
            disabled={isSending || isLiquidationExempt}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95 ${
              isLiquidationExempt
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-not-allowed select-none'
                : 'bg-[#001A4D] hover:bg-blue-900 text-[#FFD41C] cursor-pointer disabled:opacity-50'
            }`}
          >
            {isLiquidationExempt ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Exempt from Liquidation</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Dispatching...' : 'Dispatch Reminder to Org'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SendLiquidationReminderModal;

