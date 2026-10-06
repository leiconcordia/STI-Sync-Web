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

export default function InstitutionalSignatoryManagement() {
  const { profile } = useAdviserProfile();
  const { roles: dbRoles, loading: rolesLoading } = useSignatoryRolesStream();
  const { data: departments = [] } = useDepartments();
  const activeDepartments = React.useMemo(() => departments.filter((d) => !d.archived), [departments]);

  const [activeTab, setActiveTab] = useState<'signatories' | 'roles'>('signatories');
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('all');
  const [roleSearchQuery, setRoleSearchQuery] = useState('');

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
    employeeId: '',
    temporaryPassword: '',
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
      employeeId: '',
      department: '',
      departmentId: '',
      temporaryPassword: generateTemporaryPassword(),
    });
    setIsAddModalOpen(true);
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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.roleTitle.trim()) {
      toast.error('Please enter Full Name, Official Email, and Signatory Role / Title.');
      return;
    }

    const cleanTitle = formData.roleTitle.trim();
    const cleanRole = cleanTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    setIsSubmitting(true);
    try {
      const res = await createInstitutionalSignatory(
        {
          ...formData,
          role: cleanRole,
          roleTitle: cleanTitle,
          actionType: formData.actionType || 'endorser',
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
    const cleanRole = cleanTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    setIsSubmitting(true);
    try {
      await updateSignatoryDetails(editingSignatory.id, {
        name: editingSignatory.name.trim(),
        role: cleanRole,
        roleTitle: cleanTitle,
        actionType: editingSignatory.actionType || 'endorser',
        employeeId: editingSignatory.employeeId ? editingSignatory.employeeId.trim() : '',
        department: editingSignatory.department || '',
        departmentId: editingSignatory.departmentId || '',
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

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#001A4D] hover:bg-[#0A2E6D] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4 text-[#FFD41C]" />
          Add Institutional Signatory
        </button>
      </div>

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
                Gate 1 Locked
              </span>
            </div>
            <p className="text-xs text-blue-200 mt-0.5">
              Maintain the authorized SAS Head / Coordinator name, position title, and digital e-signature automatically stamped on all student proposals.
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
                      <div className="font-semibold text-gray-800">{sig.roleTitle}</div>
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
                          onClick={() => setEditingSignatory(sig)}
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

              {/* Action Capability: Endorser Only vs Approver Only vs Both */}
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                  Signatory Authority Capability *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      formData.actionType === 'endorser' || formData.actionType === 'endorse'
                        ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeAdd"
                      value="endorser"
                      checked={formData.actionType === 'endorser' || formData.actionType === 'endorse'}
                      onChange={() => setFormData({ ...formData, actionType: 'endorser' })}
                      className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1">
                        <FileSignature className="w-3.5 h-3.5 text-sky-600" />
                        Endorser Only
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Can only vet & endorse proposals.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      formData.actionType === 'approver' || formData.actionType === 'approve'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeAdd"
                      value="approver"
                      checked={formData.actionType === 'approver' || formData.actionType === 'approve'}
                      onChange={() => setFormData({ ...formData, actionType: 'approver' })}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Approver Only
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Has power to give final executive approval.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      formData.actionType === 'both'
                        ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeAdd"
                      value="both"
                      checked={formData.actionType === 'both'}
                      onChange={() => setFormData({ ...formData, actionType: 'both' })}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
                        Both
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Flexible: can switch between Endorser or Approver.
                      </div>
                    </div>
                  </label>
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

              {/* Action Capability: Endorser Only vs Approver Only vs Both */}
              <div>
                <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                  Signatory Authority Capability *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      editingSignatory.actionType === 'endorser' || editingSignatory.actionType === 'endorse'
                        ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeEdit"
                      value="endorser"
                      checked={editingSignatory.actionType === 'endorser' || editingSignatory.actionType === 'endorse'}
                      onChange={() => setEditingSignatory({ ...editingSignatory, actionType: 'endorser' })}
                      className="mt-0.5 text-sky-600 focus:ring-sky-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1">
                        <FileSignature className="w-3.5 h-3.5 text-sky-600" />
                        Endorser Only
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Can only vet & endorse.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      editingSignatory.actionType === 'approver' || editingSignatory.actionType === 'approve'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeEdit"
                      value="approver"
                      checked={editingSignatory.actionType === 'approver' || editingSignatory.actionType === 'approve'}
                      onChange={() => setEditingSignatory({ ...editingSignatory, actionType: 'approver' })}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Approver Only
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Final executive approval.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      editingSignatory.actionType === 'both'
                        ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionTypeEdit"
                      value="both"
                      checked={editingSignatory.actionType === 'both'}
                      onChange={() => setEditingSignatory({ ...editingSignatory, actionType: 'both' })}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="font-bold text-gray-900 flex items-center gap-1">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
                        Both
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Flexible authority.
                      </div>
                    </div>
                  </label>
                </div>
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
    </div>
  );
}
