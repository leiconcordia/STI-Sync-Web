/**
 * src/app/modules/activity-proposals/services/proposal.service.ts
 *
 * Firestore persistence engine and lifecycle management for Activity Proposals.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type {
  ActivityProposal,
  ProposalFormData,
  ProposalStatus,
} from '../types/proposal.types';

export const PROPOSALS_COLLECTION = 'activity_proposals';

/**
 * Recursively strip all undefined values from Firestore payloads (including nested arrays and objects).
 * Preserves Firestore FieldValues (such as serverTimestamp()) and Dates.
 */
export function sanitizeFirestorePayload<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as any;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    // Keep Firestore FieldValues (serverTimestamp, deleteField, etc.) intact
    if ('_methodName' in (data as any) || (data as any).constructor?.name === 'FieldValue') {
      return data;
    }
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        cleanObj[key] = sanitizeFirestorePayload(value);
      }
    }
    return cleanObj as T;
  }
  return data;
}

/**
 * Generate official STI Activity Proposal Reference Number:
 * Format: AP-[YYYY]-[PREFIX]-[INDEX] (e.g. AP-2026-SAS-001 or AP-2026-IT-002)
 */
export async function generateProposalReferenceNumber(prefix = 'SAS'): Promise<string> {
  const currentYear = new Date().getFullYear();
  try {
    const q = query(
      collection(db, PROPOSALS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const existingCount = snap.size + 1;
    const padded = String(existingCount).padStart(3, '0');
    return `AP-${currentYear}-${prefix.toUpperCase()}-${padded}`;
  } catch (e) {
    const random = Math.floor(100 + Math.random() * 900);
    return `AP-${currentYear}-${prefix.toUpperCase()}-${random}`;
  }
}

/**
 * Save proposal as draft (autosave / manual draft save)
 */
export async function saveProposalDraft(
  formData: ProposalFormData,
  user: { uid: string; name: string; email: string; role?: string },
  existingId?: string
): Promise<{ success: boolean; id: string; referenceNo: string }> {
  const docId = existingId || formData.id || doc(collection(db, PROPOSALS_COLLECTION)).id;
  const docRef = doc(db, PROPOSALS_COLLECTION, docId);

  const referenceNo =
    formData.referenceNo ||
    (await generateProposalReferenceNumber(user.role === 'officer' ? 'ORG' : 'SAS'));

  const payload: any = {
    ...formData,
    id: docId,
    referenceNo,
    status: (formData.status as ProposalStatus) || 'draft',
    currentStepIndex: formData.currentStepIndex ?? 0,
    createdByUid: formData.createdByUid || user.uid,
    createdByName: formData.createdByName || user.name,
    createdByEmail: formData.createdByEmail || user.email,
    creatorRole: formData.creatorRole || (user.role as any) || 'sas_admin',
    updatedAt: serverTimestamp(),
  };

    if (!existingId && !formData.id) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });

  return { success: true, id: docId, referenceNo };
}

/**
 * Submit an Activity Proposal to enter the institutional review pipeline
 */
export async function submitProposalForReview(
  formData: ProposalFormData,
  user: { uid: string; name: string; email: string; role?: string },
  existingId?: string
): Promise<{ success: boolean; id: string; referenceNo: string }> {
  const docId = existingId || formData.id || doc(collection(db, PROPOSALS_COLLECTION)).id;
  const docRef = doc(db, PROPOSALS_COLLECTION, docId);

  const referenceNo =
    formData.referenceNo ||
    (await generateProposalReferenceNumber(user.role === 'officer' ? 'ORG' : 'SAS'));

  // Initialize approval chain statuses for multi-stage execution
  const chain = [...(formData.approvalChain || [])];
  const hasStages = chain.some((s) => typeof s.stageIndex === 'number');
  if (hasStages) {
    chain.forEach((step, idx) => {
      if ((step.stageIndex ?? 1) === 1) {
        chain[idx] = { ...step, status: 'current' };
      } else {
        chain[idx] = { ...step, status: 'waiting' };
      }
    });
  } else if (chain.length > 0) {
    chain[0] = { ...chain[0], status: 'current' };
    for (let i = 1; i < chain.length; i++) {
      chain[i] = { ...chain[i], status: 'waiting' };
    }
  }

  const payload: any = {
    ...formData,
    id: docId,
    referenceNo,
    status: 'under_review' as ProposalStatus,
    approvalChain: chain,
    currentStepIndex: 0,
    currentStageIndex: 1,
    submissionDate:
      formData.submissionDate ||
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    createdByUid: formData.createdByUid || user.uid,
    createdByName: formData.createdByName || user.name,
    createdByEmail: formData.createdByEmail || user.email,
    creatorRole: formData.creatorRole || (user.role as any) || 'sas_admin',
    updatedAt: serverTimestamp(),
  };

  if (!existingId && !formData.id) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });

  return { success: true, id: docId, referenceNo };
}

/**
 * Fetch a single Activity Proposal by ID
 */
export async function getProposalById(id: string): Promise<ActivityProposal | null> {
  const docRef = doc(db, PROPOSALS_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ActivityProposal;
}

/**
 * Delete a draft proposal
 */
export async function deleteProposal(id: string): Promise<void> {
  await deleteDoc(doc(db, PROPOSALS_COLLECTION, id));
}

/**
 * Real-time subscription to proposals
 */
export function subscribeToProposals(
  callback: (proposals: ActivityProposal[]) => void,
  creatorUid?: string
): () => void {
  let q = query(collection(db, PROPOSALS_COLLECTION), orderBy('updatedAt', 'desc'));

  if (creatorUid) {
    q = query(
      collection(db, PROPOSALS_COLLECTION),
      where('createdByUid', '==', creatorUid),
      orderBy('updatedAt', 'desc')
    );
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ActivityProposal[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as ActivityProposal[];
      callback(list);
    },
    (err) => {
      console.error('[ProposalService] Subscription error:', err);
    }
  );
}

/**
 * Endorse or Approve an Activity Proposal by an institutional signatory.
 * Supports multi-stage parallel signing:
 * - In any stage, multiple endorsers can sign in parallel.
 * - Once all signers in the current stage have completed, the next stage unlocks.
 * - When all stages (or the final approver) complete, the proposal transitions to 'approved_president'.
 */
export async function endorseProposal(
  proposalId: string,
  signatory: {
    uid?: string;
    id?: string;
    name: string;
    email: string;
    roleTitle?: string;
    role?: string;
    actionType?: 'endorse' | 'approve';
    signatureUrl?: string;
  },
  remarks = ''
): Promise<{ success: boolean; nextStepIndex: number; isFullyApproved: boolean; stageAdvanced?: boolean }> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Proposal not found');

  const data = snap.data() as ActivityProposal;
  const chain = [...(data.approvalChain || [])];
  if (chain.length === 0) throw new Error('No approval steps found on this proposal');

  const signerUid = signatory.id || signatory.uid || '';
  const signerEmail = (signatory.email || '').toLowerCase();
  const currentStage = data.currentStageIndex ?? 1;

  // 1. Locate the specific step for this signatory that is pending review
  let targetStepIdx = chain.findIndex((s) => {
    const stageMatches = s.stageIndex ? s.stageIndex === currentStage : true;
    const isPending = s.status === 'current' || s.status === 'waiting';
    if (!stageMatches || !isPending) return false;

    if (signerUid && s.signatoryUid === signerUid) return true;
    if (signerEmail && s.signatoryEmail?.toLowerCase() === signerEmail) return true;
    if (signatory.role && s.role === signatory.role) return true;
    return false;
  });

  // Fallback to legacy currentStepIndex if stage match not found
  if (targetStepIdx === -1) {
    targetStepIdx = data.currentStepIndex ?? 0;
  }

  if (targetStepIdx < 0 || targetStepIdx >= chain.length) {
    throw new Error('No pending approval step found for your account on this proposal');
  }

  const targetStep = chain[targetStepIdx];
  const isApproverAction =
    targetStep.actionType === 'approve' ||
    targetStep.role === 'school_president' ||
    signatory.actionType === 'approve' ||
    signatory.role === 'school_president';

  const newStatus = isApproverAction ? 'approved' : 'endorsed';

  // 2. Mark this signatory's step as endorsed/approved
  const effectiveSigUrl = signatory.signatureUrl || targetStep.signatureUrl || '';
  const effectiveRemarks = remarks || targetStep.remarks || '';
  const signedAt = new Date().toISOString();

  const updatedStep: Record<string, any> = {
    ...targetStep,
    status: newStatus,
    signatoryName: signatory.name || targetStep.signatoryName || '',
    signatoryEmail: signatory.email || targetStep.signatoryEmail || '',
    signedAt,
  };

  if (effectiveSigUrl) {
    updatedStep.signatureUrl = effectiveSigUrl;
  } else {
    delete updatedStep.signatureUrl;
  }

  if (effectiveRemarks) {
    updatedStep.remarks = effectiveRemarks;
  } else {
    delete updatedStep.remarks;
  }

  chain[targetStepIdx] = updatedStep as any;

  // Clean the entire chain array of any undefined properties
  const sanitizedChain = chain.map((step) => {
    const s: Record<string, any> = { ...step };
    Object.keys(s).forEach((k) => {
      if (s[k] === undefined) {
        delete s[k];
      }
    });
    return s;
  });

  // 3. Determine if current stage has completed all required signatures
  const hasStages = sanitizedChain.some((s) => typeof s.stageIndex === 'number');
  let isFullyApproved = false;
  let nextStageIndex = currentStage;
  let stageAdvanced = false;

  if (hasStages) {
    // Check all steps belonging to currentStage
    const currentStageSteps = sanitizedChain.filter((s) => (s.stageIndex ?? 1) === currentStage);
    const allStageStepsCompleted = currentStageSteps.every(
      (s) => s.status === 'endorsed' || s.status === 'approved'
    );

    if (allStageStepsCompleted) {
      // Find the next sequential stage number
      const futureStages = sanitizedChain
        .map((s) => s.stageIndex ?? 1)
        .filter((stg) => stg > currentStage)
        .sort((a, b) => a - b);

      if (futureStages.length > 0) {
        nextStageIndex = futureStages[0];
        stageAdvanced = true;

        // Activate all signatories belonging to the new stage
        sanitizedChain.forEach((s, idx) => {
          if ((s.stageIndex ?? 1) === nextStageIndex && s.status === 'waiting') {
            sanitizedChain[idx] = { ...s, status: 'current' };
          }
        });
      } else {
        // No more stages! Entire pipeline is complete
        isFullyApproved = true;
      }
    }
  } else {
    // Legacy linear step progression
    const nextIdx = targetStepIdx + 1;
    isFullyApproved = nextIdx >= sanitizedChain.length;
    if (!isFullyApproved && sanitizedChain[nextIdx]) {
      sanitizedChain[nextIdx] = { ...sanitizedChain[nextIdx], status: 'current' };
    }
  }

  // 4. Update Firestore Document with sanitized payload
  const rawUpdates: any = {
    approvalChain: sanitizedChain,
    currentStepIndex: targetStepIdx + 1,
    currentStageIndex: nextStageIndex,
    updatedAt: serverTimestamp(),
  };

  if (isFullyApproved) {
    rawUpdates.status = 'approved_president';
    rawUpdates.approvedAt = serverTimestamp();
  }

  const updates = sanitizeFirestorePayload(rawUpdates);
  await updateDoc(docRef, updates);

  return {
    success: true,
    nextStepIndex: targetStepIdx + 1,
    isFullyApproved,
    stageAdvanced,
  };
}

/**
 * Return an Activity Proposal for revision
 */
export async function returnProposalForRevision(
  proposalId: string,
  signatory: { uid?: string; id?: string; name: string; email: string; roleTitle?: string; role?: string },
  remarks: string
): Promise<{ success: boolean }> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Proposal not found');

  const data = snap.data() as ActivityProposal;
  const chain = [...(data.approvalChain || [])];
  const signerUid = signatory.id || signatory.uid || '';
  const signerEmail = (signatory.email || '').toLowerCase();
  const currentStage = data.currentStageIndex ?? 1;

  // Locate the reviewer's step
  let targetStepIdx = chain.findIndex((s) => {
    const stageMatches = s.stageIndex ? s.stageIndex === currentStage : true;
    if (!stageMatches) return false;
    if (signerUid && s.signatoryUid === signerUid) return true;
    if (signerEmail && s.signatoryEmail?.toLowerCase() === signerEmail) return true;
    if (signatory.role && s.role === signatory.role) return true;
    return false;
  });

  if (targetStepIdx === -1) {
    targetStepIdx = data.currentStepIndex ?? 0;
  }

  if (targetStepIdx >= 0 && targetStepIdx < chain.length) {
    const s: Record<string, any> = {
      ...chain[targetStepIdx],
      status: 'returned',
    };
    if (remarks) {
      s.remarks = remarks;
    } else {
      delete s.remarks;
    }
    Object.keys(s).forEach((k) => {
      if (s[k] === undefined) delete s[k];
    });
    chain[targetStepIdx] = s as ProposalApprovalStep;
  }

  const sanitizedChain = chain.map((step) => {
    const s: Record<string, any> = { ...step };
    Object.keys(s).forEach((k) => {
      if (s[k] === undefined) delete s[k];
    });
    return s as ProposalApprovalStep;
  });

  const rawUpdates = {
    status: 'returned_for_revision',
    approvalChain: sanitizedChain,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(docRef, sanitizeFirestorePayload(rawUpdates));

  return { success: true };
}


