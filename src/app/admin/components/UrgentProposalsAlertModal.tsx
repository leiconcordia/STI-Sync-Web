import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, Building2, Calendar, Clock, X } from 'lucide-react';
import { useAllEvents } from '../../modules/events/hooks/useEventStream';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { resolveCleanOrgName } from '../../modules/events/utils/organization-display.utils';
import { formatAppDate } from '../../utils/date';
import { formatCurrency } from '../../utils/currency';

function calculateEventBudget(e: any): number {
  if (!e) return 0;
  if (typeof e.totalApprovedBudget === 'number' && e.totalApprovedBudget > 0) return e.totalApprovedBudget;
  if (typeof e.allocatedBudget === 'number' && e.allocatedBudget > 0) return e.allocatedBudget;
  if (typeof e.totalBudget === 'number' && e.totalBudget > 0) return e.totalBudget;
  if (typeof e.financialProjections?.totalExpenses === 'number' && e.financialProjections.totalExpenses > 0) {
    return e.financialProjections.totalExpenses;
  }
  if (Array.isArray(e.budgetItems) && e.budgetItems.length > 0) {
    return e.budgetItems.reduce((acc: number, item: any) => {
      const itemCost = Number(
        item.approvedAmount || item.totalCost || (Number(item.quantity || 1) * Number(item.unitCost || 0)) || 0
      );
      return acc + itemCost;
    }, 0);
  }
  return 0;
}

export const URGENT_ALERT_SESSION_KEY = 'sti_sas_urgent_alert_seen_ids';

function readSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(URGENT_ALERT_SESSION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function writeSeenIds(ids: Iterable<string>) {
  try {
    sessionStorage.setItem(URGENT_ALERT_SESSION_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function UrgentProposalsAlertModal() {
  const navigate = useNavigate();
  const { events = [] } = useAllEvents();
  const { data: organizations = [] } = useOrganizationStream();
  const [isOpen, setIsOpen] = useState(false);

  const orgMap = useMemo(() => {
    const map = new Map<string, { name: string; acronym: string; logoUrl?: string | null }>();
    organizations.forEach((o) => {
      map.set(o.id, { name: o.name, acronym: o.acronym || o.name, logoUrl: o.logoUrl });
    });
    return map;
  }, [organizations]);

  const urgentPendingAPs = useMemo(() => {
    return events
      .filter((e) => {
        if (e.isDeleted || e.isArchived) return false;
        const pStatus = String(e.proposalStatus || '').toLowerCase();
        const status = String((e as any).status || '').toLowerCase();
        const isCancelled = status === 'cancelled' || pStatus === 'cancelled';
        const isPending =
          pStatus === 'pending' ||
          pStatus === 'pending_review' ||
          pStatus === 'under_review' ||
          pStatus === 'submitted' ||
          status === 'pending' ||
          status === 'under_review';
        const isApproved =
          pStatus === 'approved' ||
          status === 'approved' ||
          status === 'approved_president' ||
          (e as any).isApproved === true;
        return Boolean((e as any).isUrgent) && !isCancelled && isPending && !isApproved;
      })
      .sort((a, b) => {
        const dateA = a.sessions?.[0]?.date || '';
        const dateB = b.sessions?.[0]?.date || '';
        if (dateA && dateB) return dateA.localeCompare(dateB);
        return 0;
      });
  }, [events]);

  useEffect(() => {
    if (urgentPendingAPs.length === 0) return;
    const seen = readSeenIds();
    const hasUnseen = urgentPendingAPs.some((ap) => !seen.has(ap.id));
    if (hasUnseen) {
      setIsOpen(true);
    }
  }, [urgentPendingAPs]);

  const markAllSeenAndClose = () => {
    const seen = readSeenIds();
    urgentPendingAPs.forEach((ap) => seen.add(ap.id));
    writeSeenIds(seen);
    setIsOpen(false);
  };

  const handleReviewNow = (proposalId: string) => {
    markAllSeenAndClose();
    navigate(`/home/event-approvals?tab=pending&id=${proposalId}`);
  };

  const handleViewAllUrgent = () => {
    markAllSeenAndClose();
    navigate('/home/event-approvals?tab=urgent');
  };

  if (!isOpen || urgentPendingAPs.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="urgent-ap-alert-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-amber-300 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Priority Header */}
        <div className="bg-gradient-to-r from-amber-600 via-red-600 to-rose-700 px-6 py-4 text-white flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white text-rose-700">
                  Urgent Attention Required
                </span>
                <span className="text-xs font-semibold text-amber-100">
                  {urgentPendingAPs.length} Expedited Activity Proposal{urgentPendingAPs.length === 1 ? '' : 's'}
                </span>
              </div>
              <h2 id="urgent-ap-alert-title" className="text-lg font-extrabold tracking-tight mt-1">
                Urgent Activity Proposals Awaiting Review
              </h2>
              <p className="text-xs text-white/85 mt-0.5">
                These proposals were filed under the 15-day advance policy and require immediate SAS vetting or release.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={markAllSeenAndClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label="Close urgent alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Urgent Proposals List */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3 bg-amber-50/30">
          {urgentPendingAPs.map((ap) => {
            const orgName = resolveCleanOrgName(ap, orgMap);
            const firstSessionDate = ap.sessions?.[0]?.date;
            const formattedTargetDate = firstSessionDate ? formatAppDate(firstSessionDate) : 'TBD';
            const budget = calculateEventBudget(ap);
            const justification = (ap as any).urgentJustification || 'Urgent filing submitted under 15-day rule.';

            return (
              <div
                key={ap.id}
                className="p-4 bg-white border border-amber-200 rounded-xl shadow-2xs hover:border-amber-400 transition-colors space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-extrabold uppercase tracking-wider">
                        <Clock className="w-3 h-3 text-rose-700" />
                        Urgent (&lt;15 Days)
                      </span>
                      {ap.referenceId && (
                        <span className="text-[11px] font-mono text-slate-500 font-semibold">
                          {ap.referenceId}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#001A4D] mt-1">
                      {ap.title || 'Untitled Urgent Activity Proposal'}
                    </h3>
                    <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-600 mt-1">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {orgName}
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Target: {formattedTargetDate}
                      </span>
                      <span className="font-mono font-semibold text-slate-700">
                        Budget: {formatCurrency(budget)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReviewNow(ap.id)}
                    className="px-3.5 py-2 rounded-xl bg-[#001A4D] hover:bg-[#0E4EBD] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
                  >
                    <span>Review Now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200/80 text-xs text-amber-950 leading-relaxed">
                  <strong className="text-amber-900">Justification:</strong> {justification}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-white border-t border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={markAllSeenAndClose}
            className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Dismiss for Now
          </button>
          <button
            type="button"
            onClick={handleViewAllUrgent}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Open Urgent Proposals Filter</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default UrgentProposalsAlertModal;
