/**
 * src/app/modules/signatories/types/signatory-label.types.ts
 *
 * Types and default seeds for dynamic institutional signatory document labels.
 */

export interface SignatoryLabelDocument {
  id: string;
  label: string; // e.g. "Checked by:", "Approved by:"
  description: string; // e.g. "Auditor / Accountant / Finance review"
  actionType: 'check' | 'endorse' | 'approve' | 'note';
  isApproverLabel: boolean; // true if this label conveys final executive approval
  orderIndex: number;
  isActive: boolean;
  isSystemDefault: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type CreateSignatoryLabelPayload = Omit<
  SignatoryLabelDocument,
  'id' | 'createdAt' | 'updatedAt' | 'isSystemDefault'
> & {
  isSystemDefault?: boolean;
};

export type UpdateSignatoryLabelPayload = Partial<
  Omit<SignatoryLabelDocument, 'id' | 'createdAt' | 'updatedAt'>
>;

export const DEFAULT_SIGNATORY_LABELS: Omit<SignatoryLabelDocument, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    label: 'Checked by:',
    description: 'Auditor / Accountant / Finance review',
    actionType: 'check',
    isApproverLabel: false,
    orderIndex: 1,
    isActive: true,
    isSystemDefault: true,
  },
  {
    label: 'Endorsed by:',
    description: 'Program Head / SAS / Adviser',
    actionType: 'endorse',
    isApproverLabel: false,
    orderIndex: 2,
    isActive: true,
    isSystemDefault: true,
  },
  {
    label: 'Recommending Approval:',
    description: 'Academic Head / Dean / Principal',
    actionType: 'endorse',
    isApproverLabel: false,
    orderIndex: 3,
    isActive: true,
    isSystemDefault: true,
  },
  {
    label: 'Approved by:',
    description: 'School Administrator / President approval',
    actionType: 'approve',
    isApproverLabel: true,
    orderIndex: 4,
    isActive: true,
    isSystemDefault: true,
  },
  {
    label: 'Noted by:',
    description: 'Executive oversight / Administration note',
    actionType: 'note',
    isApproverLabel: false,
    orderIndex: 5,
    isActive: true,
    isSystemDefault: true,
  },
  {
    label: 'Verified by:',
    description: 'Documentation / Records verification',
    actionType: 'check',
    isApproverLabel: false,
    orderIndex: 6,
    isActive: true,
    isSystemDefault: true,
  },
  {
    label: 'Submitted by:',
    description: 'Officer / Activity Proponent submission',
    actionType: 'endorse',
    isApproverLabel: false,
    orderIndex: 7,
    isActive: true,
    isSystemDefault: true,
  },
  {
    label: 'Prepared by:',
    description: 'Treasurer / Organizer preparation',
    actionType: 'endorse',
    isApproverLabel: false,
    orderIndex: 8,
    isActive: true,
    isSystemDefault: true,
  },
];

