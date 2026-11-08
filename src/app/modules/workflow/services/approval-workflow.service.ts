/**
 * src/app/modules/workflow/services/approval-workflow.service.ts
 *
 * Firestore persistence service for default institutional approval workflow pipelines across:
 * - Activity Proposals (AP)
 * - Financial Liquidations (FL)
 * - Post-Activity Reports (PAR)
 * for both Student Club/Adviser origin and Admin/SAS origin.
 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import {
  DefaultWorkflowSettings,
  WorkflowPipelineKey,
  WorkflowStepTemplate,
} from '../types/approval-workflow.types';
import { normalizeApprovalStages } from '../utils/stage-normalization.utils';

const SETTINGS_COLLECTION = 'system_settings';
const WORKFLOWS_DOC_ID = 'default_approval_workflows';

export const BUILTIN_DEFAULT_WORKFLOWS: Record<WorkflowPipelineKey, WorkflowStepTemplate[]> = {
  // ── Club / Adviser Activity Proposals (AP) ──
  adviser_ap: [
    {
      id: 'step_adv_ap_1',
      step: 1,
      stageIndex: 1,
      stageName: 'Stage 1 Signer',
      role: 'sas_head',
      roleTitle: 'Student Affairs & Services Head',
      actionType: 'endorse',
      department: 'Student Affairs & Services',
      isMandatory: true,
      isPermanent: true,
    },
    {
      id: 'step_adv_ap_2',
      step: 2,
      stageIndex: 2,
      stageName: 'Stage 2 Signers',
      role: 'program_head',
      roleTitle: 'Department Head / SHS Principal',
      actionType: 'endorse',
      department: 'Academic Department',
      isMandatory: true,
    },
    {
      id: 'step_adv_ap_3',
      step: 3,
      stageIndex: 3,
      stageName: 'Stage 3 Signers',
      role: 'academic_head',
      roleTitle: 'Academic Head',
      actionType: 'endorse',
      department: 'Academic Affairs',
      isMandatory: true,
    },
    {
      id: 'step_adv_ap_4',
      step: 4,
      stageIndex: 4,
      stageName: 'Stage 4 Signers',
      role: 'school_president',
      roleTitle: 'School President',
      actionType: 'approve',
      department: 'Office of the President',
      isMandatory: true,
      isPermanent: true,
    },
  ],

  // ── Admin / SAS Activity Proposals (AP) ──
  admin_ap: [
    {
      id: 'step_adm_ap_1',
      step: 1,
      stageIndex: 1,
      stageName: 'Stage 1 Signers',
      role: 'program_head',
      roleTitle: 'Department Head / SHS Principal',
      actionType: 'endorse',
      department: 'Academic Department',
      isMandatory: true,
    },
    {
      id: 'step_adm_ap_2',
      step: 2,
      stageIndex: 2,
      stageName: 'Stage 2 Signers',
      role: 'academic_head',
      roleTitle: 'Academic Head',
      actionType: 'endorse',
      department: 'Academic Affairs',
      isMandatory: true,
    },
    {
      id: 'step_adm_ap_3',
      step: 3,
      stageIndex: 3,
      stageName: 'Stage 3 Signers',
      role: 'school_president',
      roleTitle: 'School President',
      actionType: 'approve',
      department: 'Office of the President',
      isMandatory: true,
      isPermanent: true,
    },
  ],

  // ── Club / Adviser Financial Liquidations (FL) ──
  adviser_fl: [
    {
      id: 'step_adv_fl_1',
      step: 1,
      stageIndex: 1,
      stageName: 'Stage 1 Signer',
      role: 'sas_head',
      roleTitle: 'Student Affairs & Services Head',
      actionType: 'endorse',
      department: 'Student Affairs & Services',
      isMandatory: true,
      isPermanent: true,
    },
    {
      id: 'step_adv_fl_2',
      step: 2,
      stageIndex: 2,
      stageName: 'Stage 2 Signers',
      role: 'accountant',
      roleTitle: 'Accountant / Internal Auditor',
      actionType: 'endorse',
      department: 'Finance & Accounting',
      isMandatory: true,
    },
    {
      id: 'step_adv_fl_3',
      step: 3,
      stageIndex: 3,
      stageName: 'Stage 3 Signers',
      role: 'program_head',
      roleTitle: 'Program Head / Adviser',
      actionType: 'endorse',
      department: 'Academic Department',
      isMandatory: true,
    },
    {
      id: 'step_adv_fl_4',
      step: 4,
      stageIndex: 4,
      stageName: 'Stage 4 Signers',
      role: 'academic_head',
      roleTitle: 'Academic Head',
      actionType: 'endorse',
      department: 'Academic Affairs',
      isMandatory: true,
    },
    {
      id: 'step_adv_fl_5',
      step: 5,
      stageIndex: 5,
      stageName: 'Stage 5 Signers',
      role: 'school_president',
      roleTitle: 'School President',
      actionType: 'approve',
      department: 'Office of the President',
      isMandatory: true,
      isPermanent: true,
    },
  ],

  // ── Admin / SAS Financial Liquidations (FL) ──
  admin_fl: [
    {
      id: 'step_adm_fl_1',
      step: 1,
      stageIndex: 1,
      stageName: 'Stage 1 Signers',
      role: 'accountant',
      roleTitle: 'Accountant / Internal Auditor',
      actionType: 'endorse',
      department: 'Finance & Accounting',
      isMandatory: true,
    },
    {
      id: 'step_adm_fl_2',
      step: 2,
      stageIndex: 2,
      stageName: 'Stage 2 Signers',
      role: 'program_head',
      roleTitle: 'Program Head',
      actionType: 'endorse',
      department: 'Academic Department',
      isMandatory: true,
    },
    {
      id: 'step_adm_fl_3',
      step: 3,
      stageIndex: 3,
      stageName: 'Stage 3 Signers',
      role: 'academic_head',
      roleTitle: 'Academic Head',
      actionType: 'endorse',
      department: 'Academic Affairs',
      isMandatory: true,
    },
    {
      id: 'step_adm_fl_4',
      step: 4,
      stageIndex: 4,
      stageName: 'Stage 4 Signers',
      role: 'school_president',
      roleTitle: 'School President',
      actionType: 'approve',
      department: 'Office of the President',
      isMandatory: true,
      isPermanent: true,
    },
  ],

  // ── Club / Adviser Post-Activity Reports (PAR) ──
  adviser_par: [
    {
      id: 'step_adv_par_1',
      step: 1,
      stageIndex: 1,
      stageName: 'Stage 1 Signer',
      role: 'sas_head',
      roleTitle: 'Student Affairs & Services Head',
      actionType: 'approve',
      department: 'Student Affairs & Services',
      isMandatory: true,
      isPermanent: true,
    },
    {
      id: 'step_adv_par_2',
      step: 2,
      stageIndex: 2,
      stageName: 'Stage 2 Signers',
      role: 'program_head',
      roleTitle: 'Program Head / Adviser',
      actionType: 'endorse',
      department: 'Academic Department',
      isMandatory: true,
    },
    {
      id: 'step_adv_par_3',
      step: 3,
      stageIndex: 3,
      stageName: 'Stage 3 Signers',
      role: 'academic_head',
      roleTitle: 'Academic Head',
      actionType: 'endorse',
      department: 'Academic Affairs',
      isMandatory: true,
    },
    {
      id: 'step_adv_par_4',
      step: 4,
      stageIndex: 4,
      stageName: 'Stage 4 Signers',
      role: 'school_president',
      roleTitle: 'School President',
      actionType: 'approve',
      department: 'Office of the President',
      isMandatory: true,
      isPermanent: true,
    },
  ],

  // ── Admin / SAS Post-Activity Reports (PAR) ──
  admin_par: [
    {
      id: 'step_adm_par_1',
      step: 1,
      stageIndex: 1,
      stageName: 'Stage 1 Signers',
      role: 'program_head',
      roleTitle: 'Program Head',
      actionType: 'endorse',
      department: 'Academic Department',
      isMandatory: true,
    },
    {
      id: 'step_adm_par_2',
      step: 2,
      stageIndex: 2,
      stageName: 'Stage 2 Signers',
      role: 'academic_head',
      roleTitle: 'Academic Head',
      actionType: 'endorse',
      department: 'Academic Affairs',
      isMandatory: true,
    },
    {
      id: 'step_adm_par_3',
      step: 3,
      stageIndex: 3,
      stageName: 'Stage 3 Signers',
      role: 'school_president',
      roleTitle: 'School President',
      actionType: 'approve',
      department: 'Office of the President',
      isMandatory: true,
      isPermanent: true,
    },
  ],
};

let cachedWorkflowSettings: DefaultWorkflowSettings | null = null;

export function getBuiltinDefaultWorkflow(key: WorkflowPipelineKey): WorkflowStepTemplate[] {
  return JSON.parse(JSON.stringify(BUILTIN_DEFAULT_WORKFLOWS[key] || []));
}

export function getCachedWorkflowSettings(): DefaultWorkflowSettings {
  if (cachedWorkflowSettings) return cachedWorkflowSettings;
  return {
    adviser_ap: normalizeApprovalStages(getBuiltinDefaultWorkflow('adviser_ap')),
    adviser_fl: normalizeApprovalStages(getBuiltinDefaultWorkflow('adviser_fl')),
    adviser_par: normalizeApprovalStages(getBuiltinDefaultWorkflow('adviser_par')),
    admin_ap: normalizeApprovalStages(getBuiltinDefaultWorkflow('admin_ap')),
    admin_fl: normalizeApprovalStages(getBuiltinDefaultWorkflow('admin_fl')),
    admin_par: normalizeApprovalStages(getBuiltinDefaultWorkflow('admin_par')),
  };
}

/**
 * Fetch default workflow settings from Firestore, returning built-in defaults if not configured yet.
 */
export async function getDefaultWorkflowSettings(): Promise<DefaultWorkflowSettings> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, WORKFLOWS_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<DefaultWorkflowSettings>;
      const resolved: DefaultWorkflowSettings = {
        adviser_ap: normalizeApprovalStages(data.adviser_ap?.length ? data.adviser_ap : getBuiltinDefaultWorkflow('adviser_ap')),
        adviser_fl: normalizeApprovalStages(data.adviser_fl?.length ? data.adviser_fl : getBuiltinDefaultWorkflow('adviser_fl')),
        adviser_par: normalizeApprovalStages(data.adviser_par?.length ? data.adviser_par : getBuiltinDefaultWorkflow('adviser_par')),
        admin_ap: normalizeApprovalStages(data.admin_ap?.length ? data.admin_ap : getBuiltinDefaultWorkflow('admin_ap')),
        admin_fl: normalizeApprovalStages(data.admin_fl?.length ? data.admin_fl : getBuiltinDefaultWorkflow('admin_fl')),
        admin_par: normalizeApprovalStages(data.admin_par?.length ? data.admin_par : getBuiltinDefaultWorkflow('admin_par')),
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
      cachedWorkflowSettings = resolved;
      return resolved;
    }
  } catch (err) {
    console.warn('[getDefaultWorkflowSettings] Error fetching workflow settings from Firestore:', err);
  }

  const fallback = getCachedWorkflowSettings();
  cachedWorkflowSettings = fallback;
  return fallback;
}

/**
 * Persist workflow settings into Firestore.
 */
export async function saveDefaultWorkflowSettings(
  settings: Partial<DefaultWorkflowSettings>,
  userEmail = 'admin@ormoc.sti.edu.ph'
): Promise<void> {
  const docRef = doc(db, SETTINGS_COLLECTION, WORKFLOWS_DOC_ID);
  const current = await getDefaultWorkflowSettings();
  const merged: DefaultWorkflowSettings = {
    ...current,
    ...settings,
    ...(settings.adviser_ap ? { adviser_ap: normalizeApprovalStages(settings.adviser_ap) } : {}),
    ...(settings.adviser_fl ? { adviser_fl: normalizeApprovalStages(settings.adviser_fl) } : {}),
    ...(settings.adviser_par ? { adviser_par: normalizeApprovalStages(settings.adviser_par) } : {}),
    ...(settings.admin_ap ? { admin_ap: normalizeApprovalStages(settings.admin_ap) } : {}),
    ...(settings.admin_fl ? { admin_fl: normalizeApprovalStages(settings.admin_fl) } : {}),
    ...(settings.admin_par ? { admin_par: normalizeApprovalStages(settings.admin_par) } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: userEmail,
  };
  await setDoc(docRef, merged, { merge: true });
  cachedWorkflowSettings = merged;
}

/**
 * Reset a specific workflow pipeline to its built-in institutional default.
 */
export async function resetWorkflowPipeline(
  pipelineKey: WorkflowPipelineKey,
  userEmail = 'admin@ormoc.sti.edu.ph'
): Promise<DefaultWorkflowSettings> {
  const current = await getDefaultWorkflowSettings();
  const updated: DefaultWorkflowSettings = {
    ...current,
    [pipelineKey]: normalizeApprovalStages(getBuiltinDefaultWorkflow(pipelineKey)),
    updatedAt: serverTimestamp(),
    updatedBy: userEmail,
  };
  const docRef = doc(db, SETTINGS_COLLECTION, WORKFLOWS_DOC_ID);
  await setDoc(docRef, updated, { merge: true });
  cachedWorkflowSettings = updated;
  return updated;
}

/**
 * Subscribe to real-time changes of default workflow settings.
 */
export function subscribeToDefaultWorkflowSettings(
  callback: (settings: DefaultWorkflowSettings) => void
): () => void {
  const docRef = doc(db, SETTINGS_COLLECTION, WORKFLOWS_DOC_ID);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<DefaultWorkflowSettings>;
        const resolved: DefaultWorkflowSettings = {
          adviser_ap: normalizeApprovalStages(data.adviser_ap?.length ? data.adviser_ap : getBuiltinDefaultWorkflow('adviser_ap')),
          adviser_fl: normalizeApprovalStages(data.adviser_fl?.length ? data.adviser_fl : getBuiltinDefaultWorkflow('adviser_fl')),
          adviser_par: normalizeApprovalStages(data.adviser_par?.length ? data.adviser_par : getBuiltinDefaultWorkflow('adviser_par')),
          admin_ap: normalizeApprovalStages(data.admin_ap?.length ? data.admin_ap : getBuiltinDefaultWorkflow('admin_ap')),
          admin_fl: normalizeApprovalStages(data.admin_fl?.length ? data.admin_fl : getBuiltinDefaultWorkflow('admin_fl')),
          admin_par: normalizeApprovalStages(data.admin_par?.length ? data.admin_par : getBuiltinDefaultWorkflow('admin_par')),
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
        };
        cachedWorkflowSettings = resolved;
        callback(resolved);
      } else {
        const fallback = getCachedWorkflowSettings();
        cachedWorkflowSettings = fallback;
        callback(fallback);
      }
    },
    (err) => {
      console.warn('[subscribeToDefaultWorkflowSettings] Snapshot error:', err);
      callback(getCachedWorkflowSettings());
    }
  );
}

/**
 * Determines whether a given approval step is configured as permanent in institutional settings.
 * A step is strictly permanent ONLY if:
 * 1. For officer activity proposals (AP), it is the built-in SAS Gatekeeper (sas_head/sas_coordinator).
 * 2. OR it matches an institutional step explicitly configured with `isPermanent: true` in the active pipeline's template.
 * Steps added by document proponents or creators are NEVER permanent.
 */
export function isStepConfiguredPermanent(
  step: {
    id?: string;
    signatoryUid?: string;
    signatoryEmail?: string;
    role?: string;
    isPermanent?: boolean;
    isUserAdded?: boolean;
    stageIndex?: number;
  },
  pipelineKey: WorkflowPipelineKey,
  settings?: DefaultWorkflowSettings | null,
  isOfficerAp = false
): boolean {
  // 1. Proponent-added custom signers are strictly NEVER permanent and can ALWAYS be removed
  if (
    step.isUserAdded ||
    (step.id && (
      step.id.startsWith('liq_step_') ||
      step.id.startsWith('par_step_') ||
      step.id.startsWith('prop_step_') ||
      step.id.startsWith('custom_sig_') ||
      step.id.startsWith('custom_')
    ))
  ) {
    return false;
  }

  // 2. Fixed SAS Gatekeeper for officer proposals (only template-provided gatekeeper, not proponent-added)
  if (isOfficerAp && (step.role === 'sas_head' || step.role === 'sas_coordinator')) {
    return true;
  }

  // 3. Resolve active pipeline settings with fallback to alternate pipeline key if primary has no signers
  const hasAssignedSigners = (steps?: any[]) =>
    Array.isArray(steps) && steps.some((s) => Boolean(s.signatoryUid || s.signatoryName));

  const effectiveSettings = settings || getCachedWorkflowSettings();
  let templateSteps = effectiveSettings?.[pipelineKey];

  if (!hasAssignedSigners(templateSteps)) {
    let alternateKey: WorkflowPipelineKey | null = null;
    if (pipelineKey === 'admin_fl') alternateKey = 'adviser_fl';
    else if (pipelineKey === 'adviser_fl') alternateKey = 'admin_fl';
    else if (pipelineKey === 'admin_ap') alternateKey = 'adviser_ap';
    else if (pipelineKey === 'adviser_ap') alternateKey = 'admin_ap';
    else if (pipelineKey === 'admin_par') alternateKey = 'adviser_par';
    else if (pipelineKey === 'adviser_par') alternateKey = 'admin_par';

    if (alternateKey && hasAssignedSigners(effectiveSettings?.[alternateKey])) {
      templateSteps = effectiveSettings?.[alternateKey];
    }
  }

  if (!templateSteps || !Array.isArray(templateSteps) || templateSteps.length === 0) {
    return false;
  }

  // 4. Strict identity-based matching for permanent template steps
  return templateSteps.some((tpl) => {
    if (!tpl.isPermanent) return false;

    // A. Match by exact signatoryUid
    if (tpl.signatoryUid && step.signatoryUid && tpl.signatoryUid === step.signatoryUid) {
      return true;
    }

    // B. Match by exact email
    if (
      tpl.signatoryEmail &&
      step.signatoryEmail &&
      tpl.signatoryEmail.trim().toLowerCase() === step.signatoryEmail.trim().toLowerCase()
    ) {
      return true;
    }

    // C. Generic role placeholder matching (only if template has NO specific person assigned)
    if (!tpl.signatoryUid && !tpl.signatoryEmail) {
      if (tpl.id && step.id && tpl.id === step.id) {
        return true;
      }
    }

    return false;
  });
}

