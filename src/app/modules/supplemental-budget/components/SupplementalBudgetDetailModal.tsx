/**
 * src/app/modules/supplemental-budget/components/SupplementalBudgetDetailModal.tsx
 *
 * Unified Review, Tracking, Decision, & Supplemental Voucher Modal
 * shared across Student Officer, Club Adviser, SAS Admin, and Institutional Signatory portals.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  RotateCcw,
  XCircle,
  FileText,
  ExternalLink,
  Landmark,
  Wallet,
  Coins,
  Upload,
  Loader2,
  Edit,
  Undo2,
  ShieldCheck,
  Receipt,
  History,
  Send,
  AlertTriangle,
  PenTool,
  Copy,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadToCloudinary } from '../../../../services/cloudinary';
import { formatPHP } from '../../activity-proposals/utils/proposal-calculations';
import { formatAppDateTime } from '../../../utils/date';
import ProposalStatusStepper from '../../activity-proposals/components/workflow/ProposalStatusStepper';
import ProposalFlowBuilder from '../../activity-proposals/components/workflow/ProposalFlowBuilder';
import ClubAdviserDecisionPanel from '../../workflow/components/ClubAdviserDecisionPanel';
import { resolveDocumentTrackingState } from '../../activity-proposals/utils/proposal-status-tracker.utils';
import { resolveSignatoryDecisionCapabilities } from '../../workflow/utils/approver-resolution.utils';
import { subscribeToSignatories } from '../../signatories/services/signatory.service';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import type { ProposalApprovalStep } from '../../activity-proposals/types/proposal.types';
import {
  isSignatoryTurnForSbr,
  matchesSbrSignatoryStep,
  normalizeSbrApprovalChain,
} from '../utils/sbr-validation.utils';
import {
  approveAndForwardSbrByAdviser,
  returnSbrByAdviser,
  rejectSbrByAdviser,
  approveSbrBySasDirect,
  endorseAndForwardSbrBySas,
  returnSbrBySas,
  rejectSbrBySas,
  processSbrSignatoryDecision,
  resolveDefaultSbrPipelineFromParentAp,
  withdrawSupplementalBudgetRequest,
  attachSupplementalDisbursementVoucher,
  type SbrActor,
} from '../services/sbr.service';
import {
  SUPPLEMENTAL_REASON_LABELS,
  type SupplementalBudgetRequest,
} from '../types/sbr.types';

const SBR_ADVISER_RETURN_STEPS = [
  {
    key: 'justification',
    stepNumber: 1,
    label: 'Justification & Supporting Proof',
    description: 'Reason category, justification narrative, and vendor quotation attachments',
  },
  {
    key: 'line_items',
    stepNumber: 2,
    label: 'Additional Expense Line Items',
    description: 'Quantities, unit prices, and line-item breakdowns',
  },
  {
    key: 'funding_source',
    stepNumber: 3,
    label: 'Funding Source & Bucket Split',
    description: 'Club Treasury or Miscellaneous Fee bucket selection and split',
  },
];

interface SupplementalBudgetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  sbr: SupplementalBudgetRequest | null;
  viewerRole: 'officer' | 'adviser' | 'admin' | 'signatory';
  actor: SbrActor;
  onEditRequested?: (sbr: SupplementalBudgetRequest) => void;
  onActionComplete?: () => void;
}

export default function SupplementalBudgetDetailModal({
  isOpen,
  onClose,
  sbr,
  viewerRole,
  actor,
  onEditRequested,
  onActionComplete,
}: SupplementalBudgetDetailModalProps) {
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [decisionMode, setDecisionMode] = useState<'none' | 'return' | 'reject'>('none');

  // Supplemental Voucher state (for approved school_budget SBRs)
  const [voucherMode, setVoucherMode] = useState<'separate' | 'bundled_with_primary'>(
    sbr?.disbursementVoucher?.mode || 'separate'
  );
  const [voucherNumber, setVoucherNumber] = useState(sbr?.disbursementVoucher?.voucherNumber || '');
  const [chequeNumber, setChequeNumber] = useState(sbr?.disbursementVoucher?.chequeNumber || '');
  const [releaseDate, setReleaseDate] = useState(
    sbr?.disbursementVoucher?.releaseDate || new Date().toISOString().slice(0, 10)
  );
  const [voucherUrl, setVoucherUrl] = useState(sbr?.disbursementVoucher?.attachmentUrl || '');
  const [voucherFileName, setVoucherFileName] = useState(sbr?.disbursementVoucher?.fileName || '');
  const [uploadingVoucher, setUploadingVoucher] = useState(false);

  // SAS Vetting Signatory Pipeline Configurator state
  const [showVettingFlowEditor, setShowVettingFlowEditor] = useState(false);
  const [vettingSignatories, setVettingSignatories] = useState<InstitutionalSignatory[]>([]);
  const [vettingChain, setVettingChain] = useState<ProposalApprovalStep[]>(sbr?.approvalChain || []);
  const [copyingApChain, setCopyingApChain] = useState(false);

  useEffect(() => {
    setVettingChain(sbr?.approvalChain || []);
  }, [sbr?.id, sbr?.approvalChain]);

  useEffect(() => {
    if (!isOpen || viewerRole !== 'admin' || !sbr?.requiresSignatories) return;
    const unsub = subscribeToSignatories((list) => setVettingSignatories(list));
    return () => unsub();
  }, [isOpen, viewerRole, sbr?.requiresSignatories]);

  if (!isOpen || !sbr) return null;

  const tracking = resolveDocumentTrackingState(sbr, 'SBR');
  const projectedTotal =
    Math.round(
      ((Number(sbr.baseApprovedBudget) || 0) +
        (Number(sbr.priorSupplementalTotal) || 0) +
        (Number(sbr.requestedAmount) || 0)) *
        100
    ) / 100;

  const isCreatorOrOrg =
    viewerRole === 'officer' || viewerRole === 'adviser' || (viewerRole === 'admin' && sbr.isSasInstitutional);
  const canEdit =
    isCreatorOrOrg && (sbr.status === 'draft' || sbr.status === 'for_revision' || Boolean(sbr.isReturned));
  const canWithdraw =
    isCreatorOrOrg &&
    !['approved', 'rejected', 'withdrawn'].includes(sbr.status);

  const canAdviserDecide = viewerRole === 'adviser' && sbr.status === 'for_adviser_review';
  const canSasDecide = viewerRole === 'admin' && sbr.status === 'for_sas_review';

  // Check if it is currently this Signatory's active turn (supports parallel multi-stage & post-approval co-sign)
  const activeStage = sbr.currentStageIndex ?? 1;
  const isCurrentSignatoryTurn =
    viewerRole === 'signatory' && isSignatoryTurnForSbr(sbr, actor);
  const sbrChain = sbr.approvalChain || [];
  const currentStepIdx = sbrChain.findIndex(
    (st: any) =>
      st &&
      st.status !== 'approved' &&
      st.status !== 'endorsed' &&
      st.status !== 'waived' &&
      (sbr.status === 'approved' || (st.stageIndex ?? 1) === activeStage) &&
      matchesSbrSignatoryStep(st, actor)
  );
  const resolvedStepIdx = currentStepIdx >= 0 ? currentStepIdx : (sbr.currentStepIndex ?? 0);
  const currentStep = sbrChain[resolvedStepIdx];
  const sbrDecisionCaps = resolveSignatoryDecisionCapabilities({
    chain: sbrChain,
    myStepIndex: resolvedStepIdx,
    signatory: actor,
    docType: 'proposal',
  });

  const canManageVoucher =
    sbr.status === 'approved' &&
    sbr.fundingSource === 'school_budget' &&
    (viewerRole === 'admin' || (viewerRole === 'adviser' && !sbr.isSasInstitutional));

  const fundingLabel =
    sbr.fundingSource === 'organization_funds'
      ? 'Club Treasury Funds'
      : sbr.fundingSource === 'retained_sao_fund'
      ? 'SAO Retained Activity Fund'
      : 'School Budget (Miscellaneous Fees)';

  const handleSasApproveOrForward = async () => {
    setBusy(true);
    try {
      if (sbr.requiresSignatories) {
        const cleaned = normalizeSbrApprovalChain(vettingChain, false);
        await endorseAndForwardSbrBySas(
          sbr.id,
          actor,
          remarks || undefined,
          cleaned.length > 0 ? cleaned : undefined
        );
        toast.success(`${sbr.referenceCode} vetted by SAS and forwarded to Institutional Signatories.`);
      } else {
        await approveSbrBySasDirect(sbr.id, actor, remarks || undefined);
        toast.success(`${sbr.referenceCode} approved! The club can now acknowledge and deduct it in Finance Center.`);
      }
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyParentApChainInVetting = async () => {
    setCopyingApChain(true);
    try {
      const res = await resolveDefaultSbrPipelineFromParentAp({
        eventId: sbr.eventId,
        isSasInstitutional: sbr.isSasInstitutional,
        signatoriesOverride: vettingSignatories.length > 0 ? vettingSignatories : undefined,
      });
      setVettingChain(res.chain);
      toast.success(`Copied ${res.chain.length} signatory step(s) from the Parent Activity Proposal.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to copy Parent AP pipeline.');
    } finally {
      setCopyingApChain(false);
    }
  };

  const handleSasReturnOrReject = async () => {
    if (!remarks.trim()) {
      toast.error('Please enter remarks explaining your decision.');
      return;
    }
    setBusy(true);
    try {
      if (decisionMode === 'return') {
        await returnSbrBySas(sbr.id, actor, remarks);
        toast.success(`Returned ${sbr.referenceCode} for revision.`);
      } else {
        await rejectSbrBySas(sbr.id, actor, remarks);
        toast.success(`Rejected ${sbr.referenceCode}.`);
      }
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSignatoryAction = async (decision: 'approve' | 'forward' | 'return' | 'reject') => {
    if ((decision === 'return' || decision === 'reject') && !remarks.trim()) {
      toast.error('Please provide remarks for returning or rejecting this request.');
      return;
    }
    setBusy(true);
    try {
      const result = await processSbrSignatoryDecision(sbr.id, actor, decision, remarks || undefined);
      if (result?.wasCoercedByPriorApproval) {
        toast.info(
          `Already approved by ${result.approvedBySignatoryName || 'another Approver'}. Your signature was recorded as Noted by:.`
        );
      } else {
        toast.success(
          decision === 'approve'
            ? `Signed and approved ${sbr.referenceCode}.`
            : decision === 'forward'
            ? sbrDecisionCaps.isDemotedToEndorserOnly
              ? `Recorded notation on ${sbr.referenceCode}.`
              : `Endorsed and forwarded ${sbr.referenceCode}.`
            : decision === 'return'
            ? `Returned ${sbr.referenceCode} for revision.`
            : `Rejected ${sbr.referenceCode}.`
        );
      }
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Signatory action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!window.confirm(`Withdraw Supplemental Budget Request ${sbr.referenceCode}?`)) return;
    setBusy(true);
    try {
      await withdrawSupplementalBudgetRequest(sbr.id, actor);
      toast.success(`Withdrew ${sbr.referenceCode}.`);
      onActionComplete?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not withdraw request');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadVoucherFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVoucher(true);
    try {
      const res = await uploadToCloudinary(file, 'sti_sync_supplemental_vouchers');
      setVoucherUrl(res.secure_url);
      setVoucherFileName(file.name);
      toast.success(`Uploaded voucher ${file.name}`);
    } catch (err: any) {
      toast.error(err?.message || 'Voucher upload failed');
    } finally {
      setUploadingVoucher(false);
      e.target.value = '';
    }
  };

  const handleSaveVoucher = async () => {
    if (voucherMode === 'separate' && !voucherNumber.trim() && !chequeNumber.trim() && !voucherUrl) {
      toast.error('Enter Voucher/Cheque number or upload the Disbursement Voucher copy.');
      return;
    }
    setBusy(true);
    try {
      await attachSupplementalDisbursementVoucher(
        sbr.id,
        {
          mode: voucherMode,
          voucherNumber: voucherMode === 'separate' ? voucherNumber.trim() : undefined,
          chequeNumber: voucherMode === 'separate' ? chequeNumber.trim() : undefined,
          releaseDate: voucherMode === 'separate' ? releaseDate : undefined,
          attachmentUrl: voucherMode === 'separate' ? voucherUrl || undefined : undefined,
          fileName: voucherMode === 'separate' ? voucherFileName || undefined : undefined,
          disbursedAmount: sbr.requestedAmount,
        },
        actor
      );
      toast.success('Supplemental Disbursement Voucher updated.');
      onActionComplete?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save Supplemental Voucher');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#003366] to-[#004a93] text-white flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-white/15 text-white border border-white/25">
                {sbr.referenceCode}
              </span>
              <span
                className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${tracking.badgeClass}`}
              >
                {sbr.status === 'withdrawn' ? 'Withdrawn' : tracking.label}
              </span>
            </div>
            <h2 className="text-lg font-bold mt-1">{sbr.eventTitle}</h2>
            <p className="text-xs text-blue-100 mt-0.5">
              {sbr.organizationName} • Requested by {sbr.creatorName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-blue-100 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Status Tracker */}
          {sbr.status !== 'withdrawn' && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <ProposalStatusStepper record={sbr} docKind="SBR" />
            </div>
          )}

          {/* Budget Impact Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="text-[11px] font-semibold text-slate-500">Original Approved Budget</div>
              <div className="text-lg font-bold text-slate-800 mt-1">
                {formatPHP(sbr.baseApprovedBudget)}
              </div>
              {sbr.priorSupplementalTotal > 0 && (
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  + {formatPHP(sbr.priorSupplementalTotal)} prior approved SBR
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70">
              <div className="text-[11px] font-semibold text-amber-800">Supplemental Requested</div>
              <div className="text-lg font-extrabold text-amber-900 mt-1">
                + {formatPHP(sbr.requestedAmount)}
              </div>
              <div className="text-[11px] text-amber-700 mt-0.5 flex items-center gap-1">
                {sbr.fundingSource === 'organization_funds' ? (
                  <Wallet className="w-3 h-3" />
                ) : sbr.fundingSource === 'retained_sao_fund' ? (
                  <Coins className="w-3 h-3" />
                ) : (
                  <Landmark className="w-3 h-3" />
                )}
                {fundingLabel}
              </div>
            </div>
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70">
              <div className="text-[11px] font-semibold text-emerald-800">
                {sbr.status === 'approved' ? 'Effective Approved Budget' : 'Projected Effective Budget'}
              </div>
              <div className="text-lg font-extrabold text-emerald-900 mt-1">
                {formatPHP(projectedTotal)}
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                {sbr.ledgerDeducted ? 'Encumbered in ledger' : 'Pending final approval'}
              </div>
            </div>
          </div>

          {/* Return / Rejection Alert */}
          {(sbr.isReturned || sbr.status === 'for_revision') && sbr.returnedRemarks && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <div className="font-bold">
                  Returned for Revision by {sbr.returnedByName || sbr.returnedByRole}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{sbr.returnedRemarks}</p>
              </div>
            </div>
          )}

          {sbr.status === 'rejected' && sbr.rejectionReason && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900">
                <div className="font-bold">
                  Rejected by {sbr.rejectedByName || sbr.rejectedByRole}
                </div>
                <p className="mt-1 whitespace-pre-wrap">{sbr.rejectionReason}</p>
              </div>
            </div>
          )}

          {/* Justification & Supporting Proof */}
          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Justification & Rationale
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                {SUPPLEMENTAL_REASON_LABELS[sbr.reasonCategory] || sbr.reasonCategory}
              </span>
            </div>
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
              {sbr.justification}
            </p>
            {sbr.supportingAttachments && sbr.supportingAttachments.length > 0 && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                {sbr.supportingAttachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold border border-blue-200"
                  >
                    <FileText className="w-3.5 h-3.5" /> {att.name} <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              Additional Expense Line Items
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Item Description</th>
                  <th className="text-right px-4 py-2 font-semibold">Qty</th>
                  <th className="text-right px-4 py-2 font-semibold">Unit Cost</th>
                  <th className="text-right px-4 py-2 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(sbr.additionalItems || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{item.description}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{formatPHP(item.unitCost)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                      {formatPHP(item.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Funding Bucket Allocations */}
          {sbr.allocations && sbr.allocations.length > 0 && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <div className="text-xs font-bold text-slate-700">Funding Bucket Allocation Breakdown</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sbr.allocations.map((a, i) => (
                  <div
                    key={`${a.bucketId}_${i}`}
                    className="px-3 py-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-slate-700">{a.bucketName}</span>
                    <span className="font-bold text-[#003366]">{formatPHP(a.allocatedAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Institutional Signatory Chain Progress */}
          {sbr.requiresSignatories && sbr.approvalChain && sbr.approvalChain.length > 0 && (
            <div className="p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" /> Institutional Signatory Routing
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {sbr.approvalChain.map((step: any, idx: number) => {
                  const hasStages = sbr.approvalChain.some((s: any) => typeof s?.stageIndex === 'number');
                  const isSigned = step.status === 'approved' || step.status === 'endorsed';
                  const isCurrent =
                    sbr.status === 'pending_signatories' &&
                    !isSigned &&
                    (hasStages
                      ? (step.stageIndex ?? 1) === activeStage
                      : idx === (sbr.currentStepIndex ?? 0));
                  return (
                    <div
                      key={step.id || idx}
                      className={`p-3 rounded-xl border text-xs ${
                        isSigned
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : isCurrent
                          ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-800">
                          {hasStages ? `Stage ${step.stageIndex ?? 1} • ` : `${idx + 1}. `}
                          {step.signatoryName || step.roleTitle}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isSigned
                              ? 'bg-emerald-100 text-emerald-700'
                              : isCurrent
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isSigned ? 'Signed' : isCurrent ? 'Current Turn' : 'Waiting'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{step.roleTitle}</div>
                      {step.signedAt && (
                        <div className="text-[10px] text-emerald-700 mt-1">
                          Signed {formatAppDateTime(step.signedAt)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ROLE PANEL 1: Club Adviser Checker Decision */}
          {canAdviserDecide && (
            <ClubAdviserDecisionPanel
              documentType="SBR"
              documentTitle={`Supplemental Budget ${sbr.referenceCode} (+${formatPHP(sbr.requestedAmount)})`}
              referenceNo={sbr.referenceCode}
              record={sbr}
              isAdviser={true}
              adviserProfile={{
                uid: actor.uid,
                name: actor.name,
                email: actor.email || '',
                signatureUrl: actor.signatureUrl,
              }}
              returnSteps={SBR_ADVISER_RETURN_STEPS}
              onApproveAndForward={async ({ signatureUrl, remarks: advRemarks }) => {
                await approveAndForwardSbrByAdviser(
                  sbr.id,
                  { ...actor, signatureUrl },
                  advRemarks
                );
                toast.success(`${sbr.referenceCode} approved by Adviser and forwarded to SAS.`);
              }}
              onReturnForRevision={async ({ overallRemarks }) => {
                await returnSbrByAdviser(sbr.id, actor, overallRemarks);
                toast.success(`${sbr.referenceCode} returned to Officer for revision.`);
              }}
              onReject={async ({ reason }) => {
                await rejectSbrByAdviser(sbr.id, actor, reason);
                toast.success(`${sbr.referenceCode} rejected by Club Adviser.`);
              }}
              onDecisionComplete={() => {
                onActionComplete?.();
                onClose();
              }}
              layout="inline"
            />
          )}

          {/* ROLE PANEL 2: SAS Admin Review / Vetting Decision */}
          {canSasDecide && (
            <div className="p-5 rounded-2xl bg-blue-50/70 border-2 border-[#003366]/20 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#003366]">
                  {sbr.requiresSignatories
                    ? 'SAS Admin Vetting Gate (School Budget / Misc Fee)'
                    : 'SAS Admin Direct Approval (Club Treasury Funds)'}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  {sbr.requiresSignatories
                    ? 'Verify Misc Fee bucket availability, adjust the signatory pipeline if needed, and forward to Institutional Signatories.'
                    : 'Approve directly to immediately encumber the supplemental delta from the Club Treasury ledger.'}
                </p>
              </div>

              {sbr.requiresSignatories && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowVettingFlowEditor((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-200 text-[#003366] hover:bg-blue-100/50 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      {showVettingFlowEditor
                        ? 'Hide Signatory Pipeline Editor'
                        : `Configure Signatory Pipeline (${vettingChain.length})`}
                    </button>
                    <button
                      type="button"
                      disabled={copyingApChain}
                      onClick={handleCopyParentApChainInVetting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                    >
                      {copyingApChain ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy Parent AP Pipeline
                    </button>
                  </div>

                  {showVettingFlowEditor && (
                    <div className="bg-white rounded-xl p-3 border border-blue-200">
                      <ProposalFlowBuilder
                        approvalChain={vettingChain}
                        onChange={(nextChain) => setVettingChain(nextChain)}
                        activeSignatories={vettingSignatories}
                        creatorName={sbr.creatorName}
                        creatorEmail={sbr.creatorEmail}
                        creatorRole={sbr.isSasInstitutional ? 'sas_admin' : 'officer'}
                        fundingSource={sbr.fundingSource}
                      />
                    </div>
                  )}
                </div>
              )}

              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional approval remarks (required if returning or rejecting)..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs focus:border-[#003366] focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSasApproveOrForward}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {sbr.requiresSignatories ? 'Endorse & Forward to Signatories' : 'Approve & Encumber Funds'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDecisionMode('return');
                    if (remarks.trim()) handleSasReturnOrReject();
                    else toast.info('Enter revision remarks above, then click Return for Revision again.');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Return for Revision
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDecisionMode('reject');
                    if (remarks.trim()) handleSasReturnOrReject();
                    else toast.info('Enter rejection reason above, then click Reject again.');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-300 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          )}

          {/* ROLE PANEL 3: Institutional Signatory Decision */}
          {isCurrentSignatoryTurn && (
            <div className="p-5 rounded-2xl bg-indigo-50/70 border-2 border-indigo-300 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-indigo-600" />
                  Signatory Decision ({currentStep?.roleTitle || 'Institutional Signatory'})
                </h4>
                <p className="text-xs text-indigo-800/80 mt-0.5">
                  Review the supplemental budget delta (+{formatPHP(sbr.requestedAmount)}) and{' '}
                  {sbrDecisionCaps.canApprove
                    ? sbrDecisionCaps.canEndorseInsteadOfApprove
                      ? 'choose to Approve immediately or Endorse & Forward to another designated Approver.'
                      : 'approve, return, or reject.'
                    : sbrDecisionCaps.isDemotedToEndorserOnly
                    ? 'affix your notation signature (approval has already been granted).'
                    : 'endorse or return.'}
                </p>
              </div>
              {sbrDecisionCaps.isDemotedToEndorserOnly && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Already Approved by {sbrDecisionCaps.approvedBySignatoryName || 'Executive Approver'}.</strong>{' '}
                    Only one final approval is recorded — your signature will be recorded as <strong>Noted by:</strong>.
                  </span>
                </div>
              )}
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional endorsement remarks (required for return or rejection)..."
                className="w-full rounded-xl border border-indigo-200 bg-white px-3.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2.5">
                {sbrDecisionCaps.canApprove ? (
                  <>
                    {sbrDecisionCaps.canEndorseInsteadOfApprove && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSignatoryAction('forward')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                        title="Endorse & forward so another designated Approver can grant final approval"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Endorse & Forward
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSignatoryAction('approve')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#001A4D] text-[#FFD41C] hover:bg-[#0A2E6D] border border-[#FFD41C]/40 disabled:opacity-50"
                      title={
                        sbrDecisionCaps.canEndorseInsteadOfApprove
                          ? 'Grant final approval immediately (other designated approvers will become Noted/Endorser only)'
                          : 'Sign and grant final approval'
                      }
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      Sign & Approve Supplemental Budget
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSignatoryAction('forward')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {sbrDecisionCaps.isDemotedToEndorserOnly || sbrDecisionCaps.primaryActionMode === 'note_only'
                      ? 'Sign & Note Supplemental Budget'
                      : 'Sign & Endorse Supplemental Budget'}
                  </button>
                )}
                {!sbrDecisionCaps.isAlreadyApproved && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSignatoryAction('return')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Return for Revision
                    </button>
                    {sbrDecisionCaps.canApprove && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSignatoryAction('reject')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 hover:bg-rose-200 border border-rose-300 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* SUPPLEMENTAL DISBURSEMENT VOUCHER PANEL (Approved school_budget SBR) */}
          {sbr.status === 'approved' && sbr.fundingSource === 'school_budget' && (
            <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-sm font-bold text-emerald-950">
                    Supplemental Disbursement Voucher
                  </h4>
                </div>
                {sbr.disbursementVoucher ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    {sbr.disbursementVoucher.mode === 'bundled_with_primary'
                      ? 'Bundled with Primary Voucher'
                      : `Voucher Attached (${sbr.disbursementVoucher.chequeNumber || sbr.disbursementVoucher.voucherNumber || 'Recorded'})`}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                    Pending Supplemental Voucher
                  </span>
                )}
              </div>

              {canManageVoucher ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                      <input
                        type="radio"
                        checked={voucherMode === 'separate'}
                        onChange={() => setVoucherMode('separate')}
                      />
                      Separate Supplemental Cheque / Voucher
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                      <input
                        type="radio"
                        checked={voucherMode === 'bundled_with_primary'}
                        onChange={() => setVoucherMode('bundled_with_primary')}
                      />
                      Bundled with Primary Event Voucher
                    </label>
                  </div>

                  {voucherMode === 'separate' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        placeholder="Voucher #"
                        value={voucherNumber}
                        onChange={(e) => setVoucherNumber(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Cheque #"
                        value={chequeNumber}
                        onChange={(e) => setChequeNumber(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                      <input
                        type="date"
                        value={releaseDate}
                        onChange={(e) => setReleaseDate(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                  )}

                  {voucherMode === 'separate' && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-emerald-400 bg-white text-xs font-semibold text-emerald-800 cursor-pointer hover:bg-emerald-50">
                        {uploadingVoucher ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        {voucherFileName || 'Upload Voucher Scan (PDF/Image)'}
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={handleUploadVoucherFile}
                          className="hidden"
                        />
                      </label>
                      {voucherUrl && (
                        <a
                          href={voucherUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
                        >
                          View Uploaded Voucher <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSaveVoucher}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" /> Save Supplemental Voucher Status
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-600">
                  {sbr.disbursementVoucher ? (
                    <div className="space-y-1">
                      <div>
                        Mode:{' '}
                        <strong>
                          {sbr.disbursementVoucher.mode === 'bundled_with_primary'
                            ? 'Bundled with Primary Event Voucher'
                            : 'Separate Supplemental Voucher'}
                        </strong>
                      </div>
                      {sbr.disbursementVoucher.chequeNumber && (
                        <div>Cheque #: {sbr.disbursementVoucher.chequeNumber}</div>
                      )}
                      {sbr.disbursementVoucher.attachmentUrl && (
                        <a
                          href={sbr.disbursementVoucher.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 font-semibold hover:underline inline-flex items-center gap-1"
                        >
                          View Voucher Document <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <span>Awaiting SAS / Adviser to record the Supplemental Disbursement Voucher.</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Audit Timeline */}
          {sbr.history && sbr.history.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Audit Trail
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {[...sbr.history].reverse().map((h) => (
                  <div
                    key={h.id}
                    className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/70 text-xs flex items-start justify-between gap-3"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{h.performedBy}</span>{' '}
                      <span className="text-slate-600">{h.remarks || h.action.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {formatAppDateTime(h.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {canEdit && onEditRequested && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditRequested(sbr);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#003366] text-white hover:bg-[#002244]"
              >
                <Edit className="w-3.5 h-3.5" /> Edit & Resubmit
              </button>
            )}
            {canWithdraw && (
              <button
                type="button"
                disabled={busy}
                onClick={handleWithdraw}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200"
              >
                <Undo2 className="w-3.5 h-3.5" /> Withdraw Request
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
