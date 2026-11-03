/**
 * src/app/modules/workflow/types/approval-workflow.types.ts
 *
 * Types for default institutional approval workflow pipelines across:
 * - Activity Proposals (AP)
 * - Financial Liquidations (FL)
 * - Post-Activity Reports (PAR)
 * for both Student Club/Adviser origin and Admin/SAS origin.
 */

export interface WorkflowStepTemplate {
  id: string;
  step: number;
  stageIndex: number;
  stageName: string;
  signatoryUid?: string; // Appointed specific institutional signer (if fixed)
  signatoryName?: string;
  signatoryEmail?: string;
  role: string;
  roleTitle: string;
  actionType: 'check' | 'endorse' | 'approve';
  department?: string;
  departmentId?: string;
  isMandatory?: boolean;
  isPermanent?: boolean;
}

export interface DefaultWorkflowSettings {
  adviser_ap: WorkflowStepTemplate[];
  adviser_fl: WorkflowStepTemplate[];
  adviser_par: WorkflowStepTemplate[];
  admin_ap: WorkflowStepTemplate[];
  admin_fl: WorkflowStepTemplate[];
  admin_par: WorkflowStepTemplate[];
  updatedAt?: any;
  updatedBy?: string;
}

export type WorkflowPipelineKey = keyof Omit<DefaultWorkflowSettings, 'updatedAt' | 'updatedBy'>;

export interface WorkflowPipelineMeta {
  key: WorkflowPipelineKey;
  label: string;
  creatorGroup: 'adviser' | 'admin';
  documentType: 'proposal' | 'liquidation' | 'par';
  description: string;
}

export const WORKFLOW_PIPELINES_META: WorkflowPipelineMeta[] = [
  {
    key: 'adviser_ap',
    label: 'Club / Adviser Activity Proposal (AP)',
    creatorGroup: 'adviser',
    documentType: 'proposal',
    description: 'Pipeline for activity proposals submitted by student organizations and club advisers.',
  },
  {
    key: 'adviser_fl',
    label: 'Club / Adviser Financial Liquidation (FL)',
    creatorGroup: 'adviser',
    documentType: 'liquidation',
    description: 'Pipeline for financial liquidations submitted by student organizations and club advisers.',
  },
  {
    key: 'adviser_par',
    label: 'Club / Adviser Post-Activity Report (PAR)',
    creatorGroup: 'adviser',
    documentType: 'par',
    description: 'Pipeline for post-activity reports submitted by student organizations and club advisers.',
  },
  {
    key: 'admin_ap',
    label: 'Admin / SAS Activity Proposal (AP)',
    creatorGroup: 'admin',
    documentType: 'proposal',
    description: 'Pipeline for institutional activity proposals initiated directly by Student Affairs & Services (SAS).',
  },
  {
    key: 'admin_fl',
    label: 'Admin / SAS Financial Liquidation (FL)',
    creatorGroup: 'admin',
    documentType: 'liquidation',
    description: 'Pipeline for financial liquidations initiated directly by SAS or campus administration.',
  },
  {
    key: 'admin_par',
    label: 'Admin / SAS Post-Activity Report (PAR)',
    creatorGroup: 'admin',
    documentType: 'par',
    description: 'Pipeline for post-activity reports initiated directly by SAS or campus administration.',
  },
];

