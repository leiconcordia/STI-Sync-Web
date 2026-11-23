/**
 * src/app/modules/supplemental-budget/components/EventSupplementalBudgetsSection.tsx
 *
 * Reusable panel embedded inside Event Detail Views (Officer, Adviser, and SAS Admin).
 * Displays:
 * - Effective Budget Rollup (Base Approved + Approved Supplemental = Effective Approved)
 * - Eligibility-guarded "Request Additional Funds" CTA button
 * - Live list of Supplemental Budget Requests with 7-stage status pills & click-to-inspect
 */

import React, { useState, useMemo } from 'react';
import {
  PlusCircle,
  Coins,
  Eye,
  Lock,
  Landmark,
  Wallet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { formatPHP } from '../../activity-proposals/utils/proposal-calculations';
import { resolveDocumentTrackingState } from '../../activity-proposals/utils/proposal-status-tracker.utils';
import { useEventSupplementalBudgets } from '../hooks/useSupplementalBudgetStream';
import {
  canRequestSupplementalBudget,
  getEventBaseApprovedBudget,
  getEventEffectiveApprovedBudget,
} from '../utils/sbr-validation.utils';
import type { SbrActor } from '../services/sbr.service';
import type { SupplementalBudgetRequest } from '../types/sbr.types';
import SupplementalBudgetModal from './SupplementalBudgetModal';
import SupplementalBudgetDetailModal from './SupplementalBudgetDetailModal';

interface EventSupplementalBudgetsSectionProps {
  event: any;
  isSasInstitutional: boolean;
  organizationId: string;
  organizationName: string;
  organizationAcronym?: string;
  viewerRole: 'officer' | 'adviser' | 'admin' | 'signatory';
  actor: SbrActor;
  existingLiquidations?: any[];
  canCreate?: boolean;
}

export default function EventSupplementalBudgetsSection({
  event,
  isSasInstitutional,
  organizationId,
  organizationName,
  organizationAcronym,
  viewerRole,
  actor,
  existingLiquidations = [],
  canCreate = true,
}: EventSupplementalBudgetsSectionProps) {
  const { data: sbrs, loading, approvedTotal } = useEventSupplementalBudgets(event?.id);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSbr, setEditingSbr] = useState<SupplementalBudgetRequest | null>(null);
  const [selectedSbr, setSelectedSbr] = useState<SupplementalBudgetRequest | null>(null);

  const eligibility = useMemo(
    () => canRequestSupplementalBudget(event, sbrs, existingLiquidations),
    [event, sbrs, existingLiquidations]
  );

  const baseBudget = useMemo(() => getEventBaseApprovedBudget(event), [event]);
  const effectiveBudget = useMemo(
    () => getEventEffectiveApprovedBudget(event, sbrs),
    [event, sbrs]
  );

  // Keep selectedSbr reactive to real-time updates
  const liveSelectedSbr = useMemo(
    () => (selectedSbr ? sbrs.find((s) => s.id === selectedSbr.id) || selectedSbr : null),
    [selectedSbr, sbrs]
  );

  const showRequestButton =
    canCreate &&
    ((isSasInstitutional && viewerRole === 'admin') ||
      (!isSasInstitutional && (viewerRole === 'officer' || viewerRole === 'adviser')));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-slate-50 to-blue-50/40 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#003366]" />
            <h4 className="text-sm font-bold text-slate-900">
              Supplemental Budgets (Pre-Implementation Addendums)
            </h4>
            {sbrs.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-[#003366]">
                {sbrs.length}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Request additional funds before event start without altering the approved Activity Proposal.
          </p>
        </div>

        {showRequestButton && (
          <div>
            {eligibility.eligible ? (
              <button
                type="button"
                onClick={() => {
                  setEditingSbr(null);
                  setShowCreateModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] shadow-xs transition-colors"
              >
                <PlusCircle className="w-4 h-4" /> Request Additional Funds
              </button>
            ) : (
              <div
                title={eligibility.reason}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed"
              >
                <Lock className="w-3.5 h-3.5" />
                {eligibility.code === 'ACTIVE_SBR_PENDING'
                  ? 'Pending SBR Active'
                  : eligibility.code === 'EVENT_ALREADY_STARTED' || eligibility.code === 'EVENT_CONCLUDED'
                  ? 'Pre-Implementation Window Closed'
                  : eligibility.code === 'LIQUIDATION_EXISTS'
                  ? 'Locked by Liquidation'
                  : 'Approval Required First'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Effective Budget Rollup Strip */}
      <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-slate-500 font-medium">Original Approved AP:</span>{' '}
          <span className="font-bold text-slate-800">{formatPHP(baseBudget)}</span>
        </div>
        <div>
          <span className="text-slate-500 font-medium">Approved Supplemental:</span>{' '}
          <span className="font-bold text-amber-700">+ {formatPHP(approvedTotal)}</span>
        </div>
        <div>
          <span className="text-slate-500 font-medium">Effective Approved Budget:</span>{' '}
          <span className="font-extrabold text-emerald-700">{formatPHP(effectiveBudget)}</span>
        </div>
      </div>

      {/* Eligibility explanation if blocked for an approved event */}
      {showRequestButton && !eligibility.eligible && eligibility.code !== 'NOT_APPROVED' && (
        <div className="px-5 py-2.5 bg-amber-50/50 border-b border-amber-100 text-[11px] text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>{eligibility.reason}</span>
        </div>
      )}

      {/* List of SBRs */}
      <div className="p-4">
        {loading ? (
          <div className="text-xs text-slate-400 text-center py-4">Loading supplemental requests...</div>
        ) : sbrs.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-5 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            No supplemental budget requests have been filed for this activity.
          </div>
        ) : (
          <div className="space-y-2.5">
            {sbrs.map((sbr) => {
              const track = resolveDocumentTrackingState(sbr, 'SBR');
              const isMiscApproved = sbr.status === 'approved' && sbr.fundingSource === 'school_budget';
              return (
                <div
                  key={sbr.id}
                  onClick={() => setSelectedSbr(sbr)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-[#003366]/40 hover:bg-blue-50/20 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#003366]">
                        {sbr.referenceCode}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${track.badgeClass}`}
                      >
                        {sbr.status === 'withdrawn' ? 'Withdrawn' : track.label}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {sbr.fundingSource === 'organization_funds' ? (
                          <>
                            <Wallet className="w-3 h-3 text-[#003366]" /> Club Treasury
                          </>
                        ) : sbr.fundingSource === 'retained_sao_fund' ? (
                          <>
                            <Coins className="w-3 h-3 text-amber-600" /> SAO Retained Fund
                          </>
                        ) : (
                          <>
                            <Landmark className="w-3 h-3 text-indigo-600" /> School Budget (Misc Fee)
                          </>
                        )}
                      </span>
                      {isMiscApproved && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sbr.disbursementVoucher
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          <Receipt className="w-3 h-3" />
                          {sbr.disbursementVoucher ? 'Voucher Recorded' : 'Needs Supplemental Voucher'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 truncate">{sbr.justification}</p>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>By {sbr.creatorName}</span>
                      {track.subLabel && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600 font-medium">{track.subLabel}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-[#003366]">
                        + {formatPHP(sbr.requestedAmount)}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                        {sbr.status === 'approved' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Encumbered
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3 text-amber-500" /> {sbr.additionalItems?.length || 0} item(s)
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSbr(sbr);
                      }}
                      className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-[#003366] hover:text-white transition-colors"
                      title="Inspect / Review Supplemental Budget"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <SupplementalBudgetModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingSbr(null);
        }}
        event={event}
        isSasInstitutional={isSasInstitutional}
        organizationId={organizationId}
        organizationName={organizationName}
        organizationAcronym={organizationAcronym}
        priorSupplementalTotal={approvedTotal}
        actor={actor}
        existingSbr={editingSbr}
      />

      {/* Detail / Review Modal */}
      <SupplementalBudgetDetailModal
        isOpen={Boolean(liveSelectedSbr)}
        onClose={() => setSelectedSbr(null)}
        sbr={liveSelectedSbr}
        viewerRole={viewerRole}
        actor={actor}
        onEditRequested={(sbrToEdit) => {
          setSelectedSbr(null);
          setEditingSbr(sbrToEdit);
          setShowCreateModal(true);
        }}
      />
    </div>
  );
}
