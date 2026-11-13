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
  Lock,
  PenTool,
} from 'lucide-react';
import { toast } from 'sonner';
import DigitalSignatureModal from '../../../signatory/components/DigitalSignatureModal';
import { format, addDays, subDays, parseISO, isValid } from 'date-fns';
import { formatDateLong } from '../utils/proposal-calculations';
import { sanitizeCleanDocumentSnapshot } from '../../workflow/utils/snapshot-cleaner.utils';

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
import {
  resolveUserSignature,
  getFastCachedSignature,
  syncUserSignatureAcrossProfiles,
} from '../../signatories';
import { canEditProposal } from '../../events/utils/event-lifecycle.utils';
import { stripSasPhrases } from '../../events/utils/organization-display.utils';
import { useOrganizationStream } from '../../organizations/hooks/useOrganizationStream';
import RevisionFeedbackBanner from '../../workflow/components/RevisionFeedbackBanner';

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
    isAdviser?: boolean;
    organizationId?: string;
    organizationName?: string;
    signatureUrl?: string | null;
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
    case 3: {
      const aud = data.targetAudience || {};
      const count =
        (typeof data.estAttendanceCount === 'number' && data.estAttendanceCount > 0 ? data.estAttendanceCount : null) ??
        (typeof aud.expectedAttendees === 'number' && aud.expectedAttendees > 0 ? aud.expectedAttendees : null) ??
        (data.estimatedAttendance ? parseInt(String(data.estimatedAttendance).match(/\d+/)?.[0] || '0', 10) || null : null) ??
        (typeof (data as any).expectedParticipantCount === 'number' && (data as any).expectedParticipantCount > 0 ? (data as any).expectedParticipantCount : null) ??
        0;

      return {
        scope: aud.scope || (aud.allStudents ? 'all' : 'specific'),
        allStudents: Boolean(aud.allStudents),
        academicLevels: (aud.academicLevels || []).map((l: any) => String(l).trim()).filter(Boolean).sort(),
        departments: (aud.departments || []).map((d: any) => String(d).trim()).filter(Boolean).sort(),
        courses: (aud.courses || aud.courseCodes || []).map((c: any) => String(c).trim()).filter(Boolean).sort(),
        yearLevels: (aud.yearLevels || []).map((y: any) => String(y).trim()).filter(Boolean).sort(),
        sections: (aud.sections || []).map((s: any) => String(s).trim()).filter(Boolean).sort(),
        estAttendanceCount: Number(count || 0),
        marketingPlan: (data.marketingPlan || []).map((m: any) => String(m).trim()).filter(Boolean),
        documentationPlan: (data.documentationPlan || []).map((d: any) => String(d).trim()).filter(Boolean),
      };
    }
    case 4:
      return {
        date: data.date || '',
        startTime: data.startTime || '',
        endTime: data.endTime || '',
        venueId: data.venueId || '',
        venueName: (data.venueName || '').trim(),
        venueType: data.venueType || (data.venueId ? 'inside' : 'inside'),
        customVenueName: (data.customVenueName || '').trim(),
        isUrgent: Boolean(data.isUrgent),
        urgentJustification: (data.urgentJustification || '').trim(),
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
  const { data: allOrgs = [] } = useOrganizationStream();

  const isOfficerProp =
    currentUser.role === 'officer' ||
    currentUser.role === 'student_officer' ||
    Boolean(currentUser.organizationId && !['sas', 'sas_admin', 'sao', 'sao_admin', 'admin'].includes(currentUser.organizationId.toLowerCase()));

  const isAdviserOrAdmin = Boolean(
    currentUser.isAdviser ||
    currentUser.role === 'adviser' ||
    currentUser.role === 'admin' ||
    currentUser.role === 'sas_admin' ||
    currentUser.role === 'sao' ||
    currentUser.role === 'sao_admin'
  );
  const isOfficerOnly = isOfficerProp && !isAdviserOrAdmin;

  const matchedOrg = useMemo(() => {
    if (!currentUser.organizationId) return null;
    return allOrgs.find((o) => o.id === currentUser.organizationId);
  }, [allOrgs, currentUser.organizationId]);

  const resolvedOrgName = useMemo(() => {
    if (matchedOrg) {
      return matchedOrg.acronym && !matchedOrg.name.includes(matchedOrg.acronym)
        ? `${matchedOrg.name} (${matchedOrg.acronym})`
        : matchedOrg.name;
    }
    if (currentUser.organizationName && stripSasPhrases(currentUser.organizationName).length > 0) {
      return stripSasPhrases(currentUser.organizationName);
    }
    return isOfficerProp ? 'Student Organization' : '';
  }, [matchedOrg, currentUser.organizationName, isOfficerProp]);

  const defaultOrgId = currentUser.organizationId || (isOfficerProp ? 'student_org' : 'sas');

  const isAdviserMaker = Boolean(
    currentUser.isAdviser ||
    currentUser.role === 'adviser' ||
    (matchedOrg?.adviser?.email && currentUser.email && matchedOrg.adviser.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
    (matchedOrg?.adviser?.name && currentUser.name && matchedOrg.adviser.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === currentUser.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')) ||
    (currentUser.email && allOrgs.some((o: any) => o.adviser?.email && o.adviser.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())) ||
    (currentUser.name && allOrgs.some((o: any) => {
      const advName = (o.adviser?.name || (o as any).adviserName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const curName = (currentUser.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return advName && curName && (advName === curName || advName.includes(curName) || curName.includes(advName));
    }))
  );

  const resolvedAdviserName = useMemo(() => {
    if (isAdviserMaker) {
      return (currentUser.name || matchedOrg?.adviser?.name || (matchedOrg as any)?.adviserName || '').trim();
    }
    if (matchedOrg?.adviser?.name) return matchedOrg.adviser.name.trim();
    if ((matchedOrg as any)?.adviserName) return (matchedOrg as any).adviserName.trim();
    return '';
  }, [matchedOrg, isAdviserMaker, currentUser.name]);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProposalFormData>(() => ({
    title: '',
    description: '',
    organizers: isOfficerProp && resolvedOrgName ? [resolvedOrgName] : [],
    organizationId: defaultOrgId,
    hostingOrgId: defaultOrgId,
    organizationName: isOfficerProp ? resolvedOrgName : '',
    isOfficerProposal: isOfficerProp,
    creatorRole: isAdviserMaker
      ? 'adviser'
      : (currentUser.role || (isOfficerProp ? 'officer' : 'sas_admin')),
    createdByName: currentUser.name || '',
    createdByEmail: currentUser.email || '',
    fundingSource: isOfficerProp ? 'organization_funds' : 'school_budget',
    proponents: isOfficerProp
      ? [resolvedAdviserName || (isAdviserMaker ? currentUser.name : null) || 'Organization Adviser']
      : [currentUser.name || 'Student Affairs & Services'],
    objectives: [''],
    successIndicators: [''],
    mechanics: [''],
    submissionDate:
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    materials: [],
    targetAudience: {
      academicLevels: ['College', 'SHS'],
      departments: ['All Academic Departments'],
      yearLevels: [],
      courses: [],
      courseCodes: [],
      sections: [],
      allStudents: true,
    },
    estAttendanceCount: 0,
    estAttendanceQualifier: 'participants',
    estimatedAttendance: '',
    marketingPlan: [],
    documentationPlan: [],
    date: '',
    startTime: '08:00',
    endTime: '12:00',
    venueId: '',
    venueName: '',
    sessions: [
      {
        id: 'main-session',
        title: '',
        date: '',
        startTime: '08:00',
        endTime: '12:00',
        venueName: '',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        taskName: '',
        assignedPerson: '',
        completionDate: '',
      },
    ],
    financialProjections: {
      revenues: [],
      expenses: [],
      totalRevenue: 0,
      totalExpenses: 0,
      balance: 0,
    },
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReferenceNo, setSubmittedReferenceNo] = useState<string | null>(null);

  // Maker Signature State (Adviser / Submitter only — student officers never sign APs)
  const [makerSignatureUrl, setMakerSignatureUrl] = useState<string>(() => {
    if (isOfficerOnly) return '';
    return getFastCachedSignature(currentUser);
  });
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);

  useEffect(() => {
    if (isOfficerOnly) {
      setMakerSignatureUrl('');
      return;
    }

    let isCancelled = false;
    const fastSig = getFastCachedSignature(currentUser);
    if (fastSig) {
      setMakerSignatureUrl(fastSig);
    }

    resolveUserSignature({
      uid: currentUser?.uid,
      email: currentUser?.email,
      role: currentUser?.role,
      profile: currentUser,
    }).then((sig) => {
      if (!isCancelled) {
        setMakerSignatureUrl(sig || fastSig || '');
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isOfficerOnly, currentUser?.uid, currentUser?.email, currentUser?.role, currentUser?.signatureUrl]);

  // Keep formData's maker signature and Prepared By identity synchronized with the official Adviser / Maker
  useEffect(() => {
    const officialPrepareName = isOfficerProp
      ? (resolvedAdviserName || (isAdviserMaker ? currentUser.name : '') || 'Organization Adviser')
      : (currentUser.name || 'Student Affairs & Services');
    const officialRoleTitle = currentUser.role === 'sas_admin' ? 'SAS Administrator' : 'Organization Adviser';
    const effectiveSig = isOfficerOnly ? '' : makerSignatureUrl;

    setFormData((prev) => {
      if (
        prev.submittedBySignatureUrl === effectiveSig &&
        prev.preparedBy?.signatureUrl === effectiveSig &&
        prev.preparedBy?.name === officialPrepareName
      ) {
        return prev;
      }
      return {
        ...prev,
        submittedBySignatureUrl: effectiveSig,
        preparedBy: {
          ...prev.preparedBy,
          name: officialPrepareName,
          roleTitle: officialRoleTitle,
          signatureUrl: effectiveSig,
          signedAt: effectiveSig ? (prev.preparedBy?.signedAt || new Date().toISOString()) : undefined,
        },
      };
    });
  }, [makerSignatureUrl, isOfficerOnly, isOfficerProp, isAdviserMaker, resolvedAdviserName, currentUser.name, currentUser.role]);

  // Sync initial data or set default reference number
  useEffect(() => {
    const isOfficer =
      currentUser.role === 'officer' ||
      currentUser.role === 'student_officer' ||
      Boolean(currentUser.organizationId && !['sas', 'sas_admin', 'sao', 'sao_admin', 'admin'].includes(currentUser.organizationId.toLowerCase()));
    const sasCfg = getCachedSasSignatoryConfig();

    // For Student Org proposals, Stage 1 is mandatory SAS Review Gatekeeper (Ma'am Riselle)
    const defaultChain: ProposalApprovalStep[] = isOfficer
      ? [
          {
            id: 'step_sas_gatekeeper',
            step: 1,
            stageIndex: 1,
            stageName: 'Stage 1 Signer',
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
        const SAS_ORGS = ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'sao_office', 'institutional'];
        const rawInitHostingOrg = String(
          (initialData as any).hostingOrgId ||
          initialData.organizationId ||
          ''
        ).trim();
        const hasOrgInInitial = Boolean(rawInitHostingOrg && !SAS_ORGS.includes(rawInitHostingOrg.toLowerCase()));

        const isSasProposal = Boolean(
          (initialData.referenceNo && initialData.referenceNo.includes('-SAS-')) ||
          initialData.creatorRole === 'sas_admin' ||
          initialData.creatorRole === 'admin' ||
          currentUser.role === 'sas_admin' ||
          currentUser.role === 'admin' ||
          (rawInitHostingOrg && SAS_ORGS.includes(rawInitHostingOrg.toLowerCase())) ||
          (initialData as any).isOfficerProposal === false
        );

        const isOfficerInitial = !isSasProposal && (
          (initialData as any).isOfficerProposal !== undefined
            ? Boolean((initialData as any).isOfficerProposal)
            : hasOrgInInitial || isOfficerProp || initialData.creatorRole === 'officer' || initialData.creatorRole === 'student_officer'
        );

        setFormData((prev) => ({
          ...prev,
          ...initialData,
          createdByName: initialData.createdByName || currentUser.name,
          createdByEmail: initialData.createdByEmail || currentUser.email,
          creatorRole: initialData.creatorRole || (isOfficerInitial ? 'officer' : currentUser.role),
          isOfficerProposal: isOfficerInitial,
          fundingSource: isOfficerInitial
            ? (initialData.fundingSource || 'organization_funds')
            : (initialData.fundingSource === 'zero_budget' ? 'zero_budget' : 'school_budget'),
          organizationId: isSasProposal ? 'sas' : (initialData.organizationId || (isOfficerInitial ? (initialData as any).hostingOrgId : currentUser.organizationId)),
          hostingOrgId: isSasProposal ? 'sas' : ((initialData as any).hostingOrgId || initialData.organizationId || currentUser.organizationId),
          organizationName: isSasProposal ? '' : (initialData.organizationName || (isOfficerInitial ? resolvedOrgName : '')),
          organizers: (() => {
            const raw = initialData.organizers && initialData.organizers.length > 0 ? initialData.organizers : [];
            if (isOfficerInitial) {
              const studentOnly = raw.filter((o) => typeof o === 'string' && stripSasPhrases(o).length > 0);
              if (studentOnly.length > 0) return studentOnly;
              return [resolvedOrgName];
            }
            return raw;
          })(),
          proponents: (() => {
            const raw = initialData.proponents && initialData.proponents.length > 0 ? initialData.proponents : [];
            if (isOfficerInitial) {
              const adviser = resolvedAdviserName || (isAdviserMaker ? currentUser.name : '') || 'Organization Adviser';
              const drafter = (initialData.createdByName || (!isAdviserMaker ? currentUser.name : '') || '').trim();
              const cleanWithoutDrafter = raw.filter((p) => p && p.trim() !== drafter);
              if (cleanWithoutDrafter.length === 0) return [adviser];
              if (cleanWithoutDrafter[0] !== adviser && resolvedAdviserName) {
                return [adviser, ...cleanWithoutDrafter.filter((p) => p !== adviser)];
              }
              return cleanWithoutDrafter;
            }
            return raw.length > 0 ? raw : [currentUser.name || 'Student Affairs & Services'];
          })(),
          submittedBySignatureUrl: isOfficerOnly ? '' : makerSignatureUrl,
          preparedBy: {
            name: isOfficerInitial
              ? (resolvedAdviserName || (isAdviserMaker ? currentUser.name : '') || 'Organization Adviser')
              : (initialData.preparedBy?.name || currentUser.name || 'Student Affairs & Services'),
            roleTitle: isSasProposal ? 'SAS Administrator' : 'Organization Adviser',
            signatureUrl: isOfficerOnly ? '' : makerSignatureUrl,
            signedAt: !isOfficerOnly && makerSignatureUrl ? (initialData.preparedBy?.signedAt || new Date().toISOString()) : undefined,
          },
          approvalChain:
            initialData.approvalChain && initialData.approvalChain.length > 0
              ? initialData.approvalChain
              : defaultChain,
        }));
      } else {
        const refPrefix = isOfficer ? (resolvedOrgName.slice(0, 4) || 'ORG') : 'SAS';
        generateProposalReferenceNumber(refPrefix).then((ref) => {
          setFormData((prev) => ({
            ...prev,
            referenceNo: ref,
            createdByName: currentUser.name,
            createdByEmail: currentUser.email,
            creatorRole: isAdviserMaker ? 'adviser' : currentUser.role,
            isOfficerProposal: isOfficer,
            fundingSource: isOfficer ? 'organization_funds' : 'school_budget',
            organizationId: currentUser.organizationId || (isOfficer ? 'student_org' : 'sas'),
            hostingOrgId: currentUser.organizationId || (isOfficer ? 'student_org' : 'sas'),
            organizationName: isOfficer ? resolvedOrgName : '',
            organizers: isOfficer && resolvedOrgName ? [resolvedOrgName] : [],
            proponents: isOfficer
              ? [resolvedAdviserName || (isAdviserMaker ? currentUser.name : null) || 'Organization Adviser']
              : [currentUser.name || 'Student Affairs & Services'],
            approvalChain: defaultChain,
          }));
        });
      }
  }, [initialData, currentUser.name, currentUser.email, currentUser.role, currentUser.organizationId, currentUser.organizationName, resolvedOrgName, resolvedAdviserName]);

  // Auto-populate organization name in organizers if creating as an organization
  useEffect(() => {
    if (isOfficerProp && resolvedOrgName && resolvedOrgName !== 'Student Organization') {
      setFormData((prev) => {
        const currentList = prev.organizers || [];
        const hasOrg = currentList.includes(resolvedOrgName);
        const studentOnly = currentList.filter((o) => typeof o === 'string' && stripSasPhrases(o).length > 0);
        if (!hasOrg || studentOnly.length === 0 || studentOnly.includes('Student Organization')) {
          const coOrganizers = studentOnly.filter((o) => o !== resolvedOrgName && o !== 'Student Organization');
          return {
            ...prev,
            organizationName: resolvedOrgName,
            organizers: [resolvedOrgName, ...coOrganizers],
          };
        }
        return prev;
      });
    }
  }, [isOfficerProp, resolvedOrgName]);

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

  // Resolve returned step from approval chain (if any)
  const returnedStep = useMemo(() => {
    const chain = formData.approvalChain || initialData?.approvalChain || [];
    return chain.find(
      (s) => s.status === 'returned' || s.status === 'returned_for_revision' || (s.remarks && (s.status as any) !== 'approved')
    );
  }, [formData.approvalChain, initialData?.approvalChain]);

  // Resolve return remarks from adviserRemarks, step remarks, or proposal history
  const returnRemarks = useMemo(() => {
    return (
      (formData as any).adviserRemarks ||
      (initialData as any)?.adviserRemarks ||
      returnedStep?.remarks ||
      ((initialData as any)?.versionHistory?.[0] as any)?.returnRemarks ||
      ((initialData as any)?.versionHistory?.[0] as any)?.adviserRemarks ||
      ((initialData as any)?.proposalHistory?.slice().reverse().find((h: any) => h.action === 'returned_for_revision')?.remarks) ||
      null
    );
  }, [formData, initialData, returnedStep]);

  // Resolve returned reviewer information
  const returnedReviewer = useMemo(() => {
    return {
      name:
        (formData as any).returnedByName ||
        (initialData as any)?.returnedByName ||
        returnedStep?.signatoryName ||
        ((initialData as any)?.versionHistory?.[0] as any)?.returnedByName ||
        ((initialData as any)?.versionHistory?.[0] as any)?.returnedBy ||
        'Institutional Signatory',
      roleTitle:
        (formData as any).returnedByRoleTitle ||
        (initialData as any)?.returnedByRoleTitle ||
        returnedStep?.roleTitle ||
        ((initialData as any)?.versionHistory?.[0] as any)?.returnedByRoleTitle ||
        'Signatory Reviewer',
      email:
        (formData as any).returnedByEmail ||
        (initialData as any)?.returnedByEmail ||
        returnedStep?.signatoryEmail ||
        '',
    };
  }, [formData, initialData, returnedStep]);

  // Resolve return timestamp
  const returnedAt = useMemo(() => {
    return (
      (formData as any).returnedAt ||
      (initialData as any)?.returnedAt ||
      returnedStep?.signedAt ||
      ((initialData as any)?.versionHistory?.[0] as any)?.returnedAt ||
      (initialData as any)?.updatedAt ||
      new Date().toISOString()
    );
  }, [formData, initialData, returnedStep]);

  // Revision Tracking & Per-Step Enforcement
  const isReturnedProposal = useMemo(() => {
    const st = (
      formData.status ||
      (formData as any).proposalStatus ||
      (initialData as any)?.status ||
      (initialData as any)?.proposalStatus ||
      ''
    ).toLowerCase().trim();

    const isReturnedStatus = st === 'returned' || st === 'returned_for_revision';
    const isReturnedFlag = Boolean((formData as any).isReturned || (initialData as any)?.isReturned);
    const hasChainReturn = Boolean(
      (formData.approvalChain || initialData?.approvalChain || []).some(
        (s) => s.status === 'returned' || s.status === 'returned_for_revision'
      )
    );
    const hasAdviserRemarks = Boolean(
      (formData as any).adviserRemarks || (initialData as any)?.adviserRemarks || returnedStep?.remarks
    );
    const hasRemarks = Boolean(
      (formData.stepRevisionRemarks && Object.keys(formData.stepRevisionRemarks).length > 0) ||
      (initialData?.stepRevisionRemarks && Object.keys(initialData.stepRevisionRemarks).length > 0)
    );
    const hasFlags = Boolean(
      (formData.returnFlags && formData.returnFlags.length > 0) ||
      (initialData?.returnFlags && initialData.returnFlags.length > 0)
    );

    return isReturnedStatus || isReturnedFlag || hasChainReturn || hasAdviserRemarks || hasRemarks || hasFlags;
  }, [
    formData.status,
    (formData as any).proposalStatus,
    (formData as any).isReturned,
    (formData as any).adviserRemarks,
    formData.approvalChain,
    formData.stepRevisionRemarks,
    formData.returnFlags,
    initialData,
    returnedStep,
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

  // Identify the immutable submitted/returned baseline (e.g. Version 1 before any draft edits)
  const baselineSnapshot = useMemo(() => {
    return (
      (initialData as any)?.returnedSnapshot ||
      (initialData as any)?.submittedSnapshot ||
      (initialData as any)?.previousSnapshot ||
      (initialData as any)?.versionHistory?.[0]?.dataSnapshot ||
      (initialData as any)?.initialSnapshot ||
      null
    );
  }, [initialData]);

  const baselineData = useMemo(() => {
    return baselineSnapshot || initialData;
  }, [baselineSnapshot, initialData]);

  // Snapshot baseline step data upon mounting or when baselineData updates
  const baselineStepSnapshots = useMemo(() => {
    if (!baselineData) return {};
    const snaps: Record<number, string> = {};
    for (let s = 1; s <= 7; s++) {
      snaps[s] = JSON.stringify(extractStepData(s, baselineData as any));
    }
    return snaps;
  }, [baselineData]);

  // Check if a flagged step has been modified compared to the submitted baseline (Version 1)
  const isStepModified = (stepNum: number): boolean => {
    if (!isReturnedProposal) return true;
    if (!isStepFlagged(stepNum)) return true;
    const baselineJson = baselineStepSnapshots[stepNum];
    if (!baselineJson) return false;
    const currentJson = JSON.stringify(extractStepData(stepNum, formData));
    return currentJson !== baselineJson;
  };

  // Pure validation checker: returns error map for a given step without mutating component error state
  const getStepValidationErrors = (stepNumber: number, data: ProposalFormData): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (stepNumber === 1) {
      if (!data.title?.trim()) {
        errs.title = 'Activity Title is required.';
      }
      if (!data.description?.trim()) {
        errs.description = 'Activity Description / Rationale is required.';
      }
      const orgs = Array.isArray(data.organizers)
        ? data.organizers.filter((o) => typeof o === 'string' && o.trim())
        : [];
      if (orgs.length === 0) {
        errs.organizers = 'At least one organizing body is required.';
      }
    }

    if (stepNumber === 2) {
      const objs = Array.isArray(data.objectives)
        ? data.objectives.filter((o) => typeof o === 'string' && o.trim())
        : [];
      if (objs.length === 0) {
        errs.objectives = 'At least one objective is required.';
      }
      const indicators = Array.isArray(data.successIndicators)
        ? data.successIndicators.filter((s) => typeof s === 'string' && s.trim())
        : [];
      if (indicators.length === 0) {
        errs.successIndicators = 'At least one success indicator is required.';
      }
    }

    if (stepNumber === 3) {
      if (!data.targetMarket?.trim() && !data.targetAudience?.targetMarketSummary?.trim()) {
        errs.targetMarket = 'Target market description is required.';
      }
      if (!data.estimatedAttendance?.toString().trim() && !data.estAttendanceCount) {
        errs.estimatedAttendance = 'Estimated attendance is required.';
      }
    }

    if (stepNumber === 4) {
      const selectedDate = data.date || data.sessions?.[0]?.date || '';
      if (!selectedDate) {
        errs.date = 'Target Implementation Date is required.';
        errs.sessions = 'Please specify the target implementation date.';
      } else {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const standardMinDate = format(addDays(new Date(), 15), 'yyyy-MM-dd');

        if (selectedDate < todayStr) {
          errs.date = 'Implementation date cannot be in the past.';
          errs.sessions = 'Implementation date cannot be in the past.';
        } else if (!data.isUrgent && selectedDate < standardMinDate) {
          errs.date = `Standard policy requires at least 15 calendar days advance notice (${formatDateLong(standardMinDate)} or later). Enable the Urgent Proposal toggle if filing expedited.`;
          errs.sessions = `Standard policy requires at least 15 days advance notice (${formatDateLong(standardMinDate)} or later).`;
        }
      }

      if (data.isUrgent && !data.urgentJustification?.trim()) {
        errs.urgentJustification = 'Please provide an administrative justification for this urgent proposal.';
      }

      const hasVenue = Boolean(data.venueName || data.venueId || data.sessions?.[0]?.venueName);
      if (!hasVenue) {
        errs.sessions = errs.sessions ? `${errs.sessions} Please also specify an activity venue.` : 'Please specify an activity venue.';
      }
    }

    if (stepNumber === 5) {
      const eventDate = data.date || data.sessions?.[0]?.date || '';
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const standardMinDate = format(addDays(new Date(), 15), 'yyyy-MM-dd');
      const isUrgent = Boolean(data.isUrgent);

      let maxTaskDate = '';
      if (eventDate) {
        const parsedEvent = parseISO(eventDate);
        if (isValid(parsedEvent)) {
          maxTaskDate =
            (isUrgent && eventDate === todayStr) || (!isUrgent && eventDate === standardMinDate)
              ? eventDate
              : format(subDays(parsedEvent, 1), 'yyyy-MM-dd');
        }
      }

      if (!data.tasks || data.tasks.length === 0) {
        errs.tasks = 'At least one task milestone is required.';
      } else {
        for (let i = 0; i < data.tasks.length; i++) {
          const t = data.tasks[i];
          if (!t.taskName?.trim()) {
            errs.tasks = `Task #${i + 1} is missing a description / task name.`;
            break;
          }
          if (!t.assignedPerson?.trim()) {
            errs.tasks = `Task #${i + 1} (${t.taskName}) is missing an assigned person or committee.`;
            break;
          }
          if (!t.completionDate) {
            errs.tasks = `Task #${i + 1} (${t.taskName}) is missing a completion date.`;
            break;
          }
          if (t.completionDate < todayStr) {
            errs.tasks = `Task #${i + 1} (${t.taskName}) completion date cannot be in the past.`;
            break;
          }
          if (!isUrgent && t.completionDate < standardMinDate) {
            errs.tasks = `Task #${i + 1} (${t.taskName}) violates the 15-calendar-day rule (earliest allowed: ${formatDateLong(standardMinDate)}). Enable Urgent Mode in Step 4 if filing expedited.`;
            break;
          }
          if (maxTaskDate && t.completionDate > maxTaskDate) {
            errs.tasks = `Task #${i + 1} (${t.taskName}) completion date cannot exceed ${maxTaskDate}. All preparatory tasks must be completed prior to the implementation date (${eventDate}).`;
            break;
          }
          if (i > 0 && data.tasks[i - 1]?.completionDate && t.completionDate < data.tasks[i - 1].completionDate) {
            errs.tasks = `Task #${i + 1} (${t.taskName}) must be scheduled chronologically on or after Task #${i} (${data.tasks[i - 1].completionDate}).`;
            break;
          }
        }
      }
    }

    if (stepNumber === 6) {
      if (!data.fundingSource) {
        errs.fundingSource = 'Please select a funding source.';
      }
      if (data.fundingSource === 'organization_funds') {
        const treasuryBalance = Number(data.organizationLedgerBalanceAtSubmission) || 0;
        const totalExpenses = Number(data.financialProjections?.totalExpenses) || 0;
        if (treasuryBalance <= 0) {
          errs.fundingSource = 'Organization treasury has no available funds (₱0.00). You cannot allocate budget from an empty ledger.';
        } else if (totalExpenses > treasuryBalance) {
          errs.fundingSource = `Total asking budget (${formatPHP(totalExpenses)}) exceeds available organization treasury (${formatPHP(treasuryBalance)}).`;
        }
      }
      if (data.fundingSource !== 'zero_budget' && data.financialProjections) {
        const expenses = data.financialProjections.expenses || (data.financialProjections as any).expenditures || [];
        const revenues = data.financialProjections.revenues || [];
        for (let i = 0; i < expenses.length; i++) {
          const exp = expenses[i];
          if ((exp.totalAmount > 0 || exp.thisYearProposed > 0) && !exp.description?.trim()) {
            errs.expenditures = `Expenditure #${i + 1} has an amount but is missing an item description.`;
            break;
          }
        }
        for (let i = 0; i < revenues.length; i++) {
          const rev = revenues[i];
          if ((rev.totalAmount > 0 || rev.thisYearProposed > 0) && !rev.description?.trim()) {
            errs.revenues = `Revenue #${i + 1} has an amount but is missing an item description.`;
            break;
          }
        }
      }
    }

    if (stepNumber === 7) {
      if (data.isUrgent && !data.urgentJustification?.trim()) {
        errs.urgentJustification = 'An urgent submission justification is required.';
      }
    }

    return errs;
  };

  // Check if a step has all required information filled out and is valid
  const isStepComplete = (stepNumber: number, data: ProposalFormData): boolean => {
    const errs = getStepValidationErrors(stepNumber, data);
    return Object.keys(errs).length === 0;
  };

  // Check if all steps strictly prior to stepNumber are valid
  const arePriorStepsComplete = (stepNumber: number, data: ProposalFormData): boolean => {
    for (let s = 1; s < stepNumber; s++) {
      if (!isStepComplete(s, data)) return false;
    }
    return true;
  };

  // Step validation with error state mutation (for user interactions)
  const validateStep = (stepNumber: number): boolean => {
    const newErrors = getStepValidationErrors(stepNumber, formData);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Track max step reached to allow freely revisiting completed / unlocked steps
  const [maxStepReached, setMaxStepReached] = useState(1);

  useEffect(() => {
    if (initialData) {
      let highest = 1;
      for (let s = 1; s <= 7; s++) {
        if (isStepComplete(s, { ...formData, ...initialData })) {
          highest = Math.min(s + 1, 7);
        } else {
          break;
        }
      }
      setMaxStepReached((prev) => Math.max(prev, highest));
    }
  }, [initialData]);

  // Unified smart step navigation handler
  const handleStepClick = (targetStep: number) => {
    if (targetStep === currentStep) return;

    // 1. Moving backward to any previous step is ALWAYS allowed
    if (targetStep < currentStep) {
      setErrors({});
      setCurrentStep(targetStep);
      return;
    }

    // 2. In returned proposal revision mode, allow navigating freely between steps
    if (isReturnedProposal) {
      setErrors({});
      setCurrentStep(targetStep);
      setMaxStepReached((prev) => Math.max(prev, targetStep));
      return;
    }

    // 3. Moving forward: verify that each intermediate prerequisite step is complete
    for (let s = 1; s < targetStep; s++) {
      const stepErrors = getStepValidationErrors(s, formData);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        setCurrentStep(s);
        const firstMsg = Object.values(stepErrors)[0];
        toast.error(`Please complete Step ${s} (${STEPS[s - 1].label}) first: ${firstMsg}`);
        return;
      }
    }

    // All prerequisite steps up to targetStep are okay! Clear errors and jump directly
    setErrors({});
    setCurrentStep(targetStep);
    setMaxStepReached((prev) => Math.max(prev, targetStep));
  };

  const handleNext = () => {
    if (!validateStep(currentStep)) {
      const errList = Object.values(getStepValidationErrors(currentStep, formData));
      const firstMsg = errList[0] || 'Please complete all required fields before proceeding.';
      toast.error(firstMsg);
      return;
    }

    const nextStep = Math.min(currentStep + 1, 7);
    setErrors({});
    setCurrentStep(nextStep);
    setMaxStepReached((prev) => Math.max(prev, nextStep));
  };

  const handlePrevious = () => {
    setErrors({});
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
      // Ensure the returned baseline snapshot is preserved across draft iterations without nested recursive bloating
      const rawReturnedSnapshot =
        (initialData as any)?.returnedSnapshot ||
        baselineSnapshot ||
        (formData as any)?.returnedSnapshot ||
        (isReturnedProposal ? initialData : null);
      const effectiveReturnedSnapshot = rawReturnedSnapshot
        ? sanitizeCleanDocumentSnapshot(rawReturnedSnapshot)
        : null;

      const isOfficerForm = Boolean(isOfficerProp || formData.isOfficerProposal);
      const drafterName = (formData.createdByName || currentUser.name || '').trim();
      const sanitizedDraftOrganizers = isOfficerForm
        ? (formData.organizers || []).filter((o) => typeof o === 'string' && stripSasPhrases(o).length > 0)
        : (formData.organizers || []);
      const finalDraftOrganizers = sanitizedDraftOrganizers.length > 0
        ? sanitizedDraftOrganizers
        : (isOfficerForm ? [formData.organizationName || 'Student Organization'] : []);

      const sanitizedDraftProponents = isOfficerForm
        ? (formData.proponents || []).filter((p) => p && p.trim() !== (formData.createdByName || (!isAdviserMaker ? currentUser.name : '') || '').trim())
        : (formData.proponents || []);
      const finalDraftProponents = sanitizedDraftProponents.length > 0
        ? sanitizedDraftProponents
        : (isOfficerForm ? [resolvedAdviserName || (isAdviserMaker ? currentUser.name : '') || 'Organization Adviser'] : [currentUser.name || 'Student Affairs & Services']);

      const isOrgFunds = formData.fundingSource === 'organization_funds';
      const effectiveDraftChain = isOrgFunds
        ? [
            {
              id: 'step_sas_approval',
              step: 1,
              stageIndex: 1,
              stageName: 'SAS Approval',
              role: 'sas_head' as const,
              roleTitle: sasCfg.roleTitle || 'Student Affairs & Services Head',
              actionType: 'approve' as const,
              signatoryUid: sasCfg.employeeId || 'sas_admin',
              signatoryName: sasCfg.name || 'Riselle Mae B. Lucanas',
              signatoryEmail: sasCfg.email || 'sao@ormoc.sti.edu.ph',
              department: sasCfg.department || 'Student Affairs & Services',
              status: 'current' as const,
            },
          ]
        : formData.approvalChain;

      const result = await saveProposalDraft(
        {
          ...formData,
          approvalChain: effectiveDraftChain,
          organizers: finalDraftOrganizers,
          proponents: finalDraftProponents,
          submittedBySignatureUrl: isOfficerOnly ? '' : makerSignatureUrl,
          preparedBy: {
            name: isOfficerForm
              ? (resolvedAdviserName || (isAdviserMaker ? currentUser.name : '') || 'Organization Adviser')
              : (currentUser.name || 'Student Affairs & Services'),
            roleTitle: isOfficerForm ? 'Organization Adviser' : 'SAS Administrator',
            signatureUrl: isOfficerOnly ? '' : makerSignatureUrl,
            signedAt: !isOfficerOnly && makerSignatureUrl ? new Date().toISOString() : undefined,
          },
          status: 'draft',
          ...(effectiveReturnedSnapshot ? { returnedSnapshot: effectiveReturnedSnapshot } : {}),
        },
        currentUser,
        formData.id
      );
      updateFormData({
        id: result.id,
        referenceNo: result.referenceNo,
        ...(effectiveReturnedSnapshot ? { returnedSnapshot: effectiveReturnedSnapshot } : {}),
      });
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
    if (isOfficerOnly) {
      toast.error('Only the Organization Adviser can formally submit activity proposals for signatory review. Officers can Save as Draft.');
      return;
    }

    if (!editPermission.canEdit) {
      toast.error('Permission Denied', {
        description: editPermission.reason || 'Only the proponent organization has permission to edit and revise this proposal.',
      });
      return;
    }

    for (let s = 1; s <= 7; s++) {
      const stepErrors = getStepValidationErrors(s, formData);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        setCurrentStep(s);
        const firstMsg = Object.values(stepErrors)[0];
        toast.error(`Please complete Step ${s} (${STEPS[s - 1].label}): ${firstMsg}`);
        return;
      }
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

    // Strict Verification: The Maker or Organization Adviser MUST have a registered e-signature in Settings
    const effectiveSignature = (
      (makerSignatureUrl && makerSignatureUrl.trim().length > 0 && !makerSignatureUrl.includes('[base64-'))
        ? makerSignatureUrl.trim()
        : (!isOfficerOnly && currentUser?.signatureUrl && currentUser.signatureUrl.trim().length > 0 && !currentUser.signatureUrl.includes('[base64-'))
        ? currentUser.signatureUrl.trim()
        : ''
    );

    if (!effectiveSignature) {
      const signerTitle = isAdviserMaker || isOfficerProp ? 'Organization Adviser' : 'Proposal Maker';
      toast.error('Signature Required: No Registered Signature Found', {
        description: `Please upload or register your ${signerTitle} signature in Settings first before submitting this activity proposal so that it is attached upon export.`,
      });
      return;
    }

    // Open confirmation dialog before submission ONLY when all step validations and signature checks pass
    setIsSubmitConfirmOpen(true);
  };

  const executeSubmission = async () => {
    setIsSubmitting(true);
    try {
      const isOfficerForm = Boolean(isOfficerProp || formData.isOfficerProposal);
      const drafterName = (formData.createdByName || currentUser.name || '').trim();
      const sanitizedSubmitOrganizers = isOfficerForm
        ? (formData.organizers || []).filter((o) => typeof o === 'string' && stripSasPhrases(o).length > 0)
        : (formData.organizers || []);
      const finalSubmitOrganizers = sanitizedSubmitOrganizers.length > 0
        ? sanitizedSubmitOrganizers
        : (isOfficerForm ? [formData.organizationName || 'Student Organization'] : []);

      const sanitizedSubmitProponents = isOfficerForm
        ? (formData.proponents || []).filter((p) => p && p.trim() !== (formData.createdByName || (!isAdviserMaker ? currentUser.name : '') || '').trim())
        : (formData.proponents || []);
      const finalSubmitProponents = sanitizedSubmitProponents.length > 0
        ? sanitizedSubmitProponents
        : (isOfficerForm ? [resolvedAdviserName || (isAdviserMaker ? currentUser.name : '') || 'Organization Adviser'] : [currentUser.name || 'Student Affairs & Services']);

      const isOrgFunds = formData.fundingSource === 'organization_funds';
      const effectiveApprovalChain = isOrgFunds
        ? [
            {
              id: 'step_sas_approval',
              step: 1,
              stageIndex: 1,
              stageName: 'SAS Approval',
              role: 'sas_head' as const,
              roleTitle: sasCfg.roleTitle || 'Student Affairs & Services Head',
              actionType: 'approve' as const,
              signatoryUid: sasCfg.employeeId || 'sas_admin',
              signatoryName: sasCfg.name || 'Riselle Mae B. Lucanas',
              signatoryEmail: sasCfg.email || 'sao@ormoc.sti.edu.ph',
              department: sasCfg.department || 'Student Affairs & Services',
              status: 'current' as const,
            },
          ]
        : formData.approvalChain;

      const effectiveSignature = makerSignatureUrl || currentUser?.signatureUrl || formData.submittedBySignatureUrl || '';

      const result = await submitProposalForReview(
        {
          ...formData,
          approvalChain: effectiveApprovalChain,
          organizers: finalSubmitOrganizers,
          proponents: finalSubmitProponents,
          submittedBySignatureUrl: effectiveSignature,
        },
        {
          ...currentUser,
          signatureUrl: effectiveSignature,
        },
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

  const canSubmitProposal = useMemo(() => {
    if (formData.isUrgent && !(formData.urgentJustification || '').trim()) {
      return false;
    }
    if (!formData.title?.trim() || !formData.description?.trim()) {
      return false;
    }
    if (formData.fundingSource !== 'organization_funds') {
      const chain = formData.approvalChain || [];
      if (chain.length === 0) {
        return false;
      }
      const hasApprover = chain.some((s) => s.actionType === 'approve' || s.role === 'school_president');
      if (!hasApprover) {
        return false;
      }
    }
    if (isReturnedProposal && !(formData.resubmissionNote || '').trim()) {
      return false;
    }
    return true;
  }, [formData.isUrgent, formData.urgentJustification, formData.title, formData.description, formData.approvalChain, isReturnedProposal, formData.resubmissionNote]);

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
                const stepValid = isStepComplete(s.id, formData);
                const priorsValid = arePriorStepsComplete(s.id, formData);
                const reached = s.id < currentStep || (s.id <= maxStepReached && maxStepReached > 1) || isReturnedProposal;
                // A step shows as OK / completed only if:
                // 1. It is valid
                // 2. All previous prerequisite steps are valid
                // 3. It was actually reached (user has progressed to or past this step)
                // 4. Step 7 is the final review & submit step and does not show as a finished checkmark beforehand
                const isOk = stepValid && priorsValid && reached && s.id < 7;

                const isAccessible =
                  s.id <= currentStep ||
                  isReturnedProposal ||
                  (s.id <= maxStepReached && priorsValid) ||
                  (s.id === currentStep + 1 && priorsValid && isStepComplete(currentStep, formData));

                return (
                  <div key={s.id} className="flex items-center flex-1 last:flex-none">
                    <button
                      type="button"
                      onClick={() => handleStepClick(s.id)}
                      className={`flex items-center gap-2 text-left transition-all ${
                        isActive
                          ? 'opacity-100 font-bold'
                          : isAccessible
                          ? 'opacity-85 hover:opacity-100 cursor-pointer'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                      title={
                        isActive
                          ? `Current Step: ${s.label}`
                          : isOk
                          ? `Completed: ${s.label} (Click to jump)`
                          : isAccessible
                          ? `Navigate to ${s.label}`
                          : `Complete previous steps to unlock ${s.label}`
                      }
                    >
                      <div
                        className={`w-7 h-7 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/30'
                            : isOk
                            ? 'bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700'
                            : isAccessible
                            ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      >
                        {isOk && !isActive ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs ${
                              isActive
                                ? 'text-blue-900 font-bold'
                                : isOk
                                ? 'text-emerald-800 font-semibold'
                                : 'text-slate-700 font-medium'
                            }`}
                          >
                            {s.label}
                          </span>
                          {isOk && !isActive && (
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 leading-none">
                              OK
                            </span>
                          )}
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
                        className={`h-0.5 flex-1 mx-3 rounded-full transition-colors ${
                          isOk ? 'bg-emerald-500' : 'bg-slate-200'
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
          {/* Universal Revision Feedback Banner */}
          {isReturnedProposal && !submittedReferenceNo && (
            <div className="mb-6 space-y-3">
              <RevisionFeedbackBanner
                returnedBy={returnedReviewer}
                returnedAt={returnedAt}
                returnRemarks={returnRemarks}
                returnFlags={returnFlagsList}
                stepRevisionRemarks={stepRemarksDict}
                showActionButtons={false}
                versionHistory={(initialData as any)?.versionHistory}
                revisionHistory={(initialData as any)?.revisionHistory}
                versionLabel={
                  (formData as any).versionLabel ||
                  (initialData as any)?.versionLabel ||
                  ((formData as any).version ? `v${(formData as any).version}.0` : undefined)
                }
                documentTitle={formData.title || initialData?.title || 'Activity Proposal'}
                documentType="AP"
                currentDocument={formData}
              />

              {/* Per-step revision buttons (only shown if specific steps were flagged) */}
              {STEPS.some((s) => isStepFlagged(s.id)) && (
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                        <RotateCcw className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-950 flex items-center gap-2">
                          Flagged Step Revisions Enforced
                          <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                            Required Modifications
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
                  <p className="text-[11px] text-amber-800/80 mt-1 italic">
                    Review and update this step according to the instructions. You will summarize the changes made on Step 7 before resubmitting.
                  </p>
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
                  currentUser={currentUser}
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
                  isOfficerOnly={isOfficerOnly}
                  errors={errors}
                  makerSignatureUrl={isOfficerOnly ? '' : makerSignatureUrl}
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
            ) : isOfficerOnly ? (
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Drafting Mode (Adviser Submits)</span>
                </span>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft || isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-500/20 hover:shadow-blue-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4 text-white" />
                  <span>{isSavingDraft ? 'Saving Draft...' : 'Save as Draft'}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubmitProposal}
                disabled={isSubmitting || !canSubmitProposal}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all ${
                  canSubmitProposal && !isSubmitting
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 hover:shadow-blue-500/30 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
                title={
                  !canSubmitProposal
                    ? formData.isUrgent && !(formData.urgentJustification || '').trim()
                      ? 'Please return to Step 4 to provide an urgent submission justification.'
                      : 'Please complete all required fields before submitting.'
                    : undefined
                }
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? isReturnedProposal
                      ? 'Resubmitting...'
                      : 'Submitting...'
                    : isReturnedProposal
                    ? 'Resubmit Revised Proposal'
                    : 'Submit Proposal'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Proposal Submission Confirmation Modal */}
      {isSubmitConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 bg-gradient-to-r from-[#001A4D] via-[#002B7F] to-[#0E4EBD] text-white flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl text-[#FFD41C] flex-shrink-0">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base">
                  {isReturnedProposal ? 'Confirm Proposal Resubmission' : 'Confirm Proposal Submission'}
                </h3>
                <p className="text-xs text-blue-200 mt-0.5 truncate max-w-sm">
                  {formData.title || 'Official STI Activity Proposal'}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                Are you sure you want to formally submit this activity proposal for review?
              </p>

              {/* Routing Notice */}
              <div className="p-4 rounded-2xl border text-xs leading-relaxed space-y-2 bg-slate-50 border-slate-200 text-slate-700">
                <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#0E4EBD]" />
                  What happens upon submission:
                </div>
                {formData.fundingSource === 'organization_funds' ? (
                  <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-600">
                    <li>This activity is funded from <strong>Organization Internal Funds</strong>.</li>
                    <li>The proposal routes directly to <strong>Student Affairs & Services (SAS)</strong> for official review, approval, and digital signature.</li>
                    <li>Your registered electronic signature is affixed to Form AP-01.</li>
                  </ul>
                ) : (
                  <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-600">
                    <li>This activity is funded from <strong>School Budget</strong>.</li>
                    <li>The proposal routes first to <strong>Student Affairs & Services (SAS)</strong> for preliminary clearance.</li>
                    <li>Upon clearance, it will advance to your designated <strong>institutional signatories</strong>.</li>
                    <li>Your registered electronic signature is affixed to Form AP-01.</li>
                  </ul>
                )}
              </div>

              {formData.isUrgent && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>This proposal has an urgent justification exemption under the 15-day policy.</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSubmitConfirmOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Back to Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSubmitConfirmOpen(false);
                  executeSubmission();
                }}
                disabled={isSubmitting}
                className="px-6 py-2.5 text-xs font-bold rounded-xl text-white bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:from-[#16A34A] hover:to-[#22C55E] shadow-sm flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>Submitting...</>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm & Submit Proposal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
