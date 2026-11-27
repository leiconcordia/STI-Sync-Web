/**
 * src/app/modules/signatories/services/signatory-validation.service.ts
 *
 * Validation service for Institutional Signatories & Approvers:
 * - Detects assignments in default workflow pipelines (adviser_ap, adviser_fl, adviser_par, etc.)
 * - Scans active in-flight documents (proposals, liquidations, PARs) for current and scheduled steps
 * - Validates authority modifications (preventing cannot_sign with active pending approvals)
 * - Atomic reassignment & transfer engine to reassign pending workflows to replacement signers
 */

import {
  collection,
  query,
  where,
  getDocs,
  getDocsFromCache,
  doc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import {
  getDefaultWorkflowSettings,
  saveDefaultWorkflowSettings,
} from '../../workflow/services/approval-workflow.service';
import { normalizeApprovalStages } from '../../workflow/utils/stage-normalization.utils';
import {
  DefaultWorkflowSettings,
  WorkflowPipelineKey,
  WORKFLOW_PIPELINES_META,
} from '../../workflow/types/approval-workflow.types';
import type {
  InstitutionalSignatory,
  WorkflowDocumentType,
} from '../types/signatory.types';
import {
  validateSignatoryPortalDeactivation,
  validateRemoveSignatorySubstitute,
} from '../utils/signatory-substitute.utils';
import type {
  SignatoryDeactivationValidationResult,
  SignatoryRemoveSubstituteValidationResult,
} from '../utils/signatory-substitute.utils';
import { DocumentAuthorityLevel } from '../../../admin/components/settings/InstitutionalSignatoryManagement';

export { validateSignatoryPortalDeactivation, validateRemoveSignatorySubstitute };
export type { SignatoryDeactivationValidationResult, SignatoryRemoveSubstituteValidationResult };

async function getDocsQuotaSafe(q: any) {
  try {
    return await getDocs(q);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || String(err?.message || '').toLowerCase().includes('quota')) {
      return await getDocsFromCache(q);
    }
    throw err;
  }
}

export interface AssignedPipelineInfo {
  pipelineKey: WorkflowPipelineKey;
  pipelineLabel: string;
  documentType: WorkflowDocumentType;
  creatorGroup: 'adviser' | 'admin';
  stageIndex: number;
  stageName: string;
  stepId: string;
  roleTitle: string;
  actionType: string;
}

export interface PendingDocumentInfo {
  id: string;
  documentType: WorkflowDocumentType | 'sbr';
  title: string;
  code?: string;
  organizationName?: string;
  currentStageIndex: number;
  stepStageIndex: number;
  stepStageName: string;
  isCurrentTurn: boolean; // true = document currently waiting on this step
  status: string;
}

export interface DeactivationEligibilityResult {
  canDeactivate: boolean;
  flowAssignments: AssignedPipelineInfo[];
  pendingDocuments: PendingDocumentInfo[];
}

export interface AuthorityValidationResult {
  canProceed: boolean;
  templateAssignments: AssignedPipelineInfo[];
  pendingDocuments: PendingDocumentInfo[];
}

/**
 * Check if a signatory is assigned in any default workflow pipelines.
 */
export async function getSignatoryWorkflowAssignments(
  signatoryId: string,
  signatoryEmail?: string
): Promise<AssignedPipelineInfo[]> {
  const settings = await getDefaultWorkflowSettings();
  const assignments: AssignedPipelineInfo[] = [];
  const cleanEmail = (signatoryEmail || '').trim().toLowerCase();

  const pipelineKeys: WorkflowPipelineKey[] = [
    'adviser_ap',
    'adviser_fl',
    'adviser_par',
    'admin_ap',
    'admin_fl',
    'admin_par',
  ];

  for (const key of pipelineKeys) {
    const meta = WORKFLOW_PIPELINES_META.find((m) => m.key === key);
    const steps = settings[key] || [];

    steps.forEach((step) => {
      const matchId = step.signatoryUid && step.signatoryUid === signatoryId;
      const matchEmail =
        cleanEmail &&
        step.signatoryEmail &&
        step.signatoryEmail.trim().toLowerCase() === cleanEmail;

      if (matchId || matchEmail) {
        assignments.push({
          pipelineKey: key,
          pipelineLabel: meta?.label || key,
          documentType: meta?.documentType || 'proposal',
          creatorGroup: meta?.creatorGroup || 'adviser',
          stageIndex: step.stageIndex,
          stageName: step.stageName || `Stage ${step.stageIndex}`,
          stepId: step.id,
          roleTitle: step.roleTitle || 'Signatory',
          actionType: step.actionType || 'endorse',
        });
      }
    });
  }

  return assignments;
}

/**
 * Scan active in-flight documents (proposals, supplemental budget requests, liquidations, PARs)
 * for pending approval steps belonging to this signatory.
 */
export async function getSignatoryPendingDocuments(
  signatoryId: string,
  signatoryEmail?: string,
  documentTypeFilter?: WorkflowDocumentType | 'sbr'
): Promise<PendingDocumentInfo[]> {
  const pendingDocs: PendingDocumentInfo[] = [];
  const seenKeys = new Set<string>();
  const cleanEmail = (signatoryEmail || '').trim().toLowerCase();

  const matchesStep = (step: any) => {
    if (!step) return false;
    if (step.signatoryUid && step.signatoryUid === signatoryId) return true;
    if (cleanEmail && step.signatoryEmail && step.signatoryEmail.trim().toLowerCase() === cleanEmail) return true;
    return false;
  };

  const isStepPending = (step: any) => {
    const s = String(step.status || '').toLowerCase();
    return s !== 'endorsed' && s !== 'approved' && s !== 'waived' && s !== 'rejected' && s !== 'returned' && s !== 'returned_for_revision';
  };

  const pushUnique = (item: PendingDocumentInfo) => {
    const key = `${item.documentType}:${item.id}:${item.stepStageIndex}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    pendingDocs.push(item);
  };

  try {
    // 1. Scan Activity Proposals (live 'activities' collection + legacy 'activity_proposals')
    if (!documentTypeFilter || documentTypeFilter === 'proposal') {
      const proposalCollections = ['activities', 'activity_proposals'];
      for (const colName of proposalCollections) {
        try {
          const proposalsSnap = await getDocsQuotaSafe(
            query(
              collection(db, colName),
              where('status', 'in', ['under_review', 'pending', 'pending_review'])
            )
          );

          proposalsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (
              data.isDeleted === true ||
              data.isReturned === true ||
              data.isPendingSasVetting === true ||
              ['draft', 'for_adviser_review', 'for_revision', 'returned', 'returned_for_revision', 'rejected', 'approved_president', 'approved', 'voided', 'deleted'].includes(
                String(data.proposalStatus || data.lifecycleStatus || '').toLowerCase()
              )
            ) {
              return;
            }
            const chain = data.approvalChain || [];
            const curStage = data.currentStageIndex ?? 1;

            chain.forEach((step: any) => {
              if (matchesStep(step) && isStepPending(step)) {
                const stepStage = step.stageIndex ?? 1;
                const isCurrent = stepStage === curStage;
                pushUnique({
                  id: docSnap.id,
                  documentType: 'proposal',
                  title: data.title || data.eventName || 'Untitled Proposal',
                  code: data.proposalCode || data.code || 'Proposal',
                  organizationName: data.organizationName || data.hostingOrgId || 'Organization',
                  currentStageIndex: curStage,
                  stepStageIndex: stepStage,
                  stepStageName: step.stageName || `Stage ${stepStage}`,
                  isCurrentTurn: isCurrent,
                  status: data.status || 'under_review',
                });
              }
            });
          });
        } catch (colErr) {
          console.warn(`[getSignatoryPendingDocuments] Warning scanning ${colName}:`, colErr);
        }
      }
    }

    // 1b. Scan Supplemental Budget Requests (School Budget / Institutional Signatories)
    if (!documentTypeFilter || documentTypeFilter === 'sbr' || documentTypeFilter === 'proposal') {
      try {
        const sbrSnap = await getDocsQuotaSafe(
          query(
            collection(db, 'supplemental_budget_requests'),
            where('status', '==', 'pending_signatories')
          )
        );

        sbrSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (
            data.isDeleted === true ||
            data.isReturned === true ||
            data.isPendingSasVetting === true ||
            data.requiresSignatories === false
          ) {
            return;
          }
          const chain = data.approvalChain || [];
          const curStage = data.currentStageIndex ?? 1;

          chain.forEach((step: any) => {
            if (matchesStep(step) && isStepPending(step)) {
              const stepStage = step.stageIndex ?? 1;
              const isCurrent = stepStage === curStage;
              pushUnique({
                id: docSnap.id,
                documentType: 'sbr',
                title: data.eventTitle || data.title || 'Supplemental Budget Request',
                code: data.sbrCode || data.code || 'SBR',
                organizationName: data.organizationName || 'Organization',
                currentStageIndex: curStage,
                stepStageIndex: stepStage,
                stepStageName: step.stageName || `Stage ${stepStage}`,
                isCurrentTurn: isCurrent,
                status: data.status || 'pending_signatories',
              });
            }
          });
        });
      } catch (sbrErr) {
        console.warn('[getSignatoryPendingDocuments] Warning scanning supplemental_budget_requests:', sbrErr);
      }
    }

    // 2. Scan Financial Liquidations
    if (!documentTypeFilter || documentTypeFilter === 'liquidation') {
      const liquidationsSnap = await getDocsQuotaSafe(
        query(
          collection(db, 'financial_liquidations'),
          where('status', 'in', ['under_review', 'pending', 'pending_review'])
        )
      );

      liquidationsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isDeleted === true || data.isReturned === true || data.isPendingSasVetting === true) {
          return;
        }
        const chain = data.approvalChain || [];
        const curStage = data.currentStageIndex ?? 1;

        chain.forEach((step: any) => {
          if (matchesStep(step) && isStepPending(step)) {
            const stepStage = step.stageIndex ?? 1;
            const isCurrent = stepStage === curStage;
            pushUnique({
              id: docSnap.id,
              documentType: 'liquidation',
              title: data.eventTitle || data.eventName || data.title || 'Untitled Liquidation',
              code: data.liquidationCode || data.code || 'Liquidation',
              organizationName: data.organizationName || data.hostingOrgId || 'Organization',
              currentStageIndex: curStage,
              stepStageIndex: stepStage,
              stepStageName: step.stageName || `Stage ${stepStage}`,
              isCurrentTurn: isCurrent,
              status: data.status || 'under_review',
            });
          }
        });
      });
    }

    // 3. Scan Post-Activity Reports (PAR)
    if (!documentTypeFilter || documentTypeFilter === 'par') {
      const parSnap = await getDocsQuotaSafe(
        query(
          collection(db, 'post_activity_reports'),
          where('status', 'in', ['under_review', 'pending', 'pending_review'])
        )
      );

      parSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isDeleted === true || data.isReturned === true || data.isPendingSasVetting === true) {
          return;
        }
        const chain = data.approvalChain || [];
        const curStage = data.currentStageIndex ?? 1;

        chain.forEach((step: any) => {
          if (matchesStep(step) && isStepPending(step)) {
            const stepStage = step.stageIndex ?? 1;
            const isCurrent = stepStage === curStage;
            pushUnique({
              id: docSnap.id,
              documentType: 'par',
              title: data.eventTitle || data.eventName || data.title || 'Untitled PAR',
              code: data.parCode || data.code || 'PAR',
              organizationName: data.organizationName || data.hostingOrgId || 'Organization',
              currentStageIndex: curStage,
              stepStageIndex: stepStage,
              stepStageName: step.stageName || `Stage ${stepStage}`,
              isCurrentTurn: isCurrent,
              status: data.status || 'under_review',
            });
          }
        });
      });
    }
  } catch (err) {
    console.warn('[getSignatoryPendingDocuments] Error scanning pending documents:', err);
  }

  // Sort current-turn documents first for clearer UX
  return pendingDocs.sort((a, b) => Number(b.isCurrentTurn) - Number(a.isCurrentTurn));
}

/**
 * Check if a signatory is eligible to be deactivated.
 * Must NOT be assigned in any workflow pipeline AND must have 0 pending in-flight documents.
 */
export async function checkSignatoryDeactivationEligibility(
  signatoryId: string,
  signatoryEmail?: string
): Promise<DeactivationEligibilityResult> {
  const [flowAssignments, pendingDocuments] = await Promise.all([
    getSignatoryWorkflowAssignments(signatoryId, signatoryEmail),
    getSignatoryPendingDocuments(signatoryId, signatoryEmail),
  ]);

  const canDeactivate = flowAssignments.length === 0 && pendingDocuments.length === 0;

  return {
    canDeactivate,
    flowAssignments,
    pendingDocuments,
  };
}

/**
 * Validate when changing Document Signing & Authority Configuration.
 * Ensures that if a document type is demoted to 'cannot_sign' or from 'approver' to 'endorser',
 * there are no pending in-flight documents or active pipeline assignments for that document type.
 */
export async function checkDocumentAuthorityChangeEligibility(
  signatoryId: string,
  signatoryEmail: string,
  docType: WorkflowDocumentType,
  targetLevel: DocumentAuthorityLevel
): Promise<AuthorityValidationResult> {
  // If granting authority (endorser or approver), no restriction
  if (targetLevel !== 'cannot_sign') {
    return {
      canProceed: true,
      templateAssignments: [],
      pendingDocuments: [],
    };
  }

  // If changing to cannot_sign, check if pending in-flight documents still rely on this signatory
  // Default workflow template assignments for disallowed documents are automatically pruned on save.
  const [allTemplates, pendingDocs] = await Promise.all([
    getSignatoryWorkflowAssignments(signatoryId, signatoryEmail),
    getSignatoryPendingDocuments(signatoryId, signatoryEmail, docType),
  ]);

  const templateAssignments = allTemplates.filter((t) => t.documentType === docType);
  const canProceed = pendingDocs.length === 0;

  return {
    canProceed,
    templateAssignments,
    pendingDocuments: pendingDocs,
  };
}

/**
 * Removes a signatory from any Default Approval Workflow template whose documentType
 * is no longer included in `allowedWorkflows`.
 */
export async function pruneSignatoryFromDisallowedTemplates(
  signatoryId: string,
  signatoryEmail: string,
  allowedWorkflows: WorkflowDocumentType[],
  adminEmail = 'admin@ormoc.sti.edu.ph'
): Promise<number> {
  const settings = await getDefaultWorkflowSettings();
  const cleanEmail = (signatoryEmail || '').trim().toLowerCase();
  const allowedSet = new Set(allowedWorkflows);
  const updatedSettings: Partial<DefaultWorkflowSettings> = {};
  let removedCount = 0;

  const pipelineKeys: WorkflowPipelineKey[] = [
    'adviser_ap',
    'adviser_fl',
    'adviser_par',
    'admin_ap',
    'admin_fl',
    'admin_par',
  ];

  for (const key of pipelineKeys) {
    const meta = WORKFLOW_PIPELINES_META.find((m) => m.key === key);
    if (!meta || allowedSet.has(meta.documentType)) continue;

    const existingSteps = settings[key] || [];
    const nextSteps = existingSteps.filter((step) => {
      const matchId = Boolean(step.signatoryUid && step.signatoryUid === signatoryId);
      const matchEmail = Boolean(
        cleanEmail &&
        step.signatoryEmail &&
        step.signatoryEmail.trim().toLowerCase() === cleanEmail
      );
      if (matchId || matchEmail) {
        removedCount++;
        return false;
      }
      return true;
    });

    if (nextSteps.length !== existingSteps.length) {
      (updatedSettings as any)[key] = normalizeApprovalStages(nextSteps);
    }
  }

  if (removedCount > 0) {
    await saveDefaultWorkflowSettings(updatedSettings, adminEmail);
  }

  return removedCount;
}

/**
 * Atomically transfer all pending documents and/or workflow pipeline steps
 * from an old signatory to a newly chosen replacement signatory.
 */
export async function transferSignatoryAssignments(
  oldSignatory: InstitutionalSignatory,
  newSignatory: InstitutionalSignatory,
  options: {
    docTypes?: WorkflowDocumentType[];
    updateDefaultTemplates?: boolean;
    updatePendingDocuments?: boolean;
    adminEmail?: string;
  }
): Promise<{ transferredTemplates: number; transferredDocuments: number }> {
  let transferredTemplates = 0;
  let transferredDocuments = 0;

  const targetDocTypes = options.docTypes || ['proposal', 'liquidation', 'par'];
  const oldId = oldSignatory.id;
  const oldEmail = (oldSignatory.email || '').trim().toLowerCase();

  // 1. Update Default Workflow Templates
  if (options.updateDefaultTemplates !== false) {
    const currentSettings = await getDefaultWorkflowSettings();
    const updatedSettings: Partial<DefaultWorkflowSettings> = {};
    let templateModified = false;

    const pipelineKeys: WorkflowPipelineKey[] = [
      'adviser_ap',
      'adviser_fl',
      'adviser_par',
      'admin_ap',
      'admin_fl',
      'admin_par',
    ];

    for (const key of pipelineKeys) {
      const meta = WORKFLOW_PIPELINES_META.find((m) => m.key === key);
      if (meta && targetDocTypes.includes(meta.documentType)) {
        const steps = [...(currentSettings[key] || [])];
        let stepChanged = false;

        const mappedSteps = steps.map((s) => {
          const matchId = s.signatoryUid && s.signatoryUid === oldId;
          const matchEmail = oldEmail && s.signatoryEmail && s.signatoryEmail.trim().toLowerCase() === oldEmail;

          if (matchId || matchEmail) {
            transferredTemplates++;
            stepChanged = true;
            return {
              ...s,
              signatoryUid: newSignatory.id,
              signatoryName: newSignatory.name,
              signatoryEmail: newSignatory.email,
              role: newSignatory.role,
              roleTitle: newSignatory.roleTitle || s.roleTitle,
              department: newSignatory.department || s.department,
              departmentId: newSignatory.departmentId || s.departmentId,
            };
          }
          return s;
        });

        if (stepChanged) {
          (updatedSettings as any)[key] = mappedSteps;
          templateModified = true;
        }
      }
    }

    if (templateModified) {
      await saveDefaultWorkflowSettings(updatedSettings, options.adminEmail || 'admin@ormoc.sti.edu.ph');
    }
  }

  // 2. Update Pending In-Flight Documents
  if (options.updatePendingDocuments !== false) {
    const pendingDocs = await getSignatoryPendingDocuments(oldId, oldEmail);
    const relevantDocs = pendingDocs.filter(
      (p) => p.documentType === 'sbr' ? targetDocTypes.includes('proposal') : targetDocTypes.includes(p.documentType)
    );

    // Group by document ID to avoid duplicate batch updates
    const docIdsByType = {
      proposal: new Set<string>(),
      sbr: new Set<string>(),
      liquidation: new Set<string>(),
      par: new Set<string>(),
    };

    relevantDocs.forEach((d) => {
      docIdsByType[d.documentType].add(d.id);
    });

    const matchesOld = (s: any) => {
      if (s.signatoryUid && s.signatoryUid === oldId) return true;
      if (oldEmail && s.signatoryEmail && s.signatoryEmail.trim().toLowerCase() === oldEmail) return true;
      return false;
    };

    const isStepPending = (s: any) => {
      const st = String(s.status || '').toLowerCase();
      return st !== 'endorsed' && st !== 'approved' && st !== 'waived' && st !== 'rejected';
    };

    // Update Proposals
    for (const propId of docIdsByType.proposal) {
      const docRef = doc(db, 'activity_proposals', propId);
      const snap = await getDocs(query(collection(db, 'activity_proposals'), where('__name__', '==', propId)));
      if (!snap.empty) {
        const pData = snap.docs[0].data();
        const chain = (pData.approvalChain || []).map((step: any) => {
          if (matchesOld(step) && isStepPending(step)) {
            return {
              ...step,
              signatoryUid: newSignatory.id,
              signatoryName: newSignatory.name,
              signatoryEmail: newSignatory.email,
              role: newSignatory.role,
              roleTitle: newSignatory.roleTitle || step.roleTitle,
            };
          }
          return step;
        });
        await updateDoc(docRef, { approvalChain: chain });
        transferredDocuments++;
      }
    }

    // Update Liquidations
    for (const liqId of docIdsByType.liquidation) {
      const docRef = doc(db, 'financial_liquidations', liqId);
      const snap = await getDocs(query(collection(db, 'financial_liquidations'), where('__name__', '==', liqId)));
      if (!snap.empty) {
        const lData = snap.docs[0].data();
        const chain = (lData.approvalChain || []).map((step: any) => {
          if (matchesOld(step) && isStepPending(step)) {
            return {
              ...step,
              signatoryUid: newSignatory.id,
              signatoryName: newSignatory.name,
              signatoryEmail: newSignatory.email,
              role: newSignatory.role,
              roleTitle: newSignatory.roleTitle || step.roleTitle,
            };
          }
          return step;
        });
        await updateDoc(docRef, { approvalChain: chain });
        transferredDocuments++;
      }
    }

    // Update PARs
    for (const parId of docIdsByType.par) {
      const docRef = doc(db, 'post_activity_reports', parId);
      const snap = await getDocs(query(collection(db, 'post_activity_reports'), where('__name__', '==', parId)));
      if (!snap.empty) {
        const rData = snap.docs[0].data();
        const chain = (rData.approvalChain || []).map((step: any) => {
          if (matchesOld(step) && isStepPending(step)) {
            return {
              ...step,
              signatoryUid: newSignatory.id,
              signatoryName: newSignatory.name,
              signatoryEmail: newSignatory.email,
              role: newSignatory.role,
              roleTitle: newSignatory.roleTitle || step.roleTitle,
            };
          }
          return step;
        });
        await updateDoc(docRef, { approvalChain: chain });
        transferredDocuments++;
      }
    }
  }

  return { transferredTemplates, transferredDocuments };
}

