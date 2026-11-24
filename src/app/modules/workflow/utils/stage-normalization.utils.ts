/**
 * src/app/modules/workflow/utils/stage-normalization.utils.ts
 *
 * Universal stage naming, formatting, and re-indexing utilities.
 * Ensures consistent, clean, and collision-free stage names across:
 * - Activity Proposals (Form AP)
 * - Financial Liquidations (Form FL)
 * - Post-Activity Reports (Form PAR)
 * - Admin Approval Workflow Settings
 */

import type {
  InstitutionalSignatory,
  WorkflowDocumentType,
} from '../../signatories/types/signatory.types';
import { isSignatoryApplicableTo } from '../../signatories/utils/signatory-scope.utils.ts';

/**
 * Universal stage naming formula.
 * @param stageIndex 1-based stage number (1, 2, 3...)
 * @param signerCount Number of signers currently in this stage (defaults to 0)
 * Examples:
 * - formatStageTitle(1, 1) -> "Stage 1 Signer"
 * - formatStageTitle(1, 2) -> "Stage 1 Signers"
 * - formatStageTitle(2, 0) -> "Stage 2 Signers"
 * - formatStageTitle(3, 4) -> "Stage 3 Signers"
 */
export function formatStageTitle(stageIndex: number, signerCount?: number): string {
  const safeIndex = Math.max(1, Math.floor(stageIndex || 1));
  const count = typeof signerCount === 'number' ? signerCount : 0;
  return `Stage ${safeIndex} ${count === 1 ? 'Signer' : 'Signers'}`;
}

/**
 * Defensive utility to strip legacy or redundant prefixes like:
 * "Stage 1: Stage 1: Endorsement" -> "Endorsement"
 * "Stage 2: Department Heads" -> "Department Heads"
 * "Stage 3" -> ""
 */
export function stripStagePrefix(name?: string): string {
  if (!name) return '';
  return name.replace(/^(Stage\s*\d+\s*:\s*)+/i, '').trim();
}

/**
 * Counts how many steps in the approval chain are designated with `actionType === 'approve'`.
 */
export function countApprovers<T extends { actionType?: string }>(
  chain: T[] | null | undefined
): number {
  if (!Array.isArray(chain)) return 0;
  return chain.filter((s) => Boolean(s) && s?.actionType === 'approve').length;
}

/**
 * Returns true if the approval chain has at least one designated Approver.
 */
export function hasAtLeastOneApprover<T extends { actionType?: string }>(
  chain: T[] | null | undefined
): boolean {
  return countApprovers(chain) >= 1;
}

/**
 * Legacy helper kept for explicit opt-in callers only.
 * Under Flexible Multi-Approver Runtime Governance, pipelines may configure 1 or more
 * approvers at design time; the single-approval invariant is enforced atomically at runtime
 * ("First-to-Approve wins; remaining approvers auto-demote to Endorser/Noted only").
 */
export function enforceSingleApprover<T extends { actionType?: string }>(
  chain: T[]
): T[] {
  const safeChain = Array.isArray(chain) ? chain.filter(Boolean) : [];
  if (safeChain.length === 0) return [];

  const approverIndices: number[] = [];
  safeChain.forEach((s, idx) => {
    if (s?.actionType === 'approve') {
      approverIndices.push(idx);
    }
  });

  if (approverIndices.length <= 1) return safeChain;

  // Keep only the last approver as 'approve', demote earlier ones to 'endorse'
  const lastApproverIdx = approverIndices[approverIndices.length - 1];
  return safeChain.map((s, idx) => {
    if (idx !== lastApproverIdx && s?.actionType === 'approve') {
      return { ...s, actionType: 'endorse' };
    }
    return s;
  });
}

/**
 * Normalizes an arbitrary approval chain:
 * 1. Filters null/undefined entries defensively
 * 2. Groups steps by their existing stage order (preserving all configured Approvers)
 * 3. Renumbers all stages strictly sequentially 1..M (eliminates duplicate stage numbers)
 * 4. Sets step.stageIndex = sequential stage index
 * 5. Sets step.stageName = formatStageTitle(sequentialStageIndex, countInStage)
 * 6. Re-indexes step numbers 1..N
 */
export function normalizeApprovalStages<T extends { stageIndex?: number; stageName?: string; step?: number; actionType?: string }>(
  chain: T[]
): T[] {
  const safeChain = Array.isArray(chain) ? chain.filter(Boolean) : [];
  if (safeChain.length === 0) return [];

  // Group steps preserving stage appearance order and all configured approvers
  const stageMap = new Map<number, T[]>();
  const seenIndices: number[] = [];

  safeChain.forEach((step) => {
    const rawIdx = Math.max(1, Math.floor(step.stageIndex || 1));
    if (!stageMap.has(rawIdx)) {
      stageMap.set(rawIdx, []);
      seenIndices.push(rawIdx);
    }
    stageMap.get(rawIdx)!.push(step);
  });

  // Preserve stages order as they appear in the chain
  // (Do NOT sort seenIndices numerically, which would revert intentional user stage reorderings)

  let globalStepCounter = 1;
  const normalized: T[] = [];

  seenIndices.forEach((oldIdx, stageOrderIdx) => {
    const newStageIndex = stageOrderIdx + 1;
    const stepsInStage = stageMap.get(oldIdx) || [];
    const count = stepsInStage.length;
    const stageTitle = formatStageTitle(newStageIndex, count);

    stepsInStage.forEach((step) => {
      normalized.push({
        ...step,
        step: globalStepCounter++,
        stageIndex: newStageIndex,
        stageName: stageTitle,
      });
    });
  });

  return normalized;
}

export function findMatchedSignatoryForStep(
  step: { signatoryUid?: string; signatoryEmail?: string } | null | undefined,
  signatories: InstitutionalSignatory[]
): InstitutionalSignatory | undefined {
  if (!step || !Array.isArray(signatories)) return undefined;
  const cleanEmail = (step.signatoryEmail || '').trim().toLowerCase();
  const cleanUid = (step.signatoryUid || '').trim();
  if (!cleanUid && !cleanEmail) return undefined;
  return signatories.find(
    (s) =>
      Boolean(s) &&
      ((cleanUid && (s.id === cleanUid || s.uid === cleanUid)) ||
        (cleanEmail && s.email && s.email.trim().toLowerCase() === cleanEmail))
  );
}

/**
 * Filters out any workflow step or template entry whose assigned signatory is inactive
 * or not eligible for the target document's Workflow Scope (`proposal` | `liquidation` | `par`).
 */
export function filterTemplateStepsBySignatoryScope<
  T extends {
    id?: string;
    stageIndex?: number;
    stageName?: string;
    step?: number;
    actionType?: string;
    role?: string;
    roleTitle?: string;
    signatoryUid?: string;
    signatoryEmail?: string;
  }
>(
  steps: T[],
  allSignatories: InstitutionalSignatory[],
  docType: WorkflowDocumentType,
  options?: { preserveBuiltinSasGate?: boolean; normalize?: boolean }
): T[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  if (!Array.isArray(allSignatories) || allSignatories.length === 0) {
    return options?.normalize ? normalizeApprovalStages(steps) : steps;
  }

  const filtered = steps.filter((step) => {
    if (!step) return false;
    if (
      options?.preserveBuiltinSasGate &&
      (step.role === 'sas_head' || step.role === 'sas_coordinator')
    ) {
      return true;
    }

    const matched = findMatchedSignatoryForStep(step, allSignatories);
    if (matched) {
      return matched.isActive !== false && isSignatoryApplicableTo(matched, docType);
    }

    const hasExplicitSigner = Boolean(
      (step.signatoryUid && step.signatoryUid.trim()) ||
      (step.signatoryEmail && step.signatoryEmail.trim())
    );
    if (hasExplicitSigner) {
      // Built-in SAS Head is configured via sas-signatory service rather than institutional_signatories
      if (step.role === 'sas_head' || step.role === 'sas_coordinator' || step.signatoryUid === 'sas_admin') {
        return true;
      }
      return false;
    }

    // Generic role placeholder without explicit signer ID
    if (docType !== 'liquidation') {
      const roleLower = String(step.role || '').toLowerCase();
      const titleLower = String(step.roleTitle || '').toLowerCase();
      if (roleLower === 'accountant' || titleLower.includes('accountant') || titleLower.includes('auditor')) {
        return false;
      }
    }
    return true;
  });

  return options?.normalize ? normalizeApprovalStages(filtered) : filtered;
}

