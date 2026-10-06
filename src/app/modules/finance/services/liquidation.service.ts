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
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import type { 
  LiquidationDocument, 
  LiquidationRemark, 
  LiquidationApprovalStep 
} from '../types/liquidation.types';
import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import { SIGNATORIES_COLLECTION } from '../../signatories/services/signatory.service';

export const LIQUIDATIONS_COLLECTION = 'liquidations';

/**
 * Automatically builds the standard STI liquidation approval chain (Form LF-01)
 * populated with active institutional signatories from Firestore.
 */
export async function generateDefaultLiquidationChain(
  orgId?: string,
  orgName?: string,
  budgetAmount?: number,
  providedSignatories?: InstitutionalSignatory[]
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

  // 1. Accountant / SAO Auditor (Stage 1: Checking & Verification)
  const accountant = activeSignatories.find(
    (s) => s.role === 'accountant' || s.roleTitle.toLowerCase().includes('accountant') || s.roleTitle.toLowerCase().includes('auditor')
  );

  // 2. Program Head / Adviser / SAO Coordinator (Stage 2: Endorsement)
  const programHead = activeSignatories.find(
    (s) => (s.role === 'program_head' || s.roleTitle.toLowerCase().includes('program head') || s.roleTitle.toLowerCase().includes('coordinator') || s.roleTitle.toLowerCase().includes('adviser')) && s.id !== accountant?.id
  ) || activeSignatories.find((s) => s.id !== accountant?.id);

  // 3. Academic Head / Dean (Stage 3: Recommendation)
  const academicHead = activeSignatories.find(
    (s) => (s.role === 'academic_head' || s.roleTitle.toLowerCase().includes('academic head') || s.roleTitle.toLowerCase().includes('dean') || s.roleTitle.toLowerCase().includes('principal')) && s.id !== accountant?.id && s.id !== programHead?.id
  ) || activeSignatories.find((s) => s.id !== accountant?.id && s.id !== programHead?.id);

  // 4. Executive Approvers (Stage 4: Executive Administration & Presidential Approval)
  const executiveApprovers = activeSignatories.filter(
    (s) =>
      (s.role === 'school_president' ||
        s.role === 'school_administrator' ||
        s.actionType === 'approver' ||
        s.actionType === 'both' ||
        s.roleTitle.toLowerCase().includes('president') ||
        s.roleTitle.toLowerCase().includes('administrator')) &&
      s.id !== accountant?.id &&
      s.id !== programHead?.id &&
      s.id !== academicHead?.id
  );

  // Sort so School Administrator comes before School President
  executiveApprovers.sort((a, b) => {
    if (a.role === 'school_administrator' && b.role !== 'school_administrator') return -1;
    if (b.role === 'school_administrator' && a.role !== 'school_administrator') return 1;
    if (a.role === 'school_president' && b.role !== 'school_president') return 1;
    if (b.role === 'school_president' && a.role !== 'school_president') return -1;
    return 0;
  });

  const steps: LiquidationApprovalStep[] = [
    {
      id: `liq_step_1_${Date.now()}`,
      step: 1,
      stageIndex: 1,
      stageName: 'Financial Checking & Audit',
      role: accountant?.role || 'accountant',
      roleTitle: accountant?.roleTitle || 'Accountant / SAO Auditor',
      actionType: 'check',
      signatoryUid: accountant?.id || '',
      signatoryName: accountant?.name || 'Assigned Accountant / Auditor',
      signatoryEmail: accountant?.email || '',
      department: accountant?.department || 'Finance & Accounting',
      status: 'current',
    },
    {
      id: `liq_step_2_${Date.now()}`,
      step: 2,
      stageIndex: 2,
      stageName: 'Department & Program Endorsement',
      role: programHead?.role || 'program_head',
      roleTitle: programHead?.roleTitle || 'Program Head / Adviser',
      actionType: 'endorse',
      signatoryUid: programHead?.id || '',
      signatoryName: programHead?.name || 'Department Program Head',
      signatoryEmail: programHead?.email || '',
      department: programHead?.department || (orgName || 'Academic Department'),
      status: 'waiting',
    },
    {
      id: `liq_step_3_${Date.now()}`,
      step: 3,
      stageIndex: 3,
      stageName: 'Academic Affairs Recommendation',
      role: academicHead?.role || 'academic_head',
      roleTitle: academicHead?.roleTitle || 'Academic Head / Dean',
      actionType: 'endorse',
      signatoryUid: academicHead?.id || '',
      signatoryName: academicHead?.name || 'Academic Head / Dean',
      signatoryEmail: academicHead?.email || '',
      department: academicHead?.department || 'Academic Affairs',
      status: 'waiting',
    },
  ];

  let nextStepNumber = 4;
  if (executiveApprovers.length > 0) {
    executiveApprovers.forEach((appr, idx) => {
      steps.push({
        id: `liq_step_4_${idx + 1}_${Date.now()}`,
        step: nextStepNumber++,
        stageIndex: 4,
        stageName: 'Executive Presidential Approval',
        role: appr.role || 'school_president',
        roleTitle: appr.roleTitle || (appr.role === 'school_president' ? 'School President' : 'School Administrator'),
        actionType: appr.role === 'school_president' ? 'approve' : (appr.actionType === 'approver' || appr.actionType === 'both' ? 'approve' : 'endorse'),
        signatoryUid: appr.id || '',
        signatoryName: appr.name || 'School Administrator / President',
        signatoryEmail: appr.email || '',
        department: appr.department || (appr.role === 'school_president' ? 'Office of the President' : 'School Administration'),
        status: 'waiting',
      });
    });
  } else {
    steps.push({
      id: `liq_step_4_${Date.now()}`,
      step: 4,
      stageIndex: 4,
      stageName: 'Executive Presidential Approval',
      role: 'school_president',
      roleTitle: 'School Administrator / President',
      actionType: 'approve',
      signatoryUid: '',
      signatoryName: 'School Administrator / President',
      signatoryEmail: '',
      department: 'Office of the President',
      status: 'waiting',
    });
  }

  return steps;
}

/**
 * Creates a new Liquidation Report document in Firestore.
 * Auto-approves and posts to ledger if created by SAO Admin.
 */
export const createLiquidationReport = async (
  data: Omit<LiquidationDocument, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const lineItems = data.lineItems || [];
  const totalActualSpending = lineItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  const surplusOrDeficit = (data.allocatedBudget || 0) - totalActualSpending;

  const isAdmin = data.createdByRole === 'admin';
  const initialStatus = data.status || (isAdmin ? 'approved' : 'draft');
  const isAutoApproved = isAdmin && initialStatus === 'approved';

  // Build or clean approval chain
  let chain = data.approvalChain;
  if (!chain || chain.length === 0) {
    chain = await generateDefaultLiquidationChain(data.organizationId, data.organizationName, data.allocatedBudget);
  }

  // If submitting right away (status === 'pending' or 'under_review'), ensure Stage 1 is 'current'
  if (initialStatus === 'pending' || initialStatus === 'under_review') {
    chain = chain.map((step) => {
      if ((step.stageIndex ?? 1) === 1) {
        return { ...step, status: 'current' as const };
      }
      return { ...step, status: 'waiting' as const };
    });
  }

  const initialRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: data.createdByName || (isAdmin ? 'SAO Adviser' : 'Officer'),
    authorRole: data.createdByRole || 'officer',
    action: isAutoApproved ? 'approved' : (initialStatus === 'pending' || initialStatus === 'under_review' ? 'submitted' : 'draft_saved'),
    comment: isAutoApproved
      ? 'Liquidation created and auto-approved by SAO Adviser.'
      : (initialStatus === 'pending' || initialStatus === 'under_review' ? 'Liquidation report submitted for institutional signatory review.' : 'Draft liquidation created.'),
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
    ...(isAutoApproved ? { approvedAt: serverTimestamp() as any, approvedBy: data.createdById } : {}),
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  const docRef = await addDoc(collection(db, LIQUIDATIONS_COLLECTION), payload);

  // Sync event liquidationStatus on event document
  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, {
        liquidationStatus: initialStatus,
        liquidationReportId: docRef.id,
        updatedAt: serverTimestamp(),
      });
    } catch (evtErr) {
      console.warn('[createLiquidationReport] Event sync notice:', evtErr);
    }
  }

  // If Admin created and auto-approved, auto-post to SAO Ledger
  if (isAutoApproved) {
    try {
      await postLiquidationToLedger(docRef.id, payload as Partial<LiquidationDocument>, data.createdById);
    } catch (err) {
      console.warn('[createLiquidationReport] Ledger write note:', err);
    }
  }

  return docRef.id;
};

/**
 * Updates an existing Liquidation Report. Recalculates total spending and surplus/deficit.
 */
export const updateLiquidationReport = async (
  id: string,
  data: Partial<LiquidationDocument>
): Promise<void> => {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);

  const payload: any = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.lineItems !== undefined || data.allocatedBudget !== undefined) {
    const lineItems = data.lineItems || [];
    const totalActualSpending = lineItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    payload.totalActualSpending = totalActualSpending;

    if (data.allocatedBudget !== undefined) {
      payload.surplusOrDeficit = data.allocatedBudget - totalActualSpending;
    }
  }

  await updateDoc(docRef, payload);

  // Sync event document if eventId and status exist
  if (data.eventId && data.status) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, {
        liquidationStatus: data.status,
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      });
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

  const newRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: authorName || 'Officer',
    authorRole: 'officer',
    action: 'submitted',
    comment: commentText || 'Resubmitted liquidation report with updated line items and receipt evidence.',
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    status: 'pending',
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(newRemark),
  });

  try {
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data()?.eventId) {
      const eventRef = doc(db, EVENTS_COLLECTION, snap.data().eventId);
      await updateDoc(eventRef, {
        liquidationStatus: 'submitted',
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (evtErr) {
    console.warn('[submitLiquidationReport] Event sync notice:', evtErr);
  }
};

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

  await updateDoc(docRef, {
    status: 'approved',
    approvedBy: adminUserId,
    approvedAt: serverTimestamp(),
    returnRemarks: remarks || null,
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(approvalRemark),
  });

  // Sync event document
  const targetEventId = liquidationData?.eventId;
  if (targetEventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, targetEventId);
      await updateDoc(eventRef, {
        liquidationStatus: 'approved',
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[approveLiquidationReport] Event sync notice:', e);
    }
  } else {
    try {
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()?.eventId) {
        const eventRef = doc(db, EVENTS_COLLECTION, snap.data().eventId);
        await updateDoc(eventRef, {
          liquidationStatus: 'approved',
          liquidationReportId: id,
          updatedAt: serverTimestamp(),
        });
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
};

/**
 * Returns a liquidation report to the officer with revision remarks.
 */
export const returnLiquidationReport = async (
  id: string,
  adminUserId: string,
  remarks: string
): Promise<void> => {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);

  const returnRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: 'SAO Adviser',
    authorRole: 'admin',
    action: 'returned',
    comment: remarks,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    status: 'returned',
    returnRemarks: remarks,
    returnedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(returnRemark),
  });

  try {
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data()?.eventId) {
      const eventRef = doc(db, EVENTS_COLLECTION, snap.data().eventId);
      await updateDoc(eventRef, {
        liquidationStatus: 'returned',
        liquidationReportId: id,
        updatedAt: serverTimestamp(),
      });
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

  let newStatus: 'endorsed' | 'approved' = 'endorsed';
  if (isPresident) {
    newStatus = 'approved';
  } else if (isSchoolAdmin) {
    newStatus = signatory.actionType === 'approve' ? 'approved' : 'endorsed';
  } else if (
    targetStep.actionType === 'approve' ||
    signatory.actionType === 'approve'
  ) {
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
  if (isSchoolAdmin && newStatus === 'approved') {
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
          remarks: `Step waived — Liquidation authorized and fully approved by School Administrator (${signatory.name || targetStep.signatoryName})`,
        };
      }
    });
  } else if (isSchoolAdmin && newStatus === 'endorsed') {
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

  await updateDoc(docRef, rawUpdates);

  // Sync linked event
  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, {
        liquidationStatus: isFullyApproved ? 'approved' : 'under_review',
        liquidationReportId: liquidationId,
        updatedAt: serverTimestamp(),
      });
    } catch (evtErr) {
      console.warn('[endorseLiquidationStep] Event sync note:', evtErr);
    }
  }

  // If fully approved, post financial surplus or deficit to ledger
  if (isFullyApproved) {
    try {
      await postLiquidationToLedger(liquidationId, { ...data, ...rawUpdates }, signerUid);
    } catch (ledgerErr) {
      console.warn('[endorseLiquidationStep] Ledger write note:', ledgerErr);
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
  remarks: string
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

  const rawUpdates: any = {
    status: 'returned',
    returnRemarks: remarks,
    returnedAt: serverTimestamp(),
    approvalChain: chain,
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(returnRemark),
  };

  await updateDoc(docRef, rawUpdates);

  if (data.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, {
        liquidationStatus: 'returned',
        liquidationReportId: liquidationId,
        updatedAt: serverTimestamp(),
      });
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
