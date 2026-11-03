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
import type {
  DefaultWorkflowSettings,
  WorkflowPipelineKey,
  WorkflowStepTemplate,
} from '../types/approval-workflow.types';

const SETTINGS_COLLECTION = 'system_settings';
const WORKFLOWS_DOC_ID = 'default_approval_workflows';

export const BUILTIN_DEFAULT_WORKFLOWS: Record<WorkflowPipelineKey, WorkflowStepTemplate[]> = {
  // ── Club / Adviser Activity Proposals (AP) ──
  adviser_ap: [
    {
      id: 'step_adv_ap_1',
      step: 1,
      stageIndex: 1,
      stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
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
      stageName: 'Stage 2: Department & Program Endorsements',
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
      stageName: 'Stage 3: Institutional Review & Endorsements',
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
      stageName: 'Stage 4: Executive Administration & Approval',
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
      stageName: 'Stage 1: Department & Program Endorsements',
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
      stageName: 'Stage 2: Institutional Review & Endorsements',
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
      stageName: 'Stage 3: Executive Administration & Approval',
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
      stageName: 'Stage 1: Student Affairs & Services (SAS) Clearance',
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
      stageName: 'Stage 2: Financial Checking & Audit',
      role: 'accountant',
      roleTitle: 'Accountant / Internal Auditor',
      actionType: 'check',
      department: 'Finance & Accounting',
      isMandatory: true,
    },
    {
      id: 'step_adv_fl_3',
      step: 3,
      stageIndex: 3,
      stageName: 'Stage 3: Department & Program Endorsement',
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
      stageName: 'Stage 4: Academic Affairs Recommendation',
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
      stageName: 'Stage 5: Executive Administration & Presidential Approval',
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
      stageName: 'Stage 1: Financial Checking & Audit',
      role: 'accountant',
      roleTitle: 'Accountant / Internal Auditor',
      actionType: 'check',
      department: 'Finance & Accounting',
      isMandatory: true,
    },
    {
      id: 'step_adm_fl_2',
      step: 2,
      stageIndex: 2,
      stageName: 'Stage 2: Department & Program Endorsement',
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
      stageName: 'Stage 3: Academic Affairs Recommendation',
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
      stageName: 'Stage 4: Executive Administration & Presidential Approval',
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
      stageName: 'Stage 1: Student Affairs & Services (SAS) Clearance',
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
      stageName: 'Stage 2: Department & Program Clearance',
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
      stageName: 'Stage 3: Institutional Review & Academic Clearance',
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
      stageName: 'Stage 4: Executive Clearance & Final Approval',
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
      stageName: 'Stage 1: Department & Program Clearance',
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
      stageName: 'Stage 2: Institutional Review & Academic Clearance',
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
      stageName: 'Stage 3: Executive Clearance & Final Approval',
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
    adviser_ap: getBuiltinDefaultWorkflow('adviser_ap'),
    adviser_fl: getBuiltinDefaultWorkflow('adviser_fl'),
    adviser_par: getBuiltinDefaultWorkflow('adviser_par'),
    admin_ap: getBuiltinDefaultWorkflow('admin_ap'),
    admin_fl: getBuiltinDefaultWorkflow('admin_fl'),
    admin_par: getBuiltinDefaultWorkflow('admin_par'),
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
        adviser_ap: data.adviser_ap?.length ? data.adviser_ap : getBuiltinDefaultWorkflow('adviser_ap'),
        adviser_fl: data.adviser_fl?.length ? data.adviser_fl : getBuiltinDefaultWorkflow('adviser_fl'),
        adviser_par: data.adviser_par?.length ? data.adviser_par : getBuiltinDefaultWorkflow('adviser_par'),
        admin_ap: data.admin_ap?.length ? data.admin_ap : getBuiltinDefaultWorkflow('admin_ap'),
        admin_fl: data.admin_fl?.length ? data.admin_fl : getBuiltinDefaultWorkflow('admin_fl'),
        admin_par: data.admin_par?.length ? data.admin_par : getBuiltinDefaultWorkflow('admin_par'),
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
    [pipelineKey]: getBuiltinDefaultWorkflow(pipelineKey),
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
          adviser_ap: data.adviser_ap?.length ? data.adviser_ap : getBuiltinDefaultWorkflow('adviser_ap'),
          adviser_fl: data.adviser_fl?.length ? data.adviser_fl : getBuiltinDefaultWorkflow('adviser_fl'),
          adviser_par: data.adviser_par?.length ? data.adviser_par : getBuiltinDefaultWorkflow('adviser_par'),
          admin_ap: data.admin_ap?.length ? data.admin_ap : getBuiltinDefaultWorkflow('admin_ap'),
          admin_fl: data.admin_fl?.length ? data.admin_fl : getBuiltinDefaultWorkflow('admin_fl'),
          admin_par: data.admin_par?.length ? data.admin_par : getBuiltinDefaultWorkflow('admin_par'),
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
