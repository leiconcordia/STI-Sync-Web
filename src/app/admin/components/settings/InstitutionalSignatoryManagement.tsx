/**
 * src/app/admin/components/settings/InstitutionalSignatoryManagement.tsx
 *
 * Admin management panel for institutional signatories, approvers, and executive endorsers.
 * Supports adding new signers with automated Firebase Auth provisioning & credential dispatch.
 */

import React, { useState, useEffect } from 'react';
import {
  FileSignature,
  Plus,
  Search,
  ShieldCheck,
  Mail,
  Key,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Copy,
  Edit2,
  Eye,
  X,
  UserCheck,
  Building,
  User,
  Layers,
  SlidersHorizontal,
  Trash2,
  Tag,
  Award,
  Ban,
  Lock,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  subscribeToSignatories,
  createInstitutionalSignatory,
  toggleSignatoryStatus,
  updateSignatoryDetails,
  generateTemporaryPassword,
} from '../../../modules/signatories/services/signatory.service';
import {
  checkSignatoryDeactivationEligibility,
  checkDocumentAuthorityChangeEligibility,
  type AssignedPipelineInfo,
  type PendingDocumentInfo,
} from '../../../modules/signatories/services/signatory-validation.service';
import { DeactivationBlockModal } from './signatories/DeactivationBlockModal';
import { AuthorityConflictModal } from './signatories/AuthorityConflictModal';
import {
  SIGNATORY_ROLES,
  type InstitutionalSignatory,
  type SignatoryRole,
  type CreateSignatoryPayload,
  type SignatoryDocumentScope,
  type WorkflowDocumentType,
  getSignatoryAuthorizedWorkflows,
} from '../../../modules/signatories/types/signatory.types';
import { formatStructuredFullName, parseFullNameToParts } from '../../../utils/name.utils';
import { useSignatoryRolesStream } from '../../../modules/signatories/hooks/useSignatoryRolesStream';
import {
  createSignatoryRole,
  updateSignatoryRole,
  archiveSignatoryRole,
} from '../../../modules/signatories/services/signatory-role.service';
import type {
  SignatoryRoleDocument,
  CreateSignatoryRolePayload,
} from '../../../modules/signatories/types/signatory-role.types';
import { useAdviserProfile } from '../../../modules/auth';
import { ResetPasswordModal } from '../../../modules/accounts/components/ResetPasswordModal';
import { useDepartments } from '../../../modules/academic';
import { SIGNATORY_LABEL_OPTIONS } from '../../../modules/signatories/utils/signatory-label.utils';
import {
  useSignatoryLabelsStream,
  createSignatoryLabel,
  updateSignatoryLabel,
  deleteSignatoryLabel,
  toggleSignatoryLabelStatus,
  type SignatoryLabelDocument,
  type CreateSignatoryLabelPayload,
} from '../../../modules/signatories';

export type DocumentAuthorityLevel = 'cannot_sign' | 'endorser' | 'approver';

export interface DocumentWorkflowConfig {
  key: WorkflowDocumentType;
  title: string;
  code: string;
  badge: string;
  description: string;
}

export const DOCUMENT_WORKFLOW_CONFIGS: DocumentWorkflowConfig[] = [
  {
    key: 'proposal',
    title: 'ACTIVITY PROPOSALS (AP-01)',
    code: 'AP-01',
    badge: 'Events & Programs',
    description: 'Student activities, campus events, and organizational initiatives.',
  },
  {
    key: 'liquidation',
    title: 'FINANCIAL LIQUIDATIONS (FL-01)',
    code: 'FL-01',
    badge: 'Cash & Expenses',
    description: 'Expense receipts, cash advance liquidation, and financial audits.',
  },
  {
    key: 'par',
    title: 'POST-ACTIVITY REPORTS (PAR-01)',
    code: 'PAR-01',
    badge: 'Outcome & Metrics',
    description: 'Post-event documentation, student attendance, and evaluation.',
  },
];

export const getDocAuthority = (
  workflows: WorkflowDocumentType[] | undefined,
  canApprove: boolean | undefined,
  doc: WorkflowDocumentType
): DocumentAuthorityLevel => {
  if (!workflows || !workflows.includes(doc)) {
    return 'cannot_sign';
  }
  return canApprove ? 'approver' : 'endorser';
};

export default function InstitutionalSignatoryManagement() {
  const { profile } = useAdviserProfile();
  const { roles: dbRoles, loading: rolesLoading } = useSignatoryRolesStream();
  const { data: departments = [] } = useDepartments();
  const activeDepartments = React.useMemo(() => departments.filter((d) => !d.archived), [departments]);

  // View Tabs: Directory vs Signatory Labels Maintenance
  const [activeTab, setActiveTab] = useState<'signatories' | 'labels'>('signatories');
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);
  const [resetTarget, setResetTarget] = useState<InstitutionalSignatory | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');

  // Dynamic Signatory Labels Stream
  const { labels: signatoryLabels, activeLabels, loading: labelsLoading } = useSignatoryLabelsStream();
  const [labelSearchQuery, setLabelSearchQuery] = useState('');
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<SignatoryLabelDocument | null>(null);
  const [labelFormData, setLabelFormData] = useState<CreateSignatoryLabelPayload>({
    label: '',
    description: '',
    actionType: 'endorse',
    isApproverLabel: false,
    orderIndex: 99,
    isActive: true,
  });
  const [isLabelSubmitting, setIsLabelSubmitting] = useState(false);

  // Modals for Signatories
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSignatory, setEditingSignatory] = useState<InstitutionalSignatory | null>(null);
  const [previewSignatureUrl, setPreviewSignatureUrl] = useState<string | null>(null);
  const [credentialsSuccess, setCredentialsSuccess] = useState<{
    name: string;
    email: string;
    roleTitle: string;
    temporaryPassword: string;
  } | null>(null);

  // Validation & Reassignment Modals State
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [deactivationBlock, setDeactivationBlock] = useState<{
    signatory: InstitutionalSignatory;
    flowAssignments: AssignedPipelineInfo[];
    pendingDocuments: PendingDocumentInfo[];
  } | null>(null);
  const [authorityConflict, setAuthorityConflict] = useState<{
    signatory: InstitutionalSignatory;
    docType: WorkflowDocumentType;
    targetLevel: DocumentAuthorityLevel;
    templateAssignments: AssignedPipelineInfo[];
    pendingDocuments: PendingDocumentInfo[];
  } | null>(null);

  // Form state for Add/Edit Signatory
  const [formData, setFormData] = useState<CreateSignatoryPayload>({
    name: '',
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    role: '',
    roleTitle: '',
    actionType: 'endorser',
    applicableScope: 'all',
    applicableWorkflows: ['proposal', 'liquidation', 'par'],
    employeeId: '',
    temporaryPassword: '',
    isPermanentSigner: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals for Roles
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<SignatoryRoleDocument | null>(null);
  const [roleFormData, setRoleFormData] = useState<CreateSignatoryRolePayload>({
    name: '',
    code: '',
    description: '',
    hierarchyLevel: 2,
    scope: 'department',
    actionType: 'endorse',
    isFinalApprover: false,
    isMandatory: true,
    defaultTitle: '',
    defaultDepartment: '',
  });
  const [isRoleSubmitting, setIsRoleSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToSignatories((list) => {
      setSignatories(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      firstName: '',
      lastName: '',
      middleName: '',
      email: '',
      role: '',
      roleTitle: '',
      actionType: 'endorser',
      applicableScope: 'all',
      applicableWorkflows: ['proposal', 'liquidation', 'par'],
      employeeId: '',
      department: '',
      departmentId: '',
      temporaryPassword: generateTemporaryPassword(),
      isPermanentSigner: false,
      defaultSignatoryLabel: 'Endorsed by:',
      canApproveProposal: false,
      canApproveLiquidation: false,
      canApprovePar: false,
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (sig: InstitutionalSignatory) => {
    const isAcct =
      (sig.role || '').toLowerCase() === 'accountant' ||
      (sig.roleTitle || '').toLowerCase().includes('accountant') ||
      (sig.roleTitle || '').toLowerCase().includes('auditor');

    const resolvedWorkflows: WorkflowDocumentType[] = isAcct
      ? ['liquidation']
      : getSignatoryAuthorizedWorkflows(sig);

    const parsed = parseFullNameToParts(sig.name || '');
    const firstName = sig.firstName || parsed.firstName;
    const lastName = sig.lastName || parsed.lastName;
    const middleName = sig.middleName ?? sig.middleInitial ?? parsed.middleInitial;
    const combinedName = formatStructuredFullName(firstName, lastName, middleName) || sig.name || '';

    setEditingSignatory({
      ...sig,
      firstName,
      lastName,
      middleName,
      name: combinedName,
      applicableScope: isAcct ? 'liquidation_only' : (sig.applicableScope || 'all'),
      applicableWorkflows: resolvedWorkflows,
      defaultSignatoryLabel: sig.defaultSignatoryLabel || (sig.role === 'school_president' ? 'Approved by:' : 'Endorsed by:'),
      canApproveProposal: sig.canApproveProposal ?? (sig.role === 'school_president' || sig.actionType === 'approver'),
      canApproveLiquidation: sig.canApproveLiquidation ?? (sig.role === 'school_president' || sig.actionType === 'approver'),
      canApprovePar: sig.canApprovePar ?? (sig.role === 'school_president' || sig.actionType === 'approver'),
    });
  };

  const handleOpenAddRoleModal = () => {
    setRoleFormData({
      name: '',
      code: '',
      description: '',
      hierarchyLevel: 2,
      scope: 'department',
      actionType: 'endorse',
      isFinalApprover: false,
      isMandatory: true,
      defaultTitle: '',
      defaultDepartment: '',
    });
    setIsAddRoleModalOpen(true);
  };

  const handleAddRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleFormData.name.trim()) {
      toast.error('Please enter a role name.');
      return;
    }
    const generatedCode =
      roleFormData.code.trim() ||
      roleFormData.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    setIsRoleSubmitting(true);
    try {
      const res = await createSignatoryRole(
        {
          ...roleFormData,
          code: generatedCode,
          defaultTitle: roleFormData.defaultTitle.trim() || roleFormData.name.trim(),
        },
        profile?.uid || 'admin'
      );
      if (res.success) {
        setIsAddRoleModalOpen(false);
        toast.success(`Signatory role "${roleFormData.name}" created successfully!`);
      } else {
        toast.error(res.error || 'Failed to create signatory role.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'An error occurred.');
    } finally {
      setIsRoleSubmitting(false);
    }
  };

  const handleEditRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;
    setIsRoleSubmitting(true);
    try {
      await updateSignatoryRole(editingRole.id, {
        name: editingRole.name,
        code: editingRole.code,
        description: editingRole.description,
        hierarchyLevel: Number(editingRole.hierarchyLevel) || 2,
        scope: editingRole.scope,
        actionType: editingRole.actionType,
        isFinalApprover: Boolean(editingRole.isFinalApprover),
        isMandatory: Boolean(editingRole.isMandatory),
        defaultTitle: editingRole.defaultTitle,
        defaultDepartment: editingRole.defaultDepartment,
      });
      toast.success(`Signatory role updated successfully.`);
      setEditingRole(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update role.');
    } finally {
      setIsRoleSubmitting(false);
    }
  };

  const handleArchiveRole = async (role: SignatoryRoleDocument) => {
    if (
      !confirm(
        `Are you sure you want to archive the role "${role.name}"? Active signatories with this role will retain their current appointments.`
      )
    ) {
      return;
    }
    try {
      await archiveSignatoryRole(role.id);
      toast.success(`Signatory role "${role.name}" archived.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to archive role.');
    }
  };

  // ─── Signatory Label Validation & Maintenance Handlers ───
  const validateSignatoryLabelFormat = (
    label: string
  ): { isValid: boolean; formatted: string; error?: string } => {
    const trimmed = label.trim();
    if (!trimmed) {
      return { isValid: false, formatted: '', error: 'Please enter a label type.' };
    }

    // Must end with a colon ':' (e.g. "prepared by:", "Checked by:")
    if (!trimmed.endsWith(':')) {
      return {
        isValid: false,
        formatted: trimmed,
        error: 'Invalid format. Label must end with a colon (e.g. "prepared by:" or "Reviewed by:").',
      };
    }

    const textBeforeColon = trimmed.slice(0, -1).trim();
    if (textBeforeColon.length < 2) {
      return {
        isValid: false,
        formatted: trimmed,
        error: 'Label text before the colon must be at least 2 characters.',
      };
    }

    if (!/^[A-Za-z0-9\s\/\-_&()]+:$/.test(trimmed)) {
      return {
        isValid: false,
        formatted: trimmed,
        error: 'Label can only contain letters, numbers, spaces, and hyphens ending with a colon (e.g. "prepared by:").',
      };
    }

    return { isValid: true, formatted: trimmed };
  };

  const isDuplicateLabelName = (
    candidateLabel: string,
    excludeId?: string
  ): boolean => {
    const cleanCandidate = candidateLabel.trim().toLowerCase();
    return signatoryLabels.some((item) => {
      if (excludeId && item.id === excludeId) return false;
      return item.label.trim().toLowerCase() === cleanCandidate;
    });
  };

  const handleCreateLabelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateSignatoryLabelFormat(labelFormData.label);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid label format.');
      return;
    }

    if (isDuplicateLabelName(validation.formatted)) {
      toast.error(`A label named "${validation.formatted}" already exists. Duplicate names are not allowed.`);
      return;
    }

    setIsLabelSubmitting(true);
    try {
      await createSignatoryLabel({
        label: validation.formatted,
        isApproverLabel: false,
        actionType: 'endorse',
        description: 'Institutional endorsement and review',
        orderIndex: signatoryLabels.length + 1,
        isActive: true,
      });
      toast.success(`Label "${validation.formatted}" added successfully!`);
      setIsAddLabelModalOpen(false);
      setLabelFormData({
        label: '',
        description: '',
        actionType: 'endorse',
        isApproverLabel: false,
        orderIndex: 99,
        isActive: true,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add signatory label.');
    } finally {
      setIsLabelSubmitting(false);
    }
  };

  const handleEditLabelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLabel) return;

    const validation = validateSignatoryLabelFormat(editingLabel.label);
    if (!validation.isValid) {
      toast.error(validation.error || 'Invalid label format.');
      return;
    }

    if (isDuplicateLabelName(validation.formatted, editingLabel.id)) {
      toast.error(`A label named "${validation.formatted}" already exists. Duplicate names are not allowed.`);
      return;
    }

    setIsLabelSubmitting(true);
    try {
      await updateSignatoryLabel(editingLabel.id, {
        label: validation.formatted,
        isApproverLabel: false,
        actionType: 'endorse',
        description: 'Institutional endorsement and review',
        isActive: editingLabel.isActive,
      });
      toast.success(`Label "${validation.formatted}" updated successfully.`);
      setEditingLabel(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update label.');
    } finally {
      setIsLabelSubmitting(false);
    }
  };

  const handleToggleLabelStatus = async (label: SignatoryLabelDocument) => {
    try {
      await toggleSignatoryLabelStatus(label.id, !label.isActive);
      toast.success(`Label "${label.label}" ${!label.isActive ? 'activated' : 'deactivated'}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update label status.');
    }
  };

  const filteredLabels = signatoryLabels.filter((l) => {
    const q = labelSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      l.label.toLowerCase().includes(q) ||
      (l.isApproverLabel ? 'approver' : 'endorser').includes(q)
    );
  });

  // ─── Document Authority Matrix Handlers ───
  const handleAddDocAuthorityChange = (
    doc: WorkflowDocumentType,
    level: DocumentAuthorityLevel
  ) => {
    const curWorkflows = formData.applicableWorkflows || [];
    let nextWorkflows: WorkflowDocumentType[];
    if (level === 'cannot_sign') {
      nextWorkflows = curWorkflows.filter((w) => w !== doc);
    } else {
      nextWorkflows = curWorkflows.includes(doc) ? curWorkflows : [...curWorkflows, doc];
    }

    const nextCanApproveProposal =
      doc === 'proposal'
        ? level === 'approver'
        : Boolean(formData.canApproveProposal && nextWorkflows.includes('proposal'));
    const nextCanApproveLiquidation =
      doc === 'liquidation'
        ? level === 'approver'
        : Boolean(formData.canApproveLiquidation && nextWorkflows.includes('liquidation'));
    const nextCanApprovePar =
      doc === 'par'
        ? level === 'approver'
        : Boolean(formData.canApprovePar && nextWorkflows.includes('par'));

    const hasAnyApprover =
      nextCanApproveProposal || nextCanApproveLiquidation || nextCanApprovePar;

    setFormData({
      ...formData,
      applicableWorkflows: nextWorkflows,
      canApproveProposal: nextCanApproveProposal,
      canApproveLiquidation: nextCanApproveLiquidation,
      canApprovePar: nextCanApprovePar,
      actionType: hasAnyApprover ? 'approver' : 'endorser',
    });
  };

  const handleEditDocAuthorityChange = async (
    doc: WorkflowDocumentType,
    level: DocumentAuthorityLevel
  ) => {
    if (!editingSignatory) return;
    const curWorkflows = editingSignatory.applicableWorkflows || [];

    // If changing to cannot_sign from an active authority:
    if (level === 'cannot_sign' && curWorkflows.includes(doc)) {
      const loadingToast = toast.loading('Validating active workflow dependencies...');
      try {
        const check = await checkDocumentAuthorityChangeEligibility(
          editingSignatory.id,
          editingSignatory.email,
          doc,
          'cannot_sign'
        );
        toast.dismiss(loadingToast);

        if (!check.canProceed) {
          setAuthorityConflict({
            signatory: editingSignatory,
            docType: doc,
            targetLevel: 'cannot_sign',
            templateAssignments: check.templateAssignments,
            pendingDocuments: check.pendingDocuments,
          });
          return; // Block change until resolved via wizard
        }
      } catch (err: any) {
        toast.dismiss(loadingToast);
        console.warn('[AuthorityCheck] Error validating dependencies:', err);
      }
    }

    let nextWorkflows: WorkflowDocumentType[];
    if (level === 'cannot_sign') {
      nextWorkflows = curWorkflows.filter((w) => w !== doc);
    } else {
      nextWorkflows = curWorkflows.includes(doc) ? curWorkflows : [...curWorkflows, doc];
    }

    const nextCanApproveProposal =
      doc === 'proposal'
        ? level === 'approver'
        : Boolean(editingSignatory.canApproveProposal && nextWorkflows.includes('proposal'));
    const nextCanApproveLiquidation =
      doc === 'liquidation'
        ? level === 'approver'
        : Boolean(editingSignatory.canApproveLiquidation && nextWorkflows.includes('liquidation'));
    const nextCanApprovePar =
      doc === 'par'
        ? level === 'approver'
        : Boolean(editingSignatory.canApprovePar && nextWorkflows.includes('par'));

    const hasAnyApprover =
      nextCanApproveProposal || nextCanApproveLiquidation || nextCanApprovePar;

    setEditingSignatory({
      ...editingSignatory,
      applicableWorkflows: nextWorkflows,
      canApproveProposal: nextCanApproveProposal,
      canApproveLiquidation: nextCanApproveLiquidation,
      canApprovePar: nextCanApprovePar,
      actionType: hasAnyApprover ? 'approver' : 'endorser',
    });
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const firstName = (formData.firstName || '').trim();
    const lastName = (formData.lastName || '').trim();
    const middleName = (formData.middleName || '').trim();
    const combinedName = formatStructuredFullName(firstName, lastName, middleName) || formData.name.trim();

    if (!firstName || !lastName || !formData.email.trim() || !formData.roleTitle.trim()) {
      toast.error('Please enter First Name, Last Name, Official Email, and Signatory Role / Title.');
      return;
    }

    const cleanTitle = formData.roleTitle.trim();
    const cleanRole = cleanTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const isAccountantRole = cleanRole.includes('accountant') || cleanRole.includes('auditor');
    const finalWorkflows: WorkflowDocumentType[] = isAccountantRole
      ? ['liquidation']
      : (formData.applicableWorkflows || []);

    if (finalWorkflows.length === 0) {
      toast.error('Please configure at least one document type for this signatory (Endorser or Approver).');
      return;
    }

    const canApproveProp = finalWorkflows.includes('proposal') && Boolean(formData.canApproveProposal);
    const canApproveLiq = finalWorkflows.includes('liquidation') && Boolean(formData.canApproveLiquidation);
    const canApprovePar = finalWorkflows.includes('par') && Boolean(formData.canApprovePar);
    const hasAnyApprover = canApproveProp || canApproveLiq || canApprovePar;

    const finalScope: SignatoryDocumentScope = isAccountantRole
      ? 'liquidation_only'
      : (finalWorkflows.length === 3
          ? 'all'
          : finalWorkflows.length === 1 && finalWorkflows[0] === 'liquidation'
          ? 'liquidation_only'
          : finalWorkflows.length === 1 && finalWorkflows[0] === 'proposal'
          ? 'proposal_only'
          : finalWorkflows.length === 1 && finalWorkflows[0] === 'par'
          ? 'par'
          : 'both');

    const isApprover = hasAnyApprover;

    setIsSubmitting(true);
    try {
      const res = await createInstitutionalSignatory(
        {
          ...formData,
          firstName,
          lastName,
          middleName,
          name: combinedName,
          role: cleanRole,
          roleTitle: cleanTitle,
          actionType: isApprover ? 'approver' : 'endorser',
          applicableScope: finalScope,
          applicableWorkflows: finalWorkflows,
          isPermanentSigner: false,
          defaultSignatoryLabel: isApprover ? 'Approved by:' : 'Endorsed by:',
          canApproveProposal: canApproveProp,
          canApproveLiquidation: canApproveLiq,
          canApprovePar: canApprovePar,
        },
        profile?.uid || 'admin'
      );
      if (res.success) {
        setIsAddModalOpen(false);
        setCredentialsSuccess({
          name: combinedName,
          email: formData.email,
          roleTitle: cleanTitle,
          temporaryPassword: res.temporaryPassword,
        });
        toast.success(`Signatory created and credentials dispatched to ${formData.email}!`);
      } else {
        toast.error(res.error || 'Failed to create institutional signatory.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSignatory) return;
    const firstName = (editingSignatory.firstName || '').trim();
    const lastName = (editingSignatory.lastName || '').trim();
    const middleName = (editingSignatory.middleName || '').trim();
    const combinedName = formatStructuredFullName(firstName, lastName, middleName) || editingSignatory.name.trim();

    if (!firstName || !lastName || !editingSignatory.roleTitle.trim()) {
      toast.error('Please enter First Name, Last Name, and Signatory Role / Title.');
      return;
    }

    const cleanTitle = editingSignatory.roleTitle.trim();
    // Preserve established role identifier if valid, otherwise derive from title
    const cleanRole = editingSignatory.role || cleanTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const isAccountantRole = cleanRole.includes('accountant') || cleanRole.includes('auditor');
    const finalWorkflows: WorkflowDocumentType[] = isAccountantRole
      ? ['liquidation']
      : (editingSignatory.applicableWorkflows || []);

    if (finalWorkflows.length === 0) {
      toast.error('Please configure at least one document type for this signatory (Endorser or Approver).');
      return;
    }

    // Validate if any existing workflow authority was removed while active dependencies exist
    const originalSig = signatories.find((s) => s.id === editingSignatory.id);
    const originalWorkflows = originalSig?.applicableWorkflows || [];
    const removedWorkflows = originalWorkflows.filter((w) => !finalWorkflows.includes(w));
    for (const remDoc of removedWorkflows) {
      const check = await checkDocumentAuthorityChangeEligibility(
        editingSignatory.id,
        editingSignatory.email,
        remDoc,
        'cannot_sign'
      );
      if (!check.canProceed) {
        setAuthorityConflict({
          signatory: editingSignatory,
          docType: remDoc,
          targetLevel: 'cannot_sign',
          templateAssignments: check.templateAssignments,
          pendingDocuments: check.pendingDocuments,
        });
        toast.error(`Cannot save: ${editingSignatory.name} has active dependencies for ${remDoc.toUpperCase()}.`);
        return;
      }
    }

    const canApproveProp = finalWorkflows.includes('proposal') && Boolean(editingSignatory.canApproveProposal);
    const canApproveLiq = finalWorkflows.includes('liquidation') && Boolean(editingSignatory.canApproveLiquidation);
    const canApprovePar = finalWorkflows.includes('par') && Boolean(editingSignatory.canApprovePar);
    const hasAnyApprover = canApproveProp || canApproveLiq || canApprovePar;

    const finalScope: SignatoryDocumentScope = isAccountantRole
      ? 'liquidation_only'
      : (finalWorkflows.length === 3
          ? 'all'
          : finalWorkflows.length === 1 && finalWorkflows[0] === 'liquidation'
          ? 'liquidation_only'
          : finalWorkflows.length === 1 && finalWorkflows[0] === 'proposal'
          ? 'proposal_only'
          : finalWorkflows.length === 1 && finalWorkflows[0] === 'par'
          ? 'par'
          : 'both');

    const isApprover = hasAnyApprover;

    setIsSubmitting(true);
    try {
      await updateSignatoryDetails(editingSignatory.id, {
        name: combinedName,
        firstName,
        lastName,
        middleName,
        role: cleanRole,
        roleTitle: cleanTitle,
        actionType: isApprover ? 'approver' : 'endorser',
        applicableScope: finalScope,
        applicableWorkflows: finalWorkflows,
        employeeId: editingSignatory.employeeId ? editingSignatory.employeeId.trim() : '',
        department: editingSignatory.department || '',
        departmentId: editingSignatory.departmentId || '',
        isPermanentSigner: Boolean(editingSignatory.isPermanentSigner),
        defaultSignatoryLabel: isApprover ? 'Approved by:' : 'Endorsed by:',
        canApproveProposal: canApproveProp,
        canApproveLiquidation: canApproveLiq,
        canApprovePar: canApprovePar,
      });
      toast.success('Signatory details updated successfully.');
      setEditingSignatory(null);
    } catch (err: any) {
      toast.error('Failed to update signatory: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (signatory: InstitutionalSignatory) => {
    if (import.meta.env.VITE_ACCOUNT_RESET_ENABLED === 'false') { toast.error('Password resets are disabled.'); return; }
    setResetTarget(signatory);
  };

  const handleToggleStatus = async (signatory: InstitutionalSignatory) => {
    // If activating, proceed directly
    if (!signatory.isActive) {
      try {
        await toggleSignatoryStatus(signatory.id, true);
        toast.success(`Signatory ${signatory.name} has been activated.`);
      } catch (err: any) {
        toast.error('Failed to activate signatory: ' + err.message);
      }
      return;
    }

    // If deactivating, validate workflow & in-flight assignments
    setIsCheckingEligibility(true);
    const loadingToast = toast.loading('Checking workflow assignments & pending documents...');
    try {
      const eligibility = await checkSignatoryDeactivationEligibility(
        signatory.id,
        signatory.email
      );
      toast.dismiss(loadingToast);

      if (!eligibility.canDeactivate) {
        setDeactivationBlock({
          signatory,
          flowAssignments: eligibility.flowAssignments,
          pendingDocuments: eligibility.pendingDocuments,
        });
        toast.error(
          `Cannot deactivate: ${signatory.name} is assigned to active workflows or pending documents.`
        );
        return;
      }

      await toggleSignatoryStatus(signatory.id, false);
      toast.success(`Signatory ${signatory.name} has been deactivated.`);
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error('Failed to update signatory status: ' + err.message);
    } finally {
      setIsCheckingEligibility(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const filteredSignatories = signatories.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.roleTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.department && s.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.employeeId && s.employeeId.toLowerCase().includes(searchQuery.toLowerCase()));

    const cap = s.actionType || (s.role === 'school_president' ? 'approver' : 'endorser');
    const matchesRole =
      selectedRoleFilter === 'all' ||
      (selectedRoleFilter === 'approver' && (cap === 'approver' || cap === 'approve')) ||
      (selectedRoleFilter === 'endorser' && (cap === 'endorser' || cap === 'endorse')) ||
      (selectedRoleFilter === 'both' && cap === 'both');

    const matchesDept =
      selectedDeptFilter === 'all' ||
      (selectedDeptFilter === 'institutional' && (!s.departmentId && !s.department)) ||
      (s.departmentId && s.departmentId === selectedDeptFilter) ||
      (s.department && s.department === selectedDeptFilter);

    return matchesSearch && matchesRole && matchesDept;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#001A4D]/10 flex items-center justify-center text-[#001A4D]">
              <FileSignature className="w-5 h-5 text-[#001A4D]" />
            </div>
            <h2 className="text-xl font-bold text-[#001A4D]">Institutional Signatories & Approvers</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Manage authorized signatories who endorse Activity Proposals, institutional budgets, and financial liquidations.
          </p>
        </div>

        {activeTab === 'signatories' ? (
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#FFD41C]" />
            Add Institutional Signatory
          </button>
        ) : (
          <button
            onClick={() => {
              setLabelFormData({
                label: '',
                description: '',
                actionType: 'endorse',
                isApproverLabel: false,
                orderIndex: signatoryLabels.length + 1,
                isActive: true,
              });
              setIsAddLabelModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#FFD41C]" />
            Add New Label Type
          </button>
        )}
      </div>

      {/* ── View Navigation Tabs ── */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('signatories')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'signatories'
              ? 'border-[#001A4D] text-[#001A4D]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Institutional Signatories Directory ({signatories.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('labels')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'labels'
              ? 'border-[#001A4D] text-[#001A4D]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Signatory Document Labels Maintenance ({signatoryLabels.length})</span>
        </button>
      </div>

      {activeTab === 'signatories' && (
        <div className="space-y-6">
      {/* SAS Signatory Highlight Banner */}
      <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-950 to-[#001A4D] rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-blue-800">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-[#FFD41C]">
            <ShieldCheck className="w-5 h-5 text-[#FFD41C]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-white">Student Affairs & Services (SAS) Mandatory Signatory Gate</h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#FFD41C]/20 text-[#FFD41C] border border-[#FFD41C]/30">
                Built-in Fixed Gate 1
              </span>
            </div>
            <p className="text-xs text-blue-200 mt-0.5">
              SAS Head is automatically fixed as the mandatory Stage 1 endorser for all Student Organization Activity Proposals—no manual directory maintenance needed. Accountants are strictly restricted to Financial Liquidations.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('section', 'sas-signatory');
            window.history.pushState({}, '', url.toString());
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all flex-shrink-0 cursor-pointer"
        >
          <FileSignature className="w-3.5 h-3.5 text-[#FFD41C]" />
          <span>Configure SAS Signatory & E-Signature</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        {/* Search & Department Filter */}
        <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, title, department, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
            />
          </div>

          <select
            value={selectedDeptFilter}
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 bg-white focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
          >
            <option value="all">All Departments & Scope</option>
            <option value="institutional">Institutional / Campus-Wide Only</option>
            {activeDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </div>

        {/* Authority Capability Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'All', count: signatories.length },
            {
              id: 'approver',
              label: 'Approver Only',
              count: signatories.filter(
                (s) => s.actionType === 'approver' || s.actionType === 'approve' || s.role === 'school_president'
              ).length,
            },
            {
              id: 'endorser',
              label: 'Endorser Only',
              count: signatories.filter(
                (s) => s.actionType === 'endorser' || s.actionType === 'endorse' || (!s.actionType && s.role !== 'school_president')
              ).length,
            },
            {
              id: 'both',
              label: 'Both (Endorser & Approver)',
              count: signatories.filter((s) => s.actionType === 'both').length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedRoleFilter === tab.id
                  ? 'bg-[#001A4D] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Signatories Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="w-8 h-8 border-2 border-[#001A4D] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading institutional signatories...
          </div>
        ) : filteredSignatories.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700">No signatories found</p>
            <p className="text-sm mt-1">
              {searchQuery || selectedDeptFilter !== 'all'
                ? 'Try adjusting your search query or department filter.'
                : 'Get started by appointing your first institutional signatory.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#001A4D]/5 border-b border-gray-200 text-[#001A4D] font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Signatory & Official Email</th>
                  <th className="py-3 px-4">Signatory Role / Position Title</th>
                  <th className="py-3 px-4">Department / Scope</th>
                  <th className="py-3 px-4">Authority Capability</th>
                  <th className="py-3 px-4">Workflow Scope</th>
                  <th className="py-3 px-4">Digital Signature</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSignatories.map((sig) => (
                  <tr key={sig.id} className="hover:bg-gray-50/80 transition-colors">
                    {/* Name & Email */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#001A4D] text-[#FFD41C] font-bold flex items-center justify-center text-sm shadow-sm flex-shrink-0">
                          {sig.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-[#001A4D]">{sig.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-gray-400" />
                            {sig.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role Title */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-gray-800 flex items-center gap-1.5 flex-wrap">
                        <span>{sig.roleTitle}</span>
                        {sig.isPermanentSigner && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-md text-[10px] font-bold shadow-2xs">
                            <ShieldCheck className="w-3 h-3 text-amber-700" />
                            Permanent Signer
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Department / Scope */}
                    <td className="py-3.5 px-4">
                      {sig.department ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-[#0E4EBD] text-xs font-semibold rounded-lg border border-blue-200">
                          <Building className="w-3.5 h-3.5 text-[#0E4EBD]" />
                          {sig.department}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-md">
                          Institutional / Campus-Wide
                        </span>
                      )}
                    </td>

                    {/* Authority Capability */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        {DOCUMENT_WORKFLOW_CONFIGS.map((doc) => {
                          const level = getDocAuthority(
                            sig.applicableWorkflows,
                            doc.key === 'proposal'
                              ? sig.canApproveProposal
                              : doc.key === 'liquidation'
                              ? sig.canApproveLiquidation
                              : sig.canApprovePar,
                            doc.key
                          );

                          if (level === 'cannot_sign') {
                            return (
                              <span
                                key={doc.key}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400 w-fit line-through"
                              >
                                {doc.code}: Cannot Sign
                              </span>
                            );
                          }

                          if (level === 'approver') {
                            return (
                              <span
                                key={doc.key}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 w-fit shadow-2xs"
                              >
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                {doc.code}: Approver
                              </span>
                            );
                          }

                          return (
                            <span
                              key={doc.key}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200 w-fit"
                            >
                              <FileSignature className="w-3 h-3 text-sky-600" />
                              {doc.code}: Endorser
                            </span>
                          );
                        })}
                      </div>

                      {sig.defaultSignatoryLabel && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            🏷️ {sig.defaultSignatoryLabel}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Workflow Scope */}
                    <td className="py-3.5 px-4">
                      {(() => {
                        const workflows = getSignatoryAuthorizedWorkflows(sig);
                        if (workflows.length === 3) {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-900 border border-teal-200 text-xs font-bold rounded-lg">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                              All Workflows (AP, FL, PAR)
                            </span>
                          );
                        }
                        return (
                          <div className="flex flex-wrap gap-1">
                            {workflows.includes('proposal') && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-bold rounded">
                                AP
                              </span>
                            )}
                            {workflows.includes('liquidation') && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-bold rounded">
                                FL
                              </span>
                            )}
                            {workflows.includes('par') && (
                              <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-bold rounded">
                                PAR
                              </span>
                            )}
                            {workflows.length === 0 && (
                              <span className="text-gray-400 text-xs italic">None</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Signature Status */}
                    <td className="py-3.5 px-4">
                      {sig.signatureUrl ? (
                        <button
                          onClick={() => setPreviewSignatureUrl(sig.signatureUrl || null)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Signature Registered
                          <Eye className="w-3 h-3 text-emerald-500 ml-1" />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          Pending First Sign
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          sig.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            sig.isActive ? 'bg-green-600' : 'bg-gray-400'
                          }`}
                        />
                        {sig.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Edit */}
                        <button
                          onClick={() => handleOpenEditModal(sig)}
                          title="Edit Signatory Details"
                          className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Reset Password & Email */}
                        <button
                          onClick={() => handleResetPassword(sig)}
                          title="Reset Password & Resend Credentials Email"
                          className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>

                        {/* Toggle Active */}
                        <button
                          onClick={() => handleToggleStatus(sig)}
                          disabled={isCheckingEligibility}
                          title={sig.isActive ? 'Deactivate Account' : 'Activate Account'}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                            sig.isActive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {sig.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      )}

      {/* ── TAB: Signatory Document Labels Maintenance ── */}
      {activeTab === 'labels' && (
        <div className="space-y-4">
          {/* Informational Guidance Banner */}
          <div className="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-start gap-3">
            <Tag className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-950 space-y-1">
              <p className="font-bold">Formal Document Signatory Labels Maintenance</p>
              <p className="text-blue-800 leading-relaxed font-normal">
                Manage the formal prefix labels that appear above signatories’ signatures across official STI College documents (Activity Proposals, Financial Liquidations, and Post-Activity Reports).
                Labels categorized as <strong>Approver</strong> grant executive approval authority, while <strong>Endorser</strong> labels are designated for vetting, checking, noting, and reviewing.
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search label types or descriptions..."
                value={labelSearchQuery}
                onChange={(e) => setLabelSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
              />
            </div>
            <span className="text-xs font-semibold text-gray-500">
              Showing {filteredLabels.length} of {signatoryLabels.length} labels
            </span>
          </div>

          {/* Labels Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-700 uppercase tracking-wider text-[11px] font-bold">
                  <tr>
                    <th className="py-3.5 px-6">Label Type</th>
                    <th className="py-3.5 px-6 text-center">Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {labelsLoading ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-gray-400 font-medium">
                        Loading signatory labels...
                      </td>
                    </tr>
                  ) : filteredLabels.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-gray-400 font-medium">
                        No signatory labels match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredLabels.map((lbl) => (
                      <tr key={lbl.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-6 font-bold text-gray-900">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-900 border border-slate-300 text-xs shadow-2xs font-bold">
                            <Tag className="w-3.5 h-3.5 text-blue-600" />
                            <span>{lbl.label}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleLabelStatus(lbl)}
                            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                              lbl.isActive
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            {lbl.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingLabel({ ...lbl })}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Label"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Add Institutional Signatory ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-[#FFD41C]" />
                <h3 className="font-bold text-lg">Add Institutional Signatory</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Structured Signatory Name: First Name, Middle Name, Last Name */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rona Mira"
                        value={formData.firstName || ''}
                        onChange={(e) => {
                          const firstName = e.target.value;
                          const name = formatStructuredFullName(firstName, formData.lastName, formData.middleName);
                          setFormData({ ...formData, firstName, name });
                        }}
                        className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1 text-center">
                        Middle Name <span className="text-gray-400 font-normal lowercase">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        autoComplete="additional-name"
                        placeholder="e.g. Sigmund"
                        aria-label="Middle name"
                        value={formData.middleName || ''}
                        onChange={(e) => {
                          const middleName = e.target.value;
                          const name = formatStructuredFullName(formData.firstName, formData.lastName, middleName);
                          setFormData({ ...formData, middleName, name });
                        }}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Lucañas"
                        value={formData.lastName || ''}
                        onChange={(e) => {
                          const lastName = e.target.value;
                          const name = formatStructuredFullName(formData.firstName, lastName, formData.middleName);
                          setFormData({ ...formData, lastName, name });
                        }}
                        className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                      />
                    </div>
                  </div>

                  {/* Combined Name Preview */}
                  {formData.name && (
                    <div className="px-3 py-1.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-xs text-[#001A4D] flex items-center justify-between">
                      <span className="font-semibold text-gray-500">Official Combined Name:</span>
                      <span className="font-bold text-[#0E4EBD]">{formData.name}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                    Official Institutional Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. rona.lucanas@sti.edu"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Login credentials and approval notifications will be dispatched to this email address.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                    Signatory Role / Position Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. IT Program Head, School President, Guidance Counselor, SHS Assistant Principal"
                    value={formData.roleTitle}
                    onChange={(e) => setFormData({ ...formData, roleTitle: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    The formal title that appears beneath the signature line on official documents, proposals, and printouts.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                    Academic Department / Office Assignment
                  </label>
                  <select
                    value={formData.departmentId || ''}
                    onChange={(e) => {
                      const deptId = e.target.value;
                      const deptObj = activeDepartments.find((d) => d.id === deptId);
                      setFormData({
                        ...formData,
                        departmentId: deptId,
                        department: deptObj ? deptObj.name : '',
                      });
                    }}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                  >
                    <option value="">None / Institutional (Campus-Wide)</option>
                    {activeDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        [{d.academicLevel || 'College'}] {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Assign to an academic department so this signatory is automatically required when an activity targets this department's students.
                  </p>
                </div>

                {/* Document Signing & Authority Matrix */}
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-0.5">
                      Document Signing & Authority Configuration *
                    </label>
                    <p className="text-[11px] text-gray-500">
                      Configure authority per document type: Cannot Sign, Endorser Only, or Approver.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {DOCUMENT_WORKFLOW_CONFIGS.map((doc) => {
                      const currentLevel = getDocAuthority(
                        formData.applicableWorkflows,
                        doc.key === 'proposal'
                          ? formData.canApproveProposal
                          : doc.key === 'liquidation'
                          ? formData.canApproveLiquidation
                          : formData.canApprovePar,
                        doc.key
                      );

                      return (
                        <div
                          key={doc.key}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            currentLevel === 'approver'
                              ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-200'
                              : currentLevel === 'endorser'
                              ? 'bg-sky-50/60 border-sky-300 ring-1 ring-sky-200'
                              : 'bg-gray-50/70 border-gray-200'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
                            <span className="font-bold text-xs text-[#001A4D] tracking-wide">
                              {doc.title}
                            </span>
                            <span className="text-[10px] font-semibold text-gray-500">
                              {doc.description}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {/* Cannot Sign */}
                            <label
                              className={`flex items-center justify-center sm:justify-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                currentLevel === 'cannot_sign'
                                  ? 'bg-slate-200 border-slate-400 text-slate-800 font-bold shadow-2xs'
                                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`authority_${doc.key}_add`}
                                value="cannot_sign"
                                checked={currentLevel === 'cannot_sign'}
                                onChange={() => handleAddDocAuthorityChange(doc.key, 'cannot_sign')}
                                className="text-slate-600 focus:ring-slate-500 cursor-pointer"
                              />
                              <span className="flex items-center gap-1.5">
                                <Ban className="w-3.5 h-3.5 text-slate-500 hidden sm:inline" />
                                <span>Cannot Sign</span>
                              </span>
                            </label>

                            {/* Endorser Only */}
                            <label
                              className={`flex items-center justify-center sm:justify-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                currentLevel === 'endorser'
                                  ? 'bg-sky-100 border-sky-400 text-sky-950 font-bold shadow-2xs ring-1 ring-sky-300'
                                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`authority_${doc.key}_add`}
                                value="endorser"
                                checked={currentLevel === 'endorser'}
                                onChange={() => handleAddDocAuthorityChange(doc.key, 'endorser')}
                                className="text-sky-600 focus:ring-sky-500 cursor-pointer"
                              />
                              <span className="flex items-center gap-1.5">
                                <FileSignature className="w-3.5 h-3.5 text-sky-600 hidden sm:inline" />
                                <span>Endorser Only</span>
                              </span>
                            </label>

                            {/* Approver */}
                            <label
                              className={`flex items-center justify-center sm:justify-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                currentLevel === 'approver'
                                  ? 'bg-emerald-100 border-emerald-500 text-emerald-950 font-bold shadow-2xs ring-1 ring-emerald-300'
                                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`authority_${doc.key}_add`}
                                value="approver"
                                checked={currentLevel === 'approver'}
                                onChange={() => handleAddDocAuthorityChange(doc.key, 'approver')}
                                className="text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <span className="flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 hidden sm:inline" />
                                <span>Approver</span>
                              </span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Temporary Password Display */}
                <div className="bg-[#f4f6fb] border border-[#d0d7e8] rounded-xl p-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#001A4D]">
                      <Key className="w-3.5 h-3.5 text-[#0E4EBD]" />
                      Temporary Password
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, temporaryPassword: generateTemporaryPassword() })
                      }
                      className="text-[11px] text-[#0E4EBD] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>
                  <div className="mt-1 font-mono font-bold text-[#001A4D] text-sm bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                    {formData.temporaryPassword}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    The user will be prompted to change this password and upload their official e-signature upon their first login at{' '}
                    <span className="font-semibold">/portal/login</span>.
                  </p>
                </div>
              </div>

              {/* Sticky Footer Actions */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/90 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-bold rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-[#FFD41C]" />
                      Appoint & Email Credentials
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Edit Signatory Details ── */}
      {editingSignatory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[#FFD41C]" />
                <h3 className="font-bold text-lg">Edit Signatory Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSignatory(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Structured Signatory Name: First Name, Middle Name, Last Name (Locked for Audit Integrity) */}
              <div className="space-y-2">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-700">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900">Legal Identity Locked</span>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Signatory legal names cannot be modified after registration to protect institutional audit trails and document integrity. If personnel changed for this role, register the incoming official as a new signatory.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <span>First Name</span>
                      <Lock className="w-3 h-3 text-gray-400" />
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={editingSignatory.firstName || ''}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600 font-medium cursor-not-allowed select-none outline-none"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                      <span>Middle Name</span>
                      <Lock className="w-3 h-3 text-gray-400" />
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={editingSignatory.middleName || ''}
                      className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600 font-medium cursor-not-allowed select-none outline-none text-center"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <span>Last Name</span>
                      <Lock className="w-3 h-3 text-gray-400" />
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={editingSignatory.lastName || ''}
                      className="w-full px-3.5 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600 font-medium cursor-not-allowed select-none outline-none"
                    />
                  </div>
                </div>

                {/* Combined Name Preview */}
                {editingSignatory.name && (
                  <div className="px-3 py-1.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-xs text-[#001A4D] flex items-center justify-between">
                    <span className="font-semibold text-gray-500">Official Combined Name:</span>
                    <span className="font-bold text-[#0E4EBD]">{editingSignatory.name}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Signatory Role / Position Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IT Program Head, School President, Guidance Counselor"
                  value={editingSignatory.roleTitle}
                  onChange={(e) =>
                    setEditingSignatory({ ...editingSignatory, roleTitle: e.target.value })
                  }
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  The formal title that appears beneath the signature line on official documents, proposals, and printouts.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Academic Department / Office Assignment
                </label>
                <select
                  value={editingSignatory.departmentId || ''}
                  onChange={(e) => {
                    const deptId = e.target.value;
                    const deptObj = activeDepartments.find((d) => d.id === deptId);
                    setEditingSignatory({
                      ...editingSignatory,
                      departmentId: deptId,
                      department: deptObj ? deptObj.name : '',
                    });
                  }}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                >
                  <option value="">None / Institutional (Campus-Wide)</option>
                  {activeDepartments.map((d) => (
                    <option key={d.id} value={d.id}>
                      [{d.academicLevel || 'College'}] {d.code} — {d.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Assign to an academic department so this signatory is automatically required when an activity targets this department's students.
                </p>
              </div>

              {/* Document Signing & Authority Matrix */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-0.5">
                    Document Signing & Authority Configuration *
                  </label>
                  <p className="text-[11px] text-gray-500">
                    Configure authority per document type: Cannot Sign, Endorser Only, or Approver.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {DOCUMENT_WORKFLOW_CONFIGS.map((doc) => {
                    const currentLevel = getDocAuthority(
                      editingSignatory.applicableWorkflows,
                      doc.key === 'proposal'
                        ? editingSignatory.canApproveProposal
                        : doc.key === 'liquidation'
                        ? editingSignatory.canApproveLiquidation
                        : editingSignatory.canApprovePar,
                      doc.key
                    );

                    return (
                      <div
                        key={doc.key}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          currentLevel === 'approver'
                            ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-200'
                            : currentLevel === 'endorser'
                            ? 'bg-sky-50/60 border-sky-300 ring-1 ring-sky-200'
                            : 'bg-gray-50/70 border-gray-200'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
                          <span className="font-bold text-xs text-[#001A4D] tracking-wide">
                            {doc.title}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-500">
                            {doc.description}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {/* Cannot Sign */}
                          <label
                            className={`flex items-center justify-center sm:justify-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                              currentLevel === 'cannot_sign'
                                ? 'bg-slate-200 border-slate-400 text-slate-800 font-bold shadow-2xs'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`authority_${doc.key}_edit`}
                              value="cannot_sign"
                              checked={currentLevel === 'cannot_sign'}
                              onChange={() => handleEditDocAuthorityChange(doc.key, 'cannot_sign')}
                              className="text-slate-600 focus:ring-slate-500 cursor-pointer"
                            />
                            <span className="flex items-center gap-1.5">
                              <Ban className="w-3.5 h-3.5 text-slate-500 hidden sm:inline" />
                              <span>Cannot Sign</span>
                            </span>
                          </label>

                          {/* Endorser Only */}
                          <label
                            className={`flex items-center justify-center sm:justify-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                              currentLevel === 'endorser'
                                ? 'bg-sky-100 border-sky-400 text-sky-950 font-bold shadow-2xs ring-1 ring-sky-300'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`authority_${doc.key}_edit`}
                              value="endorser"
                              checked={currentLevel === 'endorser'}
                              onChange={() => handleEditDocAuthorityChange(doc.key, 'endorser')}
                              className="text-sky-600 focus:ring-sky-500 cursor-pointer"
                            />
                            <span className="flex items-center gap-1.5">
                              <FileSignature className="w-3.5 h-3.5 text-sky-600 hidden sm:inline" />
                              <span>Endorser Only</span>
                            </span>
                          </label>

                          {/* Approver */}
                          <label
                            className={`flex items-center justify-center sm:justify-start gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                              currentLevel === 'approver'
                                ? 'bg-emerald-100 border-emerald-500 text-emerald-950 font-bold shadow-2xs ring-1 ring-emerald-300'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`authority_${doc.key}_edit`}
                              value="approver"
                              checked={currentLevel === 'approver'}
                              onChange={() => handleEditDocAuthorityChange(doc.key, 'approver')}
                              className="text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 hidden sm:inline" />
                              <span>Approver</span>
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sticky Footer Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/90 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditingSignatory(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-bold rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Signature Preview ── */}
      {previewSignatureUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <h4 className="font-bold text-[#001A4D] text-base mb-1">Official Registered Signature</h4>
            <p className="text-xs text-gray-500 mb-4">Transparent high-resolution e-signature</p>

            <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-center min-h-[140px] mb-4">
              <img
                src={previewSignatureUrl}
                alt="Signature Preview"
                className="max-h-24 max-w-full object-contain filter drop-shadow-sm"
              />
            </div>

            <button
              onClick={() => setPreviewSignatureUrl(null)}
              className="w-full py-2 bg-[#001A4D] text-white text-sm font-bold rounded-lg hover:bg-[#0A2E6D] transition-colors"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* ── DIALOG: Credentials Generated Success ── */}
      {credentialsSuccess && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-[#001A4D]">Credentials Dispatched Successfully!</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              An onboarding email containing login instructions has been sent to{' '}
              <strong className="text-gray-800">{credentialsSuccess.email}</strong>.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left text-xs space-y-2 mb-5">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Signatory:</span>
                <span className="font-semibold text-gray-800">{credentialsSuccess.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Role:</span>
                <span className="font-semibold text-gray-800">{credentialsSuccess.roleTitle}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Login URL:</span>
                <span className="font-mono text-blue-600 font-semibold">/portal/login</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-gray-500 font-bold">Temporary Password:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[#001A4D] bg-yellow-100 px-2 py-0.5 rounded border border-yellow-300">
                    {credentialsSuccess.temporaryPassword}
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(credentialsSuccess.temporaryPassword, 'Password')
                    }
                    className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                    title="Copy Password"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCredentialsSuccess(null)}
              className="w-full py-2.5 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: Add Signatory Label ── */}
      {isAddLabelModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#FFD41C]" />
                <h3 className="font-bold text-base">Add New Signatory Label</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddLabelModalOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateLabelSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Label Type *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. prepared by:"
                  value={labelFormData.label}
                  onChange={(e) => setLabelFormData({ ...labelFormData, label: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Must follow formal format ending with a colon (e.g. <span className="font-mono font-bold text-gray-700">prepared by:</span> or <span className="font-mono font-bold text-gray-700">Checked by:</span>).
                </p>
              </div>



              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddLabelModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLabelSubmitting}
                  className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {isLabelSubmitting ? 'Adding...' : 'Add Label'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Edit Signatory Label ── */}
      {editingLabel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#FFD41C]" />
                <h3 className="font-bold text-base">Edit Signatory Label</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingLabel(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditLabelSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Label Type *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. prepared by:"
                  value={editingLabel.label}
                  onChange={(e) => setEditingLabel({ ...editingLabel, label: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Must follow formal format ending with a colon (e.g. <span className="font-mono font-bold text-gray-700">prepared by:</span> or <span className="font-mono font-bold text-gray-700">Checked by:</span>).
                </p>
              </div>



              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingLabel(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLabelSubmitting}
                  className="px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-xs font-bold rounded-xl disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {isLabelSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── MODAL: Deactivation Block Guard ── */}
      {deactivationBlock && (
        <DeactivationBlockModal
          signatory={deactivationBlock.signatory}
          flowAssignments={deactivationBlock.flowAssignments}
          pendingDocuments={deactivationBlock.pendingDocuments}
          onClose={() => setDeactivationBlock(null)}
        />
      )}

      {/* ── MODAL: Authority Conflict Guard ── */}
      {authorityConflict && (
        <AuthorityConflictModal
          signatory={authorityConflict.signatory}
          docType={authorityConflict.docType}
          targetLevel={authorityConflict.targetLevel}
          templateAssignments={authorityConflict.templateAssignments}
          pendingDocuments={authorityConflict.pendingDocuments}
          onClose={() => setAuthorityConflict(null)}
        />
      )}

      {resetTarget && <ResetPasswordModal kind="signatories" account={resetTarget} onClose={() => setResetTarget(null)} onCompleted={(result) => {
        if (result.delivery === 'accepted') toast.success('Password reset completed; email accepted by the provider.');
        else toast.warning('Password reset completed, but email failed. Copy the active temporary password in the reset window.');
      }} />}
    </div>
  );
}
