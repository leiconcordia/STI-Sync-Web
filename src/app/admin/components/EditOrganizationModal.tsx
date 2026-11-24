import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Upload,
  Loader2,
  Edit3,
  Image as ImageIcon,
  Building,
  ShieldCheck,
  UserCheck,
  UserX,
  UserPlus,
  Mail,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';
import type { OrganizationDocument } from '../../modules/organizations/types/organization.types';
import { useOrganizationTypes } from '../../modules/organizations/hooks/useOrganizationTypes';
import { useCourses, useDepartments } from '../../modules/academic';
import { useEmployees } from '../../modules/employees';
import { subscribeToSignatories, type InstitutionalSignatory } from '../../modules/signatories';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useOrgMembers } from '../../modules/organizations/hooks/useOrgMembers';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import { useAdviserProfile } from '../../modules/auth';
import {
  AdviserValidationError,
  updateOrganization,
  validateAdviserUniqueness,
  type AdviserUpdateOptions,
} from '../../modules/organizations/services/organization.service';
import { findAdviserConflictInOrganizations } from '../../modules/organizations/utils/adviser-validation.utils';
import { findDepartmentScopeConflicts } from '../../modules/organizations/utils/department-eligibility.utils';
import { formatStructuredFullName } from '../../utils/name.utils';
import { toast } from 'sonner';

interface EditOrganizationModalProps {
  organization: OrganizationDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditOrganizationModal({
  organization,
  isOpen,
  onClose,
  onSuccess,
}: EditOrganizationModalProps) {
  const { data: orgTypes, loading: loadingTypes } = useOrganizationTypes();
  const { data: departments = [], loading: loadingDepts } = useDepartments();
  const { data: courses = [] } = useCourses();
  const { data: allOrganizations = [] } = useOrganizationStream();
  const { data: employees = [] } = useEmployees();
  const [signatories, setSignatories] = useState<InstitutionalSignatory[]>([]);

  useEffect(() => {
    const unsub = subscribeToSignatories((list) => setSignatories(list));
    return () => unsub();
  }, []);
  const activeEmployees = useMemo(
    () => employees.filter((e) => !e.archived && e.status === 'ACTIVE'),
    [employees]
  );
  const [selectedAdviserEmployeeId, setSelectedAdviserEmployeeId] = useState('');
  const { members: orgMembers = [], loading: loadingOrgMembers } = useOrgMembers(organization?.id);
  const { data: allStudents = [] } = useStudents();
  const { profile } = useAdviserProfile();

  const activeDepartments = useMemo(
    () => departments.filter((d) => !d.archived),
    [departments]
  );

  const adminName = useMemo(() => {
    return (
      profile?.displayName ||
      (profile?.firstName ? `${profile.firstName} ${profile.lastName}`.trim() : null) ||
      'SAS Administrator'
    );
  }, [profile]);

  // Form Details State
  const [formData, setFormData] = useState({
    name: '',
    acronym: '',
    typeId: '',
    isCrossDepartmental: true,
    selectedDepartmentIds: [] as string[],
    description: '',
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Adviser Management State (Primary + Secondary Co-Adviser + Availability) ───
  const [adviserMode, setAdviserMode] = useState<'keep' | 'assign'>('keep');
  const [newAdviserData, setNewAdviserData] = useState({
    name: '',
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    employeeId: '',
    temporaryPassword: 'Adv-2026!#',
    sendEmailNotice: true,
  });
  const [adviserErrors, setAdviserErrors] = useState<{
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    employeeId?: string;
  }>({});

  const [coAdviserMode, setCoAdviserMode] = useState<'keep' | 'assign' | 'unassign'>('keep');
  const [selectedCoAdviserEmployeeId, setSelectedCoAdviserEmployeeId] = useState('');
  const [newCoAdviserData, setNewCoAdviserData] = useState({
    name: '',
    firstName: '',
    lastName: '',
    middleName: '',
    email: '',
    employeeId: '',
    temporaryPassword: 'CoAdv-2026!#',
    sendEmailNotice: true,
  });
  const [coAdviserErrors, setCoAdviserErrors] = useState<{
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    employeeId?: string;
  }>({});

  useEffect(() => {
    if (organization) {
      const existingAllowedIds = Array.isArray(organization.allowedDepartmentIds)
        ? organization.allowedDepartmentIds.filter((id) => id && id !== 'cross-departmental')
        : organization.departmentId && organization.departmentId !== 'cross-departmental'
          ? [organization.departmentId]
          : [];
      const isCross =
        organization.isCrossDepartmental === true ||
        organization.scope === 'cross-departmental' ||
        (existingAllowedIds.length === 0 &&
          (!organization.departmentId || organization.departmentId === 'cross-departmental'));

      setFormData({
        name: organization.name || '',
        acronym: organization.acronym || '',
        typeId: organization.typeId || '',
        isCrossDepartmental: isCross,
        selectedDepartmentIds: isCross ? [] : existingAllowedIds,
        description: organization.description || '',
      });
      setLogoPreview(organization.logoUrl || null);
      setLogoFile(null);

      // Reset adviser mode & state
      setAdviserMode('keep');
      setSelectedAdviserEmployeeId('');
      setNewAdviserData({
        name: '',
        firstName: '',
        lastName: '',
        middleName: '',
        email: '',
        employeeId: '',
        temporaryPassword: 'Adv-2026!#',
        sendEmailNotice: true,
      });
      setAdviserErrors({});

      setCoAdviserMode('keep');
      setSelectedCoAdviserEmployeeId('');
      setNewCoAdviserData({
        name: '',
        firstName: '',
        lastName: '',
        middleName: '',
        email: '',
        employeeId: '',
        temporaryPassword: `CoAdv-${Math.floor(1000 + Math.random() * 9000)}!#`,
        sendEmailNotice: true,
      });
      setCoAdviserErrors({});
    }
  }, [organization]);

  const studentsById = useMemo(() => {
    const map = new Map<string, any>();
    allStudents.forEach((s) => {
      if (s.studentId) map.set(String(s.studentId).trim(), s);
      if (s.authUid) map.set(String(s.authUid).trim(), s);
      if (s.id) map.set(String(s.id).trim(), s);
    });
    return map;
  }, [allStudents]);

  const scopeConflictCheck = useMemo(() => {
    const isCross = formData.isCrossDepartmental || formData.selectedDepartmentIds.length === 0;
    const selectedDepts = departments.filter((d) =>
      formData.selectedDepartmentIds.includes(d.id)
    );
    return findDepartmentScopeConflicts({
      proposedOrg: {
        id: organization?.id,
        departmentId: isCross ? 'cross-departmental' : (selectedDepts[0]?.id || 'cross-departmental'),
        allowedDepartmentIds: isCross ? [] : selectedDepts.map((d) => d.id),
        allowedDepartmentNames: isCross ? [] : selectedDepts.map((d) => d.name),
        allowedDepartmentCodes: isCross ? [] : selectedDepts.map((d) => d.code || d.name),
        scope: isCross ? 'cross-departmental' : 'departmental',
        isCrossDepartmental: isCross,
      },
      members: orgMembers,
      departments,
      courses,
      studentsById,
    });
  }, [
    formData.isCrossDepartmental,
    formData.selectedDepartmentIds,
    organization?.id,
    orgMembers,
    departments,
    courses,
    studentsById,
  ]);

  if (!isOpen || !organization) return null;

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  // ─── Validation for New Adviser ───
  const validateNewAdviser = async (): Promise<boolean> => {
    const errors: { name?: string; firstName?: string; lastName?: string; email?: string; employeeId?: string } = {};
    const firstName = (newAdviserData.firstName || '').trim();
    const lastName = (newAdviserData.lastName || '').trim();
    const middleName = (newAdviserData.middleName || '').trim();
    const name = formatStructuredFullName(firstName, lastName, middleName) || newAdviserData.name.trim();
    const email = newAdviserData.email.trim().toLowerCase();

    if (!firstName) errors.firstName = 'Adviser first name is required.';
    if (!lastName) errors.lastName = 'Adviser last name is required.';
    if (!name) errors.name = 'Adviser full name is required.';
    if (!email) {
      errors.email = 'Adviser institutional email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!Object.keys(errors).length) {
      const inMemoryConflict = findAdviserConflictInOrganizations({
        email,
        employeeId: newAdviserData.employeeId,
        organizations: allOrganizations,
        excludeOrgId: organization.id,
        excludeRole: 'primary',
      });
      if (inMemoryConflict) {
        errors[inMemoryConflict.field] = inMemoryConflict.message;
      }
    }

    if (!Object.keys(errors).length) {
      try {
        await validateAdviserUniqueness({
          email,
          employeeId: newAdviserData.employeeId,
          excludeOrgId: organization.id,
          excludeRole: 'primary',
        });
      } catch (error: any) {
        if (error instanceof AdviserValidationError) {
          errors[error.field] = error.message;
        } else {
          errors.email = error?.message || 'Unable to verify adviser email. Please try again.';
        }
      }
    }

    setAdviserErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─── Validation for New Secondary Co-Adviser ───
  const validateNewCoAdviser = async (): Promise<boolean> => {
    const errors: { name?: string; firstName?: string; lastName?: string; email?: string; employeeId?: string } = {};
    const firstName = (newCoAdviserData.firstName || '').trim();
    const lastName = (newCoAdviserData.lastName || '').trim();
    const middleName = (newCoAdviserData.middleName || '').trim();
    const name = formatStructuredFullName(firstName, lastName, middleName) || newCoAdviserData.name.trim();
    const email = newCoAdviserData.email.trim().toLowerCase();

    if (!firstName) errors.firstName = 'Please select an employee from Employee Maintenance.';
    if (!lastName) errors.lastName = 'Co-Adviser last name is required.';
    if (!name) errors.name = 'Co-Adviser full name is required.';
    if (!email) {
      errors.email = 'Co-Adviser institutional email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!Object.keys(errors).length) {
      // Check against the Primary Adviser being assigned right now (if any)
      const pendingPrimaryEmail =
        adviserMode === 'assign' ? newAdviserData.email.trim().toLowerCase() : (organization.adviser?.email || '').trim().toLowerCase();
      const pendingPrimaryEmpId =
        adviserMode === 'assign' ? newAdviserData.employeeId.trim().toLowerCase() : (organization.adviser?.employeeId || '').trim().toLowerCase();
      if (pendingPrimaryEmail && email === pendingPrimaryEmail) {
        errors.email = 'Co-Adviser cannot use the same email as the Primary Club Adviser.';
      } else if (pendingPrimaryEmpId && newCoAdviserData.employeeId.trim().toLowerCase() === pendingPrimaryEmpId) {
        errors.employeeId = 'Co-Adviser cannot be the same employee as the Primary Club Adviser.';
      }
    }

    if (!Object.keys(errors).length) {
      const inMemoryConflict = findAdviserConflictInOrganizations({
        email,
        employeeId: newCoAdviserData.employeeId,
        organizations: allOrganizations,
        excludeOrgId: organization.id,
        excludeRole: 'co_adviser',
      });
      if (inMemoryConflict) {
        errors[inMemoryConflict.field] = inMemoryConflict.message;
      }
    }

    if (!Object.keys(errors).length) {
      try {
        await validateAdviserUniqueness({
          email,
          employeeId: newCoAdviserData.employeeId,
          excludeOrgId: organization.id,
          excludeRole: 'co_adviser',
        });
      } catch (error: any) {
        if (error instanceof AdviserValidationError) {
          errors[error.field] = error.message;
        } else {
          errors.email = error?.message || 'Unable to verify Co-Adviser email. Please try again.';
        }
      }
    }

    setCoAdviserErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Organization Name is required.');
      return;
    }
    if (!formData.acronym.trim()) {
      toast.error('Acronym is required.');
      return;
    }
    if (!formData.typeId) {
      toast.error('Organization Type is required.');
      return;
    }

    // Validate new adviser if assigning an adviser
    if (adviserMode === 'assign') {
      const isValidAdviser = await validateNewAdviser();
      if (!isValidAdviser) {
        toast.error('Please fix the adviser details before saving.');
        return;
      }
    }

    // Validate new Co-Adviser if assigning/replacing Co-Adviser
    if (coAdviserMode === 'assign') {
      const isValidCoAdviser = await validateNewCoAdviser();
      if (!isValidCoAdviser) {
        toast.error('Please fix the Co-Adviser details before saving.');
        return;
      }
    }

    if (!formData.isCrossDepartmental && formData.selectedDepartmentIds.length === 0) {
      toast.error('Please select at least one department or enable Cross-Departmental.');
      return;
    }

    if (scopeConflictCheck.hasConflicts) {
      toast.error('Department scope conflict', {
        description:
          scopeConflictCheck.summaryMessage ||
          'Active members from excluded departments are still enrolled in this organization.',
      });
      return;
    }

    const isCross = formData.isCrossDepartmental || formData.selectedDepartmentIds.length === 0;
    const selectedDepts = departments.filter((d) =>
      formData.selectedDepartmentIds.includes(d.id)
    );
    const selectedIds = selectedDepts.map((d) => d.id);
    const selectedNames = selectedDepts.map((d) => d.name);
    const selectedCodes = selectedDepts.map((d) => d.code || d.name);

    // Prepare adviser update payload
    let adviserUpdate: AdviserUpdateOptions = {
      action: 'keep',
      currentAdviser: organization.adviser || null,
      adminUser: adminName,
    };

    if (adviserMode === 'assign') {
      const firstName = (newAdviserData.firstName || '').trim();
      const lastName = (newAdviserData.lastName || '').trim();
      const middleName = (newAdviserData.middleName || '').trim();
      const combinedName = formatStructuredFullName(firstName, lastName, middleName) || newAdviserData.name.trim();

      adviserUpdate = {
        action: 'assign',
        currentAdviser: organization.adviser || null,
        newAdviser: {
          name: combinedName,
          firstName,
          lastName,
          middleName,
          email: newAdviserData.email.trim().toLowerCase(),
          employeeId: newAdviserData.employeeId.trim(),
          departmentId: isCross ? 'cross-departmental' : (selectedIds[0] || 'cross-departmental'),
          temporaryPassword: newAdviserData.temporaryPassword || 'Adv-2026!#',
        },
        adminUser: adminName,
        sendEmailNotice: newAdviserData.sendEmailNotice,
      };
    }

    let coAdviserUpdate: AdviserUpdateOptions = {
      action: 'keep',
      adviserRole: 'co_adviser',
      currentAdviser: organization.coAdviser || null,
      adminUser: adminName,
    };

    if (coAdviserMode === 'assign') {
      const firstName = (newCoAdviserData.firstName || '').trim();
      const lastName = (newCoAdviserData.lastName || '').trim();
      const middleName = (newCoAdviserData.middleName || '').trim();
      const combinedName = formatStructuredFullName(firstName, lastName, middleName) || newCoAdviserData.name.trim();

      coAdviserUpdate = {
        action: 'assign',
        adviserRole: 'co_adviser',
        currentAdviser: organization.coAdviser || null,
        newAdviser: {
          name: combinedName,
          firstName,
          lastName,
          middleName,
          email: newCoAdviserData.email.trim().toLowerCase(),
          employeeId: newCoAdviserData.employeeId.trim(),
          departmentId: isCross ? 'cross-departmental' : (selectedIds[0] || 'cross-departmental'),
          temporaryPassword: newCoAdviserData.temporaryPassword || 'CoAdv-2026!#',
        },
        adminUser: adminName,
        sendEmailNotice: newCoAdviserData.sendEmailNotice,
      };
    } else if (coAdviserMode === 'unassign') {
      coAdviserUpdate = {
        action: 'unassign',
        adviserRole: 'co_adviser',
        currentAdviser: organization.coAdviser || null,
        adminUser: adminName,
      };
    }

    setIsSaving(true);
    try {
      await updateOrganization(
        organization.id,
        {
          name: formData.name.trim(),
          acronym: formData.acronym.trim().toUpperCase(),
          typeId: formData.typeId,
          departmentId: isCross ? 'cross-departmental' : (selectedIds[0] || 'cross-departmental'),
          departmentName: isCross
            ? 'Cross-Departmental / All Students'
            : selectedNames.join(', ') || 'Academic Department',
          departmentCode: isCross ? 'ALL' : selectedCodes.join(', '),
          department: isCross
            ? 'Cross-Departmental / All Students'
            : selectedNames.join(', ') || 'Academic Department',
          allowedDepartmentIds: isCross ? [] : selectedIds,
          allowedDepartmentNames: isCross ? [] : selectedNames,
          allowedDepartmentCodes: isCross ? [] : selectedCodes,
          scope: isCross ? 'cross-departmental' : 'departmental',
          isCrossDepartmental: isCross,
          description: formData.description.trim(),
        },
        logoFile,
        adviserUpdate,
        coAdviserUpdate
      );

      if (adviserMode === 'assign' || coAdviserMode === 'assign') {
        toast.success('Organization & Adviser assignment saved successfully!');
      } else if (coAdviserMode === 'unassign') {
        toast.success('Organization updated and Secondary Co-Adviser removed.');
      } else {
        toast.success('Organization updated successfully!', {
          description: `${formData.name} details have been saved.`,
        });
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Update organization failed:', err);
      toast.error('Failed to update organization', {
        description: err?.message || 'Something went wrong.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden z-10">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5 text-white">
            <Edit3 className="w-5 h-5 text-[#FFC107]" />
            <h2 className="font-bold text-lg">Edit Organization Details</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          id="edit-org-form"
          onSubmit={handleSubmit}
          className="p-6 overflow-y-auto flex-1 space-y-5"
        >
          {/* Logo Upload Section */}
          <div className="flex items-center gap-5 p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <div className="w-16 h-16 bg-[#001A4D] rounded-xl border-2 border-white shadow-md overflow-hidden flex items-center justify-center flex-shrink-0">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Organization Logo
              </label>
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                <Upload className="w-3.5 h-3.5 text-[#0E4EBD]" />
                Change Logo Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-gray-400 mt-1">PNG, JPG or WebP (max 5MB)</p>
            </div>
          </div>

          {/* Name & Acronym */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Acronym *
              </label>
              <input
                type="text"
                required
                value={formData.acronym}
                onChange={(e) => setFormData({ ...formData, acronym: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none"
              />
            </div>
          </div>

          {/* Organization Type */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Organization Type *
            </label>
            <select
              value={formData.typeId}
              onChange={(e) => setFormData({ ...formData, typeId: e.target.value })}
              disabled={loadingTypes}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none disabled:opacity-50"
            >
              <option value="">Select type...</option>
              {orgTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department / Audience Scope (Cross-Departmental + Multi-Department Checkboxes) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700 flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-[#0E4EBD]" />
              <span>Department / Audience Scope *</span>
            </label>
            <div className="border border-gray-300 rounded-xl p-3 space-y-2.5 bg-white">
              <label className="flex items-start gap-2.5 p-2 rounded-lg border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={formData.isCrossDepartmental}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData({
                      ...formData,
                      isCrossDepartmental: checked,
                      selectedDepartmentIds: checked ? [] : formData.selectedDepartmentIds,
                    });
                  }}
                  disabled={loadingDepts}
                  className="mt-0.5 w-4 h-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-emerald-900">
                    🌐 Cross-Departmental (Open to All Students)
                  </div>
                  <div className="text-[11px] text-emerald-700">
                    Any enrolled student from any department can join.
                  </div>
                </div>
              </label>

              {!formData.isCrossDepartmental && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600">
                    <span>Allowed Department(s) ({formData.selectedDepartmentIds.length} selected)</span>
                    {formData.selectedDepartmentIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, selectedDepartmentIds: [] })}
                        className="text-[#0E4EBD] hover:underline cursor-pointer"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {activeDepartments.map((d) => {
                      const isChecked = formData.selectedDepartmentIds.includes(d.id);
                      const deptMemberCount = scopeConflictCheck.activeMemberCountsByDeptId[d.id] || 0;
                      return (
                        <label
                          key={d.id}
                          className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-[#0E4EBD] bg-blue-50/70 text-[#001A4D]'
                              : deptMemberCount > 0
                                ? 'border-amber-300 bg-amber-50/40 text-amber-950 hover:bg-amber-50/70'
                                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...formData.selectedDepartmentIds, d.id]
                                : formData.selectedDepartmentIds.filter((id) => id !== d.id);
                              setFormData({
                                ...formData,
                                selectedDepartmentIds: nextIds,
                              });
                            }}
                            disabled={loadingDepts}
                            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#0E4EBD] focus:ring-[#0E4EBD] cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold leading-tight block">
                              {d.code} — {d.name}
                            </span>
                            {deptMemberCount > 0 && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-white/90 border border-gray-200 text-[10px] font-bold text-gray-600">
                                {deptMemberCount} active member{deptMemberCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {scopeConflictCheck.hasConflicts && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 space-y-1.5">
                <div className="flex items-start gap-2 font-bold text-rose-800">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>
                    Cannot restrict scope: {scopeConflictCheck.totalConflictingMembers} active member
                    {scopeConflictCheck.totalConflictingMembers === 1 ? '' : 's'} belong to excluded department(s)
                  </span>
                </div>
                <ul className="list-disc pl-6 space-y-0.5 text-[11px] text-rose-800">
                  {scopeConflictCheck.conflictsByDepartment.map((c) => (
                    <li key={c.departmentId || c.departmentLabel}>
                      <strong>{c.departmentLabel}</strong>: {c.count} active member{c.count === 1 ? '' : 's'}
                      {c.memberNames.length > 0 ? ` (${c.memberNames.join(', ')}${c.count > c.memberNames.length ? ', …' : ''})` : ''}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-rose-700 pl-6">
                  Include those department(s) above, keep <strong>Cross-Departmental</strong>, or remove those members from the organization roster first.
                </p>
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              {formData.isCrossDepartmental
                ? 'Open to all enrolled students regardless of department.'
                : 'Only students from the checked department(s) can join this organization.'}
            </p>
          </div>

          {/* ─── Club Adviser Assignment Section ─── */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#001A4D]">
                <ShieldCheck className="w-4 h-4 text-[#0E4EBD]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Club Adviser
                </span>
              </div>
              {organization.adviser?.name ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Assigned
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                  Unassigned
                </span>
              )}
            </div>

            {/* State A: Keep Current Adviser (Default View) */}
            {adviserMode === 'keep' && (
              <div>
                {organization.adviser?.name ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-3.5 flex flex-col gap-3 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[#001A4D] text-sm truncate">
                          {organization.adviser.name}
                        </p>
                        <p className="text-xs text-gray-500 font-mono truncate">
                          {organization.adviser.email}
                          {organization.adviser.employeeId
                            ? ` • ID: ${organization.adviser.employeeId}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-gray-500 text-xs">
                      <UserX className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>No adviser currently assigned to this organization.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAdviserMode('assign');
                        setNewAdviserData({
                          name: '',
                          firstName: '',
                          middleName: '',
                          existingAccountUid: '',
                          lastName: '',
                          email: '',
                          employeeId: '',
                          temporaryPassword: 'Adv-2026!#',
                          sendEmailNotice: true,
                        });
                        setAdviserErrors({});
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-[#001A4D] hover:bg-[#0E4EBD] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#FFD41C]" />
                      <span>Assign Club Adviser</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* State B: Assign Adviser Form */}
            {adviserMode === 'assign' && (
              <div className="bg-white border border-[#0E4EBD]/30 rounded-xl p-4 space-y-3.5 shadow-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-[#001A4D]">
                    Assign New Club Adviser
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdviserMode('keep');
                      setAdviserErrors({});
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-xs text-blue-900 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
                  <span>
                    The appointed faculty adviser will receive login credentials via email to lead the club and approve event proposals.
                  </span>
                </div>

                {/* Form fields for new adviser */}
                <div className="space-y-3">
                  {/* Employee Dropdown Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-gray-700 uppercase">
                      Select Faculty / Employee <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedAdviserEmployeeId}
                      onChange={(e) => {
                        const empDocId = e.target.value;
                        setSelectedAdviserEmployeeId(empDocId);
                        const emp = activeEmployees.find((item) => item.id === empDocId);
                        if (!emp) {
                          setNewAdviserData({
                            ...newAdviserData,
                            firstName: '',
                            middleName: '',
                            lastName: '',
                            name: '',
                            employeeId: '',
                          });
                          return;
                        }
                        const name = formatStructuredFullName(emp.firstName, emp.lastName, emp.middleName) || emp.fullName;
                        setNewAdviserData({
                          ...newAdviserData,
                          firstName: emp.firstName,
                          middleName: emp.middleName || '',
                          lastName: emp.lastName,
                          name,
                          employeeId: emp.employeeId,
                        });
                        setAdviserErrors((prev) => ({
                          ...prev,
                          firstName: undefined,
                          lastName: undefined,
                          name: undefined,
                          employeeId: undefined,
                        }));
                      }}
                      className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none ${
                        adviserErrors.firstName || adviserErrors.lastName || adviserErrors.name
                          ? 'border-red-400 bg-red-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <option value="">
                        {activeEmployees.length === 0
                          ? 'No employees found — upload Excel in Settings → Employee Maintenance'
                          : 'Select an employee to assign as Club Adviser...'}
                      </option>
                      {activeEmployees.map((emp) => {
                        const empIdNorm = String(emp.employeeId || '').trim().toLowerCase();
                        const empNameNorm = String(emp.fullName || '').trim().toLowerCase();
                        const isAlreadyAdviser = allOrganizations.some((o) => {
                          if (o.status === 'archived') return false;
                          const matchSlot = (slot?: { employeeId?: string; name?: string } | null) =>
                            Boolean(
                              slot &&
                                ((empIdNorm && String(slot.employeeId || '').trim().toLowerCase() === empIdNorm) ||
                                  (empNameNorm && String(slot.name || '').trim().toLowerCase() === empNameNorm))
                            );
                          if (o.id === organization.id) {
                            return matchSlot(o.coAdviser);
                          }
                          return matchSlot(o.adviser) || matchSlot(o.coAdviser);
                        });
                        const isAlreadySignatory = signatories.some(
                          (s) =>
                            s.isActive !== false &&
                            ((empIdNorm && String((s as any).employeeId || '').trim().toLowerCase() === empIdNorm) ||
                              (empNameNorm && String(s.name || '').trim().toLowerCase() === empNameNorm))
                        );
                        const disabledReason = isAlreadyAdviser
                          ? ' (Already Club Adviser)'
                          : isAlreadySignatory
                            ? ' (Already Institutional Signatory)'
                            : '';
                        return (
                          <option
                            key={emp.id}
                            value={emp.id}
                            disabled={isAlreadyAdviser || isAlreadySignatory}
                          >
                            {emp.lastName}, {emp.firstName}{emp.middleName ? ` ${emp.middleName[0]}.` : ''} ({emp.employeeId})
                            {emp.positionTitle ? ` — ${emp.positionTitle}` : ''}
                            {disabledReason}
                          </option>
                        );
                      })}
                    </select>

                    {newAdviserData.name && (
                      <div className="px-3 py-1.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-xs text-[#001A4D] flex items-center justify-between">
                        <span className="font-bold text-[#0E4EBD]">{newAdviserData.name}</span>
                        {newAdviserData.employeeId && (
                          <span className="px-2 py-0.5 bg-white border border-blue-200 rounded font-mono text-[10px] font-bold text-[#001A4D]">
                            {newAdviserData.employeeId}
                          </span>
                        )}
                      </div>
                    )}
                    {(adviserErrors.firstName || adviserErrors.lastName || adviserErrors.name) && (
                      <p className="text-[11px] text-red-600 mt-1">
                        {adviserErrors.firstName || adviserErrors.lastName || adviserErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                      Institutional Email *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="email"
                        value={newAdviserData.email}
                        onChange={(e) => {
                          setNewAdviserData({ ...newAdviserData, email: e.target.value });
                          if (adviserErrors.email) setAdviserErrors({ ...adviserErrors, email: undefined });
                        }}
                        placeholder="faculty@ormoc.sti.edu.ph"
                        className={`w-full pl-9 pr-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none ${adviserErrors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                      />
                    </div>
                    {adviserErrors.email && (
                      <p className="text-[11px] text-red-600 mt-1">{adviserErrors.email}</p>
                    )}
                    {adviserErrors.employeeId && (
                      <p className="text-[11px] text-red-600 mt-1">{adviserErrors.employeeId}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                        Initial Temporary Password
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newAdviserData.temporaryPassword}
                          onChange={(e) =>
                            setNewAdviserData({
                              ...newAdviserData,
                              temporaryPassword: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-gray-50 focus:bg-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setNewAdviserData({
                              ...newAdviserData,
                              temporaryPassword: `Adv-${Math.floor(
                                1000 + Math.random() * 9000
                              )}!#`,
                            })
                          }
                          className="px-2 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300 shrink-0 cursor-pointer"
                          title="Generate new temporary password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newAdviserData.sendEmailNotice}
                          onChange={(e) =>
                            setNewAdviserData({
                              ...newAdviserData,
                              sendEmailNotice: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded text-[#0E4EBD] focus:ring-[#0E4EBD] cursor-pointer"
                        />
                        <span>Send login credentials via email</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Secondary Club Adviser / Co-Adviser & Availability Section ─── */}
          <div className="border border-indigo-200/90 rounded-xl p-4 bg-indigo-50/35 space-y-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-[#001A4D]">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Secondary Club Adviser / Co-Adviser
                </span>
              </div>
              {coAdviserMode === 'unassign' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                  Will Be Removed on Save
                </span>
              ) : organization.coAdviser?.name ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Assigned
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                  Optional • Unassigned
                </span>
              )}
            </div>

            {/* State A: Keep Current Co-Adviser */}
            {coAdviserMode === 'keep' && (
              <div>
                {organization.coAdviser?.name ? (
                  <div className="bg-white border border-indigo-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[#001A4D] text-sm truncate">
                          {organization.coAdviser.name}
                        </p>
                        <p className="text-xs text-gray-500 font-mono truncate">
                          {organization.coAdviser.email}
                          {organization.coAdviser.employeeId ? ` • ID: ${organization.coAdviser.employeeId}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCoAdviserMode('assign');
                          setSelectedCoAdviserEmployeeId('');
                          setCoAdviserErrors({});
                        }}
                        className="px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setCoAdviserMode('unassign')}
                        className="px-2.5 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-dashed border-indigo-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-gray-600 text-xs">
                      <UserX className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>No Secondary Co-Adviser assigned. Assign one from Employee Maintenance for backup coverage.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCoAdviserMode('assign');
                        setSelectedCoAdviserEmployeeId('');
                        setNewCoAdviserData({
                          name: '',
                          firstName: '',
                          middleName: '',
                          lastName: '',
                          email: '',
                          employeeId: '',
                          temporaryPassword: `CoAdv-${Math.floor(1000 + Math.random() * 9000)}!#`,
                          sendEmailNotice: true,
                        });
                        setCoAdviserErrors({});
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Assign Co-Adviser</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* State B: Pending Removal */}
            {coAdviserMode === 'unassign' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-rose-900">
                <span>
                  <strong>{organization.coAdviser?.name}</strong> will be unassigned and their Co-Adviser access revoked when you click <strong>Save Changes</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setCoAdviserMode('keep')}
                  className="text-xs font-bold text-rose-700 underline shrink-0 cursor-pointer"
                >
                  Undo
                </button>
              </div>
            )}

            {/* State C: Assign / Replace Co-Adviser Form */}
            {coAdviserMode === 'assign' && (
              <div className="bg-white border border-indigo-300/60 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-[#001A4D]">
                    {organization.coAdviser?.name ? 'Replace Secondary Co-Adviser' : 'Assign Secondary Co-Adviser'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCoAdviserMode('keep');
                      setCoAdviserErrors({});
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-gray-700 uppercase">
                    Select Faculty / Employee (Employee Maintenance) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCoAdviserEmployeeId}
                    onChange={(e) => {
                      const empDocId = e.target.value;
                      setSelectedCoAdviserEmployeeId(empDocId);
                      const emp = activeEmployees.find((item) => item.id === empDocId);
                      if (!emp) {
                        setNewCoAdviserData({
                          ...newCoAdviserData,
                          firstName: '',
                          middleName: '',
                          lastName: '',
                          name: '',
                          employeeId: '',
                        });
                        return;
                      }
                      const name = formatStructuredFullName(emp.firstName, emp.lastName, emp.middleName) || emp.fullName;
                      setNewCoAdviserData({
                        ...newCoAdviserData,
                        firstName: emp.firstName,
                        middleName: emp.middleName || '',
                        lastName: emp.lastName,
                        name,
                        employeeId: emp.employeeId,
                      });
                      setCoAdviserErrors((prev) => ({
                        ...prev,
                        firstName: undefined,
                        lastName: undefined,
                        name: undefined,
                        employeeId: undefined,
                      }));
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none ${
                      coAdviserErrors.firstName || coAdviserErrors.lastName || coAdviserErrors.name
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-300'
                    }`}
                  >
                    <option value="">
                      {activeEmployees.length === 0
                        ? 'No employees found — upload Excel in Settings → Employee Maintenance'
                        : 'Select an employee to assign as Club Co-Adviser...'}
                    </option>
                    {activeEmployees.map((emp) => {
                      const empIdNorm = String(emp.employeeId || '').trim().toLowerCase();
                      const empNameNorm = String(emp.fullName || '').trim().toLowerCase();
                      const isAlreadyAssigned = allOrganizations.some((o) => {
                        if (o.status === 'archived') return false;
                        const matchSlot = (slot?: { employeeId?: string; name?: string } | null) =>
                          Boolean(
                            slot &&
                              ((empIdNorm && String(slot.employeeId || '').trim().toLowerCase() === empIdNorm) ||
                                (empNameNorm && String(slot.name || '').trim().toLowerCase() === empNameNorm))
                          );
                        if (o.id === organization.id) {
                          return matchSlot(o.adviser);
                        }
                        return matchSlot(o.adviser) || matchSlot(o.coAdviser);
                      });
                      const isAlreadySignatory = signatories.some(
                        (s) =>
                          s.isActive !== false &&
                          ((empIdNorm && String((s as any).employeeId || '').trim().toLowerCase() === empIdNorm) ||
                            (empNameNorm && String(s.name || '').trim().toLowerCase() === empNameNorm))
                      );
                      const disabledReason = isAlreadyAssigned
                        ? ' (Already Club Adviser / Co-Adviser)'
                        : isAlreadySignatory
                          ? ' (Already Institutional Signatory)'
                          : '';
                      return (
                        <option key={emp.id} value={emp.id} disabled={isAlreadyAssigned || isAlreadySignatory}>
                          {emp.lastName}, {emp.firstName}{emp.middleName ? ` ${emp.middleName[0]}.` : ''} ({emp.employeeId})
                          {emp.positionTitle ? ` — ${emp.positionTitle}` : ''}
                          {disabledReason}
                        </option>
                      );
                    })}
                  </select>
                  {newCoAdviserData.name && (
                    <div className="px-3 py-1.5 bg-indigo-50/70 border border-indigo-200/80 rounded-lg text-xs text-[#001A4D] flex items-center justify-between">
                      <span className="font-bold text-indigo-800">{newCoAdviserData.name}</span>
                      {newCoAdviserData.employeeId && (
                        <span className="px-2 py-0.5 bg-white border border-indigo-200 rounded font-mono text-[10px] font-bold text-[#001A4D]">
                          {newCoAdviserData.employeeId}
                        </span>
                      )}
                    </div>
                  )}
                  {(coAdviserErrors.firstName || coAdviserErrors.lastName || coAdviserErrors.name) && (
                    <p className="text-[11px] text-red-600 mt-1">
                      {coAdviserErrors.firstName || coAdviserErrors.lastName || coAdviserErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                    Co-Adviser Institutional Email *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="email"
                      value={newCoAdviserData.email}
                      onChange={(e) => {
                        setNewCoAdviserData({ ...newCoAdviserData, email: e.target.value });
                        if (coAdviserErrors.email) setCoAdviserErrors({ ...coAdviserErrors, email: undefined });
                      }}
                      placeholder="coadviser@ormoc.sti.edu.ph"
                      className={`w-full pl-9 pr-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/30 outline-none ${
                        coAdviserErrors.email ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {coAdviserErrors.email && <p className="text-[11px] text-red-600 mt-1">{coAdviserErrors.email}</p>}
                  {coAdviserErrors.employeeId && <p className="text-[11px] text-red-600 mt-1">{coAdviserErrors.employeeId}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                      Initial Temporary Password
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCoAdviserData.temporaryPassword}
                        onChange={(e) =>
                          setNewCoAdviserData({ ...newCoAdviserData, temporaryPassword: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono bg-gray-50 focus:bg-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNewCoAdviserData({
                            ...newCoAdviserData,
                            temporaryPassword: `CoAdv-${Math.floor(1000 + Math.random() * 9000)}!#`,
                          })
                        }
                        className="px-2 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300 shrink-0 cursor-pointer"
                        title="Generate new temporary password"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newCoAdviserData.sendEmailNotice}
                        onChange={(e) =>
                          setNewCoAdviserData({ ...newCoAdviserData, sendEmailNotice: e.target.checked })
                        }
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Send login credentials via email</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter brief summary of the organization..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-org-form"
            disabled={isSaving || loadingOrgMembers || scopeConflictCheck.hasConflicts}
            className="px-5 py-2 text-xs font-bold text-white bg-[#001A4D] rounded-lg hover:bg-[#0E4EBD] transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSaving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
