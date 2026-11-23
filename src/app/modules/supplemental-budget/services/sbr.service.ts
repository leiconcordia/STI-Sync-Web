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
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import { logAuditEvent } from '../../audit/services/audit.service';
import { createNotification } from '../../notifications/services/notification.service';
import { getInstitutionalSignatories } from '../../signatories/services/signatory.service';
import { isSignatoryApplicableTo } from '../../signatories/types/signatory.types';
import { deductSupplementalBudget } from '../../finance/services/finance.service';
import { deductMiscFeeBucketOnDisbursement } from '../../finance/services/misc-fee.service';
import { deductRetainedFundOnProposalApproval } from '../../finance/services/retained-fund.service';
import type { ProposalApprovalStep, ProposalBucketAllocation } from '../../activity-proposals/types/proposal.types';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import {
  buildSbrReferenceCode,
  computeSupplementalItemsTotal,
  doesSbrRequireSignatories,
  IN_FLIGHT_SBR_STATUSES,
  mergeBaseAndSupplementalAllocations,
} from '../utils/sbr-validation.utils';
import type {
  CreateSupplementalBudgetPayload,
  SupplementalBudgetRequest,
  SupplementalEventAllocation,
  SupplementalHistoryEntry,
  SupplementalVoucherRecord,
} from '../types/sbr.types';

export const SUPPLEMENTAL_BUDGET_COLLECTION = 'supplemental_budget_requests';
const EVENTS_COLLECTION = 'events';
const PROPOSALS_COLLECTION = 'activity_proposals';

export interface SbrActor {
  uid: string;
  name: string;
  email?: string;
  role: 'officer' | 'adviser' | 'admin' | 'signatory';
  roleTitle?: string;
  signatureUrl?: string;
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
 * Generates a default sequential institutional signatory chain for School Budget / SAS SBRs.
 */
export async function generateDefaultSbrSignatoryChain(
  signatoriesOverride?: InstitutionalSignatory[]
): Promise<ProposalApprovalStep[]> {
  const all = signatoriesOverride || (await getInstitutionalSignatories());
  const activeProposalSigners = all.filter(
    (s) => s.isActive !== false && isSignatoryApplicableTo(s, 'proposal')
  );

  // Order: non-approvers (endorsers like Program Head / Academic Head / School Admin) first, final approvers (President) last
  const roleOrder = (role: string, canApprove?: boolean) => {
    const r = String(role || '').toLowerCase();
    if (canApprove || r === 'school_president' || r.includes('president')) return 99;
    if (r === 'school_admin' || r.includes('admin')) return 40;
    if (r === 'academic_head' || r.includes('academic')) return 30;
    if (r === 'program_head' || r.includes('program')) return 20;
    return 10;
  };

  const sorted = [...activeProposalSigners].sort(
    (a, b) => roleOrder(a.role, a.canApproveProposal) - roleOrder(b.role, b.canApproveProposal)
  );

  return sorted.map((s, idx) => ({
    id: `sbr_step_${idx + 1}_${s.id}`,
    step: idx + 1,
    stageIndex: idx + 1,
    role: s.role,
    roleTitle: s.roleTitle || s.role,
    actionType: s.canApproveProposal || s.actionType === 'approve' ? 'approve' : 'endorse',
    signatoryLabel: s.defaultSignatoryLabel || (s.canApproveProposal ? 'Approved by' : 'Endorsed by'),
    signatoryUid: s.uid || s.id,
    signatoryName: s.name,
    signatoryEmail: s.email,
    status: 'pending' as const,
  }));
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
  const snap = await getDocs(q);
  const allSbrs = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }) as SupplementalBudgetRequest)
    .filter((s) => !s.isDeleted);

  const approvedSbrs = allSbrs.filter((s) => s.status === 'approved');
  const hasPending = allSbrs.some((s) => IN_FLIGHT_SBR_STATUSES.has(s.status));
  const supplementalBudgetTotal = Math.round(
    approvedSbrs.reduce((sum, s) => sum + Math.max(0, Number(s.requestedAmount) || 0), 0) * 100
  ) / 100;

  const supplementalAllocations: SupplementalEventAllocation[] = [];
  let hasSupplementalSchoolBudget = false;
  approvedSbrs.forEach((s) => {
    if (s.fundingSource === 'school_budget') hasSupplementalSchoolBudget = true;
    (s.allocations || []).forEach((a) => {
      supplementalAllocations.push({
        ...a,
        sbrId: s.id,
        sbrReferenceCode: s.referenceCode,
      });
    });
  });

  const syncDoc = async (collectionName: string) => {
    const ref = doc(db, collectionName, eventId);
    const evSnap = await getDoc(ref);
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
      approvedSupplementalCount: approvedSbrs.length,
      hasPendingSupplementalRequest: hasPending,
      hasSupplementalSchoolBudget,
      updatedAt: serverTimestamp(),
    };

    // If originally zero_budget / liquidation-exempt and now has approved supplemental funds, un-exempt automatically
    if (effectiveApprovedBudget > 0 && (evData.liquidationRequired === false || evData.fundingSource === 'zero_budget')) {
      patch.liquidationRequired = true;
      if (!evData.liquidationStatus || evData.liquidationStatus === 'none_required') {
        patch.liquidationStatus = 'pending';
      }
    }

    await updateDoc(ref, sanitizeFirestorePayload(patch));
  };

  await Promise.all([syncDoc(EVENTS_COLLECTION), syncDoc(PROPOSALS_COLLECTION)]);
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
  const snap = await getDoc(doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId));
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
  if (requiresSignatories && approvalChain.length === 0) {
    approvalChain = await generateDefaultSbrSignatoryChain();
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
    reasonCategory: payload.reasonCategory,
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

  if (status === 'for_sas_review') {
    try {
      await createNotification({
        recipientRole: 'admin',
        title: 'Supplemental Budget Request Submitted',
        message: `${payload.organizationName} submitted ${referenceCode} (+₱${requestedAmount.toLocaleString()}) for "${payload.eventTitle}".`,
        type: 'proposal',
        relatedId: payload.eventId,
      });
    } catch {}
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
    approvalChain = await generateDefaultSbrSignatoryChain();
  }
  // Reset any rejected/returned step statuses back to pending on resubmission
  if (payload.submitImmediately && approvalChain.length > 0) {
    approvalChain = approvalChain.map((step) => ({
      ...step,
      status: 'pending' as const,
      signedAt: undefined,
      signatureUrl: undefined,
      remarks: undefined,
    }));
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

  const patch: Record<string, any> = {
    reasonCategory: payload.reasonCategory ?? current.reasonCategory,
    justification: (payload.justification ?? current.justification).trim(),
    additionalItems: nextItems,
    requestedAmount,
    supportingAttachments: payload.supportingAttachments ?? current.supportingAttachments,
    fundingSource,
    allocations: normalizedAllocations,
    miscFeeBucketId: miscIds[0] || null,
    miscFeeBucketIds: miscIds,
    miscFeeBucketName: miscNames.join(' + ') || null,
    miscFeeBucketNames: miscNames,
    requiresSignatories,
    approvalChain,
    currentStepIndex: 0,
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

  const nowIso = new Date().toISOString();
  const isPendingSasVetting = current.requiresSignatories;
  const nextHistory = [
    ...(current.history || []),
    makeHistoryEntry(
      'adviser_approved',
      adviser,
      remarks ||
        (current.requiresSignatories
          ? 'Approved by Club Adviser and forwarded to SAS for Misc Fee vetting.'
          : 'Approved by Club Adviser and forwarded to SAS for direct approval.')
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

  try {
    await createNotification({
      recipientRole: 'admin',
      title: 'Supplemental Budget Forwarded by Adviser',
      message: `${adviser.name} endorsed ${current.referenceCode} (+₱${current.requestedAmount.toLocaleString()}) for "${current.eventTitle}".`,
      type: 'proposal',
      relatedId: current.eventId,
    });
  } catch {}
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

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      sasVettedBy: {
        uid: admin.uid,
        name: admin.name,
        vettedAt: new Date().toISOString(),
        ...(remarks ? { remarks } : {}),
      },
      history: [
        ...(current.history || []),
        makeHistoryEntry('sas_approved', admin, remarks || 'Directly approved by SAS Admin.'),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  await finalizeApprovedSupplementalBudget(sbrId, admin);
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
    chain = await generateDefaultSbrSignatoryChain();
  }

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
}

/**
 * Institutional Signatory Action: Sign/Approve, Return, or Reject the current sequential step.
 */
export async function processSbrSignatoryDecision(
  sbrId: string,
  signatory: SbrActor,
  decision: 'approve' | 'return' | 'reject',
  remarks?: string
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  const chain = [...(current.approvalChain || [])];
  const stepIdx = current.currentStepIndex ?? 0;
  const nowIso = new Date().toISOString();

  if (decision === 'return') {
    if (chain[stepIdx]) {
      chain[stepIdx] = {
        ...chain[stepIdx],
        status: 'returned' as any,
        remarks: remarks?.trim() || '',
      };
    }
    await updateDoc(
      doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
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
    return;
  }

  if (decision === 'reject') {
    if (chain[stepIdx]) {
      chain[stepIdx] = {
        ...chain[stepIdx],
        status: 'rejected',
        remarks: remarks?.trim() || '',
      };
    }
    await updateDoc(
      doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
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
    return;
  }

  // decision === 'approve'
  if (chain[stepIdx]) {
    chain[stepIdx] = {
      ...chain[stepIdx],
      status: 'approved',
      signedAt: nowIso,
      signedByUid: signatory.uid,
      signedByName: signatory.name,
      ...(signatory.email ? { signedByEmail: signatory.email } : {}),
      ...(signatory.signatureUrl ? { signatureUrl: signatory.signatureUrl } : {}),
      ...(remarks ? { remarks: remarks.trim() } : {}),
    } as any;
  }

  const nextIdx = stepIdx + 1;
  const isFinalStep = nextIdx >= chain.length;

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      approvalChain: chain,
      currentStepIndex: isFinalStep ? stepIdx : nextIdx,
      history: [
        ...(current.history || []),
        makeHistoryEntry(
          'signatory_signed',
          signatory,
          remarks?.trim() ||
            (isFinalStep
              ? `Final approval granted by ${signatory.name}.`
              : `Endorsed by ${signatory.name}.`)
        ),
      ],
      updatedAt: serverTimestamp(),
    })
  );

  if (isFinalStep) {
    await finalizeApprovedSupplementalBudget(sbrId, signatory);
  }
}

/**
 * Finalizes an approved Supplemental Budget Request:
 * 1. Idempotently deducts the supplemental delta from the exact funding ledger/bucket(s)
 *    using unique `sbr_${sbrId}` keys so it never collides with the parent AP deduction.
 * 2. Marks the SBR `approved` and `ledgerDeducted: true`.
 * 3. Rolls up additive supplemental totals & allocations onto the parent event doc.
 */
export async function finalizeApprovedSupplementalBudget(
  sbrId: string,
  approver: SbrActor
): Promise<void> {
  const sbr = await getSupplementalBudgetById(sbrId);
  if (!sbr) throw new Error('Supplemental Budget Request not found.');

  const deductionKeys: string[] = [...(sbr.ledgerDeductionKeys || [])];

  if (!sbr.ledgerDeducted && sbr.requestedAmount > 0) {
    if (sbr.fundingSource === 'organization_funds') {
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
        performedBy: approver.name,
      });
      if (ledgerId) deductionKeys.push(`org_ledger:${ledgerId}`);
    } else if (sbr.fundingSource === 'retained_sao_fund') {
      const ledgerId = await deductSupplementalBudget({
        sbrId: sbr.id,
        referenceCode: sbr.referenceCode,
        eventId: sbr.eventId,
        eventTitle: sbr.eventTitle,
        organizationId: 'sas',
        organizationName: 'Student Affairs & Services (SAS)',
        isSasInstitutional: true,
        amount: sbr.requestedAmount,
        semesterId: sbr.semesterId,
        schoolYear: sbr.schoolYear || undefined,
        semester: sbr.semester || undefined,
        performedBy: approver.name,
      });
      if (ledgerId) deductionKeys.push(`sao_ledger:${ledgerId}`);

      await deductRetainedFundOnProposalApproval({
        eventId: sbr.eventId,
        eventTitle: `${sbr.eventTitle} (Supplemental ${sbr.referenceCode})`,
        amount: sbr.requestedAmount,
        organizationId: 'sas',
        schoolYear: sbr.schoolYear || undefined,
        semester: sbr.semester || undefined,
        performedBy: approver.name,
        ledgerDocIdOverride: `sbr_${sbr.id}`,
      });
      deductionKeys.push(`retained:sbr_${sbr.id}`);
    } else if (sbr.fundingSource === 'school_budget') {
      const miscAllocs = (sbr.allocations || []).filter((a) => a.fundType === 'misc_fee');
      const bucketIds = miscAllocs.map((a) => a.bucketId).filter(Boolean);
      const primaryBucketId = bucketIds[0] || sbr.miscFeeBucketId || '';
      const bucketName =
        miscAllocs.map((a) => a.bucketName).filter(Boolean).join(' + ') || sbr.miscFeeBucketName || '';

      if (primaryBucketId || bucketName) {
        await deductMiscFeeBucketOnDisbursement({
          eventId: sbr.eventId,
          eventTitle: `${sbr.eventTitle} (Supplemental ${sbr.referenceCode})`,
          bucketId: primaryBucketId,
          bucketIds,
          bucketAllocations: miscAllocs.map((a) => ({
            bucketId: a.bucketId,
            bucketName: a.bucketName,
            availableAmount: a.availableAmount,
            allocatedAmount: a.allocatedAmount,
          })),
          bucketName,
          amount: sbr.requestedAmount,
          schoolYear: sbr.schoolYear || undefined,
          semester: sbr.semester || undefined,
          performedBy: approver.name,
          ledgerDocIdOverride: `sbr_${sbr.id}`,
        });
        deductionKeys.push(`misc:sbr_${sbr.id}`);
      }

      // If SAS institutional event, also record in sao_ledger
      if (sbr.isSasInstitutional) {
        const ledgerId = await deductSupplementalBudget({
          sbrId: sbr.id,
          referenceCode: sbr.referenceCode,
          eventId: sbr.eventId,
          eventTitle: sbr.eventTitle,
          organizationId: 'sas',
          organizationName: 'Student Affairs & Services (SAS)',
          isSasInstitutional: true,
          amount: sbr.requestedAmount,
          semesterId: sbr.semesterId,
          schoolYear: sbr.schoolYear || undefined,
          semester: sbr.semester || undefined,
          performedBy: approver.name,
        });
        if (ledgerId) deductionKeys.push(`sao_ledger:${ledgerId}`);
      }
    }
  }

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      status: 'approved',
      isPendingSasVetting: false,
      isReturned: false,
      ledgerDeducted: true,
      ledgerDeductionKeys: Array.from(new Set(deductionKeys)),
      approvedAt: serverTimestamp(),
      approvedBy: approver.name,
      history: [
        ...(sbr.history || []),
        makeHistoryEntry(
          'approved',
          approver,
          `Approved (+₱${sbr.requestedAmount.toLocaleString()}) and encumbered from ${sbr.fundingSource.replace(/_/g, ' ')}.`
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
      details: `Approved Supplemental Budget ${sbr.referenceCode} (+₱${sbr.requestedAmount.toLocaleString()}) for "${sbr.eventTitle}" via ${sbr.fundingSource}.`,
      performedBy: approver.name,
      userRole: approver.role,
      targetId: sbr.id,
      targetName: `${sbr.referenceCode} – ${sbr.eventTitle}`,
    });
  } catch {}
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
 * Attaches a Supplemental Disbursement Voucher (or marks bundled with primary voucher)
 * on an approved `school_budget` SBR before Financial Liquidation.
 */
export async function attachSupplementalDisbursementVoucher(
  sbrId: string,
  voucher: Omit<SupplementalVoucherRecord, 'attachedBy' | 'attachedByUid' | 'attachedAt'>,
  actor: SbrActor
): Promise<void> {
  const current = await getSupplementalBudgetById(sbrId);
  if (!current) throw new Error('Supplemental Budget Request not found.');

  const fullVoucher: SupplementalVoucherRecord = {
    ...voucher,
    disbursedAmount: voucher.disbursedAmount ?? current.requestedAmount,
    attachedBy: actor.name,
    attachedByUid: actor.uid,
    attachedAt: new Date().toISOString(),
  };

  await updateDoc(
    doc(db, SUPPLEMENTAL_BUDGET_COLLECTION, sbrId),
    sanitizeFirestorePayload({
      disbursementVoucher: fullVoucher,
      history: [
        ...(current.history || []),
        makeHistoryEntry(
          'voucher_attached',
          actor,
          voucher.mode === 'bundled_with_primary'
            ? 'Marked supplemental funds as bundled with primary Disbursement Voucher.'
            : `Attached Supplemental Disbursement Voucher ${voucher.voucherNumber || voucher.chequeNumber || ''}.`
        ),
      ],
      updatedAt: serverTimestamp(),
    })
  );
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
