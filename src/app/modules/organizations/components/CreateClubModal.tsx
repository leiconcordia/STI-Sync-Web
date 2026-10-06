import { useState, useMemo, useRef } from 'react';
import {
  X, Upload, Mail, Building, Check, ArrowRight,
  ArrowLeft, Loader2, AlertCircle, ShieldCheck, Sparkles,
  Info, Users
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { useOrganizationTypes } from '../hooks/useOrganizationTypes';
import { useOrganizationMutations } from '../hooks/useOrganizationMutations';
import { useOrganizationStream } from '../hooks/useOrganizationStream';
import { useSemesters, useActiveAcademicPeriods, useDepartments } from '../../academic';
import { useStudents } from '../../students/hooks/useStudentStream';
import type { CreateOrganizationPayload, OrgAdviserData } from '../types/organization.types';

// ─── Props ────────────────────────────────────────────────────────────────────
interface CreateClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  createdBy?: string;
  onSuccess?: () => void;
}

// ─── Validation ───────────────────────────────────────────────────────────────
interface Step1Errors {
  name?: string;
  typeId?: string;
  acronym?: string;
  description?: string;
  logo?: string;
}

interface Step2Errors {
  name?: string;
  employeeId?: string;
  email?: string;
}

function validateStep1(form: {
  name: string;
  typeId: string;
  acronym: string;
  description: string;
  logo: File | null;
}) {
  const errors: Step1Errors = {};
  if (!form.name.trim()) errors.name = 'Organization name is required.';
  if (!form.typeId) errors.typeId = 'Please select an organization type.';
  if (!form.acronym.trim()) errors.acronym = 'Acronym is required.';
  if (!form.description.trim()) errors.description = 'Description is required.';
  if (!form.logo) errors.logo = 'Organization logo is required.';
  return errors;
}

function validateStep2(adviser: {
  name: string;
  employeeId?: string;
  email: string;
}) {
  const errors: Step2Errors = {};
  if (!adviser.name.trim()) errors.name = 'Adviser full name is required.';
  if (!adviser.email.trim()) {
    errors.email = 'Adviser email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adviser.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }
  return errors;
}

// ─── Step Indicator (3 Steps: Details -> Adviser -> Review) ──────────────────
function StepIndicator({ current }: { current: number }) {
  const steps = [
    { number: 1, label: 'Organization Details' },
    { number: 2, label: 'Assign Adviser' },
    { number: 3, label: 'Review & Confirm' },
  ];
  return (
    <div className="flex items-center justify-center gap-2 py-4 px-6 border-b border-gray-200 bg-gray-50/50">
      {steps.map((step, idx) => (
        <div key={step.number} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                current > step.number
                  ? 'bg-[#0E4EBD] text-white'
                  : current === step.number
                  ? 'bg-[#FFC107] text-[#001A4D] shadow-xs'
                  : 'bg-[#E0E0E0] text-gray-500'
              }`}
            >
              {current > step.number ? <Check className="w-3.5 h-3.5" /> : step.number}
            </div>
            <span
              className={`text-xs font-semibold hidden sm:inline ${
                current === step.number ? 'text-[#001A4D]' : 'text-gray-500'
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-8 sm:w-16 h-0.5 mx-2 ${
                current > step.number ? 'bg-[#0E4EBD]' : 'bg-[#E0E0E0]'
              }`}
            />
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
      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {msg}
    </p>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CreateClubModal({ isOpen, onClose, createdBy = 'system', onSuccess }: CreateClubModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});
  const [step2Errors, setStep2Errors] = useState<Step2Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCheckingAdviser, setIsCheckingAdviser] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Live data ───────────────────────────────────────────────────────────────
  const { data: orgTypes, loading: loadingTypes } = useOrganizationTypes();
  const { data: departments = [], loading: loadingDepts } = useDepartments();
  const { data: semesters } = useSemesters();
  const { activeCollegePeriod, activeShsPeriod } = useActiveAcademicPeriods();
  const { data: allStudents } = useStudents();
  const { data: allOrganizations } = useOrganizationStream();
  const { create, isSaving } = useOrganizationMutations();

  const activeOrgTypes = orgTypes.filter(t => !t.archived);
  const activeDepartments = useMemo(() => departments.filter(d => !d.archived), [departments]);
  const activeSemester = useMemo(() => semesters.find(s => s.status === 'ACTIVE') ?? null, [semesters]);

  // Active period display string
  const currentAcademicPeriodLabel = useMemo(() => {
    const period = activeCollegePeriod || activeShsPeriod || activeSemester;
    if (!period) return 'Current Academic Term';
    return `A.Y. ${period.academicYear} — ${period.semester}`;
  }, [activeCollegePeriod, activeShsPeriod, activeSemester]);

  // Step 1 Form State
  const [formData, setFormData] = useState({
    name: '',
    typeId: '',
    department: 'cross-departmental',
    acronym: '',
    description: '',
    logo: null as File | null,
  });

  // Step 2 Adviser State (Fixed title: "Club Adviser")
  const [adviserData, setAdviserData] = useState<OrgAdviserData>({
    name: '',
    employeeId: '',
    email: '',
    departmentId: '',
    title: 'Club Adviser',
    temporaryPassword: 'Adv-' + Math.floor(1000 + Math.random() * 9000) + '!#',
    requiresPasswordChange: true,
  });

  if (!isOpen) return null;

  // ─── Step Navigation Handlers ──────────────────────────────────────────────
  const handleNextFromStep1 = () => {
    const errors = validateStep1(formData);
    if (Object.keys(errors).length > 0) {
      setStep1Errors(errors);
      return;
    }
    setStep1Errors({});
    setCurrentStep(2);
  };

  const handleNextFromStep2 = async () => {
    const errors = validateStep2(adviserData);
    if (Object.keys(errors).length > 0) {
      setStep2Errors(errors);
      return;
    }

    const emailTrimmed = adviserData.email.trim().toLowerCase();
    const employeeIdTrimmed = adviserData.employeeId?.trim() || '';

    // 1. Check if email is already in use by an adviser in existing organizations stream
    const existingOrgWithAdviserEmail = (allOrganizations || []).find(
      org => org.adviser?.email?.toLowerCase().trim() === emailTrimmed
    );
    if (existingOrgWithAdviserEmail) {
      setStep2Errors({
        email: `This email is already assigned as Club Adviser for "${existingOrgWithAdviserEmail.name}". An adviser can only advise one organization.`,
      });
      return;
    }

    // 2. Check if employee ID is already in use in existing organizations stream
    if (employeeIdTrimmed) {
      const existingOrgWithEmployeeId = (allOrganizations || []).find(
        org => org.adviser?.employeeId?.trim() === employeeIdTrimmed
      );
      if (existingOrgWithEmployeeId) {
        setStep2Errors({
          employeeId: `This Employee ID is already assigned to the adviser for "${existingOrgWithEmployeeId.name}".`,
        });
        return;
      }
    }

    // 3. Check if email or employee ID belongs to an existing student
    const studentMatch = (allStudents || []).find(
      s => s.email?.toLowerCase().trim() === emailTrimmed || (employeeIdTrimmed && s.studentId?.trim() === employeeIdTrimmed)
    );
    if (studentMatch) {
      if (studentMatch.email?.toLowerCase().trim() === emailTrimmed) {
        setStep2Errors({
          email: `This email is registered to student "${studentMatch.firstName} ${studentMatch.lastName}". Club Advisers must use a faculty/employee account.`,
        });
      } else if (employeeIdTrimmed) {
        setStep2Errors({
          employeeId: `This ID is registered to student "${studentMatch.firstName} ${studentMatch.lastName}". Please enter a valid Faculty/Employee ID.`,
        });
      }
      return;
    }

    // 4. Perform direct Firestore verification in organization_advisers collection
    setIsCheckingAdviser(true);
    try {
      const emailQuery = query(
        collection(db, 'organization_advisers'),
        where('email', '==', emailTrimmed),
        where('isActive', '==', true)
      );
      const emailSnap = await getDocs(emailQuery);
      if (!emailSnap.empty) {
        const adv = emailSnap.docs[0].data();
        setStep2Errors({
          email: `This email is already registered to active adviser "${adv.name}" (${adv.organizationName || 'Existing Club'}).`,
        });
        setIsCheckingAdviser(false);
        return;
      }

      if (employeeIdTrimmed) {
        const empIdQuery = query(
          collection(db, 'organization_advisers'),
          where('employeeId', '==', employeeIdTrimmed),
          where('isActive', '==', true)
        );
        const empIdSnap = await getDocs(empIdQuery);
        if (!empIdSnap.empty) {
          const adv = empIdSnap.docs[0].data();
          setStep2Errors({
            employeeId: `This Employee ID is already registered to active adviser "${adv.name}" (${adv.organizationName || 'Existing Club'}).`,
          });
          setIsCheckingAdviser(false);
          return;
        }
      }
    } catch (queryErr) {
      console.warn('[handleNextFromStep2] Firestore adviser uniqueness check warning:', queryErr);
    } finally {
      setIsCheckingAdviser(false);
    }

    setStep2Errors({});
    setCurrentStep(3); // Moves directly to Review & Confirm
  };

  // ─── Final Creation Handler ────────────────────────────────────────────────
  const handleCreate = async () => {
    setSubmitError(null);
    const activePeriod = activeCollegePeriod || activeShsPeriod || activeSemester;
    const isCross = !formData.department || formData.department === 'cross-departmental';
    const selectedDept = departments.find(d => d.id === formData.department);

    const payload: CreateOrganizationPayload = {
      name: formData.name.trim(),
      acronym: formData.acronym.trim(),
      typeId: formData.typeId,
      departmentId: isCross ? 'cross-departmental' : formData.department,
      departmentName: isCross ? 'Cross-Departmental / All Students' : (selectedDept?.name || 'Academic Department'),
      departmentCode: isCross ? 'ALL' : (selectedDept?.code || ''),
      department: isCross ? 'Cross-Departmental / All Students' : (selectedDept?.name || 'Academic Department'),
      scope: isCross ? 'cross-departmental' : 'departmental',
      isCrossDepartmental: isCross,
      description: formData.description.trim(),
      academicYear: activePeriod?.academicYear || '',
      semester: activePeriod?.semester || '',
      logoUrl: null,
      adviser: {
        ...adviserData,
        departmentId: adviserData.departmentId || (isCross ? 'cross-departmental' : formData.department),
        title: 'Club Adviser',
        requiresPasswordChange: true,
      },
    };

    const result = await create(payload, createdBy, formData.logo, []);
    if (result.success) {
      onSuccess?.();
      onClose();
    } else {
      setSubmitError('Failed to create organization: ' + (result.error || 'Unknown error. Check console.'));
    }
  };

  // Get display labels for review step
  const selectedType = activeOrgTypes.find(t => t.id === formData.typeId);

  // ─── Step 1: Organization Details ─────────────────────────────────────────
  const renderStep1 = () => (
    <div className="p-6 space-y-6">
      <div className="border-l-4 border-[#FFC107] pl-4">
        <h3 className="text-[#001A4D] font-bold text-lg">Organization Details</h3>
        <p className="text-gray-500 text-xs mt-0.5">Basic information and identity for the new student organization.</p>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
            Organization Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              setStep1Errors(prev => { const n = { ...prev }; delete n.name; return n; });
            }}
            placeholder="e.g. Junior Philippine Computer Society"
            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent ${
              step1Errors.name ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'
            }`}
          />
          <FieldError msg={step1Errors.name} />
        </div>

        {/* Type + Acronym */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
              Organization Type <span className="text-red-500">*</span>
            </label>
            {loadingTypes ? (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-[#E0E0E0] rounded-xl text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </div>
            ) : (
              <select
                value={formData.typeId}
                onChange={(e) => {
                  setFormData({ ...formData, typeId: e.target.value });
                  setStep1Errors(prev => { const n = { ...prev }; delete n.typeId; return n; });
                }}
                className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent ${
                  step1Errors.typeId ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'
                }`}
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
            <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
              Acronym <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.acronym}
              onChange={(e) => {
                setFormData({ ...formData, acronym: e.target.value.toUpperCase() });
                setStep1Errors(prev => { const n = { ...prev }; delete n.acronym; return n; });
              }}
              placeholder="e.g. JPCS"
              maxLength={10}
              className={`w-full px-4 py-2.5 border rounded-xl font-mono text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent ${
                step1Errors.acronym ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'
              }`}
            />
            <FieldError msg={step1Errors.acronym} />
          </div>
        </div>

        {/* Academic Department & Audience Scope */}
        <div>
          <label className="block text-sm font-semibold text-[#001A4D] mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Building className="w-4 h-4 text-[#0E4EBD]" />
              Academic Department & Eligibility Scope <span className="text-red-500">*</span>
            </span>
            <span className="text-[11px] text-gray-500 font-normal">Controls student eligibility to join</span>
          </label>
          {loadingDepts ? (
            <div className="flex items-center gap-2 px-4 py-2.5 border border-[#E0E0E0] rounded-xl text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading departments...
            </div>
          ) : (
            <select
              value={formData.department}
              onChange={(e) => {
                setFormData({ ...formData, department: e.target.value });
              }}
              className="w-full px-4 py-2.5 border border-[#E0E0E0] rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent bg-white cursor-pointer"
            >
              <option value="cross-departmental">🌐 Cross-Departmental (Open to All Students / Campus-Wide)</option>
              {activeDepartments.length > 0 && (
                <optgroup label="Academic Departments (Department-Exclusive)">
                  {activeDepartments.map(d => (
                    <option key={d.id} value={d.id}>
                      🏛️ {d.code} — {d.name} ({d.academicLevel || 'COLLEGE'})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          <p className="text-[11px] text-gray-500 mt-1">
            {formData.department === 'cross-departmental'
              ? 'Any enrolled student can discover, apply, and join this organization on the mobile and web apps.'
              : 'Membership applications and manual officer additions are restricted strictly to students enrolled in this department.'}
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => {
              setFormData({ ...formData, description: e.target.value });
              setStep1Errors(prev => { const n = { ...prev }; delete n.description; return n; });
            }}
            placeholder="Provide a brief overview of the organization's purpose and objectives..."
            rows={3}
            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent resize-none ${
              step1Errors.description ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'
            }`}
          />
          <FieldError msg={step1Errors.description} />
        </div>

        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
            Organization Logo <span className="text-red-500">*</span>
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center hover:bg-blue-50/50 transition-all cursor-pointer ${
              step1Errors.logo ? 'border-red-400 bg-red-50' : 'border-[#0E4EBD]/40 hover:border-[#0E4EBD]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/png, image/jpeg, image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setFormData(prev => ({ ...prev, logo: file }));
                setStep1Errors(prev => { const n = { ...prev }; delete n.logo; return n; });
              }}
            />
            {formData.logo ? (
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-[#001A4D] text-sm font-bold">{formData.logo.name}</div>
                <div className="text-gray-500 text-xs mt-0.5">{(formData.logo.size / 1024).toFixed(1)} KB — Click to change</div>
              </div>
            ) : (
              <>
                <Upload className={`w-8 h-8 mx-auto mb-2 ${step1Errors.logo ? 'text-red-400' : 'text-[#0E4EBD]'}`} />
                <div className={`text-sm font-semibold mb-0.5 ${step1Errors.logo ? 'text-red-600' : 'text-[#001A4D]'}`}>
                  Click to upload logo
                </div>
                <div className="text-gray-400 text-xs">PNG, JPG or WebP up to 5MB</div>
              </>
            )}
          </div>
          <FieldError msg={step1Errors.logo} />
        </div>
      </div>
    </div>
  );

  // ─── Step 2: Assign Adviser (Mandatory) ────────────────────────────────────
  const renderStep2 = () => (
    <div className="p-6 space-y-6">
      <div className="border-l-4 border-[#FFC107] pl-4">
        <h3 className="text-[#001A4D] font-bold text-lg">Assign Organization Adviser</h3>
        <p className="text-gray-500 text-xs mt-0.5">
          The Club Adviser has administrative access to manage the club and appoint executive officers.
        </p>
      </div>

      <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#0E4EBD] shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          <strong>Adviser First-Access Protocol:</strong> The appointed faculty adviser will receive login instructions and credentials via email. Upon logging in, they will lead the organization and appoint student officers exclusively from active registered members.
        </div>
      </div>

      <div className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
            Adviser Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={adviserData.name}
            onChange={(e) => {
              setAdviserData({ ...adviserData, name: e.target.value });
              setStep2Errors(prev => { const n = { ...prev }; delete n.name; return n; });
            }}
            placeholder="e.g. Prof. Juan Dela Cruz, MIT"
            className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent ${
              step2Errors.name ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'
            }`}
          />
          <FieldError msg={step2Errors.name} />
        </div>

        {/* Email + Faculty / Employee ID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={adviserData.email}
                onChange={(e) => {
                  setAdviserData({ ...adviserData, email: e.target.value });
                  setStep2Errors(prev => { const n = { ...prev }; delete n.email; return n; });
                }}
                placeholder="e.g. juan.delacruz@ormoc.sti.edu.ph"
                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent ${
                  step2Errors.email ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'
                }`}
              />
            </div>
            <FieldError msg={step2Errors.email} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#001A4D] mb-1.5">
              Faculty / Employee ID <span className="text-gray-400 text-xs font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={adviserData.employeeId || ''}
              onChange={(e) => {
                setAdviserData({ ...adviserData, employeeId: e.target.value });
                setStep2Errors(prev => { const n = { ...prev }; delete n.employeeId; return n; });
              }}
              placeholder="e.g. FAC-2024-001"
              className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-[#0E4EBD] focus:border-transparent ${
                step2Errors.employeeId ? 'border-red-400 bg-red-50' : 'border-[#E0E0E0]'
              }`}
            />
            <FieldError msg={step2Errors.employeeId} />
          </div>
        </div>

        {/* Designation / Title (Fixed) + Generated Temporary Password Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Designation Title
            </label>
            <div className="px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-[#001A4D] flex items-center justify-between">
              <span>Club Adviser</span>
              <span className="px-2 py-0.5 bg-[#001A4D] text-white text-[10px] rounded font-bold">DEFAULT</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Initial Temporary Password
            </label>
            <div className="px-4 py-2.5 bg-amber-50/80 border border-amber-200 rounded-xl font-mono text-sm font-bold text-amber-900 flex items-center justify-between">
              <span>{adviserData.temporaryPassword}</span>
              <span className="text-[10px] text-amber-700 font-sans font-semibold">Auto-Generated</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Step 3: Review & Confirm ──────────────────────────────────────────────
  const renderStep3 = () => (
    <div className="p-6 space-y-5">
      <div className="border-l-4 border-[#FFC107] pl-4">
        <h3 className="text-[#001A4D] font-bold text-lg">Review & Confirm Organization</h3>
        <p className="text-gray-500 text-xs mt-0.5">Please review all details before creating the organization.</p>
      </div>

      {/* Org Profile Card */}
      <div className="border border-[#E0E0E0] rounded-2xl p-5 space-y-4 bg-white shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-[#001A4D] to-[#0E4EBD] rounded-2xl flex items-center justify-center text-white font-bold text-xl overflow-hidden shadow-inner shrink-0">
            {formData.logo ? (
              <img src={URL.createObjectURL(formData.logo)} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              formData.acronym || 'ORG'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="text-[#001A4D] font-bold text-lg truncate">{formData.name || 'Organization Name'}</h4>
              {selectedType && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#FFD54F] text-[#001A4D] rounded-full text-xs font-bold">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedType.color }} />
                  {selectedType.name}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs font-mono font-bold">{formData.acronym}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 text-xs">
          <div>
            <div className="text-gray-400 font-medium">Academic Period</div>
            <div className="text-[#001A4D] font-semibold">{currentAcademicPeriodLabel}</div>
          </div>
          <div>
            <div className="text-gray-400 font-medium">Audience Eligibility Scope</div>
            <div className="mt-0.5">
              {!formData.department || formData.department === 'cross-departmental' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                  🌐 Open to All Students
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-bold border border-blue-200">
                  🏛️ {departments.find(d => d.id === formData.department)?.name || 'Department Specific'}
                </span>
              )}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-gray-400 font-medium">Description</div>
            <div className="text-gray-700 line-clamp-2">{formData.description || '—'}</div>
          </div>
        </div>
      </div>

      {/* Adviser Card */}
      <div className="border border-blue-200 bg-blue-50/40 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#0E4EBD]" />
            <h4 className="text-[#001A4D] font-bold text-sm">Assigned Club Adviser</h4>
          </div>
          <span className="px-2 py-0.5 bg-[#001A4D] text-white text-[10px] font-bold rounded">MANDATORY</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div>
            <div className="text-gray-500">Name</div>
            <div className="text-[#001A4D] font-bold">{adviserData.name}</div>
          </div>
          <div>
            <div className="text-gray-500">Email</div>
            <div className="text-[#0E4EBD] font-semibold">{adviserData.email}</div>
          </div>
          {adviserData.employeeId && (
            <div>
              <div className="text-gray-500">Employee ID</div>
              <div className="text-gray-700 font-medium">{adviserData.employeeId}</div>
            </div>
          )}
        </div>
      </div>

      {/* Officer Policy Notice */}
      <div className="border border-emerald-200 bg-emerald-50/50 rounded-2xl p-4 flex items-start gap-3">
        <Users className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 leading-relaxed">
          <strong>Officer Appointment via Member Directory:</strong> Officers are appointed strictly from active members in the Officer Portal. Students must first join the club as members before being appointed as officers by the Adviser.
        </div>
      </div>

      {/* Email Dispatch Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <strong>Automated Credential Dispatch:</strong> An onboarding email containing login instructions and temporary credentials will be sent to the Adviser (<span className="font-semibold">{adviserData.email}</span>).
        </div>
      </div>

      {submitError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-700 font-medium">{submitError}</p>
        </div>
      )}

      <label className="flex items-center gap-3 p-3.5 border border-[#E0E0E0] rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-4 h-4 text-[#0E4EBD] rounded border-gray-300 focus:ring-[#0E4EBD]"
        />
        <span className="text-[#001A4D] text-xs font-medium">
          I confirm that the organization details and adviser information are accurate.
        </span>
      </label>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">Create Student Organization</h2>
            <p className="text-white/60 text-xs">Step {currentStep} of 3</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors disabled:opacity-50"
          >
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
        <div className="border-t border-[#E0E0E0] px-6 py-4 flex items-center justify-between bg-gray-50">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep(currentStep - 1)}
                disabled={isSaving}
                className="px-4 py-2 bg-white border border-[#E0E0E0] text-[#001A4D] font-bold text-xs rounded-xl hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50 shadow-xs transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            {currentStep === 1 && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-500 font-semibold text-xs rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < 3 ? (
              <button
                type="button"
                disabled={isCheckingAdviser}
                onClick={currentStep === 1 ? handleNextFromStep1 : handleNextFromStep2}
                className="px-5 py-2.5 bg-[#001A4D] text-white font-bold text-xs rounded-xl hover:bg-[#001A4D]/90 flex items-center gap-2 shadow-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isCheckingAdviser ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFC107]" /> Validating Adviser...</>
                ) : (
                  <>
                    {currentStep === 1 ? 'Next: Assign Adviser' : 'Next: Review & Confirm'}
                    <ArrowRight className="w-3.5 h-3.5 text-[#FFC107]" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={!confirmed || isSaving}
                className="px-6 py-2.5 bg-[#0E4EBD] text-white font-bold text-xs rounded-xl hover:bg-[#0E4EBD]/90 flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-xs transition-all"
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating Organization...</>
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
