/**
 * src/app/modules/signatories/utils/signatory-label.utils.ts
 *
 * Unified utilities for dynamic formal signatory document labels
 * and approval authority resolution across AP (Proposal), FL (Liquidation), and PAR.
 */

import type { InstitutionalSignatory, WorkflowDocumentType } from '../types/signatory.types';

export interface SignatoryLabelOption {
  value: string;
  label: string;
  description: string;
}

export const SIGNATORY_LABEL_OPTIONS: readonly SignatoryLabelOption[] = [
  { value: 'Checked by:', label: 'Checked by:', description: 'Auditor / Accountant / Finance review' },
  { value: 'Endorsed by:', label: 'Endorsed by:', description: 'Program Head / SAS / Adviser' },
  { value: 'Recommending Approval:', label: 'Recommending Approval:', description: 'Academic Head / Dean / Principal' },
  { value: 'Approved by:', label: 'Approved by:', description: 'School Administrator / President approval' },
  { value: 'Noted by:', label: 'Noted by:', description: 'Executive oversight / Administration note' },
  { value: 'Verified by:', label: 'Verified by:', description: 'Documentation / Records verification' },
  { value: 'Submitted by:', label: 'Submitted by:', description: 'Officer / Activity Proponent submission' },
  { value: 'Prepared by:', label: 'Prepared by:', description: 'Treasurer / Organizer preparation' },
] as const;

export const SIGNATORY_LABEL_STRINGS = [
  'Checked by:',
  'Endorsed by:',
  'Recommending Approval:',
  'Approved by:',
  'Noted by:',
  'Verified by:',
  'Submitted by:',
  'Prepared by:',
] as const;

export type StandardSignatoryLabel = (typeof SIGNATORY_LABEL_STRINGS)[number];

export interface SignatoryStepLike {
  role?: string;
  roleTitle?: string;
  actionType?: string;
  signatoryLabel?: string;
  signatoryUid?: string;
  signatoryEmail?: string;
}

/**
 * Resolves the formal document signature prefix (e.g. "Checked by:", "Approved by:").
 * If the step has an explicit signatoryLabel, it is prioritized.
 * Otherwise, institutional governance rules dynamically derive the official label.
 */
export function resolveSignatoryLabel(
  step: SignatoryStepLike | null | undefined,
  docType: WorkflowDocumentType | 'proposal' | 'liquidation' | 'par',
  isLastStep = false
): string {
  if (step?.signatoryLabel && step.signatoryLabel.trim()) {
    return step.signatoryLabel.trim();
  }

  const roleLower = (step?.role || '').toLowerCase();
  const titleLower = (step?.roleTitle || '').toLowerCase();
  const actionType = (step?.actionType || '').toLowerCase();

  // 1. Financial Liquidation (FL)
  if (docType === 'liquidation') {
    if (actionType === 'check' || roleLower.includes('accountant') || titleLower.includes('accountant') || titleLower.includes('auditor')) {
      return 'Checked by:';
    }
    if (actionType === 'approve' || roleLower.includes('president') || titleLower.includes('president') || isLastStep) {
      return 'Approved by:';
    }
    if (roleLower.includes('administrator') || titleLower.includes('administrator') || roleLower.includes('sas') || titleLower.includes('student affairs')) {
      return 'Recommending Approval:';
    }
    if (roleLower.includes('adviser') || titleLower.includes('adviser')) {
      return 'Noted by:';
    }
    return 'Endorsed by:';
  }

  // 2. Activity Proposal (AP)
  if (docType === 'proposal') {
    if (actionType === 'approve' || roleLower.includes('president') || titleLower.includes('president') || isLastStep) {
      return 'Approved by:';
    }
    if (roleLower.includes('administrator') || titleLower.includes('administrator') || roleLower.includes('sas_head') || titleLower.includes('student affairs')) {
      return 'Recommending Approval:';
    }
    if (roleLower.includes('adviser') || titleLower.includes('adviser')) {
      return 'Noted by:';
    }
    return 'Endorsed by:';
  }

  // 3. Post-Activity Report (PAR)
  if (docType === 'par') {
    if (actionType === 'approve' || roleLower.includes('president') || titleLower.includes('president') || isLastStep) {
      return 'Approved by:';
    }
    if (roleLower.includes('adviser') || titleLower.includes('adviser')) {
      return 'Noted by:';
    }
    return 'Endorsed by:';
  }

  return 'Endorsed by:';
}

/**
 * Derives the underlying actionType ('check' | 'endorse' | 'approve' | 'note')
 * from a formal signatory label.
 */
export function resolveActionTypeFromLabel(label: string): 'check' | 'endorse' | 'approve' | 'note' {
  const clean = label.trim().toLowerCase();
  if (clean.includes('check') || clean.includes('audit') || clean.includes('verif')) {
    return 'check';
  }
  if (clean.includes('approved by') || clean === 'approved') {
    return 'approve';
  }
  if (clean.includes('noted by') || clean === 'noted') {
    return 'note';
  }
  return 'endorse';
}

/**
 * Checks whether a signatory profile has the explicit authority to grant final approval
 * for a specific document type (Activity Proposal, Financial Liquidation, or PAR).
 * Falls back to executive role matching if explicit flags are not yet configured on legacy records.
 */
export function canSignatoryApproveDocument(
  signatory: Partial<InstitutionalSignatory> | any | null | undefined,
  docType: WorkflowDocumentType | 'proposal' | 'liquidation' | 'par',
  step?: SignatoryStepLike | null
): boolean {
  if (!signatory) return false;

  // 1. Explicit capability flags configured in Institutional Signatory Management
  if (docType === 'proposal' && typeof signatory.canApproveProposal === 'boolean') {
    return signatory.canApproveProposal;
  }
  if (docType === 'liquidation' && typeof signatory.canApproveLiquidation === 'boolean') {
    return signatory.canApproveLiquidation;
  }
  if (docType === 'par' && typeof signatory.canApprovePar === 'boolean') {
    return signatory.canApprovePar;
  }

  // 2. Fallback: Action type on profile
  if (signatory.actionType === 'approver') return true;

  // 3. Fallback: Action type on step
  if (step?.actionType === 'approve') return true;

  // 4. Fallback: Institutional executive roles
  const roleLower = (signatory.role || step?.role || '').toLowerCase();
  const titleLower = (signatory.roleTitle || step?.roleTitle || '').toLowerCase();

  if (roleLower === 'school_president' || titleLower.includes('president')) {
    return true;
  }
  if (roleLower === 'school_administrator' || titleLower.includes('administrator')) {
    return true;
  }

  return false;
}

