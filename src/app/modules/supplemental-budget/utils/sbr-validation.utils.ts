/**
 * src/app/modules/supplemental-budget/utils/sbr-validation.utils.ts
 *
 * Pure, testable business rules for Pre-Implementation Supplemental Budget Requests (SBR):
 * - Eligibility & Option A strict pre-implementation cutoff validation
 * - Permitted funding source governance (blocks student_contributions & zero_budget)
 * - Routing flags (Adviser Gate, SAS Direct vs. SAS Vetting + Institutional Signatories)
 * - Effective approved budget computation & multi-bucket allocation merging for Liquidation
 */

import type { ProposalBucketAllocation } from '../../activity-proposals/types/proposal.types';
import type {
  SupplementalBudgetRequest,
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
