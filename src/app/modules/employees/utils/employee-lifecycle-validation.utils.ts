import type { EmployeeDocument } from '../types/employee.types';

export type EmployeeRoleKind =
  | 'primary_adviser'
  | 'co_adviser'
  | 'institutional_signatory';

export interface EmployeeRoleAssignment {
  id: string;
  kind: EmployeeRoleKind;
  label: string;
  badgeTone: 'adviser' | 'signatory';
  organizationId?: string;
  organizationName?: string;
  adviserRole?: 'primary' | 'co_adviser';
  signatoryId?: string;
  signatoryAuthUid?: string;
  signatoryEmail?: string;
  signatoryName?: string;
  roleTitle?: string;
  employeeId?: string;
}

export type EmployeeBlockerCategory =
  | 'pending_signature'
  | 'adviser_review'
  | 'pending_activity'
  | 'pending_liquidation'
  | 'pending_par'
  | 'pending_sbr';

export type EmployeeBlockerDocType =
  | 'Activity Proposal'
  | 'Activity / Event'
  | 'Financial Liquidation'
  | 'Post-Activity Report'
  | 'Supplemental Budget Request';

export interface EmployeeBlockerItem {
  category: EmployeeBlockerCategory;
  documentType: EmployeeBlockerDocType;
  documentId: string;
  referenceNo?: string;
  title: string;
  status: string;
  reason: string;
  organizationName?: string;
}

export interface EmployeeBlockerReport {
  canProceed: boolean;
  blockers: EmployeeBlockerItem[];
  summary: string;
}

export interface EmployeeLifecycleEligibility {
  allowed: boolean;
  reason?: string;
  assignments?: EmployeeRoleAssignment[];
  blockers?: EmployeeBlockerItem[];
}

export interface WorkflowBlockerDatasets {
  activities: Array<Record<string, any>>;
  liquidations: Array<Record<string, any>>;
  postActivityReports: Array<Record<string, any>>;
  supplementalBudgets: Array<Record<string, any>>;
}

export function normalizeIdentityText(value?: string | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildEmployeeNameVariants(employee: Pick<EmployeeDocument, 'fullName' | 'firstName' | 'middleName' | 'lastName'>): Set<string> {
  const variants = new Set<string>();
  const full = normalizeIdentityText(employee.fullName);
  if (full) variants.add(full);

  const first = normalizeIdentityText(employee.firstName);
  const middle = normalizeIdentityText(employee.middleName);
  const last = normalizeIdentityText(employee.lastName);

  if (first && last) {
    variants.add(`${first} ${last}`);
    if (middle) {
      variants.add(`${first} ${middle} ${last}`);
      const initial = middle.charAt(0);
      if (initial) {
        variants.add(`${first} ${initial}. ${last}`);
        variants.add(`${first} ${initial} ${last}`);
      }
    }
  }
  return variants;
}

function matchesEmployeeIdentity(
  employee: Pick<EmployeeDocument, 'employeeId' | 'fullName' | 'firstName' | 'middleName' | 'lastName'>,
  candidate: { employeeId?: string | null; name?: string | null }
): boolean {
  const empId = normalizeIdentityText(employee.employeeId);
  const candEmpId = normalizeIdentityText(candidate.employeeId);
  if (empId && candEmpId && empId === candEmpId) {
    return true;
  }

  const candName = normalizeIdentityText(candidate.name);
  if (!candName) return false;

  const variants = buildEmployeeNameVariants(employee);
  return variants.has(candName);
}

/**
 * Resolves ALL active role assignments (Primary Club Adviser, Co-Adviser, Institutional Signatory)
 * currently held by an employee across active organizations and active signatories.
 */
export function resolveEmployeeAssignments(
  employee: Pick<EmployeeDocument, 'id' | 'employeeId' | 'fullName' | 'firstName' | 'middleName' | 'lastName'>,
  organizations: Array<Record<string, any>>,
  signatories: Array<Record<string, any>>
): EmployeeRoleAssignment[] {
  const results: EmployeeRoleAssignment[] = [];
  const seen = new Set<string>();

  for (const org of organizations || []) {
    if (!org) continue;
    const status = normalizeIdentityText(org.status);
    if (status === 'archived' || org.archived === true || org.isArchived === true || org.isDeleted === true) {
      continue;
    }

    const orgId = String(org.id || '');
    const orgDisplay = String(org.acronym || org.name || 'Organization').trim();
    const orgFullName = String(org.name || org.acronym || 'Organization').trim();

    if (org.adviser && matchesEmployeeIdentity(employee, { employeeId: org.adviser.employeeId, name: org.adviser.name })) {
      const key = `org:${orgId}:primary`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: key,
          kind: 'primary_adviser',
          label: `Adviser · ${orgDisplay}`,
          badgeTone: 'adviser',
          organizationId: orgId,
          organizationName: orgFullName,
          adviserRole: 'primary',
          employeeId: org.adviser.employeeId || employee.employeeId,
        });
      }
    }

    if (org.coAdviser && matchesEmployeeIdentity(employee, { employeeId: org.coAdviser.employeeId, name: org.coAdviser.name })) {
      const key = `org:${orgId}:co_adviser`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: key,
          kind: 'co_adviser',
          label: `Co-Adviser · ${orgDisplay}`,
          badgeTone: 'adviser',
          organizationId: orgId,
          organizationName: orgFullName,
          adviserRole: 'co_adviser',
          employeeId: org.coAdviser.employeeId || employee.employeeId,
        });
      }
    }
  }

  for (const sig of signatories || []) {
    if (!sig) continue;
    const sigStatus = normalizeIdentityText(sig.status);
    if (sig.isActive === false || sigStatus === 'revoked' || sigStatus === 'archived' || sig.isDeleted === true) {
      continue;
    }

    if (matchesEmployeeIdentity(employee, { employeeId: sig.employeeId, name: sig.name })) {
      const sigId = String(sig.id || '');
      const key = `sig:${sigId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const roleTitle = String(sig.roleTitle || 'Officer').trim();
        results.push({
          id: key,
          kind: 'institutional_signatory',
          label: `Signatory · ${roleTitle}`,
          badgeTone: 'signatory',
          signatoryId: sigId,
          signatoryAuthUid: sig.authUid || sig.uid || undefined,
          signatoryEmail: sig.email || undefined,
          signatoryName: sig.name || employee.fullName,
          roleTitle,
          employeeId: sig.employeeId || employee.employeeId,
        });
      }
    }
  }

  return results;
}

/**
 * Rule 1: Cannot archive an employee while they hold any active role assignment.
 */
export function evaluateArchiveEligibility(
  employee: Pick<EmployeeDocument, 'fullName' | 'archived' | 'status'>,
  assignments: EmployeeRoleAssignment[]
): EmployeeLifecycleEligibility {
  if (employee.archived || employee.status === 'ARCHIVED') {
    return {
      allowed: false,
      reason: `${employee.fullName} is already archived.`,
      assignments,
    };
  }

  if (assignments.length > 0) {
    const roleSummary = assignments.map((a) => a.label).join(', ');
    return {
      allowed: false,
      reason: `Cannot archive ${employee.fullName} while actively assigned (${roleSummary}). Unassign their active role(s) first.`,
      assignments,
    };
  }

  return { allowed: true, assignments: [] };
}

/**
 * Rule 2: Cannot permanently delete an employee unless they are archived,
 * have 0 active role assignments, AND have 0 pending workflow items.
 */
export function evaluateDeleteEligibility(
  employee: Pick<EmployeeDocument, 'fullName' | 'archived' | 'status'>,
  assignments: EmployeeRoleAssignment[],
  blockers: EmployeeBlockerItem[] = []
): EmployeeLifecycleEligibility {
  if (!employee.archived && employee.status !== 'ARCHIVED') {
    return {
      allowed: false,
      reason: `Archive ${employee.fullName} first before permanent deletion.`,
      assignments,
      blockers,
    };
  }

  if (assignments.length > 0) {
    const roleSummary = assignments.map((a) => a.label).join(', ');
    return {
      allowed: false,
      reason: `Cannot delete ${employee.fullName} while still assigned (${roleSummary}). Unassign their active role(s) first.`,
      assignments,
      blockers,
    };
  }

  if (blockers.length > 0) {
    return {
      allowed: false,
      reason: `Cannot delete ${employee.fullName} while ${blockers.length} pending workflow item${blockers.length === 1 ? '' : 's'} still reference them.`,
      assignments,
      blockers,
    };
  }

  return { allowed: true, assignments: [], blockers: [] };
}

function isDocDeletedOrArchived(doc: Record<string, any> | null | undefined): boolean {
  if (!doc) return true;
  if (doc.isDeleted === true || doc.deleted === true) return true;
  if (doc.isArchived === true || doc.archived === true) return true;
  const st = normalizeIdentityText(doc.status);
  const ps = normalizeIdentityText(doc.proposalStatus);
  return st === 'archived' || ps === 'archived';
}

const RESOLVED_STEP_STATUSES = new Set([
  'approved',
  'endorsed',
  'waived',
  'noted',
  'returned',
  'rejected',
  'skipped',
]);

function isApprovalStepUnsigned(step: Record<string, any> | null | undefined): boolean {
  if (!step) return false;
  const st = normalizeIdentityText(step.status);
  if (!st) return true;
  if (RESOLVED_STEP_STATUSES.has(st)) return false;
  return st === 'waiting' || st === 'current' || st === 'pending';
}

function stepMatchesSignatory(
  step: Record<string, any>,
  employee: Pick<EmployeeDocument, 'employeeId' | 'fullName' | 'firstName' | 'middleName' | 'lastName'>,
  assignment?: Pick<EmployeeRoleAssignment, 'signatoryId' | 'signatoryAuthUid' | 'signatoryEmail' | 'signatoryName'>
): boolean {
  const stepUid = normalizeIdentityText(step.signatoryUid || step.signatoryId || step.uid);
  const targetUid = normalizeIdentityText(assignment?.signatoryAuthUid);
  const targetSigId = normalizeIdentityText(assignment?.signatoryId);

  if (stepUid && ((targetUid && stepUid === targetUid) || (targetSigId && stepUid === targetSigId))) {
    return true;
  }

  const stepEmail = normalizeIdentityText(step.signatoryEmail || step.email);
  const targetEmail = normalizeIdentityText(assignment?.signatoryEmail);
  if (stepEmail && targetEmail && stepEmail === targetEmail) {
    return true;
  }

  const stepName = normalizeIdentityText(step.signatoryName || step.name);
  if (!stepName) return false;

  const targetName = normalizeIdentityText(assignment?.signatoryName);
  if (targetName && stepName === targetName) return true;

  const variants = buildEmployeeNameVariants(employee);
  return variants.has(stepName);
}

const ACTIVITY_SIGNATORY_ACTIVE_STATUSES = new Set([
  'under_review',
  'pending',
  'pending_review',
  'for_signatory_review',
  'for_approval',
]);

const ACTIVITY_TERMINAL_OR_NON_SIGNATORY_STATUSES = new Set([
  'draft',
  'for_adviser_review',
  'approved',
  'approved_president',
  'activated',
  'completed',
  'concluded',
  'rejected',
  'cancelled',
  'withdrawn',
  'voided',
  'archived',
  'returned',
  'returned_for_revision',
]);

const LIQUIDATION_SIGNATORY_ACTIVE_STATUSES = new Set([
  'pending',
  'under_review',
  'for_signatory_review',
]);

const PAR_SIGNATORY_ACTIVE_STATUSES = new Set([
  'pending',
  'under_review',
  'for_signatory_review',
]);

const SBR_SIGNATORY_ACTIVE_STATUSES = new Set([
  'pending_signatories',
  'under_review',
]);

/**
 * Finds all in-flight documents across AP, FL, PAR, and SBR where the
 * Institutional Signatory has an unsigned step in `approvalChain`.
 */
export function findSignatoryPendingBlockers(
  employee: Pick<EmployeeDocument, 'employeeId' | 'fullName' | 'firstName' | 'middleName' | 'lastName'>,
  assignment: Pick<EmployeeRoleAssignment, 'signatoryId' | 'signatoryAuthUid' | 'signatoryEmail' | 'signatoryName'> | undefined,
  datasets: WorkflowBlockerDatasets
): EmployeeBlockerItem[] {
  const blockers: EmployeeBlockerItem[] = [];

  // 1. Activity Proposals (`activities`)
  for (const doc of datasets.activities || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    if (doc.completedAt || doc.isConcluded === true) continue;

    const status = normalizeIdentityText(doc.status);
    const proposalStatus = normalizeIdentityText(doc.proposalStatus);
    const effectiveStatus = status || proposalStatus;

    if (
      ACTIVITY_TERMINAL_OR_NON_SIGNATORY_STATUSES.has(effectiveStatus) ||
      (proposalStatus && ACTIVITY_TERMINAL_OR_NON_SIGNATORY_STATUSES.has(proposalStatus) && !ACTIVITY_SIGNATORY_ACTIVE_STATUSES.has(status))
    ) {
      continue;
    }

    if (!ACTIVITY_SIGNATORY_ACTIVE_STATUSES.has(effectiveStatus) && !ACTIVITY_SIGNATORY_ACTIVE_STATUSES.has(proposalStatus)) {
      continue;
    }

    const chain = Array.isArray(doc.approvalChain) ? doc.approvalChain : [];
    const pendingStep = chain.find(
      (step: any) => isApprovalStepUnsigned(step) && stepMatchesSignatory(step, employee, assignment)
    );
    if (pendingStep) {
      const stepSt = normalizeIdentityText(pendingStep.status);
      blockers.push({
        category: 'pending_signature',
        documentType: 'Activity Proposal',
        documentId: String(doc.id || ''),
        referenceNo: doc.referenceNo || doc.referenceId || undefined,
        title: String(doc.title || 'Untitled Activity Proposal'),
        status: effectiveStatus || 'under_review',
        reason: stepSt === 'current' ? 'Awaiting signature (Current Stage)' : 'Pending in active approval chain',
        organizationName: doc.organizationName || undefined,
      });
    }
  }

  // 2. Financial Liquidations (`liquidations`)
  for (const doc of datasets.liquidations || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    const status = normalizeIdentityText(doc.status);
    if (!LIQUIDATION_SIGNATORY_ACTIVE_STATUSES.has(status)) continue;

    const chain = Array.isArray(doc.approvalChain) ? doc.approvalChain : [];
    const pendingStep = chain.find(
      (step: any) => isApprovalStepUnsigned(step) && stepMatchesSignatory(step, employee, assignment)
    );
    if (pendingStep) {
      const stepSt = normalizeIdentityText(pendingStep.status);
      blockers.push({
        category: 'pending_signature',
        documentType: 'Financial Liquidation',
        documentId: String(doc.id || ''),
        referenceNo: doc.referenceNo || doc.referenceNumber || undefined,
        title: String(doc.eventTitle || doc.title || 'Financial Liquidation'),
        status,
        reason: stepSt === 'current' ? 'Awaiting signature (Current Stage)' : 'Pending in active approval chain',
        organizationName: doc.organizationName || undefined,
      });
    }
  }

  // 3. Post-Activity Reports (`post_activity_reports`)
  for (const doc of datasets.postActivityReports || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    const status = normalizeIdentityText(doc.status);
    if (!PAR_SIGNATORY_ACTIVE_STATUSES.has(status)) continue;

    const chain = Array.isArray(doc.approvalChain) ? doc.approvalChain : [];
    const pendingStep = chain.find(
      (step: any) => isApprovalStepUnsigned(step) && stepMatchesSignatory(step, employee, assignment)
    );
    if (pendingStep) {
      const stepSt = normalizeIdentityText(pendingStep.status);
      blockers.push({
        category: 'pending_signature',
        documentType: 'Post-Activity Report',
        documentId: String(doc.id || ''),
        referenceNo: doc.referenceNo || undefined,
        title: String(doc.eventTitle || doc.title || 'Post-Activity Report'),
        status,
        reason: stepSt === 'current' ? 'Awaiting signature (Current Stage)' : 'Pending in active approval chain',
        organizationName: doc.organizationName || undefined,
      });
    }
  }

  // 4. Supplemental Budget Requests (`supplemental_budget_requests`)
  for (const doc of datasets.supplementalBudgets || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    const status = normalizeIdentityText(doc.status);
    if (!SBR_SIGNATORY_ACTIVE_STATUSES.has(status)) continue;

    const chain = Array.isArray(doc.approvalChain) ? doc.approvalChain : [];
    const pendingStep = chain.find(
      (step: any) => isApprovalStepUnsigned(step) && stepMatchesSignatory(step, employee, assignment)
    );
    if (pendingStep) {
      const stepSt = normalizeIdentityText(pendingStep.status);
      blockers.push({
        category: 'pending_signature',
        documentType: 'Supplemental Budget Request',
        documentId: String(doc.id || ''),
        referenceNo: doc.referenceNo || undefined,
        title: String(doc.eventTitle || doc.title || 'Supplemental Budget Request'),
        status,
        reason: stepSt === 'current' ? 'Awaiting signature (Current Stage)' : 'Pending in active approval chain',
        organizationName: doc.organizationName || undefined,
      });
    }
  }

  return blockers;
}

const ADVISER_ACTIVITY_IGNORED_STATUSES = new Set([
  'draft',
  'rejected',
  'cancelled',
  'withdrawn',
  'voided',
  'archived',
  'completed',
  'concluded',
]);

const ADVISER_ACTIVITY_IN_REVIEW_STATUSES = new Set([
  'under_review',
  'pending',
  'pending_review',
  'returned',
  'returned_for_revision',
  'for_signatory_review',
  'for_approval',
]);

const ADVISER_ACTIVITY_APPROVED_ACTIVE_STATUSES = new Set([
  'approved',
  'approved_president',
  'activated',
  'ongoing',
]);

const LIQUIDATION_CLOSED_STATUSES = new Set([
  'draft',
  'approved',
  'rejected',
  'voided',
  'archived',
]);

const PAR_CLOSED_STATUSES = new Set([
  'draft',
  'approved',
  'rejected',
  'archived',
]);

const SBR_CLOSED_STATUSES = new Set([
  'draft',
  'approved',
  'rejected',
  'withdrawn',
  'archived',
]);

function docBelongsToOrganization(doc: Record<string, any>, organizationId: string): boolean {
  const target = String(organizationId || '').trim();
  if (!target) return false;
  const candidates = [doc.organizationId, doc.hostingOrgId, doc.orgId]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return candidates.includes(target);
}

/**
 * Finds all pending reviews, in-flight submissions, and active/unconcluded activities
 * for an organization when unassigning a Primary Club Adviser or Co-Adviser (Strict Option A).
 */
export function findAdviserPendingBlockers(
  assignment: Pick<EmployeeRoleAssignment, 'organizationId' | 'organizationName'>,
  datasets: WorkflowBlockerDatasets
): EmployeeBlockerItem[] {
  const orgId = String(assignment.organizationId || '').trim();
  if (!orgId) return [];

  const blockers: EmployeeBlockerItem[] = [];
  const orgName = assignment.organizationName;

  // 1. Activities & Activity Proposals (`activities`)
  for (const doc of datasets.activities || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    if (!docBelongsToOrganization(doc, orgId)) continue;
    if (doc.completedAt || doc.isConcluded === true) continue;

    const status = normalizeIdentityText(doc.status);
    const proposalStatus = normalizeIdentityText(doc.proposalStatus);

    if (
      ADVISER_ACTIVITY_IGNORED_STATUSES.has(status) ||
      ADVISER_ACTIVITY_IGNORED_STATUSES.has(proposalStatus)
    ) {
      continue;
    }

    const effectiveStatus = status || proposalStatus;
    if (!effectiveStatus) continue;

    if (status === 'for_adviser_review' || proposalStatus === 'for_adviser_review') {
      blockers.push({
        category: 'adviser_review',
        documentType: 'Activity Proposal',
        documentId: String(doc.id || ''),
        referenceNo: doc.referenceNo || doc.referenceId || undefined,
        title: String(doc.title || 'Untitled Activity Proposal'),
        status: 'for_adviser_review',
        reason: 'Awaiting Club Adviser review & endorsement',
        organizationName: doc.organizationName || orgName,
      });
    } else if (
      ADVISER_ACTIVITY_IN_REVIEW_STATUSES.has(status) ||
      ADVISER_ACTIVITY_IN_REVIEW_STATUSES.has(proposalStatus)
    ) {
      blockers.push({
        category: 'pending_activity',
        documentType: 'Activity Proposal',
        documentId: String(doc.id || ''),
        referenceNo: doc.referenceNo || doc.referenceId || undefined,
        title: String(doc.title || 'Untitled Activity Proposal'),
        status: effectiveStatus,
        reason:
          effectiveStatus === 'returned' || effectiveStatus === 'returned_for_revision'
            ? 'Pending revision / resubmission'
            : 'Proposal currently under review',
        organizationName: doc.organizationName || orgName,
      });
    } else if (
      ADVISER_ACTIVITY_APPROVED_ACTIVE_STATUSES.has(status) ||
      ADVISER_ACTIVITY_APPROVED_ACTIVE_STATUSES.has(proposalStatus)
    ) {
      blockers.push({
        category: 'pending_activity',
        documentType: 'Activity / Event',
        documentId: String(doc.id || ''),
        referenceNo: doc.referenceNo || doc.referenceId || undefined,
        title: String(doc.title || 'Active Club Activity'),
        status: effectiveStatus,
        reason: 'Approved / ongoing club activity not yet concluded',
        organizationName: doc.organizationName || orgName,
      });
    }
  }

  // 2. Financial Liquidations (`liquidations`)
  for (const doc of datasets.liquidations || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    if (!docBelongsToOrganization(doc, orgId)) continue;

    const status = normalizeIdentityText(doc.status);
    if (!status || LIQUIDATION_CLOSED_STATUSES.has(status)) continue;

    blockers.push({
      category: status === 'for_adviser_review' ? 'adviser_review' : 'pending_liquidation',
      documentType: 'Financial Liquidation',
      documentId: String(doc.id || ''),
      referenceNo: doc.referenceNo || doc.referenceNumber || undefined,
      title: String(doc.eventTitle || doc.title || 'Financial Liquidation'),
      status,
      reason:
        status === 'for_adviser_review'
          ? 'Awaiting Club Adviser review'
          : status === 'returned'
            ? 'Returned liquidation awaiting revision'
            : 'Pending financial liquidation clearance',
      organizationName: doc.organizationName || orgName,
    });
  }

  // 3. Post-Activity Reports (`post_activity_reports`)
  for (const doc of datasets.postActivityReports || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    if (!docBelongsToOrganization(doc, orgId)) continue;

    const status = normalizeIdentityText(doc.status);
    if (!status || PAR_CLOSED_STATUSES.has(status)) continue;

    blockers.push({
      category: status === 'for_adviser_review' ? 'adviser_review' : 'pending_par',
      documentType: 'Post-Activity Report',
      documentId: String(doc.id || ''),
      referenceNo: doc.referenceNo || undefined,
      title: String(doc.eventTitle || doc.title || 'Post-Activity Report'),
      status,
      reason:
        status === 'for_adviser_review'
          ? 'Awaiting Club Adviser review'
          : status === 'returned'
            ? 'Returned report awaiting revision'
            : 'Pending Post-Activity Report approval',
      organizationName: doc.organizationName || orgName,
    });
  }

  // 4. Supplemental Budget Requests (`supplemental_budget_requests`)
  for (const doc of datasets.supplementalBudgets || []) {
    if (isDocDeletedOrArchived(doc)) continue;
    if (!docBelongsToOrganization(doc, orgId)) continue;

    const status = normalizeIdentityText(doc.status);
    if (!status || SBR_CLOSED_STATUSES.has(status)) continue;

    blockers.push({
      category: status === 'for_adviser_review' ? 'adviser_review' : 'pending_sbr',
      documentType: 'Supplemental Budget Request',
      documentId: String(doc.id || ''),
      referenceNo: doc.referenceNo || undefined,
      title: String(doc.eventTitle || doc.title || 'Supplemental Budget Request'),
      status,
      reason:
        status === 'for_adviser_review'
          ? 'Awaiting Club Adviser review'
          : status === 'for_revision'
            ? 'Returned supplemental budget awaiting revision'
            : 'Pending Supplemental Budget Request processing',
      organizationName: doc.organizationName || orgName,
    });
  }

  return blockers;
}

export function buildBlockerReport(blockers: EmployeeBlockerItem[]): EmployeeBlockerReport {
  if (blockers.length === 0) {
    return {
      canProceed: true,
      blockers: [],
      summary: 'No pending signatures or active activities found.',
    };
  }

  return {
    canProceed: false,
    blockers,
    summary: `Found ${blockers.length} pending or active item${blockers.length === 1 ? '' : 's'} that must be resolved before unassigning.`,
  };
}

export function evaluateAssignmentUnassignBlockers(
  employee: Pick<EmployeeDocument, 'employeeId' | 'fullName' | 'firstName' | 'middleName' | 'lastName'>,
  assignment: EmployeeRoleAssignment,
  datasets: WorkflowBlockerDatasets
): EmployeeBlockerReport {
  if (assignment.kind === 'institutional_signatory') {
    return buildBlockerReport(findSignatoryPendingBlockers(employee, assignment, datasets));
  }
  return buildBlockerReport(findAdviserPendingBlockers(assignment, datasets));
}

export function evaluateEmployeeDeleteBlockers(
  employee: Pick<EmployeeDocument, 'employeeId' | 'fullName' | 'firstName' | 'middleName' | 'lastName'>,
  assignments: EmployeeRoleAssignment[],
  datasets: WorkflowBlockerDatasets,
  historicalSignatories: Array<Record<string, any>> = []
): EmployeeBlockerReport {
  const seen = new Set<string>();
  const combined: EmployeeBlockerItem[] = [];

  const pushUnique = (items: EmployeeBlockerItem[]) => {
    for (const item of items) {
      const key = `${item.documentType}:${item.documentId}:${item.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(item);
      }
    }
  };

  for (const assignment of assignments) {
    const report = evaluateAssignmentUnassignBlockers(employee, assignment, datasets);
    pushUnique(report.blockers);
  }

  // Even after unassigning, guard against any lingering unsigned step in an active approvalChain
  const matchedSignatory = (historicalSignatories || []).find((sig) =>
    sig && matchesEmployeeIdentity(employee, { employeeId: sig.employeeId, name: sig.name })
  );
  pushUnique(
    findSignatoryPendingBlockers(
      employee,
      matchedSignatory
        ? {
            signatoryId: matchedSignatory.id,
            signatoryAuthUid: matchedSignatory.authUid || matchedSignatory.uid,
            signatoryEmail: matchedSignatory.email,
            signatoryName: matchedSignatory.name,
          }
        : undefined,
      datasets
    )
  );

  return buildBlockerReport(combined);
}
