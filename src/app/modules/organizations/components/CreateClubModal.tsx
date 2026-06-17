import { useState, useMemo, useEffect, useRef } from 'react';
import {
  X, Upload, Crown, Star, FileText, Calculator, ClipboardCheck, Users,
  Plus, Mail, Lock, Eye, EyeOff, Building, ChevronDown, Check, ArrowRight,
  ArrowLeft, Search, Loader2, AlertCircle
} from 'lucide-react';
import { useOrganizationTypes } from '../hooks/useOrganizationTypes';
import { useOrganizationMutations } from '../hooks/useOrganizationMutations';
import { useDepartments, useSemesters } from '../../academic';
import { useRoles } from '../../roles';
import { useStudents } from '../../students/hooks/useStudentStream';
import type { CreateOrganizationPayload } from '../types/organization.types';

// ─── Props ────────────────────────────────────────────────────────────────────
interface CreateClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  createdBy?: string;
  onSuccess?: () => void;
}

interface OfficerAssignment {
  roleId: string;
  roleName: string;
  isRequired: boolean;
  studentName?: string;
  studentId?: string;
  email?: string;
  password?: string;
  avatar?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────
interface Step1Errors {
  name?: string;
  typeId?: string;
  department?: string;
  acronym?: string;
  schoolYear?: string;
  description?: string;
  logo?: string;
}

function validateStep1(form: ReturnType<typeof useFormState>['formData']) {
  const errors: Step1Errors = {};
  if (!form.name.trim()) errors.name = 'Organization name is required.';
  if (!form.typeId) errors.typeId = 'Please select an organization type.';
  if (!form.department) errors.department = 'Please select a department.';
  if (!form.acronym.trim()) errors.acronym = 'Acronym is required.';
  if (!form.description.trim()) errors.description = 'Description is required.';
  if (!form.logo) errors.logo = 'Organization logo is required.';
  return errors;
}

function useFormState() {
  const [formData, setFormData] = useState({
    name: '',
    typeId: '',
    department: '',
    acronym: '',
    schoolYear: '',
    semester: '',
    description: '',
    logo: null as File | null,
  });
  return { formData, setFormData };
}

// ─── Role icons ───────────────────────────────────────────────────────────────
function getRoleIcon(role: string) {
  switch (role) {
    case 'President': return Crown;
    case 'Vice President': return Star;
    case 'Secretary': return FileText;
    case 'Treasurer': return Calculator;
    case 'Auditor': return ClipboardCheck;
    case 'P.R.O.': return Users;
    default: return Users;
  }
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { number: 1, label: 'Organization Details' },
    { number: 2, label: 'Assign Officers' },
    { number: 3, label: 'Review & Confirm' },
  ];
  return (
    <div className="flex items-center justify-center gap-2 py-6 border-b border-gray-200">
      {steps.map((step, idx) => (
        <div key={step.number} className="flex items-center">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${current > step.number
                ? 'bg-[#0E4EBD] text-white'
                : current === step.number
                  ? 'bg-[#FFC107] text-[#001A4D]'
                  : 'bg-[#E0E0E0] text-gray-500'
              }`}>
              {current > step.number ? <Check className="w-4 h-4" /> : step.number}
            </div>
            <span className={`text-sm font-medium ${current === step.number ? 'text-[#001A4D]' : 'text-gray-500'}`}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-16 h-0.5 mx-3 ${current > step.number ? 'bg-[#0E4EBD]' : 'bg-[#E0E0E0]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Field error ──────────────────────────────────────────────────────────────
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-red-600 mt-1">
      <AlertCircle className="w-3 h-3" /> {msg}
    </p>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CreateClubModal({ isOpen, onClose, createdBy = 'system', onSuccess }: CreateClubModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Live data ───────────────────────────────────────────────────────────────
  const { data: orgTypes, loading: loadingTypes } = useOrganizationTypes();
  const { data: departments, loading: loadingDepts } = useDepartments();
  const { data: semesters, loading: loadingSemesters } = useSemesters();
  const { data: rawRoles, loading: loadingRoles } = useRoles();
  const { data: allStudents } = useStudents();
  const { create, isSaving, error: mutationError } = useOrganizationMutations();

  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const activeOrgTypes = orgTypes.filter(t => !t.archived);
  const activeDepts = departments.filter(d => !d.archived);
  const activeSemester = useMemo(() => semesters.find(s => s.status === 'ACTIVE') ?? null, [semesters]);
  const activeRoles = useMemo(() => rawRoles.filter(r => !r.archived), [rawRoles]);

  const { formData, setFormData } = useFormState();

  // Keep schoolYear/semester in sync with live active semester
  useEffect(() => {
    if (activeSemester && !formData.schoolYear) {
      setFormData(prev => ({
        ...prev,
        schoolYear: activeSemester.academicYear,
        semester: activeSemester.semester,
      }));
    }
  }, [activeSemester, formData.schoolYear, setFormData]);

  const [officers, setOfficers] = useState<OfficerAssignment[]>([]);

  // Initialize officers based on active roles
  useEffect(() => {
    if (activeRoles.length > 0 && officers.length === 0) {
      setOfficers(activeRoles.map(role => ({
        roleId: role.id,
        roleName: role.name,
        isRequired: role.isRequired,
      })));
    }
  }, [activeRoles, officers.length]);

  if (!isOpen) return null;

  const assignedOfficers = officers.filter(o => o.studentName);

  // Validation: Step 2 requires all isRequired roles to be filled
  const allRequiredAssigned = officers.every(o => {
    if (o.isRequired) return !!o.studentName;
    return true;
  });

  const handleAssignOfficer = (roleId: string, student: { name: string; id: string; email: string }) => {
    setOfficers(prev => prev.map(o =>
      o.roleId === roleId
        ? { ...o, studentName: student.name, studentId: student.id, email: student.email, password: 'TempPass123!', avatar: student.name.split(' ').map(n => n[0]).join('') }
        : o
    ));
  };

  const handleRemoveOfficer = (roleId: string) => {
    setOfficers(prev => prev.map(o => o.roleId === roleId ? { roleId: o.roleId, roleName: o.roleName, isRequired: o.isRequired } : o));
  };

  const handleNextFromStep1 = () => {
    const errors = validateStep1(formData);
    if (Object.keys(errors).length > 0) { setStep1Errors(errors); return; }
    setStep1Errors({});
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    if (!allRequiredAssigned) {
      alert("Please assign all required officer roles before proceeding.");
      return;
    }

    // Prevent duplicate student assignments in the same organization
    const studentRoles = new Map<string, string>();
    for (const officer of assignedOfficers) {
      if (!officer.studentId) continue;
      if (studentRoles.has(officer.studentId)) {
        const previousRole = studentRoles.get(officer.studentId);
        alert(`Student ${officer.studentName} is assigned to multiple roles (${previousRole} and ${officer.roleName}). A student can only hold one role per organization.`);
        return;
      }
      studentRoles.set(officer.studentId, officer.roleName);
    }

    const missingCredentials = assignedOfficers.some(o => !o.email?.trim() || !o.password?.trim());
    if (missingCredentials) {
      alert("Please set Login Credentials (Email and Temporary Password) for all assigned officers.");
      setShowCredentials(true);
      return;
    }

    setCurrentStep(3);
  };

  const handleCreate = async () => {
    setSubmitError(null);
    const payload: CreateOrganizationPayload = {
      name: formData.name.trim(),
      acronym: formData.acronym.trim(),
      typeId: formData.typeId,
      departmentId: formData.department,
      description: formData.description.trim(),
      academicYear: formData.schoolYear,
      semester: formData.semester,
      logoUrl: null,
    };

    const officersPayload = assignedOfficers.map(o => ({
      roleId: o.roleId,
      studentId: o.studentId!,
      studentName: o.studentName!,
      email: o.email!,
      password: o.password!
    }));

    const result = await create(payload, createdBy, formData.logo, officersPayload);
    if (result.success) {
      onSuccess?.();
      onClose();
    } else {
      setSubmitError('Failed to create organization: ' + (result.error || 'Unknown error. Check console.'));
    }
  };

  // Get display labels for review step
  const selectedType = activeOrgTypes.find(t => t.id === formData.typeId);
  const selectedDept = activeDepts.find(d => d.id === formData.department);
  const deptLabel = formData.department === 'cross-departmental'
    ? 'Cross-Departmental'
    : selectedDept ? `${selectedDept.code} — ${selectedDept.name}` : formData.department;

  // ─── Step 1: Organization Details ─────────────────────────────────────────
  const renderStep1 = () => (
    <div className="p-6 space-y-6">
      <div className="border-l-4 border-[#FFC107] pl-4">
        <h3 className="text-[#001A4D] font-bold text-lg">Organization Details</h3>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Organization Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setStep1Errors(prev => { const n = { ...prev }; delete n.name; return n; }); }}
            placeholder="Enter organization name"
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#1E70E8] focus:border-transparent ${step1Errors.name ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'}`}
          />
          <FieldError msg={step1Errors.name} />
        </div>

        {/* Type + Department */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Organization Type <span className="text-red-500">*</span>
            </label>
            {loadingTypes ? (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-[#E0E0E0] rounded-lg text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : (
              <select
                value={formData.typeId}
                onChange={(e) => { setFormData({ ...formData, typeId: e.target.value }); setStep1Errors(prev => { const n = { ...prev }; delete n.typeId; return n; }); }}
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#1E70E8] focus:border-transparent ${step1Errors.typeId ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'}`}
              >
                <option value="">Select type</option>
                {activeOrgTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
                {activeOrgTypes.length === 0 && (
                  <option disabled>No types defined — add in Settings</option>
                )}
              </select>
            )}
            <FieldError msg={step1Errors.typeId} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Department <span className="text-red-500">*</span>
            </label>
            {loadingDepts ? (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-[#E0E0E0] rounded-lg text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : (
              <select
                value={formData.department}
                onChange={(e) => { setFormData({ ...formData, department: e.target.value }); setStep1Errors(prev => { const n = { ...prev }; delete n.department; return n; }); }}
                className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#1E70E8] focus:border-transparent ${step1Errors.department ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'}`}
              >
                <option value="">Select department</option>
                <option value="cross-departmental">🔀 Cross-Departmental</option>
                {activeDepts.map(d => (
                  <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                ))}
              </select>
            )}
            <FieldError msg={step1Errors.department} />
          </div>
        </div>

        {/* Acronym + School Year */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Acronym <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.acronym}
              onChange={(e) => { setFormData({ ...formData, acronym: e.target.value.toUpperCase() }); setStep1Errors(prev => { const n = { ...prev }; delete n.acronym; return n; }); }}
              placeholder="e.g. CSS"
              maxLength={10}
              className={`w-full px-4 py-2.5 border rounded-lg font-mono focus:ring-2 focus:ring-[#1E70E8] focus:border-transparent ${step1Errors.acronym ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'}`}
            />
            <FieldError msg={step1Errors.acronym} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              School Year
              <span className="ml-1 text-xs font-normal text-gray-400">(auto-filled from active semester)</span>
            </label>
            {loadingSemesters ? (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-[#E0E0E0] rounded-lg text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : activeSemester ? (
              <div className="px-4 py-2.5 border border-green-300 bg-green-50 rounded-lg text-sm text-green-800 font-medium">
                A.Y. {activeSemester.academicYear} — {activeSemester.semester}
              </div>
            ) : (
              <div className="px-4 py-2.5 border border-amber-300 bg-amber-50 rounded-lg text-xs text-amber-700">
                No active semester. Set one in Academic Settings.
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => { setFormData({ ...formData, description: e.target.value }); setStep1Errors(prev => { const n = { ...prev }; delete n.description; return n; }); }}
            placeholder="Enter organization description"
            rows={3}
            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-[#1E70E8] focus:border-transparent resize-none ${step1Errors.description ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'}`}
          />
          <FieldError msg={step1Errors.description} />
        </div>

        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Logo <span className="text-red-500">*</span></label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center hover:bg-blue-50 transition-colors cursor-pointer ${step1Errors.logo ? 'border-red-400 bg-red-50' : 'border-[#0E4EBD]'}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/png, image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setFormData(prev => ({ ...prev, logo: file }));
                setStep1Errors(prev => { const n = { ...prev }; delete n.logo; return n; });
              }}
            />
            {formData.logo ? (
              <div className="flex flex-col items-center">
                <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <div className="text-[#001A4D] text-sm font-medium">{formData.logo.name}</div>
                <div className="text-gray-500 text-xs mt-1">{(formData.logo.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <>
                <Upload className={`w-8 h-8 mx-auto mb-3 ${step1Errors.logo ? 'text-red-400' : 'text-[#0E4EBD]'}`} />
                <div className={`text-sm font-medium mb-1 ${step1Errors.logo ? 'text-red-600' : 'text-[#001A4D]'}`}>Click to upload or drag and drop</div>
                <div className="text-gray-500 text-xs">PNG, JPG up to 2MB</div>
              </>
            )}
          </div>
          <FieldError msg={step1Errors.logo} />
        </div>
      </div>
    </div>
  );

  // ─── Step 2: Assign Officers ───────────────────────────────────────────────
  const renderStep2 = () => (
    <div className="p-6 space-y-6">
      <div className="border-l-4 border-[#FFC107] pl-4">
        <h3 className="text-[#001A4D] font-bold text-lg">Assign Organization Officers</h3>
        <p className="text-gray-600 text-sm mt-1">Assign roles from the global settings. Required roles must be filled.</p>
      </div>

      <div className="space-y-3">
        {loadingRoles ? (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading roles...
          </div>
        ) : activeRoles.length === 0 ? (
          <div className="text-center p-8 border border-dashed rounded-xl border-gray-300 text-gray-500">
            No officer roles defined yet. Please set them up in Settings first.
          </div>
        ) : officers.map((officer) => {
          const Icon = getRoleIcon(officer.roleName);
          const isRequired = officer.isRequired;
          return (
            <div key={officer.roleId} className={`border rounded-xl p-4 flex items-center justify-between ${isRequired && !officer.studentName ? 'border-red-200 bg-red-50/30' : 'border-[#E0E0E0]'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#001A4D] rounded-lg flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#001A4D] text-sm">{officer.roleName}</span>
                    {isRequired
                      ? <span className="px-2 py-0.5 bg-[#FFC107] text-[#001A4D] rounded text-[10px] font-bold uppercase tracking-wider">Required</span>
                      : <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] font-bold uppercase tracking-wider">Optional</span>
                    }
                  </div>
                </div>
              </div>

              <div className="w-72">
                {officer.studentName ? (
                  <div className="flex items-center gap-2 bg-[#001A4D] rounded-lg px-3 py-2 shadow-sm">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-[#001A4D] font-bold text-xs shrink-0">
                      {officer.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-bold truncate">{officer.studentName}</div>
                      <div className="text-white/70 text-xs truncate">{officer.studentId}</div>
                    </div>
                    <button onClick={() => handleRemoveOfficer(officer.roleId)} className="text-white/70 hover:text-white shrink-0 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search student by name or ID..."
                      value={searchQueries[officer.roleId] || ''}
                      onChange={(e) => {
                        setSearchQueries(prev => ({ ...prev, [officer.roleId]: e.target.value }));
                        setActiveDropdown(officer.roleId);
                      }}
                      onFocus={() => setActiveDropdown(officer.roleId)}
                      className={`w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-[#1E70E8] focus:border-transparent ${isRequired ? 'border-red-300 placeholder-red-300' : 'border-[#E0E0E0]'}`}
                    />

                    {/* Autocomplete Dropdown */}
                    {activeDropdown === officer.roleId && (searchQueries[officer.roleId] || '').length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E0E0E0] rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                        {(() => {
                          const query = (searchQueries[officer.roleId] || '').toLowerCase();
                          const matches = allStudents.filter(s =>
                            `${s.firstName} ${s.lastName}`.toLowerCase().includes(query) ||
                            s.studentId.toLowerCase().includes(query)
                          ).slice(0, 5);

                          if (matches.length === 0) {
                            return <div className="p-3 text-sm text-gray-500 text-center">No students found</div>;
                          }

                          return matches.map(s => (
                            <div
                              key={s.id}
                              onClick={() => {
                                handleAssignOfficer(officer.roleId, {
                                  name: `${s.firstName} ${s.lastName}`,
                                  id: s.studentId,
                                  email: s.email
                                });
                                setActiveDropdown(null);
                                setSearchQueries(prev => ({ ...prev, [officer.roleId]: '' }));
                              }}
                              className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                            >
                              <div className="font-medium text-[#001A4D] text-sm">{s.firstName} {s.lastName}</div>
                              <div className="text-xs text-gray-500">{s.studentId} • {s.courseCode}</div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {assignedOfficers.length > 0 && (
        <div className="border border-[#E0E0E0] rounded-xl overflow-hidden mt-6 shadow-sm">
          <button
            onClick={() => setShowCredentials(!showCredentials)}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <span className="font-bold text-[#001A4D] text-sm">Set Login Credentials</span>
            <ChevronDown className={`w-5 h-5 text-gray-600 transition-transform ${showCredentials ? 'rotate-180' : ''}`} />
          </button>

          {showCredentials && (
            <div className="p-4 space-y-4">
              {assignedOfficers.map((officer) => (
                <div key={officer.roleId} className="space-y-3 bg-white p-3 border border-gray-100 rounded-lg">
                  <div className="font-medium text-[#001A4D] text-sm">{officer.studentName} — {officer.roleName}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          value={officer.email}
                          onChange={(e) => setOfficers(prev => prev.map(o => o.roleId === officer.roleId ? { ...o, email: e.target.value } : o))}
                          className="w-full pl-10 pr-4 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:ring-2 focus:ring-[#1E70E8]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Temporary Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type={showPasswords[officer.roleId] ? 'text' : 'password'}
                          value={officer.password}
                          onChange={(e) => setOfficers(prev => prev.map(o => o.roleId === officer.roleId ? { ...o, password: e.target.value } : o))}
                          className="w-full pl-10 pr-10 py-2 border border-[#E0E0E0] rounded-lg text-sm focus:ring-2 focus:ring-[#1E70E8]"
                        />
                        <button
                          onClick={() => setShowPasswords(prev => ({ ...prev, [officer.roleId]: !prev[officer.roleId] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPasswords[officer.roleId] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 bg-[#FFC107]/10 border border-[#FFC107]/30 rounded text-xs text-[#001A4D]">
                    Officer will be prompted to change password on first login to the Officer Panel.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ─── Step 3: Review & Confirm ──────────────────────────────────────────────
  const renderStep3 = () => (
    <div className="p-6 space-y-6">
      <div className="border-l-4 border-[#FFC107] pl-4">
        <h3 className="text-[#001A4D] font-bold text-lg">Review Organization Details</h3>
      </div>

      <div className="border border-[#E0E0E0] rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-[#0E4EBD] to-[#83358E] rounded-full flex items-center justify-center text-white font-bold text-xl overflow-hidden shadow-inner">
            {formData.logo ? (
              // Local preview of the selected File only. The real upload to Cloudinary
              // happens in organization.service.ts on submit; Firestore stores the secureUrl.
              <img src={URL.createObjectURL(formData.logo)} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              formData.acronym || 'ORG'
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-[#001A4D] font-bold text-xl">{formData.name || 'Organization Name'}</h4>
              {selectedType && (
                <span className="flex items-center gap-1.5 px-3 py-1 bg-[#FFD54F] text-[#001A4D] rounded-full text-xs font-medium">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedType.color }} />
                  {selectedType.name}
                </span>
              )}
            </div>
            <p className="text-gray-600 text-sm font-mono">{formData.acronym}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
          <div>
            <div className="text-xs text-gray-500">Department</div>
            <div className="text-[#001A4D] text-sm font-medium">{deptLabel || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">School Year & Semester</div>
            <div className="text-[#001A4D] text-sm font-medium">
              {formData.schoolYear ? `A.Y. ${formData.schoolYear} — ${formData.semester}` : '—'}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-gray-500">Description</div>
            <div className="text-[#001A4D] text-sm">{formData.description || '—'}</div>
          </div>
        </div>
      </div>

      {/* Officers review */}
      <div className="border border-[#E0E0E0] rounded-xl p-6">
        <h4 className="text-[#001A4D] font-bold text-sm mb-4">Officers</h4>
        <div className="space-y-2">
          {officers.map((officer) => (
            <div key={officer.roleId} className={`flex items-center justify-between py-3 ${!officer.studentName ? 'border-2 border-dashed border-gray-200 px-3 rounded-lg opacity-60' : ''}`}>
              {officer.studentName ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#001A4D] rounded-full flex items-center justify-center text-white font-bold text-xs">
                      {officer.avatar}
                    </div>
                    <div>
                      <div className="text-[#001A4D] font-bold text-sm">{officer.studentName}</div>
                      <div className="text-gray-500 text-xs">{officer.studentId}</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-[#0E4EBD] text-white rounded-full text-xs font-medium">{officer.roleName}</span>
                </>
              ) : (
                <span className="text-gray-400 text-sm italic">{officer.roleName} — Not assigned</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      <label className="flex items-center gap-3 p-4 border border-[#E0E0E0] rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-5 h-5 text-[#0E4EBD] rounded border-gray-300 focus:ring-[#0E4EBD]"
        />
        <span className="text-[#001A4D] text-sm">
          I confirm that the information above is accurate and the assigned officers have been informed of their credentials.
        </span>
      </label>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-white font-semibold text-lg">Create Organization</h2>
          <button onClick={onClose} disabled={isSaving} className="text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator current={currentStep} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>

        {/* Footer */}
        <div className="border-t border-[#E0E0E0] px-6 py-4 flex items-center justify-between bg-gray-50 rounded-b-2xl">
          <div>
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                disabled={isSaving}
                className="px-5 py-2.5 bg-white border border-[#E0E0E0] text-[#001A4D] font-medium rounded-xl hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 shadow-sm transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            {currentStep === 1 && (
              <button onClick={onClose} className="px-5 py-2.5 text-gray-600 font-medium rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            {currentStep === 3 && (
              <div className="text-xs text-[#001A4D] bg-[#FFC107]/20 px-3 py-1.5 rounded-lg border border-[#FFC107]/30">
                Organization will be set to Active immediately.
              </div>
            )}
            {currentStep < 3 ? (
              <button
                onClick={currentStep === 1 ? handleNextFromStep1 : handleNextFromStep2}
                disabled={currentStep === 2 && !allRequiredAssigned}
                className="px-6 py-2.5 bg-[#001A4D] text-white font-bold rounded-xl hover:bg-[#001A4D]/90 flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                {currentStep === 1 ? 'Next: Assign Officers' : 'Next: Review'}
                <ArrowRight className="w-4 h-4 text-[#FFC107]" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={!confirmed || isSaving}
                className="px-6 py-2.5 bg-[#0E4EBD] text-white font-bold rounded-xl hover:bg-[#0E4EBD]/90 flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm transition-all"
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  <><Building className="w-4 h-4 text-[#FFC107]" /> Create Organization</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
