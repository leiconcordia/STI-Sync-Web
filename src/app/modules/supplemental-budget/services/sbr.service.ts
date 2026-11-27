/**
 * src/app/modules/supplemental-budget/services/sbr.service.ts
 *
 * Firestore lifecycle service for Supplemental Budget Requests (SBR):
 * - Officer -> Club Adviser Checker Gate -> SAS Direct (Org Funds) OR SAS Vetting -> Signatories (School Budget)
 * - Adviser-created -> SAS Direct / SAS Vetting
 * - SAS Admin-created -> Institutional Signatories
 * - Atomic idempotent ledger encumbrance & additive rollup onto parent event on final approval
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  updateDoc,
  runTransaction,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  resolveSignatoryDecisionCapabilities,
  applySingleApprovalDemotion,
  applySelfEndorseDemotion,
  restoreDemotedApproversOnRevision,
  findApprovedStep,
} from '../../workflow/utils/approver-resolution.utils';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import { logAuditEvent } from '../../audit/services/audit.service';
import { createNotification } from '../../notifications/services/notification.service';
import { getInstitutionalSignatories } from '../../signatories/services/signatory.service';
import {
  assertAdviserCanApproveForOrg,
  resolveAdviserActorAuditContext,
} from '../../organizations/services/organization.service';
import { isSignatoryApplicableTo } from '../../signatories/types/signatory.types';
import { resolveSignerAttribution } from '../../signatories/utils/signatory-substitute.utils';
import {
  getDefaultWorkflowSettings,
  findMatchedSignatoryForStep,
} from '../../workflow/services/approval-workflow.service';
import { deductSupplementalBudget } from '../../finance/services/finance.service';
import {
  deductMiscFeeBucketOnDisbursement,
  MISC_FEE_LEDGER_COLLECTION,
} from '../../finance/services/misc-fee.service';
import { deductRetainedFundOnProposalApproval } from '../../finance/services/retained-fund.service';
import type { ProposalApprovalStep, ProposalBucketAllocation } from '../../activity-proposals/types/proposal.types';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import {
  buildSbrReferenceCode,
  cloneParentApSignatoryPipeline,
  computeSupplementalItemsTotal,
  doesSbrRequireSignatories,
  IN_FLIGHT_SBR_STATUSES,
  isSbrDisbursedForLiquidation,
  matchesSbrSignatoryStep,
  mergeBaseAndSupplementalAllocations,
  normalizeSbrApprovalChain,
} from '../utils/sbr-validation.utils';
import type {
  CreateSupplementalBudgetPayload,
  SupplementalBudgetRequest,
  SupplementalEventAllocation,
  SupplementalEventExpenseItem,
  SupplementalHistoryEntry,
  SupplementalVoucherRecord,
} from '../types/sbr.types';

export const SUPPLEMENTAL_BUDGET_COLLECTION = 'supplemental_budget_requests';
const ACTIVITIES_COLLECTION = 'activities';
const EVENTS_COLLECTION = 'events';
const PROPOSALS_COLLECTION = 'activity_proposals';

function isFirestoreQuotaError(err: any): boolean {
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return code === 'resource-exhausted' || msg.includes('quota exceeded') || msg.includes('resource-exhausted');
}

async function getDocSafe(ref: ReturnType<typeof doc>) {
  try {
    return await getDoc(ref);
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      return await getDocFromCache(ref);
    }
    throw err;
  }
}

async function getDocsSafe(q: any) {
  try {
    return await getDocs(q);
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      return await getDocsFromCache(q);
    }
    throw err;
  }
}

async function resolveOrgAdviserRecipientTokens(targetOrgId: string): Promise<string> {
  if (!targetOrgId || ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'student_org'].includes(targetOrgId.toLowerCase())) {
    return '';
  }
  const tokens: string[] = [`adviser:${targetOrgId}`];
  try {
    const orgSnap = await getDocSafe(doc(db, 'organizations', targetOrgId));
    if (orgSnap.exists()) {
      const oData = orgSnap.data() as any;
      const candidates = [
        oData?.adviser?.email,
        oData?.adviser?.uid,
        oData?.adviserEmail,
        oData?.adviserUid,
        oData?.secondaryAdviser?.email,
        oData?.secondaryAdviser?.uid,
        oData?.coAdviser?.email,
        oData?.coAdviser?.uid,
        oData?.coAdviserEmail,
        oData?.coAdviserUid,
      ];
      candidates.forEach((c) => {
        if (typeof c === 'string' && c.trim()) tokens.push(c.trim());
      });
    }
  } catch (_) {}
  return Array.from(new Set(tokens)).join('|');
}

async function notifyAdviserForSbrReview(params: {
  sbrId: string;
  eventId: string;
  eventTitle: string;
  referenceCode: string;
  requestedAmount: number;
  organizationId: string;
  organizationName: string;
  actor: SbrActor;
  isResubmission?: boolean;
}): Promise<void> {
  if (!params.organizationId) return;
  try {
    const adviserTokens = await resolveOrgAdviserRecipientTokens(params.organizationId);
    if (!adviserTokens) return;
    await createNotification({
      recipientRole: 'officer',
      recipientId: adviserTokens,
      targetOrgId: params.organizationId,
      targetOrgName: params.organizationName,
      type: 'document_submission',
      category: 'activity_proposal',
      title: params.isResubmission
        ? `Revised Supplemental Budget for Review: ${params.eventTitle}`
        : `New Supplemental Budget Request: ${params.eventTitle}`,
      message: `${params.actor.name || 'An officer'} ${params.isResubmission ? 'resubmitted' : 'requested'} ${params.referenceCode} (+₱${params.requestedAmount.toLocaleString()}) for "${params.eventTitle}". Review and endorse before forwarding to SAS.`,
      resourceId: params.eventId,
      resourceType: 'event',
      actionRoute: `/officer/events?tab=supplemental_budgets&id=${params.eventId}`,
      metadata: { sbrId: params.sbrId, referenceCode: params.referenceCode },
      senderId: params.actor.uid,
      senderName: params.actor.name,
      senderRoleTitle: 'Organization Officer',
    });
  } catch (err) {
    console.warn('[sbr.service] Adviser SBR notification error:', err);
  }
}

async function notifySasForSbrReview(params: {
  sbrId: string;
  eventId: string;
  eventTitle: string;
  referenceCode: string;
  requestedAmount: number;
  organizationId?: string;
  organizationName: string;
  actor: SbrActor;
  forwardedByAdviser?: boolean;
  isResubmission?: boolean;
}): Promise<void> {
  try {
    await createNotification({
      recipientRole: 'admin',
      targetOrgId: params.organizationId || undefined,
      targetOrgName: params.organizationName,
      type: 'document_submission',
      category: 'activity_proposal',
      title: params.forwardedByAdviser
        ? `Supplemental Budget for SAS Approval: ${params.eventTitle}`
        : params.isResubmission
        ? `Revised Supplemental Budget for SAS Approval: ${params.eventTitle}`
        : `New Supplemental Budget for SAS Approval: ${params.eventTitle}`,
      message: params.forwardedByAdviser
        ? `${params.actor.name} (Club Adviser, ${params.organizationName}) endorsed ${params.referenceCode} (+₱${params.requestedAmount.toLocaleString()}) for "${params.eventTitle}" awaiting SAS approval.`
        : `${params.organizationName} submitted ${params.referenceCode} (+₱${params.requestedAmount.toLocaleString()}) for "${params.eventTitle}" awaiting SAS approval.`,
      resourceId: params.eventId,
      resourceType: 'event',
      actionRoute: `/home/event-approvals?tab=supplemental_budgets&id=${params.eventId}`,
      metadata: { sbrId: params.sbrId, referenceCode: params.referenceCode },
      senderId: params.actor.uid,
      senderName: params.actor.name,
      senderRoleTitle: params.actor.role === 'adviser' ? 'Club Adviser' : 'Organization Officer',
    });
  } catch (err) {
    console.warn('[sbr.service] SAS Admin SBR notification error:', err);
  }
}

async function notifySignatoriesForSbrStage(params: {
  sbrId: string;
  eventId: string;
  eventTitle: string;
  referenceCode: string;
  requestedAmount: number;
  organizationId?: string;
  organizationName: string;
  approvalChain: ProposalApprovalStep[];
  stageIndex: number;
  actor: SbrActor;
}): Promise<void> {
  try {
    const stageSteps = (params.approvalChain || []).filter(
      (s: any) =>
        (s.stageIndex ?? 1) === params.stageIndex &&
        s.status !== 'approved' &&
        s.status !== 'endorsed' &&
        s.status !== 'waived'
    );
    for (const signer of stageSteps) {
      const recipientTokens = [signer.signatoryUid, signer.signatoryEmail].filter(Boolean).join('|');
      if (!recipientTokens) continue;
      await createNotification({
        recipientRole: 'signatory',
        recipientId: recipientTokens,
        targetOrgId: params.organizationId || undefined,
        targetOrgName: params.organizationName,
        type: 'signatory_required',
        category: 'activity_proposal',
        title: `Supplemental Budget Awaiting Signature: ${params.eventTitle}`,
        message: `${params.organizationName} submitted ${params.referenceCode} (+₱${params.requestedAmount.toLocaleString()}) for "${params.eventTitle}" (Stage ${params.stageIndex}).`,
        resourceId: params.eventId,
        resourceType: 'event',
        actionRoute: '/signatory/proposals',
        metadata: { sbrId: params.sbrId, referenceCode: params.referenceCode },
        senderId: params.actor.uid,
        senderName: params.actor.name,
        senderRoleTitle: params.actor.roleTitle || (params.actor.role === 'admin' ? 'SAS Administrator' : 'Signatory'),
      });
    }
  } catch (err) {
    console.warn('[sbr.service] Signatory SBR notification error:', err);
  }
}

async function notifyOrgForSbrStatus(params: {
  sbrId: string;
  eventId: string;
  organizationId?: string;
  organizationName: string;
  type: 'document_approved' | 'document_returned' | 'document_rejected' | 'document_submission';
  title: string;
  message: string;
  actor: SbrActor;
  isUrgent?: boolean;
}): Promise<void> {
  if (!params.organizationId || ['sas', 'sas_admin', 'sao', 'sao_admin'].includes(params.organizationId.toLowerCase())) {
    return;
  }
  try {
    await createNotification({
      recipientRole: 'officer',
      targetOrgId: params.organizationId,
      targetOrgName: params.organizationName,
      type: params.type,
      category: 'activity_proposal',
      title: params.title,
      message: params.message,
      resourceId: params.eventId,
      resourceType: 'event',
      actionRoute: `/officer/events?tab=supplemental_budgets&id=${params.eventId}`,
      metadata: { sbrId: params.sbrId },
      isUrgent: Boolean(params.isUrgent),
      senderId: params.actor.uid,
      senderName: params.actor.name,
      senderRoleTitle:
        params.actor.roleTitle ||
        (params.actor.role === 'admin'
          ? 'SAS Administrator'
          : params.actor.role === 'adviser'
          ? 'Club Adviser'
          : 'Signatory'),
    });
  } catch (err) {
    console.warn('[sbr.service] Org SBR notification error:', err);
  }
}

export interface SbrActor {
  uid: string;
  id?: string;
  name: string;
  email?: string;
  role: 'officer' | 'adviser' | 'admin' | 'signatory';
  roleTitle?: string;
  signatureUrl?: string;
  canApproveProposal?: boolean;
  actingAsSubstitute?: boolean;
  substituteUid?: string;
  delegatedForSignatoryId?: string;
  delegatedForSignatoryUid?: string;
  delegatedForSignatoryName?: string;
  delegatedForSignatoryEmail?: string;
  delegatedForRoleTitle?: string;
}

function makeHistoryEntry(
  action: SupplementalHistoryEntry['action'],
  actor: Pick<SbrActor, 'uid' | 'name' | 'role'>,
  remarks?: string
): SupplementalHistoryEntry {
  return {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    action,
    performedBy: actor.name || 'User',
    performedByUid: actor.uid,
    role: actor.role,
    ...(remarks ? { remarks } : {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Resolves the default signatory pipeline for a Supplemental Budget Request:
 * 1. Copies the Parent Activity Proposal's exact configured approval pipeline (`activity_proposals/{eventId}` or `events/{eventId}`)
 *    with internal SAS/Adviser steps stripped and statuses reset to `pending`.
 * 2. Fallback (only if parent AP had no institutional signatories, e.g. original AP was Org Funds or Zero Budget):
 *    uses the configured Default AP Workflow Template (`admin_ap` / `adviser_ap`) matched to active proposal signatories.
 */
export async function resolveDefaultSbrPipelineFromParentAp(params: {
  eventId?: string;
  parentEvent?: any;
  isSasInstitutional: boolean;
  signatoriesOverride?: InstitutionalSignatory[];
}): Promise<{
  chain: ProposalApprovalStep[];
  source: 'parent_ap' | 'default_ap_template';
}> {
  // 1. Try parentEvent passed in memory first
  const fromMemory = cloneParentApSignatoryPipeline(params.parentEvent);
  if (fromMemory.length > 0) {
    return { chain: fromMemory, source: 'parent_ap' };
  }

  // 2. Fetch parent AP / Event doc from Firestore to copy its exact pipeline
  if (params.eventId) {
    for (const colName of [ACTIVITIES_COLLECTION, PROPOSALS_COLLECTION, EVENTS_COLLECTION]) {
      try {
        const snap = await getDoc(doc(db, colName, params.eventId));
        if (snap.exists()) {
          const cloned = cloneParentApSignatoryPipeline(snap.data());
          if (cloned.length > 0) {
            return { chain: cloned, source: 'parent_ap' };
          }
        }
      } catch {}
    }
  }

  // 3. Fallback: Default AP Workflow Template (never dumps all signatories blindly)
  const allSignatories = params.signatoriesOverride || (await getInstitutionalSignatories());
  const activeProposalSigners = allSignatories.filter(
    (s) => s.isActive !== false && isSignatoryApplicableTo(s, 'proposal')
  );

  try {
    const wfSettings = await getDefaultWorkflowSettings();
    const pipelineKey = params.isSasInstitutional ? 'admin_ap' : 'adviser_ap';
    const templateSteps = wfSettings?.[pipelineKey] || [];

    const mappedTemplate = templateSteps
      .map((tpl: any, idx: number) => {
        const matched = findMatchedSignatoryForStep(tpl, activeProposalSigners);
        if (!matched) return null;
        return {
          id: `sbr_tpl_${idx + 1}_${matched.id}`,
          step: idx + 1,
          stageIndex: tpl.stageIndex ?? idx + 1,
          stageName: tpl.stageName || `Stage ${tpl.stageIndex ?? idx + 1}`,
          role: matched.role || tpl.role,
          roleTitle: matched.roleTitle || tpl.roleTitle || matched.role,
          actionType: tpl.actionType || (matched.canApproveProposal ? 'approve' : 'endorse'),
          signatoryLabel:
            tpl.signatoryLabel ||
            matched.defaultSignatoryLabel ||
            (matched.canApproveProposal ? 'Approved by' : 'Endorsed by'),
          signatoryUid: matched.uid || matched.id,
          signatoryName: matched.name,
          signatoryEmail: matched.email,
          department: matched.department || tpl.department,
          status: 'pending' as const,
        };
      })
      .filter(Boolean);

    const cleanedTemplate = cloneParentApSignatoryPipeline({ approvalChain: mappedTemplate });
    if (cleanedTemplate.length > 0) {
      return { chain: cleanedTemplate, source: 'default_ap_template' };
    }
  } catch {}

  // Final safety fallback: only permanent / final approver signatory (e.g., School President)
  const finalApprovers = activeProposalSigners.filter(
    (s) => s.canApproveProposal || String(s.role || '').toLowerCase().includes('president')
  );
  const minimal = (finalApprovers.length > 0 ? finalApprovers : activeProposalSigners.slice(0, 1)).map(
    (s, idx) => ({
      id: `sbr_step_${idx + 1}_${s.id}`,
      step: idx + 1,
      stageIndex: idx + 1,
      stageName: `Stage ${idx + 1}`,
      role: s.role,
      roleTitle: s.roleTitle || s.role,
      actionType: (s.canApproveProposal || s.actionType === 'approve' ? 'approve' : 'endorse') as 'approve' | 'endorse',
      signatoryLabel: s.defaultSignatoryLabel || (s.canApproveProposal ? 'Approved by' : 'Endorsed by'),
      signatoryUid: s.uid || s.id,
      signatoryName: s.name,
      signatoryEmail: s.email,
      status: 'pending' as const,
    })
  );

  return { chain: minimal, source: 'default_ap_template' };
}

/**
 * Backwards-compatible wrapper that copies the parent AP pipeline when eventId is supplied.
 */
export async function generateDefaultSbrSignatoryChain(
  signatoriesOverride?: InstitutionalSignatory[],
  options?: { eventId?: string; parentEvent?: any; isSasInstitutional?: boolean }
): Promise<ProposalApprovalStep[]> {
  const res = await resolveDefaultSbrPipelineFromParentAp({
    eventId: options?.eventId,
    parentEvent: options?.parentEvent,
    isSasInstitutional: Boolean(options?.isSasInstitutional),
    signatoriesOverride,
  });
  return res.chain;
}

/**
 * Normalizes `allocations` so Organization Funds and Retained SAO Fund always carry a canonical bucket entry.
 */
function normalizeSbrAllocations(
  fundingSource: CreateSupplementalBudgetPayload['fundingSource'],
  allocations: ProposalBucketAllocation[],
  requestedAmount: number,
  organizationId: string,
  organizationName: string
): ProposalBucketAllocation[] {
  if (fundingSource === 'school_budget') {
    return (allocations || []).map((a) => ({
      ...a,
      fundType: 'misc_fee' as const,
      allocatedAmount: Math.round((Number(a.allocatedAmount) || 0) * 100) / 100,
    }));
  }

  if (fundingSource === 'retained_sao_fund') {
    return [
      {
        bucketId: 'SAO_CAMPUS',
        bucketName: 'Campus Student Contribution Retained Fund',
        fundType: 'student_contribution_retained',
        allocatedAmount: Math.round(requestedAmount * 100) / 100,
      },
    ];
  }

  // organization_funds
  const cleanOrgId = String(organizationId || '').trim();
  return [
    {
      bucketId: cleanOrgId ? `ORG_${cleanOrgId}` : 'ORG_TREASURY',
      bucketName: `${organizationName || 'Organization'} Treasury`,
      fundType: 'org_treasury',
      allocatedAmount: Math.round(requestedAmount * 100) / 100,
    },
  ];
}

/**
 * Recomputes and syncs additive supplemental rollup fields onto the parent `events` (and `activity_proposals`) doc.
 * Never mutates `budgetItems`, `financialProjections`, or original AP signatures.
 */
export async function syncParentEventSupplementalRollup(eventId: string): Promise<void> {
  if (!eventId) return;

  const q = query(
    collection(db, SUPPLEMENTAL_BUDGET_COLLECTION),
    where('eventId', '==', eventId)
  );
  let snap;
  try {
    snap = await getDocsSafe(q);
  } catch (err: any) {
    if (isFirestoreQuotaError(err)) {
      console.warn('[sbr.service] Skipping parent event rollup read due to Firestore quota:', err);
      return;
    }
    throw err;
  }
  const allSbrs = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as SupplementalBudgetRequest)
    .filter((s) => !s.isDeleted);

  const approvedSbrs = allSbrs.filter((s) => s.status === 'approved');
  const disbursedSbrs = approvedSbrs.filter((s) => isSbrDisbursedForLiquidation(s));
  const hasPending = allSbrs.some((s) => IN_FLIGHT_SBR_STATUSES.has(s.status));
  const hasPendingDisbursement = approvedSbrs.some((s) => !isSbrDisbursedForLiquidation(s));
  const supplementalBudgetTotal = Math.round(
    disbursedSbrs.reduce((sum, s) => sum + Math.max(0, Number(s.requestedAmount) || 0), 0) * 100
  ) / 100;

  const supplementalAllocations: SupplementalEventAllocation[] = [];
  const supplementalExpenseItems: SupplementalEventExpenseItem[] = [];
  let hasSupplementalSchoolBudget = false;
  disbursedSbrs.forEach((s) => {
    if (s.fundingSource === 'school_budget') hasSupplementalSchoolBudget = true;
    (s.allocations || []).forEach((a) => {
      supplementalAllocations.push({
        ...a,
        sbrId: s.id,
        sbrReferenceCode: s.referenceCode,
      });
    });
    (s.additionalItems || []).forEach((it) => {
      supplementalExpenseItems.push({
        id: it.id,
        sbrId: s.id,
        sbrReferenceCode: s.referenceCode,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitCost: it.unitCost,
        totalAmount: it.totalAmount,
        fundingSource: s.fundingSource,
        ...(it.remarks ? { remarks: it.remarks } : {}),
      });
    });
  });

  const syncDoc = async (collectionName: string) => {
    const ref = doc(db, collectionName, eventId);
    let evSnap;
    try {
      evSnap = await getDocSafe(ref);
    } catch (err: any) {
      if (isFirestoreQuotaError(err)) return;
      throw err;
    }
    if (!evSnap.exists()) return;
    const evData = evSnap.data() as any;

    const originalApprovedBudget =
      typeof evData.originalApprovedBudget === 'number'
        ? evData.originalApprovedBudget
        : Math.max(
            0,
            Number(evData.totalApprovedBudget) ||
              Number(evData.approvedBudget) ||
              Number(evData.financialProjections?.totalExpenses) ||
              Number(evData.budget) ||
              0
          );

    const effectiveApprovedBudget = Math.round((originalApprovedBudget + supplementalBudgetTotal) * 100) / 100;

    const patch: Record<string, any> = {
      originalApprovedBudget,
      supplementalBudgetTotal,
      effectiveApprovedBudget,
      supplementalAllocations,
      supplementalExpenseItems,
      approvedSupplementalCount: disbursedSbrs.length,
      hasPendingSupplementalRequest: hasPending,
      hasPendingSupplementalDisbursement: hasPendingDisbursement,
      hasSupplementalSchoolBudget,
      updatedAt: serverTimestamp(),
    };

    // If originally zero_budget / liquidation-exempt and now has disbursed/acknowledged supplemental funds, un-exempt automatically
    if (effectiveApprovedBudget > 0 && (evData.liquidationRequired === false || evData.fundingSource === 'zero_budget')) {
      patch.liquidationRequired = true;
      if (!evData.liquidationStatus || evData.liquidationStatus === 'none_required') {
        patch.liquidationStatus = 'pending';
      }
    }

    await updateDoc(ref, sanitizeFirestorePayload(patch));
  };

  await Promise.all([
    syncDoc(ACTIVITIES_COLLECTION),
    syncDoc(EVENTS_COLLECTION),
    syncDoc(PROPOSALS_COLLECTION),
  ]);
}

/**
 * Real-time subscription to all non-deleted Supplemental Budget Requests.
 */
export function subscribeToSupplementalBudgetRequests(
  callback: (list: SupplementalBudgetRequest[]) => void,
  onError?: (err: Error) => void
): () => void {
  const ref = collection(db, SUPPLEMENTAL_BUDGET_COLLECTION);
  return onSnapshot(
    ref,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as SupplementalBudgetRequest)
        .filter((s) => !s.isDeleted)
        .sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() || Date.parse(a.createdAt || '') || 0;
          const tB = b.createdAt?.toMillis?.() || Date.parse(b.createdAt || '') || 0;
          return tB - tA;
        });
      callback(list);
    },
    (err) => {
      console.error('[sbr.service] subscribeToSupplementalBudgetRequests error:', err);
      onError?.(err);
    }
  );
}

/**
 * Real-time subscription to Supplemental Budget Requests for a specific event.
 */
export function subscribeToEventSupplementalBudgets(
  eventId: string,
  callback: (list: SupplementalBudgetRequest[]) => void
): () => void {
  if (!eventId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, SUPPLEMENTAL_BUDGET_COLLECTION),
    where('eventId', '==', eventId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as SupplementalBudgetRequest)
        .filter((s) => !s.isDeleted)
        .sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() || Date.parse(a.createdAt || '') || 0;
          const tB = b.createdAt?.toMillis?.() || Date.parse(b.createdAt || '') || 0;
          return tB - tA;
        });
      callback(list);
    },
    (err) => {
      console.error('[sbr.service] subscribeToEventSupplementalBudgets error:', err);
    }
  );
}

export async function getSupplementalBudgetsByEvent(
  eventId: string
): Promise<SupplementalBudgetRequest[]> {
  if (!eventId) return [];
  const q = query(
    collection(db, SUPPLEMENTAL_BUDGET_COLLECTION),
    where('eventId', '==', eventId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as SupplementalBudgetRequest)
    .filter((s) => !s.isDeleted);
}

export async function getSupplementalBudgetById(
  sbrId: string
): Promise<SupplementalBudgetRequest | null> {
  if (!sbrId) return null;
  const snap = await getDocSafe(doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as SupplementalBudgetRequest;
}

/**
 * Creates a new Supplemental Budget Request (Draft or Submitted).
 * Automatically routes according to creator role and supplemental funding source:
 * - Student Officer -> `for_adviser_review`
 * - Club Adviser -> `for_sas_review` (auto-endorsed with Adviser e-sig; `isPendingSasVetting` = requiresSignatories)
 * - SAS Admin (Institutional) -> `pending_signatories` (directly to Institutional Signatories)
 */
export async function createSupplementalBudgetRequest(
  payload: CreateSupplementalBudgetPayload,
  actor: SbrActor
): Promise<SupplementalBudgetRequest> {
  const existing = await getSupplementalBudgetsByEvent(payload.eventId);
  const referenceCode = buildSbrReferenceCode(
    payload.isSasInstitutional ? 'SAS' : payload.organizationAcronym || payload.organizationId,
    existing.length
  );

  const requestedAmount = computeSupplementalItemsTotal(payload.additionalItems) || Math.max(0, Number(payload.requestedAmount) || 0);
  const requiresSignatories = doesSbrRequireSignatories(payload.fundingSource, payload.isSasInstitutional);
  const normalizedAllocations = normalizeSbrAllocations(
    payload.fundingSource,
    payload.allocations,
    requestedAmount,
    payload.organizationId,
    payload.organizationName
  );

  const miscIds = normalizedAllocations.filter((a) => a.fundType === 'misc_fee').map((a) => a.bucketId);
  const miscNames = normalizedAllocations.filter((a) => a.fundType === 'misc_fee').map((a) => a.bucketName);

  let approvalChain: ProposalApprovalStep[] = payload.approvalChain || [];
  let pipelineSource: SupplementalBudgetRequest['pipelineSource'] =
    approvalChain.length > 0 ? 'custom' : undefined;
  if (requiresSignatories && approvalChain.length === 0) {
    const resolved = await resolveDefaultSbrPipelineFromParentAp({
      eventId: payload.eventId,
      isSasInstitutional: payload.isSasInstitutional,
    });
    approvalChain = resolved.chain;
    pipelineSource = resolved.source;
  }

  let status: SupplementalBudgetRequest['status'] = 'draft';
  let isPendingSasVetting = false;
  let adviserReview: SupplementalBudgetRequest['adviserReview'] = null;
  const nowIso = new Date().toISOString();
  const history: SupplementalHistoryEntry[] = [
    makeHistoryEntry('created', actor, `Created ${referenceCode} for ₱${requestedAmount.toLocaleString()}`),
  ];

  if (payload.submitImmediately) {
    if (actor.role === 'officer') {
      status = 'for_adviser_review';
      adviserReview = { status: 'pending' };
      history.push(makeHistoryEntry('submitted_to_adviser', actor, 'Submitted to Club Adviser for initial review.'));
    } else if (actor.role === 'adviser') {
      status = 'for_sas_review';
      isPendingSasVetting = requiresSignatories;
      adviserReview = {
        status: 'approved',
        reviewedByUid: actor.uid,
        reviewedByName: actor.name,
        reviewedByEmail: actor.email,
        reviewedAt: nowIso,
        remarks: 'Initiated and endorsed directly by Club Adviser.',
        ...(actor.signatureUrl ? { signatureUrl: actor.signatureUrl } : {}),
      };
      history.push(makeHistoryEntry('adviser_approved', actor, 'Initiated by Club Adviser and forwarded to SAS.'));
    } else {
      // SAS Admin institutional event SBR
      status = requiresSignatories && approvalChain.length > 0 ? 'pending_signatories' : 'approved';
      isPendingSasVetting = false;
      history.push(
        makeHistoryEntry(
          status === 'pending_signatories' ? 'sas_endorsed' : 'sas_approved',
          actor,
          status === 'pending_signatories'
            ? 'Submitted by SAS Admin directly to Institutional Signatories.'
            : 'Approved by SAS Admin.'
        )
      );
    }
  }

  approvalChain = requiresSignatories
    ? normalizeSbrApprovalChain(approvalChain, status === 'pending_signatories')
    : [];

  const record: Omit<SupplementalBudgetRequest, 'id'> = {
    referenceCode,
    eventId: payload.eventId,
    eventTitle: payload.eventTitle,
    eventStartDate: payload.eventStartDate || '',
    organizationId: payload.organizationId || 'sas_admin',
    organizationName: payload.organizationName || 'Student Affairs & Services (SAS)',
    ...(payload.organizationAcronym ? { organizationAcronym: payload.organizationAcronym } : {}),
    isSasInstitutional: Boolean(payload.isSasInstitutional),
    semesterId: payload.semesterId || null,
    schoolYear: payload.schoolYear || null,
    semester: payload.semester || null,
    baseApprovedBudget: Math.max(0, Number(payload.baseApprovedBudget) || 0),
    priorSupplementalTotal: Math.max(0, Number(payload.priorSupplementalTotal) || 0),
    reasonCategory: payload.reasonCategory || 'other',
    justification: payload.justification.trim(),
    additionalItems: payload.additionalItems,
    requestedAmount,
    supportingAttachments: payload.supportingAttachments || [],
    fundingSource: payload.fundingSource,
    allocations: normalizedAllocations,
    ...(miscIds[0] ? { miscFeeBucketId: miscIds[0], miscFeeBucketIds: miscIds } : {}),
    ...(miscNames[0] ? { miscFeeBucketName: miscNames.join(' + '), miscFeeBucketNames: miscNames } : {}),
    requiresSignatories,
    status,
    isPendingSasVetting,
    submittedByOfficer: actor.role === 'officer',
    creatorUid: actor.uid,
    creatorName: actor.name,
    ...(actor.email ? { creatorEmail: actor.email } : {}),
    creatorRole: actor.role === 'signatory' ? 'admin' : actor.role,
    adviserReview,
    ...(status === 'for_adviser_review' ? { submittedToAdviserAt: serverTimestamp() } : {}),
    ...(status === 'for_sas_review' || status === 'pending_signatories' ? { submittedToSasAt: serverTimestamp() } : {}),
    sasVettedBy:
      actor.role === 'admin' && payload.submitImmediately
        ? { uid: actor.uid, name: actor.name, vettedAt: nowIso }
        : null,
    approvalChain,
    currentStepIndex: 0,
    currentStageIndex: 1,
    ...(pipelineSource ? { pipelineSource } : {}),
    isReturned: false,
    ledgerDeducted: false,
    revisionCount: 0,
    history,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(
    collection(db, SUPPLEMENTAL_BUDGET_COLLECTION),
    sanitizeFirestorePayload(record)
  );
  const created: SupplementalBudgetRequest = { id: docRef.id, ...record };

  // If SAS submitted with 0 signatories required, finalize immediately
  if (status === 'approved') {
    await finalizeApprovedSupplementalBudget(docRef.id, actor);
  } else {
    await syncParentEventSupplementalRollup(payload.eventId);
  }

  try {
    await logAuditEvent({
      action: 'SUPPLEMENTAL_BUDGET_CREATED',
      actionType: 'CREATE',
      details: `${actor.name} created Supplemental Budget Request ${referenceCode} (+₱${requestedAmount.toLocaleString()}) for "${payload.eventTitle}" [${status}].`,
      performedBy: actor.name,
      userRole: actor.role,
      targetId: docRef.id,
      targetName: `${referenceCode} – ${payload.eventTitle}`,
    });
  } catch {}

  if (status === 'for_adviser_review') {
    await notifyAdviserForSbrReview({
      sbrId: docRef.id,
      eventId: payload.eventId,
      eventTitle: payload.eventTitle,
      referenceCode,
      requestedAmount,
      organizationId: record.organizationId,
      organizationName: record.organizationName,
      actor,
    });
  } else if (status === 'for_sas_review') {
    await notifySasForSbrReview({
      sbrId: docRef.id,
      eventId: payload.eventId,
      eventTitle: payload.eventTitle,
      referenceCode,
      requestedAmount,
      organizationId: record.organizationId,
      organizationName: record.organizationName,
      actor,
    });
  } else if (status === 'pending_signatories') {
    await notifySignatoriesForSbrStage({
      sbrId: docRef.id,
      eventId: payload.eventId,
      eventTitle: payload.eventTitle,
      referenceCode,
      requestedAmount,
      organizationId: record.organizationId,
      organizationName: record.organizationName,
      approvalChain,
      stageIndex: 1,
      actor,
    });
  }

  return created;
}

/**
 * Updates a Draft or Returned Supplemental Budget Request and optionally resubmits it.
 */
export async function updateSupplementalBudgetRequest(
  sbrId: string,
  payload: Partial<CreateSupplementalBudgetPayload> & { submitImmediately?: boolean },
  actor: SbrActor
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  const nextItems = payload.additionalItems ?? current.additionalItems;
  const requestedAmount = computeSupplementalItemsTotal(nextItems);
  const fundingSource = payload.fundingSource ?? current.fundingSource;
  const requiresSignatories = doesSbrRequireSignatories(fundingSource, current.isSasInstitutional);
  const normalizedAllocations = normalizeSbrAllocations(
    fundingSource,
    payload.allocations ?? current.allocations,
    requestedAmount,
    current.organizationId,
    current.organizationName
  );
  const miscIds = normalizedAllocations.filter((a) => a.fundType === 'misc_fee').map((a) => a.bucketId);
  const miscNames = normalizedAllocations.filter((a) => a.fundType === 'misc_fee').map((a) => a.bucketName);

  let approvalChain = payload.approvalChain ?? current.approvalChain ?? [];
  if (requiresSignatories && approvalChain.length === 0) {
    const resolved = await resolveDefaultSbrPipelineFromParentAp({
      eventId: current.eventId,
      isSasInstitutional: current.isSasInstitutional,
    });
    approvalChain = resolved.chain;
  }

  let nextStatus = current.status;
  let isPendingSasVetting = current.isPendingSasVetting;
  const nextHistory = [...(current.history || [])];
  const wasReturned = current.status === 'for_revision' || Boolean(current.isReturned);

  if (payload.submitImmediately) {
    if (actor.role === 'officer') {
      nextStatus = 'for_adviser_review';
      isPendingSasVetting = false;
      nextHistory.push(
        makeHistoryEntry(
          wasReturned ? 'resubmitted' : 'submitted_to_adviser',
          actor,
          wasReturned
            ? 'Revised and resubmitted to Club Adviser for review.'
            : 'Submitted to Club Adviser for review.'
        )
      );
    } else if (actor.role === 'adviser') {
      nextStatus = 'for_sas_review';
      isPendingSasVetting = requiresSignatories;
      nextHistory.push(
        makeHistoryEntry('resubmitted', actor, 'Revised and forwarded to SAS by Club Adviser.')
      );
    } else {
      nextStatus = requiresSignatories && approvalChain.length > 0 ? 'pending_signatories' : 'approved';
      isPendingSasVetting = false;
      nextHistory.push(
        makeHistoryEntry('resubmitted', actor, 'Revised and resubmitted by SAS Admin.')
      );
    }
  }

  approvalChain = requiresSignatories
    ? normalizeSbrApprovalChain(
        restoreDemotedApproversOnRevision(approvalChain),
        nextStatus === 'pending_signatories'
      )
    : [];

  const patch: Record<string, any> = {
    reasonCategory: payload.reasonCategory ?? current.reasonCategory ?? 'other',
    justification: (payload.justification ?? current.justification).trim(),
    additionalItems: nextItems,
    requestedAmount,
    supportingAttachments: payload.supportingAttachments ?? current.supportingAttachments ?? [],
    fundingSource,
    allocations: normalizedAllocations,
    miscFeeBucketId: miscIds[0] || null,
    miscFeeBucketIds: miscIds,
    miscFeeBucketName: miscNames.join(' + ') || null,
    miscFeeBucketNames: miscNames,
    requiresSignatories,
    approvalChain,
    currentStepIndex: 0,
    currentStageIndex: 1,
    status: nextStatus,
    isPendingSasVetting,
    isReturned: payload.submitImmediately ? false : current.isReturned,
    ...(payload.submitImmediately && wasReturned ? { revisionCount: (current.revisionCount || 0) + 1 } : {}),
    ...(nextStatus === 'for_adviser_review' ? { adviserReview: { status: 'pending' }, submittedToAdviserAt: serverTimestamp() } : {}),
    ...(nextStatus === 'for_sas_review' || nextStatus === 'pending_signatories' ? { submittedToSasAt: serverTimestamp() } : {}),
    history: nextHistory,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId), sanitizeFirestorePayload(patch));

  if (nextStatus === 'approved') {
    await finalizeApprovedSupplementalBudget(sbrId, actor);
  } else {
    await syncParentEventSupplementalRollup(current.eventId);
  }

  if (payload.submitImmediately) {
    if (nextStatus === 'for_adviser_review') {
      await notifyAdviserForSbrReview({
        sbrId,
        eventId: current.eventId,
        eventTitle: current.eventTitle,
        referenceCode: current.referenceCode,
        requestedAmount,
        organizationId: current.organizationId,
        organizationName: current.organizationName,
        actor,
        isResubmission: wasReturned,
      });
    } else if (nextStatus === 'for_sas_review') {
      await notifySasForSbrReview({
        sbrId,
        eventId: current.eventId,
        eventTitle: current.eventTitle,
        referenceCode: current.referenceCode,
        requestedAmount,
        organizationId: current.organizationId,
        organizationName: current.organizationName,
        actor,
        isResubmission: wasReturned,
      });
    } else if (nextStatus === 'pending_signatories') {
      await notifySignatoriesForSbrStage({
        sbrId,
        eventId: current.eventId,
        eventTitle: current.eventTitle,
        referenceCode: current.referenceCode,
        requestedAmount,
        organizationId: current.organizationId,
        organizationName: current.organizationName,
        approvalChain,
        stageIndex: 1,
        actor,
      });
    }
  }
}

/**
 * Club Adviser Checker Action 1: Approve & Forward Officer SBR to SAS.
 */
export async function approveAndForwardSbrByAdviser(
  sbrId: string,
  adviser: SbrActor,
  remarks?: string
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');
  await assertAdviserCanApproveForOrg(current.organizationId, adviser);

  const nowIso = new Date().toISOString();
  const auditCtx = await resolveAdviserActorAuditContext(current.organizationId, adviser);
  const isPendingSasVetting = current.requiresSignatories;
  const nextHistory = [
    ...(current.history || []),
    makeHistoryEntry(
      'adviser_approved',
      adviser,
      remarks ||
        (current.requiresSignatories
          ? `Approved by ${auditCtx.roleTitleLabel} and forwarded to SAS for Misc Fee vetting.`
          : `Approved by ${auditCtx.roleTitleLabel} and forwarded to SAS for direct approval.`)
    ),
  ];

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'for_sas_review',
      isPendingSasVetting,
      isReturned: false,
      adviserReview: {
        status: 'approved',
        reviewedByUid: adviser.uid,
        reviewedByName: adviser.name,
        reviewedByEmail: adviser.email,
        reviewedByAdviserRole: auditCtx.reviewedByAdviserRole,
        ...(auditCtx.actingOnBehalfOfName ? { actingOnBehalfOfName: auditCtx.actingOnBehalfOfName } : {}),
        reviewedAt: nowIso,
        remarks: remarks || '',
        ...(adviser.signatureUrl ? { signatureUrl: adviser.signatureUrl } : {}),
      },
      submittedToSasAt: serverTimestamp(),
      history: nextHistory,
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);

  await notifySasForSbrReview({
    sbrId,
    eventId: current.eventId,
    eventTitle: current.eventTitle,
    referenceCode: current.referenceCode,
    requestedAmount: current.requestedAmount,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    actor: adviser,
    forwardedByAdviser: true,
  });

  await notifyOrgForSbrStatus({
    sbrId,
    eventId: current.eventId,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    type: 'document_approved',
    title: `Supplemental Budget Endorsed by Adviser: ${current.eventTitle}`,
    message: `${adviser.name} endorsed ${current.referenceCode} (+₱${current.requestedAmount.toLocaleString()}) and forwarded it to SAS for approval.`,
    actor: adviser,
  });
}

/**
 * Club Adviser Checker Action 2: Return Officer SBR for Revision (stays hidden from SAS & Signatories).
 */
export async function returnSbrByAdviser(
  sbrId: string,
  adviser: SbrActor,
  remarks: string
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');
  await assertAdviserCanApproveForOrg(current.organizationId, adviser);

  const nowIso = new Date().toISOString();
  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'for_revision',
      isReturned: true,
      returnedByRole: 'adviser',
      returnedByName: adviser.name,
      returnedRemarks: remarks.trim(),
      returnedAt: serverTimestamp(),
      adviserReview: {
        status: 'returned',
        reviewedByUid: adviser.uid,
        reviewedByName: adviser.name,
        reviewedByEmail: adviser.email,
        reviewedAt: nowIso,
        remarks: remarks.trim(),
      },
      history: [
        ...(current.history || []),
        makeHistoryEntry('adviser_returned', adviser, remarks.trim()),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);

  await notifyOrgForSbrStatus({
    sbrId,
    eventId: current.eventId,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    type: 'document_returned',
    title: `Supplemental Budget Returned by Adviser: ${current.eventTitle}`,
    message: remarks?.trim()
      ? `${adviser.name} returned ${current.referenceCode} for revision: "${remarks.trim()}"`
      : `${adviser.name} returned ${current.referenceCode} for revision.`,
    actor: adviser,
    isUrgent: true,
  });
}

/**
 * Club Adviser Checker Action 3: Reject Officer SBR (parent event remains untouched).
 */
export async function rejectSbrByAdviser(
  sbrId: string,
  adviser: SbrActor,
  reason: string
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');
  await assertAdviserCanApproveForOrg(current.organizationId, adviser);

  const nowIso = new Date().toISOString();
  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'rejected',
      isReturned: false,
      rejectedByRole: 'adviser',
      rejectedByName: adviser.name,
      rejectionReason: reason.trim(),
      rejectedAt: serverTimestamp(),
      adviserReview: {
        status: 'rejected',
        reviewedByUid: adviser.uid,
        reviewedByName: adviser.name,
        reviewedByEmail: adviser.email,
        reviewedAt: nowIso,
        remarks: reason.trim(),
      },
      history: [
        ...(current.history || []),
        makeHistoryEntry('adviser_rejected', adviser, reason.trim()),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);

  await notifyOrgForSbrStatus({
    sbrId,
    eventId: current.eventId,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    type: 'document_rejected',
    title: `Supplemental Budget Rejected by Adviser: ${current.eventTitle}`,
    message: `${adviser.name} rejected ${current.referenceCode}: "${reason.trim()}"`,
    actor: adviser,
    isUrgent: true,
  });
}

/**
 * SAS Admin Action (Direct Approval for `organization_funds`):
 * Approves directly, encumbers Club Treasury delta, and rolls up onto parent event.
 */
export async function approveSbrBySasDirect(
  sbrId: string,
  admin: SbrActor,
  remarks?: string
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  const nextHistory = [
    ...(current.history || []),
    makeHistoryEntry('sas_approved', admin, remarks || 'Directly approved by SAS Admin.'),
  ];

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      sasVettedBy: {
        uid: admin.uid,
        name: admin.name,
        vettedAt: new Date().toISOString(),
        ...(remarks ? { remarks } : {}),
      },
      history: nextHistory,
      updatedAt: serverTimestamp(),
    })
  );

  await finalizeApprovedSupplementalBudget(sbrId, admin, {
    ...current,
    history: nextHistory,
  });
}

/**
 * SAS Admin Vetting Gate Action (for `school_budget` Misc Fee):
 * Endorses and releases the SBR to the Institutional Signatories Portal.
 */
export async function endorseAndForwardSbrBySas(
  sbrId: string,
  admin: SbrActor,
  remarks?: string,
  customChain?: ProposalApprovalStep[]
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  let chain = customChain && customChain.length > 0 ? customChain : current.approvalChain || [];
  if (chain.length === 0) {
    const resolved = await resolveDefaultSbrPipelineFromParentAp({
      eventId: current.eventId,
      isSasInstitutional: current.isSasInstitutional,
    });
    chain = resolved.chain;
  }

  chain = normalizeSbrApprovalChain(chain, true);

  // If no institutional signatories exist in system, finalize directly so workflow never deadlocks
  if (chain.length === 0) {
    await approveSbrBySasDirect(sbrId, admin, remarks || 'Vetted & approved by SAS (no configured signatories).');
    return;
  }

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'pending_signatories',
      isPendingSasVetting: false,
      isReturned: false,
      approvalChain: chain,
      currentStepIndex: 0,
      currentStageIndex: 1,
      sasVettedBy: {
        uid: admin.uid,
        name: admin.name,
        vettedAt: new Date().toISOString(),
        ...(remarks ? { remarks } : {}),
      },
      history: [
        ...(current.history || []),
        makeHistoryEntry(
          'sas_endorsed',
          admin,
          remarks || 'Vetted by SAS Admin and forwarded to Institutional Signatories.'
        ),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);

  await notifySignatoriesForSbrStage({
    sbrId,
    eventId: current.eventId,
    eventTitle: current.eventTitle,
    referenceCode: current.referenceCode,
    requestedAmount: current.requestedAmount,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    approvalChain: chain,
    stageIndex: 1,
    actor: admin,
  });

  await notifyOrgForSbrStatus({
    sbrId,
    eventId: current.eventId,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    type: 'document_approved',
    title: `Supplemental Budget Endorsed by SAS: ${current.eventTitle}`,
    message: `${admin.name} (SAS) vetted ${current.referenceCode} (+₱${current.requestedAmount.toLocaleString()}) and forwarded it to Institutional Signatories.`,
    actor: admin,
  });
}

/**
 * SAS Admin Action: Return SBR for revision.
 */
export async function returnSbrBySas(
  sbrId: string,
  admin: SbrActor,
  remarks: string
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'for_revision',
      isPendingSasVetting: false,
      isReturned: true,
      returnedByRole: 'sas',
      returnedByName: admin.name,
      returnedRemarks: remarks.trim(),
      returnedAt: serverTimestamp(),
      history: [
        ...(current.history || []),
        makeHistoryEntry('sas_returned', admin, remarks.trim()),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);

  await notifyOrgForSbrStatus({
    sbrId,
    eventId: current.eventId,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    type: 'document_returned',
    title: `Supplemental Budget Returned by SAS: ${current.eventTitle}`,
    message: remarks?.trim()
      ? `${admin.name} (SAS) returned ${current.referenceCode} for revision: "${remarks.trim()}"`
      : `${admin.name} (SAS) returned ${current.referenceCode} for revision.`,
    actor: admin,
    isUrgent: true,
  });
}

/**
 * SAS Admin Action: Reject SBR.
 */
export async function rejectSbrBySas(
  sbrId: string,
  admin: SbrActor,
  reason: string
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'rejected',
      isPendingSasVetting: false,
      isReturned: false,
      rejectedByRole: 'sas',
      rejectedByName: admin.name,
      rejectionReason: reason.trim(),
      rejectedAt: serverTimestamp(),
      history: [
        ...(current.history || []),
        makeHistoryEntry('sas_rejected', admin, reason.trim()),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);

  await notifyOrgForSbrStatus({
    sbrId,
    eventId: current.eventId,
    organizationId: current.organizationId,
    organizationName: current.organizationName,
    type: 'document_rejected',
    title: `Supplemental Budget Rejected by SAS: ${current.eventTitle}`,
    message: `${admin.name} (SAS) rejected ${current.referenceCode}: "${reason.trim()}"`,
    actor: admin,
    isUrgent: true,
  });
}

/**
 * Institutional Signatory Action: Approve, Endorse & Forward, Return, or Reject the current step.
 * Uses an atomic Firestore transaction to enforce Runtime Single-Approval Governance (Option A):
 * - First Approver to click `approve` finalizes the SBR immediately and auto-demotes all other
 *   unsigned Approvers to `Noted by:` (`actionType: 'endorse'`, `demotedFromApprover: true`).
 * - Approver clicking `forward` marks themselves `Endorsed by:` and keeps downstream/peer Approvers active.
 */
export async function processSbrSignatoryDecision(
  sbrId: string,
  signatory: SbrActor,
  decision: 'approve' | 'forward' | 'return' | 'reject',
  remarks?: string
): Promise<{
  isFullyApproved: boolean;
  wasCoercedByPriorApproval?: boolean;
  approvedBySignatoryName?: string;
}> {
  const sbrRef = doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId);
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  if (decision === 'return') {
    const chain = restoreDemotedApproversOnRevision([...(current.approvalChain || [])]);
    const activeStage = current.currentStageIndex ?? 1;
    const hasStages = chain.some((s) => typeof s.stageIndex === 'number');
    const matchedIdx = chain.findIndex((s: any) => {
      const isSigned = s.status === 'approved' || s.status === 'endorsed' || s.status === 'waived';
      if (isSigned) return false;
      if (hasStages && (s.stageIndex ?? 1) !== activeStage) return false;
      return matchesSbrSignatoryStep(s, signatory);
    });
    const stepIdx = matchedIdx >= 0 ? matchedIdx : (current.currentStepIndex ?? 0);
    if (chain[stepIdx]) {
      chain[stepIdx] = {
        ...chain[stepIdx],
        status: 'returned' as any,
        remarks: remarks?.trim() || '',
      };
    }
    await updateDoc(
      sbrRef,
      sanitizeFirestorePayload({
        status: 'for_revision',
        isReturned: true,
        returnedByRole: 'signatory',
        returnedByName: signatory.name,
        returnedRemarks: (remarks || '').trim(),
        returnedAt: serverTimestamp(),
        approvalChain: chain,
        history: [
          ...(current.history || []),
          makeHistoryEntry('signatory_returned', signatory, (remarks || '').trim()),
        ],
        updatedAt: serverTimestamp(),
      })
    );
    await syncParentEventSupplementalRollup(current.eventId);
    await notifyOrgForSbrStatus({
      sbrId,
      eventId: current.eventId,
      organizationId: current.organizationId,
      organizationName: current.organizationName,
      type: 'document_returned',
      title: `Supplemental Budget Returned by Signatory: ${current.eventTitle}`,
      message: remarks?.trim()
        ? `${signatory.name} returned ${current.referenceCode} for revision: "${remarks.trim()}"`
        : `${signatory.name} returned ${current.referenceCode} for revision.`,
      actor: signatory,
      isUrgent: true,
    });
    return { isFullyApproved: false };
  }

  if (decision === 'reject') {
    const chain = [...(current.approvalChain || [])];
    const activeStage = current.currentStageIndex ?? 1;
    const hasStages = chain.some((s) => typeof s.stageIndex === 'number');
    const matchedIdx = chain.findIndex((s: any) => {
      const isSigned = s.status === 'approved' || s.status === 'endorsed' || s.status === 'waived';
      if (isSigned) return false;
      if (hasStages && (s.stageIndex ?? 1) !== activeStage) return false;
      return matchesSbrSignatoryStep(s, signatory);
    });
    const stepIdx = matchedIdx >= 0 ? matchedIdx : (current.currentStepIndex ?? 0);
    if (chain[stepIdx]) {
      chain[stepIdx] = {
        ...chain[stepIdx],
        status: 'rejected' as any,
        remarks: remarks?.trim() || '',
      };
    }
    await updateDoc(
      sbrRef,
      sanitizeFirestorePayload({
        status: 'rejected',
        isReturned: false,
        rejectedByRole: 'signatory',
        rejectedByName: signatory.name,
        rejectionReason: (remarks || '').trim(),
        rejectedAt: serverTimestamp(),
        approvalChain: chain,
        history: [
          ...(current.history || []),
          makeHistoryEntry('signatory_rejected', signatory, (remarks || '').trim()),
        ],
        updatedAt: serverTimestamp(),
      })
    );
    await syncParentEventSupplementalRollup(current.eventId);
    await notifyOrgForSbrStatus({
      sbrId,
      eventId: current.eventId,
      organizationId: current.organizationId,
      organizationName: current.organizationName,
      type: 'document_rejected',
      title: `Supplemental Budget Rejected by Signatory: ${current.eventTitle}`,
      message: `${signatory.name} rejected ${current.referenceCode}: "${(remarks || '').trim()}"`,
      actor: signatory,
      isUrgent: true,
    });
    return { isFullyApproved: false };
  }

  // decision === 'approve' | 'forward' -> atomic transaction (with quota-safe cache fallback)
  const buildDecisionMutation = (docData: SupplementalBudgetRequest) => {
    const chain = [...(docData.approvalChain || [])];
    const activeStage = docData.currentStageIndex ?? 1;
    const hasStages = chain.some((s) => typeof s.stageIndex === 'number');
    const priorApprovedStep = findApprovedStep(chain);
    const wasAlreadyApproved = Boolean(priorApprovedStep) || docData.status === 'approved';
    const isStepDone = (s: any) => s && (s.status === 'approved' || s.status === 'endorsed' || s.status === 'waived');

    let stepIdx = chain.findIndex((s: any) => {
      if (isStepDone(s)) return false;
      if (!wasAlreadyApproved && hasStages && (s.stageIndex ?? 1) !== activeStage) return false;
      return matchesSbrSignatoryStep(s, signatory);
    });
    if (stepIdx === -1) {
      stepIdx = docData.currentStepIndex ?? 0;
    }
    if (stepIdx < 0 || stepIdx >= chain.length) {
      throw new Error('No pending approval step found for your account on this Supplemental Budget Request.');
    }

    const targetStep = chain[stepIdx];
    const capabilities = resolveSignatoryDecisionCapabilities({
      chain,
      myStepIndex: stepIdx,
      signatory,
      docType: 'proposal',
    });

    let newStatus: 'endorsed' | 'approved' = 'endorsed';
    let wasCoercedByPriorApproval = false;

    if (capabilities.isAlreadyApproved || wasAlreadyApproved) {
      newStatus = 'endorsed';
      wasCoercedByPriorApproval = decision === 'approve';
    } else if (capabilities.canApprove) {
      if (decision === 'forward') {
        if (!capabilities.canEndorseInsteadOfApprove) {
          throw new Error(
            'You are the last remaining Approver in this pipeline and cannot endorse without granting approval. Please click Approve.'
          );
        }
        newStatus = 'endorsed';
      } else {
        newStatus = 'approved';
      }
    } else {
      newStatus = 'endorsed';
    }

    const nowIso = new Date().toISOString();
    const signerAttr = resolveSignerAttribution(signatory);
    let updatedStep: any = {
      ...targetStep,
      status: newStatus,
      signedAt: nowIso,
      signedByUid: signerAttr.signerUid || signatory.uid,
      signedByName: signerAttr.signerName || signatory.name,
      signatoryName: signerAttr.signerName || signatory.name,
      ...(signerAttr.signerEmail || signatory.email ? { signedByEmail: signerAttr.signerEmail || signatory.email, signatoryEmail: signerAttr.signerEmail || signatory.email } : {}),
      ...(signerAttr.actedAsSubstitute
        ? {
            roleTitle: signerAttr.signerRoleTitle,
            actedAsSubstitute: true,
            originalSignatoryUid: signerAttr.originalSignatoryUid || targetStep.signatoryUid || '',
            originalSignatoryName: signerAttr.originalSignatoryName || targetStep.signatoryName || '',
            originalSignatoryEmail: signerAttr.originalSignatoryEmail || targetStep.signatoryEmail || '',
          }
        : {}),
      ...(signatory.signatureUrl ? { signatureUrl: signatory.signatureUrl } : {}),
      ...(remarks ? { remarks: remarks.trim() } : {}),
    };

    if (newStatus === 'approved') {
      updatedStep.actionType = 'approve';
      updatedStep.signatoryLabel = 'Approved by:';
    } else if (capabilities.canApprove && decision === 'forward') {
      updatedStep = applySelfEndorseDemotion(updatedStep, 'Endorsed by:');
    } else if ((capabilities.isAlreadyApproved || wasAlreadyApproved) && targetStep.actionType === 'approve') {
      updatedStep.actionType = 'endorse';
      updatedStep.signatoryLabel = 'Noted by:';
      updatedStep.demotedFromApprover = true;
      updatedStep.demotedReason = 'already_approved';
      if (capabilities.approvedBySignatoryName) {
        updatedStep.demotedBySignatoryName = capabilities.approvedBySignatoryName;
      }
    }

    chain[stepIdx] = updatedStep;

    let workingChain = chain;
    if (newStatus === 'approved') {
      workingChain = applySingleApprovalDemotion(chain, stepIdx, {
        demotedLabel: 'Noted by:',
        activateWaitingSteps: true,
      });
    } else if (newStatus === 'endorsed' && capabilities.canApprove) {
      workingChain = chain.map((s, idx) =>
        (s.stageIndex ?? 1) === activeStage && idx !== stepIdx && s.status === 'waiting'
          ? { ...s, status: 'current' as any }
          : s
      );
    }

    const allStepsDone = workingChain.every(isStepDone);
    const isFullyApproved = wasAlreadyApproved || newStatus === 'approved' || allStepsDone;

    let nextStage = activeStage;
    let nextStepIdx = stepIdx;

    if (!allStepsDone) {
      if (hasStages) {
        const stageComplete = workingChain
          .filter((s) => (s.stageIndex ?? 1) === activeStage)
          .every(isStepDone);
        if (stageComplete) {
          const remainingStages = workingChain
            .filter((s) => !isStepDone(s))
            .map((s) => s.stageIndex ?? 1)
            .sort((a, b) => a - b);
          nextStage = remainingStages[0] ?? activeStage + 1;
          workingChain = workingChain.map((s) =>
            (s.stageIndex ?? 1) === nextStage && !isStepDone(s)
              ? { ...s, status: 'current' as any }
              : s
          );
        }
        const firstUnsigned = workingChain.findIndex((s) => !isStepDone(s));
        nextStepIdx = firstUnsigned >= 0 ? firstUnsigned : stepIdx;
      } else {
        nextStepIdx = Math.min(workingChain.length - 1, stepIdx + 1);
        if (workingChain[nextStepIdx] && !isStepDone(workingChain[nextStepIdx])) {
          workingChain[nextStepIdx] = { ...workingChain[nextStepIdx], status: 'current' as any };
        }
      }
    }

    const nextHistory = [
      ...(docData.history || []),
      makeHistoryEntry(
        'signatory_signed',
        signatory,
        remarks?.trim() ||
          (newStatus === 'approved'
            ? `Final approval granted by ${signatory.name}.`
            : capabilities.isDemotedToEndorserOnly || wasCoercedByPriorApproval
            ? `Noted by ${signatory.name} (already approved).`
            : `Endorsed by ${signatory.name}.`)
      ),
    ];

    const payload = sanitizeFirestorePayload({
      approvalChain: workingChain,
      currentStepIndex: nextStepIdx,
      currentStageIndex: nextStage,
      history: nextHistory,
      updatedAt: serverTimestamp(),
    });

    const projectedSbr: SupplementalBudgetRequest = {
      ...docData,
      approvalChain: workingChain,
      currentStepIndex: nextStepIdx,
      currentStageIndex: nextStage,
      history: nextHistory,
    };

    return {
      payload,
      projectedSbr,
      isFullyApproved,
      wasAlreadyApproved,
      wasCoercedByPriorApproval,
      approvedBySignatoryName: capabilities.approvedBySignatoryName,
    };
  };

  let txResult: {
    projectedSbr: SupplementalBudgetRequest;
    isFullyApproved: boolean;
    wasAlreadyApproved: boolean;
    wasCoercedByPriorApproval: boolean;
    approvedBySignatoryName?: string;
  };

  try {
    txResult = await runTransaction(db, async (tx) => {
      const snap = await tx.get(sbrRef);
      if (!snap.exists()) throw new Error('Supplemental Budget Request not found.');
      const docData = { id: snap.id, ...(snap.data() as any) } as SupplementalBudgetRequest;
      const computed = buildDecisionMutation(docData);
      tx.update(sbrRef, computed.payload);
      return {
        projectedSbr: computed.projectedSbr,
        isFullyApproved: computed.isFullyApproved,
        wasAlreadyApproved: computed.wasAlreadyApproved,
        wasCoercedByPriorApproval: computed.wasCoercedByPriorApproval,
        approvedBySignatoryName: computed.approvedBySignatoryName,
      };
    });
  } catch (err: any) {
    if (!isFirestoreQuotaError(err)) {
      throw err;
    }
    console.warn('[sbr.service] runTransaction hit Firestore quota; falling back to direct updateDoc:', err);
    const computed = buildDecisionMutation(current);
    await updateDoc(sbrRef, computed.payload);
    txResult = {
      projectedSbr: computed.projectedSbr,
      isFullyApproved: computed.isFullyApproved,
      wasAlreadyApproved: computed.wasAlreadyApproved,
      wasCoercedByPriorApproval: computed.wasCoercedByPriorApproval,
      approvedBySignatoryName: computed.approvedBySignatoryName,
    };
  }

  if (txResult.isFullyApproved && !txResult.wasAlreadyApproved) {
    await finalizeApprovedSupplementalBudget(sbrId, signatory, txResult.projectedSbr);
  } else if (!txResult.isFullyApproved && txResult.projectedSbr.currentStageIndex !== current.currentStageIndex) {
    await notifySignatoriesForSbrStage({
      sbrId,
      eventId: current.eventId,
      eventTitle: current.eventTitle,
      referenceCode: current.referenceCode,
      requestedAmount: current.requestedAmount,
      organizationId: current.organizationId,
      organizationName: current.organizationName,
      approvalChain: txResult.projectedSbr.approvalChain || [],
      stageIndex: txResult.projectedSbr.currentStageIndex ?? 1,
      actor: signatory,
    });
  }

  return {
    isFullyApproved: txResult.isFullyApproved,
    wasCoercedByPriorApproval: txResult.wasCoercedByPriorApproval,
    approvedBySignatoryName: txResult.approvedBySignatoryName,
  };
}

/**
 * Finalizes an approved Supplemental Budget Request:
 * 1. Marks the SBR `approved` while deferring fund deduction & FL reflection until release:
 *    - `organization_funds`: waits for Officer/Adviser acknowledgment & deduction in Finance Center.
 *    - `school_budget` / `retained_sao_fund`: waits for dedicated Supplemental Disbursement Voucher upload.
 * 2. Syncs parent event rollup status flags (`hasPendingSupplementalDisbursement`).
 */
export async function finalizeApprovedSupplementalBudget(
  sbrId: string,
  approver: SbrActor,
  preloadedSbr?: SupplementalBudgetRequest
): Promise<void> {
  const sbr = preloadedSbr || (await getSupplementalBudgetById(sbrId));
  if (!sbr) throw new Error('Supplemental Budget Request not found.');

  const isOrgFunds = sbr.fundingSource === 'organization_funds';
  const alreadyDeducted = Boolean(sbr.ledgerDeducted);

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'approved',
      isPendingSasVetting: false,
      isReturned: false,
      ledgerDeducted: alreadyDeducted,
      requiresClubLedgerAcknowledgment: isOrgFunds && !alreadyDeducted,
      requiresSupplementalVoucher: !isOrgFunds && !alreadyDeducted,
      approvedAt: serverTimestamp(),
      approvedBy: approver.name,
      history: [
        ...(sbr.history || []),
        makeHistoryEntry(
          'approved',
          approver,
          isOrgFunds
            ? `Approved (+₱${sbr.requestedAmount.toLocaleString()}). Acknowledge & deduct in Officer Finance Center to release funds into Financial Liquidation.`
            : `Approved (+₱${sbr.requestedAmount.toLocaleString()}). Upload the dedicated Supplemental Disbursement Voucher to deduct funds and reflect in Financial Liquidation.`
        ),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(sbr.eventId);

  try {
    await logAuditEvent({
      action: 'SUPPLEMENTAL_BUDGET_APPROVED',
      actionType: 'UPDATE',
      details: `Approved Supplemental Budget ${sbr.referenceCode} (+₱${sbr.requestedAmount.toLocaleString()}) for "${sbr.eventTitle}" via ${sbr.fundingSource} (awaiting ${isOrgFunds ? 'Finance Center acknowledgment' : 'Supplemental Disbursement Voucher'}).`,
      performedBy: approver.name,
      userRole: approver.role,
      targetId: sbr.id,
      targetName: `${sbr.referenceCode} – ${sbr.eventTitle}`,
    });
  } catch {}

  await notifyOrgForSbrStatus({
    sbrId: sbr.id,
    eventId: sbr.eventId,
    organizationId: sbr.organizationId,
    organizationName: sbr.organizationName,
    type: 'document_approved',
    title: `Supplemental Budget Approved: ${sbr.eventTitle}`,
    message: isOrgFunds
      ? `${sbr.referenceCode} (+₱${sbr.requestedAmount.toLocaleString()}) is approved! Go to Finance Center to acknowledge and deduct from Club Treasury so it reflects in Financial Liquidation.`
      : `${sbr.referenceCode} (+₱${sbr.requestedAmount.toLocaleString()}) is approved! Upload its dedicated Supplemental Disbursement Voucher to deduct funds and reflect in Financial Liquidation.`,
    actor: approver,
  });
}

/**
 * Club Treasury Acknowledgment (Finance Center):
 * Explicitly acknowledges an approved `organization_funds` Supplemental Budget Request,
 * idempotently deducts the supplemental amount from `organization_ledger`, and rolls up
 * the funds onto the parent event so they now reflect in Financial Liquidation (FL).
 */
export async function acknowledgeAndDeductOrgSupplementalBudget(
  sbrId: string,
  actor: SbrActor
): Promise<string | null> {
  const sbr = await getSupplementalBudgetById(sbrId);
  if (!sbr) throw new Error('Supplemental Budget Request not found.');
  if (sbr.status !== 'approved') {
    throw new Error('Only approved Supplemental Budget Requests can be deducted from the Club Ledger.');
  }
  if (sbr.fundingSource !== 'organization_funds') {
    throw new Error('Only Club Treasury (organization_funds) supplemental budgets use Finance Center acknowledgment.');
  }

  const ledgerId = await deductSupplementalBudget({
    sbrId: sbr.id,
    referenceCode: sbr.referenceCode,
    eventId: sbr.eventId,
    eventTitle: sbr.eventTitle,
    organizationId: sbr.organizationId,
    organizationName: sbr.organizationName,
    isSasInstitutional: false,
    amount: sbr.requestedAmount,
    semesterId: sbr.semesterId,
    schoolYear: sbr.schoolYear || undefined,
    semester: sbr.semester || undefined,
    performedBy: actor.name,
  });

  const deductionKeys = Array.from(
    new Set([...(sbr.ledgerDeductionKeys || []), ...(ledgerId ? [`org_ledger:${ledgerId}`] : [])])
  );

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      ledgerDeducted: true,
      requiresClubLedgerAcknowledgment: false,
      ledgerAcknowledgedBy: actor.name,
      ledgerAcknowledgedAt: serverTimestamp(),
      ledgerDeductionKeys: deductionKeys,
      history: [
        ...(sbr.history || []),
        makeHistoryEntry(
          'approved',
          actor,
          `Acknowledged in Finance Center and deducted ₱${sbr.requestedAmount.toLocaleString()} from Club Treasury Ledger.`
        ),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(sbr.eventId);

  return ledgerId;
}

/**
 * Withdraws an unapproved Supplemental Budget Request.
 */
export async function withdrawSupplementalBudgetRequest(
  sbrId: string,
  actor: SbrActor,
  reason = 'Withdrawn by proponent'
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');
  if (current.status === 'approved') {
    throw new Error('Cannot withdraw an already approved Supplemental Budget Request.');
  }

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'withdrawn',
      isPendingSasVetting: false,
      isReturned: false,
      withdrawnAt: serverTimestamp(),
      withdrawnBy: actor.name,
      withdrawReason: reason,
      history: [
        ...(current.history || []),
        makeHistoryEntry('withdrawn', actor, reason),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);
}

/**
 * Attaches a dedicated Supplemental Disbursement Voucher on an approved `school_budget`
 * or `retained_sao_fund` SBR, deducts the Misc Fee bucket / Retained Fund idempotently,
 * and syncs the parent event rollup so the supplemental funds now reflect in Financial Liquidation.
 */
export async function attachSupplementalDisbursementVoucher(
  sbrId: string,
  voucher: Omit<SupplementalVoucherRecord, 'attachedBy' | 'attachedByUid' | 'attachedAt'>,
  actor: SbrActor
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');
  if (current.status !== 'approved') {
    throw new Error('Only approved Supplemental Budget Requests can attach a Disbursement Voucher.');
  }

  const fullVoucher: SupplementalVoucherRecord = {
    ...voucher,
    mode: 'separate',
    disbursedAmount: voucher.disbursedAmount ?? current.requestedAmount,
    attachedBy: actor.name,
    attachedByUid: actor.uid,
    attachedAt: new Date().toISOString(),
  };

  const deductionKeys: string[] = [...(current.ledgerDeductionKeys || [])];
  let ledgerDeductedNow = Boolean(current.ledgerDeducted);

  // Trigger fund deduction strictly upon uploading the dedicated Supplemental Disbursement Voucher
  if (!ledgerDeductedNow && current.requestedAmount > 0) {
    if (current.fundingSource === 'retained_sao_fund') {
      const ledgerId = await deductSupplementalBudget({
        sbrId: current.id,
        referenceCode: current.referenceCode,
        eventId: current.eventId,
        eventTitle: current.eventTitle,
        organizationId: 'sas',
        organizationName: 'Student Affairs & Services (SAS)',
        isSasInstitutional: true,
        amount: current.requestedAmount,
        semesterId: current.semesterId,
        schoolYear: current.schoolYear || undefined,
        semester: current.semester || undefined,
        performedBy: actor.name,
      });
      if (ledgerId) deductionKeys.push(`sao_ledger:${ledgerId}`);

      await deductRetainedFundOnProposalApproval({
        eventId: current.eventId,
        eventTitle: `${current.eventTitle} (Supplemental ${current.referenceCode})`,
        amount: current.requestedAmount,
        organizationId: 'sas',
        schoolYear: current.schoolYear || undefined,
        semester: current.semester || undefined,
        performedBy: actor.name,
        ledgerDocIdOverride: `sbr_${current.id}`,
      });
      deductionKeys.push(`retained:sbr_${current.id}`);
      ledgerDeductedNow = true;
    } else if (current.fundingSource === 'school_budget') {
      const miscAllocs = (current.allocations || []).filter((a) => a.fundType === 'misc_fee');
      const bucketIds = miscAllocs.map((a) => a.bucketId).filter(Boolean);
      const primaryBucketId = bucketIds[0] || current.miscFeeBucketId || '';
      const bucketName =
        miscAllocs.map((a) => a.bucketName).filter(Boolean).join(' + ') || current.miscFeeBucketName || '';

      if (primaryBucketId || bucketName) {
        await deductMiscFeeBucketOnDisbursement({
          eventId: current.eventId,
          eventTitle: `${current.eventTitle} (Supplemental ${current.referenceCode})`,
          bucketId: primaryBucketId,
          bucketIds,
          bucketAllocations: miscAllocs.map((a) => ({
            bucketId: a.bucketId,
            bucketName: a.bucketName,
            availableAmount: a.availableAmount,
            allocatedAmount: a.allocatedAmount,
          })),
          bucketName,
          amount: current.requestedAmount,
          schoolYear: current.schoolYear || undefined,
          semester: current.semester || undefined,
          chequeNumber: voucher.chequeNumber || undefined,
          performedBy: actor.name,
          ledgerDocIdOverride: `sbr_${current.id}`,
        });
        deductionKeys.push(`misc:sbr_${current.id}`);
      }

      if (current.isSasInstitutional) {
        const ledgerId = await deductSupplementalBudget({
          sbrId: current.id,
          referenceCode: current.referenceCode,
          eventId: current.eventId,
          eventTitle: current.eventTitle,
          organizationId: 'sas',
          organizationName: 'Student Affairs & Services (SAS)',
          isSasInstitutional: true,
          amount: current.requestedAmount,
          semesterId: current.semesterId,
          schoolYear: current.schoolYear || undefined,
          semester: current.semester || undefined,
          performedBy: actor.name,
        });
        if (ledgerId) deductionKeys.push(`sao_ledger:${ledgerId}`);
      }
      ledgerDeductedNow = true;
    }
  } else if (current.fundingSource === 'school_budget' && voucher.chequeNumber) {
    // Already deducted previously: sync cheque number metadata onto the existing Misc Fee ledger entry
    try {
      const miscLedgerRef = doc(db, MISC_FEE_LEDGER_COLLECTION, `sbr_${sbrId}`);
      const miscSnap = await getDocSafe(miscLedgerRef);
      if (miscSnap.exists()) {
        await updateDoc(miscLedgerRef, {
          chequeNumber: voucher.chequeNumber,
        });
      }
    } catch {}
  }

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      disbursementVoucher: fullVoucher,
      ledgerDeducted: ledgerDeductedNow,
      requiresSupplementalVoucher: false,
      ledgerDeductionKeys: Array.from(new Set(deductionKeys)),
      history: [
        ...(current.history || []),
        makeHistoryEntry(
          'voucher_attached',
          actor,
          `Attached Supplemental Disbursement Voucher ${voucher.chequeNumber || voucher.voucherNumber || ''} and deducted ₱${current.requestedAmount.toLocaleString()}.`
        ),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await syncParentEventSupplementalRollup(current.eventId);
}

/**
 * Helper exposed for Liquidation to merge parent allocations with approved SBR allocations.
 */
export function resolveMergedEventAllocations(
  baseAllocations: ProposalBucketAllocation[],
  approvedSbrs: SupplementalBudgetRequest[]
): ProposalBucketAllocation[] {
  const suppAllocs = (approvedSbrs || [])
    .filter((s) => s && !s.isDeleted && s.status === 'approved')
    .flatMap((s) => s.allocations || []);
  return mergeBaseAndSupplementalAllocations(baseAllocations, suppAllocs);
}
