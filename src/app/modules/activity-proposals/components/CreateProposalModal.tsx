/**
 * src/app/modules/activity-proposals/components/CreateProposalModal.tsx
 *
 * Official 7-Step Activity Proposal (AP) Wizard Modal for STI College Ormoc.
 * Based on official documents AP IT Expert Talk 1.docx, AP2025 (1).docx, and AP EVRAA.docx.
 */

import React, { useState, useEffect } from 'react';
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
      academicLevels: ['College'],
      departments: ['BSIT'],
      yearLevels: ['3rd Year', '4th Year'],
      courses: [],
      courseCodes: ['BSIT'],
      allStudents: false,
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
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
        createdByName: initialData.createdByName || currentUser.name,
        createdByEmail: initialData.createdByEmail || currentUser.email,
        creatorRole: initialData.creatorRole || currentUser.role,
        proponents: initialData.proponents && initialData.proponents.length > 0 ? initialData.proponents : [currentUser.name || 'Student Affairs & Services'],
      }));
    } else {
      generateProposalReferenceNumber('SAS').then((ref) => {
        setFormData((prev) => ({
          ...prev,
          referenceNo: ref,
          createdByName: currentUser.name,
          createdByEmail: currentUser.email,
          creatorRole: currentUser.role,
          proponents: [currentUser.name || 'Student Affairs & Services'],
          approvalChain: [],
        }));
      });
    }
  }, [initialData, currentUser.name, currentUser.email, currentUser.role]);

  if (!isOpen) return null;

  const updateFormData = (updates: Partial<ProposalFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
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
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 7));
    } else {
      toast.error('Please complete all required fields before proceeding.');
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Save as Draft
  const handleSaveDraft = async () => {
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
    if (!validateStep(7)) {
      toast.error('Please resolve the required items before submission.');
      return;
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
              disabled={isSavingDraft || isSubmitting || !!submittedReferenceNo}
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
                        <div
                          className={`text-xs ${
                            isActive ? 'text-blue-900 font-bold' : 'text-slate-700 font-medium'
                          }`}
                        >
                          {s.label}
                        </div>
                        <div className="text-[10px] text-slate-400 leading-none">
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
