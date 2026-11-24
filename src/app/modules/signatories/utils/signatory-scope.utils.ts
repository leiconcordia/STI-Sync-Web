import type { InstitutionalSignatory, WorkflowDocumentType } from '../types/signatory.types';

/**
 * Returns the normalized array of authorized workflow documents for a signatory.
 */
export function getSignatoryAuthorizedWorkflows(sig: InstitutionalSignatory | null | undefined): WorkflowDocumentType[] {
  if (!sig) return ['proposal', 'liquidation'];
  if (Array.isArray(sig.applicableWorkflows)) {
    return sig.applicableWorkflows;
  }
  const scope = sig.applicableScope || 'both';
  if (scope === 'all') return ['proposal', 'liquidation', 'par'];
  if (scope === 'liquidation_only' || scope === 'liquidation') return ['liquidation'];
  if (scope === 'proposal_only' || scope === 'proposal') return ['proposal'];
  if (scope === 'par_only' || scope === 'par') return ['par'];
  // 'both' in legacy meant proposal + liquidation
  return ['proposal', 'liquidation'];
}

/**
 * Determines whether a signatory is eligible for a specific document workflow.
 * Guarantees that Accountants are strictly for Liquidations and never Activity Proposals or PAR.
 */
export function isSignatoryApplicableTo(
  sig: InstitutionalSignatory | null | undefined,
  formType: WorkflowDocumentType | 'proposal' | 'liquidation' | 'par'
): boolean {
  if (!sig) return false;
  const roleLower = (sig.role || '').toLowerCase();
  const titleLower = (sig.roleTitle || '').toLowerCase();
  const isAccountant =
    roleLower === 'accountant' ||
    titleLower.includes('accountant') ||
    titleLower.includes('auditor');

  // Hard safety invariant: Accountants & Auditors are strictly for Liquidations
  if (isAccountant && formType !== 'liquidation') {
    return false;
  }

  // 1. Check array if explicitly set (even if empty, which means Cannot Sign on all workflows)
  if (Array.isArray(sig.applicableWorkflows)) {
    return sig.applicableWorkflows.includes(formType as WorkflowDocumentType);
  }

  // 2. Check legacy applicableScope string
  const scope = sig.applicableScope || 'both';
  if (scope === 'all') {
    return true;
  }

  if (formType === 'proposal') {
    if (scope === 'liquidation_only' || scope === 'liquidation' || scope === 'par') return false;
    return true;
  }

  if (formType === 'liquidation') {
    if (scope === 'proposal_only' || scope === 'proposal' || scope === 'par') return false;
    return true;
  }

  if (formType === 'par') {
    // Only explicit 'par' / 'par_only' / 'all' authorize PAR; legacy 'both' was strictly AP + FL
    if (scope === 'par' || scope === 'par_only' || scope === 'all') return true;
    return false;
  }

  return true;
}
