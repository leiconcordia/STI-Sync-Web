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
  deleteField,
  Timestamp,
} from 'firebase/firestore';
import { db, sanitizeFirestorePayload } from '../../../../services/firebase';
import { archiveDocumentRevision } from '../../workflow/services/revision-history.service';
import { SIGNATORIES_COLLECTION } from '../../signatories/services/signatory.service';
import { resolveSignatoryLabel, canSignatoryApproveDocument } from '../../signatories/utils/signatory-label.utils';
import { EVENTS_COLLECTION } from '../../events/services/event.service';
import {
  type InstitutionalSignatory,
  isSignatoryApplicableTo,
} from '../../signatories/types/signatory.types';
import { getCachedSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import {
  getCachedWorkflowSettings,
  getDefaultWorkflowSettings,
  getBuiltinDefaultWorkflow,
  filterTemplateStepsBySignatoryScope,
} from '../../workflow/services/approval-workflow.service';
import { createNotification } from '../../notifications';
import { formatStageTitle, normalizeApprovalStages } from '../../workflow/utils/stage-normalization.utils';
import type {
  PostActivityReportDocument,
  PARApprovalStep,
  PARRemark,
  PARFormData,
  PostActivityReportStatus,
} from '../types/par.types';
import { autoArchiveApprovedPAR } from '../../reports/services/report-archive.service';
import { isSasInstitutionalActivity } from '../../events/utils/event-lifecycle.utils';
import { isEventLiquidationExempt } from '../../events/utils/organization-display.utils';
import { parSubmissionDeadline } from '../../events/utils/activity-compliance.utils';
import { softDeleteDocument, restoreDocument } from '../../workflow/services/soft-delete.service';
import { sanitizeCleanDocumentSnapshot } from '../../workflow/utils/snapshot-cleaner.utils';
import { normalizeFlatStringArray } from '../../workflow/utils/firestore-payload.utils';
import { getActiveMiscFeeAcademicContext } from '../../finance/services/misc-fee.service';
import { evaluatePARLiquidationGate } from '../../finance/utils/liquidation-settlement.utils';

export const PAR_COLLECTION = 'post_activity_reports';

async function fetchActiveEventLiquidation(
  eventId: string,
  preferredLiquidationId?: string
): Promise<any | null> {
  if (preferredLiquidationId) {
    try {
      const liqSnap = await getDoc(doc(db, 'liquidations', preferredLiquidationId));
      if (liqSnap.exists()) {
        const d = { id: liqSnap.id, ...liqSnap.data() } as any;
        const st = String(d.status || '').toLowerCase();
        if (st !== 'voided' && st !== 'cancelled' && d.isDeleted !== true) {
          return d;
        }
      }
    } catch {}
  }

  if (!eventId) return null;
  try {
    const liqSnap = await getDocs(
      query(collection(db, 'liquidations'), where('eventId', '==', eventId))
    );
    const candidates = liqSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((d) => {
        const st = String(d.status || '').toLowerCase();
        return st !== 'voided' && st !== 'cancelled' && d.isDeleted !== true;
      });
    if (candidates.length === 0) return null;
    return (
      candidates.find((c) => c.status === 'approved') ||
      candidates.find((c) => c.status === 'under_review' || c.status === 'pending') ||
      candidates[0]
    );
  } catch {
    return null;
  }
}

const AP_COLLECTIONS = ['activities', 'activity_proposals', 'proposals'] as const;

/**
 * Fetches the canonical Activity Proposal linked to an event or PAR record across
 * primary ('activities') and legacy ('activity_proposals', 'proposals') collections.
 */
export async function fetchLinkedActivityProposal(
  eventData?: any,
  eventId?: string
): Promise<any | null> {
  const candidateIds = Array.from(
    new Set(
      [
        eventData?.proposalId,
        eventData?.activityProposalId,
        eventData?.activityId,
        eventId,
        eventData?.id,
      ]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    )
  );

  for (const col of AP_COLLECTIONS) {
    for (const id of candidateIds) {
      try {
        const snap = await getDoc(doc(db, col, id));
        if (snap.exists()) {
          const data = snap.data() as any;
          if (
            data.title ||
            data.objectives ||
            data.estimatedAttendance ||
            data.estAttendanceCount ||
            data.financialProjections ||
            data.referenceNo
          ) {
            return { id: snap.id, ...data };
          }
        }
      } catch {}
    }
  }

  const refNo =
    eventData?.referenceId ||
    eventData?.proposalReferenceNo ||
    eventData?.eventReferenceId ||
    eventData?.referenceNo;

  if (typeof refNo === 'string' && refNo.trim().length > 0) {
    for (const col of AP_COLLECTIONS) {
      try {
        const q = query(collection(db, col), where('referenceNo', '==', refNo.trim()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          return { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Enforces the single-approver invariant for Post-Activity Report signatory pipelines:
 * strictly 1 signatory has actionType === 'approve'; all other steps are 'endorse'.
 */
export function enforceSinglePARApprover(steps: PARApprovalStep[]): PARApprovalStep[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];

  const copy = steps.map((s) => ({ ...s }));
  let chosenIdx = -1;

  // Prefer the last executive/existing approver in the chain
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].actionType === 'approve') {
      chosenIdx = i;
      break;
    }
  }

  if (chosenIdx === -1) {
    for (let i = copy.length - 1; i >= 0; i--) {
      if (copy[i].role === 'school_administrator' || copy[i].role === 'school_president') {
        chosenIdx = i;
        break;
      }
    }
  }

  if (chosenIdx === -1) {
    chosenIdx = copy.length - 1;
  }

  return copy.map((step, idx) => {
    const isApprover = idx === chosenIdx;
    const actionType: 'endorse' | 'approve' = isApprover ? 'approve' : 'endorse';
    const nextLabel = isApprover
      ? step.signatoryLabel && !/endorsed by/i.test(step.signatoryLabel)
        ? step.signatoryLabel
        : resolveSignatoryLabel({ ...step, actionType } as any, 'par', true)
      : step.signatoryLabel && !/approved by/i.test(step.signatoryLabel)
      ? step.signatoryLabel
      : resolveSignatoryLabel({ ...step, actionType } as any, 'par', false);

    return {
      ...step,
      actionType,
      signatoryLabel: nextLabel,
    };
  });
}

/**
 * Sanitizes Firestore payloads while preserving top-level/map FieldValues (serverTimestamp, arrayUnion, deleteField).
 */
function cleanPayload<T>(obj: T): T {
  return sanitizeFirestorePayload(obj);
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
  let allSignatories = providedSignatories;

  if (!allSignatories || allSignatories.length === 0) {
    try {
      const snap = await getDocs(collection(db, SIGNATORIES_COLLECTION));
      allSignatories = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InstitutionalSignatory));
    } catch (e) {
      console.warn('[generateDefaultPARSignatoryChain] Could not fetch signatories:', e);
      allSignatories = [];
    }
  }

  const activeSignatories = (allSignatories || []).filter(
    (s) => s.isActive !== false && isSignatoryApplicableTo(s, 'par')
  );

  if (activeSignatories.length === 0 && isSasCreator) {
    return [];
  }

  // ── Pull Configured Workflow Template from Settings (Admin PAR vs Adviser PAR) ──
  const pipelineKey = isSasCreator ? 'admin_par' : 'adviser_par';
  let workflowSettings: any;
  try {
    workflowSettings = await getDefaultWorkflowSettings();
  } catch (err) {
    workflowSettings = getCachedWorkflowSettings();
  }

  let configuredTemplate = workflowSettings ? workflowSettings[pipelineKey] : undefined;

  // Fallback: If target role's PAR has no assigned eligible signers, check if the other role's PAR was configured
  const hasAssignedSigners = (steps?: any[]) =>
    Array.isArray(steps) && steps.some((s) => Boolean(s.signatoryUid || s.signatoryName));

  const rawPrimaryFiltered = Array.isArray(configuredTemplate)
    ? filterTemplateStepsBySignatoryScope(configuredTemplate, allSignatories, 'par', {
        normalize: true,
      })
    : [];

  if (hasAssignedSigners(rawPrimaryFiltered)) {
    configuredTemplate = rawPrimaryFiltered;
  } else {
    const alternateKey = isSasCreator ? 'adviser_par' : 'admin_par';
    const altFiltered = Array.isArray(workflowSettings?.[alternateKey])
      ? filterTemplateStepsBySignatoryScope(workflowSettings[alternateKey], allSignatories, 'par', {
          normalize: true,
        })
      : [];
    configuredTemplate = hasAssignedSigners(altFiltered) ? altFiltered : rawPrimaryFiltered;
  }

  if (!configuredTemplate || configuredTemplate.length === 0) {
    configuredTemplate = filterTemplateStepsBySignatoryScope(
      getBuiltinDefaultWorkflow(pipelineKey),
      allSignatories,
      'par',
      { normalize: true }
    );
  }

  if (configuredTemplate && configuredTemplate.length > 0) {
    const chain: PARApprovalStep[] = [];
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

      const resolvedUid = matched?.id || tpl.signatoryUid || `par_step_${Date.now()}_${idx + 1}`;
      const resolvedName = matched?.name || tpl.signatoryName || tpl.roleTitle || 'Institutional Signatory';
      const resolvedEmail = matched?.email || tpl.signatoryEmail || '';
      const resolvedRole = matched?.role || tpl.role || 'signatory';
      const resolvedRoleTitle = matched?.roleTitle || tpl.roleTitle || 'Institutional Signatory';
      const resolvedDept = matched?.department || tpl.department || '';
      const isPermanent = Boolean(tpl.isPermanent);
      const isMandatory = Boolean(tpl.isMandatory || isPermanent);

      const resolvedLabel = (tpl as any).signatoryLabel || matched?.defaultSignatoryLabel || resolveSignatoryLabel({ role: resolvedRole, roleTitle: resolvedRoleTitle, actionType: tpl.actionType } as any, 'par', idx === configuredTemplate.length - 1);

      chain.push({
        id: tpl.id || `par_step_${idx + 1}`,
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
      return normalizeApprovalStages(enforceSinglePARApprover(chain));
    }
  }

  const stageSigners: {
    signer: InstitutionalSignatory;
    action: 'check' | 'endorse' | 'approve';
  }[] = [];

  const accountedSignatoryIds = new Set<string>();

  // 1. For Student Organizations: SAS Head Reviewer (Endorser — strictly 1 Final Approver at end)
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
      actionType: 'endorser',
    };
    stageSigners.push({ signer: sasSigner, action: 'endorse' });
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
  executiveHeads.forEach((sig, idx) => {
    const isFinalExec = idx === executiveHeads.length - 1;
    stageSigners.push({ signer: sig, action: isFinalExec ? 'approve' : 'endorse' });
    accountedSignatoryIds.add(sig.id);
  });

  // Fallback: If no recognized roles matched, add remaining active signers (only final is approver)
  if (stageSigners.length === 0) {
    activeSignatories.forEach((sig, idx) => {
      const isFinal = idx === activeSignatories!.length - 1;
      stageSigners.push({ signer: sig, action: isFinal ? 'approve' : 'endorse' });
    });
  }

  // Ensure there is strictly one approver
  let foundApprover = false;
  for (let i = stageSigners.length - 1; i >= 0; i--) {
    if (stageSigners[i].action === 'approve') {
      if (!foundApprover) foundApprover = true;
      else stageSigners[i].action = 'endorse';
    }
  }
  if (!foundApprover && stageSigners.length > 0) {
    stageSigners[stageSigners.length - 1].action = 'approve';
  }

  // ── 1 STAGE ONLY: All signatories in Stage 1 sign simultaneously in parallel ──
  const stageName = formatStageTitle(1, stageSigners.length);
  const chain: PARApprovalStep[] = stageSigners.map((item, idx) => {
    const isLast = idx === stageSigners.length - 1;
    const resolvedLabel = item.signer.defaultSignatoryLabel || resolveSignatoryLabel({ role: item.signer.role, roleTitle: item.signer.roleTitle, actionType: item.action } as any, 'par', isLast);
    return {
      id: `step-${Date.now()}-${idx + 1}`,
      step: idx + 1,
      stageIndex: 1,
      stageName,
      role: item.signer.role || 'signatory',
      roleTitle: item.signer.roleTitle || item.signer.title || 'Institutional Signatory',
      actionType: item.action,
      signatoryLabel: resolvedLabel,
      signatoryUid: item.signer.uid || item.signer.id,
      signatoryName: item.signer.name,
      signatoryEmail: item.signer.email,
      department: item.signer.department || '',
      status: 'current', // ALL ACTIVE SIMULTANEOUSLY!
      isMandatory: false,
      isPermanent: false,
    };
  });

  return normalizeApprovalStages(enforceSinglePARApprover(chain));
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

  const lStatus = (eventData.lifecycleStatus || eventData.status || eventData.proposalStatus || '')
    .toString()
    .toLowerCase();
  const isEventConcluded =
    lStatus === 'completed' ||
    lStatus === 'concluded' ||
    eventData.status === 'completed' ||
    eventData.proposalStatus === 'completed' ||
    eventData.isConcluded === true ||
    eventData.timingStatus === 'completed';

  if (!isEventConcluded) {
    throw new Error('A Post-Activity Report can only be created once the event has concluded.');
  }

  // Financial Liquidation (Form LF-01) is decoupled from PAR authoring/submission so both can proceed
  // simultaneously (or use Proposal Fallback projections when liquidation has not yet been approved).

  // ── STRICT 1:1:1 LIFECYCLE INVARIANT ──
  // An activity proposal can have at most ONE Post-Activity Report.
  if (!formData.id) {
    // 1. Check existing PARs collection for this eventId
    const existingParSnap = await getDocs(
      query(collection(db, PAR_COLLECTION), where('eventId', '==', formData.eventId))
    );
    const activeExistingPar = existingParSnap.docs.filter((d) => {
      const data = d.data();
      const st = (data.status || '').toLowerCase();
      return st !== 'cancelled' && st !== 'voided' && data.isDeleted !== true;
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
        const oldData = oldParSnap.data();
        const oldSt = (oldData.status || '').toLowerCase();
        if (oldSt !== 'cancelled' && oldSt !== 'voided' && oldData.isDeleted !== true) {
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

  // Resolve linked Financial Liquidation (LF-01) for 1:1:1 consistency & submission gate
  const activeLiqDoc = await fetchActiveEventLiquidation(
    formData.eventId,
    eventData.liquidationReportId || formData.liquidationId || ''
  );
  const targetLiquidationId = activeLiqDoc?.id || eventData.liquidationReportId || formData.liquidationId || '';
  const targetLiquidationRef = activeLiqDoc?.referenceNo || eventData.liquidationRefNumber || formData.liquidationRefNumber || '';

  if (submit) {
    const gate = evaluatePARLiquidationGate({
      event: eventData,
      liquidation: activeLiqDoc,
      isExempt: isEventLiquidationExempt(eventData),
    });
    if (!gate.allowedToSubmit) {
      throw new Error(gate.submitReason);
    }
  }

  const isOfficer = !isSasEvent && !isUserSas;
  const docId = formData.id || doc(collection(db, PAR_COLLECTION)).id;
  const parDocRef = doc(db, PAR_COLLECTION, docId);

  const referenceNo =
    formData.referenceNo ||
    (await generatePARReferenceNumber(isOfficer));

  // Generate dynamic approval chain if not provided & strictly enforce 1 approver
  let approvalChain = formData.approvalChain;
  if (!approvalChain || approvalChain.length === 0) {
    approvalChain = await generateDefaultPARSignatoryChain(eventData.hostingOrgId, undefined, isSasEvent);
  } else {
    const approverCount = approvalChain.filter((s) => s.actionType === 'approve').length;
    if (submit && approverCount > 1) {
      throw new Error('Only 1 Final Approver is permitted in the Post-Activity Report signatory pipeline.');
    }
    approvalChain = enforceSinglePARApprover(approvalChain);
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

  const resolvedSource =
    (formData as any).fundingSource ||
    eventData.fundingSource ||
    (isOfficer ? 'organization_funds' : 'school_budget');
  const isOrgDirectSas =
    resolvedSource === 'organization_funds' ||
    (isOfficer &&
      (resolvedSource === 'student_contributions' || resolvedSource === 'zero_budget'));
  const requiresSasPreApprovalGate = isOfficer && !isOrgDirectSas;

  if (submit && approvalChain && approvalChain.length > 0) {
    approvalChain = approvalChain.map((step: any) => {
      if (requiresSasPreApprovalGate) {
        return {
          ...step,
          status: 'waiting',
        };
      }
      const inStageOne = (step.stageIndex ?? 1) === 1;
      const isAlreadySigned = step.status === 'endorsed' || step.status === 'approved';
      return {
        ...step,
        status: isAlreadySigned ? step.status : inStageOne ? 'current' : 'waiting',
      };
    });
  }

  const computedParDeadline =
    (formData as any).submissionDeadline ||
    parSubmissionDeadline(eventData, formData as any) ||
    '';

  const activeMiscCtx =
    (!eventData.schoolYear && !(formData as any).schoolYear) ||
    (!eventData.semester && !(formData as any).semester)
      ? await getActiveMiscFeeAcademicContext()
      : null;

  const payload: any = cleanPayload({
    ...formData,
    id: docId,
    referenceNo,
    eventId: formData.eventId,
    eventTitle: eventData.title || formData.eventTitle || '',
    eventReferenceId: eventData.referenceId || '',
    liquidationId: targetLiquidationId,
    liquidationRefNumber: targetLiquidationRef,
    submissionDeadline: computedParDeadline || undefined,
    semesterId: eventData.semesterId || formData.semesterId || '',
    schoolYear: eventData.schoolYear || formData.schoolYear || activeMiscCtx?.schoolYear || '',
    semester: eventData.semester || formData.semester || activeMiscCtx?.semester || '',
    fundingSource: (formData as any).fundingSource || eventData.fundingSource || (isOfficer ? 'organization_funds' : 'school_budget'),
    isPendingSasVetting: submit ? requiresSasPreApprovalGate : false,
    sasVettedAt: null,
    sasVettedBy: null,

    organizationId: isSasEvent ? 'sas' : (eventData.hostingOrgId || formData.organizationId || ''),
    organizationName: isSasEvent ? 'Student Affairs Services (SAS)' : (eventData.hostingOrgName || formData.organizationName || ''),
    organizationAcronym: isSasEvent ? 'SAS' : (eventData.hostingOrgAcronym || formData.organizationAcronym || 'ORG'),
    createdByUid: formData.createdByUid || user.uid,
    createdByName: formData.createdByName || user.name,
    createdByEmail: formData.createdByEmail || user.email,
    creatorRole: isUserSas ? 'sas_admin' : (user.role === 'adviser' ? 'adviser' : 'officer'),
    isOfficerPar: isOfficer,
    isSasInternal: isSasEvent,
    visibility: isSasEvent ? 'sas_only' : 'owner_and_sas',

    proposalOrganizers: normalizeFlatStringArray((formData as any).proposalOrganizers),
    proposedMechanics: normalizeFlatStringArray((formData as any).proposedMechanics),
    proposalMaterials: normalizeFlatStringArray((formData as any).proposalMaterials),
    proposalMarketingPlan: normalizeFlatStringArray((formData as any).proposalMarketingPlan),
    proposalDocumentationPlan: normalizeFlatStringArray((formData as any).proposalDocumentationPlan),
    proposalObjectives: normalizeFlatStringArray((formData as any).proposalObjectives),
    proposalSuccessIndicators: normalizeFlatStringArray((formData as any).proposalSuccessIndicators),
    materialsUtilized: normalizeFlatStringArray((formData as any).materialsUtilized),
    marketingConducted: normalizeFlatStringArray((formData as any).marketingConducted),
    approvalChain: sanitizeFirestorePayload(approvalChain || []),
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
    payload.returnedSnapshot = existingParData.returnedSnapshot || existingParData.previousSnapshot || existingParClean;
    payload.previousSnapshot = deleteField();
    payload.dataSnapshot = deleteField();
    payload.revisionHistory = deleteField();
    payload.returnRemarks = null;
    payload.stepRevisionRemarks = null;
    payload.returnFlags = [];
    payload.returnDeadline = null;
    payload.isReturned = false;
    payload.returnedAt = null;

    const resubmissionNote = (formData as any).resubmissionNote || '';
    if (resubmissionNote) {
      payload.resubmissionNote = resubmissionNote;
    }

    const revisionEntry = sanitizeFirestorePayload({
      version: Number(existingParData.version || 1),
      versionLabel: `v${Number(existingParData.version || 1)}.0`,
      submittedAt: existingParData.submittedAt || null,
      submittedBy: existingParData.createdByName || user.name || 'Submitter',
      submittedByUid: existingParData.createdByUid || user.uid,
      returnedAt: existingParData.returnedAt || null,
      returnedBy: (existingParData as any).returnedByName || (existingParData as any).returnedBy || 'Reviewer',
      returnedByRoleTitle: (existingParData as any).returnedByRoleTitle || 'Signatory',
      returnRemarks: existingParData.returnRemarks || 'Revision requested.',
      stepRevisionRemarks: (existingParData as any).stepRevisionRemarks || {},
      returnFlags: (existingParData as any).returnFlags || [],
      resubmittedAt: new Date().toISOString(),
      resubmissionNote: resubmissionNote || `Resubmitted as v${currentVersion}.0`,
      dataSnapshot: existingParClean,
    });

    try {
      archiveDocumentRevision('post_activity_reports', docId, revisionEntry).catch((e) =>
        console.warn('[submitPostActivityReport] Subcollection archival warning:', e)
      );
    } catch {}
  }

  if (!formData.id) {
    payload.createdAt = serverTimestamp();
  }

  if (submit) {
    payload.submittedAt = serverTimestamp();
    const resubmissionNote = (formData as any).resubmissionNote || '';
    const submitRemark: PARRemark = {
      id: `rem-${Date.now()}`,
      authorName: user.name || 'Author',
      authorRole: isUserSas ? 'admin' : 'officer',
      action: 'submitted',
      comment: isResubmission
        ? resubmissionNote
          ? `Revision v${currentVersion}.0 resubmitted: ${resubmissionNote}. Route reset to Stage 1.`
          : `Post-Activity Report revised to v${currentVersion}.0 and resubmitted for Stage 1 review.`
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

  // Real-time submission notification to SAS Admin if submitted
  if (submit) {
    try {
      const orgName = payload.organizationAcronym || payload.organizationName || 'Student Organization';
      const eventTitle = payload.eventTitle || 'Post-Activity Report';
      await createNotification({
        recipientRole: 'admin',
        type: 'document_submission',
        category: 'post_activity_report',
        title: isResubmission
          ? `PAR Revised (v${currentVersion}.0): ${eventTitle}`
          : `Post-Activity Report Submitted: ${eventTitle}`,
        message: `${orgName} submitted Post-Activity Report (${referenceNo}) for "${eventTitle}".`,
        resourceId: docId,
        resourceType: 'par',
        actionRoute: `/home/post-activity-reports?id=${docId}`,
        targetOrgId: payload.organizationId,
        targetOrgName: orgName,
        senderId: user.uid,
        senderName: user.name,
      });
    } catch (notifErr) {
      console.warn('[saveOrSubmitPAR] Notification dispatch notice:', notifErr);
    }
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
    actionType?: 'check' | 'endorse' | 'approve' | 'note';
    canApprovePar?: boolean;
    approvalDecision?: 'approve' | 'forward';
  },
  remarks = '',
  approvalDecision?: 'approve' | 'forward'
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
  const wasAlreadyApproved = data.status === 'approved';

  const matchesSignatory = (s: any) => {
    if (signerUid && s.signatoryUid === signerUid) return true;
    if (signerEmail && s.signatoryEmail?.toLowerCase() === signerEmail) return true;
    if (signatory.role && s.role === signatory.role) return true;
    return false;
  };

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
    throw new Error('No pending approval step found for your account on this Post-Activity Report.');
  }

  const targetStep = chain[targetStepIdx];
  const stepAction = String(targetStep.actionType || '').toLowerCase().trim();
  const isStepEndorseOrCheck =
    stepAction === 'endorse' || stepAction === 'check' || stepAction === 'note';
  const isSchoolAdmin = targetStep.role === 'school_administrator' || signatory.role === 'school_administrator';
  const isPresident = targetStep.role === 'school_president' || signatory.role === 'school_president';
  const canApprove =
    !isStepEndorseOrCheck && canSignatoryApproveDocument(signatory as any, 'par', targetStep);
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

  // Stamp digital signature on step
  chain[targetStepIdx] = {
    ...chain[targetStepIdx],
    status: newStatus,
    signatoryUid: signerUid || chain[targetStepIdx].signatoryUid || '',
    signedByUid: signerUid || chain[targetStepIdx].signatoryUid || '',
    signatoryName: signatory.name || chain[targetStepIdx].signatoryName || '',
    signedByName: signatory.name || chain[targetStepIdx].signatoryName || '',
    signatoryEmail: signatory.email || chain[targetStepIdx].signatoryEmail || '',
    signedByEmail: signerEmail || chain[targetStepIdx].signatoryEmail || '',
    signatureUrl: signatory.signatureUrl || chain[targetStepIdx].signatureUrl,
    signedAt: new Date().toISOString(),
    remarks: remarks || chain[targetStepIdx].remarks,
  };

  // When executive approver signs off, keep remaining unsigned signatories active ('current') without waiving them
  if (newStatus === 'approved') {
    chain.forEach((s, idx) => {
      if (idx !== targetStepIdx && s.status === 'waiting') {
        chain[idx] = {
          ...s,
          status: 'current',
        };
      }
    });
  }

  const currentStageSteps = chain.filter((s) => (s.stageIndex ?? 1) === currentStage);
  const allStageStepsCompleted = currentStageSteps.every(
    (s) => s.status === 'endorsed' || s.status === 'approved' || s.status === 'waived'
  );

  let isFullyApproved = wasAlreadyApproved || newStatus === 'approved';
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

  if (isFullyApproved && !wasAlreadyApproved && data.eventId) {
    let parentEventData: any = null;
    try {
      const evSnap = await getDoc(doc(db, EVENTS_COLLECTION, data.eventId));
      if (evSnap.exists()) parentEventData = evSnap.data();
    } catch {}
    if (parentEventData) {
      const activeLiqDoc = await fetchActiveEventLiquidation(data.eventId, data.liquidationId);
      const gate = evaluatePARLiquidationGate({
        event: parentEventData,
        liquidation: activeLiqDoc,
        isExempt: isEventLiquidationExempt(parentEventData),
      });
      if (!gate.allowedToApprove) {
        throw new Error(gate.approveReason);
      }
    }
  }

  const endorsementRemark: PARRemark = {
    id: `rem-${Date.now()}`,
    authorName: signatory.name || 'Signatory',
    authorRole: 'signatory',
    action: newStatus === 'approved' ? 'approved' : 'endorsed',
    comment: remarks || (isFullyApproved && !wasAlreadyApproved ? 'Post-Activity Report fully cleared and approved.' : `Endorsed stage ${currentStage}.`),
    timestamp: new Date().toISOString(),
  };

  const updates: any = cleanPayload({
    approvalChain: chain,
    currentStepIndex: targetStepIdx + 1,
    currentStageIndex: nextStageIndex,
    status: isFullyApproved ? 'approved' : 'under_review',
    updatedAt: serverTimestamp(),
    remarksHistory: arrayUnion(sanitizeFirestorePayload(endorsementRemark)),
    ...(isFullyApproved && !wasAlreadyApproved
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

  // Cross-Module EDMS Auto-Archive upon initial final approval
  if (isFullyApproved && !wasAlreadyApproved) {
    try {
      await autoArchiveApprovedPAR(parId, { ...data, ...updates }, signerUid || signatory.email);
    } catch (archErr) {
      console.warn('[endorsePARStep] Approved report storage notice:', archErr);
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
  adminEmail?: string,
  stepRevisionRemarks?: Record<string, string>,
  returnFlags?: string[],
  returnDeadline?: string
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

  const effectiveDeadline =
    returnDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Capture clean snapshot of the PAR without recursive history to prevent 1MB limit errors
  const fullSnapshot = sanitizeFirestorePayload(sanitizeCleanDocumentSnapshot(data));

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
    stepRevisionRemarks: stepRevisionRemarks || {},
    returnFlags: returnFlags || [],
    returnDeadline: effectiveDeadline,
    previousSnapshot: fullSnapshot,
  });

  await updateDoc(parRef, sanitizeFirestorePayload({
    status: 'returned',
    isReturned: true,
    returnRemarks: remarks || 'Returned for revision.',
    stepRevisionRemarks: stepRevisionRemarks || null,
    returnFlags: returnFlags || [],
    returnDeadline: effectiveDeadline,
    returnedBy: adminUserId || 'reviewer',
    returnedByName: adminName || 'Signatory Reviewer',
    returnedByRoleTitle: adminRoleTitle || 'Signatory',
    returnedByEmail: adminEmail || null,
    returnedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    previousSnapshot: fullSnapshot,
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
 * Release a Post-Activity Report from SAS Pre-Approval Vetting Gate to Institutional Signatories.
 * (Or directly approve if Organization Internal Funds).
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
  const repSrc = (data as any).fundingSource;
  const isOrgFunds =
    repSrc === 'organization_funds' ||
    (Boolean((data as any).isOfficerPar) &&
      (repSrc === 'student_contributions' || repSrc === 'zero_budget')) ||
    ((data.approvalChain || []).length === 1 && (data.approvalChain || [])[0].role === 'sas_head');

  // If School Budget with Signatory Pipeline awaiting SAS clearance, release to Stage 1 Signatories!
  if (!isOrgFunds && (data as any).isPendingSasVetting === true && (data.approvalChain || []).length > 0) {
    const chain = (data.approvalChain || []).map((step) => ({
      ...step,
      status: (step.stageIndex ?? 1) === 1 ? ('current' as const) : ('waiting' as const),
    }));

    const releaseRemark: PARRemark = {
      id: `rem-${Date.now()}`,
      authorName: adminName || 'SAS Adviser',
      authorRole: 'admin',
      action: 'endorsed',
      comment: remarks || 'Cleared by SAS and released to Institutional Signatory Pipeline.',
      timestamp: new Date().toISOString(),
    };

    await updateDoc(parRef, sanitizeFirestorePayload({
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

  if (data.eventId) {
    let parentEventData: any = null;
    try {
      const evSnap = await getDoc(doc(db, EVENTS_COLLECTION, data.eventId));
      if (evSnap.exists()) parentEventData = evSnap.data();
    } catch {}
    if (parentEventData) {
      const activeLiqDoc = await fetchActiveEventLiquidation(data.eventId, data.liquidationId);
      const gate = evaluatePARLiquidationGate({
        event: parentEventData,
        liquidation: activeLiqDoc,
        isExempt: isEventLiquidationExempt(parentEventData),
      });
      if (!gate.allowedToApprove) {
        throw new Error(gate.approveReason);
      }
    }
  }

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
    isPendingSasVetting: false,
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

  // Archive in Reports & Analytics
  try {
    await autoArchiveApprovedPAR(parId, data, adminUserId);
  } catch (archErr) {
    console.warn('[approvePAR] Approved report storage notice:', archErr);
  }
}

/**
 * Moves a draft or unapproved Post-Activity Report document to Trash (soft delete).
 * Also cleanly resets the parId, parReferenceNo, and parStatus references on the parent event,
 * allowing the event to be cleanly re-processed under the 1:1:1 invariant.
 */
export async function deletePAR(
  parId: string,
  user?: { uid: string; name: string; role?: string },
  reason?: string
): Promise<boolean> {
  if (!parId) throw new Error('PAR ID is required.');
  const parRef = doc(db, PAR_COLLECTION, parId);
  const snap = await getDoc(parRef);
  if (!snap.exists()) return true;

  const data = snap.data() as PostActivityReportDocument;

  // 1. Move to Trash via soft delete
  await softDeleteDocument(
    PAR_COLLECTION as any,
    parId,
    user || { uid: 'system', name: 'User', role: 'Officer' },
    reason || 'Post-Activity Report draft discarded'
  );

  // 2. Cleanly reset references on parent event across both collections
  if (data.eventId) {
    try {
      for (const col of ['activities', 'events']) {
        const eventRef = doc(db, col, data.eventId);
        const evSnap = await getDoc(eventRef);
        if (evSnap.exists()) {
          await updateDoc(eventRef, {
            parId: null,
            parReferenceNo: null,
            parStatus: null,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) {
      console.warn('[deletePAR] Event unlink notice:', e);
    }
  }

  return true;
}

/**
 * Restores a soft-deleted Post-Activity Report document back to draft status.
 * Re-links parent event references.
 */
export async function restorePAR(
  parId: string,
  user: { uid: string; name: string; role?: string }
): Promise<void> {
  if (!parId) throw new Error('PAR ID is required.');
  const parRef = doc(db, PAR_COLLECTION, parId);
  const snap = await getDoc(parRef);
  const data = snap.exists() ? (snap.data() as PostActivityReportDocument) : null;

  await restoreDocument(PAR_COLLECTION as any, parId, user);

  // Re-link parent event
  if (data?.eventId) {
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, data.eventId);
      await updateDoc(eventRef, {
        parId,
        parReferenceNo: data.referenceNo || null,
        parStatus: data.status || 'draft',
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[restorePAR] Event relink notice:', e);
    }
  }
}
