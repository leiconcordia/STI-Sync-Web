import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { SIGNATORIES_COLLECTION } from '../../signatories/services/signatory.service';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import { getCachedSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import type {
  PostActivityReportDocument,
  PARApprovalStep,
  PARRemark,
  PARFormData,
  PostActivityReportStatus,
} from '../types/par.types';
import { autoArchiveApprovedPAR } from '../../documents/services/document_archive_bridge.service';

export const PAR_COLLECTION = 'post_activity_reports';

/**
 * Strips undefined values from Firestore payloads.
 */
function cleanPayload<T extends Record<string, any>>(obj: T): T {
  const result: any = Array.isArray(obj) ? [] : {};
  Object.keys(obj).forEach((key) => {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !(val instanceof Timestamp) && typeof val.toDate !== 'function') {
        result[key] = cleanPayload(val);
      } else {
        result[key] = val;
      }
    }
  });
  return result;
}

/**
 * Automatically builds the standard STI Post-Activity Report signatory approval chain
 * populated with active institutional signatories from Firestore.
 */
export async function generateDefaultPARSignatoryChain(
  orgId?: string,
  providedSignatories?: InstitutionalSignatory[],
  isSasCreator = false
): Promise<PARApprovalStep[]> {
  let activeSignatories = providedSignatories;

  if (!activeSignatories || activeSignatories.length === 0) {
    try {
      const snap = await getDocs(
        query(collection(db, SIGNATORIES_COLLECTION), where('isActive', '!=', false))
      );
      activeSignatories = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InstitutionalSignatory));
    } catch (e) {
      console.warn('[generateDefaultPARSignatoryChain] Could not fetch signatories:', e);
      activeSignatories = [];
    }
  }

  activeSignatories = (activeSignatories || []).filter((s) => s.isActive !== false);

  if (activeSignatories.length === 0 && isSasCreator) {
    return [];
  }

  const stageGroups: {
    stageName: string;
    stageIndex: number;
    signers: InstitutionalSignatory[];
    defaultAction: 'check' | 'endorse' | 'approve';
  }[] = [];

  const accountedSignatoryIds = new Set<string>();

  // ── Stage 1 Gatekeeper for Student Organizations: Student Affairs & Services (SAS) Clearance ──
  // If created by an organization, SAS must review and clear it first before academic/executive review!
  // If created by SAS internally, this stage is omitted.
  if (!isSasCreator) {
    const sasConfig = getCachedSasSignatoryConfig();
    stageGroups.push({
      stageName: 'Student Affairs & Services (SAS) Clearance',
      stageIndex: 1,
      signers: [
        {
          id: sasConfig.employeeId || 'sas_admin',
          name: sasConfig.name || 'Student Affairs & Services Head',
          email: sasConfig.email || 'sao@ormoc.sti.edu.ph',
          role: 'sas_head' as any,
          roleTitle: sasConfig.roleTitle || 'Student Affairs & Services Head',
          department: sasConfig.department || 'Student Affairs & Services',
          isActive: true,
          isPermanentSigner: true,
          applicableScope: 'all',
          actionType: 'approver',
        },
      ],
      defaultAction: 'approve',
    });
  }

  // 1. Department & Program Endorsement (Adviser, Program Head)
  const programHeads = activeSignatories.filter(
    (s) =>
      s.role === 'program_head' ||
      (s.roleTitle && s.roleTitle.toLowerCase().includes('program head')) ||
      (s.roleTitle && s.roleTitle.toLowerCase().includes('adviser')) ||
      (s.roleTitle && s.roleTitle.toLowerCase().includes('coordinator'))
  );
  if (programHeads.length > 0) {
    stageGroups.push({
      stageName: 'Department & Program Endorsement',
      stageIndex: stageGroups.length + 1,
      signers: programHeads,
      defaultAction: 'endorse',
    });
    programHeads.forEach((s) => accountedSignatoryIds.add(s.id));
  }

  // 2. Academic Affairs Clearance (Academic Head, Dean, SHS Principal)
  const academicHeads = activeSignatories.filter(
    (s) =>
      !accountedSignatoryIds.has(s.id) &&
      (s.role === 'academic_head' ||
        s.role === 'shs_principal' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('academic head')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('dean')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('principal')))
  );
  if (academicHeads.length > 0) {
    stageGroups.push({
      stageName: 'Academic Affairs Clearance',
      stageIndex: stageGroups.length + 1,
      signers: academicHeads,
      defaultAction: 'endorse',
    });
    academicHeads.forEach((s) => accountedSignatoryIds.add(s.id));
  }

  // 3. Administrative Review & Executive Approval (School Admin, School President, SAS Head)
  const executiveHeads = activeSignatories.filter(
    (s) =>
      !accountedSignatoryIds.has(s.id) &&
      (s.role === 'school_administrator' ||
        s.role === 'school_president' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('administrator')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('president')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('student affairs')))
  );
  if (executiveHeads.length > 0) {
    stageGroups.push({
      stageName: 'Executive Clearance & Approval',
      stageIndex: stageGroups.length + 1,
      signers: executiveHeads,
      defaultAction: 'approve',
    });
    executiveHeads.forEach((s) => accountedSignatoryIds.add(s.id));
  }

  // Fallback: If no recognized roles matched, add remaining active signers in single stage
  if (stageGroups.length === 0) {
    stageGroups.push({
      stageName: 'Institutional Endorsement',
      stageIndex: 1,
      signers: activeSignatories,
      defaultAction: 'approve',
    });
  }

  const chain: PARApprovalStep[] = [];
  let stepCounter = 1;

  stageGroups.forEach((group, gIdx) => {
    const isFirstStage = gIdx === 0;
    group.signers.forEach((sig) => {
      chain.push({
        step: stepCounter++,
        stageIndex: group.stageIndex,
        stageName: group.stageName,
        role: sig.role || 'signatory',
        roleTitle: sig.roleTitle || sig.title || 'Institutional Signatory',
        actionType: group.defaultAction,
        signatoryUid: sig.uid || sig.id,
        signatoryName: sig.name,
        signatoryEmail: sig.email,
        department: sig.department || '',
        status: isFirstStage ? 'current' : 'waiting',
        isMandatory: sig.isMandatory !== false,
        isPermanent: sig.isPermanentSigner ?? true,
      });
    });
  });

  return chain;
}

/**
 * Generates an official PAR reference number:
 * e.g., PAR-ORG-2026-0001 or PAR-SAS-2026-0001
 */
export async function generatePARReferenceNumber(isOfficer: boolean): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = isOfficer ? `PAR-ORG-${year}-` : `PAR-SAS-${year}-`;

  try {
    const q = query(
      collection(db, PAR_COLLECTION),
      where('referenceNo', '>=', prefix),
      where('referenceNo', '<=', prefix + '\uf8ff'),
      orderBy('referenceNo', 'desc'),
      limit(1)
    );
    const snap = await getDocs(q);
    let nextNum = 1;

    if (!snap.empty) {
      const lastRef = snap.docs[0].data().referenceNo as string;
      const lastNum = parseInt(lastRef.replace(prefix, ''), 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  } catch {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${randomSuffix}`;
  }
}

/**
 * Save or submit a Post-Activity Report document.
 * Strictly enforces authoring rights:
 * - If event is SAS-created: only SAS admin can create the PAR.
 * - If event is Org-created: only an officer of that hostingOrgId can create the PAR.
 */
export async function saveOrSubmitPAR(
  formData: PARFormData,
  user: { uid: string; name: string; email: string; role?: string; organizationId?: string },
  submit = false
): Promise<{ success: boolean; id: string; referenceNo: string }> {
  if (!formData.eventId) {
    throw new Error('Event ID is required to create a Post-Activity Report.');
  }

  // 1. Fetch event to verify authoring permissions and concluded status
  const eventRef = doc(db, EVENTS_COLLECTION, formData.eventId);
  const eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists()) {
    throw new Error('Associated event not found.');
  }

  const eventData = eventSnap.data() as any;

  const isEventConcluded =
    eventData.lifecycleStatus === 'completed' ||
    eventData.status === 'completed' ||
    eventData.proposalStatus === 'completed';

  if (!isEventConcluded) {
    throw new Error('A Post-Activity Report can only be created once the event has concluded.');
  }

  if (eventData.liquidationStatus !== 'approved') {
    throw new Error('A Post-Activity Report requires the financial liquidation report to be approved first.');
  }

  // Strict Authoring Isolation Check
  const isSasEvent =
    eventData.isOfficerProposal === false ||
    eventData.creatorRole === 'sas_admin' ||
    eventData.hostingOrgId === 'sas' ||
    !eventData.hostingOrgId;

  const isUserSas =
    user.role === 'sas_admin' ||
    user.role === 'admin' ||
    user.role === 'sao_admin';

  if (isSasEvent && !isUserSas) {
    throw new Error('This is an internal SAS event. Only SAS administrators can create its Post-Activity Report.');
  }

  if (!isSasEvent) {
    if (isUserSas) {
      throw new Error(
        'This event was organized by a student organization. The Post-Activity Report must be authored and submitted by the officers of that specific organization.'
      );
    }
    if (eventData.hostingOrgId !== user.organizationId) {
      throw new Error('Only officers of the designated hosting organization can create this Post-Activity Report.');
    }
  }

  const isOfficer = !isSasEvent && !isUserSas;
  const docId = formData.id || doc(collection(db, PAR_COLLECTION)).id;
  const parDocRef = doc(db, PAR_COLLECTION, docId);

  const referenceNo =
    formData.referenceNo ||
    (await generatePARReferenceNumber(isOfficer));

  // Generate dynamic approval chain if not provided
  let approvalChain = formData.approvalChain;
  if (!approvalChain || approvalChain.length === 0) {
    approvalChain = await generateDefaultPARSignatoryChain(eventData.hostingOrgId, undefined, isSasEvent);
  }

  const status: PostActivityReportStatus = submit ? 'under_review' : (formData.status || 'draft');

  let currentVersion = Number((formData as any).version || 1);
  let isResubmission = false;

  if (formData.id) {
    try {
      const existingSnap = await getDoc(parDocRef);
      if (existingSnap.exists()) {
        const existingPar = existingSnap.data() as any;
        isResubmission = existingPar.status === 'returned';
        currentVersion = Number(existingPar.version || 1);

        if (isResubmission && submit) {
          currentVersion += 1;
          // Reset approval chain to Stage 1 current, Stage 2+ waiting, wipe previous signatures
          approvalChain = (approvalChain || existingPar.approvalChain || []).map((step: any) => {
            if ((step.stageIndex ?? 1) === 1) {
              return { ...step, status: 'current', signedAt: null, signatureUrl: null, remarks: null };
            }
            return { ...step, status: 'waiting', signedAt: null, signatureUrl: null, remarks: null };
          });
        }
      }
    } catch (checkErr) {
      console.warn('[saveOrSubmitPAR] Error checking existing PAR for resubmission:', checkErr);
    }
  }

  const payload: any = cleanPayload({
    ...formData,
    id: docId,
    referenceNo,
    eventId: formData.eventId,
    eventTitle: eventData.title || formData.eventTitle || '',
    eventReferenceId: eventData.referenceId || '',
    liquidationId: eventData.liquidationReportId || formData.liquidationId || '',
    liquidationRefNumber: eventData.liquidationRefNumber || formData.liquidationRefNumber || '',
    semesterId: eventData.semesterId || formData.semesterId || '',
    schoolYear: eventData.schoolYear || formData.schoolYear || '',
    semester: eventData.semester || formData.semester || '',

    organizationId: isSasEvent ? 'sas' : (eventData.hostingOrgId || formData.organizationId || ''),
    organizationName: isSasEvent ? 'Student Affairs Services (SAS)' : (eventData.hostingOrgName || formData.organizationName || ''),
    organizationAcronym: isSasEvent ? 'SAS' : (eventData.hostingOrgAcronym || formData.organizationAcronym || 'ORG'),
    createdByUid: formData.createdByUid || user.uid,
    createdByName: formData.createdByName || user.name,
    createdByEmail: formData.createdByEmail || user.email,
    creatorRole: isUserSas ? 'sas_admin' : 'officer',
    isOfficerPar: isOfficer,
    isSasInternal: isSasEvent,
    visibility: isSasEvent ? 'sas_only' : 'owner_and_sas',

    approvalChain,
    currentStageIndex: isResubmission ? 1 : (formData.currentStageIndex ?? 1),
    currentStepIndex: isResubmission ? 0 : (formData.currentStepIndex ?? 0),
    status,
    version: currentVersion,
    versionLabel: `v${currentVersion}.0`,
    updatedAt: serverTimestamp(),
  });

  if (isResubmission && submit) {
    payload.returnRemarks = null;
    payload.returnedAt = null;
  }

  if (!formData.id) {
    payload.createdAt = serverTimestamp();
  }

  if (submit) {
    payload.submittedAt = serverTimestamp();
    const submitRemark: PARRemark = {
      id: `rem-${Date.now()}`,
      authorName: user.name || 'Author',
      authorRole: isUserSas ? 'admin' : 'officer',
      action: 'submitted',
      comment: isResubmission
        ? `Post-Activity Report revised to v${currentVersion}.0 and resubmitted for Stage 1 review.`
        : 'Post-Activity Report submitted for institutional clearance and approval.',
      timestamp: new Date().toISOString(),
    };
    payload.remarksHistory = arrayUnion(submitRemark);
  }

  await setDoc(parDocRef, payload, { merge: true });

  // Update event record to store parId and parStatus
  try {
    await updateDoc(eventRef, {
      parId: docId,
      parReferenceNo: referenceNo,
      parStatus: status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[saveOrSubmitPAR] Notice updating event doc with PAR reference:', err);
  }

  return { success: true, id: docId, referenceNo };
}

/**
 * Endorse or Approve a Post-Activity Report step by an institutional signatory.
 */
export async function endorsePARStep(
  parId: string,
  signatory: {
    uid?: string;
    id?: string;
    name: string;
    email: string;
    roleTitle?: string;
    role?: string;
    signatureUrl?: string;
  },
  remarks = ''
): Promise<{ success: boolean; isFullyApproved: boolean; stageAdvanced?: boolean }> {
  const parRef = doc(db, PAR_COLLECTION, parId);
  const snap = await getDoc(parRef);
  if (!snap.exists()) throw new Error('Post-Activity Report not found.');

  const data = snap.data() as PostActivityReportDocument;
  const chain = [...(data.approvalChain || [])];
  if (chain.length === 0) throw new Error('No approval steps found on this report.');

  const signerUid = signatory.id || signatory.uid || '';
  const signerEmail = (signatory.email || '').toLowerCase();
  const currentStage = data.currentStageIndex ?? 1;

  let targetStepIdx = chain.findIndex((s) => {
    const stageMatches = s.stageIndex ? s.stageIndex === currentStage : true;
    const isPending = s.status === 'current' || s.status === 'waiting';
    if (!stageMatches || !isPending) return false;
    if (signerUid && s.signatoryUid === signerUid) return true;
    if (signerEmail && s.signatoryEmail?.toLowerCase() === signerEmail) return true;
    if (signatory.role && s.role === signatory.role) return true;
    return false;
  });

  if (targetStepIdx === -1) {
    targetStepIdx = data.currentStepIndex ?? 0;
  }

  if (targetStepIdx < 0 || targetStepIdx >= chain.length) {
    throw new Error('No pending approval step found for your account on this Post-Activity Report.');
  }

  // Stamp digital signature on step
  chain[targetStepIdx] = {
    ...chain[targetStepIdx],
    status: 'endorsed',
    signatureUrl: signatory.signatureUrl || chain[targetStepIdx].signatureUrl,
    signedAt: new Date().toISOString(),
    remarks: remarks || chain[targetStepIdx].remarks,
  };

  const currentStageSteps = chain.filter((s) => (s.stageIndex ?? 1) === currentStage);
  const allStageStepsCompleted = currentStageSteps.every(
    (s) => s.status === 'endorsed' || s.status === 'approved'
  );

  let isFullyApproved = false;
  let nextStageIndex = currentStage;
  let stageAdvanced = false;

  if (allStageStepsCompleted) {
    const futureStages = chain
      .map((s) => s.stageIndex ?? 1)
      .filter((stg) => stg > currentStage)
      .sort((a, b) => a - b);

    if (futureStages.length > 0) {
      nextStageIndex = futureStages[0];
      stageAdvanced = true;
      chain.forEach((s, idx) => {
        if ((s.stageIndex ?? 1) === nextStageIndex && s.status === 'waiting') {
          chain[idx] = { ...s, status: 'current' };
        }
      });
    } else {
      isFullyApproved = true;
    }
  }

  const endorsementRemark: PARRemark = {
    id: `rem-${Date.now()}`,
    authorName: signatory.name || 'Signatory',
    authorRole: 'signatory',
    action: isFullyApproved ? 'approved' : 'endorsed',
    comment: remarks || (isFullyApproved ? 'Post-Activity Report fully cleared and approved.' : `Endorsed stage ${currentStage}.`),
    timestamp: new Date().toISOString(),
  };

  const updates: any = cleanPayload({
    approvalChain: chain,
    currentStepIndex: targetStepIdx + 1,
    currentStageIndex: nextStageIndex,
    status: isFullyApproved ? 'approved' : 'under_review',
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(endorsementRemark),
    ...(isFullyApproved
      ? { approvedAt: serverTimestamp(), approvedBy: signerUid || signatory.email }
      : {}),
  });

  await updateDoc(parRef, updates);

  // Sync event document
  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, {
      parStatus: isFullyApproved ? 'approved' : 'under_review',
      parId,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[endorsePARStep] Event sync note:', err);
  }

  // Cross-Module EDMS Auto-Archive upon final approval!
  if (isFullyApproved) {
    try {
      await autoArchiveApprovedPAR(parId, { ...data, ...updates }, signerUid || signatory.email);
    } catch (archErr) {
      console.warn('[endorsePARStep] Auto-archive to EDMS notice:', archErr);
    }
  }

  return { success: true, isFullyApproved, stageAdvanced };
}

/**
 * Return a Post-Activity Report for revision with remarks.
 */
export async function returnPAR(
  parId: string,
  adminUserId: string,
  adminName: string,
  remarks: string,
  adminRoleTitle = 'Student Affairs & Services Head',
  adminEmail?: string
): Promise<void> {
  const parRef = doc(db, PAR_COLLECTION, parId);
  const snap = await getDoc(parRef);
  if (!snap.exists()) throw new Error('Post-Activity Report not found.');

  const data = snap.data() as PostActivityReportDocument;

  const returnRemark: PARRemark = {
    id: `rem-${Date.now()}`,
    authorName: adminName || 'SAS Adviser',
    authorRole: 'admin',
    action: 'returned',
    comment: remarks,
    timestamp: new Date().toISOString(),
  };

  const revisionEntry = {
    version: (data as any).version || 1,
    versionLabel: `v${(data as any).version || 1}.0`,
    submittedAt: data.submittedAt || null,
    submittedBy: data.createdByName,
    submittedByUid: data.createdByUid,
    returnedAt: new Date().toISOString(),
    returnedBy: adminName,
    returnedByRoleTitle: adminRoleTitle,
    returnedByEmail: adminEmail,
    returnRemarks: remarks,
  };

  await updateDoc(parRef, {
    status: 'returned',
    returnRemarks: remarks,
    returnedBy: adminUserId,
    returnedByName: adminName,
    returnedByRoleTitle: adminRoleTitle,
    returnedByEmail: adminEmail || null,
    returnedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(returnRemark),
    revisionHistory: arrayUnion(revisionEntry),
  });

  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, {
      parStatus: 'returned',
      updatedAt: serverTimestamp(),
    });
  } catch {}
}

/**
 * Withdraw a submitted Post-Activity Report back to 'draft' status so author can edit before review.
 */
export async function withdrawPostActivityReport(
  parId: string,
  userId: string,
  userName?: string
): Promise<void> {
  const parRef = doc(db, PAR_COLLECTION, parId);
  const snap = await getDoc(parRef);
  if (!snap.exists()) throw new Error('Post-Activity Report not found.');

  const data = snap.data() as PostActivityReportDocument;
  const currentStatus = (data.status || '').toLowerCase().trim();
  if (currentStatus !== 'under_review' && currentStatus !== 'pending') {
    throw new Error('Only Post-Activity Reports currently under review can be withdrawn.');
  }

  // Reset chain steps
  const chain = (data.approvalChain || []).map((step, idx) => ({
    ...step,
    status: idx === 0 ? ('current' as const) : ('waiting' as const),
    signedAt: null,
    signatureUrl: null,
  }));

  const withdrawRemark: PARRemark = {
    id: `rem-${Date.now()}`,
    authorName: userName || 'Author',
    authorRole: data.creatorRole === 'sas_admin' ? 'admin' : 'officer',
    action: 'draft_saved',
    comment: `Post-Activity Report withdrawn back to draft by ${userName || 'author'} for revision.`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(parRef, {
    status: 'draft',
    currentStageIndex: 1,
    currentStepIndex: 0,
    approvalChain: chain,
    remarksHistory: arrayUnion(withdrawRemark),
    updatedAt: serverTimestamp(),
  });

  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, {
      parStatus: 'draft',
      updatedAt: serverTimestamp(),
    });
  } catch {}
}

/**
 * Directly approve a Post-Activity Report by SAS Administrator.
 */
export async function approvePAR(
  parId: string,
  adminUserId: string,
  adminName: string,
  remarks = ''
): Promise<void> {
  const parRef = doc(db, PAR_COLLECTION, parId);
  const snap = await getDoc(parRef);
  if (!snap.exists()) throw new Error('Post-Activity Report not found.');

  const data = snap.data() as PostActivityReportDocument;

  const approvalRemark: PARRemark = {
    id: `rem-${Date.now()}`,
    authorName: adminName || 'SAS Adviser',
    authorRole: 'admin',
    action: 'approved',
    comment: remarks || 'Post-Activity Report approved and cleared for archival.',
    timestamp: new Date().toISOString(),
  };

  await updateDoc(parRef, {
    status: 'approved',
    approvedBy: adminUserId,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(approvalRemark),
  });

  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, {
      parStatus: 'approved',
      updatedAt: serverTimestamp(),
    });
  } catch {}

  // Auto-Archive to EDMS
  try {
    await autoArchiveApprovedPAR(parId, data, adminUserId);
  } catch (archErr) {
    console.warn('[approvePAR] Auto-archive to EDMS notice:', archErr);
  }
}
