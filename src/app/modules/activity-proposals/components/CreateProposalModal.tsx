/**
 * src/app/modules/activity-proposals/components/CreateProposalModal.tsx
 *
 * Official 7-Step Activity Proposal (AP) Wizard Modal for STI College Ormoc.
 * Based on official documents AP IT Expert Talk 1.docx, AP2025 (1).docx, and AP EVRAA.docx.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  CheckCircle2,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  ClipboardList,
  CheckSquare,
  DollarSign,
  Send,
  Building,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';

import type {
  ProposalFormData,
  ProposalApprovalStep,
} from '../types/proposal.types';
import {
  saveProposalDraft,
  submitProposalForReview,
  generateProposalReferenceNumber,
} from '../services/proposal.service';
import { getCachedSasSignatoryConfig } from '../../signatories/services/sas-signatory.service';
import { canEditProposal } from '../../events/utils/event-lifecycle.utils';

import Step1GeneralInfo from './wizard/Step1GeneralInfo';
import Step2ObjectivesMechanics from './wizard/Step2ObjectivesMechanics';
import Step3LogisticsMarketing from './wizard/Step3LogisticsMarketing';
import Step4SessionsScheduler from './wizard/Step4SessionsScheduler';
import Step5TaskAllocation from './wizard/Step5TaskAllocation';
import Step6FinancialProjections from './wizard/Step6FinancialProjections';
import Step7ReviewSubmit from './wizard/Step7ReviewSubmit';

interface CreateProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProposalCreated?: (proposalId: string) => void;
  initialData?: ProposalFormData;
  currentUser?: {
    uid: string;
    name: string;
    email: string;
    role?: string;
    organizationId?: string;
    organizationName?: string;
  };
}

const STEPS = [
  { id: 1, label: 'General Info', subtitle: 'Title & Rationale' },
  { id: 2, label: 'Objectives', subtitle: 'Goals & Mechanics' },
  { id: 3, label: 'Target Market', subtitle: 'Audience & Est. Attendance' },
  { id: 4, label: 'Date & Venue', subtitle: 'Date & Time (and Venue)' },
  { id: 5, label: 'Task List', subtitle: 'Milestones & Dates' },
  { id: 6, label: 'Financials', subtitle: 'Financial Projections' },
  { id: 7, label: 'Review & Submit', subtitle: 'Signatories & Vetting' },
];

/**
 * Extracts a normalized, serialized representation of step-specific fields
 * to detect whether a proposal maker has modified a flagged step upon return.
 */
function extractStepData(stepNumber: number, data: ProposalFormData | undefined): any {
  if (!data) return null;
  switch (stepNumber) {
    case 1:
      return {
        title: (data.title || '').trim(),
        description: (data.description || '').trim(),
        theme: ((data as any).theme || '').trim(),
        organizers: (data.organizers || []).map((o) => o.trim()).filter(Boolean),
        proponents: (data.proponents || []).map((p) => p.trim()).filter(Boolean),
      };
    case 2:
      return {
        objectives: (data.objectives || []).map((o) => o.trim()).filter(Boolean),
        successIndicators: (data.successIndicators || []).map((s) => s.trim()).filter(Boolean),
        mechanics: (data.mechanics || []).map((m) => m.trim()).filter(Boolean),
        materials: (data.materials || []).map((m) => m.trim()).filter(Boolean),
      };
    case 3:
      return {
        targetAudience: data.targetAudience || {},
        estAttendanceCount: data.estAttendanceCount,
        estAttendanceQualifier: data.estAttendanceQualifier,
        estimatedAttendance: (data.estimatedAttendance || '').trim(),
        marketingPlan: (data.marketingPlan || []).map((m) => m.trim()).filter(Boolean),
        documentationPlan: (data.documentationPlan || []).map((d) => d.trim()).filter(Boolean),
      };
    case 4:
      return {
        date: data.date || '',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        venueId: data.venueId || '',
        venueName: (data.venueName || '').trim(),
        sessions: (data.sessions || []).map((s) => ({
          title: (s.title || '').trim(),
          date: s.date || '',
          startTime: s.startTime || '',
          endTime: s.endTime || '',
          venueName: (s.venueName || '').trim(),
        })),
      };
    case 5:
      return {
        tasks: (data.tasks || []).map((t) => ({
          taskName: (t.taskName || '').trim(),
          assignedPerson: (t.assignedPerson || '').trim(),
          completionDate: t.completionDate || '',
        })),
      };
    case 6:
      return {
        revenues: (data.financialProjections?.revenues || []).map((r) => ({
          description: (r.description || '').trim(),
          totalAmount: Number(r.totalAmount || 0),
          remarks: (r.remarks || '').trim(),
        })),
        expenses: (data.financialProjections?.expenses || []).map((e) => ({
          description: (e.description || '').trim(),
          totalAmount: Number(e.totalAmount || 0),
          remarks: (e.remarks || '').trim(),
        })),
        totalRevenue: Number(data.financialProjections?.totalRevenue || 0),
        totalExpenses: Number(data.financialProjections?.totalExpenses || 0),
        balance: Number(data.financialProjections?.balance || 0),
      };
    case 7:
      return {
        isUrgent: Boolean(data.isUrgent),
        urgentJustification: (data.urgentJustification || '').trim(),
        approvalChain: (data.approvalChain || []).map((c) => ({
          id: c.id,
          role: c.role,
          signatoryName: c.signatoryName,
          signatoryEmail: c.signatoryEmail,
        })),
      };
    default:
      return null;
  }
}

export default function CreateProposalModal({
  isOpen,
  onClose,
  onProposalCreated,
  initialData,
  currentUser = {
    uid: 'admin-sao',
    name: 'Student Affairs & Services',
    email: 'sao@ormoc.sti.edu.ph',
    role: 'sas_admin',
  },
}: CreateProposalModalProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProposalFormData>({
    title: '',
    description: '',
    organizers: ['Student Affairs & Services (SAS)'],
    objectives: [
      'To provide practical industry exposure and technical skills enhancement to participants.',
      'To promote active student leadership and collaborative teamwork through co-curricular engagement.',
    ],
    successIndicators: [
      'At least 85% of target participants attend and complete the post-event evaluation.',
      '100% of planned program sessions executed within designated operational schedule.',
    ],
    mechanics: [
      'Participants complete registration upon campus arrival.',
      'Formal opening prayer, national anthem, and welcome address by School Administration.',
      'Plenary talk and interactive technical workshop execution.',
      'Open forum, Q&A session, and evaluation form distribution.',
      'Awarding of certificates and tokens of appreciation.',
    ],
    submissionDate:
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    materials: [
      'Digital Attendance QR Scanners & ID Scanners',
      'Audio-Visual Equipment (Projector, Microphones, Sound System)',
      'Certificates of Participation & Certificate Holders',
      'Event Banner / Tarpaulin Backdrop',
    ],
    targetAudience: {
      academicLevels: ['College', 'SHS'],
      departments: ['All Academic Departments'],
      yearLevels: ['G11', 'G12', '1st Year', '2nd Year', '3rd Year', '4th Year'],
      courses: [],
      courseCodes: [],
      sections: [],
      allStudents: true,
    },
    estAttendanceCount: 120,
    estAttendanceQualifier: 'participants',
    estimatedAttendance: '120 participants',
    marketingPlan: [
      'Official Facebook Announcement Post via STI College Ormoc SAS Page',
      'Campus Bulletin Board Poster Display & Classroom Visits',
      'Program Head Endorsements & Faculty Announcements',
    ],
    documentationPlan: [
      'High-Resolution Event Photography & Video Coverage',
      'Digital Attendance Logs & Entry/Exit Timestamps',
      'Participant Evaluation Summary & Narrative Report',
    ],
    date: '',
    startTime: '08:00',
    endTime: '12:00',
    venueId: '',
    venueName: '',
    sessions: [
      {
        id: 'main-session',
        title: 'Main Program',
        date: '',
        startTime: '08:00',
        endTime: '12:00',
        venueName: '',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        taskName: 'Drafting & Submission of Activity Proposal',
        assignedPerson: 'Activity Lead / Proponent',
        completionDate: '',
      },
      {
        id: 'task-2',
        taskName: 'Venue Reservation & Tech Setup',
        assignedPerson: 'Logistics Committee',
        completionDate: '',
      },
      {
        id: 'task-3',
        taskName: 'Event Execution & QR Attendance',
        assignedPerson: 'Organizing Committee',
        completionDate: '',
      },
    ],
    financialProjections: {
      revenues: [
        {
          id: 'rev-1',
          description: 'Student Affairs & Services (SAS) Activity Subsidy',
          lastYearActual: 0,
          thisYearProposed: 5000,
          totalAmount: 5000,
          adjustment: 0,
          remarks: 'Funded from Institutional Activity Fund',
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          description: 'Guest Speaker Honorarium / Token',
          lastYearActual: 0,
          thisYearProposed: 2000,
          totalAmount: 2000,
          adjustment: 0,
          remarks: 'Direct token',
        },
        {
          id: 'exp-2',
          description: 'Working Committee Refreshments',
          lastYearActual: 0,
          thisYearProposed: 1500,
          totalAmount: 1500,
          adjustment: 0,
          remarks: 'For volunteers & staff',
        },
      ],
      totalRevenue: 5000,
      totalExpenses: 3500,
      balance: 1500,
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReferenceNo, setSubmittedReferenceNo] = useState<string | null>(null);

  // Sync initial data or set default reference number
  useEffect(() => {
    const isOfficer = currentUser.role === 'officer';
    const sasCfg = getCachedSasSignatoryConfig();

    // For Student Org proposals, Stage 1 is mandatory SAS Review Gatekeeper (Ma'am Riselle)
    const defaultChain: ProposalApprovalStep[] = isOfficer
      ? [
          {
            id: 'step_sas_gatekeeper',
            step: 1,
            stageIndex: 1,
            stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
            role: 'sas_head',
            roleTitle: sasCfg.roleTitle || 'Student Affairs & Services Head',
            actionType: 'endorse',
            signatoryUid: sasCfg.employeeId || 'sas_admin',
            signatoryName: sasCfg.name || 'Riselle Mae B. Lucanas',
            signatoryEmail: sasCfg.email || 'sao@ormoc.sti.edu.ph',
            department: sasCfg.department || 'Student Affairs & Services',
            status: 'current',
          },
        ]
      : [];


      if (initialData) {
        const isOfficerInitial =
          (initialData as any).isOfficerProposal !== undefined
            ? Boolean((initialData as any).isOfficerProposal)
            : initialData.creatorRole === 'officer' || initialData.creatorRole === 'student_officer';

        setFormData((prev) => ({
          ...prev,
          ...initialData,
          createdByName: initialData.createdByName || currentUser.name,
          createdByEmail: initialData.createdByEmail || currentUser.email,
          creatorRole: initialData.creatorRole || (isOfficerInitial ? 'officer' : currentUser.role),
          isOfficerProposal: isOfficerInitial,
          organizationId: initialData.organizationId || (isOfficerInitial ? (initialData as any).hostingOrgId : currentUser.organizationId),
          hostingOrgId: (initialData as any).hostingOrgId || initialData.organizationId || currentUser.organizationId,
          organizationName: initialData.organizationName || currentUser.organizationName,
          organizers:
            initialData.organizers && initialData.organizers.length > 0
              ? initialData.organizers
              : [currentUser.organizationName || (isOfficerInitial ? 'Student Organization' : 'Student Affairs & Services (SAS)')],
          proponents: initialData.proponents && initialData.proponents.length > 0 ? initialData.proponents : [currentUser.name || 'Student Affairs & Services'],
          approvalChain:
            initialData.approvalChain && initialData.approvalChain.length > 0
              ? initialData.approvalChain
              : defaultChain,
        }));
      } else {
        const refPrefix = isOfficer ? (currentUser.organizationName?.slice(0, 4) || 'ORG') : 'SAS';
        generateProposalReferenceNumber(refPrefix).then((ref) => {
          setFormData((prev) => ({
            ...prev,
            referenceNo: ref,
            createdByName: currentUser.name,
            createdByEmail: currentUser.email,
            creatorRole: currentUser.role,
            isOfficerProposal: isOfficer,
            organizationId: currentUser.organizationId,
            hostingOrgId: currentUser.organizationId,
            organizationName: currentUser.organizationName,
            organizers: [currentUser.organizationName || (isOfficer ? 'Student Organization' : 'Student Affairs & Services (SAS)')],
            proponents: [currentUser.name || 'Student Affairs & Services'],
            approvalChain: defaultChain,
          }));
        });
      }
  }, [initialData, currentUser.name, currentUser.email, currentUser.role, currentUser.organizationId, currentUser.organizationName]);

  if (!isOpen) return null;

  const updateFormData = (updates: Partial<ProposalFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Ownership Guard: Only proposal owner can revise/edit this proposal
  const editPermission = useMemo(() => {
    if (!initialData) return { canEdit: true };
    return canEditProposal(
      initialData as any,
      currentUser.role || 'officer',
      currentUser.uid,
      currentUser.organizationId
    );
  }, [initialData, currentUser.role, currentUser.uid, currentUser.organizationId]);

  // Revision Tracking & Per-Step Enforcement
  const isReturnedProposal = useMemo(() => {
    const st = (
      formData.status ||
      (formData as any).proposalStatus ||
      (initialData as any)?.status ||
      (initialData as any)?.proposalStatus ||
      ''
    ).toLowerCase();
    const hasRemarks = Boolean(
      (formData.stepRevisionRemarks && Object.keys(formData.stepRevisionRemarks).length > 0) ||
      (initialData?.stepRevisionRemarks && Object.keys(initialData.stepRevisionRemarks).length > 0)
    );
    const hasFlags = Boolean(
      (formData.returnFlags && formData.returnFlags.length > 0) ||
      (initialData?.returnFlags && initialData.returnFlags.length > 0)
    );
    return st === 'returned' || hasRemarks || hasFlags;
  }, [
    formData.status,
    (formData as any).proposalStatus,
    formData.stepRevisionRemarks,
    formData.returnFlags,
    initialData,
  ]);

  const stepRemarksDict: Record<string, string> = useMemo(() => {
    return (
      (formData.stepRevisionRemarks as Record<string, string>) ||
      (initialData?.stepRevisionRemarks as Record<string, string>) ||
      {}
    );
  }, [formData.stepRevisionRemarks, initialData?.stepRevisionRemarks]);

  const returnFlagsList: string[] = useMemo(() => {
    return (
      formData.returnFlags ||
      initialData?.returnFlags ||
      []
    );
  }, [formData.returnFlags, initialData?.returnFlags]);

  const getStepDirective = (stepNum: number): string | null => {
    const s = String(stepNum);
    if (stepRemarksDict[s]?.trim()) return stepRemarksDict[s].trim();
    if (stepRemarksDict[`step-${stepNum}`]?.trim()) return stepRemarksDict[`step-${stepNum}`].trim();
    if (stepRemarksDict[`step_${stepNum}`]?.trim()) return stepRemarksDict[`step_${stepNum}`].trim();
    for (const [k, v] of Object.entries(stepRemarksDict)) {
      if (k.toLowerCase().includes(`step ${stepNum}`) && typeof v === 'string' && v.trim()) {
        return v.trim();
      }
    }
    for (const flag of returnFlagsList) {
      if (flag.toLowerCase().includes(`step ${stepNum}`) || flag.startsWith(`Step ${stepNum}:`)) {
        return stepRemarksDict[flag]?.trim() || `Adviser returned this step for revision: ${flag}`;
      }
    }
    return null;
  };

  const isStepFlagged = (stepNum: number): boolean => {
    return Boolean(getStepDirective(stepNum));
  };

  // Snapshot initial step data upon mounting to detect modifications
  const [initialStepSnapshots, setInitialStepSnapshots] = useState<Record<number, string>>(() => {
    if (!initialData) return {};
    const snaps: Record<number, string> = {};
    for (let s = 1; s <= 7; s++) {
      snaps[s] = JSON.stringify(extractStepData(s, initialData));
    }
    return snaps;
  });

  useEffect(() => {
    if (initialData && Object.keys(initialStepSnapshots).length === 0) {
      const snaps: Record<number, string> = {};
      for (let s = 1; s <= 7; s++) {
        snaps[s] = JSON.stringify(extractStepData(s, initialData));
      }
      setInitialStepSnapshots(snaps);
    }
  }, [initialData]);

  // Check if a flagged step has been modified from its initial return snapshot
  const isStepModified = (stepNum: number): boolean => {
    if (!isReturnedProposal) return true;
    if (!isStepFlagged(stepNum)) return true;
    const initialJson = initialStepSnapshots[stepNum];
    if (!initialJson) return false;
    const currentJson = JSON.stringify(extractStepData(stepNum, formData));
    return currentJson !== initialJson;
  };

  // Step validation before advancing
  const validateStep = (stepNumber: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (stepNumber === 1) {
      if (!formData.title?.trim()) {
        newErrors.title = 'Activity Title is required.';
      }
      if (!formData.description?.trim()) {
        newErrors.description = 'Activity Description / Rationale is required.';
      }
      if (!formData.organizers || formData.organizers.length === 0) {
        newErrors.organizers = 'At least one organizing body is required.';
      }
    }

    if (stepNumber === 2) {
      if (!formData.objectives || formData.objectives.length === 0) {
        newErrors.objectives = 'At least one objective is required.';
      }
      if (!formData.successIndicators || formData.successIndicators.length === 0) {
        newErrors.successIndicators = 'At least one success indicator is required.';
      }
    }

    if (stepNumber === 3) {
      if (!formData.estimatedAttendance?.trim() && !formData.estAttendanceCount) {
        newErrors.estimatedAttendance = 'Estimated attendance is required.';
      }
    }

    if (stepNumber === 4) {
      const hasDate = Boolean(formData.date || formData.sessions?.[0]?.date);
      if (!hasDate) {
        newErrors.sessions = 'Please specify the event date.';
      }
      const hasVenue = Boolean(formData.venueName || formData.venueId || formData.sessions?.[0]?.venueName);
      if (!hasVenue) {
        newErrors.sessions = 'Please select a campus venue.';
      }
    }

    if (stepNumber === 7) {
      if (formData.isUrgent && !formData.urgentJustification?.trim()) {
        newErrors.urgentJustification = 'An urgent submission justification is required.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      toast.error('Please complete all required fields before proceeding.');
      return;
    }

    // Strict revision enforcement: Cannot advance if this flagged step is unmodified
    if (isReturnedProposal && isStepFlagged(currentStep) && !isStepModified(currentStep)) {
      toast.error(
        `Step ${currentStep} has revision instructions that have not been modified yet. Please apply the required changes to proceed.`
      );
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, 7));
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    if (!editPermission.canEdit) {
      toast.error('Permission Denied', {
        description: editPermission.reason || 'You do not have permission to modify this proposal.',
      });
      return;
    }

    setIsSavingDraft(true);
    try {
      const result = await saveProposalDraft(
        { ...formData, status: 'draft' },
        currentUser,
        formData.id
      );
      updateFormData({ id: result.id, referenceNo: result.referenceNo });
      toast.success(`Proposal saved as draft (${result.referenceNo})`);
    } catch (err: any) {
      console.error('Failed to save draft:', err);
      toast.error(err?.message || 'Failed to save draft.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Submit Proposal
  const handleSubmitProposal = async () => {
    if (!editPermission.canEdit) {
      toast.error('Permission Denied', {
        description: editPermission.reason || 'Only the proponent organization has permission to edit and revise this proposal.',
      });
      return;
    }

    if (!validateStep(7)) {
      toast.error('Please resolve the required items before submission.');
      return;
    }

    // Strict revision enforcement: Verify all flagged steps have been modified
    if (isReturnedProposal) {
      const unmodifiedSteps = [1, 2, 3, 4, 5, 6, 7].filter(
        (s) => isStepFlagged(s) && !isStepModified(s)
      );
      if (unmodifiedSteps.length > 0) {
        toast.error(
          `Cannot submit proposal: The following flagged steps have not been modified: ${unmodifiedSteps
            .map((s) => `Step ${s}`)
            .join(', ')}. Please address their revision directives.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await submitProposalForReview(
        formData,
        currentUser,
        formData.id
      );
      setSubmittedReferenceNo(result.referenceNo);
      toast.success(`Activity Proposal submitted successfully! (${result.referenceNo})`);
      if (onProposalCreated) {
        onProposalCreated(result.id);
      }
    } catch (err: any) {
      console.error('Failed to submit proposal:', err);
      toast.error(err?.message || 'Failed to submit proposal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-50 rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* ── MODAL HEADER ── */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  Activity Proposal (AP) Wizard
                </h2>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {formData.referenceNo || 'AP-2026-SAS'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Official 7-Step Institutional Vetting System • STI College Ormoc
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting || !!submittedReferenceNo || !editPermission.canEdit}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5 text-slate-500" />
              <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── OWNERSHIP WARNING BANNER ── */}
        {!editPermission.canEdit && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-2.5 text-amber-900 text-xs font-semibold flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              {editPermission.reason || 'View-Only Mode: Only the proponent organization that submitted this proposal has the ability to edit, revise, and resubmit it.'}
            </span>
          </div>
        )}

        {/* ── STEPPER PROGRESS BAR ── */}
        {!submittedReferenceNo && (
          <div className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[700px]">
              {STEPS.map((s, idx) => {
                const isActive = s.id === currentStep;
                const isCompleted = s.id < currentStep;

                return (
                  <div key={s.id} className="flex items-center flex-1 last:flex-none">
                    <button
                      type="button"
                      onClick={() => {
                        if (s.id > currentStep) {
                          // Prevent skipping past an unmodified flagged step
                          for (let checkStep = currentStep; checkStep < s.id; checkStep++) {
                            if (isStepFlagged(checkStep) && !isStepModified(checkStep)) {
                              toast.error(
                                `You cannot advance to Step ${s.id} because Step ${checkStep} has revision instructions that have not been modified yet.`
                              );
                              return;
                            }
                          }
                        }
                        if (isCompleted || s.id === currentStep) {
                          setCurrentStep(s.id);
                        }
                      }}
                      className={`flex items-center gap-2 text-left transition-all ${
                        isActive
                          ? 'opacity-100 font-bold'
                          : isCompleted
                          ? 'opacity-80 hover:opacity-100 cursor-pointer'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-xs'
                            : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs ${
                              isActive ? 'text-blue-900 font-bold' : 'text-slate-700 font-medium'
                            }`}
                          >
                            {s.label}
                          </span>
                          {isReturnedProposal && isStepFlagged(s.id) && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                isStepModified(s.id)
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {isStepModified(s.id) ? '✓ Revised' : '⚠ Required'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 leading-none mt-0.5">
                          {s.subtitle}
                        </div>
                      </div>
                    </button>

                    {idx < STEPS.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 mx-3 rounded-full ${
                          s.id < currentStep ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MODAL BODY / CURRENT STEP CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {/* Top returned proposal summary banner */}
          {isReturnedProposal && !submittedReferenceNo && (
            <div className="mb-5 bg-amber-50/80 border border-amber-200 rounded-2xl p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-950 flex items-center gap-2">
                      Activity Proposal Returned for Revision
                      <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                        Per-Step Revision Enforced
                      </span>
                    </h4>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Specific revision directives have been issued. You must modify all marked steps before advancing or submitting.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {STEPS.filter((s) => isStepFlagged(s.id)).map((s) => {
                    const modified = isStepModified(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setCurrentStep(s.id)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                          modified
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 ring-1 ring-amber-300/50'
                        }`}
                      >
                        {modified ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-600" />}
                        <span>Step {s.id} ({modified ? 'Modified' : 'Unmodified'})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Active step revision directive banner */}
          {isReturnedProposal && isStepFlagged(currentStep) && !submittedReferenceNo && (
            <div
              className={`mb-6 p-4 rounded-2xl border transition-all ${
                isStepModified(currentStep)
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                  : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300 text-amber-950 shadow-xs'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    isStepModified(currentStep)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-white shadow-xs'
                  }`}
                >
                  {isStepModified(currentStep) ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Adviser Revision Directive for Step {currentStep}
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isStepModified(currentStep)
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-200 text-amber-900'
                      }`}
                    >
                      {isStepModified(currentStep)
                        ? 'Changes Detected • Ready to Advance'
                        : 'Action Required • Step Unmodified'}
                    </span>
                  </div>
                  <p className="text-xs font-medium mt-1 leading-relaxed text-slate-800">
                    "{getStepDirective(currentStep)}"
                  </p>
                  {!isStepModified(currentStep) && (
                    <p className="text-[11px] text-amber-800/80 mt-1 italic">
                      You cannot proceed to subsequent steps or submit until you modify this step according to the directive.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {submittedReferenceNo ? (
            /* Success confirmation screen */
            <div className="max-w-lg mx-auto text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Proposal Submitted Successfully!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Your Activity Proposal has entered the institutional endorsement workflow.
                </p>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs text-left text-xs space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Reference Number:</span>
                  <span className="font-mono font-bold text-blue-700">{submittedReferenceNo}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Activity Title:</span>
                  <span className="font-semibold text-slate-800">{formData.title}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Initial Endorser:</span>
                  <span className="font-semibold text-slate-800">SAS Coordinator (Reviewer)</span>
                </div>
              </div>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              {currentStep === 1 && (
                <Step1GeneralInfo
                  formData={formData}
                  onChange={updateFormData}
                  errors={errors}
                />
              )}
              {currentStep === 2 && (
                <Step2ObjectivesMechanics
                  formData={formData}
                  onChange={updateFormData}
                  errors={errors}
                />
              )}
              {currentStep === 3 && (
                <Step3LogisticsMarketing
                  formData={formData}
                  onChange={updateFormData}
                  errors={errors}
                />
              )}
              {currentStep === 4 && (
                <Step4SessionsScheduler
                  formData={formData}
                  onChange={updateFormData}
                  errors={errors}
                />
              )}
              {currentStep === 5 && (
                <Step5TaskAllocation
                  formData={formData}
                  onChange={updateFormData}
                  errors={errors}
                />
              )}
              {currentStep === 6 && (
                <Step6FinancialProjections
                  formData={formData}
                  onChange={updateFormData}
                  errors={errors}
                />
              )}
              {currentStep === 7 && (
                <Step7ReviewSubmit
                  formData={formData}
                  onChange={updateFormData}
                  onSubmit={handleSubmitProposal}
                  onSaveDraft={handleSaveDraft}
                  isSubmitting={isSubmitting}
                  isSavingDraft={isSavingDraft}
                  errors={errors}
                />
              )}
            </>
          )}
        </div>

        {/* ── MODAL FOOTER NAVIGATION ── */}
        {!submittedReferenceNo && (
          <div className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentStep === 1 || isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                currentStep === 1
                  ? 'opacity-0 pointer-events-none'
                  : 'text-slate-700 hover:bg-slate-100 border border-slate-300'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div className="text-xs text-slate-400 font-medium">
              Step {currentStep} of {STEPS.length}
            </div>

            {currentStep < 7 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-blue-500/20 hover:shadow-blue-500/30 transition-all"
              >
                <span>Next Step</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : !editPermission.canEdit ? (
              <div className="px-4 py-2 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold border border-slate-200">
                Read-Only (Non-Owner)
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubmitProposal}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-blue-500/20 hover:shadow-blue-500/30 transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Submitting...' : 'Submit Proposal'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
