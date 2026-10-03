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
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import type {
  ActivityProposal,
  ProposalFormData,
  ProposalStatus,
} from '../types/proposal.types';

export const ACTIVITIES_COLLECTION = 'activities';
export const PROPOSALS_COLLECTION = ACTIVITIES_COLLECTION;
export const EVENTS_COLLECTION = ACTIVITIES_COLLECTION;

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
 * Sync an Activity Proposal directly to the `events` collection.
 * This guarantees that every submitted or drafted Activity Proposal appears immediately
 * in both the Admin Activity Approvals table and the Officer Activity Management table.
 */
export async function syncProposalToEventsCollection(
  proposal: Partial<ActivityProposal | ProposalFormData>,
  mappedStatus: 'draft' | 'pending' | 'approved' | 'returned' | 'rejected' | 'completed' = 'pending',
  extraUpdates: Record<string, any> = {}
): Promise<void> {
  if (!proposal.id) return;
  try {
    const eventDocRef = doc(db, EVENTS_COLLECTION, proposal.id);
    const existingSnap = await getDoc(eventDocRef);

    // Map sessions
    let sessions: any[] = [];
    if (proposal.sessions && proposal.sessions.length > 0) {
      sessions = proposal.sessions.map((s, idx) => ({
        id: s.id || `sess_${idx + 1}`,
        title: s.title || proposal.title || 'Main Program',
        date: s.date || proposal.date || '',
        startTime: s.startTime || proposal.startTime || '08:00',
        endTime: s.endTime || proposal.endTime || '12:00',
        venueId: s.venueId || 'campus_venue',
        customVenueName: s.venueName || proposal.venueName || 'STI Campus',
        timeInOpen: '',
        timeInClose: '',
        hasTimeOut: false,
        timeOutOpen: '',
        timeOutClose: '',
      }));
    } else if (proposal.date) {
      sessions = [
        {
          id: 'sess_1',
          title: proposal.title || 'Main Program',
          date: proposal.date,
          startTime: proposal.startTime || '08:00',
          endTime: proposal.endTime || '12:00',
          venueId: 'campus_venue',
          customVenueName: proposal.venueName || 'STI Campus',
          timeInOpen: '',
          timeInClose: '',
          hasTimeOut: false,
          timeOutOpen: '',
          timeOutClose: '',
        },
      ];
    }

    // Map budget items
    const budgetItems =
      proposal.financialProjections?.expenses?.map((exp, idx) => ({
        id: exp.id || `b_${idx + 1}`,
        item: exp.description || 'Expense Item',
        description: exp.remarks || '',
        quantity: 1,
        unitCost: Number(exp.totalAmount || exp.thisYearProposed || 0),
        approvedAmount: Number(exp.totalAmount || exp.thisYearProposed || 0),
      })) || [];

    const totalBudget =
      Number(proposal.financialProjections?.totalExpenses || 0) ||
      budgetItems.reduce((acc, item) => acc + item.approvedAmount, 0);

    const depts = proposal.targetAudience?.departments || [];
    const levels = proposal.targetAudience?.academicLevels || [];
    const targetAcademicLevel =
      levels.includes('SHS') && levels.includes('College')
        ? 'BOTH'
        : levels.includes('SHS')
        ? 'SHS'
        : 'COLLEGE';

    const currentYear = new Date().getFullYear();

    const existingData = existingSnap.exists() ? existingSnap.data() : {};

    const status = mappedStatus === 'approved' ? 'approved' : mappedStatus === 'completed' ? 'completed' : mappedStatus;
    const lifecycleStatus =
      mappedStatus === 'approved'
        ? 'approved'
        : mappedStatus === 'completed'
        ? 'completed'
        : mappedStatus === 'pending'
        ? 'pending_review'
        : mappedStatus;

    const eventPayload: Record<string, any> = {
      id: proposal.id,
      referenceId: proposal.referenceNo || `AP-${currentYear}-SAS-001`,
      title: proposal.title || 'Untitled Activity',
      tagline: (proposal as any).tagline || existingData.tagline || null,
      description: proposal.description || '',
      objectives: proposal.objectives || [],
      bannerImageUrl:
        (proposal as any).bannerImageUrl !== undefined
          ? (proposal as any).bannerImageUrl
          : existingData.bannerImageUrl || null,
      budgetCustodians:
        (proposal as any).budgetCustodians || existingData.budgetCustodians || [],
      totalAllocatedBudget:
        (proposal as any).totalAllocatedBudget ?? existingData.totalAllocatedBudget ?? 0,
      scannerPinCode: (proposal as any).scannerPinCode || existingData.scannerPinCode || null,
      scannerUserIds: (proposal as any).scannerUserIds || existingData.scannerUserIds || [],
      isVisible: existingData.isVisible !== undefined ? existingData.isVisible : true,
      visibleToStudents:
        (proposal as any).visibleToStudents !== undefined
          ? (proposal as any).visibleToStudents
          : existingData.visibleToStudents !== undefined
          ? existingData.visibleToStudents
          : mappedStatus === 'approved',
      visibilityStart: (proposal as any).visibilityStart || existingData.visibilityStart || null,
      eventTypeId: 'activity',
      customEventTypeName: 'Activity Proposal (Form AP-01)',
      eventCategoryId: 'campus_activity',
      customEventCategoryName: 'Official Campus Activity',
      hostingOrgId:
        (proposal as any).hostingOrgId ||
        (proposal as any).organizationId ||
        existingData.hostingOrgId ||
        (proposal.creatorRole === 'officer' ? (proposal as any).orgId || 'student_org' : 'sao_admin'),
      semesterId: (proposal as any).semesterId || existingData.semesterId || 'current_semester',
      schoolYear: (proposal as any).schoolYear || existingData.schoolYear || `${currentYear}-${currentYear + 1}`,
      targetAcademicLevel,
      targetCourses: proposal.targetAudience?.courseCodes || depts,
      targetYearLevels: (proposal.targetAudience?.yearLevels || []).map(String),
      sessions,
      venueId: proposal.venueId || 'campus_venue',
      customVenueName: proposal.venueName || (sessions[0]?.customVenueName) || 'STI Campus',
      eventFormat: 'On-Campus',
      expectedParticipantCount: (proposal.targetAudience as any)?.estimatedAttendance || 100,
      budgetItems,
      totalApprovedBudget: totalBudget,
      status,
      lifecycleStatus,
      proposalStatus: mappedStatus,
      isActivityProposal: true,
      proposalId: proposal.id,
      proponents: (proposal as any).proponents || existingData.proponents || [],
      organizers: (proposal as any).organizers || existingData.organizers || [],
      successIndicators: (proposal as any).successIndicators || existingData.successIndicators || [],
      mechanics: (proposal as any).mechanics || existingData.mechanics || [],
      materials: (proposal as any).materials || existingData.materials || [],
      tasks: (proposal as any).tasks || existingData.tasks || [],
      marketingPlan: (proposal as any).marketingPlan || existingData.marketingPlan || [],
      documentationPlan: (proposal as any).documentationPlan || existingData.documentationPlan || [],
      financialProjections: (proposal as any).financialProjections || existingData.financialProjections || null,
      approvalChain: (proposal as any).approvalChain || existingData.approvalChain || [],
      currentStepIndex: (proposal as any).currentStepIndex ?? existingData.currentStepIndex ?? 0,
      currentStageIndex: (proposal as any).currentStageIndex ?? existingData.currentStageIndex ?? 1,
      submissionDate: (proposal as any).submissionDate || existingData.submissionDate || null,
      createdBy: proposal.createdByUid || 'creator',
      createdByName: proposal.createdByName || '',
      createdByEmail: proposal.createdByEmail || '',
      creatorRole: proposal.creatorRole || 'sas_admin',
      updatedAt: serverTimestamp(),
      ...extraUpdates,
    };

    if (!existingSnap.exists()) {
      eventPayload.createdAt = (proposal as any).createdAt || serverTimestamp();
    }

    await setDoc(eventDocRef, sanitizeFirestorePayload(eventPayload), { merge: true });
  } catch (err) {
    console.error('[syncProposalToEventsCollection] Failed to sync proposal to events table:', err);
  }
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

  // Sync draft to events collection so it appears under "Drafts"
  await syncProposalToEventsCollection(payload, 'draft');

  return { success: true, id: docId, referenceNo };
}

/**
 * Submit an Activity Proposal to enter the institutional review pipeline.
 * On resubmission (if proposal was returned for revision):
 * - Preserves the entire approval chain signatories and stages
 * - Automatically resets step statuses back to Stage 1 ('current')
 * - Updates status back to 'under_review' and syncs to 'pending' in the Activities table
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

  // Initialize or reset approval chain statuses for multi-stage execution
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

  const isSasAdmin = ['sas_admin', 'admin', 'sao_admin', 'sas'].includes(
    ((formData.creatorRole || user.role || '') as string).toLowerCase().trim()
  );

  const payload: any = {
    ...formData,
    id: docId,
    referenceNo,
    status: 'under_review' as ProposalStatus,
    proposalStatus: 'pending',
    lifecycleStatus: 'pending_review',
    isOfficerProposal: !isSasAdmin,
    isSasDirect: false,
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
    creatorRole: formData.creatorRole || (user.role as any) || (isSasAdmin ? 'sas_admin' : 'officer'),
    updatedAt: serverTimestamp(),
  };

  const isResubmission =
    formData.status === 'returned' ||
    (formData as any).proposalStatus === 'returned' ||
    Boolean((formData as any).stepRevisionRemarks);

  if (isResubmission) {
    payload.stepRevisionRemarks = null;
    payload.returnFlags = [];
    payload.proposalHistory = arrayUnion({
      id: `hist_resubmit_${Date.now()}`,
      action: 'resubmitted',
      version: 2,
      performedBy: user.uid,
      performedByName: user.name,
      performedAt: new Date().toISOString(),
      remarks: 'Proposal revised to address step directives and resubmitted for review.',
    });
  }

  if (!existingId && !formData.id) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(docRef, sanitizeFirestorePayload(payload), { merge: true });

  // Sync to events collection as pending review (must follow signatory pipeline)
  await syncProposalToEventsCollection(payload, 'pending');

  return { success: true, id: docId, referenceNo };
}

/**
 * Fetch a single Activity Proposal by ID (primary from activities collection, fallback to legacy)
 */
export async function getProposalById(id: string): Promise<ActivityProposal | null> {
  const docRef = doc(db, ACTIVITIES_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as ActivityProposal;
  }
  try {
    const legacySnap = await getDoc(doc(db, 'activity_proposals', id));
    if (legacySnap.exists()) {
      return { id: legacySnap.id, ...legacySnap.data() } as ActivityProposal;
    }
  } catch (e) {}
  try {
    const legacyEvSnap = await getDoc(doc(db, 'events', id));
    if (legacyEvSnap.exists()) {
      return { id: legacyEvSnap.id, ...legacyEvSnap.data() } as ActivityProposal;
    }
  } catch (e) {}
  return null;
}

/**
 * Delete a draft proposal
 */
export async function deleteProposal(id: string): Promise<void> {
  await deleteDoc(doc(db, ACTIVITIES_COLLECTION, id));
  try {
    await deleteDoc(doc(db, 'activity_proposals', id));
  } catch (e) {}
  try {
    await deleteDoc(doc(db, 'events', id));
  } catch (e) {}
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
    rawUpdates.proposalStatus = 'approved';
    rawUpdates.lifecycleStatus = 'approved';
    rawUpdates.approvedAt = serverTimestamp();
  }

  const updates = sanitizeFirestorePayload(rawUpdates);
  await updateDoc(docRef, updates);

  // Sync to events collection
  await syncProposalToEventsCollection(
    { ...data, approvalChain: sanitizedChain },
    isFullyApproved ? 'approved' : 'pending',
    {
      currentStageIndex: nextStageIndex,
      status: isFullyApproved ? 'approved' : 'pending',
      lifecycleStatus: isFullyApproved ? 'approved' : 'pending_review',
      proposalStatus: isFullyApproved ? 'approved' : 'pending',
      ...(isFullyApproved ? { approvedAt: serverTimestamp() } : {}),
    }
  );


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

  // Sync to events collection as 'returned'
  await syncProposalToEventsCollection(
    { ...data, approvalChain: sanitizedChain },
    'returned',
    {
      adviserRemarks: remarks,
      returnDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    }
  );

  return { success: true };
}

/**
 * Reject an Activity Proposal (terminal state, preserves record for audit, title not banned)
 */
export async function rejectProposal(
  proposalId: string,
  signatory: { uid?: string; id?: string; name: string; email: string; roleTitle?: string; role?: string },
  reason: string
): Promise<{ success: boolean }> {
  const docRef = doc(db, PROPOSALS_COLLECTION, proposalId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Proposal not found');

  const data = snap.data() as ActivityProposal;

  const rawUpdates = {
    status: 'rejected' as ProposalStatus,
    rejectionReason: reason,
    rejectedAt: serverTimestamp(),
    rejectedByName: signatory.name,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(docRef, sanitizeFirestorePayload(rawUpdates));

  // Sync to events collection as 'rejected'
  await syncProposalToEventsCollection(data, 'rejected', {
    rejectionReason: reason,
  });

  return { success: true };
}



