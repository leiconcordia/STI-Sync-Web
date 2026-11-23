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
import { getActiveMiscFeeAcademicContext } from './misc-fee.service';
import { hasAnySignatorySigned } from '../../workflow/utils/approval-permissions.utils';
import type { 
  LiquidationDocument, 
  LiquidationRemark, 
  LiquidationApprovalStep,
  LiquidationStatus,
  ReceiptAttachment,
} from '../types/liquidation.types';
import type {
  ProposalBucketAllocation,
  SurplusReturnAllocation,
  DeficitDeductionAllocation,
} from '../../activity-proposals/types/proposal.types';
import {
  validateSurplusReturnAllocations,
  validateDeficitDeductionAllocations,
} from '../../activity-proposals/utils/proposal-calculations';
import {
  type InstitutionalSignatory,
  isSignatoryApplicableTo,
} from '../../signatories/types/signatory.types';
import { SIGNATORIES_COLLECTION } from '../../signatories/services/signatory.service';
import { resolveSignatoryLabel, canSignatoryApproveDocument } from '../../signatories/utils/signatory-label.utils';
import { getCachedSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import { createNotification } from '../../notifications';
import { autoArchiveApprovedLiquidation } from '../../reports/services/report-archive.service';
import {
  buildLiquidationApprovalNotificationPayload,
  computeLiveStudentCollectionReimbursementCapacity,
  isSasOwnedLiquidation,
  isStudentCollectionFunding,
} from '../utils/liquidation-settlement.utils';
import { isSasInstitutionalActivity } from '../../events/utils/event-lifecycle.utils';
import { mergeBaseAndSupplementalAllocations } from '../../supplemental-budget/utils/sbr-validation.utils';
import { softDeleteDocument, restoreDocument } from '../../workflow/services/soft-delete.service';
import {
  getCachedWorkflowSettings,
  getDefaultWorkflowSettings,
  getBuiltinDefaultWorkflow,
  filterTemplateStepsBySignatoryScope,
} from '../../workflow/services/approval-workflow.service';
import { normalizeApprovalStages } from '../../workflow/utils/stage-normalization.utils';

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
  let allSignatories = providedSignatories;

  if (!allSignatories || allSignatories.length === 0) {
    try {
      const snap = await getDocs(collection(db, SIGNATORIES_COLLECTION));
      allSignatories = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InstitutionalSignatory));
    } catch (e) {
      console.warn('[generateDefaultLiquidationChain] Could not fetch signatories:', e);
      allSignatories = [];
    }
  }

  // Filter out inactive signatories and those not eligible for Financial Liquidations
  const activeSignatories = (allSignatories || []).filter(
    (s) => s.isActive !== false && isSignatoryApplicableTo(s, 'liquidation')
  );

  if (activeSignatories.length === 0 && isSasCreator) {
    return [];
  }

  // ── Pull Configured Workflow Template from Settings (Admin FL vs Adviser FL) ──
  const pipelineKey = isSasCreator ? 'admin_fl' : 'adviser_fl';
  let workflowSettings: any;
  try {
    workflowSettings = await getDefaultWorkflowSettings();
  } catch (err) {
    workflowSettings = getCachedWorkflowSettings();
  }

  let configuredTemplate = workflowSettings ? workflowSettings[pipelineKey] : undefined;

  // Fallback: If target role's FL has no assigned eligible signers, check if the other role's FL was configured
  const hasAssignedSigners = (steps?: any[]) =>
    Array.isArray(steps) && steps.some((s) => Boolean(s.signatoryUid || s.signatoryName));

  const rawPrimaryFiltered = Array.isArray(configuredTemplate)
    ? filterTemplateStepsBySignatoryScope(configuredTemplate, allSignatories, 'liquidation', {
        normalize: true,
      })
    : [];

  if (hasAssignedSigners(rawPrimaryFiltered)) {
    configuredTemplate = rawPrimaryFiltered;
  } else {
    const alternateKey = isSasCreator ? 'adviser_fl' : 'admin_fl';
    const altFiltered = Array.isArray(workflowSettings?.[alternateKey])
      ? filterTemplateStepsBySignatoryScope(workflowSettings[alternateKey], allSignatories, 'liquidation', {
          normalize: true,
        })
      : [];
    configuredTemplate = hasAssignedSigners(altFiltered) ? altFiltered : rawPrimaryFiltered;
  }

  if (!configuredTemplate || configuredTemplate.length === 0) {
    configuredTemplate = filterTemplateStepsBySignatoryScope(
      getBuiltinDefaultWorkflow(pipelineKey),
      allSignatories,
      'liquidation',
      { normalize: true }
    );
  }

  if (configuredTemplate && configuredTemplate.length > 0) {
    const chain: LiquidationApprovalStep[] = [];
    const usedIds = new Set<string>();

    configuredTemplate.forEach((tpl: any, idx: number) => {
      const hasExplicitSigner = Boolean(
        (tpl.signatoryUid && String(tpl.signatoryUid).trim()) ||
        (tpl.signatoryEmail && String(tpl.signatoryEmail).trim())
      );

      // 1. Try to find live matched signatory from eligible maintenance roster by UID or email
      let matched = activeSignatories.find(
        (s) =>
          (tpl.signatoryUid && (s.id === tpl.signatoryUid || s.uid === tpl.signatoryUid)) ||
          (tpl.signatoryEmail && s.email && s.email.toLowerCase() === tpl.signatoryEmail.toLowerCase())
      );

      // 2. Fallback to role matching ONLY if template had no explicit signatory assigned
      if (!matched && !hasExplicitSigner && tpl.role) {
        matched = activeSignatories.find(
          (s) => !usedIds.has(s.id) && (s.role === tpl.role || s.roleTitle?.toLowerCase() === tpl.roleTitle?.toLowerCase())
        );
      }

      // 3. Fallback for SAS Head if needed
      if (tpl.role === 'sas_head' && !matched) {
        const sasConfig = getCachedSasSignatoryConfig();
        matched = {
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
      }

      // Strictly skip template steps pinned to a disallowed/inactive/missing explicit signatory
      if (hasExplicitSigner && !matched) {
        return;
      }

      if (matched) {
        usedIds.add(matched.id);
      }

      const resolvedUid = matched?.id || tpl.signatoryUid || `liq_step_${Date.now()}_${idx + 1}`;
      const resolvedName = matched?.name || tpl.signatoryName || tpl.roleTitle || 'Institutional Signatory';
      const resolvedEmail = matched?.email || tpl.signatoryEmail || '';
      const resolvedRole = matched?.role || tpl.role || 'signatory';
      const resolvedRoleTitle = matched?.roleTitle || tpl.roleTitle || 'Institutional Signatory';
      const resolvedDept = matched?.department || tpl.department || '';
      const isPermanent = Boolean(tpl.isPermanent);
      const isMandatory = Boolean(tpl.isMandatory || isPermanent);

      const resolvedLabel = (tpl as any).signatoryLabel || matched?.defaultSignatoryLabel || resolveSignatoryLabel({ role: resolvedRole, roleTitle: resolvedRoleTitle, actionType: tpl.actionType } as any, 'liquidation', idx === configuredTemplate.length - 1);

      chain.push({
        id: tpl.id || `step_${idx + 1}`,
        step: idx + 1,
        stageIndex: tpl.stageIndex || 1,
        stageName: tpl.stageName || `Stage ${tpl.stageIndex || 1}`,
        role: resolvedRole,
        roleTitle: resolvedRoleTitle,
        actionType: tpl.actionType || 'endorse',
        signatoryLabel: resolvedLabel,
        signatoryUid: resolvedUid,
        signatoryName: resolvedName,
        signatoryEmail: resolvedEmail,
        department: resolvedDept,
        status: (tpl.stageIndex || 1) === 1 ? 'current' : 'waiting',
        isMandatory,
        isPermanent,
      });
    });

    if (chain.length > 0) {
      return normalizeApprovalStages(chain);
    }
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

      const resolvedLabel = sig.defaultSignatoryLabel || resolveSignatoryLabel({ role: sig.role, roleTitle: sig.roleTitle, actionType } as any, 'liquidation', gIdx === stageGroups.length - 1);

      steps.push({
        id: `liq_step_${stageIndex}_${sIdx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        step: globalStepIndex++,
        stageIndex,
        stageName: group.stageName,
        role: sig.role || '',
        roleTitle: sig.roleTitle || 'Institutional Signatory',
        actionType,
        signatoryLabel: resolvedLabel,
        signatoryUid: sig.id,
        signatoryName: sig.name,
        signatoryEmail: sig.email,
        department: sig.department || '',
        status: stageIndex === 1 ? 'current' : 'waiting',
        isMandatory: false,
        isPermanent: false,
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
  let eventMetadata: {
    schoolYear?: string;
    semester?: string;
    semesterId?: string;
  } = {};
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
      // ── STRICT 1:1:1 INVARIANT ENFORCEMENT ──
      // An activity proposal can have at most ONE active Financial Liquidation document.
      // If one already exists (in draft, pending, under_review, returned, etc.), NEVER create a duplicate.
      // Instead, seamlessly update the existing document with the incoming data and return its ID.
      const existingDoc = activeExisting[0];
      await updateLiquidationReport(existingDoc.id, data);
      return existingDoc.id;
    }

    // 2. Cross-verify parent event document
    const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
    const eventSnap = await getDoc(eventRef);
    if (eventSnap.exists()) {
      const evData = eventSnap.data() as any;
      eventMetadata = {
        schoolYear: evData.schoolYear,
        semester: evData.semester || evData.term,
        semesterId: evData.semesterId,
      };

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

      if (evData.liquidationReportId && evData.liquidationReportId !== 'null' && evData.liquidationReportId !== 'undefined') {
        const oldLiqSnap = await getDoc(doc(db, LIQUIDATIONS_COLLECTION, evData.liquidationReportId));
        if (oldLiqSnap.exists()) {
          const oldData = oldLiqSnap.data();
          const oldSt = (oldData.status || '').toLowerCase().trim();
          if (oldSt !== 'voided' && oldSt !== 'cancelled' && oldData.isDeleted !== true) {
            await updateLiquidationReport(oldLiqSnap.id, data);
            return oldLiqSnap.id;
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
  }

  const isOrgFunds =
    !isSasCreator &&
    ((data as any).fundingSource === 'organization_funds' ||
      (data as any).fundingSource === 'student_contributions');
  const requiresSasPreApprovalGate = !isSasCreator && !isOrgFunds;

  // If submitting right away, hold in waiting if SAS Pre-Approval Gate is required; otherwise activate Stage 1 steps
  if (isSubmitting) {
    chain = chain.map((step) => {
      if (requiresSasPreApprovalGate) {
        return { ...step, status: 'waiting' as const };
      }
      if ((step.stageIndex ?? 1) === 1) {
        return { ...step, status: 'current' as const };
      }
      return { ...step, status: 'waiting' as const };
    });
  }

  const isSubmittingToAdviser = initialStatus === 'for_adviser_review';
  const initialRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: data.createdByName || 'Submitter',
    authorRole: (data.createdByRole as any) || 'officer',
    action: isSubmittingToAdviser ? 'submitted_to_adviser' : isSubmitting ? 'submitted' : 'draft_saved',
    comment: isSubmittingToAdviser
      ? 'Liquidation report submitted by Student Officer for Club Adviser review.'
      : isSubmitting
      ? 'Liquidation report submitted for institutional signatory review.'
      : 'Draft liquidation report created.',
    timestamp: new Date().toISOString(),
  };

  const activeMiscCtx =
    (!data.schoolYear && !eventMetadata.schoolYear) ||
    (!data.semester && !eventMetadata.semester)
      ? await getActiveMiscFeeAcademicContext()
      : null;

  const payload: Partial<LiquidationDocument> = {
    ...data,
    schoolYear: data.schoolYear || eventMetadata.schoolYear || activeMiscCtx?.schoolYear || '',
    semester: data.semester || eventMetadata.semester || activeMiscCtx?.semester || '',
    semesterId: data.semesterId || eventMetadata.semesterId || '',
    totalActualSpending,
    surplusOrDeficit,
    status: initialStatus,
    approvalChain: chain,
    currentStageIndex: 1,
    currentStepIndex: 0,
    isPendingSasVetting: isSubmitting ? requiresSasPreApprovalGate : false,
    sasVettedAt: null,
    sasVettedBy: null,
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
        (item.receiptUrls?.length || 0) !== (prev.receiptUrls?.length || 0) ||
        (item.receiptFiles?.length || 0) !== (prev.receiptFiles?.length || 0);

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

    const isSasDoc =
      existingData.createdByRole === 'admin' ||
      existingData.organizationId === 'sao_admin' ||
      existingData.organizationId === 'sas';
    const isOrgFundsResub =
      (data as any).fundingSource === 'organization_funds' ||
      (existingData as any).fundingSource === 'organization_funds';
    const requiresSasGateOnResub = !isSasDoc && !isOrgFundsResub;

    payload.isPendingSasVetting = requiresSasGateOnResub;
    payload.sasVettedAt = null;
    payload.sasVettedBy = null;

    let chain = (data.approvalChain || existingData.approvalChain || []);
    payload.approvalChain = chain.map((step) => {
      if (requiresSasGateOnResub) {
        return { ...step, status: 'waiting' as const, signedAt: null, signatureUrl: null };
      }
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

  const isSasCreator =
    data?.createdByRole === 'admin' ||
    data?.organizationId === 'sao_admin' ||
    data?.organizationId === 'sas';
  const isOrgFunds = (data as any)?.fundingSource === 'organization_funds';
  const requiresSasPreApprovalGate = !isSasCreator && !isOrgFunds;

  // Activate Stage 1 signatories (or hold in waiting if SAS Pre-Approval Gate applies)
  let chain = data?.approvalChain || [];
  chain = chain.map((step) => {
    if (requiresSasPreApprovalGate) {
      return { ...step, status: 'waiting' as const };
    }
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
    isPendingSasVetting: requiresSasPreApprovalGate,
    sasVettedAt: null,
    sasVettedBy: null,
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

  // Real-time submission notification to SAS Admin / Stage 1 Signatories
  try {
    const orgName = data?.organizationName || data?.organizationId || 'Student Organization';
    const eventName = data?.eventTitle || (data as any)?.eventName || 'Completed Event';
    await createNotification({
      recipientRole: 'admin',
      type: 'document_submission',
      category: 'financial_liquidation',
      title: `Financial Liquidation Submitted: ${eventName}`,
      message: `${orgName} submitted financial liquidation for "${eventName}".`,
      resourceId: id,
      resourceType: 'liquidation',
      actionRoute: `/home/liquidations?tab=pending&id=${id}`,
      targetOrgId: data?.organizationId,
      targetOrgName: orgName,
      senderName: authorName || 'Officer',
    });
  } catch (notifErr) {
    console.warn('[submitLiquidationReport] Notification dispatch notice:', notifErr);
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
  const isFromAdviserQueue = currentStatus === 'for_adviser_review';
  if (currentStatus !== 'under_review' && currentStatus !== 'pending' && !isFromAdviserQueue) {
    throw new Error('Only liquidation reports currently under review or awaiting adviser review can be withdrawn.');
  }
  if (!isFromAdviserQueue && hasAnySignatorySigned(data)) {
    throw new Error(
      'Cannot withdraw: At least one signatory has already digitally signed this liquidation report.'
    );
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
    ...(isFromAdviserQueue ? { adviserReview: null } : {}),
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
 * Resolves the authoritative source bucket allocations (`allocations`) pulled by a Liquidation's
 * parent Activity Proposal / Event for Surplus Return Routing (1 bucket vs 2+ buckets).
 */
export async function resolveLiquidationSourceAllocations(
  data?: Partial<LiquidationDocument> | any
): Promise<ProposalBucketAllocation[]> {
  if (!data) return [];

  const fromDoc = Array.isArray(data.allocations) && data.allocations.length > 0
    ? (data.allocations as ProposalBucketAllocation[])
    : null;
  if (fromDoc) return fromDoc;

  let evData: any = null;
  let propData: any = null;
  const eventId = data.eventId;

  if (eventId) {
    try {
      const evtSnap = await getDoc(doc(db, EVENTS_COLLECTION, eventId));
      if (evtSnap.exists()) evData = evtSnap.data();
    } catch {}
    try {
      const propSnap = await getDoc(doc(db, 'activity_proposals', eventId));
      if (propSnap.exists()) propData = propSnap.data();
    } catch {}
  }

  const suppAllocs: ProposalBucketAllocation[] =
    (Array.isArray(evData?.supplementalAllocations) && evData.supplementalAllocations.length > 0 && evData.supplementalAllocations) ||
    (Array.isArray(propData?.supplementalAllocations) && propData.supplementalAllocations.length > 0 && propData.supplementalAllocations) ||
    [];

  const parentAllocs =
    (Array.isArray(evData?.allocations) && evData.allocations.length > 0 && evData.allocations) ||
    (Array.isArray(propData?.allocations) && propData.allocations.length > 0 && propData.allocations) ||
    null;
  if (parentAllocs) {
    return suppAllocs.length > 0
      ? mergeBaseAndSupplementalAllocations(parentAllocs as ProposalBucketAllocation[], suppAllocs)
      : (parentAllocs as ProposalBucketAllocation[]);
  }

  const baseBudget = Number(
    evData?.originalApprovedBudget ??
      evData?.totalApprovedBudget ??
      propData?.financialProjections?.totalExpenses ??
      data.allocatedBudget ??
      data.amountAdvanced ??
      0
  );
  const allocatedBudget =
    suppAllocs.length > 0
      ? baseBudget
      : Number(
          data.allocatedBudget ??
            data.amountAdvanced ??
            evData?.effectiveApprovedBudget ??
            evData?.totalApprovedBudget ??
            propData?.financialProjections?.totalExpenses ??
            0
        );
  const fundingSource = String(
    data.fundingSource || evData?.fundingSource || propData?.fundingSource || ''
  ).trim();
  const orgId = String(data.organizationId || evData?.hostingOrgId || evData?.organizationId || propData?.organizationId || '').trim();
  const orgName = String(data.organizationName || evData?.organizationName || propData?.organizationName || 'Student Organization');

  let baseResolved: ProposalBucketAllocation[] = [];

  // Legacy multi-bucket misc fee fallback
  const legacyMiscAllocs: any[] =
    (Array.isArray(evData?.miscFeeBucketAllocations) && evData.miscFeeBucketAllocations.length > 0 && evData.miscFeeBucketAllocations) ||
    (Array.isArray(propData?.miscFeeBucketAllocations) && propData.miscFeeBucketAllocations.length > 0 && propData.miscFeeBucketAllocations) ||
    [];
  if (legacyMiscAllocs.length > 0 && baseBudget > 0) {
    const totalAvail = legacyMiscAllocs.reduce((s, m) => s + (Number(m.availableAmount) || 0), 0);
    baseResolved = legacyMiscAllocs.map((m) => ({
      bucketId: String(m.bucketId),
      bucketName: String(m.bucketName || m.bucketId),
      fundType: 'misc_fee' as const,
      allocatedAmount:
        legacyMiscAllocs.length === 1
          ? allocatedBudget
          : totalAvail > 0
          ? Math.round((allocatedBudget * ((Number(m.availableAmount) || 0) / totalAvail)) * 100) / 100
          : Math.round((allocatedBudget / legacyMiscAllocs.length) * 100) / 100,
      availableAmount: Number(m.availableAmount) || 0,
      poolAmount: Number(m.poolAmount) || 0,
    }));
    return suppAllocs.length > 0
      ? mergeBaseAndSupplementalAllocations(baseResolved, suppAllocs)
      : baseResolved;
  }

  const singleBucketId = String(
    data.miscFeeBucketId || evData?.miscFeeBucketId || propData?.miscFeeBucketId || ''
  ).trim();
  const singleBucketName = String(
    data.miscFeeBucketName || evData?.miscFeeBucketName || propData?.miscFeeBucketName || ''
  ).trim();

  if (baseBudget > 0 && (fundingSource === 'school_budget' || (singleBucketId && fundingSource !== 'organization_funds' && fundingSource !== 'student_contributions'))) {
    if (singleBucketId || singleBucketName) {
      baseResolved = [
        {
          bucketId: singleBucketId || singleBucketName,
          bucketName: singleBucketName || singleBucketId,
          fundType: 'misc_fee',
          allocatedAmount: allocatedBudget,
        },
      ];
      return suppAllocs.length > 0
        ? mergeBaseAndSupplementalAllocations(baseResolved, suppAllocs)
        : baseResolved;
    }
  }

  if (baseBudget > 0 && (fundingSource === 'student_contributions' || fundingSource === 'retained_sao_fund')) {
    const isSasSentinel = !orgId || ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgId.toLowerCase());
    baseResolved = [
      {
        bucketId: isSasSentinel ? 'SAO_CAMPUS' : `ORG_${orgId}`,
        bucketName: isSasSentinel
          ? 'Campus Student Contribution Retained Bucket'
          : `${orgName} Treasury`,
        fundType: 'student_contribution_retained',
        allocatedAmount: allocatedBudget,
      },
    ];
    return suppAllocs.length > 0
      ? mergeBaseAndSupplementalAllocations(baseResolved, suppAllocs)
      : baseResolved;
  }

  if (baseBudget > 0 && (fundingSource === 'organization_funds' || (orgId && orgId !== 'sas' && orgId !== 'sas_admin'))) {
    baseResolved = [
      {
        bucketId: orgId ? `ORG_${orgId}` : 'ORG_TREASURY',
        bucketName: `${orgName} Treasury`,
        fundType: 'org_treasury',
        allocatedAmount: allocatedBudget,
      },
    ];
    return suppAllocs.length > 0
      ? mergeBaseAndSupplementalAllocations(baseResolved, suppAllocs)
      : baseResolved;
  }

  // Zero-budget parent upgraded solely by approved supplemental budget(s)
  if (suppAllocs.length > 0) {
    return mergeBaseAndSupplementalAllocations([], suppAllocs);
  }

  return [];
}

/**
 * Approves a liquidation report.
 * Enforces Case A (1 bucket auto-return) vs Case B (2+ buckets SAS/Admin surplus split) & Cashier receipt rules,
 * then updates status to 'approved' and credits each bucket cleanly.
 */
export const approveLiquidationReport = async (
  id: string,
  adminUserId: string,
  remarks?: string,
  liquidationData?: Partial<LiquidationDocument>,
  options?: {
    surplusReturnAllocations?: SurplusReturnAllocation[];
    deficitDeductionAllocations?: DeficitDeductionAllocation[];
    cashierSettlementProofs?: ReceiptAttachment[];
    cashierReferenceNo?: string;
    reviewerName?: string;
  }
): Promise<void> => {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, id);
  const snap = await getDoc(docRef);
  const docData = snap.exists()
    ? ({ id: snap.id, ...(snap.data() as any) } as LiquidationDocument)
    : (liquidationData as LiquidationDocument);

  const orgLower = String(docData?.organizationId || '').trim().toLowerCase();
  const isSasLiquidation =
    docData?.createdByRole === 'admin' ||
    docData?.createdByRole === 'sas_admin' ||
    !orgLower ||
    ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgLower);
  const isClubDirectLedgerSettlement =
    !isSasLiquidation &&
    ((docData as any)?.fundingSource === 'organization_funds' ||
      (docData as any)?.fundingSource === 'student_contributions');
  const isOrgFunds =
    isClubDirectLedgerSettlement ||
    ((docData?.approvalChain || []).length === 1 && (docData?.approvalChain || [])[0].role === 'sas_head');

  // If School Budget with Signatory Pipeline awaiting SAS clearance, release to Stage 1 Signatories!
  if (!isOrgFunds && (docData as any)?.isPendingSasVetting === true && (docData?.approvalChain || []).length > 0) {
    const chain = (docData?.approvalChain || []).map((step) => ({
      ...step,
      status: (step.stageIndex ?? 1) === 1 ? ('current' as const) : ('waiting' as const),
    }));

    const releaseRemark: LiquidationRemark = {
      id: `rem-${Date.now()}`,
      authorName: options?.reviewerName || 'SAO Adviser',
      authorRole: 'admin',
      action: 'endorsed',
      comment: remarks || 'Cleared by SAS and released to Institutional Signatory Pipeline.',
      timestamp: new Date().toISOString(),
    };

    await updateDoc(docRef, sanitizeFirestorePayload({
      status: 'under_review',
      approvalChain: chain,
      currentStageIndex: 1,
      isPendingSasVetting: false,
      sasVettedAt: new Date().toISOString(),
      sasVettedBy: adminUserId,
      updatedAt: serverTimestamp(),
      remarksHistory: arrayUnion(sanitizeFirestorePayload(releaseRemark)),
    }));
    return;
  }

  const rawVariance = Number(
    docData?.surplusOrDeficit ??
      ((docData?.allocatedBudget ?? 0) - (docData?.totalActualSpending ?? 0))
  ) || 0;
  const sourceAllocations = await resolveLiquidationSourceAllocations(docData);

  const approvalRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: options?.reviewerName || 'SAO Adviser',
    authorRole: 'admin',
    action: 'approved',
    comment:
      remarks ||
      (Math.abs(rawVariance) < 0.01
        ? 'Liquidation report approved. Financial ledger settled.'
        : 'Liquidation report approved. Pending post-approval bucket settlement.'),
    timestamp: new Date().toISOString(),
  };

  const mergedForSettlement = {
    ...docData,
    allocations: sourceAllocations.length > 0 ? sourceAllocations : docData?.allocations,
    cashierSettlementProofs: Array.isArray(docData?.cashierSettlementProofs)
      ? docData.cashierSettlementProofs
      : [],
  };
  const isClubStudentContribOverspent =
    isClubDirectLedgerSettlement &&
    String((docData as any)?.fundingSource || '').trim().toLowerCase() === 'student_contributions' &&
    rawVariance < -0.009;

  const settlementFields = resolvePostApprovalSettlement(mergedForSettlement);
  if (isClubDirectLedgerSettlement && !isClubStudentContribOverspent) {
    settlementFields.cashierSettlementStatus = 'verified';
  }

  await updateDoc(docRef, sanitizeFirestorePayload({
    status: 'approved',
    isPendingSasVetting: false,
    approvedBy: adminUserId,
    approvedAt: serverTimestamp(),
    returnRemarks: remarks || null,
    allocations: sourceAllocations.length > 0 ? sourceAllocations : undefined,
    ...settlementFields,
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(sanitizeFirestorePayload(approvalRemark)),
  }));

  const mergedApprovedData: Partial<LiquidationDocument> = {
    ...docData,
    allocations: sourceAllocations,
  };

  // Sync event document
  const targetEventId = docData?.eventId;
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
  }

  // Post to ledger immediately for Club internal ledger liquidations (except overspent Student Collections) or exact match (variance === 0)
  if ((isClubDirectLedgerSettlement && !isClubStudentContribOverspent) || Math.abs(rawVariance) < 0.01) {
    try {
      await postLiquidationToLedger(id, mergedApprovedData, adminUserId);
      await settlePreLiquidationExcessCollectionsIfAny(id, mergedApprovedData, adminUserId);
    } catch (err) {
      console.warn('[approveLiquidationReport] Ledger write note:', err);
    }
  }

  // Store approved liquidation in Reports & Analytics
  try {
    await autoArchiveApprovedLiquidation(id, mergedApprovedData, adminUserId);
  } catch (archErr) {
    console.warn('[approveLiquidationReport] Approved report storage notice:', archErr);
  }

  // Notify maker clearly if there is a Returnable Surplus, Reimbursement Deficit, or Exact Match
  try {
    const notif = buildLiquidationApprovalNotificationPayload(id, { ...mergedApprovedData, ...settlementFields });
    await createNotification({
      recipientRole: notif.recipientRole,
      targetOrgId: notif.targetOrgId,
      targetOrgName: notif.targetOrgName,
      type: 'document_approved',
      category: 'financial_liquidation',
      title: notif.title,
      message: notif.message,
      resourceId: id,
      resourceType: 'liquidation',
      actionRoute: notif.actionRoute,
      senderName: options?.reviewerName || 'SAS Adviser',
    });
  } catch (notifErr) {
    console.warn('[approveLiquidationReport] Approval notification warning:', notifErr);
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
    canApproveLiquidation?: boolean;
    approvalDecision?: 'approve' | 'forward';
  },
  remarks = '',
  approvalDecision?: 'approve' | 'forward'
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
  const wasAlreadyApproved = data.status === 'approved';

  const matchesSignatory = (s: any) => {
    if (signerUid && s.signatoryUid === signerUid) return true;
    if (signerEmail && s.signatoryEmail?.toLowerCase() === signerEmail) return true;
    if (signatory.role && s.role === signatory.role) return true;
    return false;
  };

  // Locate the target step in current stage
  let targetStepIdx = chain.findIndex((s) => {
    const stageMatches = s.stageIndex ? s.stageIndex === currentStage : true;
    const isPending = s.status === 'current' || s.status === 'waiting';
    return stageMatches && isPending && matchesSignatory(s);
  });

  if (targetStepIdx === -1 && wasAlreadyApproved) {
    targetStepIdx = chain.findIndex(
      (s) => (s.status === 'current' || s.status === 'waiting') && matchesSignatory(s)
    );
  }

  if (targetStepIdx === -1) {
    targetStepIdx = data.currentStepIndex ?? 0;
  }

  if (targetStepIdx < 0 || targetStepIdx >= chain.length) {
    throw new Error('No pending approval step found for your account on this liquidation report');
  }

  const targetStep = chain[targetStepIdx];
  const stepAction = String(targetStep.actionType || '').toLowerCase().trim();
  const isStepEndorseOrCheck =
    stepAction === 'endorse' || stepAction === 'check' || stepAction === 'note';
  const isSchoolAdmin = targetStep.role === 'school_administrator' || signatory.role === 'school_administrator';
  const isPresident = targetStep.role === 'school_president' || signatory.role === 'school_president';
  const canApprove =
    !isStepEndorseOrCheck && canSignatoryApproveDocument(signatory as any, 'liquidation', targetStep);
  const decision = approvalDecision || signatory.approvalDecision;

  const isExecutiveApprover =
    !isStepEndorseOrCheck &&
    (isPresident ||
      isSchoolAdmin ||
      canApprove ||
      targetStep.actionType === 'approve' ||
      signatory.actionType === 'approve');

  let newStatus: 'endorsed' | 'approved' = 'endorsed';
  if (isStepEndorseOrCheck) {
    newStatus = 'endorsed';
  } else if (decision === 'approve') {
    newStatus = 'approved';
  } else if (decision === 'forward') {
    newStatus = 'endorsed';
  } else if (canApprove) {
    if (signatory.actionType === 'approve' || targetStep.actionType === 'approve') {
      newStatus = 'approved';
    } else {
      newStatus = 'endorsed';
    }
  } else {
    newStatus = 'endorsed';
  }

  const effectiveSigUrl = signatory.signatureUrl || targetStep.signatureUrl || '';
  const effectiveRemarks = remarks || targetStep.remarks || '';
  const signedAt = new Date().toISOString();

  const updatedStep: Record<string, any> = {
    ...targetStep,
    status: newStatus,
    signatoryUid: signerUid || targetStep.signatoryUid || '',
    signedByUid: signerUid || targetStep.signatoryUid || '',
    signatoryName: signatory.name || targetStep.signatoryName || '',
    signedByName: signatory.name || targetStep.signatoryName || '',
    signatoryEmail: signatory.email || targetStep.signatoryEmail || '',
    signedByEmail: signerEmail || targetStep.signatoryEmail || '',
    signedAt,
  };

  if (effectiveSigUrl) updatedStep.signatureUrl = effectiveSigUrl;
  else delete updatedStep.signatureUrl;

  if (effectiveRemarks) updatedStep.remarks = effectiveRemarks;
  else delete updatedStep.remarks;

  chain[targetStepIdx] = updatedStep as any;

  // Executive / Final Approval Resolution without waiving co-signatories:
  // Remaining unsigned signatories stay active ('current') so they can still affix their signature.
  if (newStatus === 'approved') {
    chain.forEach((s, idx) => {
      if (idx !== targetStepIdx && s.status === 'waiting') {
        chain[idx] = {
          ...s,
          status: 'current',
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
  let isFullyApproved = wasAlreadyApproved || newStatus === 'approved';
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
    isFullyApproved = isFullyApproved || nextIdx >= sanitizedChain.length;
    if (nextIdx < sanitizedChain.length && sanitizedChain[nextIdx]?.status === 'waiting') {
      sanitizedChain[nextIdx] = { ...sanitizedChain[nextIdx], status: 'current' };
    }
  }

  const endorsementRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: signatory.name || 'Signatory',
    authorRole: 'signatory',
    action: newStatus === 'approved' ? 'approved' : 'endorsed',
    comment: remarks || (isFullyApproved && !wasAlreadyApproved ? 'Financial liquidation approved by executive.' : `Endorsed stage ${currentStage} with digital signature.`),
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

  if (isFullyApproved && !wasAlreadyApproved) {
    const resolvedAllocs = await resolveLiquidationSourceAllocations(data);
    if (resolvedAllocs.length > 0 && !(data.allocations && data.allocations.length > 0)) {
      rawUpdates.allocations = resolvedAllocs;
    }
    rawUpdates.approvedAt = serverTimestamp();
    rawUpdates.approvedBy = signerUid || signatory.email;
    Object.assign(
      rawUpdates,
      resolvePostApprovalSettlement({ ...data, allocations: resolvedAllocs })
    );
    const dOrgLower = String(data.organizationId || '').trim().toLowerCase();
    const isSasLiqDoc =
      data.createdByRole === 'admin' ||
      data.createdByRole === 'sas_admin' ||
      !dOrgLower ||
      ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(dOrgLower);
    const endorseVariance =
      Number(
        data.surplusOrDeficit ??
          ((data.allocatedBudget ?? 0) - (data.totalActualSpending ?? 0))
      ) || 0;
    const endorseFundingSrc = String((data as any).fundingSource || '').trim().toLowerCase();
    const isClubStudentContribOverspent =
      !isSasLiqDoc && endorseFundingSrc === 'student_contributions' && endorseVariance < -0.009;
    if (
      !isSasLiqDoc &&
      (endorseFundingSrc === 'organization_funds' ||
        endorseFundingSrc === 'student_contributions') &&
      !isClubStudentContribOverspent
    ) {
      rawUpdates.cashierSettlementStatus = 'verified';
    }
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

  // If newly approved, post immediately for Club internal ledger liquidations (except overspent Student Collections) or exact match (variance === 0)
  if (isFullyApproved && !wasAlreadyApproved) {
    const variance =
      Number(
        data.surplusOrDeficit ??
          ((data.allocatedBudget ?? 0) - (data.totalActualSpending ?? 0))
      ) || 0;
    const dOrgLower = String(data.organizationId || '').trim().toLowerCase();
    const isSasLiqDoc =
      data.createdByRole === 'admin' ||
      data.createdByRole === 'sas_admin' ||
      !dOrgLower ||
      ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(dOrgLower);
    const endorseSrcLower = String((data as any).fundingSource || '').trim().toLowerCase();
    const isClubDirect =
      !isSasLiqDoc &&
      (endorseSrcLower === 'organization_funds' ||
        endorseSrcLower === 'student_contributions');
    const isClubStudentContribOverspent =
      isClubDirect && endorseSrcLower === 'student_contributions' && variance < -0.009;

    if ((isClubDirect && !isClubStudentContribOverspent) || Math.abs(variance) < 0.01) {
      try {
        await postLiquidationToLedger(liquidationId, { ...data, ...rawUpdates }, signerUid);
        await settlePreLiquidationExcessCollectionsIfAny(liquidationId, { ...data, ...rawUpdates }, signerUid);
      } catch (ledgerErr) {
        console.warn('[endorseLiquidationStep] Ledger write note:', ledgerErr);
      }
    }

    try {
      await autoArchiveApprovedLiquidation(liquidationId, { ...data, ...rawUpdates }, signerUid || signatory.email);
    } catch (archErr) {
      console.warn('[endorseLiquidationStep] Approved report storage notice:', archErr);
    }

    try {
      const notif = buildLiquidationApprovalNotificationPayload(liquidationId, { ...data, ...rawUpdates });
      await createNotification({
        recipientRole: notif.recipientRole,
        targetOrgId: notif.targetOrgId,
        targetOrgName: notif.targetOrgName,
        type: 'document_approved',
        category: 'financial_liquidation',
        title: notif.title,
        message: notif.message,
        resourceId: liquidationId,
        resourceType: 'liquidation',
        actionRoute: notif.actionRoute,
        senderName: signatory.name || 'Institutional Signatory',
      });
    } catch (notifErr) {
      console.warn('[endorseLiquidationStep] Approval notification warning:', notifErr);
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

async function resolveLiquidationFundingMeta(data?: Partial<LiquidationDocument> | any): Promise<{
  effectiveFundingSource: string;
  bucketId: string;
  bucketIds: string[];
  bucketName: string;
  schoolYear?: string;
  semester?: string;
  organizationId: string;
  organizationName: string;
}> {
  let effectiveFundingSource = String(data?.fundingSource || '').trim();
  let bucketId = String(data?.miscFeeBucketId || '');
  let bucketIds: string[] = Array.isArray(data?.miscFeeBucketIds) ? data.miscFeeBucketIds : [];
  let bucketName = String(data?.miscFeeBucketName || '');
  let schoolYear = data?.schoolYear;
  let semester = data?.semester;
  let organizationId = String(data?.organizationId || '');
  let organizationName = String(data?.organizationName || '');

  const eventId = data?.eventId;
  if (eventId && (!effectiveFundingSource || (!bucketId && bucketIds.length === 0))) {
    try {
      const evtSnap = await getDoc(doc(db, EVENTS_COLLECTION, eventId));
      if (evtSnap.exists()) {
        const ev = evtSnap.data() as any;
        effectiveFundingSource = effectiveFundingSource || String(ev?.fundingSource || '');
        bucketId = bucketId || String(ev?.miscFeeBucketId || '');
        if (bucketIds.length === 0 && Array.isArray(ev?.miscFeeBucketIds)) {
          bucketIds = ev.miscFeeBucketIds;
        }
        bucketName = bucketName || String(ev?.miscFeeBucketName || '');
        schoolYear = schoolYear || ev?.schoolYear;
        semester = semester || ev?.semester;
        organizationId = organizationId || String(ev?.hostingOrgId || ev?.organizationId || '');
        organizationName = organizationName || String(ev?.organizationName || '');
      }
    } catch {}
  }

  if (eventId && (!effectiveFundingSource || (!bucketId && bucketIds.length === 0))) {
    try {
      const propSnap = await getDoc(doc(db, 'activity_proposals', eventId));
      if (propSnap.exists()) {
        const pr = propSnap.data() as any;
        effectiveFundingSource = effectiveFundingSource || String(pr?.fundingSource || '');
        bucketId = bucketId || String(pr?.miscFeeBucketId || '');
        if (bucketIds.length === 0 && Array.isArray(pr?.miscFeeBucketIds)) {
          bucketIds = pr.miscFeeBucketIds;
        }
        bucketName = bucketName || String(pr?.miscFeeBucketName || '');
        organizationId = organizationId || String(pr?.organizationId || '');
        organizationName = organizationName || String(pr?.organizationName || '');
      }
    } catch {}
  }

  return {
    effectiveFundingSource,
    bucketId: bucketId || bucketIds[0] || '',
    bucketIds,
    bucketName,
    schoolYear,
    semester,
    organizationId,
    organizationName,
  };
}

/**
 * Helper to post liquidation financial entry (surplus refund or deficit expense) to the correct ledger:
 * - Admin/Institutional Liquidation -> /sao_ledger (plus Misc Fee bucket OR SAO Retained Fund depending on fundingSource)
 * - Officer/Organization Liquidation -> /organization_ledger (plus Org Retained Fund)
 */
async function postLiquidationToLedger(
  liquidationId: string, 
  data?: Partial<LiquidationDocument>, 
  adminUserId?: string
) {
  const netAmount = data?.surplusOrDeficit ?? ((data?.allocatedBudget ?? 0) - (data?.totalActualSpending ?? 0));
  const eventTitle = data?.eventTitle || 'Event Liquidation';
  const semesterId = data?.semesterId || null;
  const eventId = data?.eventId || null;

  const meta = await resolveLiquidationFundingMeta(data);
  const orgIdLower = meta.organizationId.toLowerCase();
  const isSasSentinel =
    !meta.organizationId ||
    ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgIdLower);

  const isClubLiquidation =
    meta.effectiveFundingSource === 'organization_funds' ||
    (!isSasSentinel &&
      meta.effectiveFundingSource !== 'school_budget' &&
      meta.effectiveFundingSource !== 'retained_sao_fund' &&
      data?.createdByRole !== 'admin');

  // For Organization Student Contribution activities:
  // Student payments are credited as +Income into organization_ledger as they pay, and no upfront event_budget was deducted on AP approval.
  // So upon FL approval, record the actual liquidated event expense (-Expense) in organization_ledger so the net surplus stays accurately in the club's ledger.
  if (isClubLiquidation && !isSasSentinel && meta.effectiveFundingSource === 'student_contributions') {
    const actualSpent = Math.max(0, Math.round((Number(data?.totalActualSpending) || 0) * 100) / 100);
    if (actualSpent > 0.009) {
      const orgLedgerRef = collection(db, 'organization_ledger');
      const expCollId = `${liquidationId}_org_contrib_expense`;
      const qDupExp = query(orgLedgerRef, where('collectionId', '==', expCollId));
      if ((await getDocs(qDupExp)).empty) {
        if (netAmount < -0.009) {
          const orgLedgerSnap = await getDocs(
            query(orgLedgerRef, where('organizationId', '==', meta.organizationId))
          );
          const orgDocs = orgLedgerSnap.docs.map((d) => d.data() as any);
          const netOrgBalance = computeLiveStudentCollectionReimbursementCapacity({
            isSasOwned: false,
            eventId,
            liquidationId,
            allocatedBudget: 0,
            orgLedgerEntries: orgDocs,
          });
          if (netOrgBalance + 0.009 < actualSpent) {
            const shortfall = Math.max(0, Math.round((actualSpent - netOrgBalance) * 100) / 100);
            throw new Error(
              `Insufficient Student Collections funds to reimburse ₱${Math.abs(netAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} overspend (Shortfall: ₱${shortfall.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Collect remaining student contributions first before proceeding with reimbursement.`
            );
          }
        }
        await addDoc(orgLedgerRef, {
          organizationId: meta.organizationId,
          semesterId,
          date: Timestamp.now(),
          description: `Liquidated Activity Expenses (Student Contribution) – ${eventTitle}`,
          eventId,
          type: 'expense' as const,
          source: 'event_budget' as const,
          fundCategory: 'retained_student_activity_fund',
          amount: actualSpent,
          addedBy: adminUserId || 'SAS Admin',
          collectionId: expCollId,
          createdAt: serverTimestamp(),
        });
      }
    }
    return;
  }

  if (netAmount === 0) return;

  const isSurplus = netAmount > 0;
  const absAmount = Math.abs(netAmount);

  const isRetainedOrStudentContribution =
    meta.effectiveFundingSource === 'student_contributions' ||
    meta.effectiveFundingSource === 'retained_sao_fund' ||
    meta.effectiveFundingSource === 'organization_funds' ||
    isClubLiquidation;

  const description = isSurplus
    ? meta.effectiveFundingSource === 'student_contributions'
      ? `Retained Student Contribution Surplus – ${eventTitle}`
      : `Liquidation Surplus Returned – ${eventTitle}`
    : `Liquidation Deficit / Overspend – ${eventTitle}`;

  const returnRows: SurplusReturnAllocation[] = Array.isArray((data as any)?.surplusReturnAllocations)
    ? (data as any).surplusReturnAllocations
    : [];
  const deficitRows: DeficitDeductionAllocation[] = Array.isArray((data as any)?.deficitDeductionAllocations)
    ? (data as any).deficitDeductionAllocations
    : [];

  if (!isSurplus && deficitRows.length > 0) {
    const activeDeficits = deficitRows.filter((r) => Number(r.deductAmount) > 0.009);
    const miscDeficits = activeDeficits.filter((r) => r.fundType === 'misc_fee');
    const nonMiscDeficits = activeDeficits.filter((r) => r.fundType !== 'misc_fee');
    const proofRefLabel = (data as any)?.cashierReferenceNo
      ? ` [Ref: ${(data as any).cashierReferenceNo}]`
      : '';

    if (miscDeficits.length > 0) {
      const { debitMiscFeeBucketOnLiquidationDeficit } = await import('./misc-fee.service');
      await debitMiscFeeBucketOnLiquidationDeficit({
        liquidationId,
        eventId: eventId || '',
        eventTitle,
        explicitDeficitAllocations: miscDeficits.map((r) => ({
          bucketId: r.bucketId,
          bucketName: r.bucketName,
          deductAmount: Number(r.deductAmount) || 0,
          availableBalance: Number(r.availableBalance) || 0,
          isSupplementalSource: r.isSupplementalSource,
        })),
        schoolYear: meta.schoolYear,
        semester: meta.semester,
        chequeNumber: (data as any)?.cashierReferenceNo || (data as any)?.chequeNumber || '',
        performedBy: adminUserId || 'SAS Admin',
      });

      const saoLedgerRef = collection(db, 'sao_ledger');
      for (const rDef of miscDeficits) {
        const deductAmt = Math.round((Number(rDef.deductAmount) || 0) * 100) / 100;
        const collId = `${liquidationId}_deficit_${rDef.bucketId}`;
        const qDupSaoDef = query(saoLedgerRef, where('collectionId', '==', collId));
        if ((await getDocs(qDupSaoDef)).empty) {
          await addDoc(saoLedgerRef, {
            semesterId,
            date: Timestamp.now(),
            description: `Liquidation Overspend Coverage (${rDef.bucketName}${rDef.isSupplementalSource ? ' • Supplemental' : ''}) – ${eventTitle}${proofRefLabel}`,
            eventId,
            type: 'expense' as const,
            source: 'liquidation_deficit' as const,
            fundCategory: 'misc_fee_pool',
            amount: deductAmt,
            addedBy: adminUserId || 'SAS Admin',
            collectionId: collId,
            createdAt: serverTimestamp(),
          });
        }
      }
    }

    for (const rDef of nonMiscDeficits) {
      const deductAmt = Math.round((Number(rDef.deductAmount) || 0) * 100) / 100;
      const collId = `${liquidationId}_deficit_${rDef.bucketId}`;
      const targetOrgId = rDef.bucketId.startsWith('ORG_')
        ? rDef.bucketId.replace(/^ORG_/, '')
        : rDef.bucketId === 'SAO_CAMPUS'
          ? 'sas'
          : !isSasSentinel
            ? meta.organizationId
            : 'sas';

      const { creditRetainedFundSurplusOnLiquidation } = await import('./retained-fund.service');
      await creditRetainedFundSurplusOnLiquidation({
        liquidationId: collId,
        eventId: eventId || undefined,
        eventTitle,
        surplusOrDeficit: -deductAmt,
        organizationId: targetOrgId || 'sas',
        organizationName: rDef.bucketName,
        createdByRole: targetOrgId && targetOrgId !== 'sas' ? 'officer' : 'admin',
        schoolYear: meta.schoolYear,
        semester: meta.semester,
        performedBy: adminUserId || 'SAS Admin',
        requireSufficientBalance: true,
      });

      if (targetOrgId && targetOrgId !== 'sas') {
        const orgLedgerRef = collection(db, 'organization_ledger');
        const qDupOrg = query(orgLedgerRef, where('collectionId', '==', collId));
        if ((await getDocs(qDupOrg)).empty) {
          await addDoc(orgLedgerRef, {
            organizationId: targetOrgId,
            semesterId,
            date: Timestamp.now(),
            description: `Liquidation Overspend Coverage (${rDef.bucketName}${rDef.isSupplementalSource ? ' • Supplemental' : ''}) – ${eventTitle}${proofRefLabel}`,
            eventId,
            type: 'expense' as const,
            source: 'liquidation_deficit' as const,
            fundCategory: 'retained_student_activity_fund',
            amount: deductAmt,
            addedBy: adminUserId || 'SAS Admin',
            collectionId: collId,
            createdAt: serverTimestamp(),
          });
        }
      } else {
        const saoLedgerRef = collection(db, 'sao_ledger');
        const qDupSaoDef = query(saoLedgerRef, where('collectionId', '==', collId));
        if ((await getDocs(qDupSaoDef)).empty) {
          await addDoc(saoLedgerRef, {
            semesterId,
            date: Timestamp.now(),
            description: `Retained Fund Overspend Coverage (${rDef.bucketName}${rDef.isSupplementalSource ? ' • Supplemental' : ''}) – ${eventTitle}${proofRefLabel}`,
            eventId,
            type: 'expense' as const,
            source: 'liquidation_deficit' as const,
            fundCategory: 'retained_student_activity_fund',
            amount: deductAmt,
            addedBy: adminUserId || 'SAS Admin',
            collectionId: collId,
            createdAt: serverTimestamp(),
          });
        }
      }
    }

    return;
  }

  if (isSurplus && returnRows.length > 0) {
    const miscReturns = returnRows.filter(
      (r) => r.fundType === 'misc_fee' && Number(r.returnAmount) > 0
    );
    const miscTotal = miscReturns.reduce((s, r) => s + (Number(r.returnAmount) || 0), 0);

    if (miscReturns.length > 0 && eventId) {
      const saoLedgerRef = collection(db, 'sao_ledger');
      const qDupSao = query(saoLedgerRef, where('collectionId', '==', `${liquidationId}_misc`));
      if ((await getDocs(qDupSao)).empty) {
        await addDoc(saoLedgerRef, {
          semesterId,
          date: Timestamp.now(),
          description: `Liquidation Surplus Returned (${miscReturns.map((r) => r.bucketName).join(', ')}) – ${eventTitle}`,
          eventId,
          type: 'income' as const,
          source: 'liquidation_surplus' as const,
          fundCategory: 'misc_fee_pool',
          amount: Math.round(miscTotal * 100) / 100,
          addedBy: adminUserId || 'SAO Admin',
          collectionId: `${liquidationId}_misc`,
          createdAt: serverTimestamp(),
        });
      }

      try {
        const { creditMiscFeeBucketOnLiquidationSurplus } = await import('./misc-fee.service');
        await creditMiscFeeBucketOnLiquidationSurplus({
          liquidationId,
          eventId,
          eventTitle,
          bucketId: miscReturns[0].bucketId,
          bucketIds: miscReturns.map((r) => r.bucketId),
          bucketName: miscReturns.map((r) => r.bucketName).join(' + '),
          surplusAmount: miscTotal,
          explicitReturnAllocations: miscReturns.map((r) => ({
            bucketId: r.bucketId,
            bucketName: r.bucketName,
            returnAmount: Number(r.returnAmount) || 0,
          })),
          schoolYear: meta.schoolYear,
          semester: meta.semester,
          performedBy: adminUserId || 'SAO Admin',
        });
      } catch (miscSurplusErr) {
        console.warn('[postLiquidationToLedger] Explicit misc surplus return notice:', miscSurplusErr);
      }
    }

    const nonMiscReturns = returnRows.filter(
      (r) => r.fundType !== 'misc_fee' && Number(r.returnAmount) > 0
    );
    for (const rRet of nonMiscReturns) {
      const retAmt = Math.round((Number(rRet.returnAmount) || 0) * 100) / 100;
      const targetOrgId = rRet.bucketId.startsWith('ORG_')
        ? rRet.bucketId.replace(/^ORG_/, '')
        : !isSasSentinel
          ? meta.organizationId
          : 'sas';

      if (targetOrgId && targetOrgId !== 'sas') {
        const orgLedgerRef = collection(db, 'organization_ledger');
        const qDupOrg = query(orgLedgerRef, where('collectionId', '==', `${liquidationId}_${rRet.bucketId}`));
        if ((await getDocs(qDupOrg)).empty) {
          await addDoc(orgLedgerRef, {
            organizationId: targetOrgId,
            semesterId,
            date: Timestamp.now(),
            description: `Retained Liquidation Surplus (${rRet.bucketName}) – ${eventTitle}`,
            eventId,
            type: 'income' as const,
            source: 'liquidation_surplus' as const,
            fundCategory: 'retained_student_activity_fund',
            amount: retAmt,
            addedBy: adminUserId || 'SAO Admin',
            collectionId: `${liquidationId}_${rRet.bucketId}`,
            createdAt: serverTimestamp(),
          });
        }
      } else {
        const saoLedgerRef = collection(db, 'sao_ledger');
        const qDupSaoRet = query(saoLedgerRef, where('collectionId', '==', `${liquidationId}_${rRet.bucketId}`));
        if ((await getDocs(qDupSaoRet)).empty) {
          await addDoc(saoLedgerRef, {
            semesterId,
            date: Timestamp.now(),
            description: `Retained Student Contribution Surplus – ${eventTitle}`,
            eventId,
            type: 'income' as const,
            source: 'liquidation_surplus' as const,
            fundCategory: 'retained_student_activity_fund',
            amount: retAmt,
            addedBy: adminUserId || 'SAO Admin',
            collectionId: `${liquidationId}_${rRet.bucketId}`,
            createdAt: serverTimestamp(),
          });
        }
      }

      if (!targetOrgId || targetOrgId === 'sas') {
        try {
          const { creditRetainedFundSurplusOnLiquidation } = await import('./retained-fund.service');
          await creditRetainedFundSurplusOnLiquidation({
            liquidationId: `${liquidationId}_${rRet.bucketId}`,
            eventId: eventId || undefined,
            eventTitle,
            surplusOrDeficit: retAmt,
            organizationId: 'sas',
            organizationName: rRet.bucketName,
            createdByRole: data?.createdByRole,
            schoolYear: meta.schoolYear,
            semester: meta.semester,
            performedBy: adminUserId || 'SAO Admin',
          });
        } catch (retErr) {
          console.warn('[postLiquidationToLedger] Explicit retained return notice:', retErr);
        }
      }
    }
    return;
  }

  if (isClubLiquidation && !isSasSentinel) {
    const orgLedgerRef = collection(db, 'organization_ledger');
    const qDup = query(orgLedgerRef, where('collectionId', '==', liquidationId));
    const existingSnap = await getDocs(qDup);
    if (existingSnap.empty) {
      await addDoc(orgLedgerRef, {
        organizationId: meta.organizationId,
        semesterId,
        date: Timestamp.now(),
        description,
        eventId,
        type: isSurplus ? 'income' : 'expense',
        source: isSurplus ? 'liquidation_surplus' : 'liquidation_deficit',
        fundCategory: isRetainedOrStudentContribution ? 'retained_student_activity_fund' : undefined,
        amount: absAmount,
        addedBy: adminUserId || 'SAO Adviser',
        collectionId: liquidationId,
        createdAt: serverTimestamp(),
      });
    }
    return;
  }

  // SAO / Admin Institutional Event path
  const saoLedgerRef = collection(db, 'sao_ledger');
  const qDup = query(saoLedgerRef, where('collectionId', '==', liquidationId));
  const existingSnap = await getDocs(qDup);
  if (existingSnap.empty) {
    await addDoc(saoLedgerRef, {
      semesterId,
      date: Timestamp.now(),
      description,
      eventId,
      type: isSurplus ? 'income' : 'expense',
      source: isSurplus ? 'liquidation_surplus' : 'liquidation_deficit',
      fundCategory: isRetainedOrStudentContribution ? 'retained_student_activity_fund' : 'misc_fee_pool',
      amount: absAmount,
      addedBy: adminUserId || 'SAO Adviser',
      collectionId: liquidationId,
      createdAt: serverTimestamp(),
    });
  }

  // Strictly isolate Student Contribution / Retained SAO Fund from Miscellaneous Fee Buckets
  if (isRetainedOrStudentContribution) {
    try {
      const { creditRetainedFundSurplusOnLiquidation } = await import('./retained-fund.service');
      await creditRetainedFundSurplusOnLiquidation({
        liquidationId,
        eventId: eventId || undefined,
        eventTitle,
        surplusOrDeficit: netAmount,
        organizationId: 'sas',
        organizationName: 'SAO / Campus Student Activity Fund',
        createdByRole: 'admin',
        schoolYear: meta.schoolYear,
        semester: meta.semester,
        performedBy: adminUserId || 'SAO Admin',
      });
    } catch (retErr) {
      console.warn('[postLiquidationToLedger] SAO retained fund notice:', retErr);
    }
    return;
  }

  // Miscellaneous Fee funded surplus returns strictly to its specific Misc Fee bucket(s)
  if (isSurplus && eventId && (meta.bucketId || meta.bucketIds.length > 0 || meta.bucketName)) {
    try {
      const { creditMiscFeeBucketOnLiquidationSurplus } = await import('./misc-fee.service');
      await creditMiscFeeBucketOnLiquidationSurplus({
        liquidationId,
        eventId,
        eventTitle,
        bucketId: meta.bucketId || meta.bucketName,
        bucketIds: meta.bucketIds,
        bucketName: meta.bucketName || meta.bucketId,
        surplusAmount: absAmount,
        schoolYear: meta.schoolYear,
        semester: meta.semester,
        performedBy: adminUserId || 'SAO Admin',
      });
    } catch (miscSurplusErr) {
      console.warn('[postLiquidationToLedger] Misc fee surplus return notice:', miscSurplusErr);
    }
  }
}

/**
 * Computes post-approval Cashier Settlement status and type when a liquidation is approved.
 */
function resolvePostApprovalSettlement(data: Partial<LiquidationDocument> | any): Record<string, any> {
  const surplusOrDeficit = Number(data?.surplusOrDeficit ?? 0);
  const existingProofs = Array.isArray(data?.cashierSettlementProofs) ? data.cashierSettlementProofs : [];

  const needsCashierSettlement = surplusOrDeficit !== 0;

  let cashierSettlementType: 'surplus_return' | 'deficit_reimbursement' | undefined;
  if (surplusOrDeficit > 0) {
    cashierSettlementType = 'surplus_return';
  } else if (surplusOrDeficit < 0) {
    cashierSettlementType = 'deficit_reimbursement';
  }

  let cashierSettlementStatus: 'not_required' | 'pending_proof' | 'proof_uploaded' | 'verified' = 'not_required';
  if (needsCashierSettlement) {
    cashierSettlementStatus = existingProofs.length > 0 ? 'proof_uploaded' : 'pending_proof';
  }

  return sanitizeFirestorePayload({
    cashierSettlementType,
    cashierSettlementStatus,
  });
}

/**
 * Validates that overspent Student Collections liquidations never tap Miscellaneous Fee buckets
 * and never proceed with reimbursement when live collected funds cannot absorb the overspend.
 */
async function assertStudentCollectionReimbursementSufficient(
  liquidationId: string,
  data: Partial<LiquidationDocument> | any,
  deficitAmount: number,
  candidateDeficitRows?: DeficitDeductionAllocation[],
  performerName = 'SAS Admin'
): Promise<{
  isStudentCollection: boolean;
  isSasOwner: boolean;
  liveAvailable: number;
  meta: Awaited<ReturnType<typeof resolveLiquidationFundingMeta>>;
}> {
  const meta = await resolveLiquidationFundingMeta(data);
  const allocs = await resolveLiquidationSourceAllocations(data);
  const isStudentCollection = isStudentCollectionFunding({
    fundingSource: meta.effectiveFundingSource,
    allocations: allocs,
  });

  if (!isStudentCollection) {
    return { isStudentCollection: false, isSasOwner: false, liveAvailable: 0, meta };
  }

  const invalidRow = (candidateDeficitRows || []).find(
    (r) => r.fundType === 'misc_fee' || r.isSupplementalSource === true
  );
  if (invalidRow) {
    throw new Error(
      `Miscellaneous Fee or supplemental bucket "${invalidRow.bucketName}" cannot be used for a Student Collections activity. Reimbursement must come solely from Student Collections funds.`
    );
  }

  const orgLower = meta.organizationId.toLowerCase();
  const isSasOwner =
    meta.effectiveFundingSource === 'retained_sao_fund' ||
    !meta.organizationId ||
    ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgLower) ||
    data?.createdByRole === 'admin';
  const allocatedBudget = Number(data?.allocatedBudget ?? data?.amountAdvanced ?? 0) || 0;

  let liveAvailable = 0;

  if (isSasOwner) {
    if (data?.eventId) {
      try {
        const { reconcileSasContributionEventToRetainedFund } = await import('./payable.service');
        await reconcileSasContributionEventToRetainedFund(data.eventId, performerName);
      } catch (syncErr) {
        console.warn('[assertStudentCollectionReimbursementSufficient] SAS sync warning:', syncErr);
      }
    }

    const {
      RETAINED_FUNDS_COLLECTION,
      RETAINED_FUND_LEDGER_COLLECTION,
      SAO_RETAINED_BUCKET_ID,
      buildScopedRetainedBucketId,
      normalizeRetainedSchoolYear,
    } = await import('./retained-fund.service');

    let effectiveSy = normalizeRetainedSchoolYear(meta.schoolYear);
    if (!effectiveSy) {
      try {
        const ctx = await getActiveMiscFeeAcademicContext();
        effectiveSy = normalizeRetainedSchoolYear(ctx?.schoolYear);
      } catch {}
    }

    const scopedId = effectiveSy
      ? buildScopedRetainedBucketId(SAO_RETAINED_BUCKET_ID, effectiveSy)
      : SAO_RETAINED_BUCKET_ID;
    let saoFundSnap = await getDoc(doc(db, RETAINED_FUNDS_COLLECTION, scopedId));
    if (!saoFundSnap.exists() && scopedId !== SAO_RETAINED_BUCKET_ID) {
      const legacySnap = await getDoc(doc(db, RETAINED_FUNDS_COLLECTION, SAO_RETAINED_BUCKET_ID));
      const legacyData = legacySnap.exists() ? (legacySnap.data() as any) : null;
      if (
        legacyData &&
        (!legacyData.migratedToSchoolYear ||
          normalizeRetainedSchoolYear(legacyData.migratedToSchoolYear) === effectiveSy)
      ) {
        saoFundSnap = legacySnap;
      }
    }
    const rawSaoAvailable = saoFundSnap.exists()
      ? Math.max(0, Number((saoFundSnap.data() as any)?.availableBalance) || 0)
      : 0;

    let retainedLedgerEntries: Array<{ eventId?: string; type?: string; amount?: number }> = [];
    if (data?.eventId) {
      const lSnap = await getDocs(
        query(collection(db, RETAINED_FUND_LEDGER_COLLECTION), where('eventId', '==', data.eventId))
      );
      retainedLedgerEntries = lSnap.docs.map((d) => d.data() as any);
    }

    liveAvailable = computeLiveStudentCollectionReimbursementCapacity({
      isSasOwned: true,
      eventId: data?.eventId || null,
      liquidationId,
      allocatedBudget,
      saoAvailableBalance: rawSaoAvailable,
      retainedLedgerEntries,
    });
  } else {
    const orgLedgerSnap = await getDocs(
      query(collection(db, 'organization_ledger'), where('organizationId', '==', meta.organizationId))
    );
    const orgDocs = orgLedgerSnap.docs.map((d) => d.data() as any);
    liveAvailable = computeLiveStudentCollectionReimbursementCapacity({
      isSasOwned: false,
      eventId: data?.eventId || null,
      liquidationId,
      allocatedBudget,
      orgLedgerEntries: orgDocs,
    });
  }

  if (liveAvailable + 0.009 < deficitAmount) {
    const shortfall = Math.max(0, Math.round((deficitAmount - liveAvailable) * 100) / 100);
    const fmt = (n: number) =>
      `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    throw new Error(
      `Insufficient Student Collections funds to reimburse ${fmt(deficitAmount)} overspend (Available: ${fmt(liveAvailable)}, Shortfall: ${fmt(shortfall)}). Collect remaining student contributions first before proceeding with reimbursement.`
    );
  }

  return { isStudentCollection: true, isSasOwner, liveAvailable, meta };
}

/**
 * Attaches multi-file Cashier return / Reimbursement proof AFTER a liquidation has been approved,
 * and optionally saves Maker-selected surplus return or deficit coverage bucket allocations.
 */
export async function attachCashierSettlementProofs(
  liquidationId: string,
  proofs: any[],
  cashierReferenceNo: string,
  actor: { uid: string; name: string; role: 'admin' | 'officer' },
  options?: {
    surplusReturnAllocations?: SurplusReturnAllocation[];
    deficitDeductionAllocations?: DeficitDeductionAllocation[];
  }
): Promise<void> {
  if (!liquidationId) throw new Error('Liquidation ID is required.');
  if (!Array.isArray(proofs) || proofs.length === 0) {
    throw new Error('Please upload at least one receipt/proof file.');
  }

  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found.');
  const data = snap.data() as LiquidationDocument;

  if (data.status !== 'approved') {
    throw new Error('Settlement proof can only be attached after the Financial Liquidation is approved.');
  }

  const netVariance =
    Number(data.surplusOrDeficit ?? ((data.allocatedBudget ?? 0) - (data.totalActualSpending ?? 0))) || 0;

  let validatedDeficitRows: DeficitDeductionAllocation[] | undefined;
  if (netVariance < -0.009) {
    const totalDeficit = Math.abs(netVariance);
    const scCheck = await assertStudentCollectionReimbursementSufficient(
      liquidationId,
      data,
      totalDeficit,
      options?.deficitDeductionAllocations,
      actor.name
    );
    if (Array.isArray(options?.deficitDeductionAllocations)) {
      const defCheck = validateDeficitDeductionAllocations({
        totalDeficit,
        rows: options.deficitDeductionAllocations,
        mode: scCheck.isStudentCollection ? 'student_collections' : 'misc_or_mixed',
      });
      if (!defCheck.isValid) {
        const firstErr =
          Object.values(defCheck.perBucketErrors)[0] ||
          defCheck.summaryError ||
          'Invalid overspend bucket coverage.';
        throw new Error(firstErr);
      }
      validatedDeficitRows = options.deficitDeductionAllocations;
    }
  }

  let validatedSurplusRows: SurplusReturnAllocation[] | undefined;
  if (netVariance > 0.009 && Array.isArray(options?.surplusReturnAllocations) && options.surplusReturnAllocations.length > 0) {
    const surpCheck = validateSurplusReturnAllocations({
      totalSurplus: netVariance,
      rows: options.surplusReturnAllocations,
    });
    if (!surpCheck.isValid) {
      const firstErr =
        Object.values(surpCheck.perBucketErrors)[0] ||
        surpCheck.summaryError ||
        'Invalid surplus return allocation.';
      throw new Error(firstErr);
    }
    validatedSurplusRows = options.surplusReturnAllocations;
  }

  const bucketSummaryText = validatedDeficitRows
    ? ` Covering buckets: ${validatedDeficitRows
        .filter((r) => Number(r.deductAmount) > 0)
        .map((r) => `${r.bucketName} (-₱${Number(r.deductAmount).toLocaleString()})`)
        .join(', ')}.`
    : validatedSurplusRows
      ? ` Returning to: ${validatedSurplusRows
          .filter((r) => Number(r.returnAmount) > 0)
          .map((r) => `${r.bucketName} (+₱${Number(r.returnAmount).toLocaleString()})`)
          .join(', ')}.`
      : '';

  const proofRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: actor.name || 'User',
    authorRole: actor.role === 'admin' ? 'admin' : 'officer',
    action: 'cashier_proof',
    comment: `Uploaded ${proofs.length} ${netVariance < 0 ? 'Reimbursement / Supplemental' : 'Cashier Settlement'} proof file(s)${cashierReferenceNo?.trim() ? ` (Ref/OR #: ${cashierReferenceNo.trim()})` : ''}.${bucketSummaryText}`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(
    docRef,
    sanitizeFirestorePayload({
      cashierSettlementProofs: proofs,
      cashierReferenceNo: cashierReferenceNo?.trim() || '',
      cashierSettlementStatus: 'proof_uploaded',
      cashierSettledAt: new Date().toISOString(),
      cashierSettledByName: actor.name || 'User',
      ...(validatedDeficitRows ? { deficitDeductionAllocations: validatedDeficitRows } : {}),
      ...(validatedSurplusRows ? { surplusReturnAllocations: validatedSurplusRows } : {}),
      remarksHistory: arrayUnion(sanitizeFirestorePayload(proofRemark)),
      updatedAt: serverTimestamp(),
    })
  );

  // Notify SAS Admin when an officer uploads Settlement proof
  if (actor.role !== 'admin') {
    try {
      await createNotification({
        recipientRole: 'admin',
        type: 'document_submission',
        category: 'financial_liquidation',
        title: `${netVariance < 0 ? 'Reimbursement Proof' : 'Cashier Proof'} Uploaded: ${data.eventTitle}`,
        message: `${data.organizationName || actor.name} uploaded ${proofs.length} settlement proof file(s) for verification.${bucketSummaryText}`,
        resourceId: liquidationId,
        resourceType: 'liquidation',
        actionRoute: `/home/liquidations?id=${liquidationId}`,
        targetOrgId: data.organizationId,
        targetOrgName: data.organizationName,
        senderName: actor.name,
      });
    } catch (e) {
      console.warn('[attachCashierSettlementProofs] Notification warning:', e);
    }
  }
}

/**
 * Credits any excess pre-liquidation Cashier collections (collected above the liquidation's new-contribution budget basis)
 * into SAS Student Contribution & Retained Funds (`SAO_CAMPUS`) once the event's liquidation settles.
 */
async function settlePreLiquidationExcessCollectionsIfAny(
  liquidationId: string,
  data: Partial<LiquidationDocument> | any,
  performedBy?: string
): Promise<void> {
  const eventId = String(data?.eventId || '').trim();
  if (!eventId) return;

  const meta = await resolveLiquidationFundingMeta(data);
  if (meta.effectiveFundingSource !== 'student_contributions') return;

  const orgIdLower = meta.organizationId.toLowerCase();
  const isSasOwner =
    !meta.organizationId ||
    ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgIdLower) ||
    data?.createdByRole === 'admin';
  if (!isSasOwner) return;

  try {
    const paySnap = await getDocs(
      query(collection(db, 'payables'), where('eventId', '==', eventId))
    );
    const paidDocs = paySnap.docs
      .map((d) => d.data() as any)
      .filter((p) => String(p.status || '').toLowerCase() === 'paid');

    const totalCollected =
      Math.round(
        paidDocs.reduce(
          (s, p) => s + (Number(p.paidAmount) || Number(p.assignedAmount) || 0),
          0
        ) * 100
      ) / 100;

    if (totalCollected <= 0.009) return;

    const totalAlreadyCredited =
      Math.round(
        paidDocs.reduce(
          (s, p) => s + Math.max(0, Number(p.retainedCreditedAmount) || 0),
          0
        ) * 100
      ) / 100;

    const allocs = await resolveLiquidationSourceAllocations(data);
    const retainedTopUp =
      Math.round(
        allocs
          .filter((a) => a.fundType === 'student_contribution_retained')
          .reduce((s, a) => s + (Number(a.allocatedAmount) || 0), 0) * 100
      ) / 100;

    const allocatedBasis = Number(data?.allocatedBudget ?? data?.amountAdvanced ?? 0) || 0;
    const allocatedFromNewCollections = Math.max(
      0,
      Math.round((allocatedBasis - retainedTopUp) * 100) / 100
    );

    // Check if Disbursement Voucher already deducted from Retained Fund; if both collections and disbursement
    // were already posted live, excess unallocated cash is already reflected in availableBalance.
    let hasLiveDisbLedger = false;
    try {
      const disbLedgerSnap = await getDoc(doc(db, 'retained_fund_ledger', `disb_${eventId}`));
      hasLiveDisbLedger = disbLedgerSnap.exists();
    } catch {}

    const uncreditedOffset = hasLiveDisbLedger
      ? totalAlreadyCredited
      : Math.max(totalAlreadyCredited, allocatedFromNewCollections);
    const excessUnallocated = Math.round((totalCollected - uncreditedOffset) * 100) / 100;

    if (excessUnallocated > 0.009) {
      const { creditRetainedFundOnCollection } = await import('./retained-fund.service');
      await creditRetainedFundOnCollection({
        collectionId: `preliq_excess_${liquidationId}`,
        amount: excessUnallocated,
        organizationId: 'sas',
        eventId,
        eventTitle: data?.eventTitle || 'Activity Liquidation',
        schoolYear: meta.schoolYear,
        semester: meta.semester,
        description: `Unallocated Pre-Liquidation Student Contributions – ${data?.eventTitle || 'Activity'}`,
        performedBy: performedBy || 'SAS Admin',
      });
    }
  } catch (err) {
    console.warn('[settlePreLiquidationExcessCollectionsIfAny] Excess collection settle warning:', err);
  }
}

/**
 * SAS Admin verification & ledger settlement of post-approval Surplus Return or Overspend Deficit Coverage.
 * - Cashier proof is required for Surplus returns when a Miscellaneous Fee bucket OR SAS Student Contribution / Retained Fund receives > ₱0.00.
 * - Reimbursement / Supplemental Proof AND 100% bucket coverage are always required for Overspent Deficits.
 * - Executes ledger & bucket balance writes cleanly once verified.
 */
export async function verifyCashierSettlementProofs(
  liquidationId: string,
  actor: { uid: string; name: string },
  options?: {
    surplusReturnAllocations?: SurplusReturnAllocation[];
    deficitDeductionAllocations?: DeficitDeductionAllocation[];
    cashierSettlementProofs?: ReceiptAttachment[];
    cashierReferenceNo?: string;
  }
): Promise<void> {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found.');
  const data = { id: snap.id, ...(snap.data() as any) } as LiquidationDocument;

  if (data.status !== 'approved') {
    throw new Error('Liquidation report must be approved by signatories before settling.');
  }

  const meta = await resolveLiquidationFundingMeta(data);
  const orgIdLower = meta.organizationId.toLowerCase();
  const isSasEvent =
    meta.effectiveFundingSource !== 'organization_funds' &&
    (!meta.organizationId ||
      ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'institutional'].includes(orgIdLower) ||
      (data as any)?.createdByRole === 'admin');

  const suppliedProofs = Array.isArray(options?.cashierSettlementProofs)
    ? options.cashierSettlementProofs
    : [];
  const existingProofs = Array.isArray(data.cashierSettlementProofs)
    ? data.cashierSettlementProofs
    : [];
  const effectiveProofs = suppliedProofs.length > 0 ? suppliedProofs : existingProofs;
  const effectiveRefNo =
    options?.cashierReferenceNo !== undefined
      ? options.cashierReferenceNo.trim()
      : (data.cashierReferenceNo || '').trim();

  const netAmount =
    Number(data.surplusOrDeficit ?? ((data.allocatedBudget ?? 0) - (data.totalActualSpending ?? 0))) || 0;

  let finalReturnAllocations: SurplusReturnAllocation[] = [];
  let finalDeficitAllocations: DeficitDeductionAllocation[] = [];
  let auditDetails = '';

  if (netAmount > 0.009) {
    const resolvedAllocs = await resolveLiquidationSourceAllocations(data);
    const candidateReturns =
      Array.isArray(options?.surplusReturnAllocations) && options.surplusReturnAllocations.length > 0
        ? options.surplusReturnAllocations
        : Array.isArray(data.surplusReturnAllocations) && data.surplusReturnAllocations.length > 0
          ? data.surplusReturnAllocations
          : resolvedAllocs.length === 1
            ? [
                {
                  bucketId: resolvedAllocs[0].bucketId,
                  bucketName: resolvedAllocs[0].bucketName,
                  fundType: resolvedAllocs[0].fundType,
                  originalAllocatedAmount: Number(resolvedAllocs[0].allocatedAmount ?? data.allocatedBudget ?? 0),
                  returnAmount: Math.round(netAmount * 100) / 100,
                },
              ]
            : (meta.effectiveFundingSource === 'student_contributions' ||
                  meta.effectiveFundingSource === 'retained_sao_fund') &&
                isSasEvent
              ? [
                  {
                    bucketId: 'SAO_CAMPUS',
                    bucketName: 'SAO / Campus Student Activity Fund',
                    fundType: 'student_contribution_retained' as const,
                    originalAllocatedAmount: Number(data.allocatedBudget ?? 0),
                    returnAmount: Math.round(netAmount * 100) / 100,
                  },
                ]
              : [];

    if (candidateReturns.length === 0) {
      throw new Error(
        'Surplus Return Allocation Required: Please assign how the unspent surplus returns across the approved source buckets.'
      );
    }

    const surpCheck = validateSurplusReturnAllocations({
      totalSurplus: netAmount,
      rows: candidateReturns,
      isSasEvent,
    });
    if (!surpCheck.isValid) {
      const firstErr =
        Object.values(surpCheck.perBucketErrors)[0] ||
        surpCheck.summaryError ||
        'Invalid surplus return allocation.';
      throw new Error(firstErr);
    }
    if (surpCheck.requiresCashierReceipt && effectiveProofs.length === 0) {
      throw new Error(
        meta.effectiveFundingSource === 'student_contributions' ||
          meta.effectiveFundingSource === 'retained_sao_fund'
          ? 'Return Proof Required: Please upload the proof of returning the unspent money before posting it to SAS Student Contribution & Retained Funds.'
          : 'Cashier Return Receipt Required: At least one Miscellaneous Fee bucket receives surplus (> ₱0.00). Please upload the Cashier Return Receipt before closing.'
      );
    }
    finalReturnAllocations = candidateReturns;
    auditDetails = ` Surplus returned to: ${finalReturnAllocations
      .filter((r) => Number(r.returnAmount) > 0)
      .map((r) => `${r.bucketName} (+₱${Number(r.returnAmount).toLocaleString()})`)
      .join(', ')}.`;
  } else if (netAmount < -0.009) {
    const totalDeficit = Math.abs(netAmount);
    if (effectiveProofs.length === 0) {
      throw new Error(
        'Reimbursement / Supplemental Proof Required: Please upload proof before deducting overspent funds from buckets.'
      );
    }

    let candidateDeficits =
      Array.isArray(options?.deficitDeductionAllocations) && options.deficitDeductionAllocations.length > 0
        ? options.deficitDeductionAllocations
        : Array.isArray(data.deficitDeductionAllocations) && data.deficitDeductionAllocations.length > 0
          ? data.deficitDeductionAllocations
          : [];

    const scCheck = await assertStudentCollectionReimbursementSufficient(
      liquidationId,
      data,
      totalDeficit,
      candidateDeficits,
      actor.name
    );

    if (scCheck.isStudentCollection && candidateDeficits.length === 0) {
      candidateDeficits = [
        {
          bucketId: scCheck.isSasOwner ? 'SAO_CAMPUS' : `ORG_${meta.organizationId}`,
          bucketName: scCheck.isSasOwner
            ? 'SAS Student Contribution & Retained Funds'
            : `${meta.organizationName || 'Organization'} Student Collections Fund`,
          fundType: 'student_contribution_retained',
          originalAllocatedAmount: Number(data.allocatedBudget ?? 0),
          availableBalance: scCheck.liveAvailable,
          deductAmount: totalDeficit,
          isSupplementalSource: false,
        },
      ];
    }

    if (candidateDeficits.length === 0) {
      throw new Error(
        'Overspent Bucket Coverage Required: Please select which bucket(s) will cover the overspend.'
      );
    }

    const defCheck = validateDeficitDeductionAllocations({
      totalDeficit,
      rows: candidateDeficits,
      mode: scCheck.isStudentCollection ? 'student_collections' : 'misc_or_mixed',
    });
    if (!defCheck.isValid) {
      const firstErr =
        Object.values(defCheck.perBucketErrors)[0] ||
        defCheck.summaryError ||
        'Invalid overspend bucket coverage.';
      throw new Error(firstErr);
    }
    finalDeficitAllocations = candidateDeficits;
    auditDetails = ` Overspend deducted from: ${finalDeficitAllocations
      .filter((r) => Number(r.deductAmount) > 0)
      .map((r) => `${r.bucketName}${r.isSupplementalSource ? ' [Supplemental]' : ''} (-₱${Number(r.deductAmount).toLocaleString()})`)
      .join(', ')}.`;
  }

  const mergedVerifiedData: Partial<LiquidationDocument> = {
    ...data,
    ...(finalReturnAllocations.length > 0 ? { surplusReturnAllocations: finalReturnAllocations } : {}),
    ...(finalDeficitAllocations.length > 0 ? { deficitDeductionAllocations: finalDeficitAllocations } : {}),
    ...(effectiveProofs.length > 0 ? { cashierSettlementProofs: effectiveProofs } : {}),
    ...(effectiveRefNo ? { cashierReferenceNo: effectiveRefNo } : {}),
  };

  // Post financial ledger & bucket credits/deductions BEFORE marking verified so insufficient balance aborts cleanly
  if (Math.abs(netAmount) >= 0.01) {
    await postLiquidationToLedger(liquidationId, mergedVerifiedData, actor.name || actor.uid);
  }
  await settlePreLiquidationExcessCollectionsIfAny(
    liquidationId,
    mergedVerifiedData,
    actor.name || actor.uid
  );

  const verifyRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: actor.name || 'SAS Admin',
    authorRole: 'admin',
    action: 'cashier_verified',
    comment: `Liquidation settlement verified & posted by ${actor.name || 'SAS Admin'}${effectiveRefNo ? ` (Ref/OR #: ${effectiveRefNo})` : ''}.${auditDetails}`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(
    docRef,
    sanitizeFirestorePayload({
      cashierSettlementStatus: 'verified',
      cashierVerifiedBy: actor.uid,
      cashierVerifiedByName: actor.name || 'SAS Admin',
      cashierVerifiedAt: new Date().toISOString(),
      ...(finalReturnAllocations.length > 0 ? { surplusReturnAllocations: finalReturnAllocations } : {}),
      ...(finalDeficitAllocations.length > 0 ? { deficitDeductionAllocations: finalDeficitAllocations } : {}),
      ...(effectiveProofs.length > 0 ? { cashierSettlementProofs: effectiveProofs } : {}),
      ...(effectiveRefNo ? { cashierReferenceNo: effectiveRefNo } : {}),
      remarksHistory: arrayUnion(sanitizeFirestorePayload(verifyRemark)),
      updatedAt: serverTimestamp(),
    })
  );

  // Notify organization maker once SAS Admin verifies return/reimbursement settlement
  if (!isSasOwnedLiquidation(data) && data.organizationId) {
    try {
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: data.organizationId,
        targetOrgName: data.organizationName || 'Student Organization',
        type: 'document_approved',
        category: 'financial_liquidation',
        title: `Settlement Verified: ${data.eventTitle || 'Activity'}`,
        message: `SAS verified the ${netAmount < -0.009 ? 'reimbursement' : 'Cashier return'} proof for "${data.eventTitle || 'Activity'}" and posted the bucket settlement.${auditDetails}`,
        resourceId: liquidationId,
        resourceType: 'liquidation',
        actionRoute: `/officer/liquidation?id=${liquidationId}`,
        senderName: actor.name || 'SAS Admin',
      });
    } catch (notifErr) {
      console.warn('[verifyCashierSettlementProofs] Notification warning:', notifErr);
    }
  }
}

/**
 * Semester-End Closeout for Student Contribution activities:
 * Formally absorbs any remaining uncollected Collection Deficit from designated SAS/Misc Fee/Org buckets
 * while preserving payment history and closing out the shortfall.
 */
export async function absorbRemainingCollectionDeficit(
  liquidationId: string,
  actor: { uid: string; name: string },
  options: {
    deficitDeductionAllocations: DeficitDeductionAllocation[];
    note?: string;
  }
): Promise<void> {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found.');
  const data = { id: snap.id, ...(snap.data() as any) } as LiquidationDocument;

  if (data.status !== 'approved') {
    throw new Error('Liquidation report must be approved before absorbing a remaining collection deficit.');
  }

  const remainingDeficit = Math.max(0, Number(data.collectionDeficitAmount) || 0);
  if (remainingDeficit < 0.01) {
    throw new Error('No remaining collection deficit to absorb.');
  }

  const candidateRows = options?.deficitDeductionAllocations || [];
  if (candidateRows.length === 0) {
    throw new Error('Please allocate 100% of the remaining collection deficit across one or more buckets.');
  }

  const check = validateDeficitDeductionAllocations({
    totalDeficit: remainingDeficit,
    rows: candidateRows,
  });
  if (!check.isValid) {
    const firstErr =
      Object.values(check.perBucketErrors)[0] ||
      check.summaryError ||
      'Invalid bucket coverage for remaining collection deficit.';
    throw new Error(firstErr);
  }

  // Post ledger deduction for the absorbed shortfall
  await postLiquidationToLedger(
    `${liquidationId}_absorb`,
    {
      ...data,
      surplusOrDeficit: -remainingDeficit,
      deficitDeductionAllocations: candidateRows,
    },
    actor.name || actor.uid
  );

  const summary = candidateRows
    .filter((r) => Number(r.deductAmount) > 0)
    .map((r) => `${r.bucketName} (-₱${Number(r.deductAmount).toLocaleString()})`)
    .join(', ');

  const absorbRemark: LiquidationRemark = {
    id: `rem-${Date.now()}`,
    authorName: actor.name || 'SAS Admin',
    authorRole: 'admin',
    action: 'cashier_verified',
    comment: `Semester-end collection deficit closeout: ₱${remainingDeficit.toLocaleString()} absorbed via ${summary}.${options.note?.trim() ? ` Note: ${options.note.trim()}` : ''}`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(
    docRef,
    sanitizeFirestorePayload({
      collectionDeficitAmount: 0,
      collectionSettlementStatus: 'deficit_absorbed',
      deficitDeductionAllocations: candidateRows,
      deficitAbsorbedAt: new Date().toISOString(),
      deficitAbsorbedBy: actor.uid,
      deficitAbsorbedByName: actor.name || 'SAS Admin',
      deficitAbsorbedNote: options.note?.trim() || '',
      remarksHistory: arrayUnion(sanitizeFirestorePayload(absorbRemark)),
      updatedAt: serverTimestamp(),
    })
  );
}

/**
 * Notify an organization's Club Adviser when a Student Officer submits a Financial Liquidation for review.
 */
export async function notifyAdviserForLiquidationReview(params: {
  liquidationId: string;
  organizationId: string;
  organizationName?: string;
  eventTitle: string;
  officerUid: string;
  officerName: string;
  isResubmission?: boolean;
}): Promise<void> {
  const targetOrgId = String(params.organizationId || '').trim();
  if (!targetOrgId || targetOrgId === 'sas') return;
  let orgAdviserEmail = '';
  let orgAdviserUid = '';
  try {
    const orgSnap = await getDoc(doc(db, 'organizations', targetOrgId));
    if (orgSnap.exists()) {
      const oData = orgSnap.data() as any;
      orgAdviserEmail = oData?.adviser?.email || oData?.adviserEmail || '';
      orgAdviserUid = oData?.adviser?.uid || oData?.adviserUid || '';
    }
  } catch (_) {}

  const adviserTokens = [`adviser:${targetOrgId}`, orgAdviserEmail, orgAdviserUid].filter(Boolean).join('|');
  if (!adviserTokens) return;

  try {
    await createNotification({
      recipientRole: 'officer',
      recipientId: adviserTokens,
      targetOrgId,
      targetOrgName: params.organizationName || 'Student Organization',
      type: 'document_submission',
      category: 'liquidation',
      title: params.isResubmission
        ? `Revised Officer Liquidation for Review: ${params.eventTitle}`
        : `New Officer Liquidation for Review: ${params.eventTitle}`,
      message: `${params.officerName || 'A student officer'} submitted a Financial Liquidation report for your Club Adviser decision before forwarding to SAS.`,
      resourceId: params.liquidationId,
      resourceType: 'liquidation',
      actionRoute: `/officer/liquidation?tab=officer_liquidations&id=${params.liquidationId}`,
      senderId: params.officerUid,
      senderName: params.officerName,
      senderRoleTitle: 'Organization Officer',
    });
  } catch (err) {
    console.warn('[notifyAdviserForLiquidationReview] Notification error:', err);
  }
}

/**
 * Club Adviser Action: Approve & Forward an officer-submitted Financial Liquidation to SAS
 * (and Institutional Signatories if funded via School Budget / Miscellaneous Fee).
 */
export async function approveAndForwardLiquidationByAdviser(
  liquidationId: string,
  adviser: { uid: string; name: string; email: string; signatureUrl: string },
  remarks = ''
): Promise<{ success: boolean }> {
  if (!adviser.signatureUrl || !adviser.signatureUrl.trim()) {
    throw new Error('Club Adviser electronic signature is required to approve and forward this Financial Liquidation.');
  }

  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found.');
  const data = snap.data() as LiquidationDocument;

  const resolvedSource = String(data.fundingSource || 'organization_funds').toLowerCase();
  const isOrgDirectSas =
    resolvedSource === 'organization_funds' ||
    resolvedSource === 'student_contributions' ||
    resolvedSource === 'zero_budget';
  const requiresSasPreApprovalGate = !isOrgDirectSas;

  let chain: LiquidationApprovalStep[] = Array.isArray(data.approvalChain) ? data.approvalChain : [];
  if (isOrgDirectSas) {
    const sasCfg = getCachedSasSignatoryConfig();
    chain = [
      {
        id: 'step_sas_approval',
        step: 1,
        stageIndex: 1,
        stageName: 'SAS Approval',
        role: 'sas_head',
        roleTitle: sasCfg.roleTitle || 'Student Affairs & Services Head',
        actionType: 'approve',
        signatoryUid: sasCfg.employeeId || 'sas_admin',
        signatoryName: sasCfg.name || 'Riselle Mae B. Lucanas',
        signatoryEmail: sasCfg.email || 'sao@ormoc.sti.edu.ph',
        department: sasCfg.department || 'Student Affairs & Services',
        status: 'current',
      },
    ];
  } else {
    if (chain.length === 0) {
      chain = await generateDefaultLiquidationChain(false);
    }
    chain = chain.map((step) => ({
      ...step,
      status: 'waiting' as const,
      signedAt: undefined,
      signatureUrl: undefined,
      remarks: undefined,
    }));
  }

  const nowIso = new Date().toISOString();
  const adviserReview = {
    status: 'approved' as const,
    reviewedByUid: adviser.uid,
    reviewedByName: adviser.name || 'Club Adviser',
    reviewedByEmail: adviser.email || '',
    reviewedAt: nowIso,
    remarks: remarks?.trim() || 'Approved by Club Adviser and forwarded to SAS.',
    signatureUrl: adviser.signatureUrl.trim(),
  };

  const remarkEntry: LiquidationRemark = {
    id: `rem-adv-approve-${Date.now()}`,
    authorName: adviser.name || 'Club Adviser',
    authorRole: 'adviser',
    action: 'adviser_approved',
    comment: remarks?.trim() || 'Approved by Club Adviser and forwarded to SAS for institutional audit.',
    timestamp: nowIso,
  };

  await updateDoc(
    docRef,
    sanitizeFirestorePayload({
      status: 'under_review',
      isPendingSasVetting: requiresSasPreApprovalGate,
      sasVettedAt: null,
      sasVettedBy: null,
      adviserReview,
      submittedToSasAt: serverTimestamp(),
      submittedAt: serverTimestamp(),
      approvalChain: chain,
      currentStageIndex: 1,
      currentStepIndex: 0,
      submittedBySignatureUrl: adviser.signatureUrl.trim(),
      preparedBy: {
        name: adviser.name || data.preparedBy?.name || 'Organization Adviser',
        roleTitle: 'Organization Adviser',
        email: adviser.email || '',
        signatureUrl: adviser.signatureUrl.trim(),
        signedAt: nowIso,
      },
      remarksHistory: arrayUnion(sanitizeFirestorePayload(remarkEntry)),
      updatedAt: serverTimestamp(),
    })
  );

  if (data.eventId) {
    try {
      await updateDoc(doc(db, EVENTS_COLLECTION, data.eventId), {
        liquidationStatus: 'submitted',
        updatedAt: serverTimestamp(),
      });
    } catch (_) {}
  }

  try {
    await createNotification({
      recipientRole: 'admin',
      type: 'document_submission',
      category: 'liquidation',
      title: `Liquidation Forwarded by Club Adviser: ${data.eventTitle || 'Activity Liquidation'}`,
      message: `${adviser.name} (Club Adviser, ${data.organizationName || 'Student Org'}) approved and forwarded this Financial Liquidation for SAS review.`,
      resourceId: liquidationId,
      resourceType: 'liquidation',
      actionRoute: `/home/financial-liquidations?id=${liquidationId}`,
      targetOrgId: data.organizationId,
      targetOrgName: data.organizationName,
      senderId: adviser.uid,
      senderName: adviser.name,
      senderRoleTitle: 'Club Adviser',
    });

    if (data.organizationId) {
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: data.organizationId,
        targetOrgName: data.organizationName,
        type: 'document_approved',
        category: 'liquidation',
        title: `Liquidation Approved by Club Adviser: ${data.eventTitle}`,
        message: `${adviser.name} approved your Financial Liquidation report and forwarded it to SAS.`,
        resourceId: liquidationId,
        resourceType: 'liquidation',
        actionRoute: `/officer/liquidation?id=${liquidationId}`,
        senderId: adviser.uid,
        senderName: adviser.name,
        senderRoleTitle: 'Club Adviser',
      });
    }
  } catch (_) {}

  return { success: true };
}

/**
 * Club Adviser Action: Return an officer-submitted Financial Liquidation for revision.
 */
export async function returnLiquidationByAdviser(
  liquidationId: string,
  adviser: { uid: string; name: string; email: string },
  remarks: string,
  stepRevisionRemarks?: Record<string, string>,
  returnFlags?: string[],
  returnDeadline?: string
): Promise<{ success: boolean }> {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found.');
  const data = snap.data() as LiquidationDocument;

  const nowIso = new Date().toISOString();
  const adviserReview = {
    status: 'returned' as const,
    reviewedByUid: adviser.uid,
    reviewedByName: adviser.name || 'Club Adviser',
    reviewedByEmail: adviser.email || '',
    reviewedAt: nowIso,
    remarks: remarks?.trim() || 'Returned by Club Adviser for revision.',
  };

  const remarkEntry: LiquidationRemark = {
    id: `rem-adv-return-${Date.now()}`,
    authorName: adviser.name || 'Club Adviser',
    authorRole: 'adviser',
    action: 'adviser_returned',
    comment: remarks?.trim() || 'Returned by Club Adviser for revision.',
    timestamp: nowIso,
  };

  await updateDoc(
    docRef,
    sanitizeFirestorePayload({
      status: 'returned',
      isPendingSasVetting: false,
      adviserReview,
      returnedByRole: 'adviser',
      returnedBy: adviser.uid,
      returnedByName: adviser.name || 'Club Adviser',
      returnedByRoleTitle: 'Club Adviser',
      returnedByEmail: adviser.email || '',
      returnedAt: nowIso,
      returnRemarks: remarks?.trim() || '',
      stepRevisionRemarks: stepRevisionRemarks || {},
      returnFlags: returnFlags || [],
      returnDeadline: returnDeadline || null,
      remarksHistory: arrayUnion(sanitizeFirestorePayload(remarkEntry)),
      updatedAt: serverTimestamp(),
    })
  );

  if (data.eventId) {
    try {
      await updateDoc(doc(db, EVENTS_COLLECTION, data.eventId), {
        liquidationStatus: 'returned',
        updatedAt: serverTimestamp(),
      });
    } catch (_) {}
  }

  try {
    if (data.organizationId) {
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: data.organizationId,
        targetOrgName: data.organizationName,
        type: 'document_returned',
        category: 'liquidation',
        title: `Liquidation Returned by Club Adviser: ${data.eventTitle}`,
        message: `${adviser.name} (Club Adviser): "${remarks}"`,
        resourceId: liquidationId,
        resourceType: 'liquidation',
        actionRoute: `/officer/liquidation?tab=returned&id=${liquidationId}`,
        isUrgent: true,
        senderId: adviser.uid,
        senderName: adviser.name,
        senderRoleTitle: 'Club Adviser',
      });
    }
  } catch (_) {}

  return { success: true };
}

/**
 * Club Adviser Action: Reject an officer-submitted Financial Liquidation.
 */
export async function rejectLiquidationByAdviser(
  liquidationId: string,
  adviser: { uid: string; name: string; email: string },
  reason: string
): Promise<{ success: boolean }> {
  const docRef = doc(db, LIQUIDATIONS_COLLECTION, liquidationId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error('Liquidation report not found.');
  const data = snap.data() as LiquidationDocument;

  const nowIso = new Date().toISOString();
  const adviserReview = {
    status: 'rejected' as const,
    reviewedByUid: adviser.uid,
    reviewedByName: adviser.name || 'Club Adviser',
    reviewedByEmail: adviser.email || '',
    reviewedAt: nowIso,
    remarks: reason,
  };

  const remarkEntry: LiquidationRemark = {
    id: `rem-adv-reject-${Date.now()}`,
    authorName: adviser.name || 'Club Adviser',
    authorRole: 'adviser',
    action: 'adviser_rejected',
    comment: reason,
    timestamp: nowIso,
  };

  await updateDoc(
    docRef,
    sanitizeFirestorePayload({
      status: 'rejected',
      isPendingSasVetting: false,
      adviserReview,
      rejectedByRole: 'adviser',
      rejectedByName: adviser.name || 'Club Adviser',
      rejectionReason: reason,
      rejectedAt: serverTimestamp(),
      remarksHistory: arrayUnion(sanitizeFirestorePayload(remarkEntry)),
      updatedAt: serverTimestamp(),
    })
  );

  if (data.eventId) {
    try {
      await updateDoc(doc(db, EVENTS_COLLECTION, data.eventId), {
        liquidationStatus: 'pending',
        liquidationReportId: null,
        updatedAt: serverTimestamp(),
      });
    } catch (_) {}
  }

  try {
    if (data.organizationId) {
      await createNotification({
        recipientRole: 'officer',
        targetOrgId: data.organizationId,
        targetOrgName: data.organizationName,
        type: 'document_rejected',
        category: 'liquidation',
        title: `Liquidation Rejected by Club Adviser: ${data.eventTitle}`,
        message: `${adviser.name} (Club Adviser) rejected this liquidation: "${reason}"`,
        resourceId: liquidationId,
        resourceType: 'liquidation',
        actionRoute: `/officer/liquidation?tab=rejected&id=${liquidationId}`,
        isUrgent: true,
        senderId: adviser.uid,
        senderName: adviser.name,
        senderRoleTitle: 'Club Adviser',
      });
    }
  } catch (_) {}

  return { success: true };
}
