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
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
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
import { isSasInstitutionalActivity } from '../../events/utils/event-lifecycle.utils';

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
 * In accordance with institutional policy:
 * - Recommended: 1 Stage Only
 * - All signatories sign simultaneously in parallel
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

  const stageSigners: {
    signer: InstitutionalSignatory;
    action: 'check' | 'endorse' | 'approve';
  }[] = [];

  const accountedSignatoryIds = new Set<string>();

  // 1. For Student Organizations: SAS Head Reviewer
  if (!isSasCreator) {
    const sasConfig = getCachedSasSignatoryConfig();
    const sasSigner: InstitutionalSignatory = {
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
    };
    stageSigners.push({ signer: sasSigner, action: 'approve' });
    accountedSignatoryIds.add(sasSigner.id);
  }

  // 2. Department & Program Endorsement (Adviser, Program Head, Coordinator)
  const programHeads = activeSignatories.filter(
    (s) =>
      !accountedSignatoryIds.has(s.id) &&
      (s.role === 'program_head' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('program head')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('adviser')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('coordinator')))
  );
  programHeads.forEach((sig) => {
    stageSigners.push({ signer: sig, action: 'endorse' });
    accountedSignatoryIds.add(sig.id);
  });

  // 3. Academic Affairs Clearance (Academic Head, Dean, SHS Principal)
  const academicHeads = activeSignatories.filter(
    (s) =>
      !accountedSignatoryIds.has(s.id) &&
      (s.role === 'academic_head' ||
        s.role === 'shs_principal' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('academic head')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('dean')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('principal')))
  );
  academicHeads.forEach((sig) => {
    stageSigners.push({ signer: sig, action: 'endorse' });
    accountedSignatoryIds.add(sig.id);
  });

  // 4. Executive Clearance & Final Approval (School Administrator, School President)
  const executiveHeads = activeSignatories.filter(
    (s) =>
      !accountedSignatoryIds.has(s.id) &&
      (s.role === 'school_administrator' ||
        s.role === 'school_president' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('administrator')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('president')))
  );
  executiveHeads.forEach((sig) => {
    stageSigners.push({ signer: sig, action: 'approve' });
    accountedSignatoryIds.add(sig.id);
  });

  // Fallback: If no recognized roles matched, add remaining active signers
  if (stageSigners.length === 0) {
    activeSignatories.forEach((sig) => {
      stageSigners.push({ signer: sig, action: 'approve' });
    });
  }

  // Ensure there is at least one approver
  if (!stageSigners.some((s) => s.action === 'approve') && stageSigners.length > 0) {
    stageSigners[stageSigners.length - 1].action = 'approve';
  }

  // ── 1 STAGE ONLY: All signatories in Stage 1 sign simultaneously in parallel ──
  const stageName = 'Stage 1: Post-Activity Review & Final Clearance';
  const chain: PARApprovalStep[] = stageSigners.map((item, idx) => ({
    id: `step-${Date.now()}-${idx + 1}`,
    step: idx + 1,
    stageIndex: 1,
    stageName,
    role: item.signer.role || 'signatory',
    roleTitle: item.signer.roleTitle || item.signer.title || 'Institutional Signatory',
    actionType: item.action,
    signatoryUid: item.signer.uid || item.signer.id,
    signatoryName: item.signer.name,
    signatoryEmail: item.signer.email,
    department: item.signer.department || '',
    status: 'current', // ALL ACTIVE SIMULTANEOUSLY!
    isMandatory: item.signer.isMandatory !== false,
    isPermanent: item.signer.isPermanentSigner ?? true,
  }));

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

  // 1:1:1 Invariant: Liquidation clearance check
  const liqStatus = ((eventData as any).liquidationStatus || '').toString().toLowerCase();
  const isLiquidationSatisfied =
    liqStatus === 'approved' ||
    liqStatus === 'none_required' ||
    (eventData as any).isLiquidated === true;

  if (!isLiquidationSatisfied) {
    throw new Error('A Post-Activity Report requires the financial liquidation report to be approved first.');
  }

  // ── STRICT 1:1:1 LIFECYCLE INVARIANT ──
  // An activity proposal can have at most ONE Post-Activity Report.
  if (!formData.id) {
    // 1. Check existing PARs collection for this eventId
    const existingParSnap = await getDocs(
      query(collection(db, PAR_COLLECTION), where('eventId', '==', formData.eventId))
    );
    const activeExistingPar = existingParSnap.docs.filter((d) => {
      const st = (d.data().status || '').toLowerCase();
      return st !== 'cancelled' && st !== 'voided';
    });
    if (activeExistingPar.length > 0) {
      throw new Error(
        'A Post-Activity Report already exists for this activity proposal (1:1:1 invariant enforced). Please edit or revise the existing report instead.'
      );
    }

    // 2. Cross-verify parent event document
    if (eventData.parId) {
      const oldParSnap = await getDoc(doc(db, PAR_COLLECTION, eventData.parId));
      if (oldParSnap.exists()) {
        const oldSt = (oldParSnap.data().status || '').toLowerCase();
        if (oldSt !== 'cancelled' && oldSt !== 'voided') {
          throw new Error(
            'A Post-Activity Report is already linked to this activity proposal (1:1:1 invariant enforced). Please edit or revise the existing report instead.'
          );
        }
      }
    }
  }

  // Strict Authoring Isolation Check
  const isSasEvent = isSasInstitutionalActivity(eventData);

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

  // Resolve linked Financial Liquidation (LF-01) for 1:1:1 consistency
  let targetLiquidationId = eventData.liquidationReportId || formData.liquidationId || '';
  let targetLiquidationRef = eventData.liquidationRefNumber || formData.liquidationRefNumber || '';

  if (!targetLiquidationId) {
    try {
      const liqSnap = await getDocs(
        query(collection(db, 'liquidations'), where('eventId', '==', formData.eventId))
      );
      const activeLiq = liqSnap.docs.find((d) => {
        const st = (d.data().status || '').toLowerCase();
        return st !== 'voided' && st !== 'cancelled';
      });
      if (activeLiq) {
        targetLiquidationId = activeLiq.id;
        targetLiquidationRef = activeLiq.data().referenceNo || targetLiquidationRef;
      }
    } catch (err) {
      console.warn('[saveOrSubmitPAR] Notice resolving liquidation by eventId:', err);
    }
  }

  if (targetLiquidationId && !targetLiquidationRef) {
    try {
      const liqDoc = await getDoc(doc(db, 'liquidations', targetLiquidationId));
      if (liqDoc.exists()) {
        targetLiquidationRef = liqDoc.data().referenceNo || '';
      }
    } catch (err) {
      console.warn('[saveOrSubmitPAR] Notice fetching liquidation reference:', err);
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
  let existingParData: any = null;

  if (formData.id) {
    try {
      const existingSnap = await getDoc(parDocRef);
      if (existingSnap.exists()) {
        const existingPar = existingSnap.data() as any;
        existingParData = existingPar;
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

  if (submit && approvalChain && approvalChain.length > 0) {
    approvalChain = approvalChain.map((step: any) => {
      const inStageOne = (step.stageIndex ?? 1) === 1;
      const isAlreadySigned = step.status === 'endorsed' || step.status === 'approved';
      return {
        ...step,
        status: isAlreadySigned ? step.status : inStageOne ? 'current' : 'waiting',
      };
    });
  }

  const payload: any = cleanPayload({
    ...formData,
    id: docId,
    referenceNo,
    eventId: formData.eventId,
    eventTitle: eventData.title || formData.eventTitle || '',
    eventReferenceId: eventData.referenceId || '',
    liquidationId: targetLiquidationId,
    liquidationRefNumber: targetLiquidationRef,
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
    revisionCount: currentVersion,
    updatedAt: serverTimestamp(),
  });

  if (isResubmission && submit && existingParData) {
    const existingParClean = sanitizeFirestorePayload(existingParData);
    payload.previousSnapshot = existingParData.previousSnapshot || existingParData.returnedSnapshot || existingParClean;
    payload.returnedSnapshot = existingParData.returnedSnapshot || existingParData.previousSnapshot || existingParClean;
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
    payload.remarksHistory = arrayUnion(sanitizeFirestorePayload(submitRemark));
  }

  await setDoc(parDocRef, sanitizeFirestorePayload(payload), { merge: true });

  // Update event record to store parId and parStatus
  try {
    await updateDoc(eventRef, sanitizeFirestorePayload({
      parId: docId,
      parReferenceNo: referenceNo,
      parStatus: status,
      updatedAt: serverTimestamp(),
    }));
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
    remarksHistory: arrayUnion(sanitizeFirestorePayload(endorsementRemark)),
    ...(isFullyApproved
      ? { approvedAt: serverTimestamp(), approvedBy: signerUid || signatory.email }
      : {}),
  });

  await updateDoc(parRef, sanitizeFirestorePayload(updates));

  // Sync event document
  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, sanitizeFirestorePayload({
      parStatus: isFullyApproved ? 'approved' : 'under_review',
      parId,
      updatedAt: serverTimestamp(),
    }));
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
    comment: remarks || 'Returned for revision.',
    timestamp: new Date().toISOString(),
  };

  // Capture full deep snapshot of the PAR before returning so diff comparisons have complete fidelity
  const fullSnapshot = sanitizeFirestorePayload({
    ...data,
  });

  const currentVer = Number((data as any).version || 1);
  const revisionEntry = sanitizeFirestorePayload({
    version: currentVer,
    versionLabel: `v${currentVer}.0`,
    submittedAt: data.submittedAt || null,
    submittedBy: data.createdByName || (data as any).submittedByName || 'Submitter',
    submittedByUid: data.createdByUid || (data as any).submittedByUid || (data as any).createdById || 'user',
    returnedAt: new Date().toISOString(),
    returnedBy: adminName || 'Signatory Reviewer',
    returnedByRoleTitle: adminRoleTitle || 'Signatory',
    returnedByEmail: adminEmail || null,
    returnRemarks: remarks || 'Returned for revision.',
    dataSnapshot: fullSnapshot,
    previousSnapshot: fullSnapshot,
  });

  await updateDoc(parRef, sanitizeFirestorePayload({
    status: 'returned',
    returnRemarks: remarks || 'Returned for revision.',
    returnedBy: adminUserId || 'reviewer',
    returnedByName: adminName || 'Signatory Reviewer',
    returnedByRoleTitle: adminRoleTitle || 'Signatory',
    returnedByEmail: adminEmail || null,
    returnedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    previousSnapshot: fullSnapshot,
    returnedSnapshot: fullSnapshot,
    remarksHistory: arrayUnion(sanitizeFirestorePayload(returnRemark)),
    revisionHistory: arrayUnion(revisionEntry),
  }));

  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, sanitizeFirestorePayload({
      parStatus: 'returned',
      updatedAt: serverTimestamp(),
    }));
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

  await updateDoc(parRef, sanitizeFirestorePayload({
    status: 'draft',
    currentStageIndex: 1,
    currentStepIndex: 0,
    approvalChain: chain,
    remarksHistory: arrayUnion(sanitizeFirestorePayload(withdrawRemark)),
    updatedAt: serverTimestamp(),
  }));

  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, sanitizeFirestorePayload({
      parStatus: 'draft',
      updatedAt: serverTimestamp(),
    }));
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

  await updateDoc(parRef, sanitizeFirestorePayload({
    status: 'approved',
    approvedBy: adminUserId,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(sanitizeFirestorePayload(approvalRemark)),
  }));

  try {
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    await updateDoc(eventRef, sanitizeFirestorePayload({
      parStatus: 'approved',
      updatedAt: serverTimestamp(),
    }));
  } catch {}

  // Auto-Archive to EDMS
  try {
    await autoArchiveApprovedPAR(parId, data, adminUserId);
  } catch (archErr) {
    console.warn('[approvePAR] Auto-archive to EDMS notice:', archErr);
  }
}

/**
 * Deletes a draft or unapproved Post-Activity Report document completely.
 * Also cleans up the parId, parReferenceNo, and parStatus references on the parent event,
 * allowing the event to be cleanly re-processed under the 1:1:1 invariant.
 */
export async function deletePAR(parId: string): Promise<boolean> {
  if (!parId) throw new Error('PAR ID is required.');
  const parRef = doc(db, PAR_COLLECTION, parId);
  const snap = await getDoc(parRef);
  if (!snap.exists()) return true;

  const data = snap.data() as PostActivityReportDocument;
  if (data.status === 'approved') {
    throw new Error('Approved Post-Activity Reports cannot be deleted.');
  }

  // 1. Delete document
  await deleteDoc(parRef);

  // 2. Cleanly reset references on parent event
  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, {
        parId: null,
        parReferenceNo: null,
        parStatus: null,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[deletePAR] Event unlink notice:', e);
    }
  }

  return true;
}
