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
 * Ensures that an approval chain has AT MOST one approver across the entire pipeline.
 * If multiple approvers exist, only the last eligible approver remains 'approve',
 * and all prior approvers are converted to 'endorse'.
 */
export function enforceSingleApprover<T extends { actionType?: string }>(
  chain: T[]
): T[] {
  if (!chain || chain.length === 0) return chain;

  const approverIndices: number[] = [];
  chain.forEach((s, idx) => {
    if (s.actionType === 'approve') {
      approverIndices.push(idx);
    }
  });

  if (approverIndices.length <= 1) return chain;

  // Keep only the last approver as 'approve', demote earlier ones to 'endorse'
  const lastApproverIdx = approverIndices[approverIndices.length - 1];
  return chain.map((s, idx) => {
    if (idx !== lastApproverIdx && s.actionType === 'approve') {
      return { ...s, actionType: 'endorse' };
    }
    return s;
  });
}

/**
 * Normalizes an arbitrary approval chain:
 * 1. Groups steps by their existing stage order
 * 2. Renumbers all stages strictly sequentially 1..M (eliminates duplicate stage numbers)
 * 3. Sets step.stageIndex = sequential stage index
 * 4. Sets step.stageName = formatStageTitle(sequentialStageIndex, countInStage)
 * 5. Re-indexes step numbers 1..N
 * 6. Enforces that at most 1 approver exists across the pipeline
 */
export function normalizeApprovalStages<T extends { stageIndex?: number; stageName?: string; step?: number; actionType?: string }>(
  chain: T[]
): T[] {
  if (!chain || chain.length === 0) return [];

  // Enforce single approver invariant across the pipeline
  const singleApproverChain = enforceSingleApprover(chain);

  // Group steps preserving stage appearance order
  const stageMap = new Map<number, T[]>();
  const seenIndices: number[] = [];

  singleApproverChain.forEach((step) => {
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

