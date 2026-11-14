import { useState, useEffect } from 'react';
import {
  X,
  UserMinus,
  Loader2,
  CalendarClock,
  ShieldAlert,
  Archive,
  Coins,
  Ban,
} from 'lucide-react';
import type { OrganizationMemberDocument } from '../../modules/organizations/types/member.types';
import {
  getMemberUpcomingActivitySignups,
  removeMemberFromClub,
  type UpcomingMemberActivityRef,
} from '../../modules/organizations/services/member.service';
import { toast } from 'sonner';

interface RemoveMemberModalProps {
  member: OrganizationMemberDocument | null;
  organizationId: string;
  removedBy?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RemoveMemberModal({
  member,
  organizationId,
  removedBy,
  isOpen,
  onClose,
  onSuccess,
}: RemoveMemberModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSignups, setCheckingSignups] = useState(false);
  const [upcomingSignups, setUpcomingSignups] = useState<UpcomingMemberActivityRef[]>([]);

  useEffect(() => {
    if (!isOpen || !member || !organizationId) {
      setUpcomingSignups([]);
      return;
    }

    let cancelled = false;
    setCheckingSignups(true);
    getMemberUpcomingActivitySignups(organizationId, member)
      .then((activities) => {
        if (!cancelled) {
          setUpcomingSignups(activities);
        }
      })
      .catch((err) => {
        console.warn('[RemoveMemberModal] Failed to check upcoming activity sign-ups:', err);
        if (!cancelled) {
          setUpcomingSignups([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingSignups(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, member?.id, organizationId]);

  if (!isOpen || !member) return null;

  const hasUpcomingSignups = upcomingSignups.length > 0;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const result = await removeMemberFromClub(member.id, organizationId, removedBy);

      if (result.outcome === 'scheduled') {
        const titles = result.activities.map((a) => a.title).join(', ');
        toast.success('Removal scheduled after activity ends', {
          description: `${member.studentName} will remain a member until "${titles}" ends. They have no access to new activities, and their records, dues, and fines remain saved.`,
        });
      } else {
        toast.success('Member removed from club', {
          description: `${member.studentName} has been removed from this club. Their records, dues, and fines remain saved.`,
        });
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Member removal error:', err);
      toast.error('Failed to remove member', {
        description: err?.message || 'An error occurred during removal.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10">
        {/* Header */}
        <div className="bg-[#E24B4A] px-6 py-4 flex items-center justify-between text-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <UserMinus className="w-5 h-5 text-white" />
            <h3 className="font-bold text-base">Remove Member from Club</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50/50 rounded-xl border border-red-100">
            <div className="w-10 h-10 bg-[#001A4D] rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {(member.studentName || 'ST').substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-[#001A4D]">{member.studentName}</p>
              <p className="text-xs text-gray-500 font-mono">
                ID: {member.studentId} · {member.course || 'Student'}
              </p>
            </div>
          </div>

          {/* Club Removal Policy Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              What happens when removed
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <Archive className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Removes the student from this club only. Member records &amp; history are{' '}
                  <strong>saved</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Coins className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Existing club <strong>dues and fines still remain</strong> active and collectible.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Ban className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                <span>
                  Member will immediately have <strong>no access to new activities</strong>.
                </span>
              </li>
            </ul>
          </div>

          {/* Upcoming Signed-Up Activity Check */}
          {checkingSignups ? (
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center gap-2.5 text-xs text-blue-900">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>Checking upcoming club activity sign-ups...</span>
            </div>
          ) : hasUpcomingSignups ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <CalendarClock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950">
                    Signed Up to Upcoming Activity — Removal Scheduled
                  </p>
                  <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                    This member will remain in the club until the activity below ends, then their
                    removal will take effect automatically. Newly created activities will already
                    exclude this member.
                  </p>
                </div>
              </div>
              <div className="pl-6 space-y-1">
                {upcomingSignups.map((act) => (
                  <div
                    key={act.id}
                    className="px-2.5 py-1 rounded-lg bg-white/80 border border-amber-200 text-[11px] font-semibold text-amber-950 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{act.title}</span>
                    {act.date && <span className="text-[10px] text-amber-700 shrink-0">{act.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-red-50/60 border border-red-200 flex items-start gap-2 text-xs text-red-900">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                No upcoming signed-up activities found. Confirming will immediately remove this
                member from the club while keeping their saved records, dues, and fines.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || checkingSignups}
            className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 ${
              hasUpcomingSignups
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-[#E24B4A] hover:bg-[#DC2626]'
            }`}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting
              ? 'Processing...'
              : hasUpcomingSignups
              ? 'Schedule Removal'
              : 'Remove Member'}
          </button>
        </div>
      </div>
    </div>
  );
}
