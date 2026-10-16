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
  RefreshCw,
  AlertTriangle,
  Mail,
  KeyRound,
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import type { OrganizationDocument } from '../../modules/organizations/types/organization.types';
import { useOrganizationTypes } from '../../modules/organizations/hooks/useOrganizationTypes';
import { useDepartments } from '../../modules/academic';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import { useOrganizationStream } from '../../modules/organizations/hooks/useOrganizationStream';
import { useAdviserProfile } from '../../modules/auth';
import {
  updateOrganization,
  type AdviserUpdateOptions,
} from '../../modules/organizations/services/organization.service';
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
  const { data: allOrganizations = [] } = useOrganizationStream();
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
    department: 'cross-departmental',
    description: '',
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Adviser Management State ───
  const [adviserMode, setAdviserMode] = useState<'keep' | 'replace' | 'unassign'>('keep');
  const [newAdviserData, setNewAdviserData] = useState({
    name: '',
    email: '',
    employeeId: '',
    temporaryPassword: 'Adv-2026!#',
    sendEmailNotice: true,
  });
  const [adviserErrors, setAdviserErrors] = useState<{
    name?: string;
    email?: string;
    employeeId?: string;
  }>({});

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name || '',
        acronym: organization.acronym || '',
        typeId: organization.typeId || '',
        department:
          organization.departmentId ||
          (organization.isCrossDepartmental ? 'cross-departmental' : 'cross-departmental'),
        description: organization.description || '',
      });
      setLogoPreview(organization.logoUrl || null);
      setLogoFile(null);

      // Reset adviser mode & state
      setAdviserMode('keep');
      setNewAdviserData({
        name: '',
        email: '',
        employeeId: '',
        temporaryPassword: 'Adv-2026!#',
        sendEmailNotice: true,
      });
      setAdviserErrors({});
    }
  }, [organization]);

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
    const errors: { name?: string; email?: string; employeeId?: string } = {};
    const name = newAdviserData.name.trim();
    const email = newAdviserData.email.trim().toLowerCase();
    const employeeId = newAdviserData.employeeId.trim();

    if (!name) errors.name = 'Adviser full name is required.';
    if (!email) {
      errors.email = 'Adviser institutional email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }

    // 1. Uniqueness check against other organizations
    if (email) {
      const existingOtherOrg = allOrganizations.find(
        (o) => o.id !== organization.id && o.adviser?.email?.toLowerCase().trim() === email
      );
      if (existingOtherOrg) {
        errors.email = `This email is already assigned as Club Adviser for "${existingOtherOrg.name}". An adviser can only advise one organization.`;
      }
    }

    if (employeeId) {
      const existingOtherOrgEmp = allOrganizations.find(
        (o) => o.id !== organization.id && o.adviser?.employeeId?.trim() === employeeId
      );
      if (existingOtherOrgEmp) {
        errors.employeeId = `This Employee ID is already assigned to the adviser for "${existingOtherOrgEmp.name}".`;
      }
    }

    // 2. Conflict check against students roster
    if (allStudents && allStudents.length > 0) {
      const studentMatch = allStudents.find(
        (s) =>
          s.email?.toLowerCase().trim() === email ||
          (employeeId && s.studentId?.trim() === employeeId)
      );
      if (studentMatch) {
        if (studentMatch.email?.toLowerCase().trim() === email) {
          errors.email = `This email belongs to student "${studentMatch.firstName} ${studentMatch.lastName}". Club Advisers must use a faculty/employee account.`;
        } else if (employeeId) {
          errors.employeeId = `This ID belongs to student "${studentMatch.firstName} ${studentMatch.lastName}". Please enter a valid Faculty/Employee ID.`;
        }
      }
    }

    // 3. Direct Firestore check in organization_advisers collection for active advisers
    try {
      if (email) {
        const qEmail = query(
          collection(db, 'organization_advisers'),
          where('email', '==', email),
          where('isActive', '==', true)
        );
        const snap = await getDocs(qEmail);
        const otherMatch = snap.docs.find((d) => d.data().organizationId !== organization.id);
        if (otherMatch) {
          const adv = otherMatch.data();
          errors.email = `This email is already registered to active adviser "${adv.name}" (${adv.organizationName || 'Another Club'}).`;
        }
      }
    } catch (err) {
      console.warn('[validateNewAdviser] Firestore query notice:', err);
    }

    setAdviserErrors(errors);
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

    // Validate new adviser if in 'replace' mode
    if (adviserMode === 'replace') {
      const isValidAdviser = await validateNewAdviser();
      if (!isValidAdviser) {
        toast.error('Please fix the adviser details before saving.');
        return;
      }
    }

    const isCross = !formData.department || formData.department === 'cross-departmental';
    const selectedDept = departments.find((d) => d.id === formData.department);

    // Prepare adviser update payload
    let adviserUpdate: AdviserUpdateOptions = {
      action: 'keep',
      currentAdviser: organization.adviser || null,
      adminUser: adminName,
    };

    if (adviserMode === 'replace') {
      adviserUpdate = {
        action: 'assign',
        currentAdviser: organization.adviser || null,
        newAdviser: {
          name: newAdviserData.name.trim(),
          email: newAdviserData.email.trim().toLowerCase(),
          employeeId: newAdviserData.employeeId.trim(),
          departmentId: isCross ? 'cross-departmental' : formData.department,
          temporaryPassword: newAdviserData.temporaryPassword || 'Adv-2026!#',
        },
        adminUser: adminName,
        sendEmailNotice: newAdviserData.sendEmailNotice,
      };
    } else if (adviserMode === 'unassign') {
      adviserUpdate = {
        action: 'unassign',
        currentAdviser: organization.adviser || null,
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
          departmentId: isCross ? 'cross-departmental' : formData.department,
          departmentName: isCross
            ? 'Cross-Departmental / All Students'
            : selectedDept?.name || 'Academic Department',
          departmentCode: isCross ? 'ALL' : selectedDept?.code || '',
          department: isCross
            ? 'Cross-Departmental / All Students'
            : selectedDept?.name || 'Academic Department',
          scope: isCross ? 'cross-departmental' : 'departmental',
          isCrossDepartmental: isCross,
          description: formData.description.trim(),
        },
        logoFile,
        adviserUpdate
      );

      if (adviserMode === 'replace') {
        if (organization.adviser?.name) {
          toast.success(
            `Organization updated! Former adviser access revoked and new adviser "${newAdviserData.name}" assigned.`
          );
        } else {
          toast.success(
            `Organization updated! Club Adviser "${newAdviserData.name}" assigned successfully.`
          );
        }
      } else if (adviserMode === 'unassign') {
        toast.success(
          `Organization updated! Adviser unassigned and portal access revoked.`
        );
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

          {/* Type & Department */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-[#0E4EBD]" />
                <span>Department / Audience Scope *</span>
              </label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                disabled={loadingDepts}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0E4EBD]/30 focus:border-[#0E4EBD] outline-none disabled:opacity-50"
              >
                <option value="cross-departmental">🌐 Cross-Departmental (Open to All)</option>
                {activeDepartments.length > 0 && (
                  <optgroup label="Academic Departments (Department-Exclusive)">
                    {activeDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        🏛️ {d.code} — {d.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
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
                  <div className="bg-white border border-gray-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#001A4D] text-[#FFD41C] flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
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
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAdviserMode('replace');
                          setNewAdviserData({
                            name: '',
                            email: '',
                            employeeId: '',
                            temporaryPassword: 'Adv-2026!#',
                            sendEmailNotice: true,
                          });
                          setAdviserErrors({});
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold text-[#0E4EBD] bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Replace Adviser</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdviserMode('unassign')}
                        className="px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Unassign</span>
                      </button>
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
                        setAdviserMode('replace');
                        setNewAdviserData({
                          name: '',
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

            {/* State B: Unassign Confirmation */}
            {adviserMode === 'unassign' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs text-amber-900 leading-relaxed">
                    <strong>Access Revocation Notice:</strong> Saving changes will remove{' '}
                    <span className="font-bold underline">
                      {organization.adviser?.name}
                    </span>{' '}
                    as Club Adviser and{' '}
                    <strong>revoke their portal credentials and signing permissions</strong> for{' '}
                    {organization.name}.
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAdviserMode('keep')}
                    className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel Unassign (Keep Adviser)
                  </button>
                </div>
              </div>
            )}

            {/* State C: Assign / Replace Adviser Form */}
            {adviserMode === 'replace' && (
              <div className="bg-white border border-[#0E4EBD]/30 rounded-xl p-4 space-y-3.5 shadow-xs animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-xs font-bold text-[#001A4D]">
                    {organization.adviser?.name
                      ? 'Replace with New Club Adviser'
                      : 'Assign New Club Adviser'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdviserMode('keep');
                      setAdviserErrors({});
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                  >
                    Cancel & Keep Current
                  </button>
                </div>

                {organization.adviser?.name ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Automatic Revocation:</strong> Appointing a new adviser will
                      automatically revoke portal access for current adviser{' '}
                      <strong>{organization.adviser.name}</strong>.
                    </span>
                  </div>
                ) : (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-xs text-blue-900 leading-relaxed">
                    <ShieldCheck className="w-4 h-4 text-[#0E4EBD] shrink-0 mt-0.5" />
                    <span>
                      The appointed faculty adviser will receive login credentials via email to
                      lead the club and approve event proposals.
                    </span>
                  </div>
                )}

                {/* Form fields for new adviser */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                      Adviser Full Name *
                    </label>
                    <input
                      type="text"
                      value={newAdviserData.name}
                      onChange={(e) =>
                        setNewAdviserData({ ...newAdviserData, name: e.target.value })
                      }
                      placeholder="e.g. Prof. Maria Santos, MSIT"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none"
                    />
                    {adviserErrors.name && (
                      <p className="text-[11px] text-red-600 mt-1">{adviserErrors.name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                        Institutional Email *
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="email"
                          value={newAdviserData.email}
                          onChange={(e) =>
                            setNewAdviserData({ ...newAdviserData, email: e.target.value })
                          }
                          placeholder="faculty@ormoc.sti.edu.ph"
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none"
                        />
                      </div>
                      {adviserErrors.email && (
                        <p className="text-[11px] text-red-600 mt-1">{adviserErrors.email}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                        Faculty / Employee ID{' '}
                        <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={newAdviserData.employeeId}
                        onChange={(e) =>
                          setNewAdviserData({
                            ...newAdviserData,
                            employeeId: e.target.value,
                          })
                        }
                        placeholder="e.g. FAC-2026-042"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0E4EBD]/30 outline-none"
                      />
                      {adviserErrors.employeeId && (
                        <p className="text-[11px] text-red-600 mt-1">
                          {adviserErrors.employeeId}
                        </p>
                      )}
                    </div>
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
            disabled={isSaving}
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
