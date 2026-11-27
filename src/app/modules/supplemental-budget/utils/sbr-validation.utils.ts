/**
 * src/app/modules/supplemental-budget/utils/sbr-validation.utils.ts
 *
 * Pure, testable business rules for Pre-Implementation Supplemental Budget Requests (SBR):
 * - Eligibility & Option A strict pre-implementation cutoff validation
 * - Permitted funding source governance (blocks student_contributions & zero_budget)
 * - Routing flags (Adviser Gate, SAS Direct vs. SAS Vetting + Institutional Signatories)
 * - Effective approved budget computation & multi-bucket allocation merging for Liquidation
 */

import type {
  FinancialLineItem,
  FinancialProjections,
  ProposalApprovalStep,
  ProposalBucketAllocation,
} from '../../activity-proposals/types/proposal.types';
import type {
  SupplementalBudgetRequest,
  SupplementalEventExpenseItem,
  SupplementalExpenseItem,
  SupplementalFundingSource,
} from '../types/sbr.types';

function validateMiscBucketSplits(
  allocations: ProposalBucketAllocation[],
  targetTotal: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(allocations) || allocations.length === 0) {
    errors.push('Please select at least one Miscellaneous Fee bucket to fund this supplemental request.');
    return { valid: false, errors };
  }
  let sum = 0;
  for (const alloc of allocations) {
    const amt = Math.max(0, Number(alloc.allocatedAmount) || 0);
    if (amt <= 0) {
      errors.push(`Enter an allocation amount greater than ₱0.00 for "${alloc.bucketName || alloc.bucketId}".`);
    }
    if (alloc.availableAmount !== undefined && amt > Number(alloc.availableAmount) + 0.009) {
      errors.push(
        `Allocation for "${alloc.bucketName || alloc.bucketId}" (₱${amt.toLocaleString()}) exceeds its available balance (₱${Number(alloc.availableAmount).toLocaleString()}).`
      );
    }
    sum += amt;
  }
  if (Math.abs(sum - targetTotal) > 0.01) {
    errors.push(
      `Total Misc Fee bucket allocations (₱${sum.toLocaleString()}) must equal the requested supplemental amount (₱${targetTotal.toLocaleString()}).`
    );
  }
  return { valid: errors.length === 0, errors };
}

export const ACTIVE_SBR_STATUSES = new Set([
  'draft',
  'for_adviser_review',
  'for_revision',
  'approved_by_adviser',
  'for_sas_review',
  'pending_signatories',
]);

export const IN_FLIGHT_SBR_STATUSES = new Set([
  'for_adviser_review',
  'for_revision',
  'approved_by_adviser',
  'for_sas_review',
  'pending_signatories',
]);

export const APPROVED_EVENT_STATUSES = new Set([
  'approved',
  'approved_president',
  'activated',
  'published',
  'upcoming',
  'ongoing',
]);

export const BLOCKING_LIQUIDATION_STATUSES = new Set([
  'for_adviser_review',
  'submitted',
  'pending',
  'pending_review',
  'under_review',
  'returned',
  'returned_for_revision',
  'for_revision',
  'approved',
  'settled',
  'completed',
]);

/**
 * Returns the original (base) approved budget of an event before any supplemental addendums.
 */
export function getEventBaseApprovedBudget(event: any): number {
  if (!event) return 0;
  if (typeof event.originalApprovedBudget === 'number' && !Number.isNaN(event.originalApprovedBudget)) {
    return Math.max(0, Math.round(event.originalApprovedBudget * 100) / 100);
  }
  const base =
    Number(event.totalApprovedBudget) ||
    Number(event.approvedBudget) ||
    Number(event.financialProjections?.totalExpenses) ||
    Number(event.budget) ||
    0;
  return Math.max(0, Math.round(base * 100) / 100);
}

/**
 * Returns the sum of all approved supplemental budgets rolled up onto an event.
 */
export function getEventSupplementalBudgetTotal(
  event: any,
  sbrList?: SupplementalBudgetRequest[]
): number {
  if (Array.isArray(sbrList)) {
    const sum = sbrList
      .filter((s) => s && !s.isDeleted && s.status === 'approved')
      .reduce((acc, s) => acc + Math.max(0, Number(s.requestedAmount) || 0), 0);
    return Math.round(sum * 100) / 100;
  }
  const rolled = Number(event?.supplementalBudgetTotal) || 0;
  return Math.max(0, Math.round(rolled * 100) / 100);
}

/**
 * Returns the effective approved budget (Original Base AP Budget + Approved Supplemental Budgets).
 */
export function getEventEffectiveApprovedBudget(
  event: any,
  sbrList?: SupplementalBudgetRequest[]
): number {
  if (!event) return 0;
  if (Array.isArray(sbrList)) {
    const base = getEventBaseApprovedBudget(event);
    const supp = getEventSupplementalBudgetTotal(event, sbrList);
    return Math.round((base + supp) * 100) / 100;
  }
  if (typeof event.effectiveApprovedBudget === 'number' && event.effectiveApprovedBudget > 0) {
    return Math.round(event.effectiveApprovedBudget * 100) / 100;
  }
  const base = getEventBaseApprovedBudget(event);
  const supp = getEventSupplementalBudgetTotal(event);
  return Math.round((base + supp) * 100) / 100;
}

/**
 * Parses a date or YYYY-MM-DD + optional HH:mm string into a local Date instance.
 */
function parseDateAndTime(dateVal: any, timeStr?: string | null): Date | null {
  if (!dateVal) return null;
  if (typeof dateVal?.toDate === 'function') {
    const d = dateVal.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (dateVal instanceof Date) {
    return Number.isNaN(dateVal.getTime()) ? null : dateVal;
  }
  const raw = String(dateVal).trim();
  if (!raw) return null;

  // Match YYYY-MM-DD
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]) - 1;
    const day = Number(ymd[3]);
    let hours = 0;
    let minutes = 0;
    if (timeStr && typeof timeStr === 'string') {
      const hm = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
      if (hm) {
        hours = Math.min(23, Math.max(0, Number(hm[1])));
        minutes = Math.min(59, Math.max(0, Number(hm[2])));
      }
    }
    return new Date(year, month, day, hours, minutes, 0, 0);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Extracts the earliest implementation session start Date/Time for an event.
 */
export function getEventStartDateTime(event: any): Date | null {
  if (!event) return null;
  const candidates: Date[] = [];

  if (Array.isArray(event.sessions) && event.sessions.length > 0) {
    for (const s of event.sessions) {
      if (!s) continue;
      const d = parseDateAndTime(s.date || s.startDate || s.sessionDate, s.startTime);
      if (d) candidates.push(d);
    }
  }

  if (candidates.length === 0) {
    const direct =
      parseDateAndTime(event.startDate, event.startTime) ||
      parseDateAndTime(event.eventDate, event.startTime) ||
      parseDateAndTime(event.date, event.startTime);
    if (direct) candidates.push(direct);
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

export interface SbrEligibilityResult {
  eligible: boolean;
  reason?: string;
  code?:
    | 'NOT_APPROVED'
    | 'EVENT_CONCLUDED'
    | 'EVENT_ALREADY_STARTED'
    | 'LIQUIDATION_EXISTS'
    | 'ACTIVE_SBR_PENDING'
    | 'ARCHIVED_OR_DELETED';
  eventStartDate?: Date | null;
  activeSbr?: SupplementalBudgetRequest | null;
}

/**
 * Evaluates whether a new Supplemental Budget Request can be created for an event.
 * Enforces Option A (strict pre-implementation cutoff: before event start date/time & before liquidation).
 */
export function canRequestSupplementalBudget(
  event: any,
  existingSbrs: SupplementalBudgetRequest[] = [],
  existingLiquidations: any[] = [],
  now: Date = new Date()
): SbrEligibilityResult {
  if (!event) {
    return { eligible: false, code: 'NOT_APPROVED', reason: 'Event record not found.' };
  }

  if (event.isDeleted === true || event.isArchived === true) {
    return {
      eligible: false,
      code: 'ARCHIVED_OR_DELETED',
      reason: 'Archived or deleted activities cannot request supplemental funds.',
    };
  }

  // 1. Parent AP must be approved
  const rawStatus = String(event.proposalStatus || event.status || '').trim().toLowerCase();
  if (rawStatus === 'completed' || event.completedAt || event.isConcluded === true) {
    return {
      eligible: false,
      code: 'EVENT_CONCLUDED',
      reason: 'This activity has already concluded. Use Financial Liquidation Deficit Coverage for post-event variances.',
    };
  }
  if (!APPROVED_EVENT_STATUSES.has(rawStatus)) {
    return {
      eligible: false,
      code: 'NOT_APPROVED',
      reason: 'Supplemental budgets can only be requested for Approved activities. Edit the draft/pending proposal directly instead.',
    };
  }

  // 2. Option A: Strict Pre-Implementation Cutoff (before event start date/time)
  const startDt = getEventStartDateTime(event);
  if (startDt && now.getTime() >= startDt.getTime()) {
    return {
      eligible: false,
      code: 'EVENT_ALREADY_STARTED',
      eventStartDate: startDt,
      reason:
        'Supplemental budget requests must be filed before the event implementation start date/time. For post-implementation variances, use Financial Liquidation.',
    };
  }

  // 3. No submitted/returned/approved Financial Liquidation
  const evLiqStatus = String(event.liquidationStatus || '').trim().toLowerCase();
  if (BLOCKING_LIQUIDATION_STATUSES.has(evLiqStatus)) {
    return {
      eligible: false,
      code: 'LIQUIDATION_EXISTS',
      reason: 'Cannot request additional funds once Financial Liquidation has been initiated or approved.',
    };
  }
  const hasBlockingLiq = (existingLiquidations || []).some((liq) => {
    if (!liq || liq.isDeleted === true) return false;
    if (liq.eventId && event.id && liq.eventId !== event.id) return false;
    const lSt = String(liq.status || '').trim().toLowerCase();
    return BLOCKING_LIQUIDATION_STATUSES.has(lSt);
  });
  if (hasBlockingLiq) {
    return {
      eligible: false,
      code: 'LIQUIDATION_EXISTS',
      reason: 'Cannot request additional funds because a Financial Liquidation is already in progress or approved.',
    };
  }

  // 4. Concurrency lock: At most 1 active (non-finalized) SBR per event
  const activeSbr = (existingSbrs || []).find(
    (s) => s && !s.isDeleted && ACTIVE_SBR_STATUSES.has(String(s.status || '').toLowerCase())
  );
  if (activeSbr) {
    return {
      eligible: false,
      code: 'ACTIVE_SBR_PENDING',
      activeSbr,
      reason: `Supplemental request ${activeSbr.referenceCode} is currently active (${activeSbr.status.replace(/_/g, ' ')}). Resolve or withdraw it before filing another request.`,
    };
  }

  return { eligible: true, eventStartDate: startDt };
}

/**
 * Returns true if any in-flight SBR should temporarily lock Financial Liquidation submission.
 */
export function hasBlockingPendingSbrForLiquidation(
  event: any,
  eventSbrs?: SupplementalBudgetRequest[]
): boolean {
  if (Array.isArray(eventSbrs)) {
    return eventSbrs.some(
      (s) => s && !s.isDeleted && IN_FLIGHT_SBR_STATUSES.has(String(s.status || '').toLowerCase())
    );
  }
  return Boolean(event?.hasPendingSupplementalRequest);
}

/**
 * Permitted supplemental funding sources by creator/activity type.
 * Strictly blocks `student_contributions` and `zero_budget`.
 */
export function getPermittedSupplementalFundingSources(
  isSasInstitutional: boolean
): SupplementalFundingSource[] {
  if (isSasInstitutional) {
    return ['school_budget', 'retained_sao_fund'];
  }
  return ['organization_funds', 'school_budget'];
}

/**
 * Checks whether a funding source is allowed for a supplemental budget request.
 */
export function isFundingSourcePermittedForSbr(
  source: string,
  isSasInstitutional: boolean
): source is SupplementalFundingSource {
  const permitted = getPermittedSupplementalFundingSources(isSasInstitutional);
  return permitted.includes(source as SupplementalFundingSource);
}

/**
 * Determines whether an SBR requires Institutional Signatory Portal approvals.
 * - Club `organization_funds` -> Direct SAS Approval (false)
 * - Any `school_budget` (Misc Fee) -> Requires SAS Vetting + Institutional Signatories (true)
 * - SAS Institutional `retained_sao_fund` -> Requires Institutional Signatories (true)
 */
export function doesSbrRequireSignatories(
  fundingSource: SupplementalFundingSource,
  isSasInstitutional: boolean
): boolean {
  if (fundingSource === 'school_budget') return true;
  if (fundingSource === 'retained_sao_fund' && isSasInstitutional) return true;
  return false;
}

/**
 * Merges base Activity Proposal bucket allocations with approved Supplemental Budget allocations
 * by `bucketId` (summing `allocatedAmount` for matching buckets and appending new cross-source buckets).
 * Used by `resolveLiquidationSourceAllocations` so Financial Liquidation automatically settles
 * both same-source and cross-source supplemental top-ups.
 */
export function mergeBaseAndSupplementalAllocations(
  baseAllocations: ProposalBucketAllocation[] = [],
  supplementalAllocations: ProposalBucketAllocation[] = []
): ProposalBucketAllocation[] {
  const merged = new Map<string, ProposalBucketAllocation>();

  const addEntry = (entry: ProposalBucketAllocation) => {
    if (!entry || !entry.bucketId) return;
    const amt = Math.max(0, Number(entry.allocatedAmount) || 0);
    if (amt <= 0) return;

    const key = `${entry.fundType || 'misc_fee'}::${entry.bucketId}`;
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        allocatedAmount: Math.round((existing.allocatedAmount + amt) * 100) / 100,
        availableAmount:
          entry.availableAmount !== undefined ? entry.availableAmount : existing.availableAmount,
        poolAmount: entry.poolAmount !== undefined ? entry.poolAmount : existing.poolAmount,
      });
    } else {
      merged.set(key, {
        bucketId: entry.bucketId,
        bucketName: entry.bucketName || entry.bucketId,
        fundType: entry.fundType,
        allocatedAmount: Math.round(amt * 100) / 100,
        ...(entry.availableAmount !== undefined ? { availableAmount: entry.availableAmount } : {}),
        ...(entry.poolAmount !== undefined ? { poolAmount: entry.poolAmount } : {}),
      });
    }
  };

  (baseAllocations || []).forEach(addEntry);
  (supplementalAllocations || []).forEach(addEntry);

  return Array.from(merged.values());
}

/**
 * Computes the total amount of supplemental expense line items.
 */
export function computeSupplementalItemsTotal(items: SupplementalExpenseItem[] = []): number {
  const sum = (items || []).reduce((acc, item) => {
    const qty = Math.max(0, Number(item.quantity) || 0);
    const unitCost = Math.max(0, Number(item.unitCost) || 0);
    const lineTotal =
      typeof item.totalAmount === 'number' && !Number.isNaN(item.totalAmount) && item.totalAmount > 0
        ? item.totalAmount
        : qty * unitCost;
    return acc + Math.max(0, lineTotal);
  }, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Generates a readable SBR reference code (e.g., SBR-2026-ITG-001 or SBR-2026-SAS-001).
 */
export function buildSbrReferenceCode(
  orgAcronymOrId: string,
  existingCountForEvent = 0,
  year = new Date().getFullYear()
): string {
  const cleanTag = String(orgAcronymOrId || 'ORG')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6) || 'ORG';
  const seq = String(existingCountForEvent + 1).padStart(3, '0');
  return `SBR-${year}-${cleanTag}-${seq}`;
}

export interface SbrValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a Supplemental Budget Request payload before saving/submitting.
 */
export function validateSbrFormPayload(params: {
  justification: string;
  additionalItems: SupplementalExpenseItem[];
  fundingSource: string;
  allocations: ProposalBucketAllocation[];
  isSasInstitutional: boolean;
  orgTreasuryAvailable?: number;
  saoRetainedAvailable?: number;
  isDraft?: boolean;
}): SbrValidationResult {
  const errors: string[] = [];

  if (!isFundingSourcePermittedForSbr(params.fundingSource, params.isSasInstitutional)) {
    if (params.fundingSource === 'student_contributions') {
      errors.push(
        'Student Contributions cannot be used for Supplemental Budgets after approval/publication. Select Club Treasury or School Budget (Misc Fees) instead.'
      );
    } else {
      errors.push('Please select a permitted Supplemental Funding Source.');
    }
  }

  const total = computeSupplementalItemsTotal(params.additionalItems);

  if (!params.isDraft) {
    if (!params.justification || params.justification.trim().length < 15) {
      errors.push('Please provide a clear justification (at least 15 characters) explaining why additional funds are needed.');
    }

    const validItems = (params.additionalItems || []).filter(
      (i) => i.description?.trim() && (Number(i.totalAmount) > 0 || Number(i.quantity) * Number(i.unitCost) > 0)
    );
    if (validItems.length === 0 || total <= 0) {
      errors.push('Add at least one additional expense line item with an amount greater than ₱0.00.');
    }

    if (params.fundingSource === 'organization_funds') {
      if (
        typeof params.orgTreasuryAvailable === 'number' &&
        total > params.orgTreasuryAvailable + 0.009
      ) {
        errors.push(
          `Insufficient Club Treasury balance: requested ₱${total.toLocaleString()} exceeds available ₱${params.orgTreasuryAvailable.toLocaleString()}.`
        );
      }
    } else if (params.fundingSource === 'retained_sao_fund') {
      if (
        typeof params.saoRetainedAvailable === 'number' &&
        total > params.saoRetainedAvailable + 0.009
      ) {
        errors.push(
          `Insufficient SAO Retained Activity Fund balance: requested ₱${total.toLocaleString()} exceeds available ₱${params.saoRetainedAvailable.toLocaleString()}.`
        );
      }
    } else if (params.fundingSource === 'school_budget') {
      const bucketCheck = validateMiscBucketSplits(params.allocations || [], total);
      if (!bucketCheck.valid) {
        errors.push(...bucketCheck.errors);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const INTERNAL_SAS_OR_ADVISER_ROLES = new Set([
  'sas_head',
  'sas_admin',
  'sas_coordinator',
  'sao_head',
  'sao_admin',
  'adviser',
  'club_adviser',
  'officer',
]);

/**
 * Copies the parent Activity Proposal's configured signatory pipeline for a Supplemental Budget Request:
 * - Preserves the exact institutional signatories, stage grouping (`stageIndex`), and action labels.
 * - Filters out internal SAS/Adviser placeholder rows (since Club Adviser & SAS Vetting already gate SBRs).
 * - Re-indexes `stageIndex` cleanly from 1..N and resets every step to fresh `pending` state.
 */
export function cloneParentApSignatoryPipeline(
  parentRecord: any
): ProposalApprovalStep[] {
  const rawChain: any[] = Array.isArray(parentRecord?.approvalChain)
    ? parentRecord.approvalChain
    : [];
  if (rawChain.length === 0) return [];

  const institutionalSteps = rawChain.filter((step) => {
    if (!step) return false;
    const role = String(step.role || '').trim().toLowerCase();
    const roleTitle = String(step.roleTitle || '').trim().toLowerCase();
    if (INTERNAL_SAS_OR_ADVISER_ROLES.has(role)) return false;
    if (
      !role &&
      (roleTitle.includes('student affairs') ||
        roleTitle === 'sas' ||
        roleTitle === 'sao' ||
        roleTitle.includes('club adviser'))
    ) {
      return false;
    }
    return Boolean(step.signatoryUid || step.signatoryEmail || step.signatoryName || step.roleTitle || step.role);
  });

  if (institutionalSteps.length === 0) return [];

  // Preserve relative stage grouping from parent AP and renumber cleanly from Stage 1..K
  const uniqueStageNumbers = Array.from(
    new Set(
      institutionalSteps.map((s, idx) =>
        typeof s.stageIndex === 'number' && s.stageIndex > 0 ? s.stageIndex : idx + 1
      )
    )
  ).sort((a, b) => a - b);

  const stageRemap = new Map<number, number>();
  uniqueStageNumbers.forEach((origStage, idx) => {
    stageRemap.set(origStage, idx + 1);
  });

  return institutionalSteps.map((s, idx) => {
    const origStage =
      typeof s.stageIndex === 'number' && s.stageIndex > 0 ? s.stageIndex : idx + 1;
    const mappedStage = stageRemap.get(origStage) || idx + 1;
    return {
      id: `sbr_step_${idx + 1}_${s.signatoryUid || s.id || idx}`,
      step: idx + 1,
      stageIndex: mappedStage,
      stageName: `Stage ${mappedStage}`,
      role: s.role || 'program_head',
      roleTitle: s.roleTitle || s.role || 'Signatory',
      actionType: s.actionType || (String(s.role || '').toLowerCase().includes('president') ? 'approve' : 'endorse'),
      ...(s.signatoryLabel ? { signatoryLabel: s.signatoryLabel } : {}),
      ...(s.signatoryUid ? { signatoryUid: s.signatoryUid } : {}),
      ...(s.signatoryName ? { signatoryName: s.signatoryName } : {}),
      ...(s.signatoryEmail ? { signatoryEmail: s.signatoryEmail } : {}),
      ...(s.department ? { department: s.department } : {}),
      status: 'pending' as const,
    } as ProposalApprovalStep;
  });
}

/**
 * Normalizes a custom or copied SBR signatory chain (clean 1..K stageIndex & step numbers)
 * and optionally marks Stage 1 steps as `'current'` when routing begins.
 */
export function normalizeSbrApprovalChain(
  rawChain: ProposalApprovalStep[] = [],
  activateStageOne = false
): ProposalApprovalStep[] {
  const cleaned = (rawChain || []).filter((s) => {
    if (!s) return false;
    const role = String(s.role || '').trim().toLowerCase();
    return !INTERNAL_SAS_OR_ADVISER_ROLES.has(role);
  });
  if (cleaned.length === 0) return [];

  const uniqueStages = Array.from(
    new Set(
      cleaned.map((s, idx) =>
        typeof s.stageIndex === 'number' && s.stageIndex > 0 ? s.stageIndex : idx + 1
      )
    )
  ).sort((a, b) => a - b);

  const stageRemap = new Map<number, number>();
  uniqueStages.forEach((orig, idx) => stageRemap.set(orig, idx + 1));

  return cleaned.map((s, idx) => {
    const origStage =
      typeof s.stageIndex === 'number' && s.stageIndex > 0 ? s.stageIndex : idx + 1;
    const mappedStage = stageRemap.get(origStage) || idx + 1;
    const isStageOne = mappedStage === 1;
    return {
      ...s,
      id: s.id || `sbr_step_${idx + 1}_${s.signatoryUid || idx}`,
      step: idx + 1,
      stageIndex: mappedStage,
      stageName: `Stage ${mappedStage}`,
      status: activateStageOne && isStageOne ? ('current' as any) : ('pending' as const),
      signedAt: undefined,
      signatureUrl: undefined,
      remarks: undefined,
    };
  });
}

/**
 * Checks whether a given signatory step matches the logged-in signatory identity.
 */
export function matchesSbrSignatoryStep(
  step: any,
  actor: {
    uid?: string;
    id?: string;
    email?: string;
    role?: string;
    roleTitle?: string;
    actingAsSubstitute?: boolean;
    delegatedForSignatoryId?: string;
    delegatedForSignatoryUid?: string;
    delegatedForSignatoryEmail?: string;
    delegatedForRoleTitle?: string;
  }
): boolean {
  if (!step || !actor) return false;
  const actorUids = [
    actor.uid,
    actor.id,
    ...(actor.actingAsSubstitute ? [actor.delegatedForSignatoryId, actor.delegatedForSignatoryUid] : []),
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  const stepUid = String(step.signatoryUid || step.signedByUid || '').trim();
  if (stepUid && actorUids.includes(stepUid)) return true;

  const actorEmails = [
    actor.email,
    ...(actor.actingAsSubstitute ? [actor.delegatedForSignatoryEmail] : []),
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  const stepEmail = String(step.signatoryEmail || step.signedByEmail || '').trim().toLowerCase();
  if (stepEmail && actorEmails.includes(stepEmail)) return true;

  if (!stepUid && !stepEmail) {
    const aRole = String(actor.role || '').trim().toLowerCase();
    const sRole = String(step.role || '').trim().toLowerCase();
    if (aRole && sRole && aRole === sRole) return true;
    const candidateTitles = [
      actor.roleTitle,
      ...(actor.actingAsSubstitute ? [actor.delegatedForRoleTitle] : []),
    ]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean);
    const sTitle = String(step.roleTitle || '').trim().toLowerCase();
    if (sTitle && candidateTitles.some((aTitle) => aTitle === sTitle || sTitle.includes(aTitle) || aTitle.includes(sTitle))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true if the logged-in signatory has an active unsigned step in the SBR's current stage
 * (or an open co-sign/Noted slot after another approver granted final approval under Option A).
 */
export function isSignatoryTurnForSbr(
  sbr: Pick<SupplementalBudgetRequest, 'status' | 'approvalChain' | 'currentStageIndex' | 'currentStepIndex'> | null | undefined,
  actor: {
    uid?: string;
    id?: string;
    email?: string;
    role?: string;
    roleTitle?: string;
    actingAsSubstitute?: boolean;
    delegatedForSignatoryId?: string;
    delegatedForSignatoryUid?: string;
    delegatedForSignatoryEmail?: string;
    delegatedForRoleTitle?: string;
  }
): boolean {
  if (!sbr) return false;
  if (sbr.status !== 'pending_signatories' && sbr.status !== 'approved') return false;
  const chain = Array.isArray(sbr.approvalChain) ? sbr.approvalChain : [];
  if (chain.length === 0) return false;

  const isSigned = (s: any) =>
    s && (s.status === 'approved' || s.status === 'endorsed' || s.status === 'waived');

  if (sbr.status === 'approved') {
    // Allow remaining unsigned co-signers / demoted approvers whose step is active ('current') to affix Noted/Endorsed
    return chain.some((s: any) => s && !isSigned(s) && s.status === 'current' && matchesSbrSignatoryStep(s, actor));
  }

  const hasStages = chain.some((s) => typeof s.stageIndex === 'number');
  if (hasStages) {
    const activeStage = sbr.currentStageIndex ?? 1;
    return chain.some((s: any) => {
      const inStage = (s.stageIndex ?? 1) === activeStage;
      return inStage && !isSigned(s) && matchesSbrSignatoryStep(s, actor);
    });
  }

  const currentStep = chain[sbr.currentStepIndex ?? 0];
  return Boolean(currentStep && !isSigned(currentStep) && matchesSbrSignatoryStep(currentStep, actor));
}

export interface LiquidationBaselineCategoryItem {
  id: string;
  title: string;
  baselineAmount: number;
  isSupplemental?: boolean;
  sbrId?: string;
  sbrReferenceCode?: string;
  qtyUnitLabel?: string;
}

/**
 * Returns true ONLY when an approved SBR's funds have actually been released/deducted
 * and are eligible to reflect in Financial Liquidation (FL):
 *  - `organization_funds`: ONLY after Officer/Adviser clicks Acknowledge & Deduct in Finance Center (`ledgerDeducted === true`).
 *  - `school_budget` / `retained_sao_fund`: ONLY after uploading the dedicated Supplemental Disbursement Voucher (`disbursementVoucher` attached + `ledgerDeducted === true`).
 */
export function isSbrDisbursedForLiquidation(
  sbr: Partial<SupplementalBudgetRequest> | null | undefined
): boolean {
  if (!sbr || sbr.isDeleted || sbr.status !== 'approved') return false;
  if (sbr.fundingSource === 'organization_funds') {
    return Boolean(sbr.ledgerDeducted);
  }
  const hasVoucherProof = Boolean(
    sbr.disbursementVoucher &&
      (sbr.disbursementVoucher.attachmentUrl ||
        sbr.disbursementVoucher.chequeNumber ||
        sbr.disbursementVoucher.voucherNumber)
  );
  return Boolean(sbr.ledgerDeducted && hasVoucherProof);
}

const PLACEHOLDER_EXPENSE_TITLES = new Set([
  'expense item',
  'proposed item',
  'proposed item 1',
  'budget item 1',
  'general',
  'other / general expenses',
]);

/**
 * Filters out empty / zero-budget placeholder base rows (e.g., Non-Monetary APs that saved
 * a dummy "Expense Item" row with ₱0) so Financial Liquidation never renders duplicate General tabs.
 */
export function filterMeaningfulBaseLiquidationItems(
  baseItems: LiquidationBaselineCategoryItem[] = [],
  isZeroBudgetBase: boolean = false
): LiquidationBaselineCategoryItem[] {
  if (isZeroBudgetBase) return [];
  return (baseItems || []).filter((item) => {
    if (!item) return false;
    const amt = Number(item.baselineAmount) || 0;
    const normTitle = String(item.title || '').trim().toLowerCase();
    if (amt <= 0 && (!normTitle || PLACEHOLDER_EXPENSE_TITLES.has(normTitle))) {
      return false;
    }
    return amt > 0 || Boolean(normTitle);
  });
}

/**
 * Merges original AP baseline items with disbursed/acknowledged Supplemental Budget line items
 * for Financial Liquidation's "Proposed Budget Baseline Categories (Reference Guide)".
 * Deduplicates identical item titles by appending the SBR reference code only on collision.
 */
export function mergeLiquidationBaselineWithSupplementalItems(
  baseItems: LiquidationBaselineCategoryItem[] = [],
  approvedSbrs: SupplementalBudgetRequest[] = [],
  fallbackRolledItems: SupplementalEventExpenseItem[] = [],
  options?: { isZeroBudgetBase?: boolean }
): LiquidationBaselineCategoryItem[] {
  const cleanedBase = filterMeaningfulBaseLiquidationItems(
    baseItems,
    Boolean(options?.isZeroBudgetBase)
  );
  const result: LiquidationBaselineCategoryItem[] = cleanedBase.map((b) => ({
    ...b,
    isSupplemental: Boolean(b.isSupplemental),
  }));

  const usedTitles = new Set(result.map((r) => r.title.trim().toLowerCase()));
  const seenKey = new Set<string>();

  const appendItem = (item: {
    id: string;
    sbrId: string;
    sbrReferenceCode: string;
    description: string;
    quantity?: number;
    unit?: string;
    unitCost?: number;
    totalAmount: number;
  }) => {
    const key = `${item.sbrId}::${item.id}`;
    if (seenKey.has(key)) return;
    seenKey.add(key);

    const amt = Math.max(0, Math.round((Number(item.totalAmount) || 0) * 100) / 100);
    const rawDesc = String(item.description || 'Supplemental Expense').trim();
    const title = usedTitles.has(rawDesc.toLowerCase())
      ? `${rawDesc} (${item.sbrReferenceCode})`
      : rawDesc;
    usedTitles.add(title.toLowerCase());

    const qty = Number(item.quantity) || 0;
    const unitCost = Number(item.unitCost) || 0;
    const unitLower = String(item.unit || '').trim().toLowerCase();
    const qtyUnitLabel =
      qty > 0 && unitCost > 0 && !(qty === 1 && (!unitLower || unitLower === 'lot'))
        ? `${qty} ${item.unit || 'pcs'} × ₱${unitCost.toLocaleString()}`
        : undefined;

    result.push({
      id: `sbr_base_${item.sbrId}_${item.id}`,
      title,
      baselineAmount: amt,
      isSupplemental: true,
      sbrId: item.sbrId,
      sbrReferenceCode: item.sbrReferenceCode,
      ...(qtyUnitLabel ? { qtyUnitLabel } : {}),
    });
  };

  // Only include SBRs whose funds have actually been disbursed (voucher uploaded) or acknowledged in Finance Center
  const disbursedOnly = (approvedSbrs || []).filter((s) => isSbrDisbursedForLiquidation(s));
  if (disbursedOnly.length > 0) {
    disbursedOnly.forEach((sbr) => {
      (sbr.additionalItems || []).forEach((it) => {
        appendItem({
          id: it.id,
          sbrId: sbr.id,
          sbrReferenceCode: sbr.referenceCode,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unitCost: it.unitCost,
          totalAmount: it.totalAmount,
        });
      });
    });
  } else if (
    (approvedSbrs || []).length === 0 &&
    Array.isArray(fallbackRolledItems) &&
    fallbackRolledItems.length > 0
  ) {
    fallbackRolledItems.forEach((it) => appendItem(it));
  }

  return result;
}

/**
 * Option A Accounting Standard:
 * Builds merged Financial Projections for AP PDF & DOCX export WITHOUT mutating Firestore.
 * - Keeps original AP rows intact (`thisYearProposed` strictly reflects original AP).
 * - Appends each approved SBR expense item as an additional row under `adjustment` (+₱X) and `totalAmount` (₱X),
 *   with `thisYearProposed: 0` and Remarks tagging the SBR reference code.
 * - Appends a matching supplemental funding source row under Revenues (`adjustment: +₱X`, `totalAmount: ₱X`)
 *   so Total Revenue, Total Expenses, and Balance remain reconciled.
 */
export function buildMergedFinancialProjectionsForExport(
  proposal: any,
  approvedSbrs: SupplementalBudgetRequest[] = []
): {
  financialProjections: FinancialProjections;
  supplementalTotal: number;
  hasSupplementalRows: boolean;
} {
  const baseFin: FinancialProjections = proposal?.financialProjections || {
    revenues: [],
    expenses: [],
    totalRevenue: 0,
    totalExpenses: 0,
    balance: 0,
  };

  const isZeroBudgetBase = proposal?.fundingSource === 'zero_budget';
  const baseRevs: FinancialLineItem[] =
    !isZeroBudgetBase && Array.isArray(baseFin.revenues) ? [...baseFin.revenues] : [];
  const baseExps: FinancialLineItem[] = Array.isArray(baseFin.expenses) ? [...baseFin.expenses] : [];

  const approvedOnly = (approvedSbrs || []).filter((s) => s && !s.isDeleted && s.status === 'approved');

  const suppExps: FinancialLineItem[] = [];
  const suppRevs: FinancialLineItem[] = [];
  let supplementalTotal = 0;

  if (approvedOnly.length > 0) {
    approvedOnly.forEach((sbr) => {
      const sbrAmt = Math.max(0, Math.round((Number(sbr.requestedAmount) || 0) * 100) / 100);
      supplementalTotal = Math.round((supplementalTotal + sbrAmt) * 100) / 100;

      // Funding source row(s)
      const sourceLabel =
        sbr.fundingSource === 'organization_funds'
          ? `${sbr.organizationName || 'Organization'} Treasury`
          : sbr.fundingSource === 'retained_sao_fund'
          ? 'SAO Retained Activity Fund'
          : (sbr.allocations || []).map((a) => a.bucketName).filter(Boolean).join(' + ') ||
            sbr.miscFeeBucketName ||
            'School Budget (Misc Fees)';

      suppRevs.push({
        id: `sbr_rev_${sbr.id}`,
        description: `Supplemental Funding – ${sourceLabel}`,
        lastYearActual: 0,
        thisYearProposed: 0,
        adjustment: sbrAmt,
        totalAmount: sbrAmt,
        remarks: `Supplemental Budget (${sbr.referenceCode})`,
      });

      // Expense line items
      (sbr.additionalItems || []).forEach((item, idx) => {
        const lineAmt = Math.max(
          0,
          Math.round(
            (Number(item.totalAmount) ||
              Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitCost) || 0)) *
              100
          ) / 100
        );
        const qtySpec =
          item.quantity && item.unitCost
            ? ` (${item.quantity} ${item.unit || 'pcs'} @ P${Number(item.unitCost).toLocaleString()})`
            : '';
        const remParts = [`Supplemental (${sbr.referenceCode})`, item.remarks?.trim()].filter(Boolean);

        suppExps.push({
          id: `sbr_exp_${sbr.id}_${item.id || idx}`,
          description: `${item.description || 'Supplemental Expense'}${qtySpec}`,
          lastYearActual: 0,
          thisYearProposed: 0,
          adjustment: lineAmt,
          totalAmount: lineAmt,
          remarks: remParts.join(' • '),
        });
      });
    });
  } else if (
    Array.isArray(proposal?.supplementalExpenseItems) &&
    proposal.supplementalExpenseItems.length > 0
  ) {
    // Offline fallback using rolled-up supplementalExpenseItems on event/proposal doc
    const bySbr = new Map<string, { ref: string; source: string; total: number }>();
    (proposal.supplementalExpenseItems as SupplementalEventExpenseItem[]).forEach((item, idx) => {
      const lineAmt = Math.max(0, Math.round((Number(item.totalAmount) || 0) * 100) / 100);
      supplementalTotal = Math.round((supplementalTotal + lineAmt) * 100) / 100;
      const cur = bySbr.get(item.sbrId) || {
        ref: item.sbrReferenceCode,
        source: item.fundingSource,
        total: 0,
      };
      cur.total = Math.round((cur.total + lineAmt) * 100) / 100;
      bySbr.set(item.sbrId, cur);

      const qtySpec =
        item.quantity && item.unitCost
          ? ` (${item.quantity} ${item.unit || 'pcs'} @ P${Number(item.unitCost).toLocaleString()})`
          : '';
      suppExps.push({
        id: `sbr_exp_${item.sbrId}_${item.id || idx}`,
        description: `${item.description || 'Supplemental Expense'}${qtySpec}`,
        lastYearActual: 0,
        thisYearProposed: 0,
        adjustment: lineAmt,
        totalAmount: lineAmt,
        remarks: `Supplemental (${item.sbrReferenceCode})`,
      });
    });

    bySbr.forEach((meta, sbrId) => {
      const srcLabel =
        meta.source === 'organization_funds'
          ? 'Club Treasury Funds'
          : meta.source === 'retained_sao_fund'
          ? 'SAO Retained Activity Fund'
          : 'School Budget (Misc Fees)';
      suppRevs.push({
        id: `sbr_rev_${sbrId}`,
        description: `Supplemental Funding – ${srcLabel}`,
        lastYearActual: 0,
        thisYearProposed: 0,
        adjustment: meta.total,
        totalAmount: meta.total,
        remarks: `Supplemental Budget (${meta.ref})`,
      });
    });
  }

  const mergedRevs = [...baseRevs, ...suppRevs];
  const mergedExps = [...baseExps, ...suppExps];

  const baseRevTotal =
    !isZeroBudgetBase
      ? Number(baseFin.totalRevenue) ||
        baseRevs.reduce((s, r) => s + (Number(r.totalAmount) || Number(r.thisYearProposed) || 0), 0)
      : 0;
  const baseExpTotal =
    Number(baseFin.totalExpenses) ||
    baseExps.reduce((s, e) => s + (Number(e.totalAmount) || Number(e.thisYearProposed) || 0), 0);

  const totalRevenue = Math.round((baseRevTotal + supplementalTotal) * 100) / 100;
  const totalExpenses = Math.round((baseExpTotal + supplementalTotal) * 100) / 100;
  const balance = Math.round((totalRevenue - totalExpenses) * 100) / 100;

  return {
    financialProjections: {
      revenues: mergedRevs,
      expenses: mergedExps,
      totalRevenue,
      totalExpenses,
      balance,
    },
    supplementalTotal,
    hasSupplementalRows: suppExps.length > 0,
  };
}


