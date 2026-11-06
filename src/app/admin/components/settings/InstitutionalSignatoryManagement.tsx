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
} from 'lucide-react';
import { toast } from 'sonner';
import {
  subscribeToSignatories,
  createInstitutionalSignatory,
  resetSignatoryCredentials,
  toggleSignatoryStatus,
  updateSignatoryDetails,
  generateTemporaryPassword,
} from '../../../modules/signatories/services/signatory.service';
import {
  SIGNATORY_ROLES,
  type InstitutionalSignatory,
  type SignatoryRole,
  type CreateSignatoryPayload,
  type SignatoryDocumentScope,
  type WorkflowDocumentType,
  getSignatoryAuthorizedWorkflows,
} from '../../../modules/signatories/types/signatory.types';
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

export default function InstitutionalSignatoryManagement() {
  const { profile } = useAdviserProfile();
  const { roles: dbRoles, loading: rolesLoading } = useSignatoryRolesStream();
  const { data: departments = [] } = useDepartments();
  const activeDepartments = React.useMemo(() => departments.filter((d) => !d.archived), [departments]);

  // View Tabs: Directory vs Signatory Labels Maintenance
  const [activeTab, setActiveTab] = useState<'signatories' | 'labels'>('signatories');
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);
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

  // Form state for Add/Edit Signatory
  const [formData, setFormData] = useState<CreateSignatoryPayload>({
    name: '',
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

    setEditingSignatory({
      ...sig,
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

  // ─── Signatory Label Maintenance Handlers ───
  const handleCreateLabelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labelFormData.label.trim()) {
      toast.error('Please enter the formal label text (e.g. "Reviewed by:").');
      return;
    }
    setIsLabelSubmitting(true);
    try {
      await createSignatoryLabel(labelFormData);
      toast.success(`Label "${labelFormData.label.trim()}" added successfully!`);
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
    if (!editingLabel || !editingLabel.label.trim()) {
      toast.error('Please enter the formal label text.');
      return;
    }
    setIsLabelSubmitting(true);
    try {
      await updateSignatoryLabel(editingLabel.id, {
        label: editingLabel.label,
        description: editingLabel.description,
        actionType: editingLabel.actionType,
        isApproverLabel: editingLabel.isApproverLabel,
        isActive: editingLabel.isActive,
      });
      toast.success(`Label "${editingLabel.label}" updated successfully.`);
      setEditingLabel(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update label.');
    } finally {
      setIsLabelSubmitting(false);
    }
  };

  const handleDeleteLabel = async (label: SignatoryLabelDocument) => {
    if (label.isSystemDefault) {
      toast.error('Official system default labels cannot be deleted. You can deactivate them instead.');
      return;
    }
    if (!confirm(`Are you sure you want to delete the custom label "${label.label}"?`)) {
      return;
    }
    try {
      await deleteSignatoryLabel(label.id);
      toast.success(`Label "${label.label}" deleted.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete label.');
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
      (l.description && l.description.toLowerCase().includes(q)) ||
      l.actionType.toLowerCase().includes(q)
    );
  });

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.roleTitle.trim()) {
      toast.error('Please enter Full Name, Official Email, and Signatory Role / Title.');
      return;
    }

    const cleanTitle = formData.roleTitle.trim();
    const cleanRole = cleanTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const isAccountantRole = cleanRole.includes('accountant') || cleanRole.includes('auditor');
    const finalWorkflows: WorkflowDocumentType[] = isAccountantRole
      ? ['liquidation']
      : (formData.applicableWorkflows && formData.applicableWorkflows.length > 0
          ? formData.applicableWorkflows
          : ['proposal', 'liquidation', 'par']);
    const finalScope: SignatoryDocumentScope = isAccountantRole
      ? 'liquidation_only'
      : (finalWorkflows.length === 3 ? 'all' : (finalWorkflows.length === 1 && finalWorkflows[0] === 'liquidation' ? 'liquidation_only' : finalWorkflows.length === 1 && finalWorkflows[0] === 'proposal' ? 'proposal_only' : finalWorkflows.length === 1 && finalWorkflows[0] === 'par' ? 'par' : 'both'));

    const isApprover = formData.actionType === 'approver' || formData.actionType === 'approve';

    setIsSubmitting(true);
    try {
      const res = await createInstitutionalSignatory(
        {
          ...formData,
          role: cleanRole,
          roleTitle: cleanTitle,
          actionType: isApprover ? 'approver' : 'endorser',
          applicableScope: finalScope,
          applicableWorkflows: finalWorkflows,
          isPermanentSigner: false,
          defaultSignatoryLabel: formData.defaultSignatoryLabel || (isApprover ? 'Approved by:' : 'Endorsed by:'),
          canApproveProposal: isApprover ? Boolean(formData.canApproveProposal) : false,
          canApproveLiquidation: isApprover ? Boolean(formData.canApproveLiquidation) : false,
          canApprovePar: isApprover ? Boolean(formData.canApprovePar) : false,
        },
        profile?.uid || 'admin'
      );
      if (res.success) {
        setIsAddModalOpen(false);
        setCredentialsSuccess({
          name: formData.name,
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
    if (!editingSignatory.name.trim() || !editingSignatory.roleTitle.trim()) {
      toast.error('Please enter Full Name and Signatory Role / Title.');
      return;
    }

    const cleanTitle = editingSignatory.roleTitle.trim();
    // Preserve established role identifier if valid, otherwise derive from title
    const cleanRole = editingSignatory.role || cleanTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const isAccountantRole = cleanRole.includes('accountant') || cleanRole.includes('auditor');
    const finalWorkflows: WorkflowDocumentType[] = isAccountantRole
      ? ['liquidation']
      : (editingSignatory.applicableWorkflows && editingSignatory.applicableWorkflows.length > 0
          ? editingSignatory.applicableWorkflows
          : ['proposal', 'liquidation', 'par']);
    const finalScope: SignatoryDocumentScope = isAccountantRole
      ? 'liquidation_only'
      : (finalWorkflows.length === 3 ? 'all' : (finalWorkflows.length === 1 && finalWorkflows[0] === 'liquidation' ? 'liquidation_only' : finalWorkflows.length === 1 && finalWorkflows[0] === 'proposal' ? 'proposal_only' : finalWorkflows.length === 1 && finalWorkflows[0] === 'par' ? 'par' : 'both'));

    const isApprover = editingSignatory.actionType === 'approver' || editingSignatory.actionType === 'approve';

    setIsSubmitting(true);
    try {
      await updateSignatoryDetails(editingSignatory.id, {
        name: editingSignatory.name.trim(),
        role: cleanRole,
        roleTitle: cleanTitle,
        actionType: isApprover ? 'approver' : 'endorser',
        applicableScope: finalScope,
        applicableWorkflows: finalWorkflows,
        employeeId: editingSignatory.employeeId ? editingSignatory.employeeId.trim() : '',
        department: editingSignatory.department || '',
        departmentId: editingSignatory.departmentId || '',
        isPermanentSigner: Boolean(editingSignatory.isPermanentSigner),
        defaultSignatoryLabel: editingSignatory.defaultSignatoryLabel || (isApprover ? 'Approved by:' : 'Endorsed by:'),
        canApproveProposal: isApprover ? Boolean(editingSignatory.canApproveProposal) : false,
        canApproveLiquidation: isApprover ? Boolean(editingSignatory.canApproveLiquidation) : false,
        canApprovePar: isApprover ? Boolean(editingSignatory.canApprovePar) : false,
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
    if (
      !confirm(
        `Are you sure you want to generate a new temporary password and email credentials to ${signatory.name} (${signatory.email})?`
      )
    ) {
      return;
    }

    try {
      const res = await resetSignatoryCredentials(
        signatory.id,
        signatory.email,
        signatory.name,
        signatory.roleTitle,
        signatory.department
      );
      if (res.success) {
        toast.success(`New credentials dispatched to ${signatory.email}!`);
        setCredentialsSuccess({
          name: signatory.name,
          email: signatory.email,
          roleTitle: signatory.roleTitle,
          temporaryPassword: res.temporaryPassword,
        });
      } else {
        toast.error('Failed to reset credentials.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error resetting password');
    }
  };

  const handleToggleStatus = async (signatory: InstitutionalSignatory) => {
    try {
      await toggleSignatoryStatus(signatory.id, !signatory.isActive);
      toast.success(
        `Signatory ${signatory.name} has been ${signatory.isActive ? 'deactivated' : 'activated'}.`
      );
    } catch (err: any) {
      toast.error('Failed to toggle status: ' + err.message);
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
                      {sig.actionType === 'approver' || sig.actionType === 'approve' || sig.role === 'school_president' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          Approver Only
                        </span>
                      ) : sig.actionType === 'both' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-800 text-xs font-bold rounded-lg border border-purple-200">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
                          Both (Endorser & Approver)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-sky-800 text-xs font-bold rounded-lg border border-sky-200">
                          <FileSignature className="w-3.5 h-3.5 text-sky-600" />
                          Endorser Only
                        </span>
                      )}
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {sig.defaultSignatoryLabel && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            🏷️ {sig.defaultSignatoryLabel}
                          </span>
                        )}
                        {sig.canApproveProposal && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            AP Approver
                          </span>
                        )}
                        {sig.canApproveLiquidation && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                            FL Approver
                          </span>
                        )}
                        {sig.canApprovePar && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900">
                            PAR Approver
                          </span>
                        )}
                      </div>
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
                          title={sig.isActive ? 'Deactivate Account' : 'Activate Account'}
                          className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
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
                    <th className="py-3 px-4">Label Type</th>
                    <th className="py-3 px-4">Authority Category</th>
                    <th className="py-3 px-4">Action Type</th>
                    <th className="py-3 px-4">Context / Document Usage</th>
                    <th className="py-3 px-4">System Tier</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {labelsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 font-medium">
                        Loading signatory labels...
                      </td>
                    </tr>
                  ) : filteredLabels.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 font-medium">
                        No signatory labels match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredLabels.map((lbl) => (
                      <tr key={lbl.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-gray-900">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-900 border border-slate-300 text-xs shadow-2xs font-bold">
                            <Tag className="w-3.5 h-3.5 text-blue-600" />
                            <span>{lbl.label}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {lbl.isApproverLabel ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-[10px] uppercase tracking-wider shadow-2xs">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Approver
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-300 font-bold text-[10px] uppercase tracking-wider shadow-2xs">
                              <FileSignature className="w-3.5 h-3.5 text-sky-600" />
                              Endorser
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-700 capitalize">
                          {lbl.actionType}
                        </td>
                        <td className="py-3.5 px-4 text-gray-600 max-w-xs">
                          {lbl.description || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          {lbl.isSystemDefault ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              STI Official Default
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              Custom Added
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleLabelStatus(lbl)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                              lbl.isActive
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            {lbl.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingLabel({ ...lbl })}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Label"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {!lbl.isSystemDefault && (
                              <button
                                type="button"
                                onClick={() => handleDeleteLabel(lbl)}
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Custom Label"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-[#FFD41C]" />
                <h3 className="font-bold text-lg">Add Institutional Signatory</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rona Mira B. Lucañas"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                />
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

              {/* Action Capability: Endorser Only vs Approver */}
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                  Signatory Authority *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      formData.actionType === 'endorser' || formData.actionType === 'endorse' || !formData.actionType
                        ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200 shadow-2xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeAdd"
                      value="endorser"
                      checked={formData.actionType === 'endorser' || formData.actionType === 'endorse' || !formData.actionType}
                      onChange={() =>
                        setFormData({
                          ...formData,
                          actionType: 'endorser',
                          canApproveProposal: false,
                          canApproveLiquidation: false,
                          canApprovePar: false,
                        })
                      }
                      className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1.5">
                        <FileSignature className="w-4 h-4 text-sky-600" />
                        <span>Endorser Only</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Vets, checks, and endorses document workflows. Cannot grant final approval.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      formData.actionType === 'approver' || formData.actionType === 'approve'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200 shadow-2xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeAdd"
                      value="approver"
                      checked={formData.actionType === 'approver' || formData.actionType === 'approve'}
                      onChange={() =>
                        setFormData({
                          ...formData,
                          actionType: 'approver',
                          canApproveProposal: true,
                          canApproveLiquidation: true,
                          canApprovePar: true,
                        })
                      }
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Approver</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Has executive authority to grant final institutional approval.
                      </div>
                    </div>
                  </label>
                </div>

                {/* Granular Document Approval Authority when Approver is selected */}
                {(formData.actionType === 'approver' || formData.actionType === 'approve') && (
                  <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-emerald-950 uppercase tracking-wider block">
                      Approved Document Types (Executive Authority)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-emerald-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.canApproveProposal)}
                          onChange={(e) => setFormData({ ...formData, canApproveProposal: e.target.checked })}
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                        />
                        <span>Approve Proposals (AP)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-emerald-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.canApproveLiquidation)}
                          onChange={(e) => setFormData({ ...formData, canApproveLiquidation: e.target.checked })}
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                        />
                        <span>Approve Liquidations (FL)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-emerald-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.canApprovePar)}
                          onChange={(e) => setFormData({ ...formData, canApprovePar: e.target.checked })}
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                        />
                        <span>Approve PAR</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Document Workflow Scope */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider">
                    Document Workflow Scope *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const all: WorkflowDocumentType[] = ['proposal', 'liquidation', 'par'];
                      const current = formData.applicableWorkflows || [];
                      const next = current.length === 3 ? ['liquidation'] : all;
                      setFormData({ ...formData, applicableWorkflows: next });
                    }}
                    className="text-[11px] text-[#0E4EBD] hover:underline font-semibold"
                  >
                    {(formData.applicableWorkflows || []).length === 3 ? 'Deselect All' : 'Select All Workflows'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Activity Proposal */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      (formData.applicableWorkflows || []).includes('proposal')
                        ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(formData.applicableWorkflows || []).includes('proposal')}
                      onChange={(e) => {
                        const cur = formData.applicableWorkflows || [];
                        const next = e.target.checked ? [...cur, 'proposal'] : cur.filter((w) => w !== 'proposal');
                        setFormData({ ...formData, applicableWorkflows: next as WorkflowDocumentType[] });
                      }}
                      className="mt-0.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-gray-900">Activity Proposals</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Form AP-01 (Events & activities).
                      </div>
                    </div>
                  </label>

                  {/* Financial Liquidation */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      (formData.applicableWorkflows || []).includes('liquidation')
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(formData.applicableWorkflows || []).includes('liquidation')}
                      onChange={(e) => {
                        const cur = formData.applicableWorkflows || [];
                        const next = e.target.checked ? [...cur, 'liquidation'] : cur.filter((w) => w !== 'liquidation');
                        setFormData({ ...formData, applicableWorkflows: next as WorkflowDocumentType[] });
                      }}
                      className="mt-0.5 text-amber-600 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-gray-900">Financial Liquidations</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Form FL-01 (Cash & expense audit).
                      </div>
                    </div>
                  </label>

                  {/* Post-Activity Report */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      (formData.applicableWorkflows || []).includes('par')
                        ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(formData.applicableWorkflows || []).includes('par')}
                      onChange={(e) => {
                        const cur = formData.applicableWorkflows || [];
                        const next = e.target.checked ? [...cur, 'par'] : cur.filter((w) => w !== 'par');
                        setFormData({ ...formData, applicableWorkflows: next as WorkflowDocumentType[] });
                      }}
                      className="mt-0.5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-gray-900">Post-Activity Reports</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Form PAR-01 (Documentation & outcome).
                      </div>
                    </div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Select which document workflows (AP, FL, PAR) this signatory is authorized to review or endorse.
                </p>
              </div>

              {/* Default Formal Document Label */}
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                  Default Formal Document Label
                </label>
                <select
                  value={formData.defaultSignatoryLabel || (formData.actionType === 'approver' ? 'Approved by:' : 'Endorsed by:')}
                  onChange={(e) => setFormData({ ...formData, defaultSignatoryLabel: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent bg-white font-medium"
                >
                  {activeLabels.map((lbl) => (
                    <option key={lbl.id} value={lbl.label}>
                      {lbl.label} ({lbl.description || (lbl.isApproverLabel ? 'Approver' : 'Endorser')})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Default formal label appearing above this signatory's signature on official documents.
                </p>
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
                    className="text-[11px] text-[#0E4EBD] hover:underline flex items-center gap-1 font-medium"
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

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-bold rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100">
            <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between text-white">
              <h3 className="font-bold text-lg">Edit Signatory Details</h3>
              <button
                onClick={() => setEditingSignatory(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editingSignatory.name}
                  onChange={(e) =>
                    setEditingSignatory({ ...editingSignatory, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none"
                />
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

              {/* Action Capability: Endorser Only vs Approver */}
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                  Signatory Authority *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      editingSignatory.actionType === 'endorser' || editingSignatory.actionType === 'endorse' || !editingSignatory.actionType
                        ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200 shadow-2xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeEdit"
                      value="endorser"
                      checked={editingSignatory.actionType === 'endorser' || editingSignatory.actionType === 'endorse' || !editingSignatory.actionType}
                      onChange={() =>
                        setEditingSignatory({
                          ...editingSignatory,
                          actionType: 'endorser',
                          canApproveProposal: false,
                          canApproveLiquidation: false,
                          canApprovePar: false,
                        })
                      }
                      className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1.5">
                        <FileSignature className="w-4 h-4 text-sky-600" />
                        <span>Endorser Only</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Can only vet and endorse document workflows.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      editingSignatory.actionType === 'approver' || editingSignatory.actionType === 'approve'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200 shadow-2xs'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeEdit"
                      value="approver"
                      checked={editingSignatory.actionType === 'approver' || editingSignatory.actionType === 'approve'}
                      onChange={() =>
                        setEditingSignatory({
                          ...editingSignatory,
                          actionType: 'approver',
                          canApproveProposal: editingSignatory.canApproveProposal ?? true,
                          canApproveLiquidation: editingSignatory.canApproveLiquidation ?? true,
                          canApprovePar: editingSignatory.canApprovePar ?? true,
                        })
                      }
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Approver</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Has executive authority to grant final institutional approval.
                      </div>
                    </div>
                  </label>
                </div>

                {/* Granular Document Approval Authority when Approver is selected */}
                {(editingSignatory.actionType === 'approver' || editingSignatory.actionType === 'approve') && (
                  <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-emerald-950 uppercase tracking-wider block">
                      Approved Document Types (Executive Authority)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-emerald-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingSignatory.canApproveProposal)}
                          onChange={(e) =>
                            setEditingSignatory({ ...editingSignatory, canApproveProposal: e.target.checked })
                          }
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                        />
                        <span>Approve Proposals (AP)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-emerald-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingSignatory.canApproveLiquidation)}
                          onChange={(e) =>
                            setEditingSignatory({ ...editingSignatory, canApproveLiquidation: e.target.checked })
                          }
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                        />
                        <span>Approve Liquidations (FL)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-emerald-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editingSignatory.canApprovePar)}
                          onChange={(e) =>
                            setEditingSignatory({ ...editingSignatory, canApprovePar: e.target.checked })
                          }
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500"
                        />
                        <span>Approve PAR</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Document Workflow Scope */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider">
                    Document Workflow Scope *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const all: WorkflowDocumentType[] = ['proposal', 'liquidation', 'par'];
                      const current = editingSignatory.applicableWorkflows || [];
                      const next = current.length === 3 ? ['liquidation'] : all;
                      setEditingSignatory({ ...editingSignatory, applicableWorkflows: next });
                    }}
                    className="text-[11px] text-[#0E4EBD] hover:underline font-semibold"
                  >
                    {(editingSignatory.applicableWorkflows || []).length === 3 ? 'Deselect All' : 'Select All Workflows'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Activity Proposal */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      (editingSignatory.applicableWorkflows || []).includes('proposal')
                        ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(editingSignatory.applicableWorkflows || []).includes('proposal')}
                      onChange={(e) => {
                        const cur = editingSignatory.applicableWorkflows || [];
                        const next = e.target.checked ? [...cur, 'proposal'] : cur.filter((w) => w !== 'proposal');
                        setEditingSignatory({ ...editingSignatory, applicableWorkflows: next as WorkflowDocumentType[] });
                      }}
                      className="mt-0.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-gray-900">Activity Proposals</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Form AP-01 (Events & activities).
                      </div>
                    </div>
                  </label>

                  {/* Financial Liquidation */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      (editingSignatory.applicableWorkflows || []).includes('liquidation')
                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(editingSignatory.applicableWorkflows || []).includes('liquidation')}
                      onChange={(e) => {
                        const cur = editingSignatory.applicableWorkflows || [];
                        const next = e.target.checked ? [...cur, 'liquidation'] : cur.filter((w) => w !== 'liquidation');
                        setEditingSignatory({ ...editingSignatory, applicableWorkflows: next as WorkflowDocumentType[] });
                      }}
                      className="mt-0.5 text-amber-600 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-gray-900">Financial Liquidations</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Form FL-01 (Cash & expense audit).
                      </div>
                    </div>
                  </label>

                  {/* Post-Activity Report */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      (editingSignatory.applicableWorkflows || []).includes('par')
                        ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(editingSignatory.applicableWorkflows || []).includes('par')}
                      onChange={(e) => {
                        const cur = editingSignatory.applicableWorkflows || [];
                        const next = e.target.checked ? [...cur, 'par'] : cur.filter((w) => w !== 'par');
                        setEditingSignatory({ ...editingSignatory, applicableWorkflows: next as WorkflowDocumentType[] });
                      }}
                      className="mt-0.5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-gray-900">Post-Activity Reports</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Form PAR-01 (Documentation & outcome).
                      </div>
                    </div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Determines whether this signatory appears in Activity Proposals, Financial Liquidations, or Post-Activity Reports.
                </p>
              </div>

              {/* Default Formal Document Label */}
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                  Default Formal Document Label
                </label>
                <select
                  value={editingSignatory.defaultSignatoryLabel || (editingSignatory.actionType === 'approver' ? 'Approved by:' : 'Endorsed by:')}
                  onChange={(e) => setEditingSignatory({ ...editingSignatory, defaultSignatoryLabel: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent bg-white font-medium"
                >
                  {activeLabels.map((lbl) => (
                    <option key={lbl.id} value={lbl.label}>
                      {lbl.label} ({lbl.description || (lbl.isApproverLabel ? 'Approver' : 'Endorser')})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Default formal label appearing above this signatory's signature on official documents.
                </p>
              </div>


              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingSignatory(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-bold rounded-lg shadow-sm disabled:opacity-50"
                >
                  Save Changes
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
                  Label Text *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reviewed by: or Audited by:"
                  value={labelFormData.label}
                  onChange={(e) => setLabelFormData({ ...labelFormData, label: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  The exact prefix that will appear above the signatory's signature.
                </p>
              </div>

              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Authority Classification *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setLabelFormData({
                        ...labelFormData,
                        isApproverLabel: false,
                        actionType: 'endorse',
                      })
                    }
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      !labelFormData.isApproverLabel
                        ? 'bg-sky-50 border-sky-400 text-sky-900 ring-2 ring-sky-200 shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <FileSignature className="w-4 h-4 text-sky-600" />
                    <span>Endorser</span>
                    <span className="text-[10px] font-normal text-gray-500">Vet & Endorse</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLabelFormData({
                        ...labelFormData,
                        isApproverLabel: true,
                        actionType: 'approve',
                      })
                    }
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      labelFormData.isApproverLabel
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-200 shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Approver</span>
                    <span className="text-[10px] font-normal text-gray-500">Executive Approval</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Underlying Workflow Action
                </label>
                <select
                  value={labelFormData.actionType}
                  onChange={(e) => setLabelFormData({ ...labelFormData, actionType: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20"
                >
                  <option value="endorse">Endorse (Standard Review & Routing)</option>
                  <option value="check">Check (Auditor / Accountant Verification)</option>
                  <option value="approve">Approve (Final Executive Activation)</option>
                  <option value="note">Note (Administrative Notification)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Context / Usage Guidance
                </label>
                <input
                  type="text"
                  placeholder="e.g. IT Department technical compliance review"
                  value={labelFormData.description}
                  onChange={(e) => setLabelFormData({ ...labelFormData, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20"
                />
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
                  Label Text *
                </label>
                <input
                  type="text"
                  required
                  value={editingLabel.label}
                  onChange={(e) => setEditingLabel({ ...editingLabel, label: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Authority Classification *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingLabel({
                        ...editingLabel,
                        isApproverLabel: false,
                        actionType: editingLabel.actionType === 'approve' ? 'endorse' : editingLabel.actionType,
                      })
                    }
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      !editingLabel.isApproverLabel
                        ? 'bg-sky-50 border-sky-400 text-sky-900 ring-2 ring-sky-200 shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <FileSignature className="w-4 h-4 text-sky-600" />
                    <span>Endorser</span>
                    <span className="text-[10px] font-normal text-gray-500">Vet & Endorse</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingLabel({
                        ...editingLabel,
                        isApproverLabel: true,
                        actionType: 'approve',
                      })
                    }
                    className={`p-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      editingLabel.isApproverLabel
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-200 shadow-2xs'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Approver</span>
                    <span className="text-[10px] font-normal text-gray-500">Executive Approval</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Underlying Workflow Action
                </label>
                <select
                  value={editingLabel.actionType}
                  onChange={(e) => setEditingLabel({ ...editingLabel, actionType: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20"
                >
                  <option value="endorse">Endorse (Standard Review & Routing)</option>
                  <option value="check">Check (Auditor / Accountant Verification)</option>
                  <option value="approve">Approve (Final Executive Activation)</option>
                  <option value="note">Note (Administrative Notification)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#001A4D] uppercase tracking-wider mb-1">
                  Context / Usage Guidance
                </label>
                <input
                  type="text"
                  value={editingLabel.description}
                  onChange={(e) => setEditingLabel({ ...editingLabel, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-900 outline-none focus:ring-2 focus:ring-[#001A4D]/20"
                />
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
    </div>
  );
}
