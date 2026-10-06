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
    const existingData = existingSnap.exists() ? existingSnap.data() : {};

    // Sessions are only created when an activity is approved and attendance scanners are configured
    let sessions: any[] = [];
    if (existingSnap.exists() && Array.isArray(existingData.sessions) && existingData.sessions.length > 0) {
      sessions = existingData.sessions;
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
    const status = mappedStatus === 'approved' ? 'approved' : mappedStatus === 'completed' ? 'completed' : mappedStatus;
    const lifecycleStatus =
      mappedStatus === 'approved'
        ? 'approved'
        : mappedStatus === 'completed'
        ? 'completed'
        : mappedStatus === 'pending'
        ? 'pending_review'
        : mappedStatus;

      const isOfficerProposalVal =
        (proposal as any).isOfficerProposal !== undefined
          ? Boolean((proposal as any).isOfficerProposal)
          : existingData.isOfficerProposal !== undefined
          ? Boolean(existingData.isOfficerProposal)
          : proposal.creatorRole === 'officer' || proposal.creatorRole === 'student_officer';

      const resolvedOrgId =
        (proposal as any).hostingOrgId ||
        (proposal as any).organizationId ||
        existingData.hostingOrgId ||
        existingData.organizationId ||
        (isOfficerProposalVal ? (proposal as any).orgId || 'student_org' : 'sas');

      const resolvedCreatorRole =
        proposal.creatorRole ||
        existingData.creatorRole ||
        (isOfficerProposalVal ? 'officer' : 'sas_admin');

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
        isVisible:
          (proposal as any).isVisible !== undefined
            ? Boolean((proposal as any).isVisible)
            : existingData.isVisible !== undefined
            ? Boolean(existingData.isVisible)
            : false,
        visibleToStudents:
          (proposal as any).visibleToStudents !== undefined
            ? Boolean((proposal as any).visibleToStudents)
            : existingData.visibleToStudents !== undefined
            ? Boolean(existingData.visibleToStudents)
            : false,
        isPublished:
          (proposal as any).isPublished !== undefined
            ? Boolean((proposal as any).isPublished)
            : existingData.isPublished !== undefined
            ? Boolean(existingData.isPublished)
            : false,
        visibilityStart: (proposal as any).visibilityStart || existingData.visibilityStart || null,
        eventTypeId: 'activity',
        customEventTypeName: 'Activity Proposal (Form AP-01)',
        eventCategoryId: 'campus_activity',
        customEventCategoryName: 'Official Campus Activity',
        isOfficerProposal: isOfficerProposalVal,
        hostingOrgId: resolvedOrgId,
        organizationId: (proposal as any).organizationId || existingData.organizationId || resolvedOrgId,
        semesterId: (proposal as any).semesterId || existingData.semesterId || 'current_semester',
        schoolYear: (proposal as any).schoolYear || existingData.schoolYear || `${currentYear}-${currentYear + 1}`,
        targetAcademicLevel,
        allStudents:
          proposal.targetAudience?.allStudents === true ||
          proposal.targetAudience?.scope === 'all' ||
          (targetAcademicLevel === 'BOTH' && (proposal.targetAudience?.courseCodes || []).length === 0),
        targetAudienceScope: proposal.targetAudience?.scope || (proposal.targetAudience?.allStudents ? 'all' : 'specific'),
        targetCourses: proposal.targetAudience?.courseCodes || [],
        targetYearLevels: (proposal.targetAudience?.yearLevels || []).map(String),
        targetAudience: proposal.targetAudience || null,
        targetSections: proposal.targetAudience?.sections || [],
        date: proposal.date || existingData.date || '',
        startTime: proposal.startTime || existingData.startTime || '08:00',
        endTime: proposal.endTime || existingData.endTime || '12:00',
        venueName: proposal.venueName || existingData.venueName || 'STI Campus',
        venueId: proposal.venueId || existingData.venueId || 'campus_venue',
        customVenueName: proposal.venueName || existingData.customVenueName || 'STI Campus',
        sessions,
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
        creatorRole: resolvedCreatorRole,
        updatedAt: serverTimestamp(),
        ...extraUpdates,
      };

    if (!existingSnap.exists()) {
      eventPayload.createdAt = (proposal as any).createdAt || serverTimestamp();
    }

    await setDoc(eventDocRef, sanitizeFirestorePayload(eventPayload), { merge: true });

    // Dual-sync to 'events' collection for mobile app
    try {
      const mirrorRef = doc(db, 'events', proposal.id);
      await setDoc(mirrorRef, sanitizeFirestorePayload(eventPayload), { merge: true });
    } catch (mirrorErr) {
      console.warn('[syncProposalToEventsCollection] Failed to mirror to events collection:', mirrorErr);
    }
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
  user: { uid: string; name: string; email: string; role?: string; organizationId?: string },
  existingId?: string
): Promise<{ success: boolean; id: string; referenceNo: string }> {
  const docId = existingId || formData.id || doc(collection(db, PROPOSALS_COLLECTION)).id;
  const docRef = doc(db, PROPOSALS_COLLECTION, docId);

  const isOfficer =
    formData.isOfficerProposal === true ||
    user.role === 'officer' ||
    formData.creatorRole === 'officer' ||
    formData.creatorRole === 'student_officer';

  const referenceNo =
    formData.referenceNo ||
    (await generateProposalReferenceNumber(isOfficer ? 'ORG' : 'SAS'));

  const payload: any = {
    ...formData,
    id: docId,
    referenceNo,
    status: (formData.status as ProposalStatus) || 'draft',
    currentStepIndex: formData.currentStepIndex ?? 0,
    createdByUid: formData.createdByUid || user.uid,
    createdByName: formData.createdByName || user.name,
    createdByEmail: formData.createdByEmail || user.email,
    creatorRole: formData.creatorRole || (user.role as any) || (isOfficer ? 'officer' : 'sas_admin'),
    isOfficerProposal: formData.isOfficerProposal !== undefined ? formData.isOfficerProposal : isOfficer,
    organizationId: formData.organizationId || (user as any).organizationId || (formData as any).hostingOrgId || (isOfficer ? 'student_org' : 'sas'),
    hostingOrgId: formData.hostingOrgId || formData.organizationId || (user as any).organizationId || (isOfficer ? 'student_org' : 'sas'),
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
  user: { uid: string; name: string; email: string; role?: string; organizationId?: string },
  existingId?: string
): Promise<{ success: boolean; id: string; referenceNo: string }> {
  const docId = existingId || formData.id || doc(collection(db, PROPOSALS_COLLECTION)).id;
  const docRef = doc(db, PROPOSALS_COLLECTION, docId);

  const isOfficer =
    formData.isOfficerProposal === true ||
    ((formData.creatorRole || user.role || '') as string).toLowerCase().trim() === 'officer' ||
    ((formData.creatorRole || user.role || '') as string).toLowerCase().trim() === 'student_officer';

  const isSasAdmin = !isOfficer && ['sas_admin', 'admin', 'sao_admin', 'sas'].includes(
    ((formData.creatorRole || user.role || '') as string).toLowerCase().trim()
  );

  const referenceNo =
    formData.referenceNo ||
    (await generateProposalReferenceNumber(isOfficer ? 'ORG' : 'SAS'));

  const isResubmission =
    formData.status === 'returned' ||
    (formData as any).proposalStatus === 'returned' ||
    (formData as any).isReturned === true ||
    Boolean((formData as any).stepRevisionRemarks && Object.keys((formData as any).stepRevisionRemarks).length > 0) ||
    Boolean((formData as any).returnFlags && (formData as any).returnFlags.length > 0);

  let currentVersion = Number((formData as any).version || 1);
  if (isResubmission) {
    currentVersion += 1;
  }

  // Initialize or reset approval chain statuses for multi-stage execution
  const chain = [...(formData.approvalChain || [])];
  const hasStages = chain.some((s) => typeof s.stageIndex === 'number');
  if (hasStages) {
    chain.forEach((step, idx) => {
      const cleanStep: any = { ...step };
      if (isResubmission) {
        delete cleanStep.signatureUrl;
        delete cleanStep.signedAt;
        delete cleanStep.remarks;
      }
      if ((step.stageIndex ?? 1) === 1) {
        chain[idx] = { ...cleanStep, status: 'current' };
      } else {
        chain[idx] = { ...cleanStep, status: 'waiting' };
      }
    });
  } else if (chain.length > 0) {
    chain.forEach((step, idx) => {
      const cleanStep: any = { ...step };
      if (isResubmission) {
        delete cleanStep.signatureUrl;
        delete cleanStep.signedAt;
        delete cleanStep.remarks;
      }
      chain[idx] = { ...cleanStep, status: idx === 0 ? 'current' : 'waiting' };
    });
  }

  const payload: any = {
    ...formData,
    id: docId,
    referenceNo,
    status: 'under_review' as ProposalStatus,
    proposalStatus: 'pending',
    lifecycleStatus: 'pending_review',
    isOfficerProposal: isOfficer,
    isSasDirect: isSasAdmin,
    organizationId: formData.organizationId || (user as any).organizationId || (formData as any).hostingOrgId || (isOfficer ? 'student_org' : 'sas'),
    hostingOrgId: formData.hostingOrgId || formData.organizationId || (user as any).organizationId || (isOfficer ? 'student_org' : 'sas'),
    approvalChain: chain,
    currentStepIndex: 0,
    currentStageIndex: 1,
    version: currentVersion,
    versionLabel: `v${currentVersion}.0`,
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
    creatorRole: formData.creatorRole || (user.role as any) || (isOfficer ? 'officer' : 'sas_admin'),
    updatedAt: serverTimestamp(),
  };

  if (isResubmission) {
    const versionSnapshot = {
      version: currentVersion - 1,
      versionLabel: `v${currentVersion - 1}.0`,
      archivedAt: new Date().toISOString(),
      approvalChainSnapshot: (formData.approvalChain || []).map((s) => ({ ...s })),
      returnFlags: formData.returnFlags || [],
      stepRevisionRemarks: formData.stepRevisionRemarks || {},
      resubmittedBy: user.name,
      resubmittedByUid: user.uid,
    };

    payload.versionHistory = arrayUnion(versionSnapshot);
    payload.stepRevisionRemarks = null;
    payload.returnFlags = [];
    payload.isReturned = false;
    payload.adviserRemarks = null;
    payload.proposalHistory = arrayUnion({
      id: `hist_resubmit_${Date.now()}`,
      action: 'resubmitted',
      version: currentVersion,
      performedBy: user.uid,
      performedByName: user.name,
      performedAt: new Date().toISOString(),
      remarks: `Proposal revised to v${currentVersion}.0 and resubmitted for Stage 1 review.`,
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
  try {
    const propSnap = await getDoc(doc(db, 'proposals', id));
    if (propSnap.exists()) {
      return { id: propSnap.id, ...propSnap.data() } as ActivityProposal;
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
  const isSchoolAdmin = targetStep.role === 'school_administrator' || signatory.role === 'school_administrator';
  const isPresident = targetStep.role === 'school_president' || signatory.role === 'school_president';

  // Determine whether this action is an approval or an endorsement
  let newStatus: 'endorsed' | 'approved' = 'endorsed';
  if (isPresident) {
    newStatus = 'approved';
  } else if (isSchoolAdmin) {
    newStatus = signatory.actionType === 'approve' ? 'approved' : 'endorsed';
  } else if (signatory.actionType === 'approve' || targetStep.actionType === 'approve') {
    newStatus = 'approved';
  }

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

  // Dual-Approver Resolution within the Executive Stage:
  if (isSchoolAdmin && newStatus === 'approved') {
    // Administrator chose to fully authorize & approve: waive remaining approver steps in this stage
    chain.forEach((s, idx) => {
      if (
        (s.stageIndex ?? 1) === currentStage &&
        idx !== targetStepIdx &&
        (s.status === 'waiting' || s.status === 'current') &&
        (s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator')
      ) {
        chain[idx] = {
          ...s,
          status: 'waived',
          remarks: `Step waived — Activity proposal authorized and fully approved by School Administrator (${signatory.name || targetStep.signatoryName})`,
        };
      }
    });
  } else if (isSchoolAdmin && newStatus === 'endorsed') {
    // Administrator chose to endorse and forward to President: activate the President's step
    chain.forEach((s, idx) => {
      if (
        (s.stageIndex ?? 1) === currentStage &&
        idx !== targetStepIdx &&
        s.status === 'waiting'
      ) {
        chain[idx] = {
          ...s,
          status: 'current',
        };
      }
    });
  }

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
      (s) => s.status === 'endorsed' || s.status === 'approved' || s.status === 'waived'
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
  let snap = await getDoc(docRef);
  let data: ActivityProposal | null = snap.exists() ? (snap.data() as ActivityProposal) : null;
  if (!data) {
    for (const col of ['events', 'activity_proposals', 'proposals']) {
      try {
        const fbSnap = await getDoc(doc(db, col, proposalId));
        if (fbSnap.exists()) {
          data = fbSnap.data() as ActivityProposal;
          break;
        }
      } catch {}
    }
  }
  if (!data) throw new Error('Proposal not found');

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
    status: 'returned' as ProposalStatus,
    proposalStatus: 'returned',
    lifecycleStatus: 'returned',
    isReturned: true,
    returnDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    adviserRemarks: remarks || null,
    approvalChain: sanitizedChain,
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, sanitizeFirestorePayload(rawUpdates), { merge: true });

  // Sync to events and activities collection as 'returned' with isReturned: true
  await syncProposalToEventsCollection(
    { ...data, approvalChain: sanitizedChain },
    'returned',
    {
      isReturned: true,
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
  let snap = await getDoc(docRef);
  let data: ActivityProposal | null = snap.exists() ? (snap.data() as ActivityProposal) : null;
  if (!data) {
    for (const col of ['events', 'activity_proposals', 'proposals']) {
      try {
        const fbSnap = await getDoc(doc(db, col, proposalId));
        if (fbSnap.exists()) {
          data = fbSnap.data() as ActivityProposal;
          break;
        }
      } catch {}
    }
  }
  if (!data) throw new Error('Proposal not found');

  const rawUpdates = {
    status: 'rejected' as ProposalStatus,
    proposalStatus: 'rejected',
    lifecycleStatus: 'rejected',
    rejectionReason: reason,
    rejectedAt: serverTimestamp(),
    rejectedByName: signatory.name,
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, sanitizeFirestorePayload(rawUpdates), { merge: true });

  // Sync to events collection as 'rejected'
  await syncProposalToEventsCollection(data, 'rejected', {
    rejectionReason: reason,
  });

  return { success: true };
}



