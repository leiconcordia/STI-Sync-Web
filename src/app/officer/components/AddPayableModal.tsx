import { useState, useMemo, useEffect } from 'react';
import {
  X,
  Loader2,
  Plus,
  Check,
  Search,
  Users,
  Shield,
  Tag,
  GraduationCap,
  Coins,
  AlertCircle,
  UserPlus,
} from 'lucide-react';
import { useSemesters } from '../../modules/academic';
import { useOrgMembers } from '../../modules/organizations/hooks/useOrgMembers';
import { useStudents } from '../../modules/students/hooks/useStudentStream';
import { useOrgPayables } from '../../modules/finance/hooks/usePayableStream';
import { saveOrgAutoPayableRule } from '../../modules/organizations/services/organization.service';
import {
  createPayable,
  buildStudentsLookupMap,
  resolvePayableStudentUid,
  resolveActivePeriodForLevel,
  lookupStudentAuthUidByIdentifiers,
} from '../../modules/finance/services/payable.service';
import type { PayableType } from '../../modules/finance/types/payable.types';
import { toast } from 'sonner';
import { formatCurrency } from '../../utils/currency';

interface AddPayableModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  addedBy: string;
  onOpenCategoryMaintenance?: () => void;
  preselectedMemberId?: string;
}

export function AddPayableModal({
  isOpen,
  onClose,
  organizationId,
  organizationName,
  addedBy,
  preselectedMemberId,
}: AddPayableModalProps) {
  const { data: semesters = [] } = useSemesters();
  const activeSemester = semesters.find((s) => s.status === 'ACTIVE') || semesters[0];

  const { members = [], loading: loadingMembers } = useOrgMembers(organizationId);
  const { data: allStudents = [] } = useStudents();
  const { data: existingPayables = [] } = useOrgPayables(organizationId, 'all');

  const [payableType, setPayableType] = useState<PayableType>('custom');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');

  // Application timing checkboxes
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [autoAssignNewMembers, setAutoAssignNewMembers] = useState(false);

  // Target selection mode: 'all' (All / Year+Section Filtered) | 'specific' (Pick checkboxes)
  const [targetMode, setTargetMode] = useState<'specific' | 'all'>('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fast student lookup so club payables resolve real Firebase authUid, Year Level, and Section
  const studentLookup = useMemo(() => {
    return buildStudentsLookupMap(allStudents);
  }, [allStudents]);

  // Strictly enforce active club membership only + enrich with student record
  const activeMembers = useMemo(() => {
    return (members || [])
      .filter((m) => m && m.status === 'active' && (!m.organizationId || m.organizationId === organizationId))
      .map((m) => {
        const sIdKey = String(m.studentId || '').trim().toLowerCase();
        const schoolKey = String((m as any).studentSchoolId || '').trim().toLowerCase();
        const authKey = String((m as any).authUid || (m as any).studentAuthUid || '').trim().toLowerCase();
        const emailKey = String(m.email || '').trim().toLowerCase();
        const matched =
          (authKey && studentLookup.get(authKey)) ||
          (sIdKey && studentLookup.get(sIdKey)) ||
          (schoolKey && studentLookup.get(schoolKey)) ||
          (emailKey && studentLookup.get(emailKey)) ||
          studentLookup.get(String(m.id || '').trim().toLowerCase());

        const resolvedYear = matched?.yearLevel || (m as any).yearLevel || (m as any).year || '';
        const resolvedSection = matched?.section || (m as any).section || '';
        const resolvedSchoolId = matched?.studentId || (m as any).studentSchoolId || m.studentId || m.id;
        const resolvedAuthUid = resolvePayableStudentUid(
          matched,
          (m as any).authUid || (m as any).studentAuthUid || resolvedSchoolId
        );
        const hasLinkedAuthUid = Boolean(
          String(matched?.authUid || (m as any).authUid || (m as any).studentAuthUid || '').trim()
        );
        const resolvedAcademicLevel =
          matched?.academicLevel ||
          (m as any).academicLevel ||
          (String(resolvedYear).toLowerCase().includes('grade') ? 'SHS' : 'COLLEGE');

        return {
          ...m,
          resolvedAuthUid,
          hasLinkedAuthUid,
          resolvedSchoolId,
          resolvedYear,
          resolvedSection,
          resolvedCourseCode: matched?.courseCode || (m as any).courseCode || (m as any).course || '',
          resolvedCourseName: matched?.courseName || (m as any).courseName || '',
          resolvedDepartmentId: matched?.departmentId || (m as any).departmentId || '',
          resolvedDepartmentName: matched?.departmentName || matched?.department || (m as any).department || '',
          resolvedAcademicLevel,
          selectionKey: resolvedSchoolId || m.id,
        };
      });
  }, [members, organizationId, studentLookup]);

  // Reset form & pre-select member when modal opens
  useEffect(() => {
    if (isOpen) {
      setPayableType('custom');
      setLabel('');
      setDescription('');
      setAmount('');
      setDueDate('');
      setApplyToExisting(true);
      setAutoAssignNewMembers(false);
      setYearFilter('all');
      setSectionFilter('all');
      setSearchQuery('');
      if (preselectedMemberId) {
        setTargetMode('specific');
        const match = activeMembers.find(
          (m) =>
            m.id === preselectedMemberId ||
            m.studentId === preselectedMemberId ||
            m.resolvedSchoolId === preselectedMemberId ||
            m.resolvedAuthUid === preselectedMemberId
        );
        setSelectedMemberIds(match ? [match.selectionKey] : []);
      } else {
        setTargetMode('all');
        setSelectedMemberIds([]);
      }
    }
  }, [isOpen, preselectedMemberId]);

  // Re-sync preselected member if members/students streams load after opening
  useEffect(() => {
    if (!isOpen || !preselectedMemberId) return;
    const match = activeMembers.find(
      (m) =>
        m.id === preselectedMemberId ||
        m.studentId === preselectedMemberId ||
        m.resolvedSchoolId === preselectedMemberId ||
        m.resolvedAuthUid === preselectedMemberId
    );
    if (match) {
      setSelectedMemberIds((prev) =>
        prev.includes(match.selectionKey) ? prev : [match.selectionKey]
      );
    }
  }, [isOpen, preselectedMemberId, activeMembers]);

  // Available Year Levels across active members
  const dynamicYearLevels = useMemo(() => {
    const standardOrder = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Grade 11', 'Grade 12'];
    const found = new Set<string>();
    activeMembers.forEach((m) => {
      const yr = String(m.resolvedYear || '').trim();
      if (yr) found.add(yr);
    });
    return Array.from(found).sort((a, b) => {
      const ia = standardOrder.indexOf(a);
      const ib = standardOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [activeMembers]);

  // Available Sections across active members (scoped to yearFilter if chosen)
  const dynamicSections = useMemo(() => {
    const found = new Set<string>();
    activeMembers.forEach((m) => {
      if (yearFilter !== 'all') {
        const mYear = String(m.resolvedYear || '').toLowerCase().trim();
        if (mYear !== yearFilter.toLowerCase() && !mYear.includes(yearFilter.toLowerCase())) {
          return;
        }
      }
      const sec = String(m.resolvedSection || '').trim();
      if (sec) found.add(sec);
    });
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [activeMembers, yearFilter]);

  useEffect(() => {
    if (sectionFilter !== 'all' && !dynamicSections.includes(sectionFilter)) {
      setSectionFilter('all');
    }
  }, [dynamicSections, sectionFilter]);

  // Filtered members based on search, year level, and section (No Programs filter)
  const filteredMembers = useMemo(() => {
    return activeMembers.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      const name = (m.studentName || '').toLowerCase();
      const id = (m.resolvedSchoolId || m.studentId || m.id || '').toLowerCase();
      const sec = String(m.resolvedSection || '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || id.includes(q) || sec.includes(q);

      let matchesYear = true;
      if (yearFilter !== 'all') {
        const mYear = String(m.resolvedYear || '').toLowerCase().trim();
        matchesYear = mYear === yearFilter.toLowerCase() || mYear.includes(yearFilter.toLowerCase());
      }

      let matchesSection = true;
      if (sectionFilter !== 'all') {
        const mSec = String(m.resolvedSection || '').toLowerCase().trim();
        matchesSection = mSec === sectionFilter.toLowerCase().trim();
      }

      return matchesSearch && matchesYear && matchesSection;
    });
  }, [activeMembers, searchQuery, yearFilter, sectionFilter]);

  if (!isOpen) return null;

  const toggleMemberSelection = (selectionKey: string) => {
    if (selectedMemberIds.includes(selectionKey)) {
      setSelectedMemberIds(selectedMemberIds.filter((mId) => mId !== selectionKey));
    } else {
      setSelectedMemberIds([...selectedMemberIds, selectionKey]);
    }
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredMembers.map((m) => m.selectionKey);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedMemberIds.includes(id));
    if (allSelected) {
      setSelectedMemberIds(selectedMemberIds.filter((id) => !filteredIds.includes(id)));
    } else {
      const combined = new Set([...selectedMemberIds, ...filteredIds]);
      setSelectedMemberIds(Array.from(combined));
    }
  };

  const categoryName =
    payableType === 'org_fine'
      ? 'Fine'
      : payableType === 'membership_due'
      ? 'Membership Due'
      : 'Club Assessment';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim()) {
      toast.error('Payable title is required.');
      return;
    }

    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter a valid amount greater than ₱0.');
      return;
    }

    if (!applyToExisting && !autoAssignNewMembers) {
      toast.error('Please choose whether to apply to existing club members and/or auto-assign to new members upon joining.');
      return;
    }

    const targetMembers = !applyToExisting
      ? []
      : targetMode === 'all'
      ? filteredMembers
      : activeMembers.filter((m) => selectedMemberIds.includes(m.selectionKey));

    if (applyToExisting && targetMembers.length === 0) {
      toast.error('No active club members match your target selection.');
      return;
    }

    const defaultPeriod = resolveActivePeriodForLevel(
      semesters,
      targetMembers[0]?.resolvedAcademicLevel || activeMembers[0]?.resolvedAcademicLevel || 'COLLEGE'
    );

    setIsSubmitting(true);

    try {
      let savedRuleId: string | null = null;
      const normalizedLabel = label.trim().toLowerCase();

      if (autoAssignNewMembers) {
        const savedRule = await saveOrgAutoPayableRule(organizationId, {
          type: payableType,
          label: label.trim(),
          description: description.trim() || `Assessment for ${organizationName}`,
          amount: Number(amount),
          dueDate: dueDate || null,
          semesterId: defaultPeriod.id,
          semester: defaultPeriod.semester || defaultPeriod.label,
          schoolYear: defaultPeriod.schoolYear,
          createdBy: addedBy,
        });
        savedRuleId = savedRule.id;
      }

      let createdCount = 0;
      let skippedDuplicateCount = 0;

      if (applyToExisting) {
        for (const m of targetMembers) {
          const memberPeriod = resolveActivePeriodForLevel(semesters, m.resolvedAcademicLevel);
          const resolvedStudentUid = m.hasLinkedAuthUid
            ? m.resolvedAuthUid
            : await lookupStudentAuthUidByIdentifiers({
                authUid: (m as any).authUid || (m as any).studentAuthUid,
                schoolId: m.resolvedSchoolId,
                studentId: m.studentId,
                docId: m.id,
                email: m.email,
              });

          // Deduplicate when rule/auto-assign or same-term membership_due already exists for this member
          const alreadyHasPayable = existingPayables.some((p) => {
            if (p.status === 'waived' || p.status === 'refunded') return false;
            const pSid = String(p.studentId || '').trim().toLowerCase();
            const pSchool = String(p.studentSchoolId || '').trim().toLowerCase();
            const matchMember =
              pSid === resolvedStudentUid.toLowerCase() ||
              pSid === m.resolvedAuthUid.toLowerCase() ||
              pSchool === m.resolvedSchoolId.toLowerCase() ||
              pSid === m.resolvedSchoolId.toLowerCase();
            if (!matchMember) return false;
            if (savedRuleId && p.autoRuleId === savedRuleId) return true;
            if (payableType === 'membership_due' && p.type === 'membership_due') {
              if (memberPeriod.id && p.semesterId) {
                return p.semesterId === memberPeriod.id;
              }
              if (memberPeriod.semester && memberPeriod.schoolYear && p.semester && p.schoolYear) {
                return (
                  String(p.semester).trim().toLowerCase() === memberPeriod.semester.trim().toLowerCase() &&
                  String(p.schoolYear).trim().toLowerCase() === memberPeriod.schoolYear.trim().toLowerCase()
                );
              }
              return String(p.label || p.title || '').trim().toLowerCase() === normalizedLabel;
            }
            if (autoAssignNewMembers && String(p.label || p.title || '').trim().toLowerCase() === normalizedLabel) {
              return true;
            }
            return false;
          });

          if (alreadyHasPayable) {
            skippedDuplicateCount++;
            continue;
          }

          await createPayable({
            studentId: resolvedStudentUid,
            studentName: m.studentName || 'Member',
            studentSchoolId: m.resolvedSchoolId,
            type: payableType,
            label: label.trim(),
            title: label.trim(),
            feeTitle: label.trim(),
            eventTitle: label.trim(),
            category: categoryName,
            description: description.trim() || `Assessment for ${organizationName}`,
            organizationId,
            organizationName,
            semesterId: memberPeriod.id,
            semester: memberPeriod.semester || memberPeriod.label,
            schoolYear: memberPeriod.schoolYear,
            autoRuleId: savedRuleId,
            assignedAmount: Number(amount),
            amount: Number(amount),
            paymentStatus: 'UNPAID',
            dueDate: dueDate ? new Date(dueDate) : null,
            courseCode: m.resolvedCourseCode,
            courseName: m.resolvedCourseName,
            departmentId: m.resolvedDepartmentId,
            departmentName: m.resolvedDepartmentName,
            yearLevel: m.resolvedYear,
            section: m.resolvedSection,
            academicLevel: m.resolvedAcademicLevel,
            createdBy: addedBy,
          });
          createdCount++;
        }
      }

      if (autoAssignNewMembers && applyToExisting) {
        toast.success(
          `Assigned "${label.trim()}" to ${createdCount} active member(s) and enabled auto-assign for future members.${
            skippedDuplicateCount > 0 ? ` (${skippedDuplicateCount} already billed)` : ''
          }`
        );
      } else if (autoAssignNewMembers) {
        toast.success(
          `Saved "${label.trim()}" — every new student who enters ${organizationName} will receive this payable automatically.`
        );
      } else {
        toast.success(
          `Successfully assigned "${label.trim()}" to ${createdCount} member(s).${
            skippedDuplicateCount > 0 ? ` (${skippedDuplicateCount} skipped as already assigned)` : ''
          }`
        );
      }
      onClose();
    } catch (err: any) {
      console.error('[AddPayableModal] Creation error:', err);
      toast.error(`Failed to assign payable: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-[660px] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-[#001A4D] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-white">
            <Shield className="w-5 h-5 text-[#FFD41C]" />
            <div>
              <h2 className="font-bold text-base text-white">Add Club Payable / Fine</h2>
              <p className="text-white/70 text-xs">
                Assess member contributions or fines for{' '}
                <span className="text-[#FFD41C] font-semibold">{organizationName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Simple Type Selection */}
          <div>
            <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-2">
              Payable Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setPayableType('custom')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  payableType === 'custom'
                    ? 'bg-blue-50/80 border-[#0E4EBD] ring-2 ring-[#0E4EBD]/20 shadow-xs'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-[#001A4D]">
                  <Tag className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  Event Contribution
                </div>
                <span className="text-[11px] text-gray-500 leading-snug">
                  Activities, shirts, kits, materials & project funds
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPayableType('org_fine')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  payableType === 'org_fine'
                    ? 'bg-amber-50/80 border-amber-600 ring-2 ring-amber-600/20 shadow-xs'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-[#001A4D]">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Club Fine
                </div>
                <span className="text-[11px] text-gray-500 leading-snug">
                  Meeting absences, violation sanctions or penalties
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPayableType('membership_due')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  payableType === 'membership_due'
                    ? 'bg-purple-50/80 border-purple-600 ring-2 ring-purple-600/20 shadow-xs'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-[#001A4D]">
                  <Coins className="w-3.5 h-3.5 text-purple-600" />
                  Membership Due
                </div>
                <span className="text-[11px] text-gray-500 leading-snug">
                  Club membership registration or periodic dues
                </span>
              </button>
            </div>
          </div>

          {/* Title / Label */}
          <div>
            <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
              Title / Description of Payable <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                payableType === 'org_fine'
                  ? 'e.g. General Assembly Absence Fine, Meeting Tardiness Fee'
                  : payableType === 'membership_due'
                  ? 'e.g. Club Membership Due, Semester Registration'
                  : 'e.g. Sports Fest Team Shirt Contribution, Hackathon Kit Fee, Year-End Party'
              }
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                Amount Per Student (PHP) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                  ₱
                </span>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none font-bold text-gray-900"
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Payments collected will directly credit to your club's treasury balance.
              </p>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
                Due Date <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none cursor-pointer"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Deadline for members to settle their contribution or fine.
              </p>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[#001A4D] uppercase tracking-wider mb-1.5">
              Additional Details / Notes <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Terms, inclusions, breakdown, or justification for this club assessment."
              className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#001A4D]/20 focus:border-[#001A4D] outline-none resize-none"
            />
          </div>

          {/* Effective Scope / When This Payable Applies */}
          <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-2.5">
            <label className="text-xs font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-[#0E4EBD]" />
              When Does This Payable Apply?
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-2.5 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-[#0E4EBD] transition-colors">
                <input
                  type="checkbox"
                  checked={applyToExisting}
                  onChange={(e) => setApplyToExisting(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-[#001A4D] focus:ring-[#001A4D] cursor-pointer"
                />
                <div className="text-xs">
                  <p className="font-bold text-[#001A4D]">Apply immediately to existing active club members</p>
                  <p className="text-gray-500 text-[11px]">
                    Bills targeted students who are already active members of {organizationName} right now (and syncs to their Mobile App).
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-[#0E4EBD] transition-colors">
                <input
                  type="checkbox"
                  checked={autoAssignNewMembers}
                  onChange={(e) => setAutoAssignNewMembers(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-[#001A4D] focus:ring-[#001A4D] cursor-pointer"
                />
                <div className="text-xs">
                  <p className="font-bold text-[#001A4D]">Auto-assign when a new student enters / joins this club</p>
                  <p className="text-gray-500 text-[11px]">
                    Automatically assigns this payable to incoming students the moment their membership is added or approved.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Target Selection */}
          {applyToExisting ? (
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-[#001A4D] uppercase tracking-wider flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  Target Active Club Members
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetMode('all')}
                    className={`px-3 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                      targetMode === 'all'
                        ? 'bg-[#001A4D] text-white shadow-2xs'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    All Matching Members ({filteredMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMode('specific')}
                    className={`px-3 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer ${
                      targetMode === 'specific'
                        ? 'bg-[#001A4D] text-white shadow-2xs'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Pick Members ({selectedMemberIds.length})
                  </button>
                </div>
              </div>

              {/* Search, Year Level, and Section Filters (No Programs filter) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="relative sm:col-span-1">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search member or ID..."
                    className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#001A4D]/20"
                  />
                </div>

                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="px-2 py-1.5 text-xs bg-white border border-gray-300 rounded-lg outline-none cursor-pointer"
                >
                  <option value="all">All Year Levels ({dynamicYearLevels.length})</option>
                  {dynamicYearLevels.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>

                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="px-2 py-1.5 text-xs bg-white border border-gray-300 rounded-lg outline-none cursor-pointer"
                >
                  <option value="all">All Sections ({dynamicSections.length})</option>
                  {dynamicSections.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              {targetMode === 'all' ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#0E4EBD] flex-shrink-0" />
                  <span>
                    This payable of{' '}
                    <strong>{amount ? formatCurrency(Number(amount)) : '₱0.00'}</strong> will be assigned to{' '}
                    <strong>
                      {filteredMembers.length} active member{filteredMembers.length === 1 ? '' : 's'}
                    </strong>
                    {yearFilter !== 'all' || sectionFilter !== 'all'
                      ? ` matching ${[
                          yearFilter !== 'all' ? yearFilter : null,
                          sectionFilter !== 'all' ? `Section ${sectionFilter}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}`
                      : ` of ${organizationName}`}
                    .
                  </span>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg bg-white overflow-hidden max-h-48 overflow-y-auto">
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-xs font-semibold text-gray-600">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="text-[#0E4EBD] hover:underline font-bold text-xs cursor-pointer"
                    >
                      Toggle All Filtered ({filteredMembers.length})
                    </button>
                    <span>{selectedMemberIds.length} member(s) selected</span>
                  </div>

                  {loadingMembers ? (
                    <div className="p-6 text-center text-xs text-gray-400">Loading member directory...</div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-gray-400">No active club members match filter criteria.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredMembers.map((m) => {
                        const isSelected = selectedMemberIds.includes(m.selectionKey);
                        const yrDisplay = m.resolvedYear || 'No Year';
                        const secDisplay = m.resolvedSection || 'No Section';

                        return (
                          <div
                            key={m.id || m.selectionKey}
                            onClick={() => toggleMemberSelection(m.selectionKey)}
                            className={`px-3 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50/70 font-semibold' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                  isSelected ? 'bg-[#001A4D] border-[#001A4D] text-white' : 'border-gray-300'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3" />}
                              </div>
                              <div>
                                <span className="text-[#001A4D]">{m.studentName}</span>
                                <span className="text-gray-400 ml-1.5 font-mono">
                                  ({m.resolvedSchoolId})
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-gray-600 font-medium">{yrDisplay}</span>
                              <span className="text-gray-400 text-[11px] ml-1.5">
                                · {secDisplay}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
              <UserPlus className="w-4 h-4 text-[#0E4EBD] flex-shrink-0 mt-0.5" />
              <span>
                Existing members will not be billed right now. Instead,{' '}
                <strong>"{label.trim() || 'this payable'}"</strong> will automatically apply the moment a new student enters or is approved as an active member of <strong>{organizationName}</strong>.
              </span>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-[#001A4D] hover:bg-[#0E4EBD] text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#FFD41C]" />
                  {applyToExisting ? 'Assigning Payables...' : 'Saving Auto-Assign Rule...'}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-[#FFD41C]" />
                  {!applyToExisting && autoAssignNewMembers
                    ? 'Save Auto-Assign Rule'
                    : 'Create & Assign Payable'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
