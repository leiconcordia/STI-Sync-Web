import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import { removeLedgerTransactionsForLiquidation } from './finance.service';
import type { 
  LiquidationDocument, 
  LiquidationRemark, 
  LiquidationApprovalStep,
  LiquidationStatus
} from '../types/liquidation.types';
import {
  type InstitutionalSignatory,
  isSignatoryApplicableTo,
} from '../../signatories/types/signatory.types';
import { SIGNATORIES_COLLECTION } from '../../signatories/services/signatory.service';
import { getCachedSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import { autoArchiveApprovedLiquidation } from '../../documents/services/document_archive_bridge.service';
import { isSasInstitutionalActivity } from '../../events/utils/event-lifecycle.utils';
import { softDeleteDocument, restoreDocument } from '../../workflow/services/soft-delete.service';

export const LIQUIDATIONS_COLLECTION = 'liquidations';

/**
 * Automatically builds the standard STI liquidation approval chain (Form LF-01)
 * populated with active institutional signatories from Firestore.
 */
export async function generateDefaultLiquidationChain(
  orgId?: string,
  orgName?: string,
  budgetAmount?: number,
  providedSignatories?: InstitutionalSignatory[],
  isSasCreator = false
): Promise<LiquidationApprovalStep[]> {
  let activeSignatories = providedSignatories;

  if (!activeSignatories || activeSignatories.length === 0) {
    try {
      const snap = await getDocs(query(collection(db, SIGNATORIES_COLLECTION), where('isActive', '!=', false)));
      activeSignatories = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InstitutionalSignatory));
    } catch (e) {
      console.warn('[generateDefaultLiquidationChain] Could not fetch signatories:', e);
      activeSignatories = [];
    }
  }

  // Filter out inactive signatories and those designated for proposals only
  activeSignatories = (activeSignatories || []).filter(
    (s) => s.isActive !== false && isSignatoryApplicableTo(s, 'liquidation')
  );

  if (activeSignatories.length === 0 && isSasCreator) {
    return [];
  }

  // Dynamically group real signatories from maintenance into logical sequential stages.
  // CRITICAL: Stages and steps are ONLY added if matching signatories actually exist in maintenance!
  const stageGroups: {
    stageName: string;
    signers: InstitutionalSignatory[];
    defaultAction: 'check' | 'endorse' | 'approve';
  }[] = [];

  const accountedSignatoryIds = new Set<string>();

  // ── Stage 1 Gatekeeper for Student Organizations: Student Affairs & Services (SAS) Clearance ──
  // If this liquidation is submitted by a student organization, SAS MUST review and endorse it first!
  // If created by SAS internally, this gatekeeper is omitted.
  if (!isSasCreator) {
    const sasConfig = getCachedSasSignatoryConfig();
    stageGroups.push({
      stageName: 'Student Affairs & Services (SAS) Clearance',
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
      defaultAction: 'endorse',
    });
  }

  // 2. Financial Checking & Audit (Accountants / Internal Auditors)
  // Only included if an accountant or auditor is configured in maintenance.
  const accountants = activeSignatories.filter(
    (s) =>
      s.role === 'accountant' ||
      (s.roleTitle && s.roleTitle.toLowerCase().includes('accountant')) ||
      (s.roleTitle && s.roleTitle.toLowerCase().includes('auditor'))
  );
  if (accountants.length > 0) {
    accountants.sort((a, b) => (b.isPermanentSigner ? 1 : 0) - (a.isPermanentSigner ? 1 : 0));
    stageGroups.push({
      stageName: 'Financial Checking & Audit',
      signers: accountants,
      defaultAction: 'check',
    });
    accountants.forEach((s) => accountedSignatoryIds.add(s.id));
  }

  // 2. Department & Program Endorsement (Program Heads, Advisers, Coordinators)
  // Only included if program heads / advisers exist in maintenance.
  const programHeads = activeSignatories.filter(
    (s) =>
      !accountedSignatoryIds.has(s.id) &&
      (s.role === 'program_head' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('program head')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('coordinator')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('adviser')))
  );
  if (programHeads.length > 0) {
    programHeads.sort((a, b) => (b.isPermanentSigner ? 1 : 0) - (a.isPermanentSigner ? 1 : 0));
    stageGroups.push({
      stageName: 'Department & Program Endorsement',
      signers: programHeads,
      defaultAction: 'endorse',
    });
    programHeads.forEach((s) => accountedSignatoryIds.add(s.id));
  }

  // 3. Academic Affairs Recommendation (Academic Head, Dean, SHS Principal)
  // Only included if academic heads exist in maintenance.
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
    academicHeads.sort((a, b) => (b.isPermanentSigner ? 1 : 0) - (a.isPermanentSigner ? 1 : 0));
    stageGroups.push({
      stageName: 'Academic Affairs Recommendation',
      signers: academicHeads,
      defaultAction: 'endorse',
    });
    academicHeads.forEach((s) => accountedSignatoryIds.add(s.id));
  }

  // 4. Executive Administration & Presidential Approval (School Administrator / President)
  // Only included if executive approvers exist in maintenance.
  const executiveApprovers = activeSignatories.filter(
    (s) =>
      !accountedSignatoryIds.has(s.id) &&
      (s.role === 'school_president' ||
        s.role === 'school_administrator' ||
        s.actionType === 'approver' ||
        s.actionType === 'both' ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('president')) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes('administrator')))
  );
  if (executiveApprovers.length > 0) {
    executiveApprovers.sort((a, b) => {
      if (a.isPermanentSigner && !b.isPermanentSigner) return -1;
      if (!a.isPermanentSigner && b.isPermanentSigner) return 1;
      if (a.role === 'school_administrator' && b.role !== 'school_administrator') return -1;
      if (b.role === 'school_administrator' && a.role !== 'school_administrator') return 1;
      if (a.role === 'school_president' && b.role !== 'school_president') return 1;
      if (b.role === 'school_president' && a.role !== 'school_president') return -1;
      return 0;
    });
    stageGroups.push({
      stageName: 'Executive Presidential Approval',
      signers: executiveApprovers,
      defaultAction: 'approve',
    });
    executiveApprovers.forEach((s) => accountedSignatoryIds.add(s.id));
  }

  // 5. Any remaining active signatories applicable to liquidation
  const remaining = activeSignatories.filter((s) => !accountedSignatoryIds.has(s.id));
  if (remaining.length > 0) {
    remaining.sort((a, b) => (b.isPermanentSigner ? 1 : 0) - (a.isPermanentSigner ? 1 : 0));
    stageGroups.push({
      stageName: 'Institutional Endorsement',
      signers: remaining,
      defaultAction: 'endorse',
    });
  }

  // Convert populated groups into sequential LiquidationApprovalStep items
  const steps: LiquidationApprovalStep[] = [];
  let globalStepIndex = 1;

  stageGroups.forEach((group, gIdx) => {
    const stageIndex = gIdx + 1;
    group.signers.forEach((sig, sIdx) => {
      const isPermanent = Boolean(sig.isPermanentSigner);
      let actionType: 'check' | 'endorse' | 'approve' = group.defaultAction;
      if (sig.actionType === 'approver' || sig.role === 'school_president') {
        actionType = 'approve';
      } else if (
        sig.role === 'accountant' ||
        (sig.roleTitle && sig.roleTitle.toLowerCase().includes('accountant')) ||
        (sig.roleTitle && sig.roleTitle.toLowerCase().includes('auditor'))
      ) {
        actionType = 'check';
      }

      steps.push({
        id: `liq_step_${stageIndex}_${sIdx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        step: globalStepIndex++,
        stageIndex,
        stageName: group.stageName,
        role: sig.role || '',
        roleTitle: sig.roleTitle || 'Institutional Signatory',
        actionType,
        signatoryUid: sig.id,
        signatoryName: sig.name,
        signatoryEmail: sig.email,
        department: sig.department || '',
        status: stageIndex === 1 ? 'current' : 'waiting',
        isMandatory: isPermanent,
        isPermanent: isPermanent,
      });
    });
  });

  return steps;
}

/**
 * Creates a new Liquidation Report document in Firestore.
 * Auto-approves and posts to ledger if created by SAO Admin.
 */
export const createLiquidationReport = async (
  data: Omit<LiquidationDocument, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  // ── STRICT 1:1:1 LIFECYCLE INVARIANT ──
  // An activity proposal can have at most ONE Financial Liquidation.
  if (data.eventId) {
    // 1. Check existing liquidations in Firestore for this eventId
    const existingLiqSnap = await getDocs(
      query(collection(db, LIQUIDATIONS_COLLECTION), where('eventId', '==', data.eventId))
    );
    const activeExisting = existingLiqSnap.docs.filter((d) => {
      const lData = d.data();
      const st = (lData.status || '').toLowerCase();
      return st !== 'voided' && st !== 'cancelled' && lData.isDeleted !== true;
    });

    if (activeExisting.length > 0) {
      throw new Error(
        'A Financial Liquidation already exists for this activity proposal (1:1:1 invariant enforced). Please edit or revise the existing report instead.'
      );
    }

    // 2. Cross-verify parent event document
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    const eventSnap = await getDoc(eventRef);
    if (eventSnap.exists()) {
      const evData = eventSnap.data() as any;

      // Authoring isolation:
      // SAS Admin can only liquidate SAS activities; Student Org officers can only liquidate their own org's activities.
      const isSasActivity = isSasInstitutionalActivity(evData);

      const isSubmitterSas =
        data.createdByRole === 'admin' ||
        data.organizationId === 'sao_admin' ||
        data.organizationId === 'sas';

      if (isSasActivity && !isSubmitterSas) {
        throw new Error('This is an internal SAS activity. Only SAS administrators can create its Financial Liquidation.');
      }
      if (!isSasActivity && isSubmitterSas) {
        throw new Error('This activity was organized by a student organization. The Financial Liquidation must be authored and submitted by the officers of that specific organization.');
      }

      if (evData.liquidationReportId) {
        const oldLiqSnap = await getDoc(doc(db, LIQUIDATIONS_COLLECTION, evData.liquidationReportId));
        if (oldLiqSnap.exists()) {
          const oldData = oldLiqSnap.data();
          const oldSt = (oldData.status || '').toLowerCase();
          if (oldSt !== 'voided' && oldSt !== 'cancelled' && oldData.isDeleted !== true) {
            throw new Error(
              'A Financial Liquidation is already linked to this activity proposal (1:1:1 invariant enforced). Please edit or revise the existing report instead.'
            );
          }
        }
      }
    }
  }

  const lineItems = data.lineItems || [];
  const totalActualSpending = lineItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  const surplusOrDeficit = (data.allocatedBudget || 0) - totalActualSpending;

  // Never auto-approve on creation!
  // If submitted, status is strictly 'under_review'. Otherwise 'draft'.
  const isSubmitting = data.status === 'under_review' || data.status === 'pending';
  const initialStatus: LiquidationStatus = isSubmitting ? 'under_review' : (data.status || 'draft');

  // Build or clean approval chain
  const isSasCreator =
    data.createdByRole === 'admin' ||
    data.organizationId === 'sao_admin' ||
    data.organizationId === 'sas' ||
    (data.organizationName && data.organizationName.toLowerCase().includes('student affairs'));

  let chain = data.approvalChain;
  if (!chain || chain.length === 0) {
    chain = await generateDefaultLiquidationChain(
      data.organizationId,
      data.organizationName,
      data.allocatedBudget,
      undefined,
      isSasCreator
    );
  } else if (isSasCreator) {
    // If created by SAS/admin, ensure Stage 1 SAS clearance is stripped and reindexed
    const hasSasStage1 = chain.some(
      (s) =>
        (s.stageIndex ?? 1) === 1 &&
        (s.role === 'sas_head' ||
          (s.roleTitle && s.roleTitle.toLowerCase().includes('student affairs')) ||
          (s.signatoryEmail && s.signatoryEmail.toLowerCase().includes('sao@ormoc.sti.edu.ph')) ||
          (s.stageName && s.stageName.toLowerCase().includes('sas clearance')))
    );
    if (hasSasStage1) {
      const filtered = chain.filter(
        (s) =>
          !(
            (s.stageIndex ?? 1) === 1 &&
            (s.role === 'sas_head' ||
              (s.roleTitle && s.roleTitle.toLowerCase().includes('student affairs')) ||
              (s.signatoryEmail && s.signatoryEmail.toLowerCase().includes('sao@ormoc.sti.edu.ph')) ||
              (s.stageName && s.stageName.toLowerCase().includes('sas clearance')))
          )
      );
      const stageMap = new Map<number, LiquidationApprovalStep[]>();
      filtered.forEach((s) => {
        const idx = s.stageIndex ?? 1;
        if (!stageMap.has(idx)) stageMap.set(idx, []);
        stageMap.get(idx)!.push(s);
      });
      const sortedKeys = Array.from(stageMap.keys()).sort((a, b) => a - b);
      let stepNum = 1;
      const reindexed: LiquidationApprovalStep[] = [];
      sortedKeys.forEach((oldIdx, newIdxMinusOne) => {
        const newStageNum = newIdxMinusOne + 1;
        const steps = stageMap.get(oldIdx)!;
        const stageName = steps[0]?.stageName || `Stage ${newStageNum}`;
        steps.forEach((st) => {
          reindexed.push({
            ...st,
            step: stepNum++,
            stageIndex: newStageNum,
            stageName,
            status: newStageNum === 1 ? 'current' : 'waiting',
          });
        });
      });
      chain = reindexed;
    }
  }

  // If submitting right away, activate Stage 1 steps and ensure subsequent stages are waiting
  if (isSubmitting) {
    chain = chain.map((step) => {
      if ((step.stageIndex ?? 1) === 1) {
        return { ...step, status: 'current' as const };
      }
      return { ...step, status: 'waiting' as const };
    });
  }

  const initialRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: data.createdByName || 'Submitter',
    authorRole: data.createdByRole || 'officer',
    action: isSubmitting ? 'submitted' : 'draft_saved',
    comment: isSubmitting
      ? 'Liquidation report submitted for institutional signatory review.'
      : 'Draft liquidation report created.',
    timestamp: new Date().toISOString(),
  };

  const payload: Partial<LiquidationDocument> = {
    ...data,
    totalActualSpending,
    surplusOrDeficit,
    status: initialStatus,
    approvalChain: chain,
    currentStageIndex: 1,
    currentStepIndex: 0,
    remarksHistory: [initialRemark],
    ...(isSubmitting ? { submittedAt: serverTimestamp() as any } : {}),
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  const docRef = await addDoc(collection(db, LIQUIDATIONS_COLLECTION), sanitizeFirestorePayload(payload));

  // Sync event liquidationStatus on event document
  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: initialStatus,
        liquidationReportId: docRef.id,
        liquidationRefNumber: (data as any).referenceNo || (payload as any).referenceNo || '',
        updatedAt: serverTimestamp(),
      }));
    } catch (evtErr) {
      console.warn('[createLiquidationReport] Event sync notice:', evtErr);
    }
  }

  // NOTE: Ledger posting occurs ONLY after final executive approval in endorseLiquidationStep!
  return docRef.id;
};

/**
 * Updates an existing Liquidation Report. Recalculates total spending and surplus/deficit.
 * Features Smart Diff Engine to identify modified items on revision and resets pipeline to Stage 1 on resubmission.
 */
export const updateLiquidationReport = async (
  id: string,
  data: Partial<LiquidationDocument>
): Promise<void> => {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);
  const snap = await getDoc(docRef);
  const existingData = snap.exists() ? (snap.data() as LiquidationDocument) : null;

  const payload: any = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  // Smart Change Detection (Diff Engine)
  if (data.lineItems !== undefined && existingData && existingData.lineItems) {
    const prevMap = new Map<string, any>();
    existingData.lineItems.forEach((item, idx) => {
      prevMap.set(item.id || `item-${idx}`, item);
    });

    const enrichedItems = data.lineItems.map((item, idx) => {
      const prev = prevMap.get(item.id || `item-${idx}`);
      if (!prev) {
        // Brand new item added in revision
        return {
          ...item,
          wasModifiedInRev: existingData.status === 'returned',
        };
      }

      const hasChanged =
        item.description !== prev.description ||
        item.quantity !== prev.quantity ||
        item.unitCost !== prev.unitCost ||
        item.totalCost !== prev.totalCost ||
        item.vendorName !== prev.vendorName ||
        item.receiptUrl !== prev.receiptUrl ||
        (item.receiptUrls?.length || 0) !== (prev.receiptUrls?.length || 0);

      if (hasChanged) {
        const prevVals: any = {};
        if (prev.quantity !== undefined) prevVals.quantity = prev.quantity;
        if (prev.unitCost !== undefined) prevVals.unitCost = prev.unitCost;
        if (prev.totalCost !== undefined) prevVals.totalCost = prev.totalCost;
        if (prev.description !== undefined) prevVals.description = prev.description;
        return {
          ...item,
          wasModifiedInRev: true,
          previousValues: prevVals,
        };
      }

      const baseItem: any = {
        ...item,
        wasModifiedInRev: prev.wasModifiedInRev || false,
      };
      if (prev.previousValues) {
        baseItem.previousValues = prev.previousValues;
      }
      return baseItem;
    });

    payload.lineItems = enrichedItems;
  }

  // Revision Handshake & Pipeline Reset
  const isResubmission = existingData && (existingData.status === 'returned' || Boolean((existingData as any).isReturned)) && (data.status === 'under_review' || data.status === 'pending');
  if (isResubmission) {
    const newRevCount = (existingData.revisionCount || 1) + 1;
    const resubmissionNote = (data as any).resubmissionNote || '';

    payload.revisionCount = newRevCount;
    payload.returnRemarks = null;
    payload.stepRevisionRemarks = null;
    payload.returnFlags = [];
    payload.isReturned = false;
    payload.currentStageIndex = 1;
    payload.currentStepIndex = 0;
    if (resubmissionNote) {
      (payload as any).resubmissionNote = resubmissionNote;
    }

    let chain = (data.approvalChain || existingData.approvalChain || []);
    payload.approvalChain = chain.map((step) => {
      if ((step.stageIndex ?? 1) === 1) {
        return { ...step, status: 'current' as const, signedAt: null, signatureUrl: null };
      }
      return { ...step, status: 'waiting' as const, signedAt: null, signatureUrl: null };
    });

    const revisionEntry = sanitizeFirestorePayload({
      version: existingData.revisionCount || 1,
      versionLabel: `v${existingData.revisionCount || 1}.0`,
      submittedAt: existingData.submittedAt || null,
      submittedBy: existingData.submittedByName || existingData.createdByName || 'Submitter',
      submittedByUid: existingData.createdById || 'user',
      returnedAt: existingData.returnedAt || null,
      returnedBy: (existingData as any).returnedByName || (existingData as any).returnedBy || 'Reviewer',
      returnedByRoleTitle: (existingData as any).returnedByRoleTitle || 'Institutional Signatory',
      returnRemarks: existingData.returnRemarks || 'Revision requested.',
      stepRevisionRemarks: (existingData as any).stepRevisionRemarks || {},
      returnFlags: (existingData as any).returnFlags || [],
      resubmittedAt: new Date().toISOString(),
      resubmissionNote: resubmissionNote || `Resubmitted as v${newRevCount}.0`,
      dataSnapshot: {
        lineItems: (existingData.lineItems || []).map((it: any) => ({ ...it })),
        totalActualSpending: existingData.totalActualSpending || 0,
        allocatedBudget: existingData.allocatedBudget || 0,
        surplusOrDeficit: existingData.surplusOrDeficit || 0,
        notes: existingData.notes || '',
      },
    });
    payload.revisionHistory = arrayUnion(revisionEntry);

    const resubmitRemark: LiquidationRemark = sanitizeFirestorePayload({
      id: `rem-${Date.now()}`,
      authorName: data.submittedByName || existingData.submittedByName || 'Submitter',
      authorRole: (data.submittedByRole as any) || existingData.submittedByRole || 'officer',
      action: 'submitted',
      comment: resubmissionNote
        ? `Revision v${newRevCount}.0 resubmitted: ${resubmissionNote}. Route reset to Stage 1.`
        : `Resubmitted revision v${newRevCount}.0 with updated line items and receipt verification. Route reset to Stage 1.`,
      timestamp: new Date().toISOString(),
    });
    payload.remarksHistory = arrayUnion(resubmitRemark);
  }

  if (payload.lineItems !== undefined || data.allocatedBudget !== undefined) {
    const lineItems = payload.lineItems || data.lineItems || [];
    const totalActualSpending = lineItems.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
    payload.totalActualSpending = totalActualSpending;

    const budgetCeiling = data.allocatedBudget !== undefined ? data.allocatedBudget : (existingData?.allocatedBudget || 0);
    payload.surplusOrDeficit = budgetCeiling - totalActualSpending;
  }

  await updateDoc(docRef, sanitizeFirestorePayload(payload));

  // Sync event document if eventId and status exist
  const eventId = data.eventId || existingData?.eventId;
  const statusToSync = data.status;
  if (eventId && statusToSync) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, eventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: statusToSync,
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      }));
    } catch (evtErr) {
      console.warn('[updateLiquidationReport] Event sync notice:', evtErr);
    }
  }
};

/**
 * Changes status of a liquidation report to 'pending' (Submitted) and logs remark.
 */
export const submitLiquidationReport = async (
  id: string, 
  authorName?: string,
  commentText?: string
): Promise<void> => {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? (snap.data() as LiquidationDocument) : null;

  // Activate Stage 1 signatories and set remaining to waiting
  let chain = data?.approvalChain || [];
  chain = chain.map((step) => {
    if ((step.stageIndex ?? 1) === 1) {
      return { ...step, status: 'current' as const };
    }
    return { ...step, status: 'waiting' as const };
  });

  const newRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: authorName || 'Officer',
    authorRole: 'officer',
    action: 'submitted',
    comment: commentText || 'Submitted liquidation report for institutional signatory review.',
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, sanitizeFirestorePayload({
    status: 'under_review',
    currentStageIndex: 1,
    currentStepIndex: 0,
    approvalChain: chain,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(sanitizeFirestorePayload(newRemark)),
  }));

  try {
    if (data?.eventId) {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: 'under_review',
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      }));
    }
  } catch (evtErr) {
    console.warn('[submitLiquidationReport] Event sync notice:', evtErr);
  }
};

/**
 * Moves a draft or unapproved liquidation report document to Trash (soft delete).
 * Cleans up the liquidationStatus reference on the parent event so it is not locked.
 */
export async function deleteLiquidationReport(
  liquidationId: string,
  user?: { uid: string; name: string; role?: string },
  reason?: string
): Promise<{ success: boolean; rolledBackLedgerCount: number }> {
  if (!liquidationId) throw new Error('Liquidation ID is required.');
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? (snap.data() as LiquidationDocument) : null;

  // 1. Move to Trash via soft delete
  await softDeleteDocument(
    LIQUIDATIONS_COLLECTION as any,
    liquidationId,
    user || { uid: 'system', name: 'User', role: 'Officer' },
    reason || 'Liquidation draft discarded'
  );

  // 2. Reset event document references across both collections so parent event is not locked
  if (data?.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const eventRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(eventRef);
        if (evSnap.exists()) {
          await updateDoc(eventRef, {
            liquidationStatus: null,
            liquidationReportId: null,
            liquidationRefNumber: null,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {
      console.warn('[deleteLiquidationReport] Non-critical event unlink notice:', e);
    }
  }

  return { success: true, rolledBackLedgerCount: 0 };
}

/**
 * Restores a soft-deleted liquidation report back to draft status.
 * Re-links parent event references.
 */
export async function restoreLiquidationReport(
  liquidationId: string,
  user: { uid: string; name: string; role?: string }
): Promise<void> {
  if (!liquidationId) throw new Error('Liquidation ID is required.');
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  const data = snap.exists() ? (snap.data() as LiquidationDocument) : null;

  await restoreDocument(LIQUIDATIONS_COLLECTION as any, liquidationId, user);

  // Re-link parent event
  if (data?.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, {
        liquidationStatus: data.status || 'draft',
        liquidationReportId: liquidationId,
        liquidationRefNumber: data.referenceNumber || null,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[restoreLiquidationReport] Non-critical event relink notice:', e);
    }
  }
}

/**
 * Withdraws a submitted liquidation report back to 'draft' status so the author can edit before review.
 */
export async function withdrawLiquidationReport(
  id: string,
  userId: string,
  userName?: string
): Promise<void> {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found.');

  const data = snap.data() as LiquidationDocument;
  const currentStatus = (data.status || '').toLowerCase().trim();
  if (currentStatus !== 'under_review' && currentStatus !== 'pending') {
    throw new Error('Only liquidation reports currently under review can be withdrawn.');
  }

  // Reset chain steps
  const chain = (data.approvalChain || []).map((step, idx) => ({
    ...step,
    status: idx === 0 ? ('current' as const) : ('waiting' as const),
    signedAt: null,
    signatureUrl: null,
  }));

  const withdrawRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: userName || 'Author',
    authorRole: data.createdByRole || 'officer',
    action: 'draft_saved',
    comment: `Liquidation submission withdrawn back to draft by ${userName || 'author'} for revision.`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, sanitizeFirestorePayload({
    status: 'draft',
    currentStageIndex: 1,
    currentStepIndex: 0,
    approvalChain: chain,
    remarksHistory: arrayUnion(sanitizeFirestorePayload(withdrawRemark)),
    updatedAt: serverTimestamp(),
  }));

  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: 'draft',
        updatedAt: serverTimestamp(),
      }));
    } catch (e) {
      console.warn('[withdrawLiquidationReport] Event sync notice:', e);
    }
  }
}

/**
 * Approves a liquidation report.
 * Updates status to 'approved' and posts financial surplus/deficit to the appropriate ledger.
 */
export const approveLiquidationReport = async (
  id: string,
  adminUserId: string,
  remarks?: string,
  liquidationData?: Partial<LiquidationDocument>
): Promise<void> => {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);
  
  const approvalRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: 'SAO Adviser',
    authorRole: 'admin',
    action: 'approved',
    comment: remarks || 'Liquidation report approved. Financial ledger updated.',
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, sanitizeFirestorePayload({
    status: 'approved',
    approvedBy: adminUserId,
    approvedAt: serverTimestamp(),
    returnRemarks: remarks || null,
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(sanitizeFirestorePayload(approvalRemark)),
  }));

  // Sync event document
  const targetEventId = liquidationData?.eventId;
  if (targetEventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, targetEventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: 'approved',
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      }));
    } catch (e) {
      console.warn('[approveLiquidationReport] Event sync notice:', e);
    }
  } else {
    try {
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()?.eventId) {
        const eventRef = doc(db, EVENTS_COLLECTION, snap.data().eventId);
        await updateDoc(eventRef, sanitizeFirestorePayload({
          liquidationStatus: 'approved',
          liquidationReportId: id,
          updatedAt: serverTimestamp(),
        }));
      }
    } catch (e) {
      console.warn('[approveLiquidationReport] Event sync notice:', e);
    }
  }

  // Post entry to appropriate ledger (SAO or Club Treasury)
  try {
    await postLiquidationToLedger(id, liquidationData, adminUserId);
  } catch (err) {
    console.warn('[approveLiquidationReport] Ledger write note:', err);
  }

  // Auto-archive approved liquidation report into EDMS
  try {
    await autoArchiveApprovedLiquidation(id, liquidationData, adminUserId);
  } catch (archErr) {
    console.warn('[approveLiquidationReport] Auto-archive to EDMS notice:', archErr);
  }
};

/**
 * Returns a liquidation report to the officer with revision remarks.
 */
export const returnLiquidationReport = async (
  id: string,
  adminUserId: string,
  remarks: string,
  adminName = 'SAS Adviser',
  adminRoleTitle = 'Student Affairs & Services Head',
  adminEmail?: string,
  stepRevisionRemarks?: Record<string, string>,
  returnFlags?: string[],
  returnDeadline?: string
): Promise<void> => {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);
  const snap = await getDoc(docRef);
  const existingData = snap.exists() ? (snap.data() as LiquidationDocument) : null;

  const returnRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: adminName,
    authorRole: 'admin',
    action: 'returned',
    comment: remarks,
    timestamp: new Date().toISOString(),
  };

  const effectiveDeadline =
    returnDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const revisionEntry = {
    version: existingData?.revisionCount || 1,
    versionLabel: `v${existingData?.revisionCount || 1}.0`,
    submittedAt: existingData?.submittedAt || null,
    submittedBy: existingData?.submittedByName || existingData?.createdByName || 'Submitter',
    submittedByUid: existingData?.createdById,
    returnedAt: new Date().toISOString(),
    returnedBy: adminName,
    returnedByRoleTitle: adminRoleTitle,
    returnedByEmail: adminEmail,
    returnRemarks: remarks,
    stepRevisionRemarks: stepRevisionRemarks || {},
    returnFlags: returnFlags || [],
    returnDeadline: effectiveDeadline,
  };

  await updateDoc(docRef, sanitizeFirestorePayload({
    status: 'returned',
    isReturned: true,
    returnRemarks: remarks,
    stepRevisionRemarks: stepRevisionRemarks || null,
    returnFlags: returnFlags || [],
    returnDeadline: effectiveDeadline,
    returnedBy: adminUserId,
    returnedByName: adminName,
    returnedByRoleTitle: adminRoleTitle,
    returnedByEmail: adminEmail || null,
    returnedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(sanitizeFirestorePayload(returnRemark)),
    revisionHistory: arrayUnion(sanitizeFirestorePayload(revisionEntry)),
  }));

  try {
    if (existingData?.eventId) {
      const eventRef = doc(db, EVENTS_COLLECTION, existingData.eventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: 'returned',
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      }));
    }
  } catch (e) {
    console.warn('[returnLiquidationReport] Event sync notice:', e);
  }
};

/**
 * Endorse or Approve a Financial Liquidation Report by an institutional signatory.
 * Supports multi-stage sequential / parallel signing matching official Form LF-01:
 * - In any stage, designated signers digitally sign with their verified electronic signature.
 * - When all signers in the current stage complete, the next stage unlocks.
 * - When the final stage completes, the liquidation is marked 'approved', posts to ledger, and unlocks event archiving.
 */
export async function endorseLiquidationStep(
  liquidationId: string,
  signatory: {
    uid?: string;
    id?: string;
    name: string;
    email: string;
    roleTitle?: string;
    role?: string;
    actionType?: 'check' | 'endorse' | 'approve' | 'note';
    signatureUrl?: string;
  },
  remarks = ''
): Promise<{ success: boolean; nextStepIndex: number; isFullyApproved: boolean; stageAdvanced?: boolean }> {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found');

  const data = snap.data() as LiquidationDocument;
  const chain = [...(data.approvalChain || [])];
  if (chain.length === 0) throw new Error('No approval steps found on this liquidation report');

  const signerUid = signatory.id || signatory.uid || '';
  const signerEmail = (signatory.email || '').toLowerCase();
  const currentStage = data.currentStageIndex ?? 1;

  // Locate the target step in current stage
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
    throw new Error('No pending approval step found for your account on this liquidation report');
  }

  const targetStep = chain[targetStepIdx];
  const isSchoolAdmin = targetStep.role === 'school_administrator' || signatory.role === 'school_administrator';
  const isPresident = targetStep.role === 'school_president' || signatory.role === 'school_president';
  const isExecutiveApprover =
    isPresident ||
    isSchoolAdmin ||
    targetStep.actionType === 'approve' ||
    signatory.actionType === 'approve';

  let newStatus: 'endorsed' | 'approved' = 'endorsed';
  if (isPresident) {
    newStatus = 'approved';
  } else if (signatory.actionType === 'approve') {
    newStatus = 'approved';
  } else if (signatory.actionType === 'endorse') {
    newStatus = 'endorsed';
  } else if (targetStep.actionType === 'approve') {
    newStatus = 'approved';
  }

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

  if (effectiveSigUrl) updatedStep.signatureUrl = effectiveSigUrl;
  else delete updatedStep.signatureUrl;

  if (effectiveRemarks) updatedStep.remarks = effectiveRemarks;
  else delete updatedStep.remarks;

  chain[targetStepIdx] = updatedStep as any;

  // Dual-Approver Resolution within Executive Stage
  if (newStatus === 'approved') {
    // Authorized approver chose to fully authorize & approve:
    // Any remaining co-approvers in this stage are waived with clear audit attribution.
    const approverName = signatory.name || targetStep.signatoryName || 'Executive Signatory';
    const approverTitle = signatory.roleTitle || targetStep.roleTitle || (isPresident ? 'School President' : isSchoolAdmin ? 'School Administrator' : 'Executive Approver');

    chain.forEach((s, idx) => {
      if (
        idx !== targetStepIdx &&
        (s.status === 'waiting' || s.status === 'current') &&
        ((s.stageIndex ?? 1) === currentStage || s.actionType === 'approve' || s.role === 'school_president' || s.role === 'school_administrator')
      ) {
        chain[idx] = {
          ...s,
          status: 'waived',
          remarks: `Step waived — Liquidation authorized and fully approved by ${approverTitle} (${approverName})`,
        };
      }
    });
  } else if (newStatus === 'endorsed' && isExecutiveApprover) {
    // Executive approver chose to endorse & forward for higher approval (e.g. to President):
    // Activate waiting higher approvers in this stage.
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

  // Clean chain
  const sanitizedChain = chain.map((step) => {
    const s: Record<string, any> = { ...step };
    Object.keys(s).forEach((k) => {
      if (s[k] === undefined) delete s[k];
    });
    return s as LiquidationApprovalStep;
  });

  const hasStages = sanitizedChain.some((s) => typeof s.stageIndex === 'number');
  let isFullyApproved = false;
  let nextStageIndex = currentStage;
  let stageAdvanced = false;

  if (hasStages) {
    const currentStageSteps = sanitizedChain.filter((s) => (s.stageIndex ?? 1) === currentStage);
    const allStageStepsCompleted = currentStageSteps.every(
      (s) => s.status === 'endorsed' || s.status === 'approved' || s.status === 'waived'
    );

    if (allStageStepsCompleted) {
      const futureStages = sanitizedChain
        .map((s) => s.stageIndex ?? 1)
        .filter((stg) => stg > currentStage)
        .sort((a, b) => a - b);

      if (futureStages.length > 0) {
        nextStageIndex = futureStages[0];
        stageAdvanced = true;
        sanitizedChain.forEach((s, idx) => {
          if ((s.stageIndex ?? 1) === nextStageIndex && s.status === 'waiting') {
            sanitizedChain[idx] = { ...s, status: 'current' };
          }
        });
      } else {
        isFullyApproved = true;
      }
    }
  } else {
    const nextIdx = targetStepIdx + 1;
    isFullyApproved = nextIdx >= sanitizedChain.length;
    if (!isFullyApproved && sanitizedChain[nextIdx]) {
      sanitizedChain[nextIdx] = { ...sanitizedChain[nextIdx], status: 'current' };
    }
  }

  const endorsementRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: signatory.name || 'Signatory',
    authorRole: 'signatory',
    action: isFullyApproved ? 'approved' : 'endorsed',
    comment: remarks || (isFullyApproved ? 'Financial liquidation approved by executive.' : `Endorsed stage ${currentStage} with digital signature.`),
    timestamp: new Date().toISOString(),
  };

  const rawUpdates: any = {
    approvalChain: sanitizedChain,
    currentStepIndex: targetStepIdx + 1,
    currentStageIndex: nextStageIndex,
    status: isFullyApproved ? 'approved' : 'under_review',
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(endorsementRemark),
  };

  if (isFullyApproved) {
    rawUpdates.approvedAt = serverTimestamp();
    rawUpdates.approvedBy = signerUid || signatory.email;
  }

  await updateDoc(docRef, sanitizeFirestorePayload(rawUpdates));

  // Sync linked event
  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: isFullyApproved ? 'approved' : 'under_review',
        liquidationReportId: liquidationId,
        liquidationRefNumber: data.referenceNo || '',
        updatedAt: serverTimestamp(),
      }));
    } catch (evtErr) {
      console.warn('[endorseLiquidationStep] Event sync note:', evtErr);
    }
  }

  // If fully approved, post financial surplus or deficit to ledger and archive to EDMS
  if (isFullyApproved) {
    try {
      await postLiquidationToLedger(liquidationId, { ...data, ...rawUpdates }, signerUid);
    } catch (ledgerErr) {
      console.warn('[endorseLiquidationStep] Ledger write note:', ledgerErr);
    }

    try {
      await autoArchiveApprovedLiquidation(liquidationId, { ...data, ...rawUpdates }, signerUid || signatory.email);
    } catch (archErr) {
      console.warn('[endorseLiquidationStep] Auto-archive to EDMS notice:', archErr);
    }
  }

  return {
    success: true,
    nextStepIndex: targetStepIdx + 1,
    isFullyApproved,
    stageAdvanced,
  };
}

/**
 * Return a Financial Liquidation Report for revision by a signatory.
 */
export async function returnLiquidationStep(
  liquidationId: string,
  signatory: { uid?: string; id?: string; name: string; email: string; roleTitle?: string; role?: string },
  remarks: string,
  stepRevisionRemarks?: Record<string, string>,
  returnFlags?: string[],
  returnDeadline?: string
): Promise<{ success: boolean }> {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found');

  const data = snap.data() as LiquidationDocument;
  const chain = [...(data.approvalChain || [])];
  const signerUid = signatory.id || signatory.uid || '';
  const signerEmail = (signatory.email || '').toLowerCase();
  const currentStage = data.currentStageIndex ?? 1;

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
    if (remarks) s.remarks = remarks;
    else delete s.remarks;
    chain[targetStepIdx] = s as LiquidationApprovalStep;
  }

  const returnRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: signatory.name || 'Signatory',
    authorRole: 'signatory',
    action: 'returned',
    comment: remarks,
    timestamp: new Date().toISOString(),
  };

  const effectiveDeadline =
    returnDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const revisionEntry = {
    version: data.revisionCount || 1,
    versionLabel: `v${data.revisionCount || 1}.0`,
    submittedAt: data.submittedAt || null,
    submittedBy: data.submittedByName || data.createdByName || 'Submitter',
    submittedByUid: data.createdById,
    returnedAt: new Date().toISOString(),
    returnedBy: signatory.name || 'Signatory',
    returnedByRoleTitle: signatory.roleTitle || 'Institutional Signatory',
    returnedByEmail: signatory.email,
    returnRemarks: remarks,
    stepRevisionRemarks: stepRevisionRemarks || {},
    returnFlags: returnFlags || [],
    returnDeadline: effectiveDeadline,
  };

  const rawUpdates: any = {
    status: 'returned',
    isReturned: true,
    returnRemarks: remarks,
    stepRevisionRemarks: stepRevisionRemarks || null,
    returnFlags: returnFlags || [],
    returnDeadline: effectiveDeadline,
    returnedBy: signerUid || null,
    returnedByName: signatory.name || 'Signatory',
    returnedByRoleTitle: signatory.roleTitle || 'Institutional Signatory',
    returnedByEmail: signatory.email || null,
    returnedAt: serverTimestamp(),
    approvalChain: chain,
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(returnRemark),
    revisionHistory: arrayUnion(revisionEntry),
  };

  await updateDoc(docRef, sanitizeFirestorePayload(rawUpdates));

  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, sanitizeFirestorePayload({
        liquidationStatus: 'returned',
        liquidationReportId: liquidationId,
        updatedAt: serverTimestamp(),
      }));
    } catch (e) {
      console.warn('[returnLiquidationStep] Event sync note:', e);
    }
  }

  return { success: true };
}

/**
 * Helper to post liquidation financial entry (surplus refund or deficit expense) to the correct ledger:
 * - Admin/Institutional Liquidation -> /sao_ledger
 * - Officer/Organization Liquidation -> /organization_ledger
 */
async function postLiquidationToLedger(
  liquidationId: string, 
  data?: Partial<LiquidationDocument>, 
  adminUserId?: string
) {
  const netAmount = data?.surplusOrDeficit ?? ((data?.allocatedBudget ?? 0) - (data?.totalActualSpending ?? 0));
  if (netAmount === 0) return;

  const isSurplus = netAmount > 0;
  const absAmount = Math.abs(netAmount);
  const eventTitle = data?.eventTitle || 'Event Liquidation';
  const semesterId = data?.semesterId || null;
  const eventId = data?.eventId || null;

  const isClubLiquidation = Boolean(
    data?.organizationId &&
    data.organizationId !== 'sas' &&
    data.organizationId !== 'sas_admin' &&
    data.createdByRole !== 'admin'
  );

  const description = isSurplus
    ? `Liquidation Surplus Returned – ${eventTitle}`
    : `Liquidation Deficit / Overspend – ${eventTitle}`;

  if (isClubLiquidation) {
    const orgLedgerRef = collection(db, 'organization_ledger');
    // Check if this liquidation has already been posted to avoid duplicate transactions
    const qDup = query(orgLedgerRef, where('collectionId', '==', liquidationId));
    const existingSnap = await getDocs(qDup);
    if (!existingSnap.empty) {
      console.log(`[postLiquidationToLedger] Liquidation ${liquidationId} already posted to organization_ledger.`);
      return;
    }

    await addDoc(orgLedgerRef, {
      organizationId: data!.organizationId,
      semesterId,
      date: Timestamp.now(),
      description,
      eventId,
      type: isSurplus ? 'income' : 'expense',
      source: isSurplus ? 'liquidation_surplus' : 'liquidation_deficit',
      amount: absAmount,
      addedBy: adminUserId || 'SAO Adviser',
      collectionId: liquidationId,
      createdAt: serverTimestamp(),
    });
  } else {
    const saoLedgerRef = collection(db, 'sao_ledger');
    // Check if this liquidation has already been posted to avoid duplicate transactions
    const qDup = query(saoLedgerRef, where('collectionId', '==', liquidationId));
    const existingSnap = await getDocs(qDup);
    if (!existingSnap.empty) {
      console.log(`[postLiquidationToLedger] Liquidation ${liquidationId} already posted to sao_ledger.`);
      return;
    }

    await addDoc(saoLedgerRef, {
      semesterId,
      date: Timestamp.now(),
      description,
      eventId,
      type: isSurplus ? 'income' : 'expense',
      source: isSurplus ? 'liquidation_surplus' : 'liquidation_deficit',
      amount: absAmount,
      addedBy: adminUserId || 'SAO Adviser',
      collectionId: liquidationId,
      createdAt: serverTimestamp(),
    });
  }
}
